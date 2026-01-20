import { useState, useEffect } from 'react';
import type { Session, Topic } from '@/lib/api';
import { sessionApi } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { SessionList } from '../components/SessionList';
import { SessionDialog } from '../components/SessionDialog';
import { TopicDialog } from '../components/TopicDialog';
import { EmptyState } from '../components/EmptyState';
import { SessionListSkeleton } from '../components/SessionListSkeleton';
import { SessionFilters } from '../components/SessionFilters';
import { SessionDetail } from '../components/SessionDetail';
import { TopicDetail } from '../components/TopicDetail';
import { Plus, Search, MessageSquare } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

export function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topics, setTopics] = useState<Record<string, Topic[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const [selectedTopicId, setSelectedTopicId] = useState<string>();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<string>();
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');

  // Dialog states
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session>();
  const [editingTopic, setEditingTopic] = useState<Topic>();
  const [topicSessionId, setTopicSessionId] = useState<string>();

  // 加载会话列表
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await sessionApi.getSessions({ page: 1, size: 100 });
      setSessions(response.items);
    } catch (err) {
      setError('加载会话列表失败');
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  // 加载话题列表
  const loadTopics = async (sessionId: string) => {
    try {
      const topicList = await sessionApi.getTopics(sessionId);
      setTopics((prev) => ({ ...prev, [sessionId]: topicList }));
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // 当会话展开时加载话题
  useEffect(() => {
    expandedSessions.forEach((sessionId) => {
      if (!topics[sessionId]) {
        loadTopics(sessionId);
      }
    });
  }, [expandedSessions]);

  // 创建/更新会话
  const handleSessionSubmit = async (data: any) => {
    try {
      if (editingSession) {
        await sessionApi.updateSession(editingSession.id, data);
      } else {
        await sessionApi.createSession(data);
      }
      await loadSessions();
      setEditingSession(undefined);
    } catch (err) {
      console.error('Failed to save session:', err);
      setError('保存会话失败');
    }
  };

  // 删除会话
  const handleSessionDelete = async (sessionId: string) => {
    if (confirm('确定要删除这个会话吗？')) {
      try {
        await sessionApi.deleteSession(sessionId);
        await loadSessions();
      } catch (err) {
        console.error('Failed to delete session:', err);
        setError('删除会话失败');
      }
    }
  };

  // 创建/更新话题
  const handleTopicSubmit = async (data: any) => {
    try {
      if (editingTopic) {
        await sessionApi.updateTopic(editingTopic.id, data);
        await loadTopics(editingTopic.session_id);
        // 如果当前选中的会话就是编辑话题的会话，触发详情刷新
        if (selectedSessionId === editingTopic.session_id) {
          setSelectedSessionId(editingTopic.session_id);
        }
      } else if (topicSessionId) {
        await sessionApi.createTopic(topicSessionId, data);
        await loadTopics(topicSessionId);
        // 触发详情刷新
        if (selectedSessionId === topicSessionId) {
          setSelectedSessionId(topicSessionId);
        }
      }
      setEditingTopic(undefined);
      setTopicSessionId(undefined);
    } catch (err) {
      console.error('Failed to save topic:', err);
      setError('保存话题失败');
    }
  };

  // 删除话题
  const handleTopicDelete = async (topicId: string) => {
    if (confirm('确定要删除这个话题吗？')) {
      try {
        const topic = Object.values(topics)
          .flat()
          .find((t) => t.id === topicId);
        if (topic) {
          await sessionApi.deleteTopic(topicId);
          await loadTopics(topic.session_id);
          // 触发详情刷新
          if (selectedSessionId === topic.session_id) {
            setSelectedSessionId(topic.session_id);
          }
        }
      } catch (err) {
        console.error('Failed to delete topic:', err);
        setError('删除话题失败');
      }
    }
  };

  // 切换会话展开状态
  const handleToggleExpand = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  // 过滤和排序会话
  const filteredSessions = sessions
    .filter((session) => {
      // 搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          session.name?.toLowerCase().includes(query) ||
          session.type.toLowerCase().includes(query) ||
          session.source?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // 类型过滤
      if (selectedType && session.type !== selectedType) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'updated':
          return (
            new Date(b.last_visited_at || b.updated_at).getTime() -
            new Date(a.last_visited_at || a.updated_at).getTime()
          );
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">会话管理</h1>
          <p className="text-muted-foreground mt-2">管理您的所有会话和话题</p>
        </div>
        <Button onClick={() => setSessionDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建会话
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：会话列表 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle>会话列表</CardTitle>
                <CardDescription>共 {sessions.length} 个会话</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索会话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <SessionFilters
              selectedType={selectedType}
              onTypeChange={setSelectedType}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-20rem)] overflow-y-auto">
            {loading ? (
              <SessionListSkeleton count={5} />
            ) : filteredSessions.length === 0 ? (
              <EmptyState
                title={searchQuery ? '没有找到匹配的会话' : '暂无会话'}
                description={
                  searchQuery
                    ? '尝试使用其他关键词搜索'
                    : '创建您的第一个会话，开始对话吧'
                }
                action={
                  !searchQuery
                    ? {
                        label: '创建会话',
                        onClick: () => setSessionDialogOpen(true),
                      }
                    : undefined
                }
              />
            ) : (
              <SessionList
                sessions={filteredSessions}
                topics={topics}
                selectedSessionId={selectedSessionId}
                onSessionSelect={(sessionId) => {
                  setSelectedSessionId(sessionId);
                  setSelectedTopicId(undefined); // 切换会话时清除话题选择
                }}
                onSessionEdit={(session) => {
                  setEditingSession(session);
                  setSessionDialogOpen(true);
                }}
                onSessionDelete={handleSessionDelete}
                onTopicCreate={(sessionId) => {
                  setTopicSessionId(sessionId);
                  setTopicDialogOpen(true);
                }}
                onTopicEdit={(topic) => {
                  setEditingTopic(topic);
                  setTopicDialogOpen(true);
                }}
                onTopicDelete={handleTopicDelete}
                expandedSessions={expandedSessions}
                onToggleExpand={handleToggleExpand}
              />
            )}
          </CardContent>
        </Card>

        {/* 右侧：会话/话题详情 */}
        <div>
          {selectedTopicId && selectedSessionId ? (
            <TopicDetail
              key={selectedTopicId}
              topicId={selectedTopicId}
              sessionId={selectedSessionId}
              onEdit={(topic) => {
                setEditingTopic(topic);
                setTopicDialogOpen(true);
              }}
              onDelete={handleTopicDelete}
              onBack={() => setSelectedTopicId(undefined)}
            />
          ) : selectedSessionId ? (
            <SessionDetail
              key={selectedSessionId}
              sessionId={selectedSessionId}
              onEdit={() => {
                const session = sessions.find((s) => s.id === selectedSessionId);
                if (session) {
                  setEditingSession(session);
                  setSessionDialogOpen(true);
                }
              }}
              onDelete={() => handleSessionDelete(selectedSessionId)}
              onCreateTopic={() => {
                setTopicSessionId(selectedSessionId);
                setTopicDialogOpen(true);
              }}
              onTopicEdit={(topic) => {
                setEditingTopic(topic);
                setTopicDialogOpen(true);
              }}
              onTopicDelete={handleTopicDelete}
              onTopicSelect={(topicId) => setSelectedTopicId(topicId)}
            />
          ) : (
            <Card className="h-full">
              <CardContent className="flex items-center justify-center h-[calc(100vh-20rem)]">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">选择一个会话查看详情</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 会话对话框 */}
      <SessionDialog
        open={sessionDialogOpen}
        onOpenChange={(open) => {
          setSessionDialogOpen(open);
          if (!open) setEditingSession(undefined);
        }}
        session={editingSession}
        onSubmit={handleSessionSubmit}
      />

      {/* 话题对话框 */}
      <TopicDialog
        open={topicDialogOpen}
        onOpenChange={(open) => {
          setTopicDialogOpen(open);
          if (!open) {
            setEditingTopic(undefined);
            setTopicSessionId(undefined);
          }
        }}
        sessionId={topicSessionId}
        topic={editingTopic}
        onSubmit={handleTopicSubmit}
      />
    </div>
  );
}
