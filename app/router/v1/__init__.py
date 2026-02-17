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
from .mcp_server import router as mcp_server_router
from .im_gateway import router as im_gateway_router
from .filesystem import router as filesystem_router
from .knowledge import router as knowledge_router
from .admin_embedding import router as admin_embedding_router
from .tools import router as tools_router
from .session_transfer import router as session_transfer_router
from .background_task import router as background_task_router
from .scheduled_task import router as scheduled_task_router

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
router.include_router(mcp_server_router, prefix="", tags=["mcp-servers"])
router.include_router(im_gateway_router, prefix="", tags=["im-gateway"])
router.include_router(filesystem_router, prefix="", tags=["filesystem"])
router.include_router(knowledge_router, prefix="", tags=["knowledge"])
router.include_router(admin_embedding_router, prefix="", tags=["admin-embedding"])
router.include_router(tools_router, prefix="", tags=["tools"])
router.include_router(session_transfer_router, prefix="", tags=["session-transfer"])
router.include_router(background_task_router, prefix="", tags=["background-tasks"])
router.include_router(scheduled_task_router, prefix="", tags=["scheduled-tasks"])