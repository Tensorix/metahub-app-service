"""
测试自动回复功能
"""
import asyncio
from uuid import uuid4
from app.db.session import SessionLocal
from app.db.model.session import Session
from app.db.model.agent import Agent
from app.db.model.user import User


def test_session_auto_reply_field():
    """测试 Session 模型是否有 auto_reply_enabled 字段"""
    db = SessionLocal()
    try:
        # 创建测试用户
        user = db.query(User).first()
        if not user:
            print("❌ 没有找到用户，请先创建用户")
            return
        
        # 创建测试 Agent
        agent = Agent(
            name="测试自动回复 Agent",
            system_prompt="你是一个测试助手",
            model="gpt-4o-mini",
        )
        db.add(agent)
        db.flush()
        
        # 创建测试会话
        session = Session(
            user_id=user.id,
            name="测试自动回复会话",
            type="pm",
            source="test",
            agent_id=agent.id,
            auto_reply_enabled=True,
        )
        db.add(session)
        db.commit()
        
        # 验证字段
        db.refresh(session)
        assert hasattr(session, 'auto_reply_enabled'), "Session 缺少 auto_reply_enabled 字段"
        assert session.auto_reply_enabled == True, "auto_reply_enabled 值不正确"
        assert session.agent_id == agent.id, "agent_id 不正确"
        
        print("✅ Session 模型测试通过")
        print(f"   - Session ID: {session.id}")
        print(f"   - Agent ID: {session.agent_id}")
        print(f"   - Auto Reply Enabled: {session.auto_reply_enabled}")
        
        # 清理
        db.delete(session)
        db.delete(agent)
        db.commit()
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        db.rollback()
    finally:
        db.close()


def test_session_update_validation():
    """测试 Session 更新时的校验逻辑"""
    from app.service.session import SessionService
    from app.schema.session import SessionUpdate
    
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("❌ 没有找到用户")
            return
        
        # 创建没有 Agent 的会话
        session = Session(
            user_id=user.id,
            name="测试校验会话",
            type="pm",
            source="test",
            auto_reply_enabled=False,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        # 尝试开启自动回复但没有 Agent（应该失败）
        try:
            update_data = SessionUpdate(auto_reply_enabled=True)
            SessionService.update_session(db, session.id, update_data, user.id)
            print("❌ 校验失败：应该抛出 ValueError")
        except ValueError as e:
            print(f"✅ 校验通过：{e}")
        
        # 清理
        db.delete(session)
        db.commit()
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 50)
    print("测试自动回复功能")
    print("=" * 50)
    
    print("\n1. 测试 Session 模型字段")
    test_session_auto_reply_field()
    
    print("\n2. 测试更新校验逻辑")
    test_session_update_validation()
    
    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)
