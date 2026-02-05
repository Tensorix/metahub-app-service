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
