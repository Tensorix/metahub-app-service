# 步骤 2：后端 API 设计

## API 端点概览

| 方法 | 端点 | 说明 |
|-----|------|------|
| GET | `/sessions/{session_id}/export` | 导出单个会话 |
| POST | `/sessions/export/batch` | 批量导出多个会话 |
| POST | `/sessions/import` | 导入会话 |
| POST | `/sessions/import/preview` | 预览导入内容 |

---

## 一、单会话导出 API

```http
GET /api/v1/sessions/{session_id}/export
```

**功能**：导出指定会话的完整数据

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|------|
| session_id | path | UUID | ✅ | 会话 ID |
| format | query | string | ❌ | 导出格式：`json`(默认) / `jsonl` |
| include_deleted | query | bool | ❌ | 是否包含已删除消息，默认 `false` |
| start_date | query | datetime | ❌ | 增量导出起始时间（ISO 8601） |
| end_date | query | datetime | ❌ | 增量导出结束时间（ISO 8601） |

**响应**：

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Disposition: attachment; filename="session_ai_xxx_20260201.json"

{
  "format": "metahub",
  "version": "1.0",
  "export_id": "export_20260201_143000_abc123",
  ...
}
```

---

## 二、批量导出 API

```http
POST /api/v1/sessions/export/batch
```

**功能**：批量导出多个会话，按类型分组

**请求体**：

```json
{
  "session_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "format": "jsonl",
  "include_deleted": false,
  "start_date": "2026-01-01T00:00:00Z",
  "end_date": "2026-02-01T00:00:00Z",
  "group_by_type": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| session_ids | array[UUID] | ❌ | 要导出的会话 ID 列表，为空则导出全部 |
| type_filter | array[string] | ❌ | 按类型筛选：`["ai", "pm"]` |
| format | string | ❌ | 导出格式：`jsonl`(默认) / `json` |
| include_deleted | bool | ❌ | 是否包含已删除消息 |
| start_date | datetime | ❌ | 增量导出起始时间 |
| end_date | datetime | ❌ | 增量导出结束时间 |
| group_by_type | bool | ❌ | 是否按类型分组，默认 `true` |

**响应**：

当 `group_by_type=true` 时，返回 ZIP 包：

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="sessions_export_20260201.zip"

[ZIP binary data]
```

ZIP 包内容：
```
sessions_export_20260201/
├── sessions_ai_20260201.jsonl
├── sessions_pm_20260201.jsonl
├── sessions_group_20260201.jsonl
└── manifest.json
```

当 `group_by_type=false` 时，返回单个 JSONL 文件：

```http
HTTP/1.1 200 OK
Content-Type: application/jsonl
Content-Disposition: attachment; filename="sessions_export_all_20260201.jsonl"
```

---

## 三、导入 API

```http
POST /api/v1/sessions/import
```

**功能**：从文件导入会话数据

**请求参数**：

| 参数 | 位置 | 类型 | 必填 | 说明 |
|-----|------|-----|-----|------|
| file | body | File | ✅ | 上传的导出文件（.json/.jsonl/.zip） |
| format | query | string | ❌ | 导入格式，默认 `auto`（自动检测） |
| merge_senders | query | bool | ❌ | 是否合并同名发送者，默认 `true` |

**请求示例**：

```http
POST /api/v1/sessions/import?merge_senders=true
Content-Type: multipart/form-data

file: [binary data]
```

**响应**：

```json
{
  "success": true,
  "imported_sessions": [
    {
      "session_id": "new-uuid-1",
      "original_id": "old-uuid-1",
      "name": "导入的会话1",
      "type": "ai",
      "statistics": {
        "imported_messages": 150,
        "imported_topics": 3,
        "imported_senders": 5,
        "merged_senders": 2
      }
    }
  ],
  "total_statistics": {
    "total_sessions": 3,
    "total_messages": 450,
    "total_topics": 8,
    "total_senders": 10,
    "merged_senders": 5
  }
}
```

---

## 四、导入预览 API

```http
POST /api/v1/sessions/import/preview
```

**功能**：预览导入内容，不实际执行

**响应**：

```json
{
  "valid": true,
  "format": "metahub",
  "version": "1.0",
  "export_id": "export_20260201_143000_abc123",
  "sessions": [
    {
      "original_id": "uuid-1",
      "name": "会话1",
      "type": "ai",
      "message_count": 150,
      "topic_count": 3
    }
  ],
  "total_statistics": {
    "total_sessions": 3,
    "total_messages": 450,
    "total_topics": 8,
    "total_senders": 10
  },
  "duplicate_check": {
    "has_duplicates": true,
    "duplicate_export_ids": ["export_20260201_143000_abc123"],
    "affected_sessions": ["uuid-1"]
  },
  "warnings": [],
  "errors": []
}
```

---

## 五、路由代码设计

### 文件位置

```
app/router/v1/session_transfer.py  # 新建
```

### 代码结构

```python
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
    BatchExportResponse,
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
```

---

## 六、路由注册

### 修改 `app/api.py`

```python
from app.router.v1 import session_transfer

# 在现有路由注册处添加
app.include_router(
    session_transfer.router,
    prefix="/api/v1",
    tags=["Session Transfer"]
)
```

---

## 七、错误码定义

| HTTP 状态码 | 错误类型 | 说明 |
|------------|---------|------|
| 400 | Bad Request | 文件格式无效 |
| 400 | Bad Request | 文件解析失败 |
| 400 | Bad Request | 必要字段缺失 |
| 400 | Bad Request | 日期范围无效 |
| 404 | Not Found | 会话不存在 |
| 413 | Payload Too Large | 文件过大 |
| 500 | Internal Error | 服务器内部错误 |

## 八、文件大小限制

```python
# 在配置中定义
MAX_IMPORT_FILE_SIZE = 100 * 1024 * 1024  # 100MB (支持批量导入)
```
