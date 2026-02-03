"""Webhook 服务层 - 处理 IM 消息 webhook 的业务逻辑"""
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from loguru import logger

from app.db.model.session import Session as SessionModel
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.db.model.event import Event
from app.db.model.activity import Activity
from app.schema.webhook import IMMessageWebhookRequest
from app.agent.message_analyzer import get_message_analyzer
from app.constants.message import MessageRole


class WebhookService:
    """Webhook 服务"""
    
    @staticmethod
    def process_im_message(
        db: Session,
        webhook_data: IMMessageWebhookRequest,
        user_id: UUID
    ) -> dict:
        """
        处理 IM 消息 webhook
        
        流程：
        1. 获取或创建 Session（基于 external_id）
        2. 获取或创建 MessageSender
        3. 创建 Message 和 MessagePart
        4. 获取会话上下文（最近 30 条消息）
        5. 创建 Event
        6. 使用 LangChain Agent 分析消息
        7. 如果重要，创建 Activity
        
        Args:
            db: 数据库会话
            webhook_data: webhook 请求数据
            user_id: 用户ID
        
        Returns:
            处理结果字典
        """
        try:
            # 1. 获取或创建 Session
            session = WebhookService._get_or_create_session(
                db, webhook_data, user_id
            )
            logger.info(f"Session: id={session.id}, external_id={session.external_id}")
            
            # 2. 获取或创建 MessageSender
            sender = WebhookService._get_or_create_sender(
                db, webhook_data.sender
            )
            logger.info(f"Sender: id={sender.id}, name={sender.name}")
            
            # 3. 创建 Message
            message = WebhookService._create_message(
                db, webhook_data, session.id, sender.id, user_id
            )
            logger.info(f"Message created: id={message.id}, external_id={message.external_id}")
            
            # 3.1 创建搜索索引（在后台任务中，不会阻塞主流程）
            try:
                from app.service.search_indexer import SearchIndexerService
                indexer = SearchIndexerService()
                indexer.index_message(db, message)
            except Exception as e:
                logger.error(f"Failed to index message {message.id}: {e}")
            
            # 4. 获取会话上下文（最近 30 条消息）
            context_messages = WebhookService._get_context_messages(
                db, session.id, limit=30
            )
            logger.info(f"Context messages count: {len(context_messages)}")
            
            # 5. 创建 Event
            event = WebhookService._create_event(
                db, webhook_data, session, message, context_messages, user_id
            )
            logger.info(f"Event created: id={event.id}, type={event.type}")
            
            # 6. 使用 Agent 分析消息
            analyzer = get_message_analyzer()
            suggestion = analyzer.analyze_message(
                sender_name=webhook_data.sender.get("nickname", "Unknown"),
                message_type=webhook_data.session_type,
                message_content=webhook_data.message_str,
                context_messages=context_messages
            )
            logger.info(f"Analysis result: is_important={suggestion.is_important}, reasoning={suggestion.reasoning}")
            
            # 7. 如果重要，创建 Activity
            activity = None
            if suggestion.is_important:
                activity = WebhookService._create_activity(
                    db, suggestion, event, user_id
                )
                logger.info(f"Activity created: id={activity.id}, name={activity.name}")
            
            return {
                "session_id": str(session.id),
                "message_id": str(message.id),
                "event_id": str(event.id),
                "activity_created": activity is not None,
                "activity_id": str(activity.id) if activity else None,
                "analysis": {
                    "is_important": suggestion.is_important,
                    "reasoning": suggestion.reasoning
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing IM message webhook: {e}", exc_info=True)
            raise
    
    @staticmethod
    def _get_or_create_session(
        db: Session,
        webhook_data: IMMessageWebhookRequest,
        user_id: UUID
    ) -> SessionModel:
        """获取或创建 Session（直接使用上游提供的类型和来源）"""
        external_id = webhook_data.session_id
        
        # 尝试查找现有 session
        session = db.query(SessionModel).filter(
            SessionModel.user_id == user_id,
            SessionModel.external_id == external_id,
            SessionModel.is_deleted == False
        ).first()
        
        if session:
            return session
        
        # 创建新 session - 直接使用上游提供的类型和来源，不做任何映射
        session_name = None
        
        if webhook_data.group and webhook_data.group.get("group_name"):
            session_name = webhook_data.group["group_name"]
        else:
            session_name = webhook_data.sender.get("nickname", "Unknown")
        
        session = SessionModel(
            user_id=user_id,
            external_id=external_id,
            name=session_name,
            type=webhook_data.session_type,  # 直接使用上游提供的类型，不做映射
            source=webhook_data.source,       # 直接使用上游提供的来源，不做映射
            metadata_={
                "self_id": webhook_data.self_id,
                "group": webhook_data.group
            }
        )
        db.add(session)
        db.flush()
        return session
    
    @staticmethod
    def _get_or_create_sender(
        db: Session,
        sender_data: dict
    ) -> MessageSender:
        """获取或创建 MessageSender"""
        sender_name = sender_data.get("nickname", sender_data.get("user_id", "Unknown"))
        
        # 尝试查找现有 sender
        sender = db.query(MessageSender).filter(
            MessageSender.name == sender_name
        ).first()
        
        if sender:
            return sender
        
        # 创建新 sender
        sender = MessageSender(name=sender_name)
        db.add(sender)
        db.flush()
        return sender
    
    @staticmethod
    def _create_message(
        db: Session,
        webhook_data: IMMessageWebhookRequest,
        session_id: UUID,
        sender_id: UUID,
        user_id: UUID
    ) -> Message:
        """创建 Message 和 MessagePart（带去重）"""
        # 检查消息是否已存在（基于 external_id 去重）
        existing_message = db.query(Message).filter(
            Message.user_id == user_id,
            Message.external_id == webhook_data.message_id,
            Message.is_deleted == False
        ).first()
        
        if existing_message:
            logger.info(f"Message already exists, skipping: external_id={webhook_data.message_id}")
            return existing_message
        
        # 创建 Message
        message = Message(
            user_id=user_id,
            session_id=session_id,
            sender_id=sender_id,
            role=MessageRole.NULL,
            external_id=webhook_data.message_id
        )
        db.add(message)
        db.flush()
        
        # 创建 MessagePart - 直接使用上游提供的类型，不做映射
        for part_data in webhook_data.message:
            part_type = part_data.get("type", "text").lower()
            
            # 提取内容 - 根据类型从不同字段获取
            if part_type == "text":
                content = part_data.get("text", part_data.get("content", ""))
            elif part_type == "image":
                content = part_data.get("url", part_data.get("file", ""))
            elif part_type == "at":
                content = f"@{part_data.get('name', part_data.get('qq', part_data.get('user_id', '')))}"
            elif part_type == "url":
                content = part_data.get("url", "")
            elif part_type == "json":
                content = str(part_data.get("data", part_data))
            else:
                # 未知类型，尝试提取内容
                content = part_data.get("content", part_data.get("text", str(part_data)))
                logger.warning(f"Unknown message part type: {part_type}, extracted content as string")
            
            part = MessagePart(
                message_id=message.id,
                type=part_type,
                content=content,
                raw_data=part_data
            )
            db.add(part)
        
        db.flush()
        return message
    
    @staticmethod
    def _get_context_messages(
        db: Session,
        session_id: UUID,
        limit: int = 30
    ) -> list[dict]:
        """获取会话上下文消息"""
        messages = db.query(Message).filter(
            Message.session_id == session_id,
            Message.is_deleted == False
        ).order_by(Message.created_at.desc()).limit(limit).all()
        
        # 反转顺序（从旧到新）
        messages = list(reversed(messages))
        
        # 格式化消息
        context = []
        for msg in messages:
            # 获取消息内容
            content_parts = []
            for part in msg.parts:
                if part.type == "text":
                    content_parts.append(part.content)
                elif part.type == "image":
                    content_parts.append("[图片]")
                elif part.type == "at":
                    content_parts.append(part.content)
                elif part.type == "url":
                    content_parts.append(f"[链接: {part.content}]")
                elif part.type == "json":
                    content_parts.append("[JSON数据]")
                else:
                    content_parts.append(part.content)
            
            content = " ".join(content_parts)
            
            context.append({
                "sender": msg.sender.name if msg.sender else "Unknown",
                "content": content,
                "timestamp": int(msg.created_at.timestamp())
            })
        
        return context
    
    @staticmethod
    def _create_event(
        db: Session,
        webhook_data: IMMessageWebhookRequest,
        session: SessionModel,
        message: Message,
        context_messages: list[dict],
        user_id: UUID
    ) -> Event:
        """创建 Event"""
        event = Event(
            user_id=user_id,
            type="im_message",
            raw_data={
                "webhook_data": webhook_data.model_dump(),
                "session_id": str(session.id),
                "message_id": str(message.id),
                "context_messages": context_messages
            }
        )
        db.add(event)
        db.flush()
        return event
    
    @staticmethod
    def _create_activity(
        db: Session,
        suggestion,
        event: Event,
        user_id: UUID
    ) -> Activity:
        """根据 Agent 建议创建 Activity"""
        activity = Activity(
            user_id=user_id,
            type=suggestion.activity_type or "notification",
            name=suggestion.activity_name or "新消息",
            priority=suggestion.priority or 3,
            comments=suggestion.comments or suggestion.reasoning,
            tags=suggestion.tags or ["im_message", "auto-created"],
            source_type="event",
            source_id=str(event.id),
            status="pending"
        )
        
        # 如果有截止时间提示，添加到 comments
        if suggestion.due_date_hint:
            activity.comments = f"{activity.comments}\n\n截止时间提示: {suggestion.due_date_hint}"
        
        db.add(activity)
        db.flush()
        return activity
