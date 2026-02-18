import { Check, ChevronDown } from 'lucide-react';
import { EditorBubbleItem, useEditor } from 'novel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ColorItem {
  name: string;
  color: string;
}

const TEXT_COLORS: ColorItem[] = [
  { name: '默认', color: 'var(--novel-black, #000000)' },
  { name: '紫色', color: '#9333EA' },
  { name: '红色', color: '#E00000' },
  { name: '黄色', color: '#EAB308' },
  { name: '蓝色', color: '#2563EB' },
  { name: '绿色', color: '#008A00' },
  { name: '橙色', color: '#FFA500' },
  { name: '粉色', color: '#BA4081' },
  { name: '灰色', color: '#A8A29E' },
];

const HIGHLIGHT_COLORS: ColorItem[] = [
  { name: '默认', color: 'var(--novel-highlight-default)' },
  { name: '紫色', color: 'var(--novel-highlight-purple)' },
  { name: '红色', color: 'var(--novel-highlight-red)' },
  { name: '黄色', color: 'var(--novel-highlight-yellow)' },
  { name: '蓝色', color: 'var(--novel-highlight-blue)' },
  { name: '绿色', color: 'var(--novel-highlight-green)' },
  { name: '橙色', color: 'var(--novel-highlight-orange)' },
  { name: '粉色', color: 'var(--novel-highlight-pink)' },
  { name: '灰色', color: 'var(--novel-highlight-gray)' },
];

interface ColorSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ColorSelector({ open, onOpenChange }: ColorSelectorProps) {
  const { editor } = useEditor();
  if (!editor) return null;

  const activeColorItem = TEXT_COLORS.find(({ color }) =>
    editor.isActive('textStyle', { color })
  );
  const activeHighlightItem = HIGHLIGHT_COLORS.find(({ color }) =>
    editor.isActive('highlight', { color })
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="gap-2 rounded-none border-none hover:bg-accent focus:ring-0 inline-flex items-center px-2 py-1"
      >
        <span
          className="rounded-sm px-1"
          style={{
            color: activeColorItem?.color,
            backgroundColor: activeHighlightItem?.color,
          }}
        >
          A
        </span>
        <ChevronDown className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        portal
        className="my-1 flex max-h-80 w-48 flex-col overflow-hidden overflow-y-auto rounded border p-1 shadow-xl"
        align="start"
      >
        <div className="flex flex-col">
          <div className="my-1 px-2 text-sm font-semibold text-muted-foreground">
            文字颜色
          </div>
          {TEXT_COLORS.map(({ name, color }, i) => (
            <EditorBubbleItem
              key={i}
              onSelect={() => {
                editor.commands.unsetColor();
                if (name !== '默认') {
                  editor.chain().focus().setColor(color).run();
                }
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-sm border px-2 py-px font-medium"
                  style={{ color }}
                >
                  A
                </div>
                <span>{name}</span>
              </div>
              {editor.isActive('textStyle', { color }) && (
                <Check className="h-4 w-4" />
              )}
            </EditorBubbleItem>
          ))}
        </div>

        <div className="flex flex-col">
          <div className="my-1 px-2 text-sm font-semibold text-muted-foreground">
            背景高亮
          </div>
          {HIGHLIGHT_COLORS.map(({ name, color }, i) => (
            <EditorBubbleItem
              key={i}
              onSelect={() => {
                editor.commands.unsetHighlight();
                if (name !== '默认') {
                  editor.commands.setHighlight({ color });
                }
                onOpenChange(false);
              }}
              className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <div
                  className="rounded-sm border px-2 py-px font-medium"
                  style={{ backgroundColor: color }}
                >
                  A
                </div>
                <span>{name}</span>
              </div>
              {editor.isActive('highlight', { color }) && (
                <Check className="h-4 w-4" />
              )}
            </EditorBubbleItem>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
