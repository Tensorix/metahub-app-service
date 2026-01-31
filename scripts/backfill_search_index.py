#!/usr/bin/env python
"""
批量回填搜索索引的独立脚本。

用法:
    python scripts/backfill_search_index.py --user-id <uuid>
    python scripts/backfill_search_index.py --user-id <uuid> --session-id <uuid>
    python scripts/backfill_search_index.py --user-id <uuid> --regenerate-embeddings
    python scripts/backfill_search_index.py --user-id <uuid> --batch-size 200
"""

import argparse
import sys
from uuid import UUID

sys.path.insert(0, ".")

from app.db.session import SessionLocal
from app.service.search_indexer import SearchIndexerService
from loguru import logger


def main():
    parser = argparse.ArgumentParser(description="Backfill message search index")
    parser.add_argument("--user-id", type=str, required=True, help="User ID to reindex")
    parser.add_argument("--session-id", type=str, default=None, help="Session ID to reindex")
    parser.add_argument("--regenerate-embeddings", action="store_true", help="Regenerate all embeddings")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size")
    args = parser.parse_args()

    db = SessionLocal()
    indexer = SearchIndexerService()

    try:
        logger.info(f"Starting reindex for user {args.user_id}")
        result = indexer.reindex(
            db=db,
            user_id=UUID(args.user_id),
            session_id=UUID(args.session_id) if args.session_id else None,
            regenerate_embeddings=args.regenerate_embeddings,
            batch_size=args.batch_size,
        )
        logger.info(f"Reindex completed: {result}")
    except Exception as e:
        logger.error(f"Reindex failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
