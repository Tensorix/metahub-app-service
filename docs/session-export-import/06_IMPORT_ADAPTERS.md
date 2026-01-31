# 步骤 6：导入适配器架构

## 设计目标

建立可扩展的导入适配器架构，支持多种数据格式导入：

- **MetaHub 原生格式**（默认）
- **微信聊天记录**（未来）
- **Telegram 导出**（未来）
- **ChatGPT 对话**（未来）
- **通用 CSV 格式**（未来）

---

## 目录结构

```
app/service/import_adapters/
├── __init__.py           # 适配器注册和获取
├── base.py               # 基类定义
├── metahub.py            # MetaHub 格式适配器
├── wechat.py             # 微信格式适配器（未来）
├── telegram.py           # Telegram 格式适配器（未来）
└── chatgpt.py            # ChatGPT 格式适配器（未来）
```

---

## 基类定义

### 文件：`app/service/import_adapters/base.py`

```python
from abc import ABC, abstractmethod
from typing import Any


class BaseImportAdapter(ABC):
    """导入适配器基类"""
    
    # 适配器唯一标识
    FORMAT_ID: str = "base"
    
    # 适配器描述
    FORMAT_NAME: str = "Base Format"
    
    # 支持的文件扩展名
    SUPPORTED_EXTENSIONS: list[str] = [".json"]
    
    @abstractmethod
    def validate(self, data: dict) -> dict:
        """
        验证数据格式
        
        Args:
            data: 解析后的数据字典
        
        Returns:
            dict: {
                "valid": bool,
                "errors": list[str],
                "warnings": list[str]
            }
        """
        pass
    
    @abstractmethod
    def normalize(self, data: dict) -> dict:
        """
        将数据标准化为内部格式
        
        Args:
            data: 原始数据字典
        
        Returns:
            dict: 标准化的数据，符合 MetaHub 内部格式
        """
        pass
    
    def detect(self, data: dict) -> bool:
        """
        检测数据是否匹配此适配器
        
        Args:
            data: 解析后的数据字典
        
        Returns:
            bool: 是否匹配
        """
        return data.get("format") == self.FORMAT_ID
```

---

## MetaHub 适配器实现

### 文件：`app/service/import_adapters/metahub.py`

```python
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
            "id": session.get("id"),
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
            "id": message.get("id"),
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
            "id": part.get("id"),
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
```

---

## 适配器注册

### 文件：`app/service/import_adapters/__init__.py`

```python
from typing import Optional, Type
from .base import BaseImportAdapter
from .metahub import MetaHubAdapter

# 适配器注册表
_ADAPTERS: dict[str, Type[BaseImportAdapter]] = {}


def register_adapter(adapter_class: Type[BaseImportAdapter]) -> None:
    """注册适配器"""
    _ADAPTERS[adapter_class.FORMAT_ID] = adapter_class


def get_adapter(format_id: str) -> Optional[BaseImportAdapter]:
    """获取适配器实例"""
    adapter_class = _ADAPTERS.get(format_id)
    if adapter_class:
        return adapter_class()
    return None


def detect_format(data: dict) -> Optional[str]:
    """自动检测数据格式"""
    for format_id, adapter_class in _ADAPTERS.items():
        adapter = adapter_class()
        if adapter.detect(data):
            return format_id
    return None


def list_adapters() -> list[dict]:
    """列出所有可用适配器"""
    return [
        {
            "id": adapter_class.FORMAT_ID,
            "name": adapter_class.FORMAT_NAME,
            "extensions": adapter_class.SUPPORTED_EXTENSIONS,
        }
        for adapter_class in _ADAPTERS.values()
    ]


# 注册默认适配器
register_adapter(MetaHubAdapter)
```

---

## 扩展示例：微信格式适配器

### 文件：`app/service/import_adapters/wechat.py`（未来实现）

```python
from typing import Any
from datetime import datetime
from .base import BaseImportAdapter


class WeChatAdapter(BaseImportAdapter):
    """微信聊天记录格式适配器"""
    
    FORMAT_ID = "wechat"
    FORMAT_NAME = "微信聊天记录"
    SUPPORTED_EXTENSIONS = [".json", ".txt"]
    
    def validate(self, data: dict) -> dict:
        """验证微信格式数据"""
        errors = []
        warnings = []
        
        # 微信导出格式检测
        if not isinstance(data, list):
            errors.append("微信格式应为消息数组")
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        return {"valid": True, "errors": [], "warnings": []}
    
    def normalize(self, data: dict) -> dict:
        """将微信格式转换为标准格式"""
        messages = []
        senders = {}
        
        for item in data:
            # 解析发送者
            sender_name = item.get("sender", item.get("from", "未知"))
            if sender_name not in senders:
                senders[sender_name] = {
                    "id": f"wechat_{len(senders)}",
                    "name": sender_name,
                    "created_at": datetime.now().isoformat(),
                }
            
            # 解析消息
            messages.append({
                "id": item.get("id", f"msg_{len(messages)}"),
                "role": "user",
                "sender_id": senders[sender_name]["id"],
                "created_at": item.get("time", datetime.now().isoformat()),
                "updated_at": item.get("time", datetime.now().isoformat()),
                "parts": [{
                    "type": "text",
                    "content": item.get("content", item.get("message", "")),
                }],
            })
        
        return {
            "session": {
                "name": "微信导入会话",
                "type": "group",
                "source": "wechat_import",
            },
            "senders": list(senders.values()),
            "topics": [],
            "messages": messages,
        }
    
    def detect(self, data: dict) -> bool:
        """检测是否为微信格式"""
        # 微信格式通常是消息数组
        if isinstance(data, list) and len(data) > 0:
            first_item = data[0]
            return (
                "content" in first_item or
                "message" in first_item
            ) and (
                "sender" in first_item or
                "from" in first_item
            )
        return False
```

---

## 添加新适配器的步骤

1. **创建适配器文件**
   ```
   app/service/import_adapters/new_format.py
   ```

2. **继承基类并实现方法**
   ```python
   from .base import BaseImportAdapter
   
   class NewFormatAdapter(BaseImportAdapter):
       FORMAT_ID = "new_format"
       FORMAT_NAME = "新格式名称"
       
       def validate(self, data: dict) -> dict:
           # 实现验证逻辑
           pass
       
       def normalize(self, data: dict) -> dict:
           # 实现转换逻辑
           pass
   ```

3. **注册适配器**
   ```python
   # 在 __init__.py 中添加
   from .new_format import NewFormatAdapter
   register_adapter(NewFormatAdapter)
   ```

4. **添加测试用例**
   ```python
   # tests/test_import_adapters.py
   def test_new_format_adapter():
       adapter = NewFormatAdapter()
       # 测试验证和转换
   ```

---

## 格式自动检测流程

```
1. 用户上传文件
   ↓
2. 解析 JSON
   ↓
3. 遍历已注册适配器
   ↓
4. 调用每个适配器的 detect() 方法
   ↓
5. 返回第一个匹配的格式 ID
   ↓
6. 如果无匹配，尝试 metahub 格式（默认）
   ↓
7. 验证和导入
```
