# 步骤 1：数据格式设计

## 设计原则

1. **完整性**：包含会话完整还原所需的所有数据
2. **可读性**：使用 JSON/JSONL 格式，字段命名清晰
3. **可扩展性**：使用版本号，便于后续格式升级
4. **兼容性**：UUID 保留原始格式，时间使用 ISO 8601
5. **类型分离**：不同 session type 在批量导出时分组存储

## 导出格式

### 格式选择

| 格式 | 扩展名 | 适用场景 |
|-----|--------|---------|
| JSON | `.json` | 单会话导出，完整结构 |
| JSONL | `.jsonl` | 批量导出、大会话、流式处理 |

---

## 一、JSON 格式（单会话）

### 文件命名

```
session_{type}_{session_name}_{timestamp}.json
```

示例：`session_ai_AI对话_20260201_143000.json`

### 数据结构

```json
{
  "format": "metahub",
  "version": "1.0",
  "export_id": "export_20260201_143000_abc123",
  "exported_at": "2026-02-01T14:30:00Z",
  "session": {
    "original_id": "uuid-string",
    "name": "会话名称",
    "type": "ai",
    "source": "manual_upload",
    "metadata": {},
    "created_at": "2026-01-15T10:00:00Z",
    "updated_at": "2026-02-01T12:00:00Z"
  },
  "senders": [
    {
      "original_id": "uuid-string",
      "name": "张三",
      "created_at": "2026-01-15T10:00:00Z"
    }
  ],
  "topics": [
    {
      "original_id": "uuid-string",
      "name": "话题一",
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-01-15T10:00:00Z"
    }
  ],
  "messages": [
    {
      "original_id": "uuid-string",
      "topic_id": "uuid-string | null",
      "role": "user",
      "sender_id": "uuid-string | null",
      "created_at": "2026-01-15T10:01:00Z",
      "updated_at": "2026-01-15T10:01:00Z",
      "parts": [
        {
          "original_id": "uuid-string",
          "type": "text",
          "content": "你好",
          "metadata": null,
          "event_id": null,
          "raw_data": null,
          "created_at": "2026-01-15T10:01:00Z",
          "resource_refs": []
        }
      ]
    }
  ],
  "statistics": {
    "total_messages": 150,
    "total_topics": 3,
    "total_senders": 5,
    "date_range": {
      "earliest": "2026-01-15T10:00:00Z",
      "latest": "2026-02-01T12:00:00Z"
    }
  }
}
```

---

## 二、JSONL 格式（批量/流式）

### 文件命名

```
sessions_export_{type}_{timestamp}.jsonl
```

示例：
- `sessions_export_ai_20260201_143000.jsonl` - 单类型
- `sessions_export_all_20260201_143000.jsonl` - 全部类型

### 数据结构

每行是一个独立的 JSON 对象，便于流式处理：

```jsonl
{"_meta": {"format": "metahub", "version": "1.0", "export_id": "export_xxx", "exported_at": "2026-02-01T14:30:00Z", "type_filter": "ai", "total_sessions": 5}}
{"_type": "session", "original_id": "uuid-1", "name": "会话1", "type": "ai", ...}
{"_type": "sender", "session_ref": "uuid-1", "original_id": "sender-1", "name": "张三", ...}
{"_type": "topic", "session_ref": "uuid-1", "original_id": "topic-1", "name": "话题一", ...}
{"_type": "message", "session_ref": "uuid-1", "original_id": "msg-1", "role": "user", "parts": [...], ...}
{"_type": "message", "session_ref": "uuid-1", "original_id": "msg-2", "role": "assistant", "parts": [...], ...}
{"_type": "session", "original_id": "uuid-2", "name": "会话2", "type": "ai", ...}
...
```

### JSONL 行类型

| `_type` | 说明 |
|---------|------|
| `_meta` | 元信息（必须是第一行） |
| `session` | 会话记录 |
| `sender` | 发送者记录 |
| `topic` | 话题记录 |
| `message` | 消息记录 |

### JSONL 优势

1. **流式写入**：边查询边写入，无需全量加载到内存
2. **流式读取**：逐行解析，内存占用小
3. **易于追加**：可以增量追加新数据
4. **容错性**：某行损坏不影响其他行

---

## 三、批量导出按类型分组

批量导出时，按 session type 分别生成文件：

```
export_20260201_143000/
├── sessions_ai_20260201_143000.jsonl      # AI 对话类型
├── sessions_pm_20260201_143000.jsonl      # 私聊类型
├── sessions_group_20260201_143000.jsonl   # 群聊类型
└── manifest.json                           # 清单文件
```

### manifest.json 结构

```json
{
  "format": "metahub-bundle",
  "version": "1.0",
  "export_id": "export_20260201_143000_abc123",
  "exported_at": "2026-02-01T14:30:00Z",
  "files": [
    {
      "filename": "sessions_ai_20260201_143000.jsonl",
      "type": "ai",
      "session_count": 10,
      "message_count": 500
    },
    {
      "filename": "sessions_pm_20260201_143000.jsonl",
      "type": "pm",
      "session_count": 5,
      "message_count": 200
    }
  ],
  "total_sessions": 15,
  "total_messages": 700
}
```

---

## 四、字段说明

### 顶层字段（JSON 格式）

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| format | string | ✅ | 格式标识，固定为 `metahub` |
| version | string | ✅ | 格式版本号 |
| export_id | string | ✅ | 导出批次唯一标识，用于重复导入检测 |
| exported_at | datetime | ✅ | 导出时间 |
| session | object | ✅ | 会话基本信息 |
| senders | array | ✅ | 发送者列表 |
| topics | array | ✅ | 话题列表 |
| messages | array | ✅ | 消息列表 |
| statistics | object | ✅ | 统计信息 |

### Session 字段

| 字段 | 类型 | 说明 |
|-----|------|------|
| original_id | UUID | 原始会话 ID（导入时用于引用映射） |
| name | string? | 会话名称 |
| type | string | 会话类型：pm/group/ai/plugin |
| source | string? | 来源标识 |
| metadata | object? | 扩展元数据 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

> **注意**：`agent_id` 不导出，Agent 配置不包含在导出数据中

### MessagePart 字段

| 字段 | 类型 | 说明 |
|-----|------|------|
| original_id | UUID | 消息部分原始 ID |
| type | string | 类型：text/image/at/url/json |
| content | string | 内容 |
| metadata | object? | 扩展元数据 |
| event_id | string? | 关联事件 ID |
| raw_data | object? | 原始数据 |
| created_at | datetime | 创建时间 |
| resource_refs | array | 外部资源引用列表 |

### 外部资源引用（resource_refs）

```json
{
  "resource_refs": [
    {
      "type": "image",
      "url": "https://example.com/image.png",
      "cached": false,
      "cache_path": null
    }
  ]
}
```

> **TODO**：资源缓存功能暂不实现，预留 `cached` 和 `cache_path` 字段

---

## 五、导入时的处理策略

### ID 映射

```
导入时的 ID 映射策略：

1. 生成新 UUID：所有实体导入时生成新的 UUID
2. 维护映射表：original_id -> new_id 的映射关系
3. 更新引用：使用映射表更新所有外键引用
   - message.topic_id -> 映射后的新 topic_id
   - message.sender_id -> 映射后的新 sender_id
```

### 重复导入检测

导入时将 `export_id` 存入 session 的 metadata：

```json
{
  "metadata": {
    "import_info": {
      "export_id": "export_20260201_143000_abc123",
      "imported_at": "2026-02-02T10:00:00Z",
      "original_session_id": "uuid-string"
    }
  }
}
```

用户可通过查询 metadata 来识别重复导入。

### 增量导出参数

通过 `start_date` 和 `end_date` 筛选消息：

- 仅导出时间范围内的消息
- session、topics、senders 仍完整导出
- statistics 中标注筛选条件

---

## 六、版本兼容性

| 版本 | 支持状态 | 说明 |
|-----|---------|------|
| 1.0 | 当前版本 | 完整功能，支持 JSON/JSONL |
| 0.x | 预留 | 兼容旧版格式 |

> **注意**：导入时根据 version 字段选择对应的解析器
