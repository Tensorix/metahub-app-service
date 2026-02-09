#!/usr/bin/env python3
"""
验证 Agent 统一抽象功能的脚本
"""

import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import config
from app.service.agent import AgentService
from app.schema.agent import AgentCreate, MountSubagentRequest


def verify_database_schema(engine):
    """验证数据库 Schema"""
    print("🔍 验证数据库 Schema...")
    
    with engine.connect() as conn:
        # 检查 agent 表是否有 description 字段
        result = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'agent' AND column_name = 'description'
        """))
        if not result.fetchone():
            print("❌ agent 表缺少 description 字段")
            return False
        print("✅ agent.description 字段存在")
        
        # 检查 agent_subagent 表是否存在
        result = conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'agent_subagent'
        """))
        if not result.fetchone():
            print("❌ agent_subagent 表不存在")
            return False
        print("✅ agent_subagent 表存在")
        
        # 检查约束
        result = conn.execute(text("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'agent_subagent' 
            AND constraint_name = 'uq_agent_subagent'
        """))
        if not result.fetchone():
            print("⚠️  警告: uq_agent_subagent 约束不存在")
        else:
            print("✅ UNIQUE 约束存在")
        
        result = conn.execute(text("""
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'agent_subagent' 
            AND constraint_name = 'ck_no_self_mount'
        """))
        if not result.fetchone():
            print("⚠️  警告: ck_no_self_mount 约束不存在")
        else:
            print("✅ CHECK 约束存在")
    
    return True


def verify_basic_operations(db):
    """验证基本操作"""
    print("\n🔍 验证基本操作...")
    
    try:
        # 创建测试 Agent
        agent = AgentService.create_agent(
            db,
            AgentCreate(
                name="测试 Agent",
                description="这是一个测试 Agent",
                model="gpt-4o-mini",
            ),
        )
        print(f"✅ 创建 Agent 成功: {agent.id}")
        
        # 验证 description 字段
        if agent.description != "这是一个测试 Agent":
            print("❌ description 字段不正确")
            return False
        print("✅ description 字段正确")
        
        # 清理
        AgentService.delete_agent(db, agent.id)
        print("✅ 删除 Agent 成功")
        
        return True
    except Exception as e:
        print(f"❌ 基本操作失败: {e}")
        return False


def verify_mount_operations(db):
    """验证挂载操作"""
    print("\n🔍 验证挂载操作...")
    
    try:
        # 创建父子 Agent
        parent = AgentService.create_agent(
            db, AgentCreate(name="父 Agent", model="gpt-4o")
        )
        child = AgentService.create_agent(
            db, AgentCreate(name="子 Agent", model="gpt-4o-mini")
        )
        print(f"✅ 创建父子 Agent: {parent.id}, {child.id}")
        
        # 挂载
        mount = AgentService.mount_subagent(
            db,
            parent.id,
            MountSubagentRequest(
                agent_id=child.id,
                mount_description="测试挂载",
            ),
        )
        print(f"✅ 挂载成功: {mount.id}")
        
        # 验证挂载
        mounts = AgentService.list_mounted_subagents(db, parent.id)
        if len(mounts) != 1:
            print(f"❌ 挂载数量不正确: {len(mounts)}")
            return False
        print("✅ 挂载验证成功")
        
        # 卸载
        success = AgentService.unmount_subagent(db, parent.id, child.id)
        if not success:
            print("❌ 卸载失败")
            return False
        print("✅ 卸载成功")
        
        # 清理
        AgentService.delete_agent(db, parent.id)
        AgentService.delete_agent(db, child.id)
        
        return True
    except Exception as e:
        print(f"❌ 挂载操作失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_circular_reference_detection(db):
    """验证循环引用检测"""
    print("\n🔍 验证循环引用检测...")
    
    try:
        # 创建 A -> B -> C 的链
        agent_a = AgentService.create_agent(
            db, AgentCreate(name="Agent A", model="gpt-4o-mini")
        )
        agent_b = AgentService.create_agent(
            db, AgentCreate(name="Agent B", model="gpt-4o-mini")
        )
        agent_c = AgentService.create_agent(
            db, AgentCreate(name="Agent C", model="gpt-4o-mini")
        )
        
        # A -> B
        AgentService.mount_subagent(
            db, agent_a.id, MountSubagentRequest(agent_id=agent_b.id)
        )
        
        # B -> C
        AgentService.mount_subagent(
            db, agent_b.id, MountSubagentRequest(agent_id=agent_c.id)
        )
        
        # 尝试 C -> A（应该失败）
        try:
            AgentService.mount_subagent(
                db, agent_c.id, MountSubagentRequest(agent_id=agent_a.id)
            )
            print("❌ 循环引用检测失败：应该抛出异常")
            return False
        except ValueError as e:
            if "Circular reference" in str(e):
                print("✅ 循环引用检测成功")
            else:
                print(f"❌ 错误消息不正确: {e}")
                return False
        
        # 清理
        AgentService.delete_agent(db, agent_a.id)
        AgentService.delete_agent(db, agent_b.id)
        AgentService.delete_agent(db, agent_c.id)
        
        return True
    except Exception as e:
        print(f"❌ 循环引用检测失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """主函数"""
    print("=" * 60)
    print("Agent 统一抽象功能验证")
    print("=" * 60)
    
    # 创建数据库连接
    engine = create_engine(config.sqlalchemy_database_uri)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # 验证数据库 Schema
        if not verify_database_schema(engine):
            print("\n❌ 数据库 Schema 验证失败")
            return 1
        
        # 验证基本操作
        if not verify_basic_operations(db):
            print("\n❌ 基本操作验证失败")
            return 1
        
        # 验证挂载操作
        if not verify_mount_operations(db):
            print("\n❌ 挂载操作验证失败")
            return 1
        
        # 验证循环引用检测
        if not verify_circular_reference_detection(db):
            print("\n❌ 循环引用检测验证失败")
            return 1
        
        print("\n" + "=" * 60)
        print("✅ 所有验证通过！")
        print("=" * 60)
        return 0
        
    except Exception as e:
        print(f"\n❌ 验证过程出错: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
