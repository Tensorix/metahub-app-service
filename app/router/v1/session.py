from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from math import ceil
from loguru import logger

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

router = APIRouter()


# ============ Session APIs ============
@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED, summary="创建会话")
def create_session(data: SessionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        session = SessionService.create_session(db, data, current_user.id)
        resp = SessionResponse.model_validate(session)
        resp.unread_count = 0
        return resp
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.get("/sessions/{session_id}", response_model=SessionResponse, summary="获取会话详情")
def get_session(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = SessionService.get_unread_count(db, session_id, current_user.id)
    return resp


@router.get("/sessions", response_model=SessionListResponse, summary="获取会话列表")
def get_sessions(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    is_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = SessionListQuery(page=page, size=size, type=type, source=source, is_deleted=is_deleted)
    sessions, total = SessionService.get_sessions(db, query, current_user.id)
    pages = ceil(total / size) if total > 0 else 0
    
    items = []
    for s in sessions:
        resp = SessionResponse.model_validate(s)
        resp.unread_count = SessionService.get_unread_count(db, s.id, current_user.id)
        items.append(resp)
    
    return SessionListResponse(items=items, total=total, page=page, size=size, pages=pages)


@router.put("/sessions/{session_id}", response_model=SessionResponse, summary="更新会话")
def update_session(session_id: UUID, data: SessionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = SessionService.update_session(db, session_id, data, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = SessionService.get_unread_count(db, session_id, current_user.id)
    return resp


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除会话")
def delete_session(
    session_id: UUID,
    hard_delete: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    success = SessionService.delete_session(db, session_id, current_user.id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")


@router.post("/sessions/{session_id}/read", response_model=SessionResponse, summary="标记会话已读")
def mark_session_read(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = SessionService.mark_as_read(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    resp = SessionResponse.model_validate(session)
    resp.unread_count = 0
    return resp


# ============ Topic APIs ============
@router.post("/sessions/{session_id}/topics", response_model=TopicResponse, status_code=status.HTTP_201_CREATED, summary="创建话题")
def create_topic(session_id: UUID, data: TopicCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.session_id != session_id:
        raise HTTPException(status_code=400, detail="session_id 不匹配")
    
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    topic = TopicService.create_topic(db, data, current_user.id)
    return TopicResponse.model_validate(topic)


@router.get("/sessions/{session_id}/topics", response_model=list[TopicResponse], summary="获取会话话题列表")
def get_topics(session_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    topics = TopicService.get_topics_by_session(db, session_id, current_user.id)
    return [TopicResponse.model_validate(t) for t in topics]


@router.put("/topics/{topic_id}", response_model=TopicResponse, summary="更新话题")
def update_topic(topic_id: UUID, data: TopicUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    topic = TopicService.update_topic(db, topic_id, data, current_user.id)
    if not topic:
        raise HTTPException(status_code=404, detail="话题不存在")
    return TopicResponse.model_validate(topic)


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除话题")
def delete_topic(topic_id: UUID, hard_delete: bool = Query(False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    success = TopicService.delete_topic(db, topic_id, current_user.id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="话题不存在")


# ============ Message APIs ============

def _index_message_background(message_id: UUID):
    """后台任务：为消息创建搜索索引和embedding"""
    try:
        from app.db.session import SessionLocal
        from app.service.search_indexer import SearchIndexerService
        from app.service.session import MessageService
        
        db = SessionLocal()
        try:
            message = MessageService.get_message(db, message_id)
            if message:
                indexer = SearchIndexerService()
                indexer.index_message(db, message)
                logger.info(f"Successfully indexed message {message_id}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to index message {message_id} in background: {e}")


@router.post("/sessions/{session_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED, summary="添加消息")
def create_message(
    session_id: UUID, 
    data: MessageCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if data.session_id != session_id:
        raise HTTPException(status_code=400, detail="session_id 不匹配")
    
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    message = MessageService.create_message(db, data, current_user.id)
    
    # 添加后台任务：异步创建搜索索引和embedding
    background_tasks.add_task(_index_message_background, message.id)
    
    return MessageResponse.model_validate(message)


@router.get("/sessions/{session_id}/messages", response_model=MessageListResponse, summary="获取消息列表")
def get_messages(
    session_id: UUID,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    topic_id: Optional[UUID] = Query(None),
    role: Optional[str] = Query(None),
    is_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 验证会话所有权
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    query = MessageListQuery(page=page, size=size, topic_id=topic_id, role=role, is_deleted=is_deleted)
    messages, total = MessageService.get_messages(db, session_id, query)
    pages = ceil(total / size) if total > 0 else 0
    
    # 构建响应，包含 sender 信息
    items = []
    for m in messages:
        msg_resp = MessageResponse.model_validate(m)
        # 如果有 sender_id，添加 sender 信息
        if m.sender:
            msg_resp.sender = MessageSenderResponse.model_validate(m.sender)
        items.append(msg_resp)
    
    return MessageListResponse(
        items=items,
        total=total, page=page, size=size, pages=pages
    )


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除消息")
def delete_message(message_id: UUID, hard_delete: bool = Query(False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    success = MessageService.delete_message(db, message_id, soft_delete=not hard_delete)
    if not success:
        raise HTTPException(status_code=404, detail="消息不存在")


# ============ Search Index APIs ============

from app.schema.search_index import (
    SearchIndexStatsResponse,
    SessionSearchIndexStatsResponse,
    ReindexRequest,
    ReindexResponse,
    BackfillEmbeddingsRequest,
    BackfillEmbeddingsResponse,
)
from app.service.search_indexer import SearchIndexerService


@router.get(
    "/search-index/stats",
    response_model=SearchIndexStatsResponse,
    summary="获取用户搜索索引统计",
    description="获取当前用户的搜索索引整体统计信息",
)
def get_user_search_index_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取用户搜索索引统计"""
    indexer = SearchIndexerService()
    stats = indexer.get_stats(db, current_user.id)
    return SearchIndexStatsResponse(**stats)


@router.get(
    "/sessions/{session_id}/search-index/stats",
    response_model=SessionSearchIndexStatsResponse,
    summary="获取会话搜索索引统计",
    description="获取指定会话的搜索索引统计信息",
)
def get_session_search_index_stats(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取会话搜索索引统计"""
    # 验证会话所有权
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    from app.db.model.message import Message
    from app.db.model.message_search_index import MessageSearchIndex
    from app.db.model.message_embedding import MessageEmbedding
    
    # 查询会话消息总数
    total_messages = db.query(Message).filter(
        Message.session_id == session_id,
        Message.is_deleted == False,
    ).count()
    
    # 查询已索引消息数
    indexed_messages = db.query(MessageSearchIndex).filter(
        MessageSearchIndex.session_id == session_id,
    ).count()
    
    # 查询有 embedding 的数量
    embedding_completed = db.query(MessageEmbedding).join(
        MessageSearchIndex,
        MessageEmbedding.search_index_id == MessageSearchIndex.id,
    ).filter(
        MessageSearchIndex.session_id == session_id,
        MessageEmbedding.status == "completed",
    ).count()
    
    no_embedding = indexed_messages - embedding_completed
    index_coverage = indexed_messages / total_messages if total_messages > 0 else 0
    
    return SessionSearchIndexStatsResponse(
        session_id=str(session_id),
        total_messages=total_messages,
        indexed_messages=indexed_messages,
        embedding_completed=embedding_completed,
        no_embedding=no_embedding,
        index_coverage=round(index_coverage, 4),
    )


@router.post(
    "/sessions/{session_id}/search-index/reindex",
    response_model=ReindexResponse,
    summary="重建会话搜索索引",
    description="为会话中未索引的消息创建搜索索引。可选择跳过 embedding 生成以节省成本",
)
def reindex_session(
    session_id: UUID,
    request: ReindexRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重建会话搜索索引"""
    # 验证会话所有权
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    try:
        indexer = SearchIndexerService()
        stats = indexer.reindex(
            db=db,
            user_id=current_user.id,
            session_id=session_id,
            regenerate_embeddings=request.regenerate_embeddings,
            skip_embedding=request.skip_embedding,
        )
        return ReindexResponse(**stats)
    except Exception as e:
        logger.error(f"Reindex session {session_id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"重建索引失败: {str(e)}")


@router.post(
    "/search-index/reindex",
    response_model=ReindexResponse,
    summary="重建用户所有搜索索引",
    description="为用户所有会话中未索引的消息创建搜索索引",
)
def reindex_all(
    request: ReindexRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重建用户所有搜索索引"""
    try:
        indexer = SearchIndexerService()
        stats = indexer.reindex(
            db=db,
            user_id=current_user.id,
            regenerate_embeddings=request.regenerate_embeddings,
            skip_embedding=request.skip_embedding,
        )
        return ReindexResponse(**stats)
    except Exception as e:
        logger.error(f"Reindex all for user {current_user.id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"重建索引失败: {str(e)}")


@router.post(
    "/sessions/{session_id}/search-index/backfill-embeddings",
    response_model=BackfillEmbeddingsResponse,
    summary="补建会话 embedding",
    description="为会话中已有文本索引但缺少 embedding 的记录补建向量索引",
)
def backfill_session_embeddings(
    session_id: UUID,
    request: BackfillEmbeddingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """补建会话 embedding"""
    # 验证会话所有权
    session = SessionService.get_session(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    try:
        indexer = SearchIndexerService()
        stats = indexer.backfill_embeddings(
            db=db,
            user_id=current_user.id,
            session_id=session_id,
            batch_size=request.batch_size,
        )
        return BackfillEmbeddingsResponse(**stats)
    except Exception as e:
        logger.error(f"Backfill embeddings for session {session_id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"补建 embedding 失败: {str(e)}")


@router.post(
    "/search-index/backfill-embeddings",
    response_model=BackfillEmbeddingsResponse,
    summary="补建用户所有 embedding",
    description="为用户所有已有文本索引但缺少 embedding 的记录补建向量索引",
)
def backfill_all_embeddings(
    request: BackfillEmbeddingsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """补建用户所有 embedding"""
    try:
        indexer = SearchIndexerService()
        stats = indexer.backfill_embeddings(
            db=db,
            user_id=current_user.id,
            batch_size=request.batch_size,
        )
        return BackfillEmbeddingsResponse(**stats)
    except Exception as e:
        logger.error(f"Backfill all embeddings for user {current_user.id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"补建 embedding 失败: {str(e)}")

