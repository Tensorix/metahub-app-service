from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from loguru import logger

from app.db.init_db import init_db
from app.router import api_router

from app import config

@asynccontextmanager
async def lifespan(app: FastAPI):
    # init_db() # 如果使用 Alembic 管理迁移，就不需要在这里初始化数据库了
    yield


app = FastAPI(
    title="Metahub App Service API",
    version="0.1.0",
    description="An app service for MetaHub project",
    docs_url="/docs",        # Swagger UI
    redoc_url="/redoc",      # ReDoc 文档
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS 配置：开发环境全开放，生产需要改为具体域名白名单
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # 生产环境需要改为 ["https://your.domain"]
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
)

app.include_router(api_router, prefix=f"/api")

@app.get("/health", summary="健康检查", tags=["system"])
def health():
    # return {"status": "ok"}
    try:
        from app.db.session import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error(e)
        return {"status": "degraded", "database": "disconnected"}


app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    if full_path is None or full_path == "":
        full_path = "index.html"
    index_path = os.path.join("frontend", "dist", full_path)
    if not os.path.isfile(index_path):
        index_path = os.path.join("frontend", "dist", "index.html")
    return FileResponse(index_path)


