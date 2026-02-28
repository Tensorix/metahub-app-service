import { useCallback, useMemo } from 'react';
import {
  Editor,
  useEditor,
  type EditorProps,
} from '@lobehub/editor/react';
import {
  ReactListPlugin,
  ReactLinkPlugin,
  ReactCodeblockPlugin,
  ReactTablePlugin,
  ReactHRPlugin,
  ReactImagePlugin,
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
  onChange?: (jsonString: string) => void;
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

  const parsedContent = useMemo(() => {
    if (!initialContent) return EMPTY_EDITOR_STATE;
    try {
      const parsed = JSON.parse(initialContent);
      if (parsed?.root?.type === 'root') return parsed;
    } catch {
      // Invalid JSON — start with empty editor
    }
    return EMPTY_EDITOR_STATE;
  }, [initialContent]);

  const handleTextChange = useCallback(
    (ed: IEditor) => {
      if (!onChange) return;
      const doc = ed.getDocument('json');
      if (doc) {
        onChange(JSON.stringify(doc));
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
        title: '大标题',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h1' });
        },
      },
      {
        key: 'h2',
        label: '标题 2',
        title: '中标题',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h2' });
        },
      },
      {
        key: 'h3',
        label: '标题 3',
        title: '小标题',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h3' });
        },
      },
      {
        key: 'ul',
        label: '无序列表',
        title: '项目符号列表',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(
            INSERT_UNORDERED_LIST_COMMAND,
            undefined as never,
          );
        },
      },
      {
        key: 'ol',
        label: '有序列表',
        title: '编号列表',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(
            INSERT_ORDERED_LIST_COMMAND,
            undefined as never,
          );
        },
      },
      {
        key: 'checklist',
        label: '待办列表',
        title: '可勾选的任务列表',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined as never);
        },
      },
      {
        key: 'quote',
        label: '引用',
        title: '引用段落',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_QUOTE_COMMAND, undefined as never);
        },
      },
      {
        key: 'code',
        label: '代码块',
        title: '带语法高亮的代码（也可输入 ```）',
        onSelect: (ed: IEditor) => {
          // Insert a markdown code fence via the editor's markdown API
          // The codeblock plugin will render it with Shiki highlighting
          const current = ed.getDocument('markdown');
          const markdown = current ? `${String(current)}\n\`\`\`\n\n\`\`\`` : '```\n\n```';
          ed.setDocument('markdown', markdown);
        },
      },
      {
        key: 'image',
        label: '图片',
        title: '上传或插入图片',
        onSelect: (ed: IEditor) => {
          if (!onUploadImage) return;
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
      {
        key: 'table',
        label: '表格',
        title: '插入表格',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: '3',
            rows: '3',
            includeHeaders: true,
          });
        },
      },
      {
        key: 'hr',
        label: '分割线',
        title: '水平分割线',
        onSelect: (ed: IEditor) => {
          ed.dispatchCommand(
            INSERT_HORIZONTAL_RULE_COMMAND,
            undefined as never,
          );
        },
      },
    ],
    [onUploadImage],
  );

  const plugins: EditorProps['plugins'] = useMemo(
    () => [
      ReactListPlugin,
      ReactLinkPlugin,
      ReactCodeblockPlugin,
      ReactTablePlugin,
      ReactHRPlugin,
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
      content={parsedContent}
      type="json"
      onTextChange={handleTextChange}
      className="prose prose-lg dark:prose-invert prose-headings:font-title font-default max-w-full min-h-[300px] px-8 py-8 sm:px-12"
    />
  );
}
