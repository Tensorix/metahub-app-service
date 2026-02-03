# Step 2: Embedding Provider 层与生成管线

## 1. 概述

Embedding 管线负责将消息文本转换为向量，写入 `message_embedding` 表。

核心变更（相比旧设计）：
- **模型注册表**：代码中定义所有可用模型及其配置
- **Provider 抽象层**：支持 OpenAI、通用 HTTP（Ollama/TEI/vLLM）等任意 embedding 提供商
- **EmbeddingService 重构**：通用调度层，根据 model_config 路由到对应 Provider

```
EmbeddingModelConfig 注册表
        │
        ▼
EmbeddingService (调度层)
  ├── create_provider(config) → 工厂函数
  ├── OpenAIProvider     — OpenAI / Azure / 兼容 API
  ├── HTTPProvider       — 通用 HTTP (Ollama, TEI, vLLM)
  └── (可扩展)
```

## 2. 模型注册表

```python
# app/config/embedding.py

from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingModelConfig:
    """单个 embedding 模型的配置。"""

    model_id: str              # 注册表 key，如 "openai-3-large"
    provider: str              # "openai" | "http"
    model_name: str            # 传给 API 的模型名称
    dimensions: int            # 输出向量维度
    max_tokens: int = 8191
    batch_size: int = 100
    api_base_url: str | None = None
    api_key_env: str | None = None  # 环境变量名，用于覆盖默认 API key

    @property
    def index_cast(self) -> str:
        """索引和查询时的 cast 表达式，统一 halfvec"""
        return f"halfvec({self.dimensions})"

    @property
    def cosine_ops(self) -> str:
        return "halfvec_cosine_ops"

    @property
    def index_slug(self) -> str:
        """用于索引名的 sanitized model_id"""
        return self.model_id.replace("-", "_").replace(".", "_")


EMBEDDING_MODELS: dict[str, EmbeddingModelConfig] = {
    "openai-3-large": EmbeddingModelConfig(
        model_id="openai-3-large",
        provider="openai",
        model_name="text-embedding-3-large",
        dimensions=3072,
    ),
    "openai-3-small": EmbeddingModelConfig(
        model_id="openai-3-small",
        provider="openai",
        model_name="text-embedding-3-small",
        dimensions=1536,
    ),
    "bge-m3": EmbeddingModelConfig(
        model_id="bge-m3",
        provider="http",
        model_name="BAAI/bge-m3",
        dimensions=1024,
        api_base_url="http://localhost:8080",
    ),
}

DEFAULT_EMBEDDING_MODEL = "openai-3-large"


def get_model_config(model_id: str) -> EmbeddingModelConfig:
    """按 model_id 获取配置。未注册则抛 KeyError。"""
    if model_id not in EMBEDDING_MODELS:
        raise KeyError(f"Unknown embedding model '{model_id}'. "
                       f"Registered: {list(EMBEDDING_MODELS.keys())}")
    return EMBEDDING_MODELS[model_id]
```

### 注册新模型

在 `EMBEDDING_MODELS` 中添加条目即可：

```python
"voyage-3-lite": EmbeddingModelConfig(
    model_id="voyage-3-lite",
    provider="openai",         # Voyage API 兼容 OpenAI 格式
    model_name="voyage-3-lite",
    dimensions=512,
    api_base_url="https://api.voyageai.com/v1",
    api_key_env="VOYAGE_API_KEY",
),
```

## 3. EmbeddingProvider 抽象层

```python
# app/service/embedding.py

from abc import ABC, abstractmethod
from typing import Optional
from loguru import logger

from app.config.embedding import EmbeddingModelConfig


class EmbeddingProvider(ABC):
    """Embedding 提供商抽象基类。"""

    def __init__(self, config: EmbeddingModelConfig):
        self._config = config

    @abstractmethod
    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        """批量生成 embedding。输入已过滤、截断。"""
        ...

    @abstractmethod
    def generate_single(self, text: str) -> list[float]:
        """单条生成 embedding。"""
        ...
```

### 3.1 OpenAIProvider

```python
class OpenAIProvider(EmbeddingProvider):
    """OpenAI / Azure OpenAI / 兼容 API 的 Provider。"""

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        import os
        from openai import OpenAI

        api_key = (
            os.environ.get(config.api_key_env)
            if config.api_key_env
            else None
        )
        kwargs = {}
        if api_key:
            kwargs["api_key"] = api_key
        else:
            # 使用全局配置
            from app.config import config as app_config
            kwargs["api_key"] = app_config.OPENAI_API_KEY

        if config.api_base_url:
            kwargs["base_url"] = config.api_base_url
        else:
            from app.config import config as app_config
            kwargs["base_url"] = app_config.OPENAI_BASE_URL

        self._client = OpenAI(**kwargs)

    def generate_single(self, text: str) -> list[float]:
        response = self._client.embeddings.create(
            model=self._config.model_name,
            input=text,
            dimensions=self._config.dimensions,
        )
        return response.data[0].embedding

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        response = self._client.embeddings.create(
            model=self._config.model_name,
            input=texts,
            dimensions=self._config.dimensions,
        )
        # OpenAI 按 index 排序返回
        sorted_data = sorted(response.data, key=lambda d: d.index)
        return [d.embedding for d in sorted_data]
```

### 3.2 HTTPProvider

```python
class HTTPProvider(EmbeddingProvider):
    """通用 HTTP Provider，适用于 Ollama / HuggingFace TEI / vLLM 等。

    约定请求格式 (兼容 OpenAI /v1/embeddings):
        POST {api_base_url}/v1/embeddings
        {"model": "...", "input": ["text1", "text2"]}

    响应格式:
        {"data": [{"embedding": [...], "index": 0}, ...]}
    """

    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        import httpx
        self._client = httpx.Client(
            base_url=config.api_base_url,
            timeout=60.0,
        )

    def generate_single(self, text: str) -> list[float]:
        return self.generate_batch([text])[0]

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        response = self._client.post(
            "/v1/embeddings",
            json={"model": self._config.model_name, "input": texts},
        )
        response.raise_for_status()
        data = response.json()["data"]
        sorted_data = sorted(data, key=lambda d: d["index"])
        return [d["embedding"] for d in sorted_data]
```

### 3.3 Provider 工厂

```python
_PROVIDER_MAP = {
    "openai": OpenAIProvider,
    "http": HTTPProvider,
}


def create_provider(config: EmbeddingModelConfig) -> EmbeddingProvider:
    """根据 config.provider 创建对应的 EmbeddingProvider 实例。"""
    cls = _PROVIDER_MAP.get(config.provider)
    if cls is None:
        raise ValueError(
            f"Unknown provider '{config.provider}'. "
            f"Available: {list(_PROVIDER_MAP.keys())}"
        )
    return cls(config)
```

## 4. EmbeddingService（调度层）

```python
class EmbeddingService:
    """通用调度层 — 根据 model_config 路由到对应 Provider。"""

    MIN_CONTENT_LENGTH = 2  # 少于此长度跳过 embedding

    def __init__(self, model_config: EmbeddingModelConfig):
        self._config = model_config
        self._provider = create_provider(model_config)

    def generate_embedding(self, text: str) -> Optional[list[float]]:
        """为单条文本生成 embedding。文本过短返回 None。"""
        if not text or len(text.strip()) < self.MIN_CONTENT_LENGTH:
            return None

        truncated = text[: self._config.max_tokens * 2]
        try:
            return self._provider.generate_single(truncated)
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise

    def generate_embeddings_batch(
        self, texts: list[str]
    ) -> list[Optional[list[float]]]:
        """批量生成 embedding。过短文本对应位置为 None。"""
        results: list[Optional[list[float]]] = [None] * len(texts)

        valid_indices = []
        valid_texts = []
        for i, text in enumerate(texts):
            if text and len(text.strip()) >= self.MIN_CONTENT_LENGTH:
                valid_indices.append(i)
                valid_texts.append(text[: self._config.max_tokens * 2])

        if not valid_texts:
            return results

        batch_size = self._config.batch_size
        for start in range(0, len(valid_texts), batch_size):
            end = min(start + batch_size, len(valid_texts))
            batch_texts = valid_texts[start:end]
            batch_indices = valid_indices[start:end]
            try:
                embeddings = self._provider.generate_batch(batch_texts)
                for j, emb in enumerate(embeddings):
                    results[batch_indices[j]] = emb
            except Exception as e:
                logger.error(
                    f"Batch embedding failed [{start}:{end}]: {e}"
                )
                continue

        return results

    def generate_query_embedding(self, query: str) -> Optional[list[float]]:
        """为搜索查询生成 embedding。"""
        if not query or len(query.strip()) < 1:
            return None
        try:
            return self._provider.generate_single(query.strip())
        except Exception as e:
            logger.error(f"Query embedding failed: {e}")
            raise
```

## 5. 获取活跃模型的 EmbeddingService

```python
# 工具函数，供 search_indexer 和 search_service 使用

from sqlalchemy.orm import Session
from app.db.model.embedding_config import EmbeddingConfig
from app.config.embedding import (
    get_model_config, DEFAULT_EMBEDDING_MODEL,
)


def get_active_embedding_service(
    db: Session, category: str = "message"
) -> tuple[EmbeddingService, EmbeddingModelConfig]:
    """
    从 embedding_config 表查询活跃 model_id，
    返回对应的 (EmbeddingService, EmbeddingModelConfig)。
    """
    row = db.query(EmbeddingConfig).filter(
        EmbeddingConfig.category == category
    ).first()
    model_id = row.model_id if row else DEFAULT_EMBEDDING_MODEL
    config = get_model_config(model_id)
    return EmbeddingService(config), config
```

## 6. 文本提取逻辑

从 `MessagePart` 中提取并拼接可搜索文本（与旧设计相同，不变）：

```python
# app/service/search_indexer.py (部分)

def extract_searchable_text(message: Message) -> str:
    """
    从消息的所有 parts 中提取可搜索文本。

    规则:
    - type='text': 直接使用 content
    - type='at': 提取 @提及的名称
    - type='url': 提取 URL
    - type='image': 跳过
    - type='json': 跳过
    """
    text_parts = []
    for part in message.parts:
        if part.type == "text":
            text_parts.append(part.content)
        elif part.type == "at":
            text_parts.append(f"@{part.content}")
        elif part.type == "url":
            text_parts.append(part.content)
    return "\n".join(text_parts).strip()
```

## 7. 文本预处理

```python
import re

def preprocess_text(text: str) -> str:
    """对提取的文本进行预处理。"""
    if not text:
        return ""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()
```

## 8. Embedding 状态管理

```
消息创建
    │
    ▼
创建 message_search_index 记录（纯文本）
    │
    ▼
获取活跃模型 (embedding_config → model_id)
    │
    ▼
创建 message_embedding 记录 (status = 'pending')
    │
    ▼
调用对应 Provider.generate_single()
    │
    ├─ 成功 → status = 'completed', 写入 embedding
    ├─ 文本过短 → 不创建 message_embedding 记录
    └─ API 错误 → status = 'failed'
                        │
                        ▼
                  后续可通过批量任务重试 failed 记录
```

## 9. 成本和性能考量

### Embedding API 成本

| 模型 | 价格 | 维度 | 预估单条 |
|------|------|------|----------|
| `text-embedding-3-large` | $0.13 / 1M tokens | 3072 | $0.0000065 / 条 |
| `text-embedding-3-small` | $0.02 / 1M tokens | 1536 | $0.0000010 / 条 |
| bge-m3 (本地) | 免费 | 1024 | 仅算力成本 |

### 性能优化
- **批量调用**：利用 `generate_embeddings_batch` 减少 API 调用次数
- **异步处理**：embedding 生成不阻塞消息创建（先写 search_index，status=pending，后台生成）
- **失败重试**：定时任务扫描 `status = 'failed'` 的 `message_embedding` 记录重试
- **halfvec 存储**：float16 存储减半，3072 维 12KB → 6KB/条

### 文本长度阈值
- **跳过阈值** (`MIN_CONTENT_LENGTH = 2`)：纯表情、单字符等不生成 embedding
- **截断阈值** (`max_tokens * 2`)：超长文本截断后再生成 embedding，避免 token 超限

## 10. 扩展新 Provider

实现 `EmbeddingProvider` 接口并注册到 `_PROVIDER_MAP` 即可：

```python
class CohereProvider(EmbeddingProvider):
    def __init__(self, config: EmbeddingModelConfig):
        super().__init__(config)
        import cohere
        self._client = cohere.Client(api_key=...)

    def generate_single(self, text: str) -> list[float]:
        response = self._client.embed(
            texts=[text],
            model=self._config.model_name,
            input_type="search_document",
        )
        return response.embeddings[0]

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        response = self._client.embed(
            texts=texts,
            model=self._config.model_name,
            input_type="search_document",
        )
        return response.embeddings

# 注册
_PROVIDER_MAP["cohere"] = CohereProvider
```
