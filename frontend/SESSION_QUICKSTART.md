# 会话列表功能快速启动

## 🚀 快速开始

### 1. 启动后端服务

```bash
# 在项目根目录
make dev
# 或
uvicorn main:app --reload
```

后端将运行在 `http://localhost:8000`

### 2. 启动前端服务

```bash
cd frontend
npm run dev
# 或使用 bun
bun run dev
```

前端将运行在 `http://localhost:5173`

### 3. 访问会话列表

1. 登录系统
2. 点击侧边栏的"会话管理"
3. 开始使用会话列表功能

## 📦 已安装的依赖

确保以下依赖已安装：

```json
{
  "@radix-ui/react-dialog": "^1.x.x",
  "@radix-ui/react-slot": "^1.x.x",
  "lucide-react": "^0.x.x",
  "class-variance-authority": "^0.x.x",
  "tailwind-merge": "^3.x.x"
}
```

如果缺少依赖，运行：

```bash
cd frontend
npm install @radix-ui/react-dialog
```

## 🎨 功能演示

### 创建第一个会话

1. 点击右上角"新建会话"按钮
2. 填写信息：
   - 名称：`测试会话`
   - 类型：选择 `私聊`
   - 来源：`manual_upload`（可选）
3. 点击"保存"

### 为会话添加话题

1. 找到刚创建的会话
2. 点击右侧"⋮"菜单
3. 选择"新建话题"
4. 输入话题名称：`项目讨论`
5. 点击"保存"

### 查看话题

1. 点击会话左侧的"▶"按钮
2. 话题列表会展开显示

### 筛选和搜索

1. 使用顶部搜索框搜索会话
2. 点击"类型"按钮筛选特定类型的会话
3. 点击"排序"按钮改变排序方式

## 🎯 核心组件说明

### Sessions.tsx
主页面，包含所有状态管理和业务逻辑

### SessionList.tsx
会话列表展示组件，支持：
- 会话卡片展示
- 话题展开/收起
- 操作菜单

### SessionDialog.tsx
会话创建/编辑对话框

### TopicDialog.tsx
话题创建/编辑对话框

### SessionFilters.tsx
筛选和排序控件

## 🔧 API 端点

会话列表使用以下 API：

```
GET    /api/v1/sessions              # 获取会话列表
POST   /api/v1/sessions              # 创建会话
GET    /api/v1/sessions/{id}         # 获取会话详情
PUT    /api/v1/sessions/{id}         # 更新会话
DELETE /api/v1/sessions/{id}         # 删除会话
POST   /api/v1/sessions/{id}/read    # 标记已读

GET    /api/v1/sessions/{id}/topics  # 获取话题列表
POST   /api/v1/sessions/{id}/topics  # 创建话题
PUT    /api/v1/topics/{id}            # 更新话题
DELETE /api/v1/topics/{id}            # 删除话题
```

## 🎨 UI 组件库

使用 shadcn/ui 组件：

- `Button` - 按钮
- `Card` - 卡片
- `Dialog` - 对话框
- `Badge` - 徽章
- `Input` - 输入框
- `DropdownMenu` - 下拉菜单
- `Skeleton` - 骨架屏
- `Alert` - 警告提示

## 🐛 常见问题

### Q: 会话列表显示空白
A: 检查：
1. 后端服务是否运行
2. 用户是否已登录
3. 浏览器控制台是否有错误

### Q: 无法创建会话
A: 确认：
1. 必填字段已填写（type 是必填的）
2. 网络请求是否成功
3. 后端日志是否有错误

### Q: 话题列表不显示
A: 验证：
1. 会话是否有话题数据
2. 点击展开按钮后是否发起 API 请求
3. API 响应是否正常

### Q: 样式显示异常
A: 检查：
1. Tailwind CSS 是否正确配置
2. 组件导入路径是否正确
3. 清除浏览器缓存

## 📱 响应式设计

界面已针对以下设备优化：

- 🖥️ 桌面端（1920px+）
- 💻 笔记本（1366px+）
- 📱 平板（768px+）
- 📱 手机（375px+）

## 🎯 下一步

1. ✅ 会话列表基础功能已完成
2. 🔄 可以添加消息列表功能
3. 🔄 可以添加实时通知
4. 🔄 可以添加会话搜索高级功能

## 📚 相关文档

- [详细使用指南](./SESSION_LIST_GUIDE.md)
- [API 文档](../API_MIGRATION_GUIDE.md)
- [前端实现总览](../FRONTEND_IMPLEMENTATION.md)

## 💡 提示

- 使用 `Cmd/Ctrl + K` 快速搜索
- 双击会话卡片快速进入
- 右键点击显示更多操作（未来功能）
- 拖拽排序（未来功能）

---

**享受使用会话列表功能！** 🎉
