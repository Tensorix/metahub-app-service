"""
测试 API 迁移后的响应格式
运行: python test_api_migration.py
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_health():
    """测试健康检查接口"""
    print("测试健康检查...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    print()

def test_register():
    """测试注册接口"""
    print("测试注册接口...")
    data = {
        "username": "testuser123",
        "password": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",  # password123 的 SHA256
        "email": "test@example.com"
    }
    response = requests.post(f"{BASE_URL}/api/v1/auth/register", json=data)
    print(f"状态码: {response.status_code}")
    if response.status_code == 201:
        print("✓ 注册成功，返回用户数据（无信封）")
        print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        # 验证响应中没有 code 和 message 字段
        resp_json = response.json()
        if 'code' in resp_json or 'message' in resp_json:
            print("✗ 错误：响应中仍包含信封格式字段")
        else:
            print("✓ 响应格式正确：直接返回数据")
    else:
        print(f"响应: {response.text}")
    print()

def test_login():
    """测试登录接口"""
    print("测试登录接口...")
    data = {
        "username": "testuser123",
        "password": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
        "client_type": "web"
    }
    response = requests.post(f"{BASE_URL}/api/v1/auth/login", json=data)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        print("✓ 登录成功，返回 token 数据（无信封）")
        resp_json = response.json()
        print(f"响应: {json.dumps(resp_json, indent=2, ensure_ascii=False)}")
        # 验证响应中没有 code 和 message 字段
        if 'code' in resp_json or 'message' in resp_json:
            print("✗ 错误：响应中仍包含信封格式字段")
        else:
            print("✓ 响应格式正确：直接返回数据")
        return resp_json.get('access_token')
    else:
        print(f"响应: {response.text}")
    print()
    return None

def test_get_me(token):
    """测试获取当前用户接口"""
    print("测试获取当前用户...")
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/api/v1/auth/me", headers=headers)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        print("✓ 获取用户信息成功（无信封）")
        resp_json = response.json()
        print(f"响应: {json.dumps(resp_json, indent=2, ensure_ascii=False)}")
        # 验证响应中没有 code 和 message 字段
        if 'code' in resp_json or 'message' in resp_json:
            print("✗ 错误：响应中仍包含信封格式字段")
        else:
            print("✓ 响应格式正确：直接返回数据")
    else:
        print(f"响应: {response.text}")
    print()

def test_404_error():
    """测试 404 错误"""
    print("测试 404 错误...")
    response = requests.get(f"{BASE_URL}/api/v1/sessions/00000000-0000-0000-0000-000000000000")
    print(f"状态码: {response.status_code}")
    if response.status_code == 404:
        print("✓ 正确返回 404 状态码")
        print(f"响应: {response.json()}")
    print()

if __name__ == "__main__":
    print("=" * 60)
    print("API 迁移测试 - 验证标准 HTTP 状态码")
    print("=" * 60)
    print()
    
    try:
        test_health()
        test_register()
        token = test_login()
        if token:
            test_get_me(token)
        test_404_error()
        
        print("=" * 60)
        print("测试完成！")
        print("=" * 60)
    except requests.exceptions.ConnectionError:
        print("错误：无法连接到服务器，请确保后端服务正在运行")
    except Exception as e:
        print(f"错误：{e}")
