from uuid import UUID
from sqlalchemy.orm import Session
from typing import Optional

from app.db.model.event import Event


class EventService:
    """Event服务类，处理Event相关的业务逻辑"""
    
    @staticmethod
    def get_event(db: Session, event_id: UUID, user_id: UUID) -> Optional[Event]:
        """根据ID获取Event（带用户隔离）"""
        return db.query(Event).filter(
            Event.id == event_id,
            Event.user_id == user_id,
            Event.is_deleted == False
        ).first()
    
    @staticmethod
    def get_all_events(db: Session, user_id: UUID, include_deleted: bool = False) -> list[Event]:
        """获取所有Event（带用户隔离）"""
        query = db.query(Event).filter(Event.user_id == user_id)
        if not include_deleted:
            query = query.filter(Event.is_deleted == False)
        return query.order_by(Event.created_at.desc()).all()