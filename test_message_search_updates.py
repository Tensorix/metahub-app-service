#!/usr/bin/env python3
"""
Test script for message search tool updates:
1. Query is now optional (can search by filters only)
2. Message IDs are included in all results
3. get_message_context also returns message IDs
"""

import sys
from uuid import uuid4
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.model.user import User
from app.db.model.session import Session as ChatSession
from app.db.model.message import Message
from app.db.model.message_sender import MessageSender
from app.db.model.message_part import MessagePart
from app.db.model.message_search_index import MessageSearchIndex
from app.agent.tools.builtin.message_search import search_messages, get_message_context
from app.agent.tools.context import agent_user_id


def setup_test_data(db: Session):
    """创建测试数据"""
    # 创建测试用户
    user = User(
        id=uuid4(),
        username=f"test_user_{uuid4().hex[:8]}",
        password_hash="dummy",
    )
    db.add(user)
    db.flush()

    # 创建测试会话
    session = ChatSession(
        id=uuid4(),
        user_id=user.id,
        name="测试群组",
        type="group",
    )
    db.add(session)
    db.flush()

    # 创建测试发送者
    sender = MessageSender(
        id=uuid4(),
        user_id=user.id,
        name="张三",
        external_id="sender_001",
    )
    db.add(sender)
    db.flush()

    # 创建测试消息
    messages = []
    base_time = datetime.now() - timedelta(days=7)
    
    for i in range(5):
        msg = Message(
            id=uuid4(),
            session_id=session.id,
            sender_id=sender.id,
            role="user",
            created_at=base_time + timedelta(hours=i),
            user_id=user.id,
            version=1,
        )
        db.add(msg)
        db.flush()

        # 添加消息内容
        part = MessagePart(
            id=uuid4(),
            message_id=msg.id,
            type="text",
            content=f"这是测试消息 {i+1}",
            sequence=0,
        )
        db.add(part)

        # 添加搜索索引
        index = MessageSearchIndex(
            id=uuid4(),
            message_id=msg.id,
            user_id=user.id,
            session_id=session.id,
            content_text=f"这是测试消息 {i+1}",
            sender_name=sender.name,
            session_name=session.name,
            session_type=session.type,
            message_created_at=msg.created_at,
        )
        db.add(index)
        messages.append(msg)

    db.commit()
    return user, session, sender, messages


def test_search_without_query():
    """测试不带 query 的搜索（仅使用过滤条件）"""
    print("\n=== Test 1: Search without query (filter only) ===")
    
    db = SessionLocal()
    try:
        user, session, sender, messages = setup_test_data(db)
        
        # 设置用户上下文
        token = agent_user_id.set(user.id)
        
        try:
            # 搜索最近7天的消息（不提供 query）
            start_date = (datetime.now() - timedelta(days=8)).strftime("%Y-%m-%d")
            end_date = datetime.now().strftime("%Y-%m-%d")
            
            result = search_messages(
                query="",  # 空查询
                start_date=start_date,
                end_date=end_date,
                top_k=10,
                include_context=False,
            )
            
            print(f"Result:\n{result}")
            
            # 验证结果包含 message ID
            assert "ID:" in result, "Result should contain message IDs"
            assert "测试消息" in result, "Result should contain message content"
            print("✓ Filter-only search works and includes message IDs")
            
        finally:
            agent_user_id.reset(token)
            
    finally:
        db.close()


def test_search_with_query():
    """测试带 query 的搜索"""
    print("\n=== Test 2: Search with query ===")
    
    db = SessionLocal()
    try:
        user, session, sender, messages = setup_test_data(db)
        
        token = agent_user_id.set(user.id)
        
        try:
            result = search_messages(
                query="测试消息",
                top_k=5,
                include_context=False,
            )
            
            print(f"Result:\n{result}")
            
            # 验证结果包含 message ID
            assert "ID:" in result, "Result should contain message IDs"
            print("✓ Query search works and includes message IDs")
            
        finally:
            agent_user_id.reset(token)
            
    finally:
        db.close()


def test_get_message_context():
    """测试 get_message_context 返回 message IDs"""
    print("\n=== Test 3: Get message context with IDs ===")
    
    db = SessionLocal()
    try:
        user, session, sender, messages = setup_test_data(db)
        
        token = agent_user_id.set(user.id)
        
        try:
            # 获取第一条消息的上下文
            message_id = str(messages[2].id)  # 中间的消息
            
            result = get_message_context(message_id)
            
            print(f"Result:\n{result}")
            
            # 验证结果包含 message ID
            assert "(ID:" in result, "Context should contain message IDs"
            assert "<<<HIT>>>" in result, "Context should mark the hit message"
            print("✓ get_message_context works and includes message IDs")
            
        finally:
            agent_user_id.reset(token)
            
    finally:
        db.close()


def test_search_with_context():
    """测试带上下文的搜索"""
    print("\n=== Test 4: Search with context ===")
    
    db = SessionLocal()
    try:
        user, session, sender, messages = setup_test_data(db)
        
        token = agent_user_id.set(user.id)
        
        try:
            result = search_messages(
                query="测试消息 3",
                top_k=1,
                include_context=True,
            )
            
            print(f"Result:\n{result}")
            
            # 验证结果包含 message ID
            assert "(ID:" in result, "Context messages should contain IDs"
            assert "<<<HIT>>>" in result, "Should mark the hit message"
            print("✓ Search with context works and includes message IDs")
            
        finally:
            agent_user_id.reset(token)
            
    finally:
        db.close()


if __name__ == "__main__":
    try:
        test_search_without_query()
        test_search_with_query()
        test_get_message_context()
        test_search_with_context()
        
        print("\n" + "="*50)
        print("✓ All tests passed!")
        print("="*50)
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
