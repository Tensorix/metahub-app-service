# Message Role 重构设计文档

## 1. 背景与目标

### 1.1 需求描述

在 PM (私聊) 和 Group (群聊) 场景中,需要区分消息是当前用户自己发送的还是其他人发送的:
- `self`: 当前用户自己发的消息
- `null`: 其他人发的消息 (暂不做更详细区分)

### 1.2 设计原则

- **保持扩展性**: 不对 role 值做强约束,保留未来扩展空间
- **向后兼容**: 现有 `user/assistant/system` 值继续有效
- **补充而非替代**: `self/null` 与 `sender_id` 互补,不替代
- **消除魔法字符串**: 统一管理 role 常量,提高代码可维护性

---

## 2. 现状分析

### 2.1 当前 Role 定义

| 位置 | 当前值 | 说明 |
|------|--------|------|
| `app/db/model/message.py:41` | `user/assistant/system` | 数据库注释 |
| `app/schema/session.py:106` | `user/assistant/system` | API Schema 描述 |
| `app/schema/sync.py:121` | `user/assistant/system` | Sync Schema 描述 |

### 2.2 发现的问题

#### 问题 1: 直接 API 缺少 user_id

**位置**: `app/service/session.py:198-221`

```python
# 当前实现 - 缺少 user_id
@staticmethod
def create_message(db: Session, data: MessageCreate) -> Message:
    message = Message(
        session_id=data.session_id,
        topic_id=data.topic_id,
        role=data.role,
        sender_id=data.sender_id,
        # ❌ 缺少 user_id
    )
```

**影响**:
- 消息没有用户隔离
- 与 Sync API 和 Webhook 的行为不一致
- 可能导致数据安全问题

#### 问题 2: Webhook 写死 `role="user"`

**位置**: `app/service/webhook.py:196-201`

```python
# 当前实现
message = Message(
    user_id=user_id,
    session_id=session_id,
    sender_id=sender_id,
    role="user",  # ❌ 应该是 "null" (来自他人的消息)
    external_id=webhook_data.message_id
)
```

**问题**: Webhook 收到的消息是来自其他用户的,应该用 `null` 而非 `user`

#### 问题 3: 魔法字符串散落

Role 值 `"user"`, `"assistant"`, `"system"` 作为字符串字面量散落在:
- `app/service/webhook.py`
- `app/schema/session.py`
- `app/schema/sync.py`
- `app/db/model/message.py` (注释)

**问题**:
- 无法集中查看所有合法值
- 修改时容易遗漏
- IDE 无法提供补全和检查

---

## 3. 重构方案

### 3.1 引入 Role 常量模块

**新文件**: `app/constants/message.py`

```python
"""Message 相关常量定义"""


class MessageRole:
    """
    消息角色常量

    设计说明:
    - 使用类常量而非 Enum,保持扩展性 (数据库不做约束)
    - 提供 KNOWN_ROLES 集合用于文档和可选验证
    - 常量命名使用大写,值使用小写字符串
    """

    # === 传统 AI 对话角色 ===
    USER = "user"           # 用户输入 (AI 对话场景)
    ASSISTANT = "assistant" # AI 助手回复
    SYSTEM = "system"       # 系统消息/提示词

    # === IM 场景角色 ===
    SELF = "self"           # 当前用户自己发的消息
    NULL = "null"           # 其他人发的消息 (sender_id 标识具体发送者)

    # 已知角色集合 (用于文档和可选验证,不强制约束)
    KNOWN_ROLES = frozenset({USER, ASSISTANT, SYSTEM, SELF, NULL})

    @classmethod
    def is_known(cls, role: str) -> bool:
        """检查是否为已知角色 (不强制,仅供参考)"""
        return role in cls.KNOWN_ROLES


class MessagePartType:
    """
    消息部分类型常量

    扩展: 可按需添加更多类型
    """
    TEXT = "text"
    IMAGE = "image"
    AT = "at"
    URL = "url"
    JSON = "json"

    KNOWN_TYPES = frozenset({TEXT, IMAGE, AT, URL, JSON})
```

### 3.2 修复 MessageService.create_message

**文件**: `app/service/session.py`

```python
# 修改前
@staticmethod
def create_message(db: Session, data: MessageCreate) -> Message:
    message = Message(
        session_id=data.session_id,
        ...
    )

# 修改后
@staticmethod
def create_message(db: Session, data: MessageCreate, user_id: UUID) -> Message:
    """
    创建消息

    Args:
        db: 数据库会话
        data: 消息创建数据
        user_id: 所属用户ID (用于用户隔离)
    """
    message = Message(
        user_id=user_id,  # ✅ 添加 user_id
        session_id=data.session_id,
        topic_id=data.topic_id,
        role=data.role,
        sender_id=data.sender_id,
    )
    ...
```

### 3.3 修复 Router 调用

**文件**: `app/router/v1/session.py`

```python
# 修改前
message = MessageService.create_message(db, data)

# 修改后
message = MessageService.create_message(db, data, current_user.id)
```

### 3.4 修复 Webhook Role 值

**文件**: `app/service/webhook.py`

```python
from app.constants.message import MessageRole

# 修改前
message = Message(
    ...
    role="user",
    ...
)

# 修改后
message = Message(
    ...
    role=MessageRole.NULL,  # 来自他人的消息
    ...
)
```

### 3.5 更新文档注释

统一更新各处 role 的描述:

```python
# app/db/model/message.py
role: Mapped[str] = mapped_column(
    String(50), nullable=False,
    comment="角色: user/assistant/system/self/null"
)

# app/schema/session.py
role: str = Field(
    ...,
    description="角色: user/assistant/system (AI对话) 或 self/null (IM场景)",
    max_length=50
)

# app/schema/sync.py
role: Optional[str] = Field(
    None,
    description="角色: user/assistant/system (AI对话) 或 self/null (IM场景)",
    max_length=50
)
```

---

## 4. 修改清单

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `app/constants/__init__.py` | 常量模块初始化 |
| `app/constants/message.py` | Message 相关常量 |

### 4.2 修改文件

| 文件 | 修改内容 | 行号 |
|------|----------|------|
| `app/db/model/message.py` | 更新 role 注释 | L41-42 |
| `app/schema/session.py` | 更新 role 描述 | L106 |
| `app/schema/sync.py` | 更新 role 描述 | L121 |
| `app/service/session.py` | `create_message` 添加 `user_id` 参数 | L198 |
| `app/service/webhook.py` | 使用 `MessageRole.NULL` | L200 |
| `app/router/v1/session.py` | 传递 `current_user.id` | L150 |

---

## 5. 数据兼容性

### 5.1 数据库

- **无需迁移**: role 字段已是 `String(50)`,新值直接兼容
- **无约束变更**: 不添加 CHECK 约束,保持扩展性

### 5.2 API 兼容

- **向后兼容**: 现有 `user/assistant/system` 继续有效
- **新增值**: `self/null` 作为新选项,客户端按需使用

### 5.3 现有数据

- **无需迁移**: 现有消息保持原 role 值
- **渐进采用**: 新消息可使用新 role 值

---

## 6. Role 使用指南

### 6.1 场景对照表

| 场景 | role 值 | sender_id | 说明 |
|------|---------|-----------|------|
| AI 对话 - 用户输入 | `user` | 可选 | 传统 LLM 对话 |
| AI 对话 - AI 回复 | `assistant` | 可选 | AI 生成内容 |
| AI 对话 - 系统提示 | `system` | 无 | System Prompt |
| IM - 自己发送 | `self` | 可选 | 客户端主动创建 |
| IM - 他人发送 | `null` | **必填** | Webhook 接收 |

### 6.2 API 使用示例

**场景 1: 客户端创建自己的消息**

```json
POST /v1/sessions/{session_id}/messages
{
  "session_id": "...",
  "role": "self",
  "parts": [{"type": "text", "content": "Hello!"}]
}
```

**场景 2: 同步他人消息 (客户端已知)**

```json
POST /v1/sync/batch
{
  "messages": [{
    "operation": "create",
    "session_id": "...",
    "role": "null",
    "sender_id": "...",
    "parts": [{"type": "text", "content": "Hi there!"}]
  }]
}
```

**场景 3: Webhook 自动创建 (他人消息)**

Webhook 收到的消息自动使用 `role="null"`,并通过 `sender_id` 关联发送者。

---

## 7. 常量使用规范

### 7.1 推荐用法

```python
from app.constants.message import MessageRole

# ✅ 推荐: 使用常量
message = Message(role=MessageRole.SELF, ...)

# ✅ 比较时使用常量
if message.role == MessageRole.NULL:
    # 来自他人的消息
    pass
```

### 7.2 不推荐用法

```python
# ❌ 不推荐: 使用字符串字面量
message = Message(role="self", ...)

# ❌ 不推荐: 硬编码比较
if message.role == "null":
    pass
```

### 7.3 渐进迁移

现有代码中的字符串字面量可渐进替换为常量,优先级:
1. 新代码必须使用常量
2. 修改现有代码时顺带替换
3. 不强制一次性全部替换

---

## 8. 未来扩展

### 8.1 可能的扩展方向

```python
class MessageRole:
    # 现有
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    SELF = "self"
    NULL = "null"

    # 未来可能扩展
    BOT = "bot"           # 机器人消息
    ADMIN = "admin"       # 管理员消息
    ANONYMOUS = "anonymous"  # 匿名消息
```

### 8.2 可选验证 (未来)

```python
# 如果未来需要验证,可添加 Pydantic validator
from pydantic import field_validator

class MessageCreate(MessageBase):
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        if not MessageRole.is_known(v):
            import warnings
            warnings.warn(f"Unknown message role: {v}")
        return v
```

---

## 9. 测试要点

### 9.1 单元测试

- [ ] `MessageRole` 常量值正确
- [ ] `MessageRole.is_known()` 方法正确
- [ ] `MessageService.create_message()` 正确设置 user_id

### 9.2 集成测试

- [ ] 直接 API 创建消息有 user_id
- [ ] Webhook 消息 role 为 "null"
- [ ] Sync API 支持新 role 值
- [ ] 现有 role 值继续工作

### 9.3 兼容性测试

- [ ] 现有消息查询正常
- [ ] 按 role 筛选正常 (`?role=self`)
- [ ] 客户端使用旧 role 值正常

---

## 10. 实施检查清单

- [ ] 创建 `app/constants/__init__.py`
- [ ] 创建 `app/constants/message.py`
- [ ] 修改 `app/db/model/message.py` 注释
- [ ] 修改 `app/schema/session.py` 描述
- [ ] 修改 `app/schema/sync.py` 描述
- [ ] 修改 `app/service/session.py` - 添加 user_id 参数
- [ ] 修改 `app/router/v1/session.py` - 传递 user_id
- [ ] 修改 `app/service/webhook.py` - 使用 MessageRole.NULL
- [ ] 运行测试确保通过
- [ ] 更新 API 文档
