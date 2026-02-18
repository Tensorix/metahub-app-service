import { Link } from 'react-router-dom';
import { MessageSquare, Hash, FileText, Database, X } from 'lucide-react';
import type { RelationInfo } from '@/lib/activityApi';
import { cn } from '@/lib/utils';

interface RelationLinkProps {
  relation: RelationInfo;
  variant?: 'card' | 'compact';
  onNavigate?: () => void;
  className?: string;
  /** 编辑模式下显示删除按钮，点击时调用 */
  onRemove?: (type: RelationInfo['type'], id: string) => void;
}

const isDeleted = (r: RelationInfo) => r.name === '(已删除)' || r.name.includes('已删除');

function getHref(relation: RelationInfo): string | null {
  if (isDeleted(relation)) return null;
  switch (relation.type) {
    case 'session':
      return `/sessions/${relation.id}`;
    case 'topic':
      return relation.session_id
        ? `/sessions/${relation.session_id}/topics/${relation.id}`
        : null;
    case 'node':
      return `/knowledge?node=${relation.id}`;
    default:
      return null;
  }
}

function getIcon(relation: RelationInfo) {
  switch (relation.type) {
    case 'session':
      return MessageSquare;
    case 'topic':
      return Hash;
    case 'node':
      return relation.node_type === 'dataset' ? Database : FileText;
    default:
      return FileText;
  }
}

function getSubtitle(relation: RelationInfo): string | null {
  if (relation.type === 'topic' && relation.session_name) {
    return `(${relation.session_name})`;
  }
  if (relation.type === 'node' && relation.node_type) {
    return `(${relation.node_type})`;
  }
  return null;
}

export function RelationLink({
  relation,
  variant = 'card',
  onNavigate,
  className,
  onRemove,
}: RelationLinkProps) {
  const href = getHref(relation);
  const Icon = getIcon(relation);
  const subtitle = getSubtitle(relation);
  const deleted = isDeleted(relation);

  const content = (
    <>
      <Icon className={cn('shrink-0', variant === 'card' ? 'w-3 h-3' : 'w-2.5 h-2.5')} />
      <span className={cn('truncate text-xs', variant === 'compact' && 'max-w-[90px]')}>
        {relation.name}
      </span>
      {subtitle && variant === 'card' && (
        <span className="text-muted-foreground text-[11px] truncate shrink-0">{subtitle}</span>
      )}
    </>
  );

  const baseClass = cn(
    'flex items-center gap-1.5 transition-colors',
    variant === 'card' && 'px-2 py-1 rounded-md border bg-background hover:bg-accent/50 text-xs',
    variant === 'compact' && 'px-1.5 py-0.5 rounded border bg-background hover:bg-accent/50 text-xs',
    deleted && 'text-muted-foreground cursor-default',
    !deleted && 'cursor-pointer',
    className
  );

  if (deleted || !href) {
    return (
      <span className={baseClass} title="内容已删除">
        {content}
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-1', variant === 'card' && 'group')}>
      <Link
        to={href}
        className={baseClass}
        onClick={onNavigate}
      >
        {content}
      </Link>
      {onRemove && (
        <button
          type="button"
          data-remove
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(relation.type, relation.id);
          }}
          className="shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label="移除关联"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
