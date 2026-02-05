# QQ Chat Exporter 导入发送者名称问题修复

## 问题描述

在使用 QQ Chat Exporter V5 格式导入聊天记录后，发现消息内容（`content`）中包含了发送者名称前缀，例如：

```json
{
  "content": "沙音木偶: [回复 u_Yv0173q9_9C9V7DMckmeOg: 原消息]\n@地瓜 又失效了[/捂脸]",
  "sender_id": "019c281a-6273-74ed-9bfd-1d7785937901"
}
```

这导致前端显示时出现重复的发送者名称，因为前端会从 `sender` 关系中获取并显示发送者名称。

## 问题根源

在 `app/service/import_adapters/qq_chat_exporter.py` 的 `_build_message_text` 方法中，所有消息都会自动添加发送者名称前缀：

```python
# 旧代码
def _build_message_text(self, text, elements, resources, mentions, sender_name):
    # ... 处理元素 ...
    
    # 添加发送者名称前缀
    return f"{sender_name}: {message}"  # ❌ 问题所在
```

这个设计可能是为了在没有 `sender_id` 关联的情况下保留发送者信息，但现在系统已经完整支持：

1. **MessageSender 表**：存储发送者信息（id, name, external_id）
2. **Message.sender_id**：外键关联到 MessageSender
3. **metadata.sender_name**：在消息元数据中保存发送者名称
4. **前端关系查询**：前端可以通过 `sender_id` 查询并显示发送者名称

## 解决方案

### 1. 修改导入适配器

移除 `_build_message_text` 方法中自动添加发送者名称的逻辑：

```python
# 新代码
def _build_message_text(self, text, elements, resources, mentions, sender_name):
    """
    构建消息文本，处理各种元素类型
    
    注意：不在消息内容中包含发送者名称，因为：
    1. 发送者信息通过 sender_id 关联到 MessageSender 表
    2. 发送者名称保存在 metadata.sender_name 中
    3. 前端应该从 sender 关系中获取并显示发送者名称
    """
    # 如果没有特殊元素，直接返回文本
    if not elements:
        return text  # ✅ 不添加前缀
    
    # 构建富文本消息
    parts = []
    for element in elements:
        # ... 处理各种元素类型 ...
    
    # 直接返回消息内容，不添加发送者名称前缀
    return ''.join(parts)  # ✅ 不添加前缀
```

### 2. 数据结构说明

导入后的数据结构：

```python
# Message 表
{
    "id": "019c281a-62c1-7748-8554-665fdca38ac5",
    "session_id": "019c281a-6255-764c-b013-fbbc9764be41",
    "sender_id": "019c281a-6273-74ed-9bfd-1d7785937901",  # 关联到 MessageSender
    "role": "null",
    "parts": [
        {
            "type": "text",
            "content": "[回复 xxx] @地瓜 又失效了[/捂脸]",  # ✅ 不包含发送者名称
            "metadata": {
                "sender_name": "沙音木偶",  # ✅ 保存在 metadata 中
                "sender_uid": "u_MxfQPkbxyHw4ci2QAhGYJQ",
                "message_type": "type_3"
            }
        }
    ]
}

# MessageSender 表
{
    "id": "019c281a-6273-74ed-9bfd-1d7785937901",
    "name": "沙音木偶",  # ✅ 发送者名称
    "external_id": "u_MxfQPkbxyHw4ci2QAhGYJQ"  # ✅ QQ UID
}
```

### 3. 前端显示逻辑

前端应该通过以下方式显示发送者名称：

```typescript
// 方式1：通过 sender 关系（推荐）
const senderName = message.sender?.name || "未知用户";

// 方式2：从 metadata 中获取（备用）
const senderName = message.parts[0]?.metadata?.sender_name || "未知用户";

// 显示格式
<div className="message">
  <div className="sender">{senderName}</div>  {/* ✅ 前端显示 */}
  <div className="content">{message.parts[0].content}</div>  {/* ✅ 不包含发送者名称 */}
</div>
```

## 验证测试

运行测试脚本验证修复：

```bash
python test_qq_sender_name_fix.py
```

测试结果：
```
✅ 所有测试通过！

修复说明：
1. 消息内容不再包含发送者名称前缀
2. 发送者信息通过 sender_id 关联到 MessageSender 表
3. 发送者名称保存在 metadata.sender_name 中
4. 前端应该从 sender 关系中获取并显示发送者名称
```

## 影响范围

### 已修复
- ✅ QQ Chat Exporter V5 格式导入
- ✅ 消息内容不再包含发送者名称前缀
- ✅ 发送者信息通过 sender_id 正确关联

### 需要注意
- ⚠️ 已导入的旧数据仍然包含发送者名称前缀
- ⚠️ 如需清理旧数据，可以重新导入或编写数据迁移脚本

### 前端适配
- ✅ 前端已经支持通过 `sender_id` 查询发送者信息
- ✅ 前端可以从 `metadata.sender_name` 获取备用信息
- ✅ 不需要从 `content` 中解析发送者名称

## 相关文件

- `app/service/import_adapters/qq_chat_exporter.py` - 导入适配器（已修复）
- `app/db/model/message_sender.py` - MessageSender 模型
- `app/db/model/message.py` - Message 模型
- `test_qq_sender_name_fix.py` - 验证测试脚本

## 总结

这个修复确保了：

1. **数据一致性**：发送者信息通过规范的关系存储，而不是嵌入在消息内容中
2. **前端灵活性**：前端可以自由控制发送者名称的显示方式和位置
3. **可维护性**：发送者信息集中管理，便于更新和查询
4. **用户体验**：避免重复显示发送者名称

修复后，导入的消息内容更加干净，发送者信息通过标准的数据库关系进行管理。
