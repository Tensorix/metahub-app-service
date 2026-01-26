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
  const allowTopTrigger = useRef(false);
  const allowBottomTrigger = useRef(false);
  const scrollEndTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  const { 
    threshold = 100,
    debounceMs = 100, // 缩短防抖时间，配合微小位移忽略策略，提高响应灵敏度
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

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current);
      }
    };
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = ref.current;
      if (!el) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      // 增加 1px 的容差，避免高分屏或缩放时的精度问题
      const isAtTop = scrollTop <= 1;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      const now = Date.now();
      
      // 清除之前的结束计时器
      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current);
      }

      // 如果距离上次滚动时间过长，视为新的滚动序列（防抖）
      // 关键逻辑：只有在滚动开始时就已经处于边界，才允许触发切换
      // 这避免了从中间快速滑动到顶部时意外触发
      // 忽略微小的惯性滚动（deltaY < 1.0），避免它们不断重置计时器导致无法触发
      const isTinyDelta = Math.abs(e.deltaY) < 1.0;
      let shouldUpdateLastScrollTime = true;
      
      // 如果处于锁定状态（在边界但未允许触发），且是微小位移，则不更新时间
      // 这样可以让 debounce 计时器正常过期，从而触发重置
      if ((isAtTop && !allowTopTrigger.current && isTinyDelta) ||
          (isAtBottom && !allowBottomTrigger.current && isTinyDelta)) {
        shouldUpdateLastScrollTime = false;
      }

      // 如果距离上次滚动时间过长，视为新的滚动序列（防抖）
      // 这里用于初始化当前滚动序列是否"允许"触发边界
      if (now - lastScrollTime.current > debounceMs) {
        accumulatedDelta.current = 0;
        activeDirection.current = null;
        updateState(0, null);
        
        // 关键逻辑：只有在滚动开始时就已经处于边界，才允许触发切换
        allowTopTrigger.current = isAtTop;
        allowBottomTrigger.current = isAtBottom;
      }
      
      if (shouldUpdateLastScrollTime) {
        lastScrollTime.current = now;
      }

      // 顶部拉动逻辑
      if (activeDirection.current === 'up' || (isAtTop && e.deltaY < 0 && allowTopTrigger.current)) {
        // 防止滚动冒泡，防止触发父级滚动（如浏览器默认行为或上层容器）
        if (isAtTop && e.deltaY < 0) {
          e.preventDefault();
        }
        
        if (e.deltaY < 0) {
          // 继续向下拉：阻止滚动，累加进度
          // e.preventDefault() 已经处理
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
      }
      // 底部拉动逻辑
      else if (activeDirection.current === 'down' || (isAtBottom && e.deltaY > 0 && allowBottomTrigger.current)) {
        // 防止滚动冒泡
        if (isAtBottom && e.deltaY > 0) {
          e.preventDefault();
        }

        if (e.deltaY > 0) {
          // 继续向上拉：阻止滚动，累加进度
          // e.preventDefault() 已经处理
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
      } else {
        // 处于边界但未允许触发时，也要阻止冒泡以修复"被上一层捕获"的问题
        // 但只有在确实试图向边界外滚动时才阻止
        if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
          e.preventDefault();
        }
      }

      // 设置结束计时器：滚动停止一段时间后，检查是否触发
      scrollEndTimeout.current = setTimeout(() => {
        if (accumulatedDelta.current >= threshold) {
          if (activeDirection.current === 'up') {
            onTopBoundary();
          } else if (activeDirection.current === 'down') {
            onBottomBoundary();
          }
        }
        // 重置状态
        accumulatedDelta.current = 0;
        activeDirection.current = null;
        updateState(0, null);
      }, debounceMs);
    },
    [threshold, debounceMs, onTopBoundary, onBottomBoundary, updateState]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 使用 passive: false 以便调用 preventDefault
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  return { ref, progress, direction };
}

