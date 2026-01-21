from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.sync import SyncService
from app.schema.sync import (
    SyncRequest, SyncResponse,
    PullSyncRequest, PullSyncResponse,
)

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/batch", response_model=SyncResponse, summary="批量同步 Activity/Session/Topic/Message")
def sync_batch(
    request: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    批量同步 Activity、Session、Topic、Message 的创建、更新、删除操作
    
    支持的操作：
    - create: 创建新记录
    - update: 更新现有记录（支持版本控制）
    - delete: 删除记录（软删除）
    
    版本控制：
    - 使用乐观锁机制，通过 version 字段防止并发冲突
    - 客户端提供 version 字段，服务器验证版本号
    - 每次更新操作会自动递增版本号
    
    冲突解决策略：
    - server_wins: 服务器优先，客户端数据过期时不更新
    - client_wins: 客户端优先，强制覆盖服务器数据
    - fail: 检测到冲突时操作失败
    
    用户隔离：
    - 所有操作自动限制在当前登录用户的数据范围内
    - 无法访问或修改其他用户的数据
    
    Message 特殊说明：
    - Message 包含 MessagePart 子对象（消息内容部分）
    - 创建 Message 时必须提供 parts 数组
    - 更新 Message 时如果提供 parts，会替换所有现有的 parts
    - Message 会自动关联到 user_id（通过 session 验证）
    
    示例请求：
    ```json
    {
      "activities": [...],
      "sessions": [...],
      "topics": [...],
      "messages": [
        {
          "operation": "create",
          "session_id": "uuid-here",
          "topic_id": "uuid-here",
          "role": "user",
          "parts": [
            {
              "type": "text",
              "content": "消息内容"
            }
          ]
        },
        {
          "operation": "update",
          "id": "uuid-here",
          "role": "assistant",
          "version": 2,
          "parts": [
            {
              "type": "text",
              "content": "更新后的内容"
            }
          ]
        }
      ],
      "conflict_strategy": "server_wins"
    }
    ```
    """
    try:
        response = SyncService.sync_batch(db, request, current_user.id)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"同步失败: {str(e)}"
        )


@router.post("/pull", response_model=PullSyncResponse, summary="增量拉取变更数据")
def pull_changes(
    request: PullSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    增量拉取服务器端的变更数据
    
    用于客户端定期同步服务器数据，支持：
    - 基于时间戳的增量拉取
    - 可选择拉取的实体类型
    - 分页控制
    - 用户数据隔离（仅返回当前用户的数据）
    
    返回数据包含版本号，用于后续的版本控制
    
    示例请求：
    ```json
    {
      "last_sync_at": "2024-01-01T00:00:00Z",
      "include_activities": true,
      "include_sessions": true,
      "include_topics": true,
      "include_messages": true,
      "limit": 1000
    }
    ```
    
    响应包含：
    - 变更的数据列表（包括新增、更新、删除）
    - 每条数据的 version 字段
    - Message 包含完整的 parts 数组
    - has_more: 是否还有更多数据
    - next_cursor: 下次拉取的时间游标
    """
    try:
        response = SyncService.pull_changes(db, request, current_user.id)
        return response
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"拉取失败: {str(e)}"
        )
