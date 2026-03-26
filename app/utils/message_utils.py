"""消息处理工具函数"""

import json
from typing import List, Optional


def parts_to_message_str(
    parts: List[dict],
    include_tool_info: bool = True,
    separator: str = "\n"
) -> str:
    """
    将 Parts 列表转换为纯文本字符串

    Args:
        parts: Part 数据列表，每个 dict 包含 type, content, metadata_
        include_tool_info: 是否包含工具调用信息，False 则只保留文本
        separator: 不同 part 之间的分隔符

    Returns:
        合成的纯文本字符串
    """
    segments = []

    for part in parts:
        part_type = part.get("type", "text")
        content = part.get("content", "")

        if part_type == "text":
            if content.strip():
                segments.append(content)

        elif part_type == "thinking" and include_tool_info:
            preview = content[:50] + "..." if len(content) > 50 else content
            segments.append(f"[思考: {preview}]")

        elif part_type == "tool_call" and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                segments.append(f"[调用工具: {name}]")
            except json.JSONDecodeError:
                segments.append("[调用工具]")

        elif part_type == "tool_result" and include_tool_info:
            try:
                data = json.loads(content)
                name = data.get("name", "unknown")
                segments.append(f"[工具结果: {name}]")
            except json.JSONDecodeError:
                segments.append("[工具结果]")

        elif part_type == "error":
            try:
                data = json.loads(content)
                error = data.get("error", "未知错误")
                segments.append(f"[错误: {error}]")
            except json.JSONDecodeError:
                segments.append(f"[错误: {content}]")

        elif part_type == "image":
            segments.append("[图片]")

        elif part_type == "at":
            segments.append(f"@{content}")

        elif part_type == "url":
            segments.append(content)

        elif part_type == "json":
            segments.append("[JSON数据]")

        elif part_type == "metrics":
            continue

    return separator.join(segments)


def get_text_only(parts: List[dict]) -> str:
    """
    只提取纯文本内容，忽略工具调用等

    Args:
        parts: Part 数据列表

    Returns:
        纯文本内容
    """
    return parts_to_message_str(parts, include_tool_info=False, separator="\n")
