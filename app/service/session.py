from datetime import datetime, timezone
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, update, case

from app.db.model.session import Session as SessionModel
from app.db.model.topic import Topic
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.db.model.agent import Agent
from app.db.model.subagent import SubAgent
from app.schema.session import (
    SessionCreate, SessionUpdate, SessionListQuery,
    TopicCreate, TopicUpdate,
    MessageCreate, MessageListQuery,
    MessageSenderCreate,
    AgentCreate, AgentUpdate,
)


class SessionService:
    """Session 服务"""

    @staticmethod
    def create_session(db: Session, data: SessionCreate, user_id: UUID) -> SessionModel:
        session = SessionModel(
            user_id=user_id,
            name=data.name,
            type=data.type,
            agent_id=data.agent_id,
            metadata_=data.metadata,
            source=data.source,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def get_session(db: Session, session_id: UUID, user_id: UUID) -> Optional[SessionModel]:
        return db.query(SessionModel).filter(
            SessionModel.id == session_id,
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False
        ).first()

    @staticmethod
    def get_sessions(db: Session, query: SessionListQuery, user_id: UUID) -> tuple[list[SessionModel], int]:
        q = db.query(SessionModel).filter(
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == query.is_deleted
        )
        
        if query.type:
            q = q.filter(SessionModel.type == query.type)
        if query.source:
            q = q.filter(SessionModel.source == query.source)
        if query.name_contains and query.name_contains.strip():
            pattern = f"%{query.name_contains.strip()}%"
            q = q.filter(SessionModel.name.ilike(pattern))
        
        total = q.count()
        offset = (query.page - 1) * query.size

        # 按最后消息时间排序，无消息的按创建时间
        last_msg = (
            db.query(func.max(Message.created_at))
            .filter(Message.session_id == SessionModel.id, Message.is_deleted == False)
            .correlate(SessionModel)
            .scalar_subquery()
        )
        sort_key = func.coalesce(last_msg, SessionModel.created_at)
        sessions = q.order_by(sort_key.desc()).offset(offset).limit(query.size).all()
        
        return sessions, total

    @staticmethod
    def update_session(db: Session, session_id: UUID, data: SessionUpdate, user_id: UUID) -> Optional[SessionModel]:
        session = SessionService.get_session(db, session_id, user_id)
        if not session:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        if "metadata" in update_data:
            update_data["metadata_"] = update_data.pop("metadata")
        
        for key, value in update_data.items():
            setattr(session, key, value)
        
        # 校验：开启自动回复时必须关联 Agent
        if session.auto_reply_enabled and not session.agent_id:
            raise ValueError("启用自动回复时必须关联一个 Agent")
        
        # 版本号递增
        session.version += 1
        
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def delete_session(db: Session, session_id: UUID, user_id: UUID, soft_delete: bool = True) -> bool:
        session = db.query(SessionModel).filter(
            SessionModel.id == session_id,
            SessionModel.user_id == user_id
        ).first()
        if not session:
            return False
        
        if soft_delete:
            session.is_deleted = True
            session.version += 1
            db.commit()
        else:
            db.delete(session)
            db.commit()
        return True

    @staticmethod
    def mark_as_read(db: Session, session_id: UUID, user_id: UUID) -> Optional[SessionModel]:
        """标记会话为已读（不触发 updated_at 变更）"""
        session = SessionService.get_session(db, session_id, user_id)
        if not session:
            return None

        # 使用 Core UPDATE 绕过 ORM onupdate，避免 updated_at 被刷新
        db.execute(
            update(SessionModel)
            .where(SessionModel.id == session.id)
            .values(last_visited_at=func.timezone("UTC", func.now()))
        )
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def get_unread_count(db: Session, session_id: UUID, user_id: UUID) -> int:
        """获取未读消息数"""
        session = SessionService.get_session(db, session_id, user_id)
        if not session:
            return 0

        q = db.query(func.count(Message.id)).filter(
            Message.session_id == session_id,
            Message.is_deleted == False
        )

        if session.last_visited_at:
            q = q.filter(Message.created_at > session.last_visited_at)

        return q.scalar() or 0

    @staticmethod
    def get_last_activity_at(db: Session, session_id: UUID) -> Optional[datetime]:
        """获取会话最后一条消息的时间"""
        return db.query(func.max(Message.created_at)).filter(
            Message.session_id == session_id,
            Message.is_deleted == False,
        ).scalar()


class TopicService:
    """Topic 服务"""

    @staticmethod
    def create_topic(db: Session, data: TopicCreate, user_id: UUID) -> Topic:
        topic = Topic(user_id=user_id, name=data.name, session_id=data.session_id)
        db.add(topic)
        db.commit()
        db.refresh(topic)
        return topic

    @staticmethod
    def get_topic(db: Session, topic_id: UUID, user_id: UUID) -> Optional[Topic]:
        return db.query(Topic).filter(
            Topic.id == topic_id,
            Topic.user_id == user_id,
            Topic.is_deleted == False
        ).first()

    @staticmethod
    def get_topics_by_session(db: Session, session_id: UUID, user_id: UUID) -> list[Topic]:
        return db.query(Topic).filter(
            Topic.session_id == session_id,
            Topic.user_id == user_id,
            Topic.is_deleted == False
        ).order_by(Topic.created_at.desc()).all()

    @staticmethod
    def get_topics_by_user(db: Session, user_id: UUID, limit: Optional[int] = 500) -> list[tuple[Topic, Optional[str]]]:
        """返回用户所有话题，附带 session 名称。返回 [(Topic, session_name?), ...]"""
        topics = (
            db.query(Topic)
            .filter(Topic.user_id == user_id, Topic.is_deleted == False)
            .order_by(Topic.created_at.desc())
            .limit(limit or 500)
            .all()
        )
        if not topics:
            return []
        session_ids = list({t.session_id for t in topics})
        sessions = {
            s.id: (s.name or "(未命名)")
            for s in db.query(SessionModel)
            .filter(SessionModel.id.in_(session_ids), SessionModel.user_id == user_id)
            .all()
        }
        return [(t, sessions.get(t.session_id)) for t in topics]

    @staticmethod
    def update_topic(db: Session, topic_id: UUID, data: TopicUpdate, user_id: UUID) -> Optional[Topic]:
        topic = TopicService.get_topic(db, topic_id, user_id)
        if not topic:
            return None
        
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(topic, key, value)
        
        # 版本号递增
        topic.version += 1
        
        db.commit()
        db.refresh(topic)
        return topic

    @staticmethod
    def delete_topic(db: Session, topic_id: UUID, user_id: UUID, soft_delete: bool = True) -> bool:
        topic = db.query(Topic).filter(
            Topic.id == topic_id,
            Topic.user_id == user_id
        ).first()
        if not topic:
            return False
        
        if soft_delete:
            topic.is_deleted = True
            topic.version += 1
        else:
            db.delete(topic)
        db.commit()
        return True


class MessageService:
    """Message 服务"""

    @staticmethod
    def create_message(db: Session, data: MessageCreate, user_id: UUID) -> Message:
        message = Message(
            user_id=user_id,
            session_id=data.session_id,
            topic_id=data.topic_id,
            role=data.role,
            sender_id=data.sender_id,
        )
        db.add(message)
        db.flush()
        
        for part_data in data.parts:
            part = MessagePart(
                message_id=message.id,
                type=part_data.type,
                content=part_data.content,
                metadata_=part_data.metadata,
                event_id=part_data.event_id,
                raw_data=part_data.raw_data,
            )
            db.add(part)
        
        db.commit()
        db.refresh(message)
        
        return message

    @staticmethod
    def get_message(db: Session, message_id: UUID) -> Optional[Message]:
        return db.query(Message).filter(
            Message.id == message_id,
            Message.is_deleted == False
        ).first()

    @staticmethod
    def get_messages(db: Session, session_id: UUID, query: MessageListQuery) -> tuple[list[Message], int]:
        from sqlalchemy.orm import joinedload, subqueryload

        q = db.query(Message).filter(
            Message.session_id == session_id,
            Message.is_deleted == query.is_deleted
        ).options(
            joinedload(Message.sender),
            subqueryload(Message.parts),  # 预加载 parts 关系，避免 N+1 查询
        )

        if query.topic_id:
            q = q.filter(Message.topic_id == query.topic_id)
        if query.role:
            q = q.filter(Message.role == query.role)

        # count 不需要 joinedload，用去掉 options 的基础查询
        count_q = db.query(Message).filter(
            Message.session_id == session_id,
            Message.is_deleted == query.is_deleted
        )
        if query.topic_id:
            count_q = count_q.filter(Message.topic_id == query.topic_id)
        if query.role:
            count_q = count_q.filter(Message.role == query.role)
        total = count_q.count()

        offset = (query.page - 1) * query.size
        messages = q.order_by(Message.created_at.asc()).offset(offset).limit(query.size).all()

        return messages, total

    @staticmethod
    def delete_message(db: Session, message_id: UUID, soft_delete: bool = True) -> bool:
        message = db.query(Message).filter(Message.id == message_id).first()
        if not message:
            return False
        
        if soft_delete:
            message.is_deleted = True
        else:
            db.delete(message)
        db.commit()
        return True


class MessageSenderService:
    """MessageSender 服务"""

    @staticmethod
    def create_sender(db: Session, data: MessageSenderCreate) -> MessageSender:
        sender = MessageSender(name=data.name)
        db.add(sender)
        db.commit()
        db.refresh(sender)
        return sender

    @staticmethod
    def get_sender(db: Session, sender_id: UUID) -> Optional[MessageSender]:
        return db.query(MessageSender).filter(MessageSender.id == sender_id).first()

    @staticmethod
    def get_or_create_sender(db: Session, name: str) -> MessageSender:
        sender = db.query(MessageSender).filter(MessageSender.name == name).first()
        if not sender:
            sender = MessageSender(name=name)
            db.add(sender)
            db.commit()
            db.refresh(sender)
        return sender


class AgentService:
    """Agent 服务"""

    @staticmethod
    def create_agent(db: Session, data: AgentCreate) -> Agent:
        agent = Agent(
            name=data.name,
            system_prompt=data.system_prompt,
            model=data.model,
            model_provider=data.model_provider,
            temperature=data.temperature,
            max_tokens=data.max_tokens,
            tools=data.tools,
            skills=data.skills,
            memory_files=data.memory_files,
            metadata_=data.metadata,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)
        
        # Create subagents if provided
        if data.subagents:
            for subagent_data in data.subagents:
                subagent = SubAgent(
                    parent_agent_id=agent.id,
                    name=subagent_data.name,
                    description=subagent_data.description,
                    system_prompt=subagent_data.system_prompt,
                    model=subagent_data.model,
                    tools=subagent_data.tools,
                )
                db.add(subagent)
            db.commit()
            db.refresh(agent)
        
        return agent

    @staticmethod
    def get_agent(db: Session, agent_id: UUID) -> Optional[Agent]:
        return db.query(Agent).filter(
            Agent.id == agent_id,
            Agent.is_deleted == False
        ).first()

    @staticmethod
    def get_agents(db: Session, page: int = 1, size: int = 20) -> tuple[list[Agent], int]:
        q = db.query(Agent).filter(Agent.is_deleted == False)
        total = q.count()
        offset = (page - 1) * size
        agents = q.order_by(Agent.created_at.desc()).offset(offset).limit(size).all()
        return agents, total

    @staticmethod
    def update_agent(db: Session, agent_id: UUID, data: AgentUpdate) -> Optional[Agent]:
        agent = AgentService.get_agent(db, agent_id)
        if not agent:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        if "metadata" in update_data:
            update_data["metadata_"] = update_data.pop("metadata")
        
        for key, value in update_data.items():
            setattr(agent, key, value)
        
        db.commit()
        db.refresh(agent)
        return agent

    @staticmethod
    def delete_agent(db: Session, agent_id: UUID, soft_delete: bool = True) -> bool:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            return False
        
        if soft_delete:
            agent.is_deleted = True
        else:
            db.delete(agent)
        db.commit()
        return True


class WorkspaceService:
    """Workspace filesystem initialization for sessions."""

    @staticmethod
    async def init_workspace(session_id: UUID, agent: Optional[Agent] = None) -> None:
        """Initialize empty workspace namespace for a new session.

        Creates a .workspace marker in the session's store namespace
        so the namespace exists for future file operations.

        Also seeds lightweight workspace templates (first init only):
        - /AGENTS.md
        - /skills/example/SKILL.md
        """
        from app.agent import AgentFactory
        from deepagents.backends.utils import create_file_data

        store = await AgentFactory.get_store()
        namespace = (str(session_id), "filesystem")
        now = datetime.now(timezone.utc).isoformat()
        await store.aput(namespace, "/.workspace", {
            "content": ["initialized"],
            "created_at": now,
            "modified_at": now,
        })

        # Create workspace AGENTS.md template on first init.
        existing_agents_md = await store.aget(namespace, "/AGENTS.md")
        if not existing_agents_md:
            sample_agents_md = (
                "# AGENTS\n\n"
                "## Project Context\n"
                "- Describe your project goals here.\n\n"
                "## Constraints\n"
                "- List important rules or boundaries.\n\n"
                "## Preferences\n"
                "- Record style, workflow, and output preferences.\n"
            )
            await store.aput(namespace, "/AGENTS.md", create_file_data(sample_agents_md))

        # Seed a unified, simple skills template once.
        # Do not sync from agent.skills: workspace files are user-owned.
        existing_skill_items = await store.asearch(namespace, limit=1000)
        has_skills = any(item.key.startswith("/skills/") for item in existing_skill_items)
        if not has_skills:
            sample_skill_content = (
                "---\n"
                "name: example\n"
                "description: A minimal skill template.\n"
                "---\n\n"
                "# Example Skill\n\n"
                "## Purpose\n"
                "Briefly describe what this skill does.\n\n"
                "## Steps\n"
                "1. Read the request.\n"
                "2. Do the task.\n"
                "3. Return a concise result.\n"
            )
            await store.aput(
                namespace,
                "/skills/README.md",
                create_file_data(
                    "# Skills\n\n"
                    "Add skill files under `/workspace/skills/<name>/SKILL.md`.\n"
                    "Use `/workspace/skills/example/SKILL.md` as a starter template."
                ),
            )
            await store.aput(
                namespace,
                "/skills/example/SKILL.md",
                create_file_data(sample_skill_content),
            )
