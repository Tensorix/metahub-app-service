import { useRef, useEffect } from 'react';
import { useEditor } from 'novel';
import { Link2, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface LinkSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkSelector({ open, onOpenChange }: LinkSelectorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { editor } = useEditor();

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!editor) return null;

  const isActive = editor.isActive('link');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded-none border-none px-2 py-1 hover:bg-accent',
          isActive && 'text-blue-500'
        )}
      >
        <Link2 className="h-4 w-4" />
        <p
          className={cn(
            'text-sm underline decoration-stone-400 underline-offset-4',
            isActive && 'text-blue-500'
          )}
        >
          链接
        </p>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = inputRef.current;
            const url = input?.value;
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
            onOpenChange(false);
          }}
          className="flex p-1"
        >
          <input
            ref={inputRef}
            type="url"
            placeholder="输入链接 URL"
            className="flex-1 bg-background p-1 text-sm outline-none"
            defaultValue={editor.getAttributes('link').href || ''}
          />
          {editor.getAttributes('link').href ? (
            <button
              type="button"
              className="flex items-center rounded-sm p-1 text-red-600 transition-all hover:bg-red-100 dark:hover:bg-red-900"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              className="flex items-center rounded-sm p-1 text-stone-600 transition-all hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
