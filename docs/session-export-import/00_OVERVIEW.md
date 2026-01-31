# Session 导入导出功能 - 设计概览

## 项目背景

为 MetaHub 应用实现会话（Session）数据的导入导出功能，支持用户备份、迁移和恢复聊天记录。

## 核心目标

1. **导出功能**：将会话及其关联数据（Topics、Messages、MessageParts、Senders）导出为标准格式文件
2. **批量导出**：支持多会话批量导出，按类型分组
3. **增量导出**：支持按时间范围筛选导出
4. **多格式支持**：支持 JSON 和 JSONL 两种导出格式
5. **导入功能**：支持多种格式导入，默认先实现 MetaHub 原生格式
6. **简洁优雅**：设计清晰的 API 和数据格式，易于扩展

## 数据模型关系

```
Session (会话)
├── Topics (话题，可选)
├── Messages (消息)
│   ├── MessageParts (消息部分，多模态支持)
│   └── Sender (发送者引用)
└── Agent (仅关联ID，不导出配置)
```

## 设计文档目录

| 文档 | 描述 |
|-----|------|
| [01_DATA_FORMAT.md](01_DATA_FORMAT.md) | 导出数据格式设计（JSON/JSONL） |
| [02_BACKEND_API.md](02_BACKEND_API.md) | 后端 API 设计（单个/批量/增量） |
| [03_BACKEND_SERVICE.md](03_BACKEND_SERVICE.md) | 后端服务层实现 |
| [04_FRONTEND_API.md](04_FRONTEND_API.md) | 前端 API 集成 |
| [05_FRONTEND_UI.md](05_FRONTEND_UI.md) | 前端 UI 组件设计 |
| [06_IMPORT_ADAPTERS.md](06_IMPORT_ADAPTERS.md) | 导入适配器架构（多格式扩展） |
| [07_IMPLEMENTATION_CHECKLIST.md](07_IMPLEMENTATION_CHECKLIST.md) | 实现检查清单 |

## 技术栈

- **后端**：FastAPI + SQLAlchemy + PostgreSQL
- **前端**：React + TypeScript + shadcn/ui
- **文件格式**：JSON（单会话）、JSONL（批量/流式）

## 核心设计决策

### 导出格式选择

| 格式 | 适用场景 | 特点 |
|-----|---------|------|
| JSON | 单会话导出 | 完整结构，易读 |
| JSONL | 批量导出、大会话 | 流式处理，内存友好 |

### 重复导入处理

导入时始终创建新会话（生成新 UUID），不存在冲突问题。通过以下机制帮助用户识别重复导入：

1. 导出数据包含 `export_id`（导出批次唯一标识）
2. 导入时将 `export_id` 存入 session 的 `metadata.import_info`
3. 用户可通过 metadata 查询是否已导入过相同数据

### 外部资源处理

- **当前**：直接保留 URL/Base64 引用
- **TODO**：预留资源缓存接口，未来支持下载并重新上传

## 安全考虑

- 所有操作需要用户认证
- 导出/导入仅限当前用户的数据
- 导入时验证数据格式和完整性
- 使用流式处理支持大文件

## 后续扩展

- 支持更多导入格式（微信、Telegram、ChatGPT 等）
- 外部资源缓存与重新上传
- 导入进度追踪
- 定时自动备份
