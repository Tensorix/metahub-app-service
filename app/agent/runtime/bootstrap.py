"""Bootstrap context and mounted-file management for DeepAgentService."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres import AsyncPostgresStore

logger = logging.getLogger(__name__)


class BootstrapContextProvider:
    """Build and persist bootstrap context for first-turn agent prompts."""

    def __init__(
        self,
        agent_config: dict[str, Any],
        checkpointer: Optional[AsyncPostgresSaver] = None,
        store: Optional[AsyncPostgresStore] = None,
    ) -> None:
        self.config = agent_config
        self.checkpointer = checkpointer
        self.store = store
        self._skills_source_paths: list[str] = []
        self._mounted_files: dict[str, dict] = {}
        self._mounted_files_ready = False

    @property
    def skills_source_paths(self) -> list[str]:
        self._ensure_mounted_files()
        return list(self._skills_source_paths)

    @property
    def mounted_files(self) -> dict[str, dict]:
        self._ensure_mounted_files()
        return dict(self._mounted_files)

    def _ensure_mounted_files(self) -> None:
        if self._mounted_files_ready:
            return
        self._skills_source_paths, self._mounted_files = self._build_mounted_files()
        self._mounted_files_ready = True

    def _build_skill_files(self) -> tuple[list[str], dict[str, dict]]:
        skills_data = self.config.get("skills") or []
        if not skills_data:
            return [], {}

        from deepagents.backends.utils import create_file_data

        files: dict[str, dict] = {}
        for skill in skills_data:
            name = skill.get("name") if isinstance(skill, dict) else getattr(skill, "name", None)
            content = skill.get("content") if isinstance(skill, dict) else getattr(skill, "content", None)
            if not name or not content:
                logger.warning("Skipping invalid skill entry: %s", skill)
                continue
            files[f"/skills/{name}/SKILL.md"] = create_file_data(content)

        if files:
            logger.info("Prepared %s skill(s): %s", len(files), list(files.keys()))

        return (["/skills/"] if files else []), files

    def _build_agents_memory_file(self) -> dict[str, dict]:
        memory_data = self.config.get("memory") or []
        if not memory_data:
            return {}

        memory_content = ""
        for item in memory_data:
            name = item.get("name") if isinstance(item, dict) else getattr(item, "name", None)
            content = item.get("content") if isinstance(item, dict) else getattr(item, "content", None)
            normalized = (name or "").strip().lower().removesuffix(".md")
            if normalized == "agents":
                memory_content = content or ""
                break
            if not memory_content and content:
                memory_content = content

        if not memory_content:
            return {}

        from deepagents.backends.utils import create_file_data

        return {"/AGENTS.md": create_file_data(memory_content)}

    def _build_mounted_files(self) -> tuple[list[str], dict[str, dict]]:
        skills_paths, skill_files = self._build_skill_files()
        mounted: dict[str, dict] = {}
        mounted.update(self._build_agents_memory_file())
        mounted.update(skill_files)
        return skills_paths, mounted

    @staticmethod
    def _extract_file_content(file_data: dict) -> str:
        raw = file_data.get("content")
        if not raw:
            return ""
        if isinstance(raw, list):
            return "\n".join(str(item) for item in raw)
        return str(raw)

    @staticmethod
    def _parse_skill_frontmatter(path: str, content: str) -> tuple[str, str]:
        import re

        parts = path.strip("/").split("/")
        try:
            skill_idx = parts.index("skills")
            dir_name = parts[skill_idx + 1] if skill_idx + 1 < len(parts) else path
        except ValueError:
            dir_name = path

        match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
        if not match:
            return dir_name, ""

        try:
            import yaml

            frontmatter = yaml.safe_load(match.group(1))
            if not isinstance(frontmatter, dict):
                return dir_name, ""
            name = str(frontmatter.get("name") or dir_name)
            desc = str(frontmatter.get("description") or "")[:1024]
            return name, desc
        except Exception:
            return dir_name, ""

    async def _get_filesystem_context(
        self,
        thread_id: str,
        session_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        self._ensure_mounted_files()
        all_files: list[tuple[str, dict]] = []

        if self.store:
            try:
                thread_ns = (str(thread_id), "filesystem")
                items = await self.store.asearch(thread_ns, limit=1000)
                for item in items:
                    all_files.append((item.key, item.value))

                if session_id:
                    session_ns = (str(session_id), "filesystem")
                    items = await self.store.asearch(session_ns, limit=1000)
                    for item in items:
                        if item.key == "/.workspace":
                            continue
                        ws_path = "/workspace" + item.key if item.key.startswith("/") else f"/workspace/{item.key}"
                        all_files.append((ws_path, item.value))
            except Exception as exc:
                logger.warning(
                    "Failed to read store for bootstrap context: %s, falling back to mounted files",
                    exc,
                )
                all_files = list(self._mounted_files.items())
        else:
            all_files = list(self._mounted_files.items())

        instruction_parts: list[str] = []
        skills: list[dict[str, str]] = []
        other_files: list[str] = []

        for path, file_data in sorted(all_files, key=lambda item: item[0]):
            content = self._extract_file_content(file_data)
            basename = path.rsplit("/", 1)[-1].lower()

            if basename in ("agents.md", "readme.md", "instructions.md"):
                instruction_parts.append(f"<!-- source: {path} -->\n{content}")
            elif "/skills/" in path and basename == "skill.md":
                skill_name, description = self._parse_skill_frontmatter(path, content)
                skills.append({"name": skill_name, "path": path, "description": description})
            elif content and not (isinstance(file_data, dict) and file_data.get("__type") == "directory"):
                other_files.append(path)

        return {
            "instructions": "\n\n".join(instruction_parts),
            "skills": skills,
            "files": other_files,
        }

    def _build_bootstrap_context(self) -> dict[str, Any]:
        ctx: dict[str, Any] = {}
        if self.config.get("name"):
            ctx["workspace"] = self.config["name"]
        return ctx

    async def build_user_message(
        self,
        raw_message: str,
        *,
        bootstrap: bool = False,
        thread_id: str = "",
        session_id: Optional[UUID] = None,
    ) -> str:
        if not bootstrap:
            return raw_message

        ctx = self._build_bootstrap_context()
        sections: list[str] = []

        env_lines: list[str] = []
        if ctx.get("user_name"):
            env_lines.append(f"User: {ctx['user_name']}")
        if ctx.get("workspace"):
            env_lines.append(f"Workspace: {ctx['workspace']}")
        dt = ctx.get("datetime") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        env_lines.append(f"Date: {dt}")
        sections.append("<environment>\n" + "\n".join(env_lines) + "\n</environment>")

        if ctx.get("user_rules"):
            sections.append(f"<rules>\n{ctx['user_rules']}\n</rules>")

        fs = await self._get_filesystem_context(thread_id, session_id)
        if fs["instructions"]:
            sections.append(f"<agent_instructions>\n{fs['instructions']}\n</agent_instructions>")

        if fs["skills"]:
            skill_lines = []
            for skill in fs["skills"]:
                desc_part = f": {skill['description']}" if skill["description"] else ""
                skill_lines.append(f"- {skill['name']} ({skill['path']}){desc_part}")
            sections.append("<skills>\n" + "\n".join(skill_lines) + "\n</skills>")

        attention_parts = [
            (
                "Before starting any task, carefully follow the instructions in <agent_instructions>."
                if fs["instructions"]
                else None
            ),
            "For complex tasks, use `write_todos` to plan steps before execution.",
            (
                "When a task matches a skill in <skills>, use `read_file` to load its SKILL.md "
                "and follow the workflow."
                if fs["skills"]
                else None
            ),
            (
                "For complex tasks with parallelizable subtasks, delegate to sub-agents using the `task` tool."
                if self.config.get("subagents")
                else None
            ),
        ]
        attention_lines = [part for part in attention_parts if part]
        if attention_lines:
            sections.append("<attention>\n" + "\n".join(attention_lines) + "\n</attention>")

        sections.append(f"<user_query>\n{raw_message}\n</user_query>")
        return "\n\n".join(sections)

    async def needs_bootstrap(self, thread_id: str) -> bool:
        if not self.checkpointer:
            return True
        checkpoint = await self.checkpointer.aget_tuple({"configurable": {"thread_id": thread_id}})
        return checkpoint is None

    async def write_mounted_files_to_store(self, thread_id: str) -> None:
        self._ensure_mounted_files()
        if not self.store or not self._mounted_files:
            return

        namespace = (str(thread_id), "filesystem")
        for path, file_data in self._mounted_files.items():
            await self.store.aput(namespace, path, file_data)

        logger.debug(
            "Wrote %s mounted file(s) to thread store namespace=%s",
            len(self._mounted_files),
            namespace,
        )
