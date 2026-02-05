from typing import Optional, Type
from .base import BaseImportAdapter
from .metahub import MetaHubAdapter
from .qq_chat_exporter import QQChatExporterAdapter

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
register_adapter(QQChatExporterAdapter)
