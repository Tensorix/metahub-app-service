"""
测试 API Key 功能
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_api_key_flow():
    """测试完整的 API Key 流程"""
    
    # 1. 注册用户
    print("1. 注册测试用户...")
    register_data = {
        "username": "apikey_test_user",
        "password": "a" * 64,  # SHA256 哈希后的密码
        "email": "apikey@test.com"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/v1/auth/register", json=register_data)
        if response.status_code == 201:
            print("✓ 用户注册成功")
        elif response.status_code == 400:
            print("⚠ 用户已存在，继续测试...")
        else:
            print(f"✗ 注册失败: {response.text}")
            return
    except Exception as e:
        print(f"✗ 注册请求失败: {e}")
        return
    
    # 2. 登录获取 token
    print("\n2. 登录获取 token...")
    login_data = {
        "username": "apikey_test_user",
        "password": "a" * 64,
        "client_type": "web"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data)
        if response.status_code == 200:
            tokens = response.json()
            access_token = tokens["access_token"]
            print(f"✓ 登录成功，获取到 access_token")
        else:
            print(f"✗ 登录失败: {response.text}")
            return
    except Exception as e:
        print(f"✗ 登录请求失败: {e}")
        return
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # 3. 生成 API Key
    print("\n3. 生成 API Key...")
    try:
        response = requests.post(f"{BASE_URL}/api/v1/api-key/generate", headers=headers)
        if response.status_code == 201:
            data = response.json()
            api_key = data["api_key"]
            print(f"✓ API Key 生成成功: {api_key}")
            
            # 验证格式
            if api_key.startswith("sk-") and len(api_key) > 10:
                print("✓ API Key 格式正确")
            else:
                print("✗ API Key 格式错误")
        else:
            print(f"✗ 生成失败: {response.text}")
            return
    except Exception as e:
        print(f"✗ 生成请求失败: {e}")
        return
    
    # 4. 获取 API Key
    print("\n4. 获取 API Key...")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/api-key", headers=headers)
        if response.status_code == 200:
            data = response.json()
            retrieved_key = data["api_key"]
            if retrieved_key == api_key:
                print(f"✓ 获取的 API Key 与生成的一致")
            else:
                print(f"✗ API Key 不一致")
        else:
            print(f"✗ 获取失败: {response.text}")
    except Exception as e:
        print(f"✗ 获取请求失败: {e}")
    
    # 5. 重置 API Key
    print("\n5. 重置 API Key...")
    try:
        response = requests.post(f"{BASE_URL}/api/v1/api-key/reset", headers=headers)
        if response.status_code == 200:
            data = response.json()
            new_api_key = data["api_key"]
            message = data["message"]
            print(f"✓ API Key 重置成功")
            print(f"  新 Key: {new_api_key}")
            print(f"  消息: {message}")
            
            # 验证新旧 Key 不同
            if new_api_key != api_key:
                print("✓ 新旧 API Key 不同")
            else:
                print("✗ 新旧 API Key 相同")
        else:
            print(f"✗ 重置失败: {response.text}")
    except Exception as e:
        print(f"✗ 重置请求失败: {e}")
    
    # 6. 验证用户信息中包含 API Key
    print("\n6. 验证用户信息...")
    try:
        response = requests.get(f"{BASE_URL}/api/v1/auth/me", headers=headers)
        if response.status_code == 200:
            user = response.json()
            if "api_key" in user and user["api_key"]:
                print(f"✓ 用户信息中包含 API Key")
            else:
                print(f"✗ 用户信息中没有 API Key")
        else:
            print(f"✗ 获取用户信息失败: {response.text}")
    except Exception as e:
        print(f"✗ 获取用户信息请求失败: {e}")
    
    print("\n" + "="*50)
    print("测试完成！")

if __name__ == "__main__":
    print("API Key 功能测试")
    print("="*50)
    test_api_key_flow()
