from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.db.session import get_db
from app.db.model.user import User
from app.deps import get_current_user
from app.service.session_transfer import SessionTransferService
from app.schema.session_transfer import (
    BatchExportRequest,
    SessionImportResponse,
    ImportPreviewResponse,
)

router = APIRouter(tags=["Session Transfer"])


@router.get(
    "/sessions/{session_id}/export",
    summary="导出单个会话",
    description="导出指定会话的完整数据，支持增量导出",
)
async def export_session(
    session_id: UUID,
    format: str = Query("json", description="导出格式: json / jsonl"),
    include_deleted: bool = Query(False, description="是否包含已删除消息"),
    start_date: Optional[datetime] = Query(None, description="增量导出起始时间"),
    end_date: Optional[datetime] = Query(None, description="增量导出结束时间"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出单个会话数据"""
    result = await SessionTransferService.export_session(
        db=db,
        session_id=session_id,
        user_id=current_user.id,
        format=format,
        include_deleted=include_deleted,
        start_date=start_date,
        end_date=end_date,
    )
    
    if result is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    return StreamingResponse(
        result["stream"],
        media_type=result["media_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{result["filename"]}"'
        }
    )


@router.post(
    "/sessions/export/batch",
    summary="批量导出会话",
    description="批量导出多个会话，按类型分组，支持增量导出",
)
async def export_sessions_batch(
    request: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量导出会话数据"""
    try:
        result = await SessionTransferService.export_batch(
            db=db,
            user_id=current_user.id,
            session_ids=request.session_ids,
            type_filter=request.type_filter,
            format=request.format,
            include_deleted=request.include_deleted,
            start_date=request.start_date,
            end_date=request.end_date,
            group_by_type=request.group_by_type,
        )
        
        return StreamingResponse(
            result["stream"],
            media_type=result["media_type"],
            headers={
                "Content-Disposition": f'attachment; filename="{result["filename"]}"'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/sessions/import",
    response_model=SessionImportResponse,
    summary="导入会话",
    description="从导出文件导入会话数据，支持 JSON/JSONL/ZIP 格式",
)
async def import_session(
    file: UploadFile = File(..., description="导出文件"),
    format: str = Query("auto", description="导入格式，auto 自动检测"),
    merge_senders: bool = Query(True, description="是否合并同名发送者"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导入会话数据"""
    try:
        result = await SessionTransferService.import_sessions(
            db=db,
            file=file,
            user_id=current_user.id,
            format=format,
            merge_senders=merge_senders,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")


@router.post(
    "/sessions/import/preview",
    response_model=ImportPreviewResponse,
    summary="预览导入",
    description="预览导入文件内容，检查重复导入，不实际执行导入",
)
async def preview_import(
    file: UploadFile = File(..., description="导出文件"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """预览导入文件"""
    try:
        result = await SessionTransferService.preview_import(
            db=db,
            file=file,
            user_id=current_user.id,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
