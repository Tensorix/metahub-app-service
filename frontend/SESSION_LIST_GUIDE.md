# 会话列表功能使用指南

## 功能概述

会话列表页面提供了完整的会话管理功能，包括：

- ✅ 会话的创建、编辑、删除
- ✅ 话题（Topic）的创建、编辑、删除
- ✅ 会话类型筛选（私聊、群聊、AI）
- ✅ 多种排序方式（最近更新、创建时间、名称）
- ✅ 实时搜索
- ✅ 展开/收起话题列表
- ✅ 未读消息计数显示
- ✅ 优雅的加载状态和空状态

## 组件结构

```
frontend/src/
├── pages/
│   └── Sessions.tsx              # 主页面
├── components/
│   ├── SessionList.tsx           # 会话列表组件
│   ├── SessionDialog.tsx         # 会话编辑对话框
│   ├── TopicDialog.tsx           # 话题编辑对话框
│   ├── SessionFilters.tsx        # 筛选和排序组件
│   ├── EmptyState.tsx            # 空状态组件
│   ├── SessionListSkeleton.tsx   # 加载骨架屏
│   └── ui/
│       ├── dialog.tsx            # 对话框组件
│       ├── badge.tsx             # 徽章组件
│       ├── skeleton.tsx          # 骨架屏组件
│       └── dropdown-menu.tsx     # 下拉菜单组件
└── lib/
    └── api.ts                    # API 接口定义
```

## 主要功能

### 1. 会话管理

#### 创建会话
- 点击右上角"新建会话"按钮
- 填写会话名称、选择类型（私聊/群聊/AI）
- 可选填写来源信息

#### 编辑会话
- 点击会话卡片右侧的"⋮"菜单
- 选择"编辑"
- 修改会话信息后保存

#### 删除会话
- 点击会话卡片右侧的"⋮"菜单
- 选择"删除"
- 确认删除操作

### 2. 话题管理

#### 创建话题
- 点击会话卡片右侧的"⋮"菜单
- 选择"新建话题"
- 输入话题名称

#### 查看话题
- 点击会话卡片左侧的展开按钮（▶）
- 话题列表会展开显示在会话下方

#### 编辑/删除话题
- 展开会话的话题列表
- 点击话题卡片右侧的"⋮"菜单
- 选择"编辑"或"删除"

### 3. 筛选和排序

#### 类型筛选
- 点击"类型"按钮
- 选择要筛选的会话类型（私聊/群聊/AI）
- 点击"清除筛选"可重置

#### 排序
- 点击"排序"按钮
- 选择排序方式：
  - 最近更新：按最后访问时间排序
  - 创建时间：按创建时间排序
  - 名称：按会话名称字母顺序排序

### 4. 搜索

在搜索框中输入关键词，可以搜索：
- 会话名称
- 会话类型
- 来源信息

## UI 特性

### 会话卡片显示

每个会话卡片包含：
- 📱 会话图标
- 📝 会话名称
- 🏷️ 类型标签（带颜色区分）
- 🔴 未读消息数（如果有）
- 📅 最后访问时间
- 📊 话题数量
- ⚙️ 操作菜单

### 颜色主题

- **私聊**：蓝色主题
- **群聊**：绿色主题
- **AI**：紫色主题

### 响应式设计

- 自适应不同屏幕尺寸
- 移动端友好的触摸交互
- 流畅的动画过渡效果

## API 集成

所有会话和话题操作都通过 `sessionApi` 进行：

```typescript
import { sessionApi } from '@/lib/api';

// 获取会话列表
const sessions = await sessionApi.getSessions({ page: 1, size: 20 });

// 创建会话
const session = await sessionApi.createSession({
  name: '新会话',
  type: 'pm',
});

// 获取话题列表
const topics = await sessionApi.getTopics(sessionId);

// 创建话题
const topic = await sessionApi.createTopic(sessionId, {
  name: '新话题',
  session_id: sessionId,
});
```

## 状态管理

页面使用 React Hooks 进行状态管理：

- `sessions`: 会话列表
- `topics`: 话题列表（按会话 ID 索引）
- `expandedSessions`: 展开的会话集合
- `selectedSessionId`: 当前选中的会话
- `searchQuery`: 搜索关键词
- `selectedType`: 筛选的会话类型
- `sortBy`: 排序方式

## 性能优化

- ✅ 懒加载话题列表（仅在展开时加载）
- ✅ 骨架屏加载状态
- ✅ 防抖搜索（可选）
- ✅ 条件渲染优化

## 未来扩展

可以考虑添加的功能：

- [ ] 批量操作（批量删除、批量标记已读）
- [ ] 拖拽排序
- [ ] 会话置顶
- [ ] 会话归档
- [ ] 导出会话数据
- [ ] 会话分组
- [ ] 更多筛选条件（按来源、按时间范围）
- [ ] 虚拟滚动（处理大量会话）

## 样式定制

所有组件都使用 Tailwind CSS 和 shadcn/ui，可以通过修改以下文件进行样式定制：

- `frontend/src/index.css` - 全局样式
- `frontend/tailwind.config.js` - Tailwind 配置
- 各组件的 `className` 属性

## 故障排查

### 会话列表不显示
1. 检查后端 API 是否正常运行
2. 检查浏览器控制台是否有错误
3. 确认用户已登录且 token 有效

### 话题列表不展开
1. 确认会话有话题数据
2. 检查 `expandedSessions` 状态
3. 查看控制台是否有 API 错误

### 搜索不工作
1. 检查 `searchQuery` 状态更新
2. 确认过滤逻辑正确
3. 验证会话数据结构

## 相关文档

- [API 文档](../API_MIGRATION_GUIDE.md)
- [前端实现指南](../FRONTEND_IMPLEMENTATION.md)
- [shadcn/ui 文档](https://ui.shadcn.com/)
