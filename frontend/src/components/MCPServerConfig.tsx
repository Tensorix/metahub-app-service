/**
 * MCP Server 配置组件
 *
 * 作为 AgentDialog 的一个标签页，管理 Agent 关联的 MCP Server 列表。
 */

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, Plus, Trash2, TestTube, CheckCircle2, XCircle } from 'lucide-react';
import type { McpServerResponse, McpServerCreateRequest, McpServerTestResult } from '../types/mcpServer';
import { createMcpServer, updateMcpServer, deleteMcpServer, testMcpServer } from '../lib/mcpServerApi';
import { useToast } from '../hooks/use-toast';

interface MCPServerConfigProps {
  agentId?: string;
  servers: McpServerResponse[];
  onChange: (servers: McpServerResponse[]) => void;
}

export function MCPServerConfig({ agentId, servers, onChange }: MCPServerConfigProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, McpServerTestResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const [formData, setFormData] = useState<McpServerCreateRequest>({
    name: '',
    description: '',
    transport: 'http',
    url: '',
    headers: {},
    is_enabled: true,
    sort_order: 0,
  });

  const handleAdd = async () => {
    if (!agentId) {
      toast({
        title: '错误',
        description: '请先保存 Agent',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading({ ...loading, add: true });
      const newServer = await createMcpServer(agentId, formData);
      onChange([...servers, newServer]);
      setIsAdding(false);
      setFormData({
        name: '',
        description: '',
        transport: 'http',
        url: '',
        headers: {},
        is_enabled: true,
        sort_order: 0,
      });
      toast({
        title: '成功',
        description: 'MCP Server 已添加',
      });
    } catch (error: any) {
      toast({
        title: '添加失败',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading({ ...loading, add: false });
    }
  };

  const handleTest = async (serverId: string, url: string, transport?: 'http' | 'sse' | 'stdio', headers?: Record<string, string>) => {
    if (!agentId) return;

    try {
      setLoading({ ...loading, [serverId]: true });
      const result = await testMcpServer(agentId, { server_id: serverId, url, transport, headers });
      setTestResults({ ...testResults, [serverId]: result });
      toast({
        title: result.success ? '连接成功' : '连接失败',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error: any) {
      toast({
        title: '测试失败',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading({ ...loading, [serverId]: false });
    }
  };

  const handleDelete = async (serverId: string) => {
    if (!agentId) return;

    if (!confirm('确定要删除此 MCP Server 吗？')) return;

    try {
      await deleteMcpServer(agentId, serverId);
      onChange(servers.filter((s) => s.id !== serverId));
      toast({
        title: '成功',
        description: 'MCP Server 已删除',
      });
    } catch (error: any) {
      toast({
        title: '删除失败',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    if (!agentId) return;

    try {
      const updated = await updateMcpServer(agentId, serverId, { is_enabled: enabled });
      onChange(servers.map((s) => (s.id === serverId ? updated : s)));
    } catch (error: any) {
      toast({
        title: '更新失败',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">MCP Servers</h3>
          <p className="text-sm text-muted-foreground">
            配置外部 MCP Server 以扩展 Agent 的工具能力
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="mr-2 h-4 w-4" />
          添加 MCP Server
        </Button>
      </div>

      {/* 添加表单 */}
      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>添加 MCP Server</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: database-tools"
              />
            </div>
            
            <div>
              <Label htmlFor="transport">传输协议</Label>
              <Select
                value={formData.transport}
                onValueChange={(value: 'http' | 'sse' | 'stdio') =>
                  setFormData({ ...formData, transport: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择传输协议" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">
                    <div className="flex items-center gap-2">
                      <span>HTTP</span>
                      <Badge variant="outline" className="text-xs">推荐</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="sse">
                    <div className="flex items-center gap-2">
                      <span>SSE</span>
                      <Badge variant="secondary" className="text-xs">已弃用</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="stdio">
                    <div className="flex items-center gap-2">
                      <span>stdio</span>
                      <Badge variant="outline" className="text-xs">本地</Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {formData.transport === 'http' && '✅ HTTP 传输 - 生产环境推荐，支持远程部署'}
                {formData.transport === 'sse' && '⚠️ SSE 传输 - 已被 MCP 规范弃用，仅用于兼容旧版'}
                {formData.transport === 'stdio' && '📍 stdio 传输 - 本地进程通信，适合本地工具'}
              </p>
            </div>
            
            <div>
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://localhost:8000/mcp"
              />
            </div>
            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="MCP Server 的功能描述"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!formData.name || !formData.url || loading.add}>
                {loading.add && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server 列表 */}
      <div className="space-y-3">
        {servers.map((server) => {
          const testResult = testResults[server.id];
          return (
            <Card key={server.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{server.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {server.transport || 'http'}
                    </Badge>
                    <Switch
                      checked={server.is_enabled}
                      onCheckedChange={(checked) => handleToggleEnabled(server.id, checked)}
                    />
                    {testResult && (
                      <Badge variant={testResult.success ? 'default' : 'destructive'}>
                        {testResult.success ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : (
                          <XCircle className="mr-1 h-3 w-3" />
                        )}
                        {testResult.success ? '已连接' : '连接失败'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTest(server.id, server.url, server.transport, server.headers || undefined)}
                      disabled={loading[server.id]}
                    >
                      {loading[server.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(server.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{server.url}</CardDescription>
              </CardHeader>
              {(server.description || testResult?.tools) && (
                <CardContent className="space-y-2">
                  {server.description && <p className="text-sm">{server.description}</p>}
                  {testResult?.tools && testResult.tools.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-1">可用工具:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {testResult.tools.map((tool) => (
                          <li key={tool.name}>
                            • {tool.name} - {tool.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {server.last_error && (
                    <Alert variant="destructive">
                      <AlertDescription>{server.last_error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {servers.length === 0 && !isAdding && (
        <div className="text-center py-8 text-muted-foreground">
          <p>暂无 MCP Server 配置</p>
          <p className="text-sm">点击上方按钮添加第一个 MCP Server</p>
        </div>
      )}
    </div>
  );
}
