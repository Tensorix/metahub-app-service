from typing import Any
from .base import BaseImportAdapter


class MetaHubAdapter(BaseImportAdapter):
    """MetaHub 原生格式适配器"""
    
    FORMAT_ID = "metahub"
    FORMAT_NAME = "MetaHub 格式"
    SUPPORTED_EXTENSIONS = [".json"]
    
    # 支持的版本
    SUPPORTED_VERSIONS = ["1.0"]
    
    def validate(self, data: dict) -> dict:
        """验证 MetaHub 格式数据"""
        errors = []
        warnings = []
        
        # 1. 检查必要字段
        required_fields = ["format", "version", "session", "messages"]
        for field in required_fields:
            if field not in data:
                errors.append(f"缺少必要字段: {field}")
        
        if errors:
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        # 2. 检查格式标识
        if data.get("format") != "metahub":
            errors.append(f"格式标识不匹配: {data.get('format')}")
        
        # 3. 检查版本
        version = data.get("version")
        if version not in self.SUPPORTED_VERSIONS:
            if version and version.startswith("0."):
                warnings.append(f"旧版本格式 {version}，部分数据可能不兼容")
            else:
                errors.append(f"不支持的版本: {version}")
        
        # 4. 检查 session
        session = data.get("session", {})
        if not session.get("type"):
            errors.append("会话缺少类型字段")
        
        # 5. 检查 messages
        messages = data.get("messages", [])
        if not isinstance(messages, list):
            errors.append("messages 必须是数组")
        else:
            for i, msg in enumerate(messages):
                if not msg.get("role"):
                    warnings.append(f"消息 {i+1} 缺少角色字段")
                if not msg.get("parts"):
                    warnings.append(f"消息 {i+1} 缺少内容")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def normalize(self, data: dict) -> dict:
        """
        MetaHub 格式已经是标准格式，直接返回
        仅做必要的字段映射和默认值填充
        """
        normalized = {
            "session": self._normalize_session(data.get("session", {})),
            "senders": data.get("senders", []),
            "topics": data.get("topics", []),
            "messages": [
                self._normalize_message(msg)
                for msg in data.get("messages", [])
            ],
        }
        return normalized
    
    def _normalize_session(self, session: dict) -> dict:
        """标准化会话数据"""
        return {
            "original_id": session.get("original_id"),
            "name": session.get("name"),
            "type": session.get("type", "ai"),
            "source": session.get("source"),
            "metadata": session.get("metadata"),
            "created_at": session.get("created_at"),
            "updated_at": session.get("updated_at"),
        }
    
    def _normalize_message(self, message: dict) -> dict:
        """标准化消息数据"""
        return {
            "original_id": message.get("original_id"),
            "topic_id": message.get("topic_id"),
            "role": message.get("role", "user"),
            "sender_id": message.get("sender_id"),
            "created_at": message.get("created_at"),
            "updated_at": message.get("updated_at"),
            "parts": [
                self._normalize_part(part)
                for part in message.get("parts", [])
            ],
        }
    
    def _normalize_part(self, part: dict) -> dict:
        """标准化消息部分"""
        return {
            "original_id": part.get("original_id"),
            "type": part.get("type", "text"),
            "content": part.get("content", ""),
            "metadata": part.get("metadata"),
            "event_id": part.get("event_id"),
            "raw_data": part.get("raw_data"),
        }
    
    def detect(self, data: dict) -> bool:
        """检测是否为 MetaHub 格式"""
        return (
            data.get("format") == "metahub" or
            (
                "session" in data and
                "messages" in data and
                isinstance(data["messages"], list)
            )
        )
