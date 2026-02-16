import { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen } from 'lucide-react';
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
import { KnowledgeTree, DocumentEditor, DatasetView, FolderDetail } from '@/components/knowledge';

export default function Knowledge() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [tree, setTree] = useState<NodeTreeItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NodeTreeItem | null>(null);

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
  };

  const handleCreate = async (parentId: string | null, type: NodeType) => {
    const nameMap: Record<NodeType, string> = {
      folder: '新建文件夹',
      document: '新建文档',
      dataset: '新建数据集',
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
          />
        );
      case 'document':
        return <DocumentEditor node={selectedNode} onUpdate={handleNodeUpdate} />;
      case 'dataset':
        return <DatasetView node={selectedNode} onUpdate={handleNodeUpdate} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Tree */}
      <div className="w-64 shrink-0 border-r bg-card flex flex-col">
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

      {/* Right: Content */}
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
