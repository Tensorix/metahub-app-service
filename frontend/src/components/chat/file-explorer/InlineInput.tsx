/**
 * Inline input for creating file/folder or renaming.
 * Enter to confirm, Escape to cancel.
 * showIcon: false for rename mode (parent row already has icon)
 */

import { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Folder, File } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineInputProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  placeholder?: string;
  type: 'file' | 'folder';
  className?: string;
  depth?: number;
  showIcon?: boolean;
}

export function InlineInput({
  value,
  onChange,
  onConfirm,
  onCancel,
  placeholder,
  type,
  className,
  depth = 0,
  showIcon = true,
}: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className={cn('flex items-center gap-1 px-2 py-0.5', className)}
      style={depth > 0 ? { paddingLeft: `${depth * 12 + 8}px` } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {showIcon && (type === 'folder' ? (
        <Folder className="h-4 w-4 text-yellow-500 shrink-0" />
      ) : (
        <File className="h-4 w-4 text-muted-foreground shrink-0" />
      ))}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm(value);
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
        onBlur={onCancel}
        placeholder={placeholder ?? (type === 'folder' ? '文件夹名' : '文件名')}
        className="h-7 text-sm flex-1 font-normal"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
