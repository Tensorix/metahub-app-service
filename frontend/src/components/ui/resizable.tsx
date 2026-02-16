import * as React from 'react';
import { cn } from '@/lib/utils';

interface ResizableHandleProps {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
  className?: string;
  /** 拖拽开始时调用，可用于禁用父级过渡动画 */
  onDragStart?: () => void;
  /** 拖拽结束时调用 */
  onDragEnd?: () => void;
}

export function ResizableHandle({
  onResize,
  direction = 'horizontal',
  className,
  onDragStart,
  onDragEnd,
}: ResizableHandleProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const startPosRef = React.useRef(0);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
      onDragStart?.();
    },
    [direction, onDragStart]
  );

  const handleTouchStart = React.useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      const touch = e.touches[0];
      startPosRef.current = direction === 'horizontal' ? touch.clientX : touch.clientY;
      onDragStart?.();
    },
    [direction, onDragStart]
  );

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentPos = direction === 'horizontal' ? touch.clientX : touch.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleEnd = () => {
      setIsDragging(false);
      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    // 添加拖拽时的全局样式
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, direction, onResize, onDragEnd]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      className={cn(
        'group relative flex items-center justify-center transition-colors',
        direction === 'horizontal'
          ? 'w-2 cursor-col-resize hover:bg-primary/10'
          : 'h-2 cursor-row-resize hover:bg-primary/10',
        isDragging && 'bg-primary/20',
        className
      )}
    >
      {/* 拖拽指示器 */}
      <div
        className={cn(
          'absolute rounded-full bg-border transition-all group-hover:bg-primary/50',
          direction === 'horizontal'
            ? 'h-8 w-1 group-hover:w-1.5'
            : 'h-1 w-8 group-hover:h-1.5',
          isDragging && 'bg-primary'
        )}
      />
    </div>
  );
}

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ResizablePanel({
  children,
  className,
  style,
}: ResizablePanelProps) {
  return (
    <div className={cn('overflow-hidden', className)} style={style}>
      {children}
    </div>
  );
}
