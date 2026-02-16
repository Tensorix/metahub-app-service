"""
Custom filesystem backends for two-tier lifecycle storage.

ThreadScopedStoreBackend: Uses thread_id namespace for per-thread file isolation.
Root files (Agent.md, skills, agent temp files) are stored per-thread.
Workspace files are stored per-session via the standard StoreBackend.
"""

from deepagents.backends.store import StoreBackend


class ThreadScopedStoreBackend(StoreBackend):
    """StoreBackend using thread_id namespace for per-thread file isolation.

    Overrides _get_namespace() to derive namespace from thread_id
    (configurable.thread_id) instead of assistant_id (metadata.assistant_id).

    This gives each conversation thread its own isolated filesystem namespace
    in the same PostgreSQL store, while the standard StoreBackend continues
    to use assistant_id (= session_id) for workspace files.
    """

    def _get_namespace(self) -> tuple[str, ...]:
        namespace = "filesystem"

        # Prefer the runtime-provided config when present
        runtime_cfg = getattr(self.runtime, "config", None)
        if isinstance(runtime_cfg, dict):
            thread_id = runtime_cfg.get("configurable", {}).get("thread_id")
            if thread_id:
                return (str(thread_id), namespace)
            return (namespace,)

        # Fallback to langgraph's context
        try:
            from langgraph.config import get_config
            cfg = get_config()
        except Exception:
            return (namespace,)

        try:
            thread_id = cfg.get("configurable", {}).get("thread_id")
        except Exception:
            thread_id = None

        if thread_id:
            return (str(thread_id), namespace)
        return (namespace,)
