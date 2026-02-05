"""
QQ Chat Exporter V5 格式导入适配器

支持从 QQChatExporter V5 (https://github.com/shuakami/qq-chat-exporter) 
导出的 JSON 格式导入聊天记录
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from app.service.import_adapters.base import BaseImportAdapter


class QQChatExporterAdapter(BaseImportAdapter):
    """QQ Chat Exporter V5 格式适配器"""
    
    FORMAT_ID = "qq_chat_exporter_v5"
    FORMAT_NAME = "QQ Chat Exporter V5"
    SUPPORTED_EXTENSIONS = [".json"]
    
    def detect(self, data: Dict[str, Any]) -> bool:
        """
        检测是否为 QQ Chat Exporter V5 格式
        
        必需字段:
        - metadata: 包含 name, version 等元数据
        - chatInfo: 聊天信息
        - messages: 消息列表
        """
        try:
            # 检查必需的顶层字段
            if not all(key in data for key in ['metadata', 'chatInfo', 'messages']):
                return False
            
            # 检查 metadata 中的版本信息
            metadata = data.get('metadata', {})
            if 'QQChatExporter' not in metadata.get('name', ''):
                return False
            
            # 检查版本号是否为 5.x
            version = metadata.get('version', '')
            if not version.startswith('5.'):
                return False
            
            return True
        except Exception:
            return False
    
    def validate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        验证数据格式
        
        Returns:
            dict: {
                "valid": bool,
                "errors": list[str],
                "warnings": list[str]
            }
        """
        errors = []
        warnings = []
        
        # 检查必需字段
        if 'metadata' not in data:
            errors.append("缺少 metadata 字段")
        if 'chatInfo' not in data:
            errors.append("缺少 chatInfo 字段")
        if 'messages' not in data:
            errors.append("缺少 messages 字段")
        
        # 检查消息列表
        messages = data.get('messages', [])
        if not isinstance(messages, list):
            errors.append("messages 必须是数组")
        elif len(messages) == 0:
            warnings.append("消息列表为空")
        
        # 检查版本
        metadata = data.get('metadata', {})
        version = metadata.get('version', '')
        if not version.startswith('5.'):
            warnings.append(f"版本 {version} 可能不完全兼容，建议使用 5.x 版本")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def normalize(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        将 QQ Chat Exporter V5 格式标准化为 MetaHub 内部格式
        
        数据结构:
        {
            "metadata": {...},
            "chatInfo": {...},
            "statistics": {...},
            "messages": [...]
        }
        
        转换为:
        {
            "session": {
                "title": "会话标题",
                "description": "会话描述",
                "metadata": {...}
            },
            "senders": [
                {
                    "original_id": "u_xxx",
                    "name": "用户名"
                }
            ],
            "messages": [
                {
                    "role": "self" | "null",  # self=自己发送, null=其他人发送
                    "content": "消息内容",
                    "timestamp": "ISO 8601 时间戳",
                    "sender_id": "u_xxx",
                    "parts": [...],
                    "metadata": {...}
                }
            ]
        }
        """
        # 提取聊天信息
        chat_info = data.get('chatInfo', {})
        metadata = data.get('metadata', {})
        statistics = data.get('statistics', {})
        
        # 构建会话信息
        session_title = chat_info.get('name', 'QQ聊天记录')
        chat_type = chat_info.get('type', 'unknown')
        
        # 构建会话描述
        description_parts = [
            f"导入自: {metadata.get('name', 'QQ Chat Exporter')}",
            f"版本: {metadata.get('version', 'unknown')}",
            f"类型: {'群聊' if chat_type == 'group' else '私聊'}",
        ]
        
        if statistics:
            total_msgs = statistics.get('totalMessages', 0)
            time_range = statistics.get('timeRange', {})
            description_parts.append(f"消息数: {total_msgs}")
            if time_range:
                start = time_range.get('start', '')
                end = time_range.get('end', '')
                if start and end:
                    description_parts.append(f"时间范围: {start[:10]} 至 {end[:10]}")
        
        # 收集所有唯一的发送者
        senders_map = {}  # uid -> sender info
        messages_data = data.get('messages', [])
        
        for msg in messages_data:
            sender = msg.get('sender', {})
            sender_uid = sender.get('uid', '')
            sender_name = sender.get('name', '未知用户')
            
            if sender_uid and sender_uid not in senders_map:
                senders_map[sender_uid] = {
                    'original_id': sender_uid,
                    'external_id': sender_uid,  # 使用 QQ UID 作为 external_id
                    'name': sender_name,
                }
        
        # 解析消息
        normalized_messages = []
        for msg in messages_data:
            normalized_msg = self._normalize_message(msg, chat_info)
            if normalized_msg:
                normalized_messages.append(normalized_msg)
        
        return {
            "session": {
                "title": session_title,
                "name": session_title,  # 同时提供 name 字段以兼容
                "type": chat_type,  # 直接提供 type 字段
                "description": '\n'.join(description_parts),
                "metadata": {
                    "source": "qq_chat_exporter_v5",
                    "chat_type": chat_type,
                    "self_uid": chat_info.get('selfUid', ''),
                    "self_name": chat_info.get('selfName', ''),
                    "exporter_version": metadata.get('version', ''),
                    "statistics": statistics
                }
            },
            "senders": list(senders_map.values()),
            "messages": normalized_messages
        }
    
    def _normalize_message(
        self, 
        msg: Dict[str, Any], 
        chat_info: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        标准化单条消息
        
        消息类型:
        - type_1: 普通文本消息
        - type_3: 回复消息
        - type_8: 文件消息
        - type_17: 表情消息
        - system: 系统消息
        """
        try:
            # 提取发送者信息
            sender = msg.get('sender', {})
            sender_name = sender.get('name', '未知用户')
            sender_uid = sender.get('uid', '')
            
            # 判断是否为自己发送的消息
            self_uid = chat_info.get('selfUid', '')
            role = 'self' if sender_uid == self_uid else 'null'
            
            # 提取时间戳（毫秒转秒）
            timestamp = msg.get('timestamp', 0) / 1000
            timestamp_iso = datetime.fromtimestamp(timestamp).isoformat()
            
            # 提取消息内容
            content = msg.get('content', {})
            text = content.get('text', '')
            elements = content.get('elements', [])
            resources = content.get('resources', [])
            mentions = content.get('mentions', [])
            
            # 构建消息文本
            message_text = self._build_message_text(
                text, elements, resources, mentions, sender_name
            )
            
            # 添加消息状态标记
            if msg.get('recalled'):
                message_text = f"[已撤回] {message_text}"
            elif msg.get('system'):
                message_text = f"[系统消息] {message_text}"
            
            return {
                'role': role,
                'content': message_text,
                'timestamp': timestamp_iso,
                'sender_id': sender_uid,  # 添加 sender_id 引用
                'original_id': msg.get('id', ''),  # 添加原始消息ID（用于 external_id）
                'parts': [
                    {
                        'type': 'text',
                        'content': message_text,
                        'metadata': None,
                        'event_id': None,
                        'raw_data': None,
                    }
                ],
                'metadata': {
                    'sender_name': sender_name,
                    'sender_uid': sender_uid,
                    'sender_uin': sender.get('uin', ''),
                    'message_id': msg.get('id', ''),
                    'message_seq': msg.get('seq', ''),
                    'message_type': msg.get('type', 'type_1'),
                    'recalled': msg.get('recalled', False),
                    'system': msg.get('system', False),
                }
            }
        except Exception as e:
            # 记录错误但继续处理其他消息
            print(f"解析消息失败: {e}")
            return None
    
    def _build_message_text(
        self,
        text: str,
        elements: List[Dict[str, Any]],
        resources: List[Dict[str, Any]],
        mentions: List[Dict[str, Any]],
        sender_name: str
    ) -> str:
        """
        构建消息文本，处理各种元素类型
        
        元素类型:
        - text: 纯文本
        - image: 图片
        - file: 文件
        - at: @提及
        - face: 表情
        - reply: 回复
        - market_face: 商城表情
        
        注意：不在消息内容中包含发送者名称，因为：
        1. 发送者信息通过 sender_id 关联到 MessageSender 表
        2. 发送者名称保存在 metadata.sender_name 中
        3. 前端应该从 sender 关系中获取并显示发送者名称
        """
        # 如果没有特殊元素，直接返回文本
        if not elements:
            return text
        
        # 构建富文本消息
        parts = []
        
        for element in elements:
            elem_type = element.get('type', '')
            elem_data = element.get('data', {})
            
            if elem_type == 'text':
                parts.append(elem_data.get('text', ''))
            
            elif elem_type == 'image':
                filename = elem_data.get('filename', '图片')
                parts.append(f"[图片: {filename}]")
            
            elif elem_type == 'file':
                filename = elem_data.get('filename', '文件')
                size = elem_data.get('size', 0)
                size_mb = size / (1024 * 1024)
                parts.append(f"[文件: {filename} ({size_mb:.2f}MB)]")
            
            elif elem_type == 'at':
                name = elem_data.get('name', '某人')
                parts.append(f"@{name}")
            
            elif elem_type == 'face':
                name = elem_data.get('name', '[表情]')
                parts.append(name)
            
            elif elem_type == 'market_face':
                name = elem_data.get('name', '[表情]')
                parts.append(name)
            
            elif elem_type == 'reply':
                sender = elem_data.get('senderName', '')
                content = elem_data.get('content', '')
                parts.append(f"[回复 {sender}: {content}]")
        
        # 直接返回消息内容，不添加发送者名称前缀
        return ''.join(parts)
