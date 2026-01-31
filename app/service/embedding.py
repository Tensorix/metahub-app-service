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
