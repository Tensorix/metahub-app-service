import { useCallback, useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { TRANSFORMERS } from '@lexical/markdown';

import { editorTheme } from './theme';
import { EDITOR_NODES } from './nodes';
import { OnChangePlugin } from './plugins/OnChangePlugin';
import { AutoFocusPlugin } from './plugins/AutoFocusPlugin';
import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { FloatingToolbarPlugin } from './plugins/FloatingToolbarPlugin';
import { ImagePlugin } from './plugins/ImagePlugin';
import { CodeHighlightPlugin } from './plugins/CodeHighlightPlugin';
import { DraggableBlockPlugin } from './plugins/DraggableBlockPlugin';
import { CollapsiblePlugin } from './plugins/CollapsiblePlugin';
import { CalloutPlugin } from './plugins/CalloutPlugin';
import { TableActionMenuPlugin } from './plugins/TableActionMenuPlugin';
import { LinkEditorPlugin } from './plugins/LinkEditorPlugin';
import { AutoLinkPlugin } from './plugins/AutoLinkPlugin';

export interface LexicalEditorProps {
  initialContent?: string;
  onChange?: (jsonString: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  editable?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export function LexicalEditor({
  initialContent,
  onChange,
  onUploadImage,
  editable = true,
  autoFocus = true,
  placeholder = '输入 / 唤起命令…',
}: LexicalEditorProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: 'KnowledgeEditor',
      theme: editorTheme,
      nodes: EDITOR_NODES,
      editable,
      onError: (error: Error) => {
        console.error('[LexicalEditor]', error);
      },
      editorState: (editor: any) => {
        if (!initialContent) {
          return;
        }

        try {
          const editorState = editor.parseEditorState(initialContent);
          const json = editorState.toJSON?.();

          // 基本结构校验，避免无效 JSON 结构造成解析异常
          if (!json?.root || json.root.type !== 'root') {
            throw new Error('Invalid Lexical editorState shape');
          }

          editor.setEditorState(editorState);
        } catch (e) {
          console.error(
            '[LexicalEditor] Failed to parse initialContent, fallback to empty editor state.',
            e,
            initialContent,
          );
          // 解析失败时直接使用默认空状态，避免报错中断
        }
      },
    }),
    // Only use initialContent on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = useCallback(
    (jsonString: string) => {
      onChange?.(jsonString);
    },
    [onChange],
  );

  const validateUrl = useCallback((url: string) => {
    return /^https?:\/\//.test(url) || url.startsWith('/') || url.startsWith('mailto:');
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-editor-shell relative flex flex-col h-full">
        {/* Editor content area */}
        <div className="flex-1 overflow-y-auto relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="lexical-content-editable prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full min-h-[300px] px-8 py-8 sm:px-12"
                aria-placeholder={placeholder}
                placeholder={
                  <div className="lexical-placeholder absolute top-8 left-8 sm:left-12 text-muted-foreground pointer-events-none select-none">
                    {placeholder}
                  </div>
                }
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />

          {/* Core plugins */}
          <HistoryPlugin />
          <ListPlugin />
          <CheckListPlugin />
          <TabIndentationPlugin />
          <HorizontalRulePlugin />
          <LinkPlugin validateUrl={validateUrl} />
          <ClickableLinkPlugin />
          <TablePlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />

          {/* Custom plugins */}
          <OnChangePlugin onChange={handleChange} />
          {autoFocus && <AutoFocusPlugin />}
          <CodeHighlightPlugin />
          <SlashCommandPlugin onUploadImage={onUploadImage} />
          <FloatingToolbarPlugin />
          <ImagePlugin onUploadImage={onUploadImage} />
          <DraggableBlockPlugin />
          <CollapsiblePlugin />
          <CalloutPlugin />
          <TableActionMenuPlugin />
          <LinkEditorPlugin />
          <AutoLinkPlugin />
        </div>
      </div>
    </LexicalComposer>
  );
}
