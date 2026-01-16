from fastapi import APIRouter
from .experimental import router as experimental_router
from .activity import router as activity_router
from .event import router as event_router
from .session import router as session_router

router = APIRouter()
router.include_router(experimental_router, prefix="", tags=["v1"])
router.include_router(activity_router, prefix="", tags=["activities"])
router.include_router(event_router, prefix="", tags=["events"])
router.include_router(session_router, prefix="", tags=["sessions"])