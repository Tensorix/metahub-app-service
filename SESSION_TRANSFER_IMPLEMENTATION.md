# 会话导入导出功能实现总结

## 实现概述

已完成会话导入导出功能的完整实现，包括后端服务、API 路由和前端 UI 组件。

## 后端实现

### 1. Schema 定义 (`app/schema/session_transfer.py`)

定义了完整的数据模型：
- **导出模型**：`ExportSession`, `ExportMessage`, `ExportMessagePart`, `ExportSender`, `ExportTopic`
- **导入模型**：`ImportedSessionInfo`, `SessionImportResponse`, `ImportPreviewResponse`
- **统计模型**：`ExportStatistics`, `ImportStatistics`
- **辅助模型**：`DuplicateCheck`, `SessionPreview`, `ResourceRef`

### 2. 导入适配器 (`app/service/import_adapters/`)

实现了可扩展的适配器架构：
- **基类** (`base.py`)：定义适配器接口
- **MetaHub 适配器** (`metahub.py`)：处理原生格式
- **注册机制** (`__init__.py`)：支持动态注册新适配器

### 3. 服务层 (`app/service/session_transfer.py`)

核心功能实现：

#### 导出功能
- ✅ 单会话导出（JSON/JSONL 格式）
- ✅ 批量导出（按类型分组，ZIP 打包）
- ✅ 增量导出（按时间范围筛选消息）
- ✅ 流式输出（内存友好）
- ✅ 外部资源引用提取（预留缓存接口）

#### 导入功能
- ✅ JSON 格式导入
- ✅ JSONL 格式导入
- ✅ ZIP 批量导入
- ✅ 自动格式检测
- ✅ 数据验证
- ✅ ID 映射和引用更新
- ✅ 发送者合并选项
- ✅ 重复导入检测（基于 export_id）

#### 预览功能
- ✅ 导入前预览文件内容
- ✅ 显示会话列表和统计信息
- ✅ 重复导入警告

### 4. API 路由 (`app/router/v1/session_transfer.py`)

提供 RESTful API：
- `GET /api/v1/sessions/{session_id}/export` - 单会话导出
- `POST /api/v1/sessions/export/batch` - 批量导出
- `POST /api/v1/sessions/import` - 导入会话
- `POST /api/v1/sessions/import/preview` - 预览导入

## 前端实现

### 1. API 封装 (`frontend/src/lib/api.ts`)

扩展了 `sessionTransferApi`：
- `exportSession()` - 单会话导出
- `exportSessionsBatch()` - 批量导出
- `importSessions()` - 导入会话
- `previewImport()` - 预览导入

### 2. 工具函数 (`frontend/src/lib/utils.ts`)

添加了辅助函数：
- `downloadBlob()` - 触发文件下载
- `formatFileSize()` - 格式化文件大小
- `validateImportFile()` - 验证导入文件
- `getSessionTypeLabel()` - 获取会话类型显示名称
- `formatDateForInput()` - 格式化日期为输入框格式

### 3. 自定义 Hook (`frontend/src/hooks/useSessionTransfer.ts`)

统一管理导入导出状态：
- 单会话导出状态和方法
- 批量导出状态和方法
- 导入状态和方法
- 预览状态和方法
- 错误处理和清理方法

### 4. UI 组件 (`frontend/src/components/session-transfer/`)

#### SessionExportButton
- 快捷导出按钮（一键导出 JSON）
- 支持自定义样式和大小
- 显示加载状态

#### SessionExportDialog
- 高级导出对话框
- 支持格式选择（JSON/JSONL）
- 支持增量导出（时间范围选择）
- 快捷日期按钮（7天/30天）
- 包含已删除消息选项

#### BatchExportDialog
- 批量导出对话框
- 会话列表加载和显示
- 类型筛选（AI/私聊/群聊）
- 按类型分组选择
- 全选/取消全选功能
- 导出格式选择
- 按类型分文件选项
- 时间范围筛选

#### SessionImportDialog
- 导入对话框
- 文件选择（支持 .json/.jsonl/.zip）
- 自动预览功能
- 会话列表预览
- 重复导入警告
- 合并发送者选项
- 错误处理和验证

#### SessionTransferMenu
- 下拉菜单组件
- 导出子菜单（JSON/JSONL/高级）
- 批量导出入口
- 导入入口

### 5. UI 集成

#### SessionSidebar
- 添加了导入按钮（顶部工具栏）
- 添加了批量导出按钮（顶部工具栏）
- 导入成功后自动刷新会话列表

#### MessageArea
- 添加了快捷导出按钮（会话头部）
- 添加了高级导出对话框（会话头部）
- 与现有会话设置按钮并列显示

### 6. UI 组件依赖

创建了缺失的 shadcn/ui 组件：
- `Checkbox` - 复选框组件
- `Select` - 下拉选择组件

## 核心特性

### 1. 数据完整性
- ✅ 导出包含会话、话题、消息、发送者的完整数据
- ✅ 保留所有时间戳和元数据
- ✅ 不导出 Agent 配置（安全考虑）

### 2. 格式支持
- ✅ JSON - 单会话，易读
- ✅ JSONL - 批量/流式，内存友好
- ✅ ZIP - 多会话打包，按类型分组

### 3. 增量导出
- ✅ 按时间范围筛选消息
- ✅ 会话和话题仍完整导出
- ✅ 统计信息标注筛选条件

### 4. 重复导入检测
- ✅ 使用 export_id 标识导出批次
- ✅ 导入时存入 session.metadata.import_info
- ✅ 预览时检查并警告用户

### 5. ID 映射
- ✅ 导入时生成新 UUID
- ✅ 维护 original_id -> new_id 映射
- ✅ 自动更新所有外键引用

### 6. 发送者合并
- ✅ 可选择合并同名发送者
- ✅ 复用已有发送者记录
- ✅ 统计合并数量

### 7. 流式处理
- ✅ 导出使用生成器，边查询边输出
- ✅ 支持大文件处理
- ✅ 内存占用小

### 8. 用户体验
- ✅ 快捷导出（一键完成）
- ✅ 高级导出（丰富选项）
- ✅ 批量导出（多会话选择）
- ✅ 导入预览（查看内容）
- ✅ 加载状态反馈
- ✅ 错误提示清晰

## 文件清单

### 后端新增文件
```
app/schema/session_transfer.py
app/service/session_transfer.py
app/service/import_adapters/__init__.py
app/service/import_adapters/base.py
app/service/import_adapters/metahub.py
app/router/v1/session_transfer.py
```

### 前端新增文件
```
frontend/src/hooks/useSessionTransfer.ts
frontend/src/components/session-transfer/SessionExportButton.tsx
frontend/src/components/session-transfer/SessionExportDialog.tsx
frontend/src/components/session-transfer/BatchExportDialog.tsx
frontend/src/components/session-transfer/SessionImportDialog.tsx
frontend/src/components/session-transfer/SessionTransferMenu.tsx
frontend/src/components/session-transfer/index.ts
frontend/src/components/ui/checkbox.tsx
frontend/src/components/ui/select.tsx
```

### 修改的文件
```
app/router/v1/__init__.py - 注册新路由
frontend/src/lib/api.ts - 添加导入导出 API
frontend/src/lib/utils.ts - 添加工具函数
frontend/src/components/chat/SessionSidebar.tsx - 添加导入导出按钮
frontend/src/components/chat/MessageArea.tsx - 添加导出按钮
```

## 使用示例

### 后端 API 调用

```bash
# 导出单个会话
curl -X GET "http://localhost:8000/api/v1/sessions/{session_id}/export?format=json" \
  -H "Authorization: Bearer {token}" \
  -o session_export.json

# 批量导出
curl -X POST "http://localhost:8000/api/v1/sessions/export/batch" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"type_filter": ["ai"], "group_by_type": true}' \
  -o sessions_export.zip

# 导入会话
curl -X POST "http://localhost:8000/api/v1/sessions/import" \
  -H "Authorization: Bearer {token}" \
  -F "file=@session_export.json"

# 预览导入
curl -X POST "http://localhost:8000/api/v1/sessions/import/preview" \
  -H "Authorization: Bearer {token}" \
  -F "file=@session_export.json"
```

### 前端使用

```typescript
// 快捷导出
<SessionExportButton
  sessionId={session.id}
  sessionName={session.name}
/>

// 高级导出
<SessionExportDialog
  sessionId={session.id}
  sessionName={session.name}
/>

// 批量导出
<BatchExportDialog />

// 导入
<SessionImportDialog
  onSuccess={(ids) => {
    console.log('导入成功', ids);
  }}
/>
```

## 待实现功能（TODO）

### 外部资源缓存
- [ ] 导出时下载外部资源（图片、文件等）
- [ ] 导入时重新上传资源
- [ ] 资源缓存管理

### 其他格式适配器
- [ ] 微信聊天记录导入
- [ ] Telegram 导出导入
- [ ] ChatGPT 对话导入
- [ ] CSV 格式支持

### 增强功能
- [ ] 导入进度追踪
- [ ] 定时自动备份
- [ ] 导出模板自定义
- [ ] 数据加密选项

## 测试建议

### 单元测试
- [ ] 测试单会话导出（JSON/JSONL）
- [ ] 测试批量导出（ZIP）
- [ ] 测试增量导出（时间范围）
- [ ] 测试导入功能（JSON/JSONL/ZIP）
- [ ] 测试重复导入检测
- [ ] 测试数据验证
- [ ] 测试 ID 映射
- [ ] 测试发送者合并

### 集成测试
- [ ] 测试完整导出导入流程
- [ ] 测试大文件处理
- [ ] 测试错误处理
- [ ] 测试并发导入导出

### 性能测试
- [ ] 1000 条消息的会话导出性能
- [ ] 100 个会话批量导出性能
- [ ] 大文件导入性能
- [ ] 内存占用测试

## 部署注意事项

1. **依赖安装**
   - 后端：无新增依赖
   - 前端：需要安装 `@radix-ui/react-checkbox`, `@radix-ui/react-select`, `@radix-ui/react-scroll-area`, `@radix-ui/react-switch`

2. **数据库**
   - 无需新增表或字段
   - 使用现有 session.metadata_ 字段存储导入信息

3. **文件大小限制**
   - 建议设置最大上传文件大小为 100MB
   - 可在 FastAPI 配置中调整

4. **权限控制**
   - 所有操作需要用户认证
   - 仅能导出/导入自己的会话

## 总结

已完成会话导入导出功能的完整实现，包括：
- ✅ 后端服务层（导出、导入、预览）
- ✅ API 路由（RESTful 接口）
- ✅ 前端 API 封装
- ✅ 前端 UI 组件（5 个完整组件）
- ✅ UI 集成（SessionSidebar 和 MessageArea）
- ✅ 多格式支持（JSON/JSONL/ZIP）
- ✅ 增量导出
- ✅ 重复导入检测
- ✅ 发送者合并
- ✅ 流式处理

功能已就绪，可以开始测试和使用！
