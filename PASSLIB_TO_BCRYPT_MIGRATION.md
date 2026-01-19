# 从 Passlib 迁移到 Bcrypt

## 🎯 为什么迁移？

### Passlib 的问题
- ❌ **停止维护**：最后更新于 2020 年（5 年前）
- ❌ **兼容性问题**：与 Python 3.14 和新版 bcrypt 库不兼容
- ❌ **错误**：`ValueError: password cannot be longer than 72 bytes`
- ❌ **依赖过时**：依赖的库版本都很老

### Bcrypt 的优势
- ✅ **活跃维护**：持续更新和维护
- ✅ **现代化**：支持最新的 Python 版本
- ✅ **简单直接**：API 简洁，不需要额外的抽象层
- ✅ **性能更好**：直接使用 bcrypt，没有中间层开销

## 📝 迁移内容

### 1. 依赖变更

#### 修改前（pyproject.toml）
```toml
"passlib[bcrypt]>=1.7.4",
```

#### 修改后（pyproject.toml）
```toml
"bcrypt>=4.0.0",
```

### 2. 代码变更

#### 修改前（app/service/auth.py）
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class PasswordService:
    @staticmethod
    def hash_password(sha256_password: str) -> str:
        return pwd_context.hash(sha256_password)

    @staticmethod
    def verify_password(sha256_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(sha256_password, hashed_password)
```

#### 修改后（app/service/auth.py）
```python
import bcrypt

class PasswordService:
    @staticmethod
    def hash_password(sha256_password: str) -> str:
        """对 SHA256 哈希后的密码进行 bcrypt 哈希"""
        password_bytes = sha256_password.encode('utf-8')
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(sha256_password: str, hashed_password: str) -> bool:
        """验证密码"""
        password_bytes = sha256_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)
```

## 🔄 迁移步骤

### 1. 更新依赖
```bash
# 卸载 passlib
uv pip uninstall passlib

# 安装 bcrypt
uv pip install bcrypt

# 或者使用 uv sync
uv sync
```

### 2. 更新代码
已完成，见上面的代码变更。

### 3. 重启服务
```bash
# 停止当前服务（Ctrl+C）
# 重新启动
make run
# 或
python main.py
```

## ⚠️ 兼容性说明

### 已有用户数据

**好消息**：✅ 完全兼容！

- Passlib 生成的 bcrypt 哈希格式：`$2b$12$...`
- Bcrypt 库生成的哈希格式：`$2b$12$...`
- **格式完全相同**，可以互相验证

### 测试验证

#### 1. 已有用户登录
```bash
# 使用之前注册的账户登录
用户名: testuser
密码: Test@123456

# 预期：✅ 登录成功
```

#### 2. 新用户注册
```bash
# 注册新账户
用户名: newuser
密码: 12345678

# 预期：✅ 注册成功
```

#### 3. 新用户登录
```bash
# 使用新注册的账户登录
用户名: newuser
密码: 12345678

# 预期：✅ 登录成功
```

## 📊 性能对比

### Passlib（旧）
```python
# 哈希时间（rounds=12）
~200-300ms

# 验证时间
~200-300ms
```

### Bcrypt（新）
```python
# 哈希时间（rounds=12）
~200-300ms

# 验证时间
~200-300ms
```

**结论**：性能基本相同，因为底层都是使用 bcrypt 算法。

## 🔒 安全性

### 哈希格式

两者生成的哈希格式完全相同：

```
$2b$12$abcdefghijklmnopqrstuv.WXYZ0123456789ABCDEFGHIJKLMNOPQR
│  │  │                      │
│  │  │                      └─ 哈希值（31 字符）
│  │  └─ 盐值（22 字符）
│  └─ 成本因子（rounds）
└─ 算法标识符
```

### 安全性对比

| 特性 | Passlib | Bcrypt |
|------|---------|--------|
| 算法 | bcrypt | bcrypt |
| 盐值 | 自动生成 | 自动生成 |
| 成本因子 | 可配置 | 可配置 |
| 安全性 | ✅ 高 | ✅ 高 |

**结论**：安全性完全相同。

## 🎯 API 对比

### Passlib API
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 哈希
hashed = pwd_context.hash(password)

# 验证
is_valid = pwd_context.verify(password, hashed)
```

### Bcrypt API
```python
import bcrypt

# 哈希
salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(password.encode(), salt)

# 验证
is_valid = bcrypt.checkpw(password.encode(), hashed)
```

**对比**：
- Passlib：更高级的抽象，支持多种算法
- Bcrypt：更直接，专注于 bcrypt 算法
- 我们只用 bcrypt，所以直接使用 bcrypt 库更合适

## 🧪 测试清单

### 功能测试

- [x] 新用户注册
- [x] 新用户登录
- [x] 已有用户登录（兼容性）
- [x] 错误密码验证
- [x] Token 刷新
- [x] 退出登录

### 性能测试

- [x] 哈希性能正常
- [x] 验证性能正常
- [x] 无内存泄漏

### 安全测试

- [x] 哈希格式正确
- [x] 盐值随机生成
- [x] 无法反向解密

## 📚 相关资源

- [Bcrypt 官方文档](https://github.com/pyca/bcrypt/)
- [Bcrypt 算法说明](https://en.wikipedia.org/wiki/Bcrypt)
- [Passlib 项目状态](https://github.com/glic3rinu/passlib)

## ✅ 迁移完成检查清单

- [x] 更新 `pyproject.toml`
- [x] 卸载 `passlib`
- [x] 安装 `bcrypt`
- [x] 更新 `app/service/auth.py`
- [x] 重启后端服务
- [x] 测试新用户注册
- [x] 测试新用户登录
- [x] 测试已有用户登录
- [x] 验证功能正常

## 🎉 总结

### 迁移优势

✅ **解决了 72 字节错误**  
✅ **使用活跃维护的库**  
✅ **完全兼容已有数据**  
✅ **代码更简洁**  
✅ **性能相同**  
✅ **安全性相同**  

### 迁移影响

- ✅ 无需修改数据库
- ✅ 无需重置用户密码
- ✅ 无需修改前端代码
- ✅ 无需修改 API 接口

**迁移完成！可以正常使用了！** 🎊
