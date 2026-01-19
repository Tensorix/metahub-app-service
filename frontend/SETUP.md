# 快速设置指南

## 1. 确认依赖已安装

确保已安装以下依赖：

```bash
npm install
# 或
bun install
```

需要的主要依赖：
- react-router-dom
- zustand
- axios
- lucide-react
- @radix-ui/react-slot
- class-variance-authority
- clsx
- tailwind-merge

## 2. 启动后端服务

在项目根目录启动后端：

```bash
# 确保后端运行在 http://localhost:8000
make run
# 或
python main.py
```

## 3. 启动前端开发服务器

```bash
cd frontend
npm run dev
# 或
bun run dev
```

## 4. 访问应用

打开浏览器访问：`http://localhost:5173`

## 5. 测试流程

### 注册新用户
1. 访问 `http://localhost:5173/register`
2. 填写用户名（至少 3 个字符）
3. 填写密码（至少 8 位，包含大小写字母、数字和特殊字符）
4. 可选填写邮箱和手机号
5. 点击"注册"按钮

### 登录
1. 注册成功后会自动登录并跳转到首页
2. 或访问 `http://localhost:5173/login` 手动登录
3. 使用用户名/邮箱/手机号 + 密码登录

### 使用应用
1. 登录后会看到侧边栏和首页
2. 首页显示 "Hi, {username} 👋"
3. 点击侧边栏左上角按钮可折叠/展开侧边栏
4. 点击底部的太阳/月亮图标切换深色/浅色模式
5. 点击"退出登录"按钮登出

## 常见问题

### 后端连接失败
- 确认后端服务运行在 `http://localhost:8000`
- 检查 `.env` 文件中的 `VITE_API_BASE_URL` 配置
- 查看浏览器控制台的网络请求

### 登录失败
- 确认用户名和密码正确
- 检查后端日志是否有错误
- 确认数据库连接正常

### 样式显示异常
- 清除浏览器缓存
- 重启开发服务器
- 检查 Tailwind CSS 是否正确配置

## 技术亮点

### 1. 优雅的侧边栏设计
- 可折叠/展开动画
- 响应式布局
- 用户信息展示
- 导航菜单高亮
- 主题切换集成

### 2. 完整的认证流程
- 密码 SHA256 哈希
- JWT token 管理
- 自动 token 刷新
- 路由保护

### 3. 深色模式支持
- 浅色/深色/跟随系统
- 平滑过渡动画
- 持久化保存

### 4. 现代化技术栈
- React 19 + TypeScript
- Vite 7（极速构建）
- shadcn/ui（优雅组件）
- Zustand（轻量状态管理）
- Tailwind CSS v4（最新版本）

## 下一步

可以基于这个基础继续开发：
- 添加更多页面和功能
- 集成会话管理 API
- 添加用户设置功能
- 实现消息系统
- 添加文件上传功能
