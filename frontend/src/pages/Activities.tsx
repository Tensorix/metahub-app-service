import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, Tag, AlertCircle, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { activityApi } from '@/lib/activityApi';
import type { Activity, ActivityListQuery } from '@/lib/activityApi';
import ActivityDialog from '@/components/ActivityDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 格式化日期时间
const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 看板列配置
const BOARD_COLUMNS = [
  { status: 'pending' as const, title: '待处理', color: 'bg-yellow-100 dark:bg-yellow-900/20' },
  { status: 'active' as const, title: '进行中', color: 'bg-blue-100 dark:bg-blue-900/20' },
  { status: 'done' as const, title: '已完成', color: 'bg-green-100 dark:bg-green-900/20' },
  { status: 'dismissed' as const, title: '已忽略', color: 'bg-gray-100 dark:bg-gray-900/20' },
];

// 可拖拽的活动卡片组件
interface ActivityCardProps {
  activity: Activity;
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
  getPriorityColor: (priority: number) => string;
}

const ActivityCard = ({ activity, onEdit, onDelete, getPriorityColor }: ActivityCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 hover:shadow-md transition-all cursor-move group"
    >
      {/* 优先级指示器 */}
      <div className="flex items-start gap-2">
        <div
          className={`w-1 h-full rounded-full ${
            activity.priority >= 8
              ? 'bg-red-500'
              : activity.priority >= 5
              ? 'bg-orange-500'
              : activity.priority >= 3
              ? 'bg-yellow-500'
              : 'bg-gray-400'
          }`}
        />
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h4 className="font-medium text-sm mb-1 line-clamp-2">
            {activity.name}
          </h4>

          {/* 备注 */}
          {activity.comments && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
              {activity.comments}
            </p>
          )}

          {/* 标签 */}
          {activity.tags && activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {activity.tags.slice(0, 3).map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                  {tag}
                </Badge>
              ))}
              {activity.tags.length > 3 && (
                <Badge variant="outline" className="text-xs px-1 py-0">
                  +{activity.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* 元信息 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              <span>{activity.type}</span>
            </div>
            <span className={getPriorityColor(activity.priority)}>
              P{activity.priority}
            </span>
          </div>

          {/* 截止日期 */}
          {activity.due_date && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span>{formatDateTime(activity.due_date)}</span>
            </div>
          )}

          {/* 操作按钮（悬停显示） */}
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(activity);
              }}
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(activity.id);
              }}
            >
              删除
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

// 可放置的列组件
interface DroppableColumnProps {
  column: typeof BOARD_COLUMNS[0];
  activities: Activity[];
  onEdit: (activity: Activity) => void;
  onDelete: (id: string) => void;
  getPriorityColor: (priority: number) => string;
}

const DroppableColumn = ({ column, activities, onEdit, onDelete, getPriorityColor }: DroppableColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 列头 */}
      <div className={`${column.color} rounded-t-lg p-3 border-b flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{column.title}</h3>
          <Badge variant="secondary">
            {activities.length}
          </Badge>
        </div>
      </div>

      {/* 卡片列表（可放置区域） */}
      <div
        ref={setNodeRef}
        className={`flex-1 border-x border-b rounded-b-lg transition-colors overflow-hidden ${
          isOver ? 'bg-primary/10' : 'bg-muted/20'
        }`}
      >
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            <SortableContext
              items={activities.map(a => a.id)}
              strategy={verticalListSortingStrategy}
              id={column.status}
            >
              {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  getPriorityColor={getPriorityColor}
                />
              ))}
            </SortableContext>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

const Activities = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(100); // 增加每页数量以支持看板视图
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const { toast } = useToast();

  // 检测屏幕尺寸
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 筛选条件
  const [filters, setFilters] = useState<ActivityListQuery>({
    page: 1,
    size: 100,
  });

  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动 8px 后才开始拖拽
      },
    })
  );

  const loadActivities = async () => {
    setLoading(true);
    try {
      const response = await activityApi.getActivities({ ...filters, page, size });
      setActivities(response.items || []);
    } catch (error) {
      console.error('加载活动失败:', error);
      setActivities([]);
      toast({
        title: '加载失败',
        description: '无法加载活动列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, [page, filters]);

  const handleCreate = () => {
    setEditingActivity(null);
    setDialogOpen(true);
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个活动吗？')) return;
    
    try {
      await activityApi.deleteActivity(id);
      toast({
        title: '删除成功',
        description: '活动已被删除',
      });
      loadActivities();
    } catch (error) {
      toast({
        title: '删除失败',
        description: '无法删除活动',
        variant: 'destructive',
      });
    }
  };

  const handleStatusChange = async (activity: Activity, newStatus: Activity['status']) => {
    try {
      await activityApi.updateActivity(activity.id, { status: newStatus });
      // 乐观更新
      setActivities(prev =>
        prev.map(a => (a.id === activity.id ? { ...a, status: newStatus } : a))
      );
    } catch (error) {
      toast({
        title: '更新失败',
        description: '无法更新活动状态',
        variant: 'destructive',
      });
      // 失败时重新加载
      loadActivities();
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'text-red-600 font-bold';
    if (priority >= 5) return 'text-orange-600 font-semibold';
    if (priority >= 3) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getStatusText = (status: Activity['status']) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'active': return '进行中';
      case 'done': return '已完成';
      case 'dismissed': return '已忽略';
      default: return status;
    }
  };

  const getStatusBadgeColor = (status: Activity['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'active': return 'bg-blue-500 hover:bg-blue-600';
      case 'done': return 'bg-green-500 hover:bg-green-600';
      case 'dismissed': return 'bg-gray-500 hover:bg-gray-600';
      default: return 'bg-gray-500';
    }
  };

  // 按状态分组活动
  const groupedActivities = BOARD_COLUMNS.reduce((acc, column) => {
    acc[column.status] = activities.filter(a => a.status === column.status && !a.is_deleted);
    return acc;
  }, {} as Record<Activity['status'], Activity[]>);

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // 拖拽悬停
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) return;

    // 检查是否悬停在列上
    const targetColumn = BOARD_COLUMNS.find(col => col.status === over.id);
    if (targetColumn) {
      // 可以在这里添加视觉反馈
    }
  };

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activity = activities.find(a => a.id === activeId);
    if (!activity) return;

    // 检查是否拖到列上
    const targetColumn = BOARD_COLUMNS.find(col => col.status === overId);
    if (targetColumn && activity.status !== targetColumn.status) {
      handleStatusChange(activity, targetColumn.status);
      return;
    }

    // 检查是否拖到另一个卡片上
    const targetActivity = activities.find(a => a.id === overId);
    if (targetActivity && activity.status !== targetActivity.status) {
      handleStatusChange(activity, targetActivity.status);
    }
  };

  // 获取当前拖拽的活动
  const activeActivity = activeId ? activities.find(a => a.id === activeId) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 头部 */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">活动管理</h1>
            <p className="text-muted-foreground mt-1">
              {isMobile ? '管理您的活动' : '拖拽卡片到不同列来改变状态'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant={viewMode === 'board' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('board')}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            )}
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              新建活动
            </Button>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="flex-shrink-0 px-6 pb-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="搜索活动名称..."
                onChange={() => {
                  // 这里可以添加搜索逻辑
                }}
              />
            </div>
            
            <Select
              value={filters.type || 'all'}
              onValueChange={(value) => {
                setFilters({ ...filters, type: value === 'all' ? undefined : value });
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="meeting">会议</SelectItem>
                <SelectItem value="task">任务</SelectItem>
                <SelectItem value="reminder">提醒</SelectItem>
                <SelectItem value="ping">Ping</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.priority_min?.toString() || 'all'}
              onValueChange={(value) => {
                setFilters({ 
                  ...filters, 
                  priority_min: value === 'all' ? undefined : parseInt(value) 
                });
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="优先级" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部优先级</SelectItem>
                <SelectItem value="8">高优先级 (≥8)</SelectItem>
                <SelectItem value="5">中优先级 (≥5)</SelectItem>
                <SelectItem value="3">低优先级 (≥3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* 看板/列表视图 */}
      <div className="flex-1 px-6 pb-6 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">加载中...</div>
        ) : !activities || activities.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Card className="p-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">暂无活动</p>
              <Button onClick={handleCreate} className="mt-4">
                创建第一个活动
              </Button>
            </Card>
          </div>
        ) : isMobile || viewMode === 'list' ? (
          // 列表视图（移动端或用户选择）
          <ScrollArea className="h-full">
            <div className="space-y-3 pb-4">
              {activities.filter(a => !a.is_deleted).map((activity) => (
                <Card
                  key={activity.id}
                  className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleEdit(activity)}
                >
                  <div className="flex items-start gap-3">
                    {/* 优先级指示器 */}
                    <div
                      className={`w-1 h-16 rounded-full flex-shrink-0 ${
                        activity.priority >= 8
                          ? 'bg-red-500'
                          : activity.priority >= 5
                          ? 'bg-orange-500'
                          : activity.priority >= 3
                          ? 'bg-yellow-500'
                          : 'bg-gray-400'
                      }`}
                    />
                    
                    <div className="flex-1 min-w-0">
                      {/* 标题和状态 */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-base line-clamp-2">{activity.name}</h3>
                        <Badge className={getStatusBadgeColor(activity.status)}>
                          {getStatusText(activity.status)}
                        </Badge>
                      </div>

                      {/* 备注 */}
                      {activity.comments && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {activity.comments}
                        </p>
                      )}

                      {/* 元信息 */}
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          <span>{activity.type}</span>
                        </div>
                        <span className={getPriorityColor(activity.priority)}>
                          优先级: {activity.priority}
                        </span>
                        {activity.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDateTime(activity.due_date)}</span>
                          </div>
                        )}
                      </div>

                      {/* 标签 */}
                      {activity.tags && activity.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {activity.tags.slice(0, 3).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {activity.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{activity.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 删除按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(activity.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        ) : (
          // 看板视图（桌面端）
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
              {BOARD_COLUMNS.map((column) => (
                <DroppableColumn
                  key={column.status}
                  column={column}
                  activities={groupedActivities[column.status] || []}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  getPriorityColor={getPriorityColor}
                />
              ))}
            </div>

            {/* 拖拽预览 */}
            <DragOverlay>
              {activeActivity ? (
                <Card className="p-3 opacity-90 rotate-3 shadow-lg">
                  <div className="flex items-start gap-2">
                    <div className="w-1 h-full rounded-full bg-primary" />
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{activeActivity.name}</h4>
                    </div>
                  </div>
                </Card>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* 活动对话框 */}
      <ActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        activity={editingActivity}
        onSuccess={loadActivities}
      />
    </div>
  );
};

export default Activities;
