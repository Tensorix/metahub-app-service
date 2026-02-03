#!/usr/bin/env python3
"""
后台任务：处理 pending 状态的 embeddings

使用方法：
1. 单次运行：python scripts/process_pending_embeddings.py
2. 定时运行：使用 cron 或其他调度工具定期执行
3. 持续运行：python scripts/process_pending_embeddings.py --daemon --interval 10

建议配置：
- 将 SEARCH_SYNC_EMBEDDING 设为 False
- 使用 cron 每分钟运行一次此脚本
- 或使用 --daemon 模式持续运行
"""

import argparse
import time
from loguru import logger

from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService


def process_batch(batch_size: int = 50) -> dict:
    """处理一批 pending embeddings"""
    db = SessionLocal()
    try:
        indexer = SearchIndexerService()
        stats = indexer.process_pending_embeddings(db, batch_size=batch_size)
        logger.info(f"Processed pending embeddings: {stats}")
        return stats
    except Exception as e:
        logger.error(f"Failed to process pending embeddings: {e}")
        return {"processed": 0, "succeeded": 0, "failed": 0}
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Process pending embeddings")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of embeddings to process per batch (default: 50)",
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run continuously in daemon mode",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=10,
        help="Interval in seconds between batches in daemon mode (default: 10)",
    )
    
    args = parser.parse_args()
    
    if args.daemon:
        logger.info(f"Starting daemon mode with {args.interval}s interval")
        while True:
            stats = process_batch(args.batch_size)
            if stats["processed"] == 0:
                # No pending embeddings, wait longer
                time.sleep(args.interval)
            else:
                # Process next batch immediately if there are more
                time.sleep(1)
    else:
        # Single run
        stats = process_batch(args.batch_size)
        logger.info(f"Completed: {stats}")


if __name__ == "__main__":
    main()
