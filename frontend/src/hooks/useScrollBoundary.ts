import { useRef, useEffect, useCallback, useState } from 'react';

interface UseScrollBoundaryOptions {
  threshold?: number; // 累积滚动阈值，默认 100
  debounceMs?: number; // 防抖时间，默认 300
  onTopBoundary: () => void;
  onBottomBoundary: () => void;
  onProgress?: (progress: number, direction: 'up' | 'down' | null) => void;
  enableState?: boolean; // 是否启用内部 state，默认为 true。如果只需要回调可设为 false 以避免重渲染
}

interface UseScrollBoundaryReturn<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  progress: number; // 0-100 累积进度
  direction: 'up' | 'down' | null; // 滚动方向
}

export function useScrollBoundary<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollBoundaryOptions,
): UseScrollBoundaryReturn<T> {
  const ref = useRef<T>(null);
  const accumulatedDelta = useRef(0);
  const activeDirection = useRef<'up' | 'down' | null>(null);
  const lastScrollTime = useRef(0);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  const {
    threshold = 100,
    debounceMs = 300,
    onTopBoundary,
    onBottomBoundary,
    onProgress,
    enableState = true,
  } = options;

  const updateState = useCallback((newProgress: number, newDirection: 'up' | 'down' | null) => {
    if (enableState) {
      setProgress(newProgress);
      setDirection(newDirection);
    }
    onProgress?.(newProgress, newDirection);
  }, [enableState, onProgress]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = ref.current;
      if (!el) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      // 增加 1px 的容差，避免高分屏或缩放时的精度问题
      const isAtTop = scrollTop <= 1;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      const now = Date.now();
      // 如果距离上次滚动时间过长，重置状态（防抖）
      if (now - lastScrollTime.current > debounceMs) {
        accumulatedDelta.current = 0;
        activeDirection.current = null;
        updateState(0, null);
      }
      lastScrollTime.current = now;

      // 顶部拉动逻辑
      if (activeDirection.current === 'up' || (isAtTop && e.deltaY < 0)) {
        if (e.deltaY < 0) {
          // 继续向下拉：阻止滚动，累加进度
          e.preventDefault();
          activeDirection.current = 'up';
          accumulatedDelta.current += Math.abs(e.deltaY);
        } else if (activeDirection.current === 'up') {
          // 已经处于拉动状态时，向上回推：阻止滚动，减少进度
          e.preventDefault();
          accumulatedDelta.current -= Math.abs(e.deltaY);
          if (accumulatedDelta.current <= 0) {
            accumulatedDelta.current = 0;
            activeDirection.current = null;
          }
        }

        const newProgress = Math.min(100, (accumulatedDelta.current / threshold) * 100);
        updateState(newProgress, activeDirection.current);

        if (accumulatedDelta.current >= threshold) {
          onTopBoundary();
          accumulatedDelta.current = 0;
          activeDirection.current = null;
          updateState(0, null);
        }
      }
      // 底部拉动逻辑
      else if (activeDirection.current === 'down' || (isAtBottom && e.deltaY > 0)) {
        if (e.deltaY > 0) {
          // 继续向上拉：阻止滚动，累加进度
          e.preventDefault();
          activeDirection.current = 'down';
          accumulatedDelta.current += Math.abs(e.deltaY);
        } else if (activeDirection.current === 'down') {
          // 已经处于拉动状态时，向下回推：阻止滚动，减少进度
          e.preventDefault();
          accumulatedDelta.current -= Math.abs(e.deltaY);
          if (accumulatedDelta.current <= 0) {
            accumulatedDelta.current = 0;
            activeDirection.current = null;
          }
        }

        const newProgress = Math.min(100, (accumulatedDelta.current / threshold) * 100);
        updateState(newProgress, activeDirection.current);

        if (accumulatedDelta.current >= threshold) {
          onBottomBoundary();
          accumulatedDelta.current = 0;
          activeDirection.current = null;
          updateState(0, null);
        }
      } 
      // 非边界或无活动状态
      else {
        accumulatedDelta.current = 0;
        activeDirection.current = null;
        updateState(0, null);
      }
    },
    [threshold, debounceMs, onTopBoundary, onBottomBoundary, updateState],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return { ref, progress, direction };
}

