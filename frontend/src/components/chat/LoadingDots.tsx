/**
 * Animated loading dots indicator for streaming/thinking states.
 */

import { cn } from '@/lib/utils';

interface LoadingDotsProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function LoadingDots({ size = 'sm', className }: LoadingDotsProps) {
  const dotSize = size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(dotSize, 'rounded-full bg-brand/50 animate-bounce')}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}
