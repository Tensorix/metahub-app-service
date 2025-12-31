from fastapi import APIRouter
from .event import router as event_router

router = APIRouter()
router.include_router(event_router, prefix="/experimental")