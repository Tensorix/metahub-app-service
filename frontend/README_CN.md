# MetaHub 前端应用

基于 React + TypeScript + Vite + shadcn/ui 构建的现代化前端应用。

## 功能特性

✨ **认证系统**
- 用户注册（支持用户名、邮箱、手机号）
- 用户登录（支持用户名/邮箱/手机号登录）
- 自动 token 刷新
- 安全的密码处理（SHA256 哈希）

🎨 **优雅的 UI**
- 基于 shadcn/ui 组件库
- 响应式侧边栏设计
- 支持深色/浅色/跟随系统主题
- 流畅的动画效果

🚀 **技术栈**
- React 19
- TypeScript
- Vite 7
- React Router v6
- Zustand（状态管理）
- Axios（HTTP 客户端）
- Tailwind CSS v4
- shadcn/ui

## 快速开始

### 安装依赖

```bash
npm install
# 或
bun install
```

### 配置环境变量

复制 `.env.example` 为 `.env` 并配置后端 API 地址：

```bash
cp .env.example .env
```

编辑 `.env`：
```
VITE_API_BASE_URL=http://localhost:8000
```

### 启动开发服务器

```bash
npm run dev
# 或
bun run dev
```

应用将在 `http://localhost:5173` 启动。

### 构建生产版本

```bash
npm run build
# 或
bun run build
```

## 项目结构

```
frontend/
├── src/
│   ├── components/          # 组件
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   ├── Layout.tsx      # 主布局
│   │   ├── Sidebar.tsx     # 侧边栏
│   │   ├── ThemeToggle.tsx # 主题切换
│   │   └── ProtectedRoute.tsx # 路由保护
│   ├── pages/              # 页面
│   │   ├── Login.tsx       # 登录页
│   │   ├── Register.tsx    # 注册页
│   │   ├── Home.tsx        # 首页
│   │   ├── Sessions.tsx    # 会话页
│   │   └── Settings.tsx    # 设置页
│   ├── store/              # 状态管理
│   │   ├── auth.ts         # 认证状态
│   │   └── theme.ts        # 主题状态
│   ├── lib/                # 工具库
│   │   ├── api.ts          # API 客户端
│   │   └── utils.ts        # 工具函数
│   ├── App.tsx             # 应用入口
│   ├── main.tsx            # 主文件
│   └── index.css           # 全局样式
├── .env                    # 环境变量
└── vite.config.ts          # Vite 配置
```

## 主要功能

### 认证流程

1. **注册**：用户填写用户名、密码（可选邮箱和手机号）
2. **登录**：使用用户名/邮箱/手机号 + 密码登录
3. **自动刷新**：access_token 过期时自动使用 refresh_token 刷新
4. **登出**：清除本地 token 并调用后端登出接口

### 侧边栏功能

- **可折叠设计**：点击按钮折叠/展开侧边栏
- **用户信息展示**：显示用户头像和基本信息
- **导航菜单**：首页、会话、设置
- **主题切换**：支持深色/浅色模式切换
- **退出登录**：快速登出功能

### 主题系统

支持三种主题模式：
- **浅色模式**：明亮清爽
- **深色模式**：护眼舒适
- **跟随系统**：自动适配系统主题

主题设置会保存到 localStorage，刷新页面后保持。

## API 集成

### 后端接口

应用与以下后端接口集成：

- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/logout` - 用户登出
- `POST /api/v1/auth/refresh` - 刷新 token
- `GET /api/v1/auth/me` - 获取当前用户信息

### 密码安全

前端在发送密码前会进行 SHA256 哈希处理，确保密码不以明文传输。

## 开发指南

### 添加新页面

1. 在 `src/pages/` 创建新页面组件
2. 在 `src/App.tsx` 添加路由
3. 在 `src/components/Sidebar.tsx` 添加菜单项（如需要）

### 添加新的 UI 组件

使用 shadcn/ui CLI 添加组件：

```bash
npx shadcn@latest add [component-name]
```

### 状态管理

使用 Zustand 进行状态管理，示例：

```typescript
import { create } from 'zustand';

interface MyState {
  count: number;
  increment: () => void;
}

export const useMyStore = create<MyState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

## 浏览器支持

- Chrome (最新版)
- Firefox (最新版)
- Safari (最新版)
- Edge (最新版)

## 许可证

MIT
