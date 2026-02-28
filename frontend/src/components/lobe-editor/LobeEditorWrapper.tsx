import { useCallback, useEffect, useMemo } from 'react';
import {
  Editor,
  useEditor,
  useEditorState,
  type EditorProps,
} from '@lobehub/editor/react';
import {
  ReactListPlugin,
  ReactLinkHighlightPlugin,
  ReactCodePlugin,
  ReactCodeblockPlugin,
  ReactTablePlugin,
  ReactHRPlugin,
  ReactImagePlugin,
  ReactVirtualBlockPlugin,
  ReactMarkdownPlugin,
  INSERT_HEADING_COMMAND,
  INSERT_QUOTE_COMMAND,
  INSERT_HORIZONTAL_RULE_COMMAND,
  INSERT_TABLE_COMMAND,
  INSERT_IMAGE_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lobehub/editor';
import type { IEditor, SlashOptions } from '@lobehub/editor';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  MinusIcon,
  Table2Icon,
  ImageIcon,
  SquareDashedBottomCodeIcon,
} from 'lucide-react';

// Minimal valid Lexical JSON state — required because @lobehub/editor's
// ReactPlainText unconditionally calls setDocument(type, content) even
// when content is undefined, which crashes JSONDataSource.read().
const EMPTY_EDITOR_STATE = {
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
        textFormat: 0,
        textStyle: '',
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

export interface LobeEditorWrapperProps {
  initialContent?: string;
  /** Callback receives Markdown string on every change */
  onChange?: (markdown: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  editable?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export function LobeEditorWrapper({
  initialContent,
  onChange,
  onUploadImage,
  editable = true,
  autoFocus = true,
  placeholder = '输入 / 唤起命令…',
}: LobeEditorWrapperProps) {
  const editor = useEditor();
  const editorState = useEditorState(editor);

  // Load initial Markdown content after the editor (child) has mounted.
  // key={node.id} on the wrapper guarantees a full remount when the doc changes.
  useEffect(() => {
    try {
      editor.setDocument('markdown', initialContent ?? '');
    } catch {
      // editor not yet ready — silently ignore (shouldn't happen after mount)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // intentionally empty: runs once per mount (key remounts on node change)

  const handleTextChange = useCallback(
    (ed: IEditor) => {
      if (!onChange) return;
      try {
        const md = ed.getDocument('markdown');
        if (md !== undefined) onChange(md as unknown as string);
      } catch {
        // markdown plugin not yet ready
      }
    },
    [onChange],
  );

  const ImagePluginWithUpload = useMemo(() => {
    if (!onUploadImage) return ReactImagePlugin;
    return Editor.withProps(ReactImagePlugin, {
      handleUpload: async (file: File) => {
        const url = await onUploadImage(file);
        return { url };
      },
      onPickFile: () =>
        new Promise<File | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = () => resolve(input.files?.[0] ?? null);
          input.click();
        }),
    });
  }, [onUploadImage]);

  const slashItems = useMemo<NonNullable<Extract<SlashOptions['items'], unknown[]>>>(
    () => [
      {
        key: 'h1',
        label: '标题 1',
        icon: Heading1Icon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h1' });
        },
      },
      {
        key: 'h2',
        label: '标题 2',
        icon: Heading2Icon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h2' });
        },
      },
      {
        key: 'h3',
        label: '标题 3',
        icon: Heading3Icon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h3' });
        },
      },
      { type: 'divider' as const },
      {
        key: 'checklist',
        label: '待办列表',
        icon: ListTodoIcon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined as never);
        },
      },
      {
        key: 'ul',
        label: '无序列表',
        icon: ListIcon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined as never);
        },
      },
      {
        key: 'ol',
        label: '有序列表',
        icon: ListOrderedIcon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined as never);
        },
      },
      { type: 'divider' as const },
      {
        key: 'quote',
        label: '引用',
        icon: QuoteIcon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_QUOTE_COMMAND, undefined as never);
        },
      },
      {
        key: 'hr',
        label: '分割线',
        icon: MinusIcon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, {});
        },
      },
      {
        key: 'table',
        label: '表格',
        icon: Table2Icon,
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3' });
        },
      },
      {
        key: 'codeblock',
        label: '代码块',
        icon: SquareDashedBottomCodeIcon,
        onSelect: () => {
          editorState.codeblock();
        },
      },
      ...(onUploadImage
        ? [
            {
              key: 'image',
              label: '图片',
              icon: ImageIcon,
              onSelect: (ed: IEditor) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  ed.dispatchCommand(INSERT_IMAGE_COMMAND, { file });
                };
                input.click();
              },
            },
          ]
        : []),
    ],
    [onUploadImage, editorState],
  );

  const plugins: EditorProps['plugins'] = useMemo(
    () => [
      ReactListPlugin,
      ReactLinkHighlightPlugin,
      ReactCodePlugin,
      ReactCodeblockPlugin,
      ReactTablePlugin,
      ReactHRPlugin,
      ReactVirtualBlockPlugin,
      ReactMarkdownPlugin,
      ImagePluginWithUpload,
    ],
    [ImagePluginWithUpload],
  );

  return (
    <Editor
      editor={editor}
      editable={editable}
      autoFocus={autoFocus}
      placeholder={placeholder}
      plugins={plugins}
      slashOption={{ items: slashItems }}
      content={EMPTY_EDITOR_STATE}
      onTextChange={handleTextChange}
      className="px-10"
      style={{ minHeight: 300 }}
    />
  );
}
