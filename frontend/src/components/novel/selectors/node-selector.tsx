import {
  Check,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  TextQuote,
  ListOrdered,
  List,
  Text as TextIcon,
  Code,
  CheckSquare,
} from 'lucide-react';
import { EditorBubbleItem, useEditor } from 'novel';
import type { Editor } from '@tiptap/core';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface SelectorItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  command: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

const items: SelectorItem[] = [
  {
    name: '文本',
    icon: TextIcon,
    command: (editor) =>
      editor.chain().focus().toggleNode('paragraph', 'paragraph').run(),
    isActive: (editor) =>
      editor.isActive('paragraph') &&
      !editor.isActive('bulletList') &&
      !editor.isActive('orderedList'),
  },
  {
    name: '标题 1',
    icon: Heading1,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
  },
  {
    name: '标题 2',
    icon: Heading2,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
  },
  {
    name: '标题 3',
    icon: Heading3,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
  },
  {
    name: '待办',
    icon: CheckSquare,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskItem'),
  },
  {
    name: '无序列表',
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    name: '有序列表',
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    name: '引用',
    icon: TextQuote,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .toggleNode('paragraph', 'paragraph')
        .toggleBlockquote()
        .run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
  {
    name: '代码块',
    icon: Code,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
  },
];

interface NodeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NodeSelector({ open, onOpenChange }: NodeSelectorProps) {
  const { editor } = useEditor();
  if (!editor) return null;

  const activeItem =
    items.filter((item) => item.isActive(editor)).pop() ?? { name: '多种' };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="gap-2 rounded-none border-none hover:bg-accent focus:ring-0 inline-flex items-center px-2 py-1"
      >
        <span className="whitespace-nowrap text-sm">{activeItem.name}</span>
        <ChevronDown className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-48 p-1"
      >
        {items.map((item, i) => (
          <EditorBubbleItem
            key={i}
            onSelect={() => {
              item.command(editor);
              onOpenChange(false);
            }}
            className="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-2">
              <item.icon className="h-3.5 w-3.5" />
              {item.name}
            </span>
            {activeItem.name === item.name && (
              <Check className="h-4 w-4" />
            )}
          </EditorBubbleItem>
        ))}
      </PopoverContent>
    </Popover>
  );
}
