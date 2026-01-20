import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Filter } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './ui/dropdown-menu';

interface SessionFiltersProps {
  selectedType?: string;
  onTypeChange: (type?: string) => void;
  sortBy: 'updated' | 'created' | 'name';
  onSortChange: (sort: 'updated' | 'created' | 'name') => void;
}

export function SessionFilters({
  selectedType,
  onTypeChange,
  sortBy,
  onSortChange,
}: SessionFiltersProps) {
  const types = [
    { value: 'pm', label: '私聊' },
    { value: 'group', label: '群聊' },
    { value: 'ai', label: 'AI' },
  ];

  const sortOptions = [
    { value: 'updated' as const, label: '最近更新' },
    { value: 'created' as const, label: '创建时间' },
    { value: 'name' as const, label: '名称' },
  ];

  return (
    <div className="flex items-center gap-2">
      {/* 类型筛选 */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            类型
            {selectedType && (
              <Badge variant="secondary" className="ml-2">
                1
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>会话类型</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onTypeChange(undefined)}>
            全部
          </DropdownMenuItem>
          {types.map((type) => (
            <DropdownMenuItem
              key={type.value}
              onClick={() => onTypeChange(type.value)}
            >
              {type.label}
              {selectedType === type.value && ' ✓'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 排序 */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline" size="sm">
            排序: {sortOptions.find((s) => s.value === sortBy)?.label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>排序方式</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sortOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
              {sortBy === option.value && ' ✓'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 清除筛选 */}
      {selectedType && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTypeChange(undefined)}
        >
          清除筛选
        </Button>
      )}
    </div>
  );
}
