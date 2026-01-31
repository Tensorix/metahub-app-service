# app/service/search/provider.py

from abc import ABC, abstractmethod
from typing import Optional, Any
from uuid import UUID
from datetime import datetime


class SearchProvider(ABC):
    """
    搜索类别的抽象接口。

    每种可搜索的内容类型（消息、文档、活动等）实现一个 Provider，
    定义自己的索引表结构、过滤维度、结果格式化逻辑。

    扩展新类别时只需：
    1. 创建对应的索引表（参考 message_search_index）
    2. 实现一个新的 SearchProvider 子类
    3. 注册一个新的 Agent Tool
    """

    @abstractmethod
    def get_table_name(self) -> str:
        """返回索引表名。"""
        ...

    @abstractmethod
    def get_content_column(self) -> str:
        """返回用于模糊搜索的文本列名。"""
        ...

    @abstractmethod
    def get_embedding_column(self) -> str:
        """返回向量列名。"""
        ...

    @abstractmethod
    def get_select_columns(self) -> list[str]:
        """
        返回 SELECT 中需要查询的列列表。
        至少包含一个可作为唯一标识的 ID 列。
        """
        ...

    @abstractmethod
    def get_id_column(self) -> str:
        """返回结果去重用的 ID 列名。"""
        ...

    @abstractmethod
    def build_base_filters(
        self, user_id: UUID, **kwargs
    ) -> tuple[list[str], dict]:
        """
        构建该类别特有的 WHERE 条件。

        Args:
            user_id: 当前用户 ID（权限隔离）
            **kwargs: 类别特有的过滤参数

        Returns:
            (where_clauses, params) 元组
        """
        ...

    @abstractmethod
    def format_result(self, row: Any) -> dict:
        """将数据库行转换为统一的结果 dict。"""
        ...
