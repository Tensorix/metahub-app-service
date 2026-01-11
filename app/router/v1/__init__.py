from fastapi import APIRouter
from .experimental import router as experimental_router
from .activity import router as activity_router

router = APIRouter()
router.include_router(experimental_router, prefix="", tags=["v1"])
router.include_router(activity_router, prefix="", tags=["activities"])