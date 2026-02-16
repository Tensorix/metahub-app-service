import { EditorBubbleItem, useEditor } from 'novel';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';

interface TextButtonItem {
  name: string;
  isActive: (editor: Editor) => boolean;
  command: (editor: Editor) => void;
  icon: React.ComponentType<{ className?: string }>;
}

const items: TextButtonItem[] = [
  {
    name: 'bold',
    isActive: (editor) => editor.isActive('bold'),
    command: (editor) => editor.chain().focus().toggleBold().run(),
    icon: Bold,
  },
  {
    name: 'italic',
    isActive: (editor) => editor.isActive('italic'),
    command: (editor) => editor.chain().focus().toggleItalic().run(),
    icon: Italic,
  },
  {
    name: 'underline',
    isActive: (editor) => editor.isActive('underline'),
    command: (editor) => editor.chain().focus().toggleUnderline().run(),
    icon: Underline,
  },
  {
    name: 'strike',
    isActive: (editor) => editor.isActive('strike'),
    command: (editor) => editor.chain().focus().toggleStrike().run(),
    icon: Strikethrough,
  },
  {
    name: 'code',
    isActive: (editor) => editor.isActive('code'),
    command: (editor) => editor.chain().focus().toggleCode().run(),
    icon: Code,
  },
];

export function TextButtons() {
  const { editor } = useEditor();
  if (!editor) return null;

  return (
    <>
      {items.map((item) => (
        <EditorBubbleItem
          key={item.name}
          onSelect={() => item.command(editor)}
          className={
            item.isActive(editor)
              ? 'bg-accent text-accent-foreground'
              : undefined
          }
        >
          <item.icon className="w-4 h-4" />
        </EditorBubbleItem>
      ))}
    </>
  );
}
