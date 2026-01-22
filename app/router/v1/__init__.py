from fastapi import APIRouter
from .experimental import router as experimental_router
from .activity import router as activity_router
from .event import router as event_router
from .session import router as session_router
from .auth import router as auth_router
from .sync import router as sync_router
from .api_key import router as api_key_router
from .webhook import router as webhook_router

router = APIRouter()
router.include_router(experimental_router, prefix="", tags=["v1"])
router.include_router(activity_router, prefix="", tags=["activities"])
router.include_router(event_router, prefix="", tags=["events"])
router.include_router(session_router, prefix="", tags=["sessions"])
router.include_router(auth_router, prefix="", tags=["auth"])
router.include_router(sync_router, prefix="", tags=["sync"])
router.include_router(api_key_router, prefix="", tags=["api-key"])
router.include_router(webhook_router, prefix="", tags=["webhooks"])