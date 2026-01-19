# 密码强度检查配置说明

## 📋 概述

密码强度检查可以通过环境变量在前后端分别控制，实现灵活的密码策略。

## 🔧 配置方式

### 后端配置（Python）

**文件位置**：`.env`

```bash
# 密码强度检查开关
PASSWORD_STRENGTH_CHECK=False
```

**可选值**：
- `True` - 启用密码强度检查
- `False` - 禁用密码强度检查（默认）

**生效位置**：`app/service/auth.py` 中的 `PasswordService.check_password_strength()`

---

### 前端配置（TypeScript）

**文件位置**：`frontend/.env`

```bash
# API 地址
VITE_API_BASE_URL=http://localhost:8000

# 密码强度检查开关
VITE_PASSWORD_STRENGTH_CHECK=false
```

**可选值**：
- `true` - 启用密码强度检查
- `false` - 禁用密码强度检查（默认）

**生效位置**：`frontend/src/pages/Register.tsx` 中的 `validateForm()` 函数

---

## 🎯 密码强度要求

### 启用强度检查时（`true`）

密码必须满足以下所有条件：
- ✅ 至少 8 个字符
- ✅ 包含大写字母（A-Z）
- ✅ 包含小写字母（a-z）
- ✅ 包含数字（0-9）
- ✅ 包含特殊字符（!@#$%^&*(),.?":{}|<>）

**示例有效密码**：
- `Test@123456`
- `MyP@ssw0rd`
- `Secure#2024`

### 禁用强度检查时（`false`）

密码只需满足：
- ✅ 至少 8 个字符

**示例有效密码**：
- `12345678`
- `aaaaaaaa`
- `testtest`

---

## 🚀 使用场景

### 场景 1：开发/测试环境（推荐禁用）

```bash
# 后端 .env
PASSWORD_STRENGTH_CHECK=False

# 前端 frontend/.env
VITE_PASSWORD_STRENGTH_CHECK=false
```

**优点**：
- 快速注册测试账户
- 不需要记复杂密码
- 提高开发效率

### 场景 2：生产环境（推荐启用）

```bash
# 后端 .env
PASSWORD_STRENGTH_CHECK=True

# 前端 frontend/.env
VITE_PASSWORD_STRENGTH_CHECK=true
```

**优点**：
- 提高账户安全性
- 防止弱密码攻击
- 符合安全规范

---

## 📝 配置步骤

### 1. 修改后端配置

编辑项目根目录的 `.env` 文件：

```bash
# 开启密码强度检查
PASSWORD_STRENGTH_CHECK=True

# 或关闭密码强度检查
PASSWORD_STRENGTH_CHECK=False
```

**重启后端服务**使配置生效：
```bash
make run
# 或
python main.py
```

### 2. 修改前端配置

编辑 `frontend/.env` 文件：

```bash
# 开启密码强度检查
VITE_PASSWORD_STRENGTH_CHECK=true

# 或关闭密码强度检查
VITE_PASSWORD_STRENGTH_CHECK=false
```

**重启前端开发服务器**使配置生效：
```bash
cd frontend
npm run dev
```

**注意**：如果是生产构建，需要重新构建：
```bash
cd frontend
npm run build
```

---

## ⚠️ 注意事项

### 1. 前后端配置一致性

**推荐**：前后端使用相同的配置

```bash
# 后端
PASSWORD_STRENGTH_CHECK=False

# 前端
VITE_PASSWORD_STRENGTH_CHECK=false
```

**不推荐**：前后端配置不一致

如果前端禁用但后端启用，用户可能在前端通过验证，但后端注册失败。

### 2. 环境变量优先级

- 前端环境变量在**构建时**读取
- 修改前端环境变量后需要**重启开发服务器**或**重新构建**
- 后端环境变量在**运行时**读取
- 修改后端环境变量后需要**重启后端服务**

### 3. 生产环境建议

生产环境**强烈建议启用**密码强度检查：

```bash
# 生产环境配置
PASSWORD_STRENGTH_CHECK=True
VITE_PASSWORD_STRENGTH_CHECK=true
```

### 4. 已有用户

修改密码策略**不影响已注册用户**，只对新注册用户生效。

---

## 🧪 测试

### 测试禁用强度检查

1. 设置环境变量：
   ```bash
   # 后端 .env
   PASSWORD_STRENGTH_CHECK=False
   
   # 前端 frontend/.env
   VITE_PASSWORD_STRENGTH_CHECK=false
   ```

2. 重启服务

3. 尝试注册：
   - 用户名：`testuser`
   - 密码：`12345678`（简单密码）
   - 预期：注册成功 ✅

### 测试启用强度检查

1. 设置环境变量：
   ```bash
   # 后端 .env
   PASSWORD_STRENGTH_CHECK=True
   
   # 前端 frontend/.env
   VITE_PASSWORD_STRENGTH_CHECK=true
   ```

2. 重启服务

3. 尝试注册：
   - 用户名：`testuser2`
   - 密码：`12345678`（简单密码）
   - 预期：前端显示错误 ❌
   
4. 使用强密码：
   - 用户名：`testuser2`
   - 密码：`Test@123456`（强密码）
   - 预期：注册成功 ✅

---

## 🔍 代码位置

### 后端

**配置文件**：`app/config.py`
```python
PASSWORD_STRENGTH_CHECK: bool = Field(
    default=False,
    description="是否启用密码强度检查"
)
```

**验证逻辑**：`app/service/auth.py`
```python
@staticmethod
def check_password_strength(password: str) -> tuple[bool, str | None]:
    if not config.PASSWORD_STRENGTH_CHECK:
        return True, None
    # ... 验证逻辑
```

### 前端

**环境变量**：`frontend/.env`
```bash
VITE_PASSWORD_STRENGTH_CHECK=false
```

**验证逻辑**：`frontend/src/pages/Register.tsx`
```typescript
const enablePasswordStrengthCheck = import.meta.env.VITE_PASSWORD_STRENGTH_CHECK === 'true';

if (enablePasswordStrengthCheck) {
  // ... 验证逻辑
}
```

---

## 📚 相关文档

- `.env.example` - 后端环境变量示例
- `frontend/.env.example` - 前端环境变量示例
- `app/service/auth.py` - 后端密码验证逻辑
- `frontend/src/pages/Register.tsx` - 前端注册页面

---

## 🎉 总结

通过环境变量控制密码强度检查，可以：

✅ 灵活切换密码策略  
✅ 开发环境快速测试  
✅ 生产环境保证安全  
✅ 前后端配置统一  
✅ 无需修改代码  

**推荐配置**：
- 开发/测试：`false`（禁用）
- 生产环境：`true`（启用）
