# QQ Chat Exporter V5 格式分析总结

## 基本信息

- **工具名称**: QQ Chat Exporter V5
- **项目地址**: https://github.com/shuakami/qq-chat-exporter
- **文件格式**: JSON
- **版本**: 5.5.1
- **编码**: UTF-8

## 文件结构概览

```
{
  "metadata": {},      // 工具元数据
  "chatInfo": {},      // 聊天基本信息
  "statistics": {},    // 统计数据
  "messages": [],      // 消息列表（核心）
  "exportOptions": {}  // 导出选项
}
```

## 核心字段详解

### 1. metadata（元数据）

```json
{
  "name": "QQChatExporter V5 / https://github.com/shuakami/qq-chat-exporter",
  "version": "5.5.1",
  "copyright": "..."
}
```

**用途**: 识别文件格式和版本

### 2. chatInfo（聊天信息）

```json
{
  "name": "群名称/好友昵称",
  "type": "group",           // "group" 或 "private"
  "selfUid": "u_xxx",        // 导出者的 UID
  "selfUin": "123456",       // 导出者的 QQ 号
  "selfName": "我的昵称"
}
```

**用途**: 
- 确定会话标题
- 判断消息角色（通过对比 selfUid）

### 3. statistics（统计信息）

```json
{
  "totalMessages": 1021,
  "timeRange": {
    "start": "2025-12-31T15:05:17.000Z",
    "end": "2026-01-29T06:46:00.000Z",
    "durationDays": 29
  },
  "messageTypes": {...},
  "senders": [...],
  "resources": {...}
}
```

**用途**: 生成会话描述和统计报告

### 4. messages（消息列表）

#### 消息基本结构

```json
{
  "id": "7600672345327336312",      // 消息唯一ID
  "seq": "790",                      // 序列号
  "timestamp": 1767193517000,        // 时间戳（毫秒）
  "time": "2025-12-31 23:05:17",    // 格式化时间
  "sender": {
    "uid": "u_xxx",                  // 用户 UID
    "uin": "123456",                 // QQ 号
    "name": "昵称"
  },
  "type": "type_1",                  // 消息类型
  "content": {...},                  // 消息内容
  "recalled": false,                 // 是否撤回
  "system": false                    // 是否系统消息
}
```

#### 消息类型（type）

| 类型 | 说明 | 示例 |
|------|------|------|
| `type_1` | 普通文本 | 文字、图片、表情 |
| `type_3` | 回复消息 | 引用回复 |
| `type_8` | 文件消息 | 文件传输 |
| `type_17` | 商城表情 | 付费表情包 |

#### 消息内容（content）

```json
{
  "text": "消息的纯文本表示",
  "html": "",
  "elements": [
    {
      "type": "元素类型",
      "data": {...}
    }
  ],
  "resources": [...],
  "mentions": [...]
}
```

#### 元素类型（elements）

| 类型 | 说明 | 数据结构 |
|------|------|----------|
| `text` | 纯文本 | `{"text": "内容"}` |
| `image` | 图片 | `{"filename": "xxx.jpg", "size": 12345, "url": "..."}` |
| `file` | 文件 | `{"filename": "xxx.exe", "size": 12345, "url": "..."}` |
| `at` | @提及 | `{"uid": "u_xxx", "name": "用户名"}` |
| `face` | QQ表情 | `{"id": "264", "name": "/捂脸"}` |
| `market_face` | 商城表情 | `{"id": "xxx", "name": "[害羞]"}` |
| `reply` | 回复引用 | `{"messageId": "xxx", "senderName": "xxx", "content": "..."}` |

## 导入适配器实现要点

### 1. 格式识别

```python
def detect(data):
    # 检查必需字段
    if not all(k in data for k in ['metadata', 'chatInfo', 'messages']):
        return False
    
    # 检查工具名称
    if 'QQChatExporter' not in data['metadata'].get('name', ''):
        return False
    
    # 检查版本
    if not data['metadata'].get('version', '').startswith('5.'):
        return False
    
    return True
```

### 2. 消息角色判断

```python
# 对比发送者 UID 与导出者 UID
self_uid = chat_info['selfUid']
sender_uid = message['sender']['uid']

role = 'user' if sender_uid == self_uid else 'assistant'
```

### 3. 时间戳转换

```python
# 毫秒 -> 秒 -> ISO 8601
timestamp_ms = message['timestamp']
timestamp_s = timestamp_ms / 1000
iso_time = datetime.fromtimestamp(timestamp_s).isoformat()
```

### 4. 消息文本构建

```python
def build_text(elements, sender_name):
    parts = []
    for elem in elements:
        if elem['type'] == 'text':
            parts.append(elem['data']['text'])
        elif elem['type'] == 'image':
            parts.append(f"[图片: {elem['data']['filename']}]")
        elif elem['type'] == 'at':
            parts.append(f"@{elem['data']['name']}")
        elif elem['type'] == 'face':
            parts.append(elem['data']['name'])
        # ... 其他类型
    
    return f"{sender_name}: {''.join(parts)}"
```

### 5. 特殊情况处理

```python
# 撤回消息
if message['recalled']:
    text = f"[已撤回] {text}"

# 系统消息
if message['system']:
    text = f"[系统消息] {text}"
```

## 标准化输出格式

```json
{
  "session": {
    "title": "ChatLab交流群",
    "description": "导入自: QQ Chat Exporter V5\n版本: 5.5.1\n类型: 群聊\n消息数: 1021",
    "metadata": {
      "source": "qq_chat_exporter_v5",
      "chat_type": "group",
      "self_uid": "u_xxx",
      "exporter_version": "5.5.1"
    }
  },
  "messages": [
    {
      "role": "user",
      "content": "速冻饺子: [[害羞]]",
      "timestamp": "2025-12-31T23:05:17",
      "metadata": {
        "sender_name": "速冻饺子",
        "sender_uid": "u_xxx",
        "message_id": "7600672345327336312",
        "message_type": "type_17"
      }
    }
  ]
}
```

## 实现文件

1. **适配器实现**: `app/service/import_adapters/qq_chat_exporter.py`
2. **格式规范文档**: `docs/session-export-import/08_QQ_CHAT_EXPORTER_FORMAT.md`
3. **注册**: `app/service/import_adapters/__init__.py`

## 测试建议

1. **基本导入测试**: 使用提供的示例文件测试
2. **边界情况**:
   - 空消息列表
   - 撤回消息
   - 系统消息
   - 复合消息（多种元素类型）
3. **大文件测试**: 测试包含大量消息的文件
4. **版本兼容性**: 测试不同版本的导出文件

## 参考资料

- 示例文件: `group_1070511173_20260129_145029.json`
- 项目主页: https://github.com/shuakami/qq-chat-exporter
- 消息数量: 1021 条
- 时间跨度: 2025-12-31 至 2026-01-29（29天）
- 参与者: 90+ 人
