import json
import zipfile
import io
from datetime import datetime, timezone
from typing import Optional, Any, Iterator, AsyncIterator
from uuid import UUID, uuid4
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import UploadFile
from loguru import logger

from app.db.model.session import Session as SessionModel
from app.db.model.topic import Topic
from app.db.model.message import Message
from app.db.model.message_part import MessagePart
from app.db.model.message_sender import MessageSender
from app.schema.session_transfer import (
    SessionExportData,
    ExportSession,
    ExportTopic,
    ExportMessage,
    ExportMessagePart,
    ExportSender,
    ExportStatistics,
    ResourceRef,
    BatchExportManifest,
    SessionImportResponse,
    ImportedSessionInfo,
    ImportStatistics,
    ImportPreviewResponse,
    SessionPreview,
    DuplicateCheck,
)
from app.service.import_adapters import get_adapter, detect_format


class SessionTransferService:
    """会话导入导出服务"""

    # ============ 导出功能 ============
    
    @staticmethod
    async def export_session(
        db: Session,
        session_id: UUID,
        user_id: UUID,
        format: str = "json",
        include_deleted: bool = False,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Optional[dict]:
        """导出单个会话"""
        
        # 1. 获取会话
        session = db.query(SessionModel).filter(
            SessionModel.id == session_id,
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False
        ).first()
        
        if not session:
            return None
        
        # 2. 构建导出数据
        export_data = SessionTransferService._build_export_data(
            db=db,
            session=session,
            user_id=user_id,
            include_deleted=include_deleted,
            start_date=start_date,
            end_date=end_date,
        )
        
        # 3. 生成文件名和流
        session_name = session.name or "untitled"
        
        if format == "jsonl":
            filename = SessionTransferService._generate_filename(
                session_type=session.type,
                session_name=session_name,
                ext="jsonl"
            )
            return {
                "stream": SessionTransferService._stream_jsonl_single(export_data),
                "media_type": "application/jsonl",
                "filename": filename,
            }
        else:
            filename = SessionTransferService._generate_filename(
                session_type=session.type,
                session_name=session_name,
                ext="json"
            )
            return {
                "stream": SessionTransferService._stream_json(export_data),
                "media_type": "application/json",
                "filename": filename,
            }
    
    @staticmethod
    async def export_batch(
        db: Session,
        user_id: UUID,
        session_ids: Optional[list[UUID]] = None,
        type_filter: Optional[list[str]] = None,
        format: str = "jsonl",
        include_deleted: bool = False,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        group_by_type: bool = True,
    ) -> dict:
        """批量导出会话"""
        
        # 1. 查询会话
        query = db.query(SessionModel).filter(
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False
        )
        
        if session_ids:
            query = query.filter(SessionModel.id.in_(session_ids))
        
        if type_filter:
            query = query.filter(SessionModel.type.in_(type_filter))
        
        sessions = query.order_by(SessionModel.type, SessionModel.created_at).all()
        
        if not sessions:
            raise ValueError("没有找到可导出的会话")
        
        # 2. 生成导出 ID
        export_id = SessionTransferService._generate_export_id()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 3. 按类型分组
        if group_by_type:
            sessions_by_type: dict[str, list] = {}
            for s in sessions:
                if s.type not in sessions_by_type:
                    sessions_by_type[s.type] = []
                sessions_by_type[s.type].append(s)
            
            # 生成 ZIP 包
            return {
                "stream": SessionTransferService._stream_zip(
                    db=db,
                    user_id=user_id,
                    sessions_by_type=sessions_by_type,
                    export_id=export_id,
                    include_deleted=include_deleted,
                    start_date=start_date,
                    end_date=end_date,
                ),
                "media_type": "application/zip",
                "filename": f"sessions_export_{timestamp}.zip",
            }
        else:
            # 单个 JSONL 文件
            type_str = "_".join(type_filter) if type_filter else "all"
            return {
                "stream": SessionTransferService._stream_jsonl_batch(
                    db=db,
                    user_id=user_id,
                    sessions=sessions,
                    export_id=export_id,
                    type_filter=type_str,
                    include_deleted=include_deleted,
                    start_date=start_date,
                    end_date=end_date,
                ),
                "media_type": "application/jsonl",
                "filename": f"sessions_export_{type_str}_{timestamp}.jsonl",
            }

    @staticmethod
    def _build_export_data(
        db: Session,
        session: SessionModel,
        user_id: UUID,
        include_deleted: bool = False,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """构建单个会话的导出数据"""
        
        # 获取话题
        topics_query = db.query(Topic).filter(
            Topic.session_id == session.id,
            Topic.user_id == user_id,
        )
        if not include_deleted:
            topics_query = topics_query.filter(Topic.is_deleted == False)
        topics = topics_query.order_by(Topic.created_at).all()
        
        # 获取消息（支持增量导出）
        messages_query = db.query(Message).filter(
            Message.session_id == session.id,
            Message.user_id == user_id,
        )
        if not include_deleted:
            messages_query = messages_query.filter(Message.is_deleted == False)
        if start_date:
            messages_query = messages_query.filter(Message.created_at >= start_date)
        if end_date:
            messages_query = messages_query.filter(Message.created_at <= end_date)
        messages = messages_query.order_by(Message.created_at).all()
        
        # 收集发送者
        sender_ids = set(msg.sender_id for msg in messages if msg.sender_id)
        senders = []
        if sender_ids:
            senders = db.query(MessageSender).filter(
                MessageSender.id.in_(sender_ids)
            ).all()
        
        # 构建导出数据
        export_id = SessionTransferService._generate_export_id()
        
        # 构建统计
        filter_applied = None
        if start_date or end_date:
            filter_applied = {
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            }
        
        statistics = SessionTransferService._calculate_statistics(
            messages, topics, senders, filter_applied
        )
        
        return {
            "format": "metahub",
            "version": "1.0",
            "export_id": export_id,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "session": {
                "original_id": str(session.id),
                "name": session.name,
                "type": session.type,
                "source": session.source,
                "metadata": session.metadata_,
                # 注意：不导出 agent_id
                "created_at": session.created_at.isoformat(),
                "updated_at": session.updated_at.isoformat(),
            },
            "senders": [
                {
                    "original_id": str(s.id),
                    "name": s.name,
                    "external_id": s.external_id,  # 导出 external_id
                    "created_at": s.created_at.isoformat(),
                }
                for s in senders
            ],
            "topics": [
                {
                    "original_id": str(t.id),
                    "name": t.name,
                    "created_at": t.created_at.isoformat(),
                    "updated_at": t.updated_at.isoformat(),
                }
                for t in topics
            ],
            "messages": [
                SessionTransferService._serialize_message(m)
                for m in messages
            ],
            "statistics": statistics,
        }
    
    @staticmethod
    def _serialize_message(message: Message) -> dict:
        """序列化消息"""
        return {
            "original_id": str(message.id),
            "topic_id": str(message.topic_id) if message.topic_id else None,
            "role": message.role,
            "sender_id": str(message.sender_id) if message.sender_id else None,
            "created_at": message.created_at.isoformat(),
            "updated_at": message.updated_at.isoformat(),
            "parts": [
                SessionTransferService._serialize_part(p)
                for p in message.parts
            ],
        }
    
    @staticmethod
    def _serialize_part(part: MessagePart) -> dict:
        """序列化消息部分"""
        # TODO: 提取外部资源引用
        resource_refs = SessionTransferService._extract_resource_refs(part)
        
        return {
            "original_id": str(part.id),
            "type": part.type,
            "content": part.content,
            "metadata": part.metadata_,
            "event_id": part.event_id,
            "raw_data": part.raw_data,
            "created_at": part.created_at.isoformat(),
            "resource_refs": resource_refs,
        }
    
    @staticmethod
    def _extract_resource_refs(part: MessagePart) -> list[dict]:
        """
        提取外部资源引用
        TODO: 实现资源缓存功能
        """
        refs = []
        
        # 图片类型
        if part.type == "image":
            if part.content.startswith(("http://", "https://")):
                refs.append({
                    "type": "image",
                    "url": part.content,
                    "cached": False,  # TODO: 实现缓存
                    "cache_path": None,
                })
        
        # URL 类型
        elif part.type == "url":
            refs.append({
                "type": "url",
                "url": part.content,
                "cached": False,
                "cache_path": None,
            })
        
        return refs
    
    @staticmethod
    def _calculate_statistics(
        messages: list[Message],
        topics: list[Topic],
        senders: list[MessageSender],
        filter_applied: Optional[dict] = None,
    ) -> dict:
        """计算统计信息"""
        date_range = {}
        if messages:
            dates = [m.created_at for m in messages]
            date_range = {
                "earliest": min(dates).isoformat(),
                "latest": max(dates).isoformat(),
            }
        
        return {
            "total_messages": len(messages),
            "total_topics": len(topics),
            "total_senders": len(senders),
            "date_range": date_range,
            "filter_applied": filter_applied,
        }
    
    @staticmethod
    def _generate_export_id() -> str:
        """生成导出批次 ID"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_suffix = str(uuid4())[:8]
        return f"export_{timestamp}_{random_suffix}"
    
    @staticmethod
    def _generate_filename(
        session_type: str,
        session_name: str,
        ext: str = "json",
    ) -> str:
        """生成导出文件名"""
        # 保留中文字符
        safe_name = "".join(c for c in session_name if c.isalnum() or c in (' ', '-', '_') or '\u4e00' <= c <= '\u9fff').strip()
        safe_name = safe_name[:30] if safe_name else "untitled"
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"session_{session_type}_{safe_name}_{timestamp}.{ext}"

    @staticmethod
    def _stream_json(data: dict) -> Iterator[bytes]:
        """流式输出 JSON"""
        yield json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    
    @staticmethod
    def _stream_jsonl_single(data: dict) -> Iterator[bytes]:
        """流式输出单会话 JSONL"""
        # 元信息行
        meta = {
            "_meta": {
                "format": data["format"],
                "version": data["version"],
                "export_id": data["export_id"],
                "exported_at": data["exported_at"],
                "total_sessions": 1,
            }
        }
        yield json.dumps(meta, ensure_ascii=False).encode("utf-8") + b"\n"
        
        # 会话行
        session_line = {"_type": "session", **data["session"]}
        yield json.dumps(session_line, ensure_ascii=False).encode("utf-8") + b"\n"
        
        # 发送者行
        for sender in data["senders"]:
            sender_line = {
                "_type": "sender",
                "session_ref": data["session"]["original_id"],
                **sender,
            }
            yield json.dumps(sender_line, ensure_ascii=False).encode("utf-8") + b"\n"
        
        # 话题行
        for topic in data["topics"]:
            topic_line = {
                "_type": "topic",
                "session_ref": data["session"]["original_id"],
                **topic,
            }
            yield json.dumps(topic_line, ensure_ascii=False).encode("utf-8") + b"\n"
        
        # 消息行
        for message in data["messages"]:
            message_line = {
                "_type": "message",
                "session_ref": data["session"]["original_id"],
                **message,
            }
            yield json.dumps(message_line, ensure_ascii=False).encode("utf-8") + b"\n"
    
    @staticmethod
    def _stream_jsonl_batch(
        db: Session,
        user_id: UUID,
        sessions: list[SessionModel],
        export_id: str,
        type_filter: str,
        include_deleted: bool,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
    ) -> Iterator[bytes]:
        """流式输出批量 JSONL"""
        # 元信息行
        meta = {
            "_meta": {
                "format": "metahub",
                "version": "1.0",
                "export_id": export_id,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "type_filter": type_filter,
                "total_sessions": len(sessions),
            }
        }
        yield json.dumps(meta, ensure_ascii=False).encode("utf-8") + b"\n"
        
        # 逐个会话输出
        for session in sessions:
            data = SessionTransferService._build_export_data(
                db, session, user_id, include_deleted, start_date, end_date
            )
            
            # 会话行
            session_line = {"_type": "session", **data["session"]}
            yield json.dumps(session_line, ensure_ascii=False).encode("utf-8") + b"\n"
            
            # 发送者、话题、消息...
            for sender in data["senders"]:
                line = {"_type": "sender", "session_ref": data["session"]["original_id"], **sender}
                yield json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n"
            
            for topic in data["topics"]:
                line = {"_type": "topic", "session_ref": data["session"]["original_id"], **topic}
                yield json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n"
            
            for message in data["messages"]:
                line = {"_type": "message", "session_ref": data["session"]["original_id"], **message}
                yield json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n"
    
    @staticmethod
    def _stream_zip(
        db: Session,
        user_id: UUID,
        sessions_by_type: dict[str, list[SessionModel]],
        export_id: str,
        include_deleted: bool,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
    ) -> Iterator[bytes]:
        """流式输出 ZIP 包"""
        buffer = io.BytesIO()
        
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            manifest_files = []
            total_sessions = 0
            total_messages = 0
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            for session_type, sessions in sessions_by_type.items():
                # 生成该类型的 JSONL 内容
                jsonl_content = io.BytesIO()
                type_messages = 0
                
                # 写入该类型的数据
                for session in sessions:
                    data = SessionTransferService._build_export_data(
                        db, session, user_id, include_deleted, start_date, end_date
                    )
                    
                    # 会话行
                    line = {"_type": "session", **data["session"]}
                    jsonl_content.write(json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n")
                    
                    for sender in data["senders"]:
                        line = {"_type": "sender", "session_ref": data["session"]["original_id"], **sender}
                        jsonl_content.write(json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n")
                    
                    for topic in data["topics"]:
                        line = {"_type": "topic", "session_ref": data["session"]["original_id"], **topic}
                        jsonl_content.write(json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n")
                    
                    for message in data["messages"]:
                        line = {"_type": "message", "session_ref": data["session"]["original_id"], **message}
                        jsonl_content.write(json.dumps(line, ensure_ascii=False).encode("utf-8") + b"\n")
                        type_messages += 1
                
                # 写入 ZIP
                filename = f"sessions_{session_type}_{timestamp}.jsonl"
                zf.writestr(filename, jsonl_content.getvalue())
                
                manifest_files.append({
                    "filename": filename,
                    "type": session_type,
                    "session_count": len(sessions),
                    "message_count": type_messages,
                })
                total_sessions += len(sessions)
                total_messages += type_messages
            
            # 写入 manifest.json
            manifest = {
                "format": "metahub-bundle",
                "version": "1.0",
                "export_id": export_id,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "files": manifest_files,
                "total_sessions": total_sessions,
                "total_messages": total_messages,
            }
            zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        
        buffer.seek(0)
        yield buffer.read()

    # ============ 导入功能 ============
    
    @staticmethod
    async def import_sessions(
        db: Session,
        file: UploadFile,
        user_id: UUID,
        format: str = "auto",
        merge_senders: bool = True,
        skip_embedding: bool = False,
    ) -> SessionImportResponse:
        """导入会话数据
        
        Args:
            db: 数据库会话
            file: 上传的导出文件
            user_id: 用户ID
            format: 导入格式（auto 自动检测）
            merge_senders: 是否合并同名发送者
            skip_embedding: 是否跳过 embedding 生成（只创建文本索引，节省成本）
        """
        
        content = await file.read()
        filename = file.filename or ""
        
        # 根据文件类型处理
        if filename.endswith(".zip"):
            return await SessionTransferService._import_zip(
                db, content, user_id, merge_senders, skip_embedding
            )
        elif filename.endswith(".jsonl"):
            return SessionTransferService._import_jsonl(
                db, content, user_id, merge_senders, skip_embedding
            )
        else:
            return SessionTransferService._import_json(
                db, content, user_id, format, merge_senders, skip_embedding
            )
    
    @staticmethod
    def _import_json(
        db: Session,
        content: bytes,
        user_id: UUID,
        format: str,
        merge_senders: bool,
        skip_embedding: bool = False,
    ) -> SessionImportResponse:
        """导入 JSON 格式"""
        try:
            data = json.loads(content.decode("utf-8"))
        except json.JSONDecodeError as e:
            raise ValueError(f"无效的 JSON 格式: {e}")
        
        # 获取适配器
        if format == "auto":
            format = detect_format(data) or "metahub"
        
        adapter = get_adapter(format)
        if not adapter:
            raise ValueError(f"不支持的导入格式: {format}")
        
        # 验证
        validation = adapter.validate(data)
        if not validation["valid"]:
            raise ValueError(f"数据验证失败: {validation['errors']}")
        
        # 标准化
        normalized = adapter.normalize(data)
        
        # 执行导入
        result = SessionTransferService._do_import_single(
            db, normalized, user_id, merge_senders,
            export_id=data.get("export_id"),
            skip_embedding=skip_embedding,
        )
        
        return SessionImportResponse(
            success=True,
            imported_sessions=[result],
            total_statistics=result.statistics,
        )
    
    @staticmethod
    def _import_jsonl(
        db: Session,
        content: bytes,
        user_id: UUID,
        merge_senders: bool,
        skip_embedding: bool = False,
    ) -> SessionImportResponse:
        """导入 JSONL 格式"""
        lines = content.decode("utf-8").strip().split("\n")
        
        if not lines:
            raise ValueError("JSONL 文件为空")
        
        # 解析元信息
        meta_line = json.loads(lines[0])
        if "_meta" not in meta_line:
            raise ValueError("JSONL 缺少元信息行")
        
        export_id = meta_line["_meta"].get("export_id")
        
        # 按会话分组
        sessions_data: dict[str, dict] = {}
        current_session_id = None
        
        for line in lines[1:]:
            if not line.strip():
                continue
            
            record = json.loads(line)
            record_type = record.pop("_type", None)
            
            if record_type == "session":
                current_session_id = record["original_id"]
                sessions_data[current_session_id] = {
                    "session": record,
                    "senders": [],
                    "topics": [],
                    "messages": [],
                }
            elif record_type == "sender":
                session_ref = record.pop("session_ref")
                if session_ref in sessions_data:
                    sessions_data[session_ref]["senders"].append(record)
            elif record_type == "topic":
                session_ref = record.pop("session_ref")
                if session_ref in sessions_data:
                    sessions_data[session_ref]["topics"].append(record)
            elif record_type == "message":
                session_ref = record.pop("session_ref")
                if session_ref in sessions_data:
                    sessions_data[session_ref]["messages"].append(record)
        
        # 导入所有会话
        imported = []
        total_stats = ImportStatistics()
        
        for session_id, data in sessions_data.items():
            result = SessionTransferService._do_import_single(
                db, data, user_id, merge_senders, export_id,
                skip_embedding=skip_embedding,
            )
            imported.append(result)
            total_stats.imported_messages += result.statistics.imported_messages
            total_stats.imported_topics += result.statistics.imported_topics
            total_stats.imported_senders += result.statistics.imported_senders
            total_stats.merged_senders += result.statistics.merged_senders
        
        return SessionImportResponse(
            success=True,
            imported_sessions=imported,
            total_statistics=total_stats,
        )
    
    @staticmethod
    async def _import_zip(
        db: Session,
        content: bytes,
        user_id: UUID,
        merge_senders: bool,
        skip_embedding: bool = False,
    ) -> SessionImportResponse:
        """导入 ZIP 格式"""
        buffer = io.BytesIO(content)
        imported = []
        total_stats = ImportStatistics()
        
        with zipfile.ZipFile(buffer, 'r') as zf:
            # 读取 manifest
            manifest = None
            if "manifest.json" in zf.namelist():
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
            
            export_id = manifest.get("export_id") if manifest else None
            
            # 处理每个 JSONL 文件
            for name in zf.namelist():
                if name.endswith(".jsonl"):
                    content = zf.read(name)
                    result = SessionTransferService._import_jsonl(
                        db, content, user_id, merge_senders, skip_embedding
                    )
                    imported.extend(result.imported_sessions)
                    total_stats.imported_messages += result.total_statistics.imported_messages
                    total_stats.imported_topics += result.total_statistics.imported_topics
                    total_stats.imported_senders += result.total_statistics.imported_senders
                    total_stats.merged_senders += result.total_statistics.merged_senders
        
        return SessionImportResponse(
            success=True,
            imported_sessions=imported,
            total_statistics=total_stats,
        )

    @staticmethod
    def _do_import_single(
        db: Session,
        data: dict,
        user_id: UUID,
        merge_senders: bool,
        export_id: Optional[str] = None,
        skip_embedding: bool = False,
    ) -> ImportedSessionInfo:
        """执行单个会话导入
        
        Args:
            db: 数据库会话
            data: 标准化后的会话数据
            user_id: 用户ID
            merge_senders: 是否合并同名发送者
            export_id: 导出ID
            skip_embedding: 是否跳过 embedding 生成（只创建文本索引）
        """
        stats = ImportStatistics()
        id_mapping = {"topics": {}, "senders": {}}
        
        session_data = data["session"]
        original_id = session_data.get("original_id", str(uuid4()))
        
        # 构建导入信息元数据
        import_info = {
            "export_id": export_id,
            "imported_at": datetime.now(timezone.utc).isoformat(),
            "original_session_id": original_id,
        }
        
        # 合并原有 metadata
        metadata = session_data.get("metadata") or {}
        metadata["import_info"] = import_info
        
        # 1. 创建会话
        new_session = SessionModel(
            user_id=user_id,
            name=session_data.get("name"),
            type=session_data["type"],
            source="import",
            external_id=original_id,  # 保存原始会话ID
            metadata_=metadata,
            # 不设置 agent_id，因为不导出 Agent 配置
        )
        db.add(new_session)
        db.flush()
        
        # 2. 导入发送者
        for sender_data in data.get("senders", []):
            old_id = sender_data.get("original_id") or sender_data.get("id")
            external_id = sender_data.get("external_id")
            sender_name = sender_data["name"]
            
            existing = None
            if merge_senders:
                # 优先使用 external_id 查找（精确匹配）
                if external_id:
                    existing = db.query(MessageSender).filter(
                        MessageSender.external_id == external_id
                    ).first()
                
                # 如果没有找到，再尝试按名称查找
                if not existing:
                    existing = db.query(MessageSender).filter(
                        MessageSender.name == sender_name
                    ).first()
            
            if existing:
                # 如果找到已存在的发送者，更新 external_id（如果之前没有）
                if external_id and not existing.external_id:
                    existing.external_id = external_id
                    db.flush()
                
                id_mapping["senders"][old_id] = existing.id
                stats.merged_senders += 1
            else:
                new_sender = MessageSender(
                    name=sender_name,
                    external_id=external_id
                )
                db.add(new_sender)
                db.flush()
                id_mapping["senders"][old_id] = new_sender.id
                stats.imported_senders += 1
        
        # 3. 导入话题
        for topic_data in data.get("topics", []):
            old_id = topic_data.get("original_id") or topic_data.get("id")
            new_topic = Topic(
                user_id=user_id,
                session_id=new_session.id,
                name=topic_data.get("name"),
            )
            db.add(new_topic)
            db.flush()
            id_mapping["topics"][old_id] = new_topic.id
            stats.imported_topics += 1
        
        # 4. 导入消息
        for msg_data in data.get("messages", []):
            topic_id = None
            old_topic_id = msg_data.get("topic_id")
            if old_topic_id:
                topic_id = id_mapping["topics"].get(str(old_topic_id))
            
            sender_id = None
            old_sender_id = msg_data.get("sender_id")
            if old_sender_id:
                sender_id = id_mapping["senders"].get(str(old_sender_id))
            
            # 提取原始消息ID（用于 external_id）
            original_msg_id = msg_data.get("original_id") or msg_data.get("metadata", {}).get("message_id")
            
            new_message = Message(
                user_id=user_id,
                session_id=new_session.id,
                topic_id=topic_id,
                role=msg_data["role"],
                sender_id=sender_id,
                external_id=original_msg_id,  # 保存原始消息ID
            )
            db.add(new_message)
            db.flush()
            
            # 5. 导入消息部分
            for part_data in msg_data.get("parts", []):
                new_part = MessagePart(
                    message_id=new_message.id,
                    type=part_data["type"],
                    content=part_data["content"],
                    metadata_=part_data.get("metadata"),
                    event_id=part_data.get("event_id"),
                    raw_data=part_data.get("raw_data"),
                )
                db.add(new_part)
            
            stats.imported_messages += 1
        
        db.commit()
        db.refresh(new_session)
        
        # 注意：索引操作改为后台任务执行，不在这里同步处理
        # 会话创建后，调用方可以选择：
        # 1. 立即创建后台任务进行索引
        # 2. 让用户稍后手动触发索引
        
        return ImportedSessionInfo(
            session_id=new_session.id,
            original_id=UUID(original_id) if original_id else new_session.id,
            name=new_session.name,
            type=new_session.type,
            statistics=stats,
        )
    
    @staticmethod
    async def preview_import(
        db: Session,
        file: UploadFile,
        user_id: UUID,
    ) -> ImportPreviewResponse:
        """预览导入文件"""
        content = await file.read()
        await file.seek(0)
        filename = file.filename or ""
        
        try:
            if filename.endswith(".zip"):
                return await SessionTransferService._preview_zip(db, content, user_id)
            elif filename.endswith(".jsonl"):
                return SessionTransferService._preview_jsonl(db, content, user_id)
            else:
                return SessionTransferService._preview_json(db, content, user_id)
        except Exception as e:
            return ImportPreviewResponse(
                valid=False,
                format="unknown",
                version="unknown",
                errors=[str(e)],
            )
    
    @staticmethod
    def _preview_json(db: Session, content: bytes, user_id: UUID) -> ImportPreviewResponse:
        """预览 JSON 文件"""
        try:
            data = json.loads(content.decode("utf-8"))
        except json.JSONDecodeError as e:
            return ImportPreviewResponse(
                valid=False,
                format="unknown",
                version="unknown",
                errors=[f"无效的 JSON 格式: {e}"],
            )
        
        # 自动检测格式
        format_id = detect_format(data)
        if not format_id:
            # 尝试从数据中读取（兼容旧格式）
            format_id = data.get("format", "unknown")
        
        # 获取适配器
        adapter = get_adapter(format_id) if format_id != "unknown" else None
        
        if adapter:
            # 使用适配器验证
            validation = adapter.validate(data)
            if not validation["valid"]:
                return ImportPreviewResponse(
                    valid=False,
                    format=format_id,
                    version="unknown",
                    errors=validation["errors"],
                    warnings=validation.get("warnings", []),
                )
            
            # 标准化数据以获取预览信息
            try:
                normalized = adapter.normalize(data)
                session_data = normalized.get("session", {})
                messages = normalized.get("messages", [])
                
                # 从适配器获取版本信息
                version = "unknown"
                if format_id == "metahub":
                    version = data.get("version", "unknown")
                elif format_id == "qq_chat_exporter_v5":
                    metadata = data.get("metadata", {})
                    version = metadata.get("version", "unknown")
                
                # 提取会话类型
                session_type = session_data.get("type", "unknown")
                if session_type == "unknown":
                    # 尝试从 metadata 中获取
                    session_metadata = session_data.get("metadata", {})
                    chat_type = session_metadata.get("chat_type", "unknown")
                    # 映射 QQ 类型到系统类型
                    if chat_type == "group":
                        session_type = "group"
                    elif chat_type == "private":
                        session_type = "private"
                
                export_id = data.get("export_id")
                
                # 检查重复导入
                duplicate_check = SessionTransferService._check_duplicates(db, user_id, export_id)
                
                return ImportPreviewResponse(
                    valid=True,
                    format=format_id,
                    version=version,
                    export_id=export_id,
                    sessions=[
                        SessionPreview(
                            original_id=session_data.get("original_id", ""),
                            name=session_data.get("title") or session_data.get("name"),
                            type=session_type,
                            message_count=len(messages),
                            topic_count=0,  # 标准化后的数据通常没有话题信息
                        )
                    ],
                    total_statistics={
                        "total_messages": len(messages),
                        "total_topics": 0,  # 标准化后的数据可能没有话题信息
                        "total_senders": 0,
                    },
                    duplicate_check=duplicate_check,
                    warnings=validation.get("warnings", []),
                )
            except Exception as e:
                return ImportPreviewResponse(
                    valid=False,
                    format=format_id,
                    version="unknown",
                    errors=[f"数据标准化失败: {str(e)}"],
                )
        else:
            # 未知格式，尝试直接解析（兼容旧格式）
            format_type = data.get("format", "unknown")
            version = data.get("version", "unknown")
            export_id = data.get("export_id")
            
            # 检查重复导入
            duplicate_check = SessionTransferService._check_duplicates(db, user_id, export_id)
            
            session = data.get("session", {})
            messages = data.get("messages", [])
            topics = data.get("topics", [])
            
            return ImportPreviewResponse(
                valid=True,
                format=format_type,
                version=version,
                export_id=export_id,
                sessions=[
                    SessionPreview(
                        original_id=session.get("original_id", ""),
                        name=session.get("name"),
                        type=session.get("type", "unknown"),
                        message_count=len(messages),
                        topic_count=len(topics),
                    )
                ],
                total_statistics={
                    "total_messages": len(messages),
                    "total_topics": len(topics),
                    "total_senders": len(data.get("senders", [])),
                    "date_range": data.get("statistics", {}).get("date_range", {}),
                },
                duplicate_check=duplicate_check,
            )
    
    @staticmethod
    def _preview_jsonl(db: Session, content: bytes, user_id: UUID) -> ImportPreviewResponse:
        """预览 JSONL 文件"""
        lines = content.decode("utf-8").strip().split("\n")
        
        if not lines:
            return ImportPreviewResponse(valid=False, format="jsonl", version="unknown", errors=["文件为空"])
        
        meta = json.loads(lines[0])
        if "_meta" not in meta:
            return ImportPreviewResponse(valid=False, format="jsonl", version="unknown", errors=["缺少元信息"])
        
        meta_info = meta["_meta"]
        export_id = meta_info.get("export_id")
        
        # 统计
        sessions = []
        session_stats: dict[str, dict] = {}
        
        for line in lines[1:]:
            if not line.strip():
                continue
            record = json.loads(line)
            record_type = record.get("_type")
            
            if record_type == "session":
                sid = record["original_id"]
                session_stats[sid] = {"messages": 0, "topics": 0, "session": record}
            elif record_type == "message":
                sid = record.get("session_ref")
                if sid in session_stats:
                    session_stats[sid]["messages"] += 1
            elif record_type == "topic":
                sid = record.get("session_ref")
                if sid in session_stats:
                    session_stats[sid]["topics"] += 1
        
        for sid, stats in session_stats.items():
            sessions.append(SessionPreview(
                original_id=sid,
                name=stats["session"].get("name"),
                type=stats["session"].get("type", "unknown"),
                message_count=stats["messages"],
                topic_count=stats["topics"],
            ))
        
        duplicate_check = SessionTransferService._check_duplicates(db, user_id, export_id)
        
        total_messages = sum(s.message_count for s in sessions)
        total_topics = sum(s.topic_count for s in sessions)
        
        return ImportPreviewResponse(
            valid=True,
            format=meta_info.get("format", "metahub"),
            version=meta_info.get("version", "1.0"),
            export_id=export_id,
            sessions=sessions,
            total_statistics=ExportStatistics(
                total_messages=total_messages,
                total_topics=total_topics,
                total_senders=0,
                date_range={},
            ),
            duplicate_check=duplicate_check,
        )
    
    @staticmethod
    async def _preview_zip(db: Session, content: bytes, user_id: UUID) -> ImportPreviewResponse:
        """预览 ZIP 文件"""
        buffer = io.BytesIO(content)
        sessions = []
        total_messages = 0
        total_topics = 0
        export_id = None
        
        with zipfile.ZipFile(buffer, 'r') as zf:
            if "manifest.json" in zf.namelist():
                manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
                export_id = manifest.get("export_id")
                
                for file_info in manifest.get("files", []):
                    # 简化预览，从 manifest 获取统计
                    sessions.append(SessionPreview(
                        original_id=f"batch_{file_info['type']}",
                        name=f"{file_info['type']} 类型会话",
                        type=file_info["type"],
                        message_count=file_info.get("message_count", 0),
                        topic_count=0,
                    ))
                    total_messages += file_info.get("message_count", 0)
        
        duplicate_check = SessionTransferService._check_duplicates(db, user_id, export_id)
        
        return ImportPreviewResponse(
            valid=True,
            format="metahub-bundle",
            version="1.0",
            export_id=export_id,
            sessions=sessions,
            total_statistics=ExportStatistics(
                total_messages=total_messages,
                total_topics=total_topics,
                total_senders=0,
                date_range={},
            ),
            duplicate_check=duplicate_check,
        )
    
    @staticmethod
    def _check_duplicates(
        db: Session,
        user_id: UUID,
        export_id: Optional[str],
    ) -> DuplicateCheck:
        """检查是否重复导入"""
        if not export_id:
            return DuplicateCheck(has_duplicates=False)
        
        # 查询已导入的会话中是否有相同 export_id
        # 使用 JSON 查询
        existing = db.query(SessionModel).filter(
            SessionModel.user_id == user_id,
            SessionModel.is_deleted == False,
            SessionModel.metadata_.op("->")("import_info").op("->>")("export_id") == export_id
        ).all()
        
        if existing:
            return DuplicateCheck(
                has_duplicates=True,
                duplicate_export_ids=[export_id],
                affected_sessions=[str(s.id) for s in existing],
            )
        
        return DuplicateCheck(has_duplicates=False)
