/**
 * HTML5 drag-drop zone for file upload.
 * Shows overlay when dragging files over the area.
 */

import { useCallback, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onDrop: (files: File[], targetDir: string) => void;
  defaultTargetDir?: string;
  dropTargetDir?: string | null;
  onDragTargetChange?: (dir: string | null) => void;
  children: React.ReactNode;
  className?: string;
}

export function DropZone({
  onDrop,
  defaultTargetDir = '/workspace',
  dropTargetDir,
  onDragTargetChange,
  children,
  className,
}: DropZoneProps) {
  const [dragCount, setDragCount] = useState(0);
  const isActive = dragCount > 0;

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) {
        setDragCount((c) => c + 1);
        onDragTargetChange?.(dropTargetDir ?? defaultTargetDir);
      }
    },
    [defaultTargetDir, dropTargetDir, onDragTargetChange]
  );

  useEffect(() => {
    if (!isActive) onDragTargetChange?.(null);
  }, [isActive, onDragTargetChange]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCount((c) => Math.max(0, c - 1));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragCount(0);
      onDragTargetChange?.(null);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const target = dropTargetDir ?? defaultTargetDir;
        onDrop(files, target);
      }
    },
    [defaultTargetDir, dropTargetDir, onDrop]
  );

  return (
    <div
      className={cn('relative h-full', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isActive && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand/8 border-2 border-dashed border-brand rounded-lg pointer-events-none">
          <div className="bg-background/95 px-6 py-4 rounded-lg shadow-lg text-center">
            <p className="font-medium">松开以上传文件</p>
            {(dropTargetDir ?? defaultTargetDir) && (
              <p className="text-sm text-muted-foreground mt-1">
                上传到 {dropTargetDir ?? defaultTargetDir}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
