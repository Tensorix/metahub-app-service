import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PaddingSide = 'top' | 'right' | 'bottom' | 'left';

interface CardStyleContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  sides?: PaddingSide[];
  size?: number | string;
}

const ALL_SIDES: PaddingSide[] = ['top', 'right', 'bottom', 'left'];

function resolvePaddingSize(size: number | string): string {
  return typeof size === 'number' ? `${size}px` : size;
}

export function CardStyleContainer({
  children,
  sides = ALL_SIDES,
  size = 8,
  className,
  style,
  ...props
}: CardStyleContainerProps) {
  const paddingStyle: CSSProperties = {
    paddingTop: sides.includes('top') ? resolvePaddingSize(size) : 0,
    paddingRight: sides.includes('right') ? resolvePaddingSize(size) : 0,
    paddingBottom: sides.includes('bottom') ? resolvePaddingSize(size) : 0,
    paddingLeft: sides.includes('left') ? resolvePaddingSize(size) : 0,
  };

  return (
    <div
      className={cn('bg-[#ebebeb] dark:bg-muted', className)}
      style={{ ...paddingStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
