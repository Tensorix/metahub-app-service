import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Text,
  TextQuote,
  ImageIcon,
} from 'lucide-react';
import { createSuggestionItems, Command, renderItems } from 'novel';
import type { UploadFn } from 'novel';

export const suggestionItems = createSuggestionItems([
  {
    title: '文本',
    description: '普通段落文本',
    searchTerms: ['p', 'paragraph', '段落'],
    icon: <Text className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode('paragraph', 'paragraph')
        .run();
    },
  },
  {
    title: '待办事项',
    description: '任务列表',
    searchTerms: ['todo', 'task', 'list', 'check', 'checkbox', '任务'],
    icon: <CheckSquare className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: '标题 1',
    description: '大标题',
    searchTerms: ['title', 'big', 'large', 'h1'],
    icon: <Heading1 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode('heading', { level: 1 })
        .run();
    },
  },
  {
    title: '标题 2',
    description: '中标题',
    searchTerms: ['subtitle', 'medium', 'h2'],
    icon: <Heading2 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode('heading', { level: 2 })
        .run();
    },
  },
  {
    title: '标题 3',
    description: '小标题',
    searchTerms: ['subtitle', 'small', 'h3'],
    icon: <Heading3 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode('heading', { level: 3 })
        .run();
    },
  },
  {
    title: '无序列表',
    description: '项目符号列表',
    searchTerms: ['unordered', 'point', 'bullet'],
    icon: <List className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: '有序列表',
    description: '数字编号列表',
    searchTerms: ['ordered', 'number'],
    icon: <ListOrdered className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: '引用',
    description: '引用块',
    searchTerms: ['blockquote', 'quote'],
    icon: <TextQuote className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode('paragraph', 'paragraph')
        .toggleBlockquote()
        .run(),
  },
  {
    title: '代码块',
    description: '代码片段',
    searchTerms: ['codeblock', 'code'],
    icon: <Code className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: '图片',
    description: '上传图片',
    searchTerms: ['photo', 'picture', 'media', 'image', '图片'],
    icon: <ImageIcon className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          const pos = editor.view.state.selection.from;
          const view = editor.view;
          if ((window as any).__novelUploadFn) {
            (window as any).__novelUploadFn(file, view, pos);
          }
        }
      };
      input.click();
    },
  },
]);

export function createSlashCommand(uploadFn?: UploadFn) {
  if (uploadFn) {
    (window as any).__novelUploadFn = uploadFn;
  }

  return Command.configure({
    suggestion: {
      items: () => suggestionItems,
      render: renderItems,
    },
  });
}
