/**
 * useTools hook - Manage tool fetching with caching.
 */

import { useState, useEffect, useCallback } from 'react';
import { listTools, listToolsByCategory, type ToolInfo, type ToolCategoryInfo } from '@/lib/toolsApi';

interface UseToolsResult {
  tools: ToolInfo[];
  categories: ToolCategoryInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// 简单的内存缓存
let toolsCache: ToolInfo[] | null = null;
let categoriesCache: ToolCategoryInfo[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export function useTools(): UseToolsResult {
  const [tools, setTools] = useState<ToolInfo[]>(toolsCache || []);
  const [categories, setCategories] = useState<ToolCategoryInfo[]>(categoriesCache || []);
  const [loading, setLoading] = useState(!toolsCache);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    // 检查缓存是否有效
    if (toolsCache && Date.now() - cacheTime < CACHE_TTL) {
      setTools(toolsCache);
      setCategories(categoriesCache || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [toolsRes, categoriesRes] = await Promise.all([
        listTools(),
        listToolsByCategory(),
      ]);

      toolsCache = toolsRes.tools;
      categoriesCache = categoriesRes.categories;
      cacheTime = Date.now();

      setTools(toolsRes.tools);
      setCategories(categoriesRes.categories);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tools';
      setError(message);
      console.error('Failed to fetch tools:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  return {
    tools,
    categories,
    loading,
    error,
    refetch: fetchTools,
  };
}

/**
 * 获取工具名称到描述的映射
 */
export function useToolDescriptions(): Record<string, string> {
  const { tools } = useTools();
  const map: Record<string, string> = {};
  for (const tool of tools) {
    map[tool.name] = tool.description;
  }
  return map;
}
