
class MessageRole:
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    SELF = "self"
    NULL = "null"

    KNOWN_ROLES = frozenset({USER, ASSISTANT, SYSTEM, SELF, NULL})

    @classmethod
    def is_known(cls, role: str) -> bool:
        return role in cls.KNOWN_ROLES


class MessagePartType:
    """
    消息部分类型常量

    === 基础内容类型 ===
    TEXT: 纯文本内容
    IMAGE: 图片（base64 或 URL）
    AT: @提及
    URL: 链接
    JSON: 通用 JSON 数据

    === AI 对话扩展类型 ===
    TOOL_CALL: AI 工具调用请求
    TOOL_RESULT: 工具执行结果
    ERROR: 错误信息
    THINKING: AI 思考过程
    """

    # 基础类型
    TEXT = "text"
    IMAGE = "image"
    AT = "at"
    URL = "url"
    JSON = "json"

    # AI 对话扩展类型
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ERROR = "error"
    THINKING = "thinking"
    SUBAGENT_CALL = "subagent_call"
    METRICS = "metrics"

    KNOWN_TYPES = frozenset({
        TEXT, IMAGE, AT, URL, JSON,
        TOOL_CALL, TOOL_RESULT, ERROR, THINKING, SUBAGENT_CALL, METRICS,
    })

    # AI 相关类型集合
    AI_TYPES = frozenset({TOOL_CALL, TOOL_RESULT, ERROR, THINKING, SUBAGENT_CALL, METRICS})

    @classmethod
    def is_known(cls, type_: str) -> bool:
        return type_ in cls.KNOWN_TYPES

    @classmethod
    def is_ai_type(cls, type_: str) -> bool:
        return type_ in cls.AI_TYPES
