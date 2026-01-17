from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from math import ceil

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.session import (
    SessionService, TopicService, MessageService, 
    MessageSenderService, AgentService
)
from app.schema.session import (
    SessionCreate, SessionUpdate, SessionResponse, SessionListQuery, SessionListResponse,
    TopicCreate, TopicUpdate, TopicResponse,
    MessageCreate, MessageResponse, MessageListQuery, MessageListResponse,
    MessageSenderCreate, MessageSenderResponse,
    AgentCreate, AgentUpdate, AgentResponse,
)
from app.schema.base import BaseResponse

router = APIRouter()


# ============ Session APIs ============
@router.post("/sessions", response_model=BaseResponse[SessionResponse], summary="创建会话")
def create_session(data: SessionCreate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    try:
        session = SessionService.create_session(db, data)
        resp = SessionResponse.model_validate(session)
        resp.unread_count = 0
        return BaseResponse(code="200", message="创建成功", data=resp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.get("/sessions/{session_id}", response_model=BaseResponse[SessionResponse], summary="获取会话详情")
def get_session(session_id: UUID, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    session = SessionService.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = SessionService.get_unread_count(db, session_id)
    return BaseResponse(code="200", message="获取成功", data=resp)


@router.get("/sessions", response_model=BaseResponse[SessionListResponse], summary="获取会话列表")
def get_sessions(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    is_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user)
):
    query = SessionListQuery(page=page, size=size, type=type, source=source, is_deleted=is_deleted)
    sessions, total = SessionService.get_sessions(db, query)
    pages = ceil(total / size) if total > 0 else 0
    
    items = []
    for s in sessions:
        resp = SessionResponse.model_validate(s)
        resp.unread_count = SessionService.get_unread_count(db, s.id)
        items.append(resp)
    
    return BaseResponse(
        code="200", message="获取成功",
        data=SessionListResponse(items=items, total=total, page=page, size=size, pages=pages)
    )


@router.put("/sessions/{session_id}", response_model=BaseResponse[SessionResponse], summary="更新会话")
def update_session(session_id: UUID, data: SessionUpdate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    session = SessionService.update_session(db, session_id, data)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = SessionService.get_unread_count(db, session_id)
    return BaseResponse(code="200", message="更新成功", data=resp)


@router.delete("/sessions/{session_id}", response_model=BaseResponse[None], summary="删除会话")
def delete_session(
    session_id: UUID,
    hard_delete: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user)
):
    success = SessionService.delete_session(db, session_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return BaseResponse(code="200", message="删除成功")


@router.post("/sessions/{session_id}/read", response_model=BaseResponse[SessionResponse], summary="标记会话已读")
def mark_session_read(session_id: UUID, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    session = SessionService.mark_as_read(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = 0
    return BaseResponse(code="200", message="标记成功", data=resp)


# ============ Topic APIs ============
@router.post("/sessions/{session_id}/topics", response_model=BaseResponse[TopicResponse], summary="创建话题")
def create_topic(session_id: UUID, data: TopicCreate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    if data.session_id != session_id:
        raise HTTPException(status_code=400, detail="session_id 不匹配")
    
    session = SessionService.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    topic = TopicService.create_topic(db, data)
    return BaseResponse(code="200", message="创建成功", data=TopicResponse.model_validate(topic))


@router.get("/sessions/{session_id}/topics", response_model=BaseResponse[list[TopicResponse]], summary="获取会话话题列表")
def get_topics(session_id: UUID, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    topics = TopicService.get_topics_by_session(db, session_id)
    return BaseResponse(
        code="200", message="获取成功",
        data=[TopicResponse.model_validate(t) for t in topics]
    )


@router.put("/topics/{topic_id}", response_model=BaseResponse[TopicResponse], summary="更新话题")
def update_topic(topic_id: UUID, data: TopicUpdate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    topic = TopicService.update_topic(db, topic_id, data)
    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")
    return BaseResponse(code="200", message="更新成功", data=TopicResponse.model_validate(topic))


@router.delete("/topics/{topic_id}", response_model=BaseResponse[None], summary="删除话题")
def delete_topic(topic_id: UUID, hard_delete: bool = Query(False), db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    success = TopicService.delete_topic(db, topic_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="话题不存在")
    return BaseResponse(code="200", message="删除成功")


# ============ Message APIs ============
@router.post("/sessions/{session_id}/messages", response_model=BaseResponse[MessageResponse], summary="添加消息")
def create_message(session_id: UUID, data: MessageCreate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    if data.session_id != session_id:
        raise HTTPException(status_code=400, detail="session_id 不匹配")
    
    session = SessionService.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    message = MessageService.create_message(db, data)
    return BaseResponse(code="200", message="添加成功", data=MessageResponse.model_validate(message))


@router.get("/sessions/{session_id}/messages", response_model=BaseResponse[MessageListResponse], summary="获取消息列表")
def get_messages(
    session_id: UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    topic_id: Optional[UUID] = Query(None),
    role: Optional[str] = Query(None),
    is_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user)
):
    query = MessageListQuery(page=page, size=size, topic_id=topic_id, role=role, is_deleted=is_deleted)
    messages, total = MessageService.get_messages(db, session_id, query)
    pages = ceil(total / size) if total > 0 else 0
    
    return BaseResponse(
        code="200", message="获取成功",
        data=MessageListResponse(
            items=[MessageResponse.model_validate(m) for m in messages],
            total=total, page=page, size=size, pages=pages
        )
    )


@router.delete("/messages/{message_id}", response_model=BaseResponse[None], summary="删除消息")
def delete_message(message_id: UUID, hard_delete: bool = Query(False), db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    success = MessageService.delete_message(db, message_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="消息不存在")
    return BaseResponse(code="200", message="删除成功")


# ============ Agent APIs ============
@router.post("/agents", response_model=BaseResponse[AgentResponse], summary="创建 Agent")
def create_agent(data: AgentCreate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    agent = AgentService.create_agent(db, data)
    return BaseResponse(code="200", message="创建成功", data=AgentResponse.model_validate(agent))


@router.get("/agents/{agent_id}", response_model=BaseResponse[AgentResponse], summary="获取 Agent 详情")
def get_agent(agent_id: UUID, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    agent = AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return BaseResponse(code="200", message="获取成功", data=AgentResponse.model_validate(agent))


@router.get("/agents", response_model=BaseResponse[list[AgentResponse]], summary="获取 Agent 列表")
def get_agents(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user)
):
    agents, _ = AgentService.get_agents(db, page, size)
    return BaseResponse(
        code="200", message="获取成功",
        data=[AgentResponse.model_validate(a) for a in agents]
    )


@router.put("/agents/{agent_id}", response_model=BaseResponse[AgentResponse], summary="更新 Agent")
def update_agent(agent_id: UUID, data: AgentUpdate, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    agent = AgentService.update_agent(db, agent_id, data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return BaseResponse(code="200", message="更新成功", data=AgentResponse.model_validate(agent))


@router.delete("/agents/{agent_id}", response_model=BaseResponse[None], summary="删除 Agent")
def delete_agent(agent_id: UUID, hard_delete: bool = Query(False), db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)):
    success = AgentService.delete_agent(db, agent_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="Agent 不存在")
    return BaseResponse(code="200", message="删除成功")
