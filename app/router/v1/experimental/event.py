from fastapi import APIRouter
from sqlalchemy.orm import Session

from loguru import logger

from fastapi import Depends
from app.db.session import get_db
from app.schema.event import PingEventRequest
from app.db.model.event import Event

router = APIRouter(prefix="/event")


@router.post("/ping")
def ping_event(request: PingEventRequest, db: Session = Depends(get_db)):
    '''
    Ping Event 接口，用于发送测试事件
    
    :param request: 说明
    :type request: PingEventRequest
    :param db: 说明
    :type db: Session
    '''
    logger.info(f"Received ping event: {request.model_dump()}")

    # 创建 Event 记录
    event = Event(
        type="ping",
        data=request.model_dump()
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    
    logger.info(f"Created event: id={event.id}, type={event.type}")
    return {"type": event.type, "data": event.data, "id": event.id}
