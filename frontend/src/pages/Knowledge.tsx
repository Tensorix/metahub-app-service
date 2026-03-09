import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BookOpen, ArrowLeft, Plus, Folder, FileText, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBreakpoints } from '@/hooks/useMediaQuery';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { knowledgeApi } from '@/lib/knowledgeApi';
import type { NodeTreeItem, KnowledgeNode, NodeType } from '@/lib/knowledgeApi';
import { KnowledgeTree, DocumentEditor, DatasetView, FolderDetail, KnowledgeSearchPanel } from '@/components/knowledge';
import { usePageTitle } from '@/contexts/PageTitleContext';

export default function Knowledge() {
  const { toast } = useToast();
  const { isMobile } = useBreakpoints();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { setTitle, setActions } = usePageTitle();

  const [tree, setTree] = useState<NodeTreeItem[]>([]);
  const [selectedId, setSelectedIdInternal] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NodeTreeItem | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  // 移动端视图：'tree' 树形列表 | 'content' 内容详情
  const [mobileView, setMobileView] = useState<'tree' | 'content'>('tree');

  // Setup page title and actions
  useEffect(() => {
    if (isMobile) {
      if (mobileView === 'tree') {
        setTitle('知识库');
        setActions([
          {
            key: 'create',
            label: '新建',
            icon: <Plus className="h-4 w-4" />,
            onClick: () => setShowCreateMenu(true),
            variant: 'outline',
          },
        ]);
      } else {
        // In content view, title is handled by individual components
        setTitle(selectedNode?.name || '知识库');
        setActions([]);
      }
    } else {
      setTitle(null);
      setActions([]);
    }

    return () => {
      setTitle(null);
      setActions([]);
    };
  }, [isMobile, mobileView, selectedNode, setTitle, setActions]);

  // URL 深度链接：?node=xxx
  const nodeFromUrl = searchParams.get('node');
  useEffect(() => {
    if (nodeFromUrl) {
      setSelectedIdInternal(nodeFromUrl);
      if (isMobile) {
        const node = findTreeNode(tree, nodeFromUrl);
        if (node && node.node_type !== 'folder') setMobileView('content');
      }
    }
  }, [nodeFromUrl, tree, isMobile]);

  const setSelectedId = useCallback(
    (id: string | null) => {
      setSelectedIdInternal(id);
      const path = id ? `/knowledge?node=${id}` : '/knowledge';
      navigate(path, { replace: true });
    },
    [navigate]
  );

  const loadTree = useCallback(async () => {
    try {
      const res = await knowledgeApi.getTree();
      setTree(res.items);
    } catch {
      toastRef.current({ title: '加载失败', variant: 'destructive' });
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const loadNodeDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const node = await knowledgeApi.getNode(id);
        setSelectedNode(node);
      } catch {
        toastRef.current({ title: '加载节点失败', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedId) {
      loadNodeDetail(selectedId);
    } else {
      setSelectedNode(null);
    }
  }, [selectedId, loadNodeDetail]);

  const handleSelect = (node: NodeTreeItem) => {
    setSelectedId(node.id);
    // 移动端：文件夹点击仅展开，不进内容区；文档/表格进入内容区
    if (isMobile && node.node_type !== 'folder') setMobileView('content');
  };

  const handleOpenFolderSettings = (node: NodeTreeItem) => {
    setSelectedId(node.id);
    if (isMobile) setMobileView('content');
  };

  const handleBackToTree = () => {
    setMobileView('tree');
  };

  const handleCreate = async (parentId: string | null, type: NodeType) => {
    const nameMap: Record<NodeType, string> = {
      folder: '新建文件夹',
      document: '新建文档',
      dataset: '新建表格',
    };
    try {
      const node = await knowledgeApi.createNode({
        name: nameMap[type],
        node_type: type,
        parent_id: parentId,
        schema_definition: type === 'dataset' ? { fields: [] } : undefined,
      });
      await loadTree();
      setSelectedId(node.id);
      if (isMobile) setMobileView('content');
      toast({ title: `${nameMap[type]}已创建` });
    } catch (err) {
      toast({
        title: '创建失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleRename = async (node: NodeTreeItem, newName: string) => {
    try {
      await knowledgeApi.updateNode(node.id, { name: newName });
      await loadTree();
      if (selectedId === node.id) {
        loadNodeDetail(node.id);
      }
    } catch {
      toast({ title: '重命名失败', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await knowledgeApi.deleteNode(deleteTarget.id);
      toast({ title: '已删除' });
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setSelectedNode(null);
        if (isMobile) setMobileView('tree');
      }
      await loadTree();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleVector = async (node: NodeTreeItem) => {
    try {
      await knowledgeApi.setVectorization(node.id, !node.vector_enabled);
      toast({
        title: node.vector_enabled ? '已关闭向量化' : '已开启向量化',
        description: node.vector_enabled ? undefined : '正在后台生成 Embedding...',
      });
      await loadTree();
      if (selectedId === node.id) loadNodeDetail(node.id);
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  const handleNodeUpdate = () => {
    loadTree();
    if (selectedId) loadNodeDetail(selectedId);
  };

  const renderContent = () => {
    if (!selectedNode) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
          <BookOpen className="w-12 h-12" />
          <p>选择一个节点开始编辑</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          加载中...
        </div>
      );
    }

    switch (selectedNode.node_type) {
      case 'folder':
        return (
          <FolderDetail
            node={selectedNode}
            onToggleVector={() => {
              const treeNode = findTreeNode(tree, selectedNode.id);
              if (treeNode) handleToggleVector(treeNode);
            }}
            onCreate={(type) => handleCreate(selectedNode.id, type)}
            onConfigUpdate={handleNodeUpdate}
          />
        );
      case 'document':
        return (
          <DocumentEditor
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            showBackButton={isMobile}
            onBack={isMobile ? handleBackToTree : undefined}
          />
        );
      case 'dataset':
        return (
          <DatasetView
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            showBackButton={isMobile}
            onBack={isMobile ? handleBackToTree : undefined}
          />
        );
      default:
        return null;
    }
  };

  // 移动端：树 / 内容切换显示
  if (isMobile) {
    return (
      <div className="relative flex h-full overflow-hidden">
        <KnowledgeSearchPanel
          folderIds={selectedId && findTreeNode(tree, selectedId)?.node_type === 'folder'
            ? [selectedId]
            : undefined}
          onSelectNode={(id) => {
            setSelectedId(id);
            setMobileView('content');
          }}
        />
        {mobileView === 'tree' ? (
          <div className="flex-1 min-w-0 border rounded-lg bg-card flex flex-col overflow-hidden">
            <KnowledgeTree
              items={tree}
              selectedId={selectedId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onRename={handleRename}
              onDelete={setDeleteTarget}
              onToggleVector={handleToggleVector}
              onOpenFolderSettings={isMobile ? handleOpenFolderSettings : undefined}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* 文档和表格的返回按钮已集成到各自组件工具栏，文件夹显示通用返回栏 */}
            {!['document', 'dataset'].includes(findTreeNode(tree, selectedId ?? '')?.node_type ?? '') && (
              <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2 bg-background">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleBackToTree}
                  className="shrink-0"
                  aria-label="返回"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm text-muted-foreground">返回列表</span>
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              {renderContent()}
            </div>
          </div>
        )}
        
        {/* 移动端创建菜单对话框 */}
        <AlertDialog open={showCreateMenu} onOpenChange={setShowCreateMenu}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>新建内容</AlertDialogTitle>
              <AlertDialogDescription>
                选择要创建的内容类型
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2 py-4">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  handleCreate(null, 'folder');
                  setShowCreateMenu(false);
                }}
              >
                <Folder className="w-4 h-4 mr-2" />
                新建文件夹
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  handleCreate(null, 'document');
                  setShowCreateMenu(false);
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                新建文档
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  handleCreate(null, 'dataset');
                  setShowCreateMenu(false);
                }}
              >
                <Table2 className="w-4 h-4 mr-2" />
                新建表格
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除「{deleteTarget?.name}」吗？
                {deleteTarget?.node_type === 'folder' && '文件夹下的所有内容也将被删除。'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground"
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // 桌面端：左右分栏
  return (
    <div className="relative flex h-full overflow-hidden">
      <KnowledgeSearchPanel
        folderIds={selectedId && findTreeNode(tree, selectedId)?.node_type === 'folder'
          ? [selectedId]
          : undefined}
        onSelectNode={setSelectedId}
      />
      <div className="w-64 shrink-0 border-r bg-card flex flex-col overflow-hidden">
        <KnowledgeTree
          items={tree}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={setDeleteTarget}
          onToggleVector={handleToggleVector}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        {renderContent()}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？
              {deleteTarget?.node_type === 'folder' && '文件夹下的所有内容也将被删除。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function findTreeNode(
  items: NodeTreeItem[],
  id: string
): NodeTreeItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findTreeNode(item.children, id);
      if (found) return found;
    }
  }
  return null;
}
