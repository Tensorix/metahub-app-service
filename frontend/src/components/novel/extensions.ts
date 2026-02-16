import {
  StarterKit,
  Placeholder,
  TiptapLink,
  UpdatedImage,
  TaskList,
  TaskItem,
  HorizontalRule,
  TiptapUnderline,
  TextStyle,
  Color,
  HighlightExtension,
  UploadImagesPlugin,
  GlobalDragHandle,
} from 'novel';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { cn } from '@/lib/utils';

const lowlight = createLowlight(common);

const placeholder = Placeholder.configure({
  placeholder: ({ node }) => {
    if (node.type.name === 'heading') {
      return `标题 ${node.attrs.level}`;
    }
    if (node.type.name === 'paragraph') {
      return '输入 / 唤起命令…';
    }
    return '';
  },
  includeChildren: true,
  showOnlyCurrent: true,
});

const tiptapLink = TiptapLink.configure({
  HTMLAttributes: {
    class: cn(
      'text-muted-foreground underline underline-offset-[3px] hover:text-primary transition-colors cursor-pointer'
    ),
  },
});

const taskList = TaskList.configure({
  HTMLAttributes: {
    class: cn('not-prose pl-2'),
  },
});

const taskItem = TaskItem.configure({
  HTMLAttributes: {
    class: cn('flex items-start my-4'),
  },
  nested: true,
});

const horizontalRule = HorizontalRule.configure({
  HTMLAttributes: {
    class: cn('mt-4 mb-6 border-t border-muted-foreground'),
  },
});

const codeBlockLowlight = CodeBlockLowlight.configure({
  lowlight,
  HTMLAttributes: {
    class: cn('not-prose rounded-sm bg-muted border p-5 font-mono font-medium text-sm'),
  },
});

const starterKit = StarterKit.configure({
  bulletList: {
    HTMLAttributes: {
      class: cn('list-disc list-outside leading-3 -mt-2'),
    },
  },
  orderedList: {
    HTMLAttributes: {
      class: cn('list-decimal list-outside leading-3 -mt-2'),
    },
  },
  listItem: {
    HTMLAttributes: {
      class: cn('leading-normal -mb-2'),
    },
  },
  blockquote: {
    HTMLAttributes: {
      class: cn('border-l-4 border-primary pl-4'),
    },
  },
  codeBlock: false,
  code: {
    HTMLAttributes: {
      class: cn('rounded-md bg-muted px-1.5 py-1 font-mono font-medium text-sm'),
      spellcheck: 'false',
    },
  },
  horizontalRule: false,
  dropcursor: {
    color: '#3b82f6',
    width: 4,
    class: 'drop-cursor',
  },
  gapcursor: false,
});

const updatedImage = UpdatedImage.extend({
  addProseMirrorPlugins() {
    return [
      UploadImagesPlugin({
        imageClass: cn('opacity-40 rounded-lg border border-border'),
      }),
    ];
  },
}).configure({
  allowBase64: true,
  HTMLAttributes: {
    class: cn('rounded-lg border border-border max-w-full h-auto'),
  },
});

export const defaultExtensions = [
  starterKit,
  placeholder,
  tiptapLink,
  updatedImage,
  GlobalDragHandle,
  taskList,
  taskItem,
  horizontalRule,
  codeBlockLowlight,
  TiptapUnderline,
  TextStyle,
  Color,
  HighlightExtension,
];
