# Step 2: Embedding 生成管线

## 1. 概述

Embedding 管线负责将消息文本转换为 3072 维向量，写入 `message_search_index.embedding` 字段。

管线分为两个模式：
- **实时模式**：新消息创建后立即生成 embedding
- **批量模式**：为存量消息批量回填 embedding（见 Step 6）

## 2. EmbeddingService 实现

```python
# app/service/embedding.py

from typing import Optional
from openai import OpenAI
from app.config import config
from loguru import logger


class EmbeddingService:
    """Embedding 生成服务"""

    # 模型配置
    MODEL = "text-embedding-3-large"
    DIMENSIONS = 3072

    # 限制
    MAX_TOKENS = 8191          # text-embedding-3-large 的最大输入 token 数
    MIN_CONTENT_LENGTH = 2     # 少于此长度的内容跳过 embedding
    MAX_BATCH_SIZE = 100       # OpenAI batch embedding 最大数量

    def __init__(self):
        self._client = OpenAI(
            api_key=config.OPENAI_API_KEY,
            base_url=config.OPENAI_BASE_URL,
        )

    def generate_embedding(self, text: str) -> Optional[list[float]]:
        """
        为单条文本生成 embedding 向量。

        Args:
            text: 输入文本

        Returns:
            3072 维向量列表，如果文本过短则返回 None
        """
        if not text or len(text.strip()) < self.MIN_CONTENT_LENGTH:
            return None

        # 截断过长文本（粗略估算，1 个中文字符 ≈ 2 tokens）
        truncated = text[:self.MAX_TOKENS * 2]

        try:
            response = self._client.embeddings.create(
                model=self.MODEL,
                input=truncated,
                dimensions=self.DIMENSIONS,
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    def generate_embeddings_batch(
        self, texts: list[str]
    ) -> list[Optional[list[float]]]:
        """
        批量生成 embedding 向量。

        Args:
            texts: 输入文本列表

        Returns:
            对应位置的向量列表，过短文本对应位置为 None
        """
        results: list[Optional[list[float]]] = [None] * len(texts)

        # 分离有效文本和索引
        valid_indices = []
        valid_texts = []
        for i, text in enumerate(texts):
            if text and len(text.strip()) >= self.MIN_CONTENT_LENGTH:
                valid_indices.append(i)
                valid_texts.append(text[:self.MAX_TOKENS * 2])

        if not valid_texts:
            return results

        # 分批调用 API
        for batch_start in range(0, len(valid_texts), self.MAX_BATCH_SIZE):
            batch_end = min(batch_start + self.MAX_BATCH_SIZE, len(valid_texts))
            batch_texts = valid_texts[batch_start:batch_end]
            batch_indices = valid_indices[batch_start:batch_end]

            try:
                response = self._client.embeddings.create(
                    model=self.MODEL,
                    input=batch_texts,
                    dimensions=self.DIMENSIONS,
                )
                for j, embedding_data in enumerate(response.data):
                    original_idx = batch_indices[j]
                    results[original_idx] = embedding_data.embedding
            except Exception as e:
                logger.error(
                    f"Batch embedding failed for batch "
                    f"[{batch_start}:{batch_end}]: {e}"
                )
                # 标记这批为失败，不影响其他批次
                # 调用方可以通过检查 None 来重试
                continue

        return results

    def generate_query_embedding(self, query: str) -> Optional[list[float]]:
        """
        为搜索查询生成 embedding。
        与 generate_embedding 逻辑相同，但语义上区分用途。

        Args:
            query: 搜索查询文本

        Returns:
            3072 维向量列表
        """
        if not query or len(query.strip()) < 1:
            return None

        try:
            response = self._client.embeddings.create(
                model=self.MODEL,
                input=query.strip(),
                dimensions=self.DIMENSIONS,
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Query embedding generation failed: {e}")
            raise
```

## 3. 文本提取逻辑

从 `MessagePart` 中提取并拼接可搜索文本：

```python
# app/service/search_indexer.py (部分)

from app.db.model.message import Message
from app.db.model.message_part import MessagePart


def extract_searchable_text(message: Message) -> str:
    """
    从消息的所有 parts 中提取可搜索文本。

    规则:
    - type='text': 直接使用 content
    - type='at': 提取 @提及的名称
    - type='url': 提取 URL（可能包含有意义的路径）
    - type='image': 跳过（纯二进制/base64）
    - type='json': 跳过（结构化数据，不适合文本搜索）

    多个 parts 之间用换行符连接。
    """
    text_parts = []

    for part in message.parts:
        if part.type == "text":
            text_parts.append(part.content)
        elif part.type == "at":
            # @提及通常包含用户名
            text_parts.append(f"@{part.content}")
        elif part.type == "url":
            text_parts.append(part.content)
        # image 和 json 类型跳过

    return "\n".join(text_parts).strip()
```

## 4. 文本预处理

```python
# app/service/search_indexer.py (部分)

import re


def preprocess_text(text: str) -> str:
    """
    对提取的文本进行预处理，优化搜索质量。

    处理步骤:
    1. 去除多余空白
    2. 去除特殊控制字符
    3. 保留中英文标点（不做过度清洗）
    """
    if not text:
        return ""

    # 去除控制字符（保留换行和空格）
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # 合并连续空白
    text = re.sub(r'\s+', ' ', text)

    return text.strip()
```

## 5. Embedding 状态管理

```
消息创建
    │
    ▼
创建 search_index 记录 (embedding_status = 'pending')
    │
    ▼
调用 EmbeddingService.generate_embedding()
    │
    ├─ 成功 → embedding_status = 'completed'
    ├─ 文本过短 → embedding_status = 'skipped'
    └─ API 错误 → embedding_status = 'failed'
                        │
                        ▼
                  后续可通过批量任务重试 failed 记录
```

## 6. 成本和性能考量

### OpenAI Embedding API 成本
- `text-embedding-3-large`: $0.13 / 1M tokens
- 预估单条消息平均 ~50 tokens → $0.0000065 / 条
- 10 万条消息 ≈ $0.65

### 性能优化
- **批量调用**：OpenAI 支持单次请求传入多条文本（最多 2048 条），利用 `generate_embeddings_batch` 减少 API 调用次数
- **异步处理**：embedding 生成不阻塞消息创建（先写索引记录，status=pending，后台生成 embedding）
- **失败重试**：定时任务扫描 `embedding_status = 'failed'` 的记录重试

### 文本长度阈值
- **跳过阈值** (`MIN_CONTENT_LENGTH = 2`)：纯表情、单字符等不生成 embedding
- **截断阈值** (`MAX_TOKENS * 2`)：超长文本截断后再生成 embedding，避免 token 超限
