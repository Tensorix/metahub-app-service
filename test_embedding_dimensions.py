"""测试 embedding API 返回的维度是否正确"""

import os
from openai import OpenAI
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 从 .env 读取配置
api_key = os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL")

print("=" * 60)
print("Embedding API 维度测试")
print("=" * 60)
print(f"API Base URL: {base_url}")
print(f"API Key: {api_key[:20]}..." if api_key else "API Key: None")
print()

# 创建客户端
client = OpenAI(api_key=api_key, base_url=base_url)

# 测试文本
test_text = "这是一个测试文本，用于验证 embedding 维度"

# 测试配置
test_cases = [
    {
        "model": "text-embedding-3-large",
        "dimensions": 3072,
        "description": "OpenAI 3 Large (3072维)"
    },
    {
        "model": "text-embedding-3-large",
        "dimensions": 1536,
        "description": "OpenAI 3 Large 降维到 1536"
    },
    {
        "model": "text-embedding-3-small",
        "dimensions": 1536,
        "description": "OpenAI 3 Small (1536维)"
    },
    {
        "model": "text-embedding-ada-002",
        "dimensions": None,
        "description": "OpenAI Ada-002 (旧版，1536维)"
    },
]

print("开始测试...\n")

for i, test in enumerate(test_cases, 1):
    print(f"测试 {i}: {test['description']}")
    print(f"  模型: {test['model']}")
    print(f"  请求维度: {test['dimensions']}")
    
    try:
        # 构建请求参数
        params = {
            "model": test["model"],
            "input": test_text,
        }
        if test["dimensions"] is not None:
            params["dimensions"] = test["dimensions"]
        
        # 调用 API
        response = client.embeddings.create(**params)
        
        # 获取返回的 embedding
        embedding = response.data[0].embedding
        actual_dims = len(embedding)
        
        # 验证维度
        expected_dims = test["dimensions"] if test["dimensions"] else 1536
        status = "✅ 通过" if actual_dims == expected_dims else "❌ 失败"
        
        print(f"  返回维度: {actual_dims}")
        print(f"  状态: {status}")
        
        if actual_dims != expected_dims:
            print(f"  ⚠️  警告: 期望 {expected_dims} 维，但返回 {actual_dims} 维")
        
    except Exception as e:
        print(f"  ❌ 错误: {str(e)}")
    
    print()

print("=" * 60)
print("测试完成")
print("=" * 60)
