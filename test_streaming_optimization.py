"""
测试流式消息优化功能

测试场景：
1. 简单文本消息
2. 包含工具调用的消息（如果 agent 支持）
3. 验证 message_str 字段生成
4. 验证 parts 正确保存
"""

import asyncio
import json
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.model import Session as SessionModel, Agent, Topic, Message, MessagePart
from app.db.model.user import User
from app.agent import AgentFactory


async def test_simple_message():
    """测试简单文本消息"""
    print("\n=== 测试 1: 简单文本消息 ===")
    
    db = SessionLocal()
    try:
        # 获取测试用户
        user = db.query(User).first()
        if not user:
            print("❌ 没有找到用户，请先创建用户")
            return
        
        print(f"✓ 使用用户: {user.username}")
        
        # 获取或创建 AI session
        session = db.query(SessionModel).filter(
            SessionModel.user_id == user.id,
            SessionModel.type == "ai",
            SessionModel.is_deleted == False
        ).first()
        
        if not session:
            print("❌ 没有找到 AI session，请先创建")
            return
        
        print(f"✓ 使用 session: {session.id}")
        
        # 获取 agent
        agent = db.query(Agent).filter(
            Agent.id == session.agent_id,
            Agent.is_deleted == False
        ).first()
        
        if not agent:
            print("❌ 没有找到 agent")
            return
        
        print(f"✓ 使用 agent: {agent.name}")
        
        # 创建 topic
        topic = Topic(
            user_id=user.id,
            session_id=session.id,
            name="测试流式优化"
        )
        db.add(topic)
        db.commit()
        db.refresh(topic)
        
        print(f"✓ 创建 topic: {topic.id}")
        
        # 保存用户消息
        user_message = Message(
            user_id=user.id,
            session_id=session.id,
            topic_id=topic.id,
            role="user",
            message_str="你好，请介绍一下你自己"
        )
        db.add(user_message)
        db.commit()
        db.refresh(user_message)
        
        user_part = MessagePart(
            message_id=user_message.id,
            type="text",
            content="你好，请介绍一下你自己",
            metadata_={}
        )
        db.add(user_part)
        db.commit()
        
        print(f"✓ 保存用户消息: {user_message.id}")
        
        # 获取 agent service
        agent_config = AgentFactory.build_agent_config(agent)
        agent_service = await AgentFactory.get_agent(agent.id, agent_config)
        
        print("✓ 获取 agent service")
        
        # 收集流式响应
        from app.router.v1.agent_chat import StreamingCollector
        
        collector = StreamingCollector()
        active_call_id = None
        
        print("\n开始流式对话...")
        
        thread_id = f"topic_{topic.id}"
        
        async for event in agent_service.chat_stream(
            "你好，请介绍一下你自己",
            thread_id=thread_id,
            user_id=user.id,
            session_id=session.id,
        ):
            event_type = event.get("event")
            event_data = event.get("data", {})
            
            print(f"  事件: {event_type}")
            
            if event_type == "message":
                content = event_data.get("content", "")
                collector.add_text(content)
                print(f"    内容: {content[:50]}...")
            
            elif event_type == "thinking":
                content = event_data.get("content", "")
                collector.add_thinking(content)
                print(f"    思考: {content[:50]}...")
            
            elif event_type == "tool_call":
                name = event_data.get("name", "")
                args = event_data.get("args", {})
                active_call_id = collector.add_tool_call(name, args)
                print(f"    工具调用: {name}")
            
            elif event_type == "tool_result":
                name = event_data.get("name", "")
                result = event_data.get("result", "")
                if active_call_id:
                    collector.add_tool_result(name, result, active_call_id)
                print(f"    工具结果: {name}")
                active_call_id = None
            
            elif event_type == "error":
                error = event_data.get("error", "")
                collector.add_error(error)
                print(f"    错误: {error}")
        
        print("\n流式对话完成")
        
        # 保存 AI 消息
        if collector.has_content():
            parts_data = collector.to_parts_data()
            
            from app.utils.message_utils import parts_to_message_str
            message_str = parts_to_message_str(parts_data)
            
            ai_message = Message(
                user_id=user.id,
                session_id=session.id,
                topic_id=topic.id,
                role="assistant",
                message_str=message_str
            )
            db.add(ai_message)
            db.commit()
            db.refresh(ai_message)
            
            print(f"\n✓ 保存 AI 消息: {ai_message.id}")
            print(f"  message_str: {message_str[:100]}...")
            print(f"  parts 数量: {len(parts_data)}")
            
            # 保存 parts
            for part_data in parts_data:
                part = MessagePart(
                    message_id=ai_message.id,
                    type=part_data["type"],
                    content=part_data["content"],
                    metadata_=part_data.get("metadata_", {})
                )
                db.add(part)
            
            db.commit()
            
            # 验证保存的数据
            saved_parts = db.query(MessagePart).filter(
                MessagePart.message_id == ai_message.id
            ).all()
            
            print(f"\n✓ 验证保存的 parts:")
            for part in saved_parts:
                content_preview = part.content[:50] if len(part.content) > 50 else part.content
                print(f"  - {part.type}: {content_preview}...")
            
            print("\n✅ 测试通过！")
        else:
            print("\n❌ 没有收集到内容")
    
    finally:
        db.close()


async def test_message_str_generation():
    """测试 message_str 生成"""
    print("\n=== 测试 2: message_str 生成 ===")
    
    from app.utils.message_utils import parts_to_message_str
    
    # 测试各种 part 类型
    parts_data = [
        {
            "type": "thinking",
            "content": "我需要先思考一下如何回答这个问题...",
            "metadata_": {}
        },
        {
            "type": "tool_call",
            "content": json.dumps({
                "call_id": "call_123",
                "name": "search",
                "args": {"query": "test"}
            }),
            "metadata_": {}
        },
        {
            "type": "tool_result",
            "content": json.dumps({
                "call_id": "call_123",
                "name": "search",
                "result": "找到 5 条结果",
                "success": True
            }),
            "metadata_": {}
        },
        {
            "type": "text",
            "content": "根据搜索结果，我找到了相关信息。",
            "metadata_": {}
        },
        {
            "type": "error",
            "content": json.dumps({
                "error": "连接超时",
                "code": "TIMEOUT"
            }),
            "metadata_": {}
        }
    ]
    
    message_str = parts_to_message_str(parts_data)
    
    print(f"生成的 message_str:\n{message_str}")
    
    # 验证包含所有类型
    assert "[思考:" in message_str
    assert "[调用工具: search]" in message_str
    assert "[工具结果: search]" in message_str
    assert "根据搜索结果" in message_str
    assert "[错误: 连接超时]" in message_str
    
    print("\n✅ message_str 生成测试通过！")


async def main():
    """运行所有测试"""
    print("=" * 60)
    print("流式消息优化功能测试")
    print("=" * 60)
    
    # 测试 message_str 生成
    await test_message_str_generation()
    
    # 测试简单消息
    await test_simple_message()
    
    print("\n" + "=" * 60)
    print("所有测试完成！")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
