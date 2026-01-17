from fastapi import APIRouter
from sqlalchemy.orm import Session

from loguru import logger

from fastapi import Depends
from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.schema.event import PingEventRequest
from app.db.model.event import Event
from app.service.activity import ActivityService

router = APIRouter(prefix="/events")


@router.post("/ping")
def ping_event(request: PingEventRequest, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    '''
    Ping Event 接口，用于发送测试事件
    当创建 ping event 时，会自动创建一个对应的 ping 类型的 activity
    
    :param request: 说明
    :type request: PingEventRequest
    :param db: 说明
    :type db: Session
    '''
    logger.info(f"Received ping event: {request.model_dump()}")

    # 创建 Event 记录
    event = Event(
        type="ping",
        raw_data=request.model_dump()
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    logger.info(f"Created event: id={event.id}, type={event.type}")
    
    # 自动创建对应的 ping activity
    activity = ActivityService.create_activity_from_event(
        db=db,
        event_id=event.id,
        event_type="ping",
        event_data=request.model_dump()
    )
    
    logger.info(f"Auto-created activity: id={activity.id}, name={activity.name}")
    
    return {
        "event": {
            "type": event.type, 
            "raw_data": event.raw_data, 
            "id": event.id
        },
        "activity": {
            "id": activity.id,
            "name": activity.name,
            "type": activity.type,
            "source_type": activity.source_type,
            "source_id": activity.source_id,
            "priority": activity.priority,
            "tags": activity.tags
        }
    }

@router.get("")
def get_events(db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    '''
    获取所有事件记录
    
    :param db: 说明
    :type db: Session
    '''
    events = db.query(Event).all()
    return [{"id": event.id, "type": event.type, "raw_data": event.raw_data, "created_at": event.created_at} for event in events]