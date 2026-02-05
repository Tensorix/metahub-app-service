# QQ Chat Exporter V5 格式规范

## 概述

QQ Chat Exporter V5 是一个开源的 QQ 聊天记录导出工具，项目地址：https://github.com/shuakami/qq-chat-exporter

本文档描述其导出的 JSON 格式规范，用于实现导入适配器。

## 文件格式

- **文件扩展名**: `.json`
- **编码**: UTF-8
- **格式**: 标准 JSON
- **版本**: 5.x

## 数据结构

### 顶层结构

```json
{
  "metadata": {},      // 元数据信息
  "chatInfo": {},      // 聊天基本信息
  "statistics": {},    // 统计信息
  "messages": [],      // 消息列表
  "exportOptions": {}  // 导出选项
}
```

### 1. metadata（元数据）

```json
{
  "name": "QQChatExporter V5 / https://github.com/shuakami/qq-chat-exporter",
  "copyright": "本软件是免费的开源项目~ 如果您是买来的，请立即退款！如果有帮助到您，欢迎给我点个Star~",
  "version": "5.5.1"
}
```

**字段说明**:
- `name`: 工具名称和项目地址
- `copyright`: 版权声明
- `version`: 工具版本号（格式：主版本.次版本.修订号）

### 2. chatInfo（聊天信息）

```json
{
  "name": "ChatLab交流群",
  "type": "group",
  "selfUid": "u_Jr34AOOt8d5hXUoBSl7McA",
  "selfUin": "656923170",
  "selfName": "芯月蓝枫"
}
```

**字段说明**:
- `name`: 聊天名称（群名或好友昵称）
- `type`: 聊天类型
  - `"group"`: 群聊
  - `"private"`: 私聊
- `selfUid`: 导出者的 UID（QQ 新版标识符）
- `selfUin`: 导出者的 QQ 号
- `selfName`: 导出者的昵称

### 3. statistics（统计信息）

```json
{
  "totalMessages": 1021,
  "timeRange": {
    "start": "2025-12-31T15:05:17.000Z",
    "end": "2026-01-29T06:46:00.000Z",
    "durationDays": 29
  },
  "messageTypes": {
    "type_17": 11,
    "text": 906,
    "reply": 74,
    "file": 3,
    "json": 2,
    "system": 25
  },
  "senders": [
    {
      "uid": "u_Yv0173q9_9C9V7DMckmeOg",
      "name": "地瓜",
      "messageCount": 285,
      "percentage": 27.91
    }
  ],
  "resources": {
    "total": 186,
    "byType": {
      "image": 183,
      "file": 3
    },
    "totalSize": 148920412
  }
}
```

**字段说明**:
- `totalMessages`: 消息总数
- `timeRange`: 时间范围
  - `start`: 开始时间（ISO 8601 格式）
  - `end`: 结束时间（ISO 8601 格式）
  - `durationDays`: 持续天数
- `messageTypes`: 消息类型统计
- `senders`: 发送者统计列表
  - `uid`: 用户 UID
  - `name`: 用户昵称
  - `messageCount`: 消息数量
  - `percentage`: 占比百分比
- `resources`: 资源统计
  - `total`: 资源总数
  - `byType`: 按类型分类的数量
  - `totalSize`: 总大小（字节）

### 4. messages（消息列表）

#### 消息基本结构

```json
{
  "id": "7600672345327336312",
  "seq": "790",
  "timestamp": 1767193517000,
  "time": "2025-12-31 23:05:17",
  "sender": {
    "uid": "u_c-BS66-yKXpygXFQTl41ZA",
    "uin": "12519212",
    "name": "速冻饺子"
  },
  "type": "type_1",
  "content": {
    "text": "消息文本",
    "html": "",
    "elements": [],
    "resources": [],
    "mentions": []
  },
  "recalled": false,
  "system": false
}
```

**字段说明**:
- `id`: 消息唯一标识符
- `seq`: 消息序列号
- `timestamp`: 时间戳（毫秒）
- `time`: 格式化时间字符串
- `sender`: 发送者信息
  - `uid`: 用户 UID
  - `uin`: QQ 号
  - `name`: 昵称
- `type`: 消息类型（见下文）
- `content`: 消息内容（见下文）
- `recalled`: 是否已撤回
- `system`: 是否为系统消息

#### 消息类型（type）

| 类型 | 说明 |
|------|------|
| `type_1` | 普通文本消息 |
| `type_3` | 回复消息 |
| `type_8` | 文件消息 |
| `type_17` | 商城表情消息 |
| 其他 | 其他特殊类型 |

#### 消息内容（content）

```json
{
  "text": "消息的纯文本表示",
  "html": "消息的 HTML 表示（可选）",
  "elements": [
    {
      "type": "元素类型",
      "data": {}
    }
  ],
  "resources": [
    {
      "type": "资源类型",
      "filename": "文件名",
      "size": 12345,
      "url": "下载地址"
    }
  ],
  "mentions": [
    {
      "uid": "被@的用户UID",
      "name": "被@的用户名",
      "type": "user"
    }
  ]
}
```

#### 元素类型（elements）

##### 1. 文本元素（text）

```json
{
  "type": "text",
  "data": {
    "text": "纯文本内容"
  }
}
```

##### 2. 图片元素（image）

```json
{
  "type": "image",
  "data": {
    "filename": "0CD3AB03280B6ABBBCAFAEB140D707E7.jpg",
    "size": 136946,
    "url": "/download?appid=1407&fileid=..."
  }
}
```

##### 3. 文件元素（file）

```json
{
  "type": "file",
  "data": {
    "filename": "ChatLab-0.2.0-setup.exe",
    "size": 89732705,
    "url": ""
  }
}
```

##### 4. @提及元素（at）

```json
{
  "type": "at",
  "data": {
    "uid": "u_Yv0173q9_9C9V7DMckmeOg",
    "name": "地瓜"
  }
}
```

##### 5. 表情元素（face）

```json
{
  "type": "face",
  "data": {
    "id": "264",
    "name": "/捂脸"
  }
}
```

##### 6. 商城表情元素（market_face）

```json
{
  "type": "market_face",
  "data": {
    "id": "3fbbd60ae4c94002a4dda1beb54a761b",
    "name": "[害羞]"
  }
}
```

##### 7. 回复元素（reply）

```json
{
  "type": "reply",
  "data": {
    "messageId": "0",
    "referencedMessageId": "7600672345327336345",
    "senderName": "u_Yv0173q9_9C9V7DMckmeOg",
    "content": "原消息内容"
  }
}
```

### 5. exportOptions（导出选项）

```json
{
  "includedFields": [
    "id",
    "timestamp",
    "sender",
    "content",
    "resources"
  ],
  "filters": {},
  "options": {
    "includeResourceLinks": true,
    "includeSystemMessages": true,
    "timeFormat": "YYYY-MM-DD HH:mm:ss",
    "encoding": "utf-8"
  }
}
```

## 特殊情况处理

### 1. 撤回消息

撤回的消息 `recalled` 字段为 `true`，但消息内容仍然保留：

```json
{
  "id": "7600669346862595961",
  "recalled": true,
  "content": {
    "text": "[1]"
  }
}
```

### 2. 系统消息

系统消息 `system` 字段为 `true`：

```json
{
  "id": "7674878968852080756",
  "system": true,
  "sender": {
    "uid": "1070511173",
    "uin": "0",
    "name": "0"
  },
  "content": {
    "text": "[4]"
  }
}
```

### 3. 复合消息

一条消息可能包含多个元素：

```json
{
  "content": {
    "text": "[图片: xxx.jpg]非常感谢[/打招呼]@地瓜",
    "elements": [
      {"type": "text", "data": {"text": "[图片: xxx.jpg]非常感谢[/打招呼]@地瓜"}},
      {"type": "image", "data": {...}},
      {"type": "at", "data": {...}},
      {"type": "face", "data": {...}}
    ]
  }
}
```

## 导入适配器实现要点

### 1. 格式识别

通过以下特征识别 QQ Chat Exporter V5 格式：
- 存在 `metadata.name` 包含 "QQChatExporter"
- 存在 `metadata.version` 以 "5." 开头
- 存在 `chatInfo`、`messages` 字段

### 2. 消息角色判断

根据 `sender.uid` 与 `chatInfo.selfUid` 比较：
- 相同：`role = "user"`（自己发送）
- 不同：`role = "assistant"`（他人发送）

### 3. 时间戳转换

```python
# 毫秒时间戳转换为 datetime
timestamp_ms = msg['timestamp']
timestamp_s = timestamp_ms / 1000
created_at = datetime.fromtimestamp(timestamp_s).isoformat()
```

### 4. 消息文本构建

建议策略：
1. 遍历 `elements` 数组
2. 根据元素类型构建文本表示
3. 图片/文件用 `[图片: filename]` 格式
4. @提及用 `@用户名` 格式
5. 表情保留原始文本如 `[/捂脸]`
6. 回复消息添加 `[回复 xxx: ...]` 前缀

### 5. 元数据保存

建议保存的元数据：
```python
{
    'sender_name': '发送者昵称',
    'sender_uid': 'u_xxx',
    'message_id': '消息ID',
    'message_type': 'type_1',
    'recalled': False,
    'system': False
}
```

## 示例代码

参见 `app/service/import_adapters/qq_chat_exporter.py`

## 参考资料

- QQ Chat Exporter 项目: https://github.com/shuakami/qq-chat-exporter
- QQ Chat Exporter 文档: https://github.com/shuakami/qq-chat-exporter/wiki
