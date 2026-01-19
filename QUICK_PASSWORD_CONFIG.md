# 🔐 密码强度检查 - 快速配置

## 🎯 一键配置

### 关闭密码强度检查（开发/测试环境）

#### 1. 后端配置
编辑 `.env` 文件：
```bash
PASSWORD_STRENGTH_CHECK=False
```

#### 2. 前端配置
编辑 `frontend/.env` 文件：
```bash
VITE_PASSWORD_STRENGTH_CHECK=false
```

#### 3. 重启服务
```bash
# 重启后端
make run

# 重启前端（新终端）
cd frontend && npm run dev
```

#### 4. 测试
- 用户名：`test`
- 密码：`12345678`（简单密码）
- 结果：✅ 可以注册成功

---

### 开启密码强度检查（生产环境）

#### 1. 后端配置
编辑 `.env` 文件：
```bash
PASSWORD_STRENGTH_CHECK=True
```

#### 2. 前端配置
编辑 `frontend/.env` 文件：
```bash
VITE_PASSWORD_STRENGTH_CHECK=true
```

#### 3. 重启服务
```bash
# 重启后端
make run

# 重启前端（新终端）
cd frontend && npm run dev
```

#### 4. 测试
- 用户名：`test`
- 密码：`Test@123456`（强密码）
- 结果：✅ 可以注册成功

---

## 📋 密码要求对比

| 配置 | 最小长度 | 大写字母 | 小写字母 | 数字 | 特殊字符 |
|------|---------|---------|---------|------|---------|
| `false` | 8 | ❌ | ❌ | ❌ | ❌ |
| `true` | 8 | ✅ | ✅ | ✅ | ✅ |

---

## ⚡ 当前配置

### 后端
```bash
PASSWORD_STRENGTH_CHECK=False
```
**状态**：🟢 已禁用（允许简单密码）

### 前端
```bash
VITE_PASSWORD_STRENGTH_CHECK=false
```
**状态**：🟢 已禁用（允许简单密码）

---

## 🧪 快速测试

### 测试简单密码（当前配置）
```
用户名: testuser
密码: 12345678
预期: ✅ 注册成功
```

### 测试强密码
```
用户名: testuser2
密码: Test@123456
预期: ✅ 注册成功
```

---

## 📚 详细文档

查看 `PASSWORD_CONFIG.md` 了解更多详情。
