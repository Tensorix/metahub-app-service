
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
    TEXT = "text"
    IMAGE = "image"
    AT = "at"
    URL = "url"
    JSON = "json"

    KNOWN_TYPES = frozenset({TEXT, IMAGE, AT, URL, JSON})
