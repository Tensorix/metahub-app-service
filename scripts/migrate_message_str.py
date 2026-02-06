"""
为现有消息生成 message_str

用法: python -m scripts.migrate_message_str
"""

import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.utils.message_utils import parts_to_message_str


def migrate():
    engine = create_engine(str(settings.database_url))
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # 查询所有没有 message_str 的消息
        query = text("""
            SELECT m.id, array_agg(
                json_build_object(
                    'type', mp.type,
                    'content', mp.content,
                    'metadata_', mp.metadata_
                ) ORDER BY mp.created_at
            ) as parts
            FROM message m
            LEFT JOIN message_part mp ON mp.message_id = m.id
            WHERE m.message_str IS NULL
            GROUP BY m.id
        """)

        results = db.execute(query).fetchall()
        print(f"Found {len(results)} messages to migrate")

        batch_size = 100
        for i, (msg_id, parts) in enumerate(results):
            if parts and parts[0] is not None:
                # parts 是 JSON 数组
                parts_list = parts if isinstance(parts, list) else json.loads(parts)
                message_str = parts_to_message_str(parts_list)

                db.execute(
                    text("UPDATE message SET message_str = :msg_str WHERE id = :id"),
                    {"msg_str": message_str, "id": msg_id}
                )

            if (i + 1) % batch_size == 0:
                db.commit()
                print(f"Migrated {i + 1}/{len(results)} messages")

        db.commit()
        print(f"Migration complete: {len(results)} messages updated")

    finally:
        db.close()


if __name__ == "__main__":
    migrate()
