from uuid import UUID
from sqlalchemy.orm import Session
from typing import Optional

from app.db.model.event import Event


class EventService:
    """Event服务类，处理Event相关的业务逻辑"""
    
    @staticmethod
    def get_event(db: Session, event_id: UUID) -> Optional[Event]:
        """根据ID获取Event"""
        return db.query(Event).filter(
            Event.id == event_id,
            Event.is_deleted == False
        ).first()
    
    @staticmethod
    def get_all_events(db: Session, include_deleted: bool = False) -> list[Event]:
        """获取所有Event"""
        query = db.query(Event)
        if not include_deleted:
            query = query.filter(Event.is_deleted == False)
        return query.all()