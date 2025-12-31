from fastapi import APIRouter
from .user import router as user_router
from .v1 import router as v1_router

api_router = APIRouter()
# api_router.include_router(user_router, prefix="", tags=["user"])
api_router.include_router(v1_router, prefix="/v1", tags=["v1"])