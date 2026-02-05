import { useState, useCallback } from 'react';
import {
  sessionTransferApi,
  type SessionImportResponse,
  type ImportPreviewResponse,
  type ExportOptions,
  type BatchExportOptions,
  type ImportOptions,
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
      const { blob, filename } = await sessionTransferApi.exportSession(sessionId, options);
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
      const { blob, filename } = await sessionTransferApi.exportSessionsBatch(options);
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
      const result = await sessionTransferApi.importSessions(file, options);
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
      const result = await sessionTransferApi.previewImport(file);
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
