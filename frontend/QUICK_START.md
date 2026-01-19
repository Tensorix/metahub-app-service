# 🚀 快速开始

## 一键启动

```bash
# 1. 进入前端目录
cd frontend

# 2. 启动开发服务器（依赖已安装）
npm run dev
# 或
bun run dev
```

访问：`http://localhost:5173`

## 📸 功能演示

### 1️⃣ 注册新用户
- 访问 `/register`
- 填写用户名（至少 3 个字符）
- 填写密码（至少 8 位，包含大小写字母、数字和特殊字符）
- 示例密码：`Test@123456`
- 点击"注册"

### 2️⃣ 登录
- 注册成功后自动登录
- 或访问 `/login` 手动登录

### 3️⃣ 体验侧边栏
- ✅ 点击左上角按钮折叠/展开侧边栏
- ✅ 查看用户头像和信息
- ✅ 点击菜单项切换页面
- ✅ 当前页面高亮显示

### 4️⃣ 切换主题
- ✅ 点击底部太阳/月亮图标
- ✅ 或在设置页面选择主题模式
- ✅ 支持：浅色、深色、跟随系统

### 5️⃣ 查看首页
- ✅ 显示 "Hi, {username} 👋"
- ✅ 查看账户信息卡片
- ✅ 响应式布局

## 🎯 核心文件

| 文件 | 说明 |
|------|------|
| `src/App.tsx` | 路由配置 |
| `src/components/Sidebar.tsx` | 侧边栏组件 ⭐ |
| `src/components/Layout.tsx` | 主布局 |
| `src/pages/Home.tsx` | 首页 |
| `src/pages/Login.tsx` | 登录页 |
| `src/pages/Register.tsx` | 注册页 |
| `src/store/auth.ts` | 认证状态 |
| `src/store/theme.ts` | 主题状态 |
| `src/lib/api.ts` | API 客户端 |

## 🔧 配置

### 环境变量（`.env`）
```env
VITE_API_BASE_URL=http://localhost:8000
```

### 后端要求
- 后端服务运行在 `http://localhost:8000`
- API 路径：`/api/v1/auth/*`

## 📚 文档

- `README_CN.md` - 完整功能说明
- `SETUP.md` - 详细设置指南
- `FEATURES.md` - 功能特性详解
- `IMPLEMENTATION_SUMMARY.md` - 实现总结

## ⚡ 技术栈

- React 19 + TypeScript
- Vite 7
- React Router v6
- Zustand
- Axios
- Tailwind CSS v4
- shadcn/ui
- Lucide React

## 🎨 侧边栏特性（重点）

### 展开状态（256px）
- 显示完整文字和图标
- 用户信息完整展示
- 菜单项带文字标签

### 折叠状态（64px）
- 仅显示图标
- 用户头像居中
- 所有功能保持可用

### 动画效果
- 300ms 平滑过渡
- 图标旋转动画
- 悬停高亮效果

## 🌙 主题系统

### 三种模式
1. **浅色** - 明亮清爽
2. **深色** - 护眼舒适
3. **跟随系统** - 自动适配

### 持久化
- 设置保存到 localStorage
- 刷新页面后保持

## 🔐 安全特性

- ✅ 密码 SHA256 哈希
- ✅ JWT Token 管理
- ✅ 自动 Token 刷新
- ✅ 路由权限保护

## 🐛 常见问题

### 后端连接失败
```bash
# 检查后端是否运行
curl http://localhost:8000/api/v1/auth/me

# 检查 .env 配置
cat .env
```

### 样式异常
```bash
# 清除缓存并重启
rm -rf node_modules/.vite
npm run dev
```

### 登录失败
- 确认用户名和密码正确
- 检查浏览器控制台错误
- 查看网络请求响应

## 🎉 开始使用

现在你可以：
1. ✅ 注册/登录账户
2. ✅ 体验优雅的侧边栏
3. ✅ 切换深色/浅色模式
4. ✅ 查看用户信息
5. ✅ 导航不同页面

享受开发！🚀
