# 步骤 7：实现检查清单

## 概述

按顺序完成以下任务，每完成一项打勾 ✅

---

## 阶段 1：后端基础实现

### 1.1 创建 Schema

- [ ] 创建 `app/schema/session_transfer.py`
  - [ ] `ExportSession`、`ExportMessage`、`ExportMessagePart` 等导出模型
  - [ ] `SessionExportData` 完整导出数据模型（JSON 格式）
  - [ ] `BatchExportRequest` 批量导出请求模型
  - [ ] `BatchExportManifest` ZIP 清单模型
  - [ ] `SessionImportResponse` 导入响应模型（支持多会话）
  - [ ] `ImportedSessionInfo` 单会话导入结果
  - [ ] `ImportPreviewResponse` 预览响应模型
  - [ ] `SessionPreview` 会话预览信息
  - [ ] `DuplicateCheck` 重复导入检测结果
  - [ ] `ResourceRef` 外部资源引用（TODO 缓存功能）
  - [ ] `ImportStatistics`、`ExportStatistics` 统计信息模型

### 1.2 创建导入适配器

- [ ] 创建目录 `app/service/import_adapters/`
- [ ] 创建 `app/service/import_adapters/__init__.py` - 适配器注册
- [ ] 创建 `app/service/import_adapters/base.py` - 基类定义
- [ ] 创建 `app/service/import_adapters/metahub.py` - MetaHub 格式适配器
  - [ ] `validate()` 方法
  - [ ] `normalize()` 方法
  - [ ] `detect()` 方法
  - [ ] 支持 JSON 格式
  - [ ] 支持 JSONL 格式
  - [ ] 支持 ZIP 格式（批量导入）

### 1.3 创建服务层

- [ ] 创建 `app/service/session_transfer.py`
  - [ ] **单会话导出**
    - [ ] `export_session()` - 导出单个会话
    - [ ] `_stream_json()` - 流式 JSON 输出
    - [ ] `_stream_jsonl_single()` - 流式 JSONL 输出
  - [ ] **批量导出**
    - [ ] `export_batch()` - 批量导出会话
    - [ ] `_stream_jsonl_batch()` - 批量 JSONL 流
    - [ ] `_stream_zip()` - ZIP 打包流
  - [ ] **导入**
    - [ ] `import_sessions()` - 导入会话（支持多格式）
    - [ ] `preview_import()` - 预览导入
    - [ ] `_import_json()` - JSON 格式导入
    - [ ] `_import_jsonl()` - JSONL 格式导入
    - [ ] `_import_zip()` - ZIP 格式导入
    - [ ] `_check_duplicates()` - 重复导入检测
    - [ ] `_do_import_session()` - 执行单会话导入
  - [ ] **工具方法**
    - [ ] `_calculate_statistics()` - 统计计算
    - [ ] `_extract_resource_refs()` - 提取外部资源引用（TODO 缓存）
    - [ ] `generate_export_filename()` - 生成文件名

### 1.4 创建 API 路由

- [ ] 创建 `app/router/v1/session_transfer.py`
  - [ ] `GET /sessions/{session_id}/export` - 单会话导出
    - [ ] 支持 `format` 参数 (json/jsonl)
    - [ ] 支持 `start_date`/`end_date` 增量导出
    - [ ] 支持 `include_deleted` 参数
  - [ ] `POST /sessions/export/batch` - 批量导出
    - [ ] 支持 `session_ids` 指定会话
    - [ ] 支持 `type_filter` 按类型筛选
    - [ ] 支持 `group_by_type` 分类型打包
  - [ ] `POST /sessions/import` - 导入端点
  - [ ] `POST /sessions/import/preview` - 预览端点
- [ ] 在 `app/api.py` 中注册路由

---

## 阶段 2：后端测试

### 2.1 单元测试

- [ ] 创建 `tests/test_session_transfer.py`
  - [ ] 测试单会话导出（JSON/JSONL）
  - [ ] 测试批量导出（ZIP）
  - [ ] 测试增量导出（时间范围）
  - [ ] 测试导入功能（JSON/JSONL/ZIP）
  - [ ] 测试重复导入检测（export_id）
  - [ ] 测试数据验证
  - [ ] 测试 ID 映射（original_id → new_id）
  - [ ] 测试发送者合并

### 2.2 集成测试

- [ ] 测试导出 API 端点
- [ ] 测试导入 API 端点
- [ ] 测试大文件处理
- [ ] 测试错误处理

---

## 阶段 3：前端基础实现

### 3.1 API 封装

- [ ] 在 `frontend/src/lib/api.ts` 添加类型定义
  - [ ] `ExportStatistics`
  - [ ] `ImportStatistics`
  - [ ] `SessionImportResponse`（支持多会话）
  - [ ] `ImportedSessionInfo`
  - [ ] `ImportPreviewResponse`
  - [ ] `SessionPreview`
  - [ ] `DuplicateCheck`
  - [ ] `ResourceRef`
  - [ ] `ExportOptions`
  - [ ] `BatchExportOptions`
  - [ ] `ImportOptions`
- [ ] 在 `sessionApi` 添加方法
  - [ ] `exportSession()` - 单会话导出
  - [ ] `exportSessionsBatch()` - 批量导出
  - [ ] `importSessions()` - 导入（支持多格式）
  - [ ] `previewImport()` - 预览导入

### 3.2 工具函数

- [ ] 在 `frontend/src/lib/utils.ts` 添加
  - [ ] `downloadBlob()`
  - [ ] `formatFileSize()`
  - [ ] `validateImportFile()` - 支持 .json/.jsonl/.zip
  - [ ] `getSessionTypeLabel()` - 会话类型显示名
  - [ ] `formatDateForInput()` - 日期格式化

### 3.3 自定义 Hook

- [ ] 创建 `frontend/src/hooks/useSessionTransfer.ts`
  - [ ] 单会话导出状态和方法
  - [ ] 批量导出状态和方法
  - [ ] 导入状态和方法
  - [ ] 预览状态和方法
  - [ ] 导入结果状态
  - [ ] 错误处理和清理方法

---

## 阶段 4：前端 UI 实现

### 4.1 导出组件

- [ ] 创建 `frontend/src/components/session-transfer/SessionExportButton.tsx`
  - [ ] 快捷导出按钮
  - [ ] 加载状态
  - [ ] Toast 通知
  
- [ ] 创建 `frontend/src/components/session-transfer/SessionExportDialog.tsx`
  - [ ] 格式选择（JSON/JSONL）
  - [ ] 增量导出（时间范围选择）
  - [ ] 快捷日期按钮（7天/30天）
  - [ ] 包含已删除消息选项

### 4.2 批量导出组件

- [ ] 创建 `frontend/src/components/session-transfer/BatchExportDialog.tsx`
  - [ ] 会话列表加载
  - [ ] 类型筛选（AI/私聊/群聊）
  - [ ] 按类型分组选择
  - [ ] 全选/取消全选
  - [ ] 导出格式选择
  - [ ] 按类型分文件选项
  - [ ] 时间范围筛选

### 4.3 导入组件

- [ ] 创建 `frontend/src/components/session-transfer/SessionImportDialog.tsx`
  - [ ] 文件选择（支持 .json/.jsonl/.zip）
  - [ ] 自动预览
  - [ ] 会话列表预览
  - [ ] 重复导入警告
  - [ ] 合并发送者选项
  - [ ] 错误处理
  - [ ] 成功反馈

### 4.4 菜单组件

- [ ] 创建 `frontend/src/components/session-transfer/SessionTransferMenu.tsx`
  - [ ] 下拉菜单
  - [ ] 导出子菜单（JSON/JSONL/高级）
  - [ ] 批量导出入口
  - [ ] 导入入口

### 4.5 集成到现有 UI

- [ ] 在 `SessionSidebar` 添加批量导出和导入入口
- [ ] 在 `SessionDetail` 添加导出按钮和菜单
- [ ] 在会话列表项添加快捷导出按钮

---

## 阶段 5：测试与优化

### 5.1 端到端测试

- [ ] 测试完整单会话导出流程（JSON/JSONL）
- [ ] 测试完整批量导出流程（ZIP）
- [ ] 测试增量导出（时间范围）
- [ ] 测试完整导入流程（JSON/JSONL/ZIP）
- [ ] 测试重复导入检测和警告
- [ ] 测试大会话处理
- [ ] 测试网络错误恢复

### 5.2 性能优化

- [ ] 导出流式响应
- [ ] 导入批量插入
- [ ] 前端文件预览优化
- [ ] ZIP 打包内存优化

### 5.3 文档更新

- [ ] 更新 API 文档
- [ ] 添加用户使用说明
- [ ] 更新 README

---

## 文件清单

### 新建文件

```
后端:
├── app/schema/session_transfer.py
├── app/service/session_transfer.py
├── app/service/import_adapters/__init__.py
├── app/service/import_adapters/base.py
├── app/service/import_adapters/metahub.py
└── tests/test_session_transfer.py

前端:
├── frontend/src/hooks/useSessionTransfer.ts
├── frontend/src/components/session-transfer/
│   ├── SessionExportButton.tsx
│   ├── SessionExportDialog.tsx
│   ├── BatchExportDialog.tsx
│   ├── SessionImportDialog.tsx
│   └── SessionTransferMenu.tsx
```

### 修改文件

```
后端:
├── app/api.py            # 添加路由注册
└── app/router/v1/__init__.py  # 导入新路由

前端:
├── frontend/src/lib/api.ts      # 添加 API 方法和类型
├── frontend/src/lib/utils.ts    # 添加工具函数
└── frontend/src/components/chat/SessionSidebar.tsx  # 添加导入导出入口
```

---

## 验收标准

### 功能验收

- [ ] 能够导出单个会话的完整数据（JSON/JSONL）
- [ ] 能够批量导出多个会话（ZIP）
- [ ] 能够增量导出指定时间范围的消息
- [ ] 不同类型的会话导出时按类型分开打包
- [ ] 导出文件包含所有消息、话题、发送者信息
- [ ] 导出文件不包含 Agent 配置信息
- [ ] 能够从导出文件导入会话（JSON/JSONL/ZIP）
- [ ] 导入后数据完整且关联正确
- [ ] 重复导入时能够检测并提示用户
- [ ] 导入预览显示正确的统计信息和会话列表
- [ ] 错误情况有清晰的提示

### 性能验收

- [ ] 1000 条消息的会话导出 < 3 秒
- [ ] 1000 条消息的会话导入 < 5 秒
- [ ] 100MB 文件能够正常处理
- [ ] 批量导出 100 个会话 < 30 秒

### 体验验收

- [ ] 快捷导出一键完成
- [ ] 高级导出选项清晰
- [ ] 批量导出选择直观
- [ ] 导入流程清晰直观
- [ ] 加载状态有明确反馈
- [ ] 错误提示可操作

---

## 里程碑

| 阶段 | 目标 | 预估时间 |
|-----|------|---------|
| 阶段 1 | 后端核心功能（含批量/增量/多格式） | 6 小时 |
| 阶段 2 | 后端测试 | 3 小时 |
| 阶段 3 | 前端 API 集成 | 2 小时 |
| 阶段 4 | 前端 UI 组件（含批量导出 UI） | 5 小时 |
| 阶段 5 | 测试与优化 | 2 小时 |
| **总计** | | **18 小时** |

---

## 待办事项 (TODO)

以下功能在本次实现中预留接口但暂不实现：

### 外部资源缓存

- [ ] `resource_refs` 字段已定义，`cached` 默认为 `false`
- [ ] `cache_path` 预留但为空
- [ ] 未来可实现：导出时下载外部资源，导入时恢复

### 其他格式适配器

- [ ] 预留 `ChatGPTAdapter` 接口
- [ ] 预留 `ClaudeAdapter` 接口
- [ ] 未来可实现：从其他聊天应用导入历史记录
