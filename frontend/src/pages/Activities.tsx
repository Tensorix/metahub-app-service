import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { activityApi } from '@/lib/activityApi';
import type { Activity, ActivityListQuery } from '@/lib/activityApi';
import ActivityDialog from '@/components/ActivityDialog';
import { ActivityStatsBar } from '@/components/activity/ActivityStatsBar';
import { ActivityBoardView } from '@/components/activity/ActivityBoardView';
import { ActivityListView } from '@/components/activity/ActivityListView';
import { ActivityEmptyState } from '@/components/activity/ActivityEmptyState';

// ──────────────────────────────────────────── component

const Activities = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<Activity['status'] | undefined>();
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [isMobile, setIsMobile] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Activity['status'] | null>(null);
  const [filters, setFilters] = useState<ActivityListQuery>({
    page: 1,
    size: 100,
  });

  // ──────── Responsive
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ──────── Data loading
  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const response = await activityApi.getActivities({ ...filters, page: 1, size: 100 });
      setActivities(response.items || []);
    } catch (error) {
      console.error('加载活动失败:', error);
      setActivities([]);
      toast({ title: '加载失败', description: '无法加载活动列表', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // ──────── Handlers
  const handleCreate = useCallback((status?: Activity['status']) => {
    setEditingActivity(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const handleOpen = useCallback((activity: Activity) => {
    setEditingActivity(activity);
    setDefaultStatus(undefined);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确定要删除这个活动吗？')) return;
    try {
      await activityApi.deleteActivity(id);
      setActivities((prev) => prev.filter((a) => a.id !== id));
      toast({ title: '已删除', description: '活动已被移除' });
    } catch {
      toast({ title: '删除失败', description: '无法删除活动', variant: 'destructive' });
    }
  }, [toast]);

  const handleStatusChange = useCallback(async (activity: Activity, newStatus: Activity['status']) => {
    // Optimistic update
    setActivities((prev) =>
      prev.map((a) => (a.id === activity.id ? { ...a, status: newStatus } : a))
    );
    try {
      await activityApi.updateActivity(activity.id, { status: newStatus });
    } catch {
      toast({ title: '更新失败', description: '无法更新活动状态', variant: 'destructive' });
      loadActivities();
    }
  }, [toast, loadActivities]);

  // ──────── Filtered data
  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (a.is_deleted) return false;
      if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return true;
    });
  }, [activities, searchQuery, statusFilter]);

  // Active filter count
  const activeFilterCount = [filters.type, filters.priority_min, statusFilter].filter(Boolean).length;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* ──────── Header */}
        <div className="flex-shrink-0 px-6 pt-6 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">活动管理</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? '加载中...' : `共 ${filteredActivities.length} 项活动`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              {!isMobile && (
                <div className="flex items-center border rounded-lg p-0.5 bg-muted/50">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={viewMode === 'board' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setViewMode('board')}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>看板视图</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setViewMode('list')}
                      >
                        <List className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>列表视图</TooltipContent>
                  </Tooltip>
                </div>
              )}

              <Button onClick={() => handleCreate()} className="gap-2 rounded-lg">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">新建活动</span>
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <ActivityStatsBar
            activities={activities}
            onFilterStatus={setStatusFilter}
            activeFilter={statusFilter}
          />
        </div>

        {/* ──────── Filter bar */}
        <div className="flex-shrink-0 px-6 py-3">
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="搜索活动..."
                className="pl-9 h-9 rounded-lg bg-muted/40 border-0 focus-visible:bg-background focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {!isMobile && <span>筛选</span>}
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>展开筛选项</TooltipContent>
            </Tooltip>
          </div>

          {/* Expandable filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-2 pt-3">
                  <Select
                    value={filters.type || 'all'}
                    onValueChange={(v) => setFilters({ ...filters, type: v === 'all' ? undefined : v })}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs rounded-lg">
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      <SelectItem value="task">任务</SelectItem>
                      <SelectItem value="meeting">会议</SelectItem>
                      <SelectItem value="reminder">提醒</SelectItem>
                      <SelectItem value="event">事件</SelectItem>
                      <SelectItem value="ping">Ping</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.priority_min?.toString() || 'all'}
                    onValueChange={(v) =>
                      setFilters({ ...filters, priority_min: v === 'all' ? undefined : parseInt(v) })
                    }
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs rounded-lg">
                      <SelectValue placeholder="全部优先级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部优先级</SelectItem>
                      <SelectItem value="8">紧急 (P8+)</SelectItem>
                      <SelectItem value="5">高优先级 (P5+)</SelectItem>
                      <SelectItem value="3">中优先级 (P3+)</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Clear all filters */}
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        setFilters({ page: 1, size: 100 });
                        setStatusFilter(null);
                        setSearchQuery('');
                      }}
                    >
                      <X className="w-3 h-3 mr-1" />
                      清除筛选
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ──────── Content */}
        <div className="flex-1 px-6 pb-6 overflow-hidden">
          {loading ? (
            <LoadingSkeleton viewMode={isMobile ? 'list' : viewMode} />
          ) : activities.length === 0 ? (
            <ActivityEmptyState onCreate={() => handleCreate()} />
          ) : filteredActivities.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full"
            >
              <Search className="w-10 h-10 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm">没有匹配的活动</p>
              <Button
                variant="link"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter(null);
                  setFilters({ page: 1, size: 100 });
                }}
              >
                清除所有筛选
              </Button>
            </motion.div>
          ) : isMobile || viewMode === 'list' ? (
            <ActivityListView
              activities={filteredActivities}
              onOpen={handleOpen}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ) : (
            <ActivityBoardView
              activities={filteredActivities}
              onOpen={handleOpen}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
              onCreateInColumn={(status) => handleCreate(status)}
            />
          )}
        </div>

        {/* ──────── Dialog */}
        <ActivityDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          activity={editingActivity}
          defaultStatus={defaultStatus}
          onSuccess={loadActivities}
        />
      </div>
    </TooltipProvider>
  );
};

// ──────── Loading skeleton

function LoadingSkeleton({ viewMode }: { viewMode: 'board' | 'list' }) {
  if (viewMode === 'board') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

export default Activities;
