from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional

from app.db.session import get_db
from app.schema.event import EventResponse
from app.schema.base import BaseResponse
from app.service.event import EventService

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/{event_id}", response_model=BaseResponse[EventResponse], summary="根据ID获取事件详情")
def get_event(
    event_id: UUID,
    db: Session = Depends(get_db)
):
    """根据event_id获取事件详情"""
    event = EventService.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    
    return BaseResponse(
        code="200",
        message="获取成功",
        data=EventResponse.model_validate(event)
    )


@router.get("", response_model=BaseResponse[list[EventResponse]], summary="获取事件列表")
def get_events(
    include_deleted: bool = Query(False, description="是否包含已删除的事件"),
    db: Session = Depends(get_db)
):
    """获取所有事件列表"""
    events = EventService.get_all_events(db, include_deleted=include_deleted)
    
    return BaseResponse(
        code="200",
        message="获取成功",
        data=[EventResponse.model_validate(event) for event in events]
    )