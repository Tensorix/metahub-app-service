# Embedding 异步优化方案

## 问题描述

消息创建接口在执行 embedding 生成时会卡住一会儿，影响用户体验。embedding 生成是一个耗时操作（通常需要几百毫秒到几秒），不应该阻塞消息创建的响应。

## 解决方案

**核心思路**：消息创建接口立即返回，embedding 生成在后台任务中异步处理，完全不阻塞用户请求。

### 工作流程

```
用户请求创建消息
    ↓
创建 Message 和 MessagePart (50-100ms)
    ↓
立即返回成功响应 ✅
    ↓
后台任务异步执行 (不阻塞)
    ↓
创建搜索索引 + 生成 embedding (500-2000ms)
```

### 架构改动

#### 1. 配置说明 (`app/config/__init__.py`)

```python
# 是否在消息创建时立即触发 embedding 生成（后台任务异步处理）
# True: 收到消息后立即在后台任务中生成 embedding（推荐）
# False: 不自动生成，需要手动运行脚本处理 pending embeddings
SEARCH_SYNC_EMBEDDING: bool = True
```

**重要**：无论此配置为 True 还是 False，消息创建接口都会立即返回，不会阻塞！

- **True（推荐）**: 后台任务立即生成 embedding，几秒后即可向量搜索
- **False**: 后台任务只创建 pending 记录，需要定时脚本处理

#### 2. 消息创建流程优化

**Session 路由** (`app/router/v1/session.py`)
```python
@router.post("/sessions/{session_id}/messages")
def create_message(..., background_tasks: BackgroundTasks):
    # 1. 创建消息（快速）
    message = MessageService.create_message(db, data, current_user.id)
    
    # 2. 添加后台任务（不阻塞）
    background_tasks.add_task(_index_message_background, message.id)
    
    # 3. 立即返回 ✅
    return MessageResponse.model_validate(message)
```

**后台任务** (`_index_message_background`)
```python
def _index_message_background(message_id: UUID):
    """在独立的数据库会话中异步处理索引"""
    db = SessionLocal()  # 新的数据库连接
    try:
        message = MessageService.get_message(db, message_id)
        indexer = SearchIndexerService()
        indexer.index_message(db, message)  # 耗时操作在这里
    finally:
        db.close()
```

**Webhook 服务** (`app/service/webhook.py`)
- Webhook 本身已经在后台任务中运行
- 直接调用 `indexer.index_message()`

**Sync 服务** (`app/service/sync.py`)
- 批量同步时直接调用索引创建
- 由于是批量操作，用户期望等待完成

#### 3. 搜索索引服务 (`app/service/search_indexer.py`)

```python
def index_message(self, db: Session, message: Message):
    """在后台任务中调用，不阻塞主请求"""
    # 1. 创建搜索索引记录
    search_index = MessageSearchIndex(...)
    db.add(search_index)
    db.flush()
    
    # 2. 根据配置决定如何处理 embedding
    if config.SEARCH_SYNC_EMBEDDING:
        # 立即生成（在后台任务中，不阻塞主请求）
        self._generate_embedding_for_index(db, search_index, content_text)
    else:
        # 创建 pending 记录，等待定时脚本处理
        self._create_pending_embedding(db, search_index)
    
    db.commit()
```

## 使用方法

### 推荐配置（默认）

`.env` 文件：
```bash
SEARCH_SYNC_EMBEDDING=true
```

**行为**：
- 消息创建立即返回（50-200ms）
- 后台任务自动生成 embedding（不阻塞）
- 几秒后即可通过向量搜索找到消息
- 无需额外配置

### 可选配置（手动处理）

`.env` 文件：
```bash
SEARCH_SYNC_EMBEDDING=false
```

**行为**：
- 消息创建立即返回（50-200ms）
- 后台任务只创建 pending 记录
- 需要运行定时脚本处理 embedding

**启动定时脚本**：
```bash
# 方式1: cron 定时任务
* * * * * cd /path/to/project && python scripts/process_pending_embeddings.py

# 方式2: 守护进程
python scripts/process_pending_embeddings.py --daemon --interval 10
```

## 性能对比

### 优化前（同步阻塞）
```
用户请求 → 创建消息 → 生成 embedding → 返回响应
         └─────────── 500-2000ms ──────────┘
```
- 响应时间：500-2000ms
- 用户体验：明显卡顿 ❌

### 优化后（异步后台）
```
用户请求 → 创建消息 → 返回响应 ✅
         └── 50-200ms ──┘
                        ↓
              后台任务：生成 embedding
                   (不阻塞用户)
```
- 响应时间：50-200ms
- 用户体验：流畅 ✅
- Embedding 生成：后台异步处理

## 技术细节

### 为什么使用 BackgroundTasks？

FastAPI 的 `BackgroundTasks` 特性：
- 在响应返回后执行
- 使用独立的数据库会话
- 不阻塞主请求
- 自动处理异常

### 为什么 Webhook 不需要 BackgroundTasks？

Webhook 路由本身已经使用了 `BackgroundTasks`：
```python
@router.post("/webhooks/im/message")
def receive_im_message(..., background_tasks: BackgroundTasks):
    background_tasks.add_task(process_im_message_background, ...)
    return {"status": "accepted"}  # 立即返回
```

所以在 `process_im_message_background` 中可以直接调用耗时操作。

## 监控和维护

### 查看处理状态

```python
from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService

db = SessionLocal()
indexer = SearchIndexerService()
stats = indexer.get_stats(db, user_id)

print(f"总索引数: {stats['total_indexed']}")
print(f"已完成: {stats['embedding_completed']}")
print(f"处理中: {stats['embedding_pending']}")
print(f"失败: {stats['embedding_failed']}")
```

### 手动处理 pending embeddings

```bash
# 单次处理
python scripts/process_pending_embeddings.py

# 批量处理
python scripts/process_pending_embeddings.py --batch-size 100
```

### 重试失败的 embeddings

```bash
python scripts/retry_failed_embeddings.py
```

## 注意事项

1. **搜索延迟**: 
   - 文本搜索：立即可用
   - 向量搜索：需要等待后台任务完成（通常几秒）

2. **后台任务失败**: 
   - 失败会记录日志
   - 不影响消息创建
   - 可以通过脚本重试

3. **资源消耗**: 
   - 后台任务消耗 CPU 和 API 配额
   - 建议监控 API 使用量

4. **并发处理**: 
   - FastAPI 自动管理后台任务
   - 多个请求的后台任务并发执行

## 相关文件

- `app/config/__init__.py`: 配置文件
- `app/router/v1/session.py`: Session 路由（使用 BackgroundTasks）
- `app/service/session.py`: Session 服务（移除了同步索引）
- `app/service/webhook.py`: Webhook 服务（已在后台任务中）
- `app/service/sync.py`: Sync 服务（批量操作）
- `app/service/search_indexer.py`: 搜索索引服务
- `scripts/process_pending_embeddings.py`: 定时处理脚本

## 常见问题

**Q: 消息创建后多久可以搜索到？**
A: 
- 文本搜索：立即
- 向量搜索：通常 1-5 秒（取决于后台任务处理速度）

**Q: 如果后台任务失败了怎么办？**
A: 
- 消息创建不受影响
- 可以通过日志查看失败原因
- 运行重试脚本处理失败的 embedding

**Q: 如何确认后台任务正在运行？**
A: 
- 查看应用日志
- 检查数据库中 `message_embedding` 表的 `status` 字段
- 使用 `get_stats()` 方法查看统计信息

**Q: 可以完全禁用 embedding 吗？**
A: 
- 设置 `SEARCH_SYNC_EMBEDDING=false`
- 不运行定时脚本
- 只使用文本搜索功能
