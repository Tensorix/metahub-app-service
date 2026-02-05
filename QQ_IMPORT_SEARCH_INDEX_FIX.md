# QQ 导入搜索索引问题修复

## 问题描述

导入的群聊数据无法通过 Agent 的 `search_messages` 工具搜索到。

## 根本原因

导入会话时只创建了基础数据（Session、Message、MessagePart 等），**没有创建搜索索引**：
- `message_search_index` 表（文本索引 + 元数据）
- `message_embedding` 表（向量嵌入）

**关键点：**
- **所有搜索模式（包括模糊搜索）都依赖 `message_search_index` 表**
- 搜索引擎不直接查询 `message` 表，而是查询优化后的 `message_search_index` 表
- 即使不生成 embedding，也必须创建 `message_search_index` 记录才能使用模糊搜索

**为什么这样设计？**
1. 性能优化：`message_search_index` 有专门的 pg_trgm GIN 索引
2. 预处理文本：避免实时 JOIN `message_part` 表
3. 反范式存储：快速过滤（session_name, sender_name 等）
4. 搜索隔离：只索引需要搜索的消息类型（pm/group）

## 解决方案

### 方案 1：运行回填脚本（立即解决）

为已导入的消息创建搜索索引：

```bash
# 1. 获取你的用户 ID
# 方法 A: 通过数据库查询
psql -U postgres -d metahub -c "SELECT id, username FROM \"user\";"

# 方法 B: 通过 API（如果已登录）
# 在浏览器开发者工具中查看 localStorage 中的用户信息

# 2. 运行回填脚本
python scripts/backfill_search_index.py --user-id <your-user-id>

# 3. 可选：只为特定会话创建索引
python scripts/backfill_search_index.py --user-id <your-user-id> --session-id <session-id>

# 4. 可选：重新生成所有 embeddings
python scripts/backfill_search_index.py --user-id <your-user-id> --regenerate-embeddings
```

**脚本参数说明：**
- `--user-id`: 必需，用户 UUID
- `--session-id`: 可选，只处理特定会话
- `--regenerate-embeddings`: 可选，重新生成所有向量嵌入
- `--batch-size`: 可选，批处理大小（默认 100）

### 方案 2：修改导入代码（已完成）

已修改 `app/service/session_transfer.py`，在导入完成后自动创建搜索索引。

**修改内容：**
1. 导入完成后检查会话类型（pm/group）
2. 调用 `SearchIndexerService.index_message()` 为每条消息创建索引
3. 索引创建失败不影响导入流程（只记录错误日志）

**生效时间：**
- 新导入的会话会自动创建索引
- 已导入的会话需要运行回填脚本

## 验证搜索功能

### 1. 检查索引状态

```bash
# 查看索引统计
psql -U postgres -d metahub -c "
SELECT 
    u.username,
    COUNT(msi.id) as indexed_messages,
    COUNT(me.id) as with_embedding,
    COUNT(CASE WHEN me.status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN me.status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN me.status = 'failed' THEN 1 END) as failed
FROM \"user\" u
LEFT JOIN message_search_index msi ON msi.user_id = u.id
LEFT JOIN message_embedding me ON me.search_index_id = msi.id
GROUP BY u.id, u.username;
"
```

### 2. 测试搜索功能

在 Agent 对话中测试：

```
# 测试关键词搜索
搜索包含"测试"的消息

# 测试发送者过滤
搜索张三发送的消息

# 测试群组过滤
搜索技术群中的消息

# 测试时间范围
搜索 2025-01-01 之后的消息
```

### 3. 查看搜索日志

```bash
# 查看 Agent 工具调用日志
tail -f logs/app.log | grep "search_messages"
```

## 搜索配置

相关配置在 `.env` 文件中：

```bash
# 是否在消息创建时立即生成 embedding（推荐开启）
SEARCH_SYNC_EMBEDDING=true

# 上下文窗口大小（无 topic 时返回前后各 N 条消息）
SEARCH_CONTEXT_WINDOW_SIZE=5

# 搜索阈值
SEARCH_FUZZY_THRESHOLD=0.1      # 模糊搜索最低相似度
SEARCH_VECTOR_THRESHOLD=0.3     # 向量搜索最低相似度

# 混合搜索权重
SEARCH_FUZZY_WEIGHT=0.4         # 文本搜索权重
SEARCH_VECTOR_WEIGHT=0.6        # 向量搜索权重

# 默认返回结果数
SEARCH_DEFAULT_TOP_K=20
```

## 常见问题

### Q1: 回填脚本运行很慢？

**原因：** 需要为每条消息生成 embedding（调用 OpenAI API）

**解决：**
- **只创建文本索引，不生成 embedding**（推荐）：
  ```bash
  # 1. 修改配置
  SEARCH_SYNC_EMBEDDING=false
  
  # 2. 运行回填（只创建 message_search_index，不生成向量）
  python scripts/backfill_search_index.py --user-id <your-user-id>
  
  # 这样模糊搜索就能工作，但没有语义搜索
  ```

- 增加批处理大小：`--batch-size 200`
- 使用更快的 embedding 模型（配置在 `app/config/embedding.py`）
- 分批处理：先处理重要会话，再处理其他会话

### Q2: 搜索结果不准确？

**可能原因：**
1. Embedding 未生成完成（状态为 pending）
2. 搜索阈值设置过高
3. 搜索权重配置不合理

**解决：**
```bash
# 1. 检查 pending embeddings
python scripts/process_pending_embeddings.py

# 2. 调整搜索阈值（降低阈值）
SEARCH_FUZZY_THRESHOLD=0.05
SEARCH_VECTOR_THRESHOLD=0.2

# 3. 调整权重（增加文本搜索权重）
SEARCH_FUZZY_WEIGHT=0.6
SEARCH_VECTOR_WEIGHT=0.4
```

### Q3: 导入后搜索索引没有自动创建？

**检查：**
1. 确认代码已更新（`app/service/session_transfer.py`）
2. 重启后端服务
3. 查看导入日志是否有错误

**临时方案：**
运行回填脚本手动创建索引

## 相关文件

- `app/service/session_transfer.py` - 导入服务（已修改）
- `app/service/search_indexer.py` - 搜索索引服务
- `scripts/backfill_search_index.py` - 回填脚本
- `app/agent/tools/builtin/message_search.py` - 搜索工具
- `app/config/embedding.py` - Embedding 模型配置

## 总结

1. **立即解决：** 运行 `backfill_search_index.py` 脚本创建 `message_search_index` 记录
2. **长期方案：** 代码已修改，新导入会自动创建索引
3. **性能优化：** 如果不需要语义搜索，设置 `SEARCH_SYNC_EMBEDDING=false` 跳过 embedding 生成
4. **验证：** 通过 Agent 测试搜索功能
5. **配置调整：** 根据需要调整搜索配置参数

**重要提醒：**
- 模糊搜索和语义搜索都需要 `message_search_index` 表
- `message_embedding` 只影响语义搜索，不影响模糊搜索
- 如果只用模糊搜索，可以不生成 embedding 以节省时间和 API 费用
