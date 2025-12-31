from fastapi import APIRouter
from .experimental import router as user_router

router = APIRouter()
router.include_router(user_router, prefix="", tags=["v1"])