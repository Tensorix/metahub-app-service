# Step 4: 注册 Router

**文件**: `app/router/v1/__init__.py`（修改）

## 变更

在现有 router 注册列表末尾新增 2 行：

```python
from .im_gateway import router as im_gateway_router  # 新增
```

```python
router.include_router(im_gateway_router, prefix="", tags=["im-gateway"])  # 新增
```

## 完整文件

```python
from fastapi import APIRouter
from .experimental import router as experimental_router
from .activity import router as activity_router
from .event import router as event_router
from .session import router as session_router
from .auth import router as auth_router
from .sync import router as sync_router
from .api_key import router as api_key_router
from .webhook import router as webhook_router
from .agent_chat import router as agent_chat_router
from .agent import router as agent_router
from .im_gateway import router as im_gateway_router      # +

router = APIRouter()
router.include_router(experimental_router, prefix="", tags=["v1"])
router.include_router(activity_router, prefix="", tags=["activities"])
router.include_router(event_router, prefix="", tags=["events"])
router.include_router(session_router, prefix="", tags=["sessions"])
router.include_router(auth_router, prefix="", tags=["auth"])
router.include_router(sync_router, prefix="", tags=["sync"])
router.include_router(api_key_router, prefix="", tags=["api-key"])
router.include_router(webhook_router, prefix="", tags=["webhooks"])
router.include_router(agent_chat_router, prefix="", tags=["agent-chat"])
router.include_router(agent_router, prefix="", tags=["agents"])
router.include_router(im_gateway_router, prefix="", tags=["im-gateway"])  # +
```

## URL 路径映射

Router 前缀链：`/api`（api.py）→ `/v1`（router/__init__.py）→ `""`（im_gateway）

最终端点：

| 端点定义 | 完整路径 |
|----------|----------|
| `WS /im/gateway` | `ws://host/api/v1/im/gateway?token=xxx&source=astr_qq` |
| `POST /sessions/{id}/messages/send` | `POST /api/v1/sessions/{id}/messages/send` |
| `GET /im/gateway/status` | `GET /api/v1/im/gateway/status` |
