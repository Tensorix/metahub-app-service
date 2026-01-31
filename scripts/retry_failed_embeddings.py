#!/usr/bin/env python
"""
重试失败的 embedding 生成。
建议每 5-10 分钟运行一次。

用法:
    python scripts/retry_failed_embeddings.py
    python scripts/retry_failed_embeddings.py --batch-size 100
"""

import argparse
import sys
sys.path.insert(0, ".")

from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService
from loguru import logger


def main():
    parser = argparse.ArgumentParser(description="Retry failed embedding generation")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size")
    args = parser.parse_args()

    db = SessionLocal()
    indexer = SearchIndexerService()

    try:
        result = indexer.retry_failed_embeddings(db, batch_size=args.batch_size)
        if result["retried"] > 0:
            logger.info(f"Embedding retry result: {result}")
        else:
            logger.info("No failed embeddings to retry")
    except Exception as e:
        logger.error(f"Retry failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
