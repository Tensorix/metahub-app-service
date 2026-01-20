# API Key 使用示例

## 前端集成示例

### 1. 在设置页面生成和管理 API Key

用户可以在设置页面（`/settings`）中：

- **生成 API Key**：首次使用时点击"生成 API Key"按钮
- **查看 API Key**：点击眼睛图标显示/隐藏完整密钥
- **复制 API Key**：点击复制图标一键复制到剪贴板
- **重置 API Key**：点击刷新图标重置（需确认，旧密钥立即失效）

### 2. 在代码中使用 API Key

```typescript
import { apiKeyApi } from '@/lib/api';

// 生成 API Key
async function generateKey() {
  try {
    const { api_key } = await apiKeyApi.generate();
    console.log('API Key:', api_key);
  } catch (error) {
    console.error('生成失败:', error);
  }
}

// 获取现有的 API Key
async function getKey() {
  try {
    const { api_key } = await apiKeyApi.get();
    console.log('当前 API Key:', api_key);
  } catch (error) {
    console.error('获取失败:', error);
  }
}

// 重置 API Key
async function resetKey() {
  try {
    const { api_key, message } = await apiKeyApi.reset();
    console.log('新 API Key:', api_key);
    console.log('提示:', message);
  } catch (error) {
    console.error('重置失败:', error);
  }
}
```

## 后端 API 调用示例

### Python 示例

```python
import requests

BASE_URL = "http://localhost:8000"
ACCESS_TOKEN = "your_access_token_here"

headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json"
}

# 生成 API Key
response = requests.post(
    f"{BASE_URL}/api/v1/api-key/generate",
    headers=headers
)
api_key = response.json()["api_key"]
print(f"API Key: {api_key}")

# 获取 API Key
response = requests.get(
    f"{BASE_URL}/api/v1/api-key",
    headers=headers
)
api_key = response.json()["api_key"]

# 重置 API Key
response = requests.post(
    f"{BASE_URL}/api/v1/api-key/reset",
    headers=headers
)
new_api_key = response.json()["api_key"]
message = response.json()["message"]
```

### cURL 示例

```bash
# 生成 API Key
curl -X POST "http://localhost:8000/api/v1/api-key/generate" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 获取 API Key
curl -X GET "http://localhost:8000/api/v1/api-key" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 重置 API Key
curl -X POST "http://localhost:8000/api/v1/api-key/reset" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### JavaScript/Node.js 示例

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:8000';
const ACCESS_TOKEN = 'your_access_token_here';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// 生成 API Key
async function generateApiKey() {
  const response = await api.post('/api/v1/api-key/generate');
  console.log('API Key:', response.data.api_key);
  return response.data.api_key;
}

// 获取 API Key
async function getApiKey() {
  const response = await api.get('/api/v1/api-key');
  return response.data.api_key;
}

// 重置 API Key
async function resetApiKey() {
  const response = await api.post('/api/v1/api-key/reset');
  console.log('新 API Key:', response.data.api_key);
  console.log('消息:', response.data.message);
  return response.data.api_key;
}
```

## 使用 API Key 进行身份验证

生成 API Key 后，可以用它替代 JWT Token 进行 API 调用：

### 方式 1：使用 Authorization Header

```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 方式 2：使用自定义 Header（需要后端支持）

```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "X-API-Key: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Python 示例

```python
import requests

API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 使用 API Key 调用 API
headers = {"Authorization": f"Bearer {API_KEY}"}
response = requests.get(
    "http://localhost:8000/api/v1/auth/me",
    headers=headers
)
user = response.json()
print(f"用户: {user['username']}")
```

## 安全最佳实践

### 1. 环境变量存储

```bash
# .env 文件
API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```python
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY")
```

### 2. 不要在代码中硬编码

❌ 错误做法：
```python
API_KEY = "sk-abc123..."  # 不要这样做！
```

✅ 正确做法：
```python
API_KEY = os.getenv("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY not found in environment")
```

### 3. 定期轮换

```python
# 每 90 天自动轮换 API Key
from datetime import datetime, timedelta

def should_rotate_key(last_rotation_date):
    return datetime.now() - last_rotation_date > timedelta(days=90)

if should_rotate_key(last_rotation):
    new_key = await apiKeyApi.reset()
    # 更新环境变量或配置
```

### 4. 监控和日志

```python
import logging

logger = logging.getLogger(__name__)

def call_api_with_key(api_key):
    try:
        response = requests.get(
            "http://localhost:8000/api/v1/some-endpoint",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        logger.info(f"API 调用成功: {response.status_code}")
        return response.json()
    except Exception as e:
        logger.error(f"API 调用失败: {e}")
        raise
```

## 错误处理

```typescript
import { apiKeyApi } from '@/lib/api';

async function handleApiKey() {
  try {
    const { api_key } = await apiKeyApi.get();
    return api_key;
  } catch (error: any) {
    if (error.response?.status === 404) {
      // API Key 不存在，生成新的
      const { api_key } = await apiKeyApi.generate();
      return api_key;
    } else if (error.response?.status === 401) {
      // 未授权，需要重新登录
      console.error('请先登录');
      throw error;
    } else {
      // 其他错误
      console.error('获取 API Key 失败:', error);
      throw error;
    }
  }
}
```

## 测试

运行测试脚本：

```bash
# 确保后端服务正在运行
python test_api_key.py
```

测试脚本会验证：
- ✓ 用户注册和登录
- ✓ API Key 生成
- ✓ API Key 格式验证
- ✓ API Key 获取
- ✓ API Key 重置
- ✓ 用户信息中包含 API Key
