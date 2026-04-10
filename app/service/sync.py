from datetime import datetime
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.db.model.activity import Activity
from app.db.model.session import Session as SessionModel
from app.db.model.topic import Topic
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.schema.sync import (
    ActivitySyncItem, ActivitySyncResult,
    SessionSyncItem, SessionSyncResult,
    TopicSyncItem, TopicSyncResult,
    MessageSyncItem, MessageSyncResult,
    SyncRequest, SyncResponse,
    PullSyncRequest, PullSyncResponse,
)


class SyncService:
    """同步服务 - 处理 Activity、Session、Topic 的批量同步"""

    @staticmethod
    def sync_batch(db: Session, request: SyncRequest, user_id: UUID) -> SyncResponse:
        """批量同步处理（带用户隔离）"""
        activity_results = []
        session_results = []
        topic_results = []
        message_results = []
        
        # 处理 Activity 同步
        if request.activities:
            for item in request.activities:
                result = SyncService._sync_activity(db, item, user_id, request.conflict_strategy)
                activity_results.append(result)
        
        # 处理 Session 同步
        if request.sessions:
            for item in request.sessions:
                result = SyncService._sync_session(db, item, user_id, request.conflict_strategy)
                session_results.append(result)
        
        # 处理 Topic 同步
        if request.topics:
            for item in request.topics:
                result = SyncService._sync_topic(db, item, user_id, request.conflict_strategy)
                topic_results.append(result)
        
        # 处理 Message 同步
        if request.messages:
            for item in request.messages:
                result = SyncService._sync_message(db, item, user_id, request.conflict_strategy)
                message_results.append(result)
        
        # 统计
        all_results = activity_results + session_results + topic_results + message_results
        total = len(all_results)
        successful = sum(1 for r in all_results if r.success)
        failed = sum(1 for r in all_results if not r.success)
        conflicts = sum(1 for r in all_results if r.conflict)
        
        return SyncResponse(
            activities=activity_results,
            sessions=session_results,
            topics=topic_results,
            messages=message_results,
            total_operations=total,
            successful_operations=successful,
            failed_operations=failed,
            conflicts=conflicts,
            sync_timestamp=datetime.utcnow()
        )

    @staticmethod
    def _sync_activity(db: Session, item: ActivitySyncItem, user_id: UUID, conflict_strategy: str) -> ActivitySyncResult:
        """同步单个 Activity（带用户隔离）"""
        try:
            if item.operation == "create":
                return SyncService._create_activity(db, item, user_id)
            elif item.operation == "update":
                return SyncService._update_activity(db, item, user_id, conflict_strategy)
            elif item.operation == "delete":
                return SyncService._delete_activity(db, item, user_id)
            else:
                return ActivitySyncResult(
                    id=item.id or UUID(int=0),
                    operation=item.operation,
                    success=False,
                    error=f"未知操作类型: {item.operation}"
                )
        except Exception as e:
            return ActivitySyncResult(
                id=item.id or UUID(int=0),
                operation=item.operation,
                success=False,
                error=str(e)
            )

    @staticmethod
    def _create_activity(db: Session, item: ActivitySyncItem, user_id: UUID) -> ActivitySyncResult:
        """创建 Activity（带用户隔离）"""
        activity = Activity(
            user_id=user_id,
            type=item.type,
            name=item.name,
            priority=item.priority or 0,
            notes=item.notes,
            tags=item.tags or [],
            source_type=item.source_type,
            source_id=item.source_id,
            relation_ids=item.relation_ids or [],
            status=item.status or "pending",
            remind_at=item.remind_at,
            due_date=item.due_date,
            version=1,
        )
        db.add(activity)
        db.commit()
        db.refresh(activity)
        
        return ActivitySyncResult(
            id=activity.id,
            operation="create",
            success=True,
            version=activity.version,
            server_updated_at=activity.updated_at
        )

    @staticmethod
    def _update_activity(db: Session, item: ActivitySyncItem, user_id: UUID, conflict_strategy: str) -> ActivitySyncResult:
        """更新 Activity（带版本控制和用户隔离）"""
        if not item.id:
            return ActivitySyncResult(
                id=UUID(int=0),
                operation="update",
                success=False,
                error="更新操作需要提供 id"
            )
        
        activity = db.query(Activity).filter(
            Activity.id == item.id,
            Activity.user_id == user_id,  # 用户隔离
            Activity.is_deleted == False
        ).first()
        
        if not activity:
            return ActivitySyncResult(
                id=item.id,
                operation="update",
                success=False,
                error="Activity 不存在或无权访问"
            )
        
        # 版本冲突检测（乐观锁）
        has_conflict = False
        if item.version is not None and activity.version != item.version:
            has_conflict = True
            if conflict_strategy == "fail":
                return ActivitySyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error=f"版本冲突：客户端版本 {item.version}，服务器版本 {activity.version}",
                    version=activity.version,
                    server_updated_at=activity.updated_at
                )
            elif conflict_strategy == "server_wins":
                # 服务器优先，不更新
                return ActivitySyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=activity.version,
                    server_updated_at=activity.updated_at
                )
        
        # 时间戳冲突检测（备用方案）
        if not has_conflict and item.client_updated_at and activity.updated_at > item.client_updated_at:
            has_conflict = True
            if conflict_strategy == "fail":
                return ActivitySyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error="检测到冲突，服务器数据已被修改",
                    version=activity.version,
                    server_updated_at=activity.updated_at
                )
            elif conflict_strategy == "server_wins":
                return ActivitySyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=activity.version,
                    server_updated_at=activity.updated_at
                )
        
        # 更新字段
        if item.type is not None:
            activity.type = item.type
        if item.name is not None:
            activity.name = item.name
        if item.priority is not None:
            activity.priority = item.priority
        if item.notes is not None:
            activity.notes = item.notes
        if item.tags is not None:
            activity.tags = item.tags
        if item.source_type is not None:
            activity.source_type = item.source_type
        if item.source_id is not None:
            activity.source_id = item.source_id
        if item.relation_ids is not None:
            activity.relation_ids = item.relation_ids
        if item.status is not None:
            activity.status = item.status
        if item.remind_at is not None:
            activity.remind_at = item.remind_at
        if item.due_date is not None:
            activity.due_date = item.due_date
        
        # 版本号递增
        activity.version += 1
        
        db.commit()
        db.refresh(activity)
        
        return ActivitySyncResult(
            id=activity.id,
            operation="update",
            success=True,
            conflict=has_conflict,
            version=activity.version,
            server_updated_at=activity.updated_at
        )

    @staticmethod
    def _delete_activity(db: Session, item: ActivitySyncItem, user_id: UUID) -> ActivitySyncResult:
        """删除 Activity（软删除，带用户隔离）"""
        if not item.id:
            return ActivitySyncResult(
                id=UUID(int=0),
                operation="delete",
                success=False,
                error="删除操作需要提供 id"
            )
        
        activity = db.query(Activity).filter(
            Activity.id == item.id,
            Activity.user_id == user_id  # 用户隔离
        ).first()
        if not activity:
            return ActivitySyncResult(
                id=item.id,
                operation="delete",
                success=False,
                error="Activity 不存在或无权访问"
            )
        
        activity.is_deleted = True
        activity.version += 1
        db.commit()
        
        return ActivitySyncResult(
            id=item.id,
            operation="delete",
            success=True,
            version=activity.version,
            server_updated_at=activity.updated_at
        )

    @staticmethod
    def _sync_session(db: Session, item: SessionSyncItem, user_id: UUID, conflict_strategy: str) -> SessionSyncResult:
        """同步单个 Session（带用户隔离）"""
        try:
            if item.operation == "create":
                return SyncService._create_session(db, item, user_id)
            elif item.operation == "update":
                return SyncService._update_session(db, item, user_id, conflict_strategy)
            elif item.operation == "delete":
                return SyncService._delete_session(db, item, user_id)
            else:
                return SessionSyncResult(
                    id=item.id or UUID(int=0),
                    operation=item.operation,
                    success=False,
                    error=f"未知操作类型: {item.operation}"
                )
        except Exception as e:
            return SessionSyncResult(
                id=item.id or UUID(int=0),
                operation=item.operation,
                success=False,
                error=str(e)
            )

    @staticmethod
    def _create_session(db: Session, item: SessionSyncItem, user_id: UUID) -> SessionSyncResult:
        """创建 Session（带用户隔离）"""
        session = SessionModel(
            user_id=user_id,
            name=item.name,
            type=item.type,
            agent_id=item.agent_id,
            metadata_=item.metadata,
            source=item.source,
            last_visited_at=item.last_visited_at,
            version=1,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        return SessionSyncResult(
            id=session.id,
            operation="create",
            success=True,
            version=session.version,
            server_updated_at=session.updated_at
        )

    @staticmethod
    def _update_session(db: Session, item: SessionSyncItem, user_id: UUID, conflict_strategy: str) -> SessionSyncResult:
        """更新 Session（带版本控制和用户隔离）"""
        if not item.id:
            return SessionSyncResult(
                id=UUID(int=0),
                operation="update",
                success=False,
                error="更新操作需要提供 id"
            )
        
        session = db.query(SessionModel).filter(
            SessionModel.id == item.id,
            SessionModel.user_id == user_id,  # 用户隔离
            SessionModel.is_deleted == False
        ).first()
        
        if not session:
            return SessionSyncResult(
                id=item.id,
                operation="update",
                success=False,
                error="Session 不存在或无权访问"
            )
        
        # 版本冲突检测
        has_conflict = False
        if item.version is not None and session.version != item.version:
            has_conflict = True
            if conflict_strategy == "fail":
                return SessionSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error=f"版本冲突：客户端版本 {item.version}，服务器版本 {session.version}",
                    version=session.version,
                    server_updated_at=session.updated_at
                )
            elif conflict_strategy == "server_wins":
                return SessionSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=session.version,
                    server_updated_at=session.updated_at
                )
        
        # 时间戳冲突检测
        if not has_conflict and item.client_updated_at and session.updated_at > item.client_updated_at:
            has_conflict = True
            if conflict_strategy == "fail":
                return SessionSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error="检测到冲突，服务器数据已被修改",
                    version=session.version,
                    server_updated_at=session.updated_at
                )
            elif conflict_strategy == "server_wins":
                return SessionSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=session.version,
                    server_updated_at=session.updated_at
                )
        
        # 更新字段
        if item.name is not None:
            session.name = item.name
        if item.type is not None:
            session.type = item.type
        if item.agent_id is not None:
            session.agent_id = item.agent_id
        if item.metadata is not None:
            session.metadata_ = item.metadata
        if item.source is not None:
            session.source = item.source
        if item.last_visited_at is not None:
            session.last_visited_at = item.last_visited_at
        
        # 版本号递增
        session.version += 1
        
        db.commit()
        db.refresh(session)
        
        return SessionSyncResult(
            id=session.id,
            operation="update",
            success=True,
            conflict=has_conflict,
            version=session.version,
            server_updated_at=session.updated_at
        )

    @staticmethod
    def _delete_session(db: Session, item: SessionSyncItem, user_id: UUID) -> SessionSyncResult:
        """删除 Session（软删除，带用户隔离）"""
        if not item.id:
            return SessionSyncResult(
                id=UUID(int=0),
                operation="delete",
                success=False,
                error="删除操作需要提供 id"
            )
        
        session = db.query(SessionModel).filter(
            SessionModel.id == item.id,
            SessionModel.user_id == user_id  # 用户隔离
        ).first()
        if not session:
            return SessionSyncResult(
                id=item.id,
                operation="delete",
                success=False,
                error="Session 不存在或无权访问"
            )
        
        session.is_deleted = True
        session.version += 1
        db.commit()
        
        return SessionSyncResult(
            id=item.id,
            operation="delete",
            success=True,
            version=session.version,
            server_updated_at=session.updated_at
        )

    @staticmethod
    def _sync_topic(db: Session, item: TopicSyncItem, user_id: UUID, conflict_strategy: str) -> TopicSyncResult:
        """同步单个 Topic（带用户隔离）"""
        try:
            if item.operation == "create":
                return SyncService._create_topic(db, item, user_id)
            elif item.operation == "update":
                return SyncService._update_topic(db, item, user_id, conflict_strategy)
            elif item.operation == "delete":
                return SyncService._delete_topic(db, item, user_id)
            else:
                return TopicSyncResult(
                    id=item.id or UUID(int=0),
                    operation=item.operation,
                    success=False,
                    error=f"未知操作类型: {item.operation}"
                )
        except Exception as e:
            return TopicSyncResult(
                id=item.id or UUID(int=0),
                operation=item.operation,
                success=False,
                error=str(e)
            )

    @staticmethod
    def _create_topic(db: Session, item: TopicSyncItem, user_id: UUID) -> TopicSyncResult:
        """创建 Topic（带用户隔离）"""
        topic = Topic(
            user_id=user_id,
            name=item.name,
            session_id=item.session_id,
            version=1,
        )
        db.add(topic)
        db.commit()
        db.refresh(topic)
        
        return TopicSyncResult(
            id=topic.id,
            operation="create",
            success=True,
            version=topic.version,
            server_updated_at=topic.updated_at
        )

    @staticmethod
    def _update_topic(db: Session, item: TopicSyncItem, user_id: UUID, conflict_strategy: str) -> TopicSyncResult:
        """更新 Topic（带版本控制和用户隔离）"""
        if not item.id:
            return TopicSyncResult(
                id=UUID(int=0),
                operation="update",
                success=False,
                error="更新操作需要提供 id"
            )
        
        topic = db.query(Topic).filter(
            Topic.id == item.id,
            Topic.user_id == user_id,  # 用户隔离
            Topic.is_deleted == False
        ).first()
        
        if not topic:
            return TopicSyncResult(
                id=item.id,
                operation="update",
                success=False,
                error="Topic 不存在或无权访问"
            )
        
        # 版本冲突检测
        has_conflict = False
        if item.version is not None and topic.version != item.version:
            has_conflict = True
            if conflict_strategy == "fail":
                return TopicSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error=f"版本冲突：客户端版本 {item.version}，服务器版本 {topic.version}",
                    version=topic.version,
                    server_updated_at=topic.updated_at
                )
            elif conflict_strategy == "server_wins":
                return TopicSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=topic.version,
                    server_updated_at=topic.updated_at
                )
        
        # 时间戳冲突检测
        if not has_conflict and item.client_updated_at and topic.updated_at > item.client_updated_at:
            has_conflict = True
            if conflict_strategy == "fail":
                return TopicSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error="检测到冲突，服务器数据已被修改",
                    version=topic.version,
                    server_updated_at=topic.updated_at
                )
            elif conflict_strategy == "server_wins":
                return TopicSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=topic.version,
                    server_updated_at=topic.updated_at
                )
        
        # 更新字段
        if item.name is not None:
            topic.name = item.name
        if item.session_id is not None:
            topic.session_id = item.session_id
        
        # 版本号递增
        topic.version += 1
        
        db.commit()
        db.refresh(topic)
        
        return TopicSyncResult(
            id=topic.id,
            operation="update",
            success=True,
            conflict=has_conflict,
            version=topic.version,
            server_updated_at=topic.updated_at
        )

    @staticmethod
    def _delete_topic(db: Session, item: TopicSyncItem, user_id: UUID) -> TopicSyncResult:
        """删除 Topic（软删除，带用户隔离）"""
        if not item.id:
            return TopicSyncResult(
                id=UUID(int=0),
                operation="delete",
                success=False,
                error="删除操作需要提供 id"
            )
        
        topic = db.query(Topic).filter(
            Topic.id == item.id,
            Topic.user_id == user_id  # 用户隔离
        ).first()
        if not topic:
            return TopicSyncResult(
                id=item.id,
                operation="delete",
                success=False,
                error="Topic 不存在或无权访问"
            )
        
        topic.is_deleted = True
        topic.version += 1
        db.commit()
        
        return TopicSyncResult(
            id=item.id,
            operation="delete",
            success=True,
            version=topic.version,
            server_updated_at=topic.updated_at
        )

    @staticmethod
    def _sync_message(db: Session, item: MessageSyncItem, user_id: UUID, conflict_strategy: str) -> MessageSyncResult:
        """同步单个 Message（带用户隔离）"""
        try:
            if item.operation == "create":
                return SyncService._create_message(db, item, user_id)
            elif item.operation == "update":
                return SyncService._update_message(db, item, user_id, conflict_strategy)
            elif item.operation == "delete":
                return SyncService._delete_message(db, item, user_id)
            else:
                return MessageSyncResult(
                    id=item.id or UUID(int=0),
                    operation=item.operation,
                    success=False,
                    error=f"未知操作类型: {item.operation}"
                )
        except Exception as e:
            return MessageSyncResult(
                id=item.id or UUID(int=0),
                operation=item.operation,
                success=False,
                error=str(e)
            )

    @staticmethod
    def _create_message(db: Session, item: MessageSyncItem, user_id: UUID) -> MessageSyncResult:
        """创建 Message（带用户隔离）"""
        # 验证 session 是否属于当前用户
        session = db.query(SessionModel).filter(
            SessionModel.id == item.session_id,
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False
        ).first()
        
        if not session:
            return MessageSyncResult(
                id=UUID(int=0),
                operation="create",
                success=False,
                error="Session 不存在或无权访问"
            )
        
        # 如果指定了 topic_id，验证 topic 是否属于当前用户
        if item.topic_id:
            topic = db.query(Topic).filter(
                Topic.id == item.topic_id,
                Topic.user_id == user_id,
                Topic.is_deleted == False
            ).first()
            
            if not topic:
                return MessageSyncResult(
                    id=UUID(int=0),
                    operation="create",
                    success=False,
                    error="Topic 不存在或无权访问"
                )
        
        message = Message(
            user_id=user_id,
            session_id=item.session_id,
            topic_id=item.topic_id,
            role=item.role,
            sender_id=item.sender_id,
            version=1,
        )
        db.add(message)
        db.flush()  # 获取 message.id
        
        # 创建 MessageParts
        if item.parts:
            for part_item in item.parts:
                part = MessagePart(
                    message_id=message.id,
                    type=part_item.type,
                    content=part_item.content,
                    metadata_=part_item.metadata,
                    event_id=part_item.event_id,
                    raw_data=part_item.raw_data,
                )
                db.add(part)
        
        db.commit()
        db.refresh(message)
        
        # 创建搜索索引
        try:
            from app.service.search_indexer import SearchIndexerService
            indexer = SearchIndexerService()
            indexer.index_message(db, message)
        except Exception as e:
            logger.error(f"Failed to index message {message.id}: {e}")
        
        return MessageSyncResult(
            id=message.id,
            operation="create",
            success=True,
            version=message.version,
            server_updated_at=message.updated_at
        )

    @staticmethod
    def _update_message(db: Session, item: MessageSyncItem, user_id: UUID, conflict_strategy: str) -> MessageSyncResult:
        """更新 Message（带版本控制和用户隔离）"""
        if not item.id:
            return MessageSyncResult(
                id=UUID(int=0),
                operation="update",
                success=False,
                error="更新操作需要提供 id"
            )
        
        message = db.query(Message).filter(
            Message.id == item.id,
            Message.user_id == user_id,  # 用户隔离
            Message.is_deleted == False
        ).first()
        
        if not message:
            return MessageSyncResult(
                id=item.id,
                operation="update",
                success=False,
                error="Message 不存在或无权访问"
            )
        
        # 版本冲突检测
        has_conflict = False
        if item.version is not None and message.version != item.version:
            has_conflict = True
            if conflict_strategy == "fail":
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error=f"版本冲突：客户端版本 {item.version}，服务器版本 {message.version}",
                    version=message.version,
                    server_updated_at=message.updated_at
                )
            elif conflict_strategy == "server_wins":
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=message.version,
                    server_updated_at=message.updated_at
                )
        
        # 时间戳冲突检测
        if not has_conflict and item.client_updated_at and message.updated_at > item.client_updated_at:
            has_conflict = True
            if conflict_strategy == "fail":
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    conflict=True,
                    error="检测到冲突，服务器数据已被修改",
                    version=message.version,
                    server_updated_at=message.updated_at
                )
            elif conflict_strategy == "server_wins":
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=True,
                    conflict=True,
                    version=message.version,
                    server_updated_at=message.updated_at
                )
        
        # 更新字段
        if item.session_id is not None:
            # 验证新的 session 是否属于当前用户
            session = db.query(SessionModel).filter(
                SessionModel.id == item.session_id,
                SessionModel.user_id == user_id,
                SessionModel.is_deleted == False
            ).first()
            if not session:
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    error="目标 Session 不存在或无权访问"
                )
            message.session_id = item.session_id
        
        if item.topic_id is not None:
            # 验证新的 topic 是否属于当前用户
            topic = db.query(Topic).filter(
                Topic.id == item.topic_id,
                Topic.user_id == user_id,
                Topic.is_deleted == False
            ).first()
            if not topic:
                return MessageSyncResult(
                    id=item.id,
                    operation="update",
                    success=False,
                    error="目标 Topic 不存在或无权访问"
                )
            message.topic_id = item.topic_id
        
        if item.role is not None:
            message.role = item.role
        if item.sender_id is not None:
            message.sender_id = item.sender_id
        
        # 更新 MessageParts（如果提供）
        if item.parts is not None:
            # 删除现有的 parts
            db.query(MessagePart).filter(MessagePart.message_id == message.id).delete()
            
            # 创建新的 parts
            for part_item in item.parts:
                part = MessagePart(
                    message_id=message.id,
                    type=part_item.type,
                    content=part_item.content,
                    metadata_=part_item.metadata,
                    event_id=part_item.event_id,
                    raw_data=part_item.raw_data,
                )
                db.add(part)
        
        # 版本号递增
        message.version += 1
        
        db.commit()
        db.refresh(message)
        
        return MessageSyncResult(
            id=message.id,
            operation="update",
            success=True,
            conflict=has_conflict,
            version=message.version,
            server_updated_at=message.updated_at
        )

    @staticmethod
    def _delete_message(db: Session, item: MessageSyncItem, user_id: UUID) -> MessageSyncResult:
        """删除 Message（软删除，带用户隔离）"""
        if not item.id:
            return MessageSyncResult(
                id=UUID(int=0),
                operation="delete",
                success=False,
                error="删除操作需要提供 id"
            )
        
        message = db.query(Message).filter(
            Message.id == item.id,
            Message.user_id == user_id  # 用户隔离
        ).first()
        if not message:
            return MessageSyncResult(
                id=item.id,
                operation="delete",
                success=False,
                error="Message 不存在或无权访问"
            )
        
        message.is_deleted = True
        message.version += 1
        db.commit()
        
        return MessageSyncResult(
            id=item.id,
            operation="delete",
            success=True,
            version=message.version,
            server_updated_at=message.updated_at
        )

    @staticmethod
    def pull_changes(db: Session, request: PullSyncRequest, user_id: UUID) -> PullSyncResponse:
        """增量拉取变更数据（带用户隔离）"""
        activities = []
        sessions = []
        topics = []
        messages = []
        
        # 拉取 Activities
        if request.include_activities:
            query = db.query(Activity).filter(Activity.user_id == user_id)
            if request.last_sync_at:
                query = query.filter(Activity.updated_at > request.last_sync_at)
            activities_data = query.order_by(Activity.updated_at.asc()).limit(request.limit).all()
            activities = [
                {
                    "id": str(a.id),
                    "type": a.type,
                    "name": a.name,
                    "priority": a.priority,
                    "comments": a.notes,
                    "notes": a.notes,
                    "tags": a.tags,
                    "source_type": a.source_type,
                    "source_id": a.source_id,
                    "relation_ids": a.relation_ids,
                    "status": a.status,
                    "remind_at": a.remind_at.isoformat() if a.remind_at else None,
                    "due_date": a.due_date.isoformat() if a.due_date else None,
                    "version": a.version,
                    "created_at": a.created_at.isoformat(),
                    "updated_at": a.updated_at.isoformat(),
                    "is_deleted": a.is_deleted,
                }
                for a in activities_data
            ]
        
        # 拉取 Sessions
        if request.include_sessions:
            query = db.query(SessionModel).filter(SessionModel.user_id == user_id)
            if request.last_sync_at:
                query = query.filter(SessionModel.updated_at > request.last_sync_at)
            sessions_data = query.order_by(SessionModel.updated_at.asc()).limit(request.limit).all()
            sessions = [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "type": s.type,
                    "agent_id": str(s.agent_id) if s.agent_id else None,
                    "metadata": s.metadata_,
                    "source": s.source,
                    "last_visited_at": s.last_visited_at.isoformat() if s.last_visited_at else None,
                    "version": s.version,
                    "created_at": s.created_at.isoformat(),
                    "updated_at": s.updated_at.isoformat(),
                    "is_deleted": s.is_deleted,
                }
                for s in sessions_data
            ]
        
        # 拉取 Topics
        if request.include_topics:
            query = db.query(Topic).filter(Topic.user_id == user_id)
            if request.last_sync_at:
                query = query.filter(Topic.updated_at > request.last_sync_at)
            topics_data = query.order_by(Topic.updated_at.asc()).limit(request.limit).all()
            topics = [
                {
                    "id": str(t.id),
                    "name": t.name,
                    "session_id": str(t.session_id),
                    "version": t.version,
                    "created_at": t.created_at.isoformat(),
                    "updated_at": t.updated_at.isoformat(),
                    "is_deleted": t.is_deleted,
                }
                for t in topics_data
            ]
        
        # 拉取 Messages
        if request.include_messages:
            query = db.query(Message).filter(Message.user_id == user_id)
            if request.last_sync_at:
                query = query.filter(Message.updated_at > request.last_sync_at)
            messages_data = query.order_by(Message.updated_at.asc()).limit(request.limit).all()
            messages = [
                {
                    "id": str(m.id),
                    "session_id": str(m.session_id),
                    "topic_id": str(m.topic_id) if m.topic_id else None,
                    "role": m.role,
                    "sender_id": str(m.sender_id) if m.sender_id else None,
                    "parts": [
                        {
                            "id": str(p.id),
                            "type": p.type,
                            "content": p.content,
                            "metadata": p.metadata_,
                            "event_id": p.event_id,
                            "raw_data": p.raw_data,
                            "created_at": p.created_at.isoformat(),
                        }
                        for p in m.parts
                    ],
                    "version": m.version,
                    "created_at": m.created_at.isoformat(),
                    "updated_at": m.updated_at.isoformat(),
                    "is_deleted": m.is_deleted,
                }
                for m in messages_data
            ]
        
        # 判断是否还有更多数据
        total_fetched = len(activities) + len(sessions) + len(topics) + len(messages)
        has_more = total_fetched >= request.limit
        
        # 计算下次游标
        next_cursor = None
        if has_more:
            all_items = []
            if activities:
                all_items.extend([a["updated_at"] for a in activities])
            if sessions:
                all_items.extend([s["updated_at"] for s in sessions])
            if topics:
                all_items.extend([t["updated_at"] for t in topics])
            if messages:
                all_items.extend([m["updated_at"] for m in messages])
            
            if all_items:
                next_cursor = max(datetime.fromisoformat(ts) for ts in all_items)
        
        return PullSyncResponse(
            activities=activities,
            sessions=sessions,
            topics=topics,
            messages=messages,
            has_more=has_more,
            sync_timestamp=datetime.utcnow(),
            next_cursor=next_cursor
        )
