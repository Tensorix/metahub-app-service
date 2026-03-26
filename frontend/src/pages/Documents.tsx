import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowLeft,
  FileText,
  FolderOpen,
  Search,
  Settings,
  Trash2,
  Pencil,
  Database,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { documentApi } from '@/lib/documentApi';
import type {
  DocumentCollection,
  Document,
  DocumentSearchHit,
} from '@/lib/documentApi';
import { CollectionDialog, DocumentDialog } from '@/components/documents';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { useBreakpoints } from '@/hooks/useMediaQuery';

const formatDate = (s: string) =>
  new Date(s).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function Documents() {
  const { collectionId } = useParams<{ collectionId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setTitle, setActions } = usePageTitle();
  const { isMobile } = useBreakpoints();

  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchHits, setSearchHits] = useState<DocumentSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<DocumentCollection | null>(null);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'collection' | 'document'; id: string; name: string } | null
  >(null);

  const currentCollection = collections.find((c) => c.id === collectionId);

  // Setup page title and actions
  useEffect(() => {
    if (isMobile) {
      if (collectionId) {
        setTitle(currentCollection?.name || '文档');
        setActions([
          {
            key: 'create',
            label: '新建',
            icon: <Plus className="h-4 w-4" />,
            onClick: handleCreateDocument,
          },
        ]);
      } else {
        setTitle('文档库');
        setActions([
          {
            key: 'create',
            label: '新建',
            icon: <Plus className="h-4 w-4" />,
            onClick: handleCreateCollection,
          },
        ]);
      }
    } else {
      setTitle(null);
      setActions([]);
    }

    return () => {
      setTitle(null);
      setActions([]);
    };
  }, [isMobile, collectionId, currentCollection, setTitle, setActions]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const res = await documentApi.listCollections();
      setCollections(res.items);
    } catch {
      toast({ title: '加载失败', description: '无法加载集合列表', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const res = await documentApi.listDocuments(collectionId, { page: 1, size: 100 });
      setDocuments(res.items);
    } catch {
      toast({ title: '加载失败', description: '无法加载文档列表', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (collectionId) {
      loadDocuments();
    } else {
      setDocuments([]);
    }
  }, [collectionId]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await documentApi.search({
        query: searchQuery,
        collection_ids: collectionId ? [collectionId] : undefined,
        top_k: 20,
        page: 1,
        size: 20,
      });
      setSearchHits(res.hits);
    } catch {
      toast({ title: '搜索失败', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleCreateCollection = () => {
    setEditingCollection(null);
    setCollectionDialogOpen(true);
  };

  const handleEditCollection = (c: DocumentCollection) => {
    setEditingCollection(c);
    setCollectionDialogOpen(true);
  };

  const handleCreateDocument = () => {
    setEditingDocument(null);
    setDocumentDialogOpen(true);
  };

  const handleEditDocument = (d: Document) => {
    setEditingDocument(d);
    setDocumentDialogOpen(true);
  };

  const handleVectorize = async (c: DocumentCollection) => {
    try {
      await documentApi.setVectorization(c.id, true);
      toast({ title: '已开启向量化', description: '正在后台生成 embedding' });
      loadCollections();
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'collection') {
        await documentApi.deleteCollection(deleteTarget.id);
        toast({ title: '删除成功' });
        if (collectionId === deleteTarget.id) navigate('/documents');
        loadCollections();
      } else {
        await documentApi.deleteDocument(deleteTarget.id);
        toast({ title: '删除成功' });
        loadDocuments();
      }
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const displayDocs = searchHits.length > 0
    ? searchHits.map((h) => h.document)
    : documents;

  const isSearchMode = searchHits.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 py-4 space-y-4">
        {!isMobile && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {collectionId && (
                <Button variant="ghost" size="icon" onClick={() => navigate('/documents')}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <h1 className="text-2xl font-bold">
                {collectionId ? currentCollection?.name || '文档' : '文档库'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {collectionId ? (
                <>
                  <Button onClick={handleCreateDocument}>
                    <Plus className="w-4 h-4 mr-2" />
                    新建文档
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleEditCollection(currentCollection!)}
                    disabled={!currentCollection}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    设置
                  </Button>
                </>
              ) : (
                <Button onClick={handleCreateCollection}>
                  <Plus className="w-4 h-4 mr-2" />
                  新建集合
                </Button>
              )}
            </div>
          </div>
        )}

        {collectionId && (
          <div className="flex gap-2">
            <Input
              placeholder="语义搜索（需开启向量化）"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value) setSearchHits([]);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-md"
            />
            <Button
              variant="outline"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searching}
            >
              <Search className="w-4 h-4 mr-2" />
              {searching ? '搜索中...' : '搜索'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading && !collections.length ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            加载中...
          </div>
        ) : !collectionId ? (
          <ScrollArea className="h-full">
            <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
              {collections.length === 0 ? (
                <Card className="p-12 text-center col-span-full">
                  <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">暂无文档集合</p>
                  <Button onClick={handleCreateCollection}>创建第一个集合</Button>
                </Card>
              ) : (
                collections.map((c) => (
                  <Card
                    key={c.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/documents/${c.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{c.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {c.description || '无描述'}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">
                            {c.type === 'structured' ? (
                              <>
                                <Database className="w-3 h-3 mr-1" />
                                结构化
                              </>
                            ) : (
                              <>
                                <FileText className="w-3 h-3 mr-1" />
                                非结构化
                              </>
                            )}
                          </Badge>
                          {c.vector_enabled && (
                            <Badge variant="secondary">
                              <Sparkles className="w-3 h-3 mr-1" />
                              向量检索
                            </Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-hover"
                        >
                          <Settings className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCollection(c);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            编辑
                          </DropdownMenuItem>
                          {!c.vector_enabled && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVectorize(c);
                              }}
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              开启向量化
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ type: 'collection', id: c.id, name: c.name });
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {documents.length === 0 && !loading ? (
                <Card className="p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">暂无文档</p>
                  <Button onClick={handleCreateDocument}>创建第一篇文档</Button>
                </Card>
              ) : (
                displayDocs.map((doc) => {
                  const hit = searchHits.find((h) => h.document.id === doc.id);
                  return (
                    <Card
                      key={doc.id}
                      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleEditDocument(doc)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{doc.title}</h3>
                            {hit?.score != null && (
                              <Badge variant="secondary" className="shrink-0">
                                相关度 {(hit.score * 100).toFixed(0)}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {doc.content
                              ? doc.content.slice(0, 150)
                              : doc.data
                              ? JSON.stringify(doc.data).slice(0, 150)
                              : '—'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDate(doc.updated_at)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-hover"
                          >
                            <Settings className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditDocument(doc)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: 'document',
                                  id: doc.id,
                                  name: doc.title,
                                });
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <CollectionDialog
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
        collection={editingCollection}
        onSuccess={loadCollections}
      />

      {currentCollection && (
        <DocumentDialog
          open={documentDialogOpen}
          onOpenChange={setDocumentDialogOpen}
          collection={currentCollection}
          document={editingDocument}
          onSuccess={() => {
            loadDocuments();
            if (isSearchMode) handleSearch();
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
