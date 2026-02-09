#!/usr/bin/env python3
"""
Agent 统一抽象功能集成测试
运行前请确保服务已启动在 http://localhost:8000
"""

import requests
import json
from uuid import uuid4

BASE_URL = "http://localhost:8000/api/v1"


def print_response(title, response):
    """打印响应信息"""
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    print(f"状态码: {response.status_code}")
    try:
        data = response.json()
        print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        return data
    except:
        print(f"响应: {response.text}")
        return None


def test_agent_unification():
    """测试 Agent 统一抽象功能"""
    print("\n" + "="*60)
    print("开始测试 Agent 统一抽象功能...")
    print("="*60)
    
    # 1. 创建带 description 的 Agent
    print("\n\n# 1. 创建带 description 的 Agent")
    response = requests.post(
        f"{BASE_URL}/agents",
        json={
            "name": "搜索专家",
            "description": "擅长网络搜索和信息检索",
            "model": "gpt-4o-mini",
            "system_prompt": "你是一个搜索专家",
            "tools": ["web_search"]
        }
    )
    search_agent = print_response("创建搜索专家", response)
    if not search_agent or response.status_code != 201:
        print("❌ 创建搜索专家失败")
        return
    search_agent_id = search_agent["id"]
    print(f"✓ 搜索专家 ID: {search_agent_id}")
    
    # 2. 创建另一个 Agent
    print("\n\n# 2. 创建代码专家")
    response = requests.post(
        f"{BASE_URL}/agents",
        json={
            "name": "代码专家",
            "description": "擅长代码审查和编写",
            "model": "gpt-4o-mini",
            "tools": ["read_file", "edit_file"]
        }
    )
    code_agent = print_response("创建代码专家", response)
    if not code_agent or response.status_code != 201:
        print("❌ 创建代码专家失败")
        return
    code_agent_id = code_agent["id"]
    print(f"✓ 代码专家 ID: {code_agent_id}")
    
    # 3. 创建主 Agent 并同时挂载 SubAgent
    print("\n\n# 3. 创建主 Agent 并同时挂载 SubAgent")
    response = requests.post(
        f"{BASE_URL}/agents",
        json={
            "name": "全能助手",
            "description": "综合能力的助手",
            "model": "gpt-4o",
            "mount_subagents": [
                {
                    "agent_id": search_agent_id,
                    "mount_description": "负责所有搜索任务",
                    "sort_order": 0
                },
                {
                    "agent_id": code_agent_id,
                    "mount_description": "负责代码相关任务",
                    "sort_order": 1
                }
            ]
        }
    )
    main_agent = print_response("创建全能助手", response)
    if not main_agent or response.status_code != 201:
        print("❌ 创建全能助手失败")
        return
    main_agent_id = main_agent["id"]
    print(f"✓ 全能助手 ID: {main_agent_id}")
    print(f"✓ 已挂载 {len(main_agent.get('subagents', []))} 个 SubAgent")
    
    # 4. 列出已挂载的 SubAgent
    print("\n\n# 4. 列出已挂载的 SubAgent")
    response = requests.get(f"{BASE_URL}/agents/{main_agent_id}/subagents")
    subagents = print_response("列出已挂载的 SubAgent", response)
    if subagents and response.status_code == 200:
        print(f"✓ 已挂载 {len(subagents)} 个 SubAgent")
        for sa in subagents:
            print(f"  - {sa['name']}: {sa['effective_description']}")
    
    # 5. 创建另一个父 Agent 并挂载相同的搜索专家（跨父级复用）
    print("\n\n# 5. 测试跨父级复用")
    response = requests.post(
        f"{BASE_URL}/agents",
        json={
            "name": "客服机器人",
            "model": "gpt-4o-mini"
        }
    )
    customer_agent = print_response("创建客服机器人", response)
    if not customer_agent or response.status_code != 201:
        print("❌ 创建客服机器人失败")
        return
    customer_agent_id = customer_agent["id"]
    
    # 挂载搜索专家到客服机器人
    response = requests.post(
        f"{BASE_URL}/agents/{customer_agent_id}/subagents",
        json={
            "agent_id": search_agent_id,
            "mount_description": "帮助客户查找产品信息"
        }
    )
    mount_result = print_response("挂载搜索专家到客服机器人", response)
    if mount_result and response.status_code == 201:
        print(f"✓ 成功复用搜索专家")
        print(f"  在全能助手中: 负责所有搜索任务")
        print(f"  在客服机器人中: {mount_result['mount_description']}")
    
    # 6. 列出可挂载的候选 Agent
    print("\n\n# 6. 列出可挂载的候选 Agent")
    response = requests.get(f"{BASE_URL}/agents/{main_agent_id}/mountable")
    mountable = print_response("列出可挂载的候选 Agent", response)
    if mountable and response.status_code == 200:
        print(f"✓ 找到 {mountable['total']} 个可挂载的 Agent")
        # 应该排除自己和已挂载的
        mountable_ids = [item['id'] for item in mountable['items']]
        print(f"  排除了自己: {main_agent_id not in mountable_ids}")
        print(f"  排除了已挂载的搜索专家: {search_agent_id not in mountable_ids}")
        print(f"  排除了已挂载的代码专家: {code_agent_id not in mountable_ids}")
    
    # 7. 更新挂载描述
    print("\n\n# 7. 更新挂载描述")
    response = requests.put(
        f"{BASE_URL}/agents/{main_agent_id}/subagents/{search_agent_id}",
        json={
            "mount_description": "负责所有搜索和信息检索任务"
        }
    )
    updated_mount = print_response("更新挂载描述", response)
    if updated_mount and response.status_code == 200:
        print(f"✓ 更新成功: {updated_mount['mount_description']}")
    
    # 8. 卸载 SubAgent
    print("\n\n# 8. 卸载 SubAgent")
    response = requests.delete(
        f"{BASE_URL}/agents/{main_agent_id}/subagents/{code_agent_id}"
    )
    print_response("卸载代码专家", response)
    if response.status_code == 204:
        print(f"✓ 卸载成功")
        
        # 验证卸载
        response = requests.get(f"{BASE_URL}/agents/{main_agent_id}/subagents")
        subagents = response.json()
        print(f"✓ 验证：剩余 {len(subagents)} 个 SubAgent")
    
    # 9. 测试防止自引用
    print("\n\n# 9. 测试防止自引用")
    response = requests.post(
        f"{BASE_URL}/agents/{main_agent_id}/subagents",
        json={
            "agent_id": main_agent_id
        }
    )
    print_response("尝试挂载自己（应该失败）", response)
    if response.status_code == 400:
        print(f"✓ 成功阻止自引用")
    else:
        print(f"❌ 应该返回 400 错误")
    
    # 10. 测试循环引用检测
    print("\n\n# 10. 测试循环引用检测")
    # 创建 A -> B -> C 的链
    response = requests.post(
        f"{BASE_URL}/agents",
        json={"name": "Agent A", "model": "gpt-4o-mini"}
    )
    agent_a = response.json()
    agent_a_id = agent_a["id"]
    
    response = requests.post(
        f"{BASE_URL}/agents",
        json={"name": "Agent B", "model": "gpt-4o-mini"}
    )
    agent_b = response.json()
    agent_b_id = agent_b["id"]
    
    response = requests.post(
        f"{BASE_URL}/agents",
        json={"name": "Agent C", "model": "gpt-4o-mini"}
    )
    agent_c = response.json()
    agent_c_id = agent_c["id"]
    
    # A -> B
    requests.post(
        f"{BASE_URL}/agents/{agent_a_id}/subagents",
        json={"agent_id": agent_b_id}
    )
    
    # B -> C
    requests.post(
        f"{BASE_URL}/agents/{agent_b_id}/subagents",
        json={"agent_id": agent_c_id}
    )
    
    # 尝试 C -> A（会形成环）
    response = requests.post(
        f"{BASE_URL}/agents/{agent_c_id}/subagents",
        json={"agent_id": agent_a_id}
    )
    print_response("尝试形成循环引用（应该失败）", response)
    if response.status_code == 400 and "Circular reference" in response.text:
        print(f"✓ 成功检测到循环引用")
    else:
        print(f"❌ 应该返回 400 错误并提示循环引用")
    
    # 清理测试数据
    print("\n\n# 清理测试数据")
    for agent_id in [main_agent_id, customer_agent_id, search_agent_id, 
                     code_agent_id, agent_a_id, agent_b_id, agent_c_id]:
        requests.delete(f"{BASE_URL}/agents/{agent_id}")
    print("✓ 清理完成")
    
    print("\n\n" + "="*60)
    print("✅ 所有测试完成！")
    print("="*60)


if __name__ == "__main__":
    try:
        test_agent_unification()
    except requests.exceptions.ConnectionError:
        print("\n❌ 错误：无法连接到服务，请确保服务已启动在 http://localhost:8000")
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {str(e)}")
        import traceback
        traceback.print_exc()
