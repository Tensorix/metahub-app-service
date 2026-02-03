#!/usr/bin/env python3
"""Verify the message search refactor migration."""

from sqlalchemy import create_engine, text
from app.config import config

engine = create_engine(config.sqlalchemy_database_uri)

print("🔍 Verifying message search refactor migration...\n")

with engine.connect() as conn:
    # Check embedding_config table
    result = conn.execute(text("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'embedding_config'
        ORDER BY ordinal_position
    """))
    print("✅ embedding_config table:")
    for row in result:
        print(f"   - {row.column_name}: {row.data_type}")
    
    # Check message_search_index table
    result = conn.execute(text("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'message_search_index'
        ORDER BY ordinal_position
    """))
    print("\n✅ message_search_index table:")
    for row in result:
        print(f"   - {row.column_name}: {row.data_type}")
    
    # Check message_embedding table
    result = conn.execute(text("""
        SELECT table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'message_embedding'
        ORDER BY ordinal_position
    """))
    print("\n✅ message_embedding table:")
    for row in result:
        print(f"   - {row.column_name}: {row.data_type}")
    
    # Check HNSW indexes
    result = conn.execute(text("""
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'message_embedding' 
        AND indexname LIKE '%hnsw%'
    """))
    print("\n✅ HNSW indexes:")
    for row in result:
        print(f"   - {row.indexname}")
    
    # Check embedding_config data
    result = conn.execute(text("""
        SELECT category, model_id 
        FROM embedding_config
    """))
    print("\n✅ embedding_config data:")
    for row in result:
        print(f"   - {row.category}: {row.model_id}")

print("\n✨ Migration verification complete!")
