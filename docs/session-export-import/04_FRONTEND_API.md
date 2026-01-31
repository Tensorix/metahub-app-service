# 步骤 4：前端 API 集成

## API 封装

### 文件：`frontend/src/lib/api.ts` (扩展)

在现有 `sessionApi` 对象中添加导入导出方法：

```typescript
// ============ Session Transfer Types ============

export interface ResourceRef {
  type: string;
  url: string;
  cached: boolean;
  cache_path?: string;
}

export interface ExportStatistics {
  total_messages: number;
  total_topics: number;
  total_senders: number;
  date_range: {
    earliest?: string;
    latest?: string;
  };
  filter_applied?: {
    start_date?: string;
    end_date?: string;
  };
}

export interface ImportStatistics {
  imported_messages: number;
  imported_topics: number;
  imported_senders: number;
  merged_senders: number;
  skipped_messages: number;
}

export interface ImportedSessionInfo {
  session_id: string;
  original_id: string;
  name?: string;
  type: string;
  statistics: ImportStatistics;
}

export interface SessionImportResponse {
  success: boolean;
  imported_sessions: ImportedSessionInfo[];
  total_statistics: ImportStatistics;
}

export interface DuplicateCheck {
  has_duplicates: boolean;
  duplicate_export_ids: string[];
  affected_sessions: string[];
}

export interface SessionPreview {
  original_id: string;
  name?: string;
  type: string;
  message_count: number;
  topic_count: number;
}

export interface ImportPreviewResponse {
  valid: boolean;
  format: string;
  version: string;
  export_id?: string;
  sessions: SessionPreview[];
  total_statistics?: ExportStatistics;
  duplicate_check?: DuplicateCheck;
  warnings: string[];
  errors: string[];
}

export interface ExportOptions {
  format?: 'json' | 'jsonl';
  includeDeleted?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface BatchExportOptions extends ExportOptions {
  sessionIds?: string[];
  typeFilter?: string[];
  groupByType?: boolean;
}

export interface ImportOptions {
  format?: string;
  mergeSenders?: boolean;
}
```

### sessionApi 扩展

```typescript
export const sessionApi = {
  // ... 现有方法 ...

  // ============ 单会话导出 ============
  
  /**
   * 导出单个会话数据
   * @param sessionId 会话 ID
   * @param options 导出选项
   * @returns Blob 数据和文件名
   */
  async exportSession(
    sessionId: string,
    options: ExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    if (options.format) params.append('format', options.format);
    if (options.includeDeleted) params.append('include_deleted', 'true');
    if (options.startDate) params.append('start_date', options.startDate);
    if (options.endDate) params.append('end_date', options.endDate);
    
    const response = await api.get(
      `/api/v1/sessions/${sessionId}/export?${params.toString()}`,
      { responseType: 'blob' }
    );
    
    // 从 Content-Disposition 获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'session_export.json';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    
    return { blob: response.data, filename };
  },

  // ============ 批量导出 ============
  
  /**
   * 批量导出会话数据
   * @param options 批量导出选项
   * @returns Blob 数据和文件名
   */
  async exportSessionsBatch(
    options: BatchExportOptions = {}
  ): Promise<{ blob: Blob; filename: string }> {
    const response = await api.post(
      '/api/v1/sessions/export/batch',
      {
        session_ids: options.sessionIds,
        type_filter: options.typeFilter,
        format: options.format || 'jsonl',
        include_deleted: options.includeDeleted || false,
        start_date: options.startDate,
        end_date: options.endDate,
        group_by_type: options.groupByType ?? true,
      },
      { responseType: 'blob' }
    );
    
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'sessions_export.zip';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }
    
    return { blob: response.data, filename };
  },

  // ============ 导入 ============
  
  /**
   * 导入会话数据
   * @param file 导出文件
   * @param options 导入选项
   */
  async importSessions(
    file: File,
    options: ImportOptions = {}
  ): Promise<SessionImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const params = new URLSearchParams();
    if (options.format) params.append('format', options.format);
    if (options.mergeSenders !== undefined) {
      params.append('merge_senders', String(options.mergeSenders));
    }
    
    const response = await api.post(
      `/api/v1/sessions/import?${params.toString()}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    
    return response.data;
  },

  /**
   * 预览导入文件
   * @param file 导出文件
   */
  async previewImport(file: File): Promise<ImportPreviewResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/api/v1/sessions/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    return response.data;
  },
};
```

---

## 工具函数

### 文件：`frontend/src/lib/utils.ts` (扩展)

```typescript
/**
 * 触发文件下载
 * @param blob 文件数据
 * @param filename 文件名
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 验证导入文件
 * @param file 文件对象
 */
export function validateImportFile(file: File): { valid: boolean; error?: string } {
  // 检查文件类型
  const validExtensions = ['.json', '.jsonl', '.zip'];
  const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!hasValidExt) {
    return { valid: false, error: '仅支持 JSON、JSONL 或 ZIP 文件' };
  }
  
  // 检查文件大小 (100MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: '文件大小不能超过 100MB' };
  }
  
  return { valid: true };
}

/**
 * 获取会话类型显示名称
 */
export function getSessionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ai: 'AI 对话',
    pm: '私聊',
    group: '群聊',
  };
  return labels[type] || type;
}

/**
 * 格式化日期为输入框格式
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}
```

---

## 自定义 Hook

### 文件：`frontend/src/hooks/useSessionTransfer.ts`

```typescript
import { useState, useCallback } from 'react';
import {
  sessionApi,
  SessionImportResponse,
  ImportPreviewResponse,
  ExportOptions,
  BatchExportOptions,
  ImportOptions,
} from '@/lib/api';
import { downloadBlob, validateImportFile } from '@/lib/utils';

interface UseSessionTransferReturn {
  // 单会话导出
  exporting: boolean;
  exportSession: (sessionId: string, options?: ExportOptions) => Promise<void>;
  exportError: string | null;
  
  // 批量导出
  batchExporting: boolean;
  exportBatch: (options: BatchExportOptions) => Promise<void>;
  batchExportError: string | null;
  
  // 导入
  importing: boolean;
  importSessions: (file: File, options?: ImportOptions) => Promise<SessionImportResponse | null>;
  importError: string | null;
  importResult: SessionImportResponse | null;
  
  // 预览
  previewing: boolean;
  previewImport: (file: File) => Promise<ImportPreviewResponse | null>;
  previewResult: ImportPreviewResponse | null;
  previewError: string | null;
  
  // 清理
  clearErrors: () => void;
  clearPreview: () => void;
  clearImportResult: () => void;
}

export function useSessionTransfer(): UseSessionTransferReturn {
  // 单会话导出状态
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  
  // 批量导出状态
  const [batchExporting, setBatchExporting] = useState(false);
  const [batchExportError, setBatchExportError] = useState<string | null>(null);
  
  // 导入状态
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<SessionImportResponse | null>(null);
  
  // 预览状态
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // 单会话导出
  const exportSession = useCallback(async (sessionId: string, options?: ExportOptions) => {
    setExporting(true);
    setExportError(null);
    
    try {
      const { blob, filename } = await sessionApi.exportSession(sessionId, options);
      downloadBlob(blob, filename);
    } catch (error: any) {
      const message = error.response?.data?.detail || '导出失败';
      setExportError(message);
      throw error;
    } finally {
      setExporting(false);
    }
  }, []);

  // 批量导出
  const exportBatch = useCallback(async (options: BatchExportOptions) => {
    setBatchExporting(true);
    setBatchExportError(null);
    
    try {
      const { blob, filename } = await sessionApi.exportSessionsBatch(options);
      downloadBlob(blob, filename);
    } catch (error: any) {
      const message = error.response?.data?.detail || '批量导出失败';
      setBatchExportError(message);
      throw error;
    } finally {
      setBatchExporting(false);
    }
  }, []);

  // 导入
  const importSessions = useCallback(async (file: File, options?: ImportOptions) => {
    // 验证文件
    const validation = validateImportFile(file);
    if (!validation.valid) {
      setImportError(validation.error || '文件验证失败');
      return null;
    }
    
    setImporting(true);
    setImportError(null);
    
    try {
      const result = await sessionApi.importSessions(file, options);
      setImportResult(result);
      return result;
    } catch (error: any) {
      const message = error.response?.data?.detail || '导入失败';
      setImportError(message);
      throw error;
    } finally {
      setImporting(false);
    }
  }, []);

  // 预览
  const previewImport = useCallback(async (file: File) => {
    const validation = validateImportFile(file);
    if (!validation.valid) {
      setPreviewError(validation.error || '文件验证失败');
      return null;
    }
    
    setPreviewing(true);
    setPreviewError(null);
    
    try {
      const result = await sessionApi.previewImport(file);
      setPreviewResult(result);
      return result;
    } catch (error: any) {
      const message = error.response?.data?.detail || '预览失败';
      setPreviewError(message);
      throw error;
    } finally {
      setPreviewing(false);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setExportError(null);
    setBatchExportError(null);
    setImportError(null);
    setPreviewError(null);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewResult(null);
    setPreviewError(null);
  }, []);

  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  return {
    exporting,
    exportSession,
    exportError,
    batchExporting,
    exportBatch,
    batchExportError,
    importing,
    importSessions,
    importError,
    importResult,
    previewing,
    previewImport,
    previewResult,
    previewError,
    clearErrors,
    clearPreview,
    clearImportResult,
  };
}
```

---

## 使用示例

### 单会话导出

```tsx
import { useSessionTransfer } from '@/hooks/useSessionTransfer';

function SessionActions({ sessionId }: { sessionId: string }) {
  const { exporting, exportSession, exportError } = useSessionTransfer();
  
  const handleExport = async () => {
    try {
      await exportSession(sessionId, {
        format: 'json',
        includeDeleted: false,
      });
      toast({ title: '导出成功' });
    } catch {
      // 错误已在 hook 中处理
    }
  };
  
  return (
    <Button onClick={handleExport} disabled={exporting}>
      {exporting ? '导出中...' : '导出会话'}
    </Button>
  );
}
```

### 批量导出（按类型）

```tsx
function BatchExportButton() {
  const { batchExporting, exportBatch } = useSessionTransfer();
  
  const handleBatchExport = async () => {
    await exportBatch({
      typeFilter: ['ai'],  // 只导出 AI 类型
      format: 'jsonl',
      groupByType: true,
    });
  };
  
  return (
    <Button onClick={handleBatchExport} disabled={batchExporting}>
      批量导出 AI 对话
    </Button>
  );
}
```

### 增量导出

```tsx
function IncrementalExport({ sessionId }: { sessionId: string }) {
  const { exportSession } = useSessionTransfer();
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const handleExport = async () => {
    await exportSession(sessionId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };
  
  return (
    <div>
      <Input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} />
      <Input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
      <Button onClick={handleExport}>增量导出</Button>
    </div>
  );
}
```

### 导入（带预览和重复检测）

```tsx
function ImportWithPreview({ onSuccess }: { onSuccess: (ids: string[]) => void }) {
  const {
    importing,
    importSessions,
    previewing,
    previewImport,
    previewResult,
  } = useSessionTransfer();
  const [file, setFile] = useState<File | null>(null);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      await previewImport(f);  // 自动预览
    }
  };
  
  const handleImport = async () => {
    if (!file) return;
    const result = await importSessions(file, { mergeSenders: true });
    if (result) {
      onSuccess(result.imported_sessions.map(s => s.session_id));
    }
  };
  
  return (
    <div>
      <Input type="file" accept=".json,.jsonl,.zip" onChange={handleFileChange} />
      
      {previewResult?.duplicate_check?.has_duplicates && (
        <Alert variant="warning">
          检测到重复导入，将创建新会话
        </Alert>
      )}
      
      {previewResult?.valid && (
        <div>
          <p>包含 {previewResult.sessions.length} 个会话</p>
          <p>共 {previewResult.total_statistics?.total_messages} 条消息</p>
        </div>
      )}
      
      <Button onClick={handleImport} disabled={importing || !previewResult?.valid}>
        {importing ? '导入中...' : '确认导入'}
      </Button>
    </div>
  );
}
```
