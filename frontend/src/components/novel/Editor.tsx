import { useState, useMemo } from 'react';
import {
  EditorRoot,
  EditorContent,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  EditorBubble,
  ImageResizer,
  handleCommandNavigation,
  handleImagePaste,
  handleImageDrop,
} from 'novel';
import type { JSONContent, UploadFn } from 'novel';
import { Separator } from '@/components/ui/separator';
import { defaultExtensions } from './extensions';
import { createSlashCommand, suggestionItems } from './slash-command';
import { NodeSelector } from './selectors/node-selector';
import { LinkSelector } from './selectors/link-selector';
import { TextButtons } from './selectors/text-buttons';
import { ColorSelector } from './selectors/color-selector';

interface NovelEditorProps {
  initialContent?: JSONContent;
  onChange?: (json: JSONContent) => void;
  uploadFn?: UploadFn;
}

export function NovelEditor({
  initialContent,
  onChange,
  uploadFn,
}: NovelEditorProps) {
  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);

  const extensions = useMemo(
    () => [...defaultExtensions, createSlashCommand(uploadFn)],
    [uploadFn]
  );

  return (
    <EditorRoot>
      <EditorContent
        extensions={extensions}
        initialContent={initialContent}
        editorProps={{
          handleDOMEvents: {
            keydown: (_view, event) => handleCommandNavigation(event),
          },
          handleKeyDown: (view, event) => {
            if (event.key === 'Tab') {
              const { state, dispatch } = view;
              const { selection } = state;
              const node = state.doc.resolve(selection.from).parent;
              if (node.type.name === 'codeBlock') {
                event.preventDefault();
                if (event.shiftKey) {
                  const lineStart = state.doc.resolve(selection.from);
                  const textBefore = lineStart.parent.textContent.slice(
                    0,
                    selection.from - lineStart.start()
                  );
                  const indent = textBefore.match(/^( {1,2})/);
                  if (indent) {
                    dispatch(
                      state.tr.delete(
                        selection.from - indent[1].length,
                        selection.from
                      )
                    );
                  }
                } else {
                  dispatch(state.tr.insertText('  ', selection.from, selection.to));
                }
                return true;
              }
            }
            return false;
          },
          handlePaste: (view, event) =>
            uploadFn ? handleImagePaste(view, event, uploadFn) : false,
          handleDrop: (view, event, _slice, moved) =>
            uploadFn
              ? handleImageDrop(view, event, moved, uploadFn)
              : false,
          attributes: {
            class:
              'prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full',
          },
        }}
        onUpdate={({ editor }) => {
          onChange?.(editor.getJSON());
        }}
        slotAfter={<ImageResizer />}
      >
        <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-border bg-popover px-1 py-2 shadow-md transition-all">
          <EditorCommandEmpty className="px-2 text-muted-foreground">
            无匹配结果
          </EditorCommandEmpty>
          <EditorCommandList>
            {suggestionItems.map((item) => (
              <EditorCommandItem
                key={item.title}
                value={item.title}
                onCommand={(val) => item.command?.(val)}
                className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
                  {item.icon}
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </EditorCommandItem>
            ))}
          </EditorCommandList>
        </EditorCommand>

        <EditorBubble
          tippyOptions={{
            placement: 'top',
          }}
          className="flex w-fit max-w-[90vw] overflow-visible rounded-md border border-border bg-popover shadow-md"
        >
          <NodeSelector open={openNode} onOpenChange={setOpenNode} />
          <Separator orientation="vertical" />
          <LinkSelector open={openLink} onOpenChange={setOpenLink} />
          <Separator orientation="vertical" />
          <TextButtons />
          <Separator orientation="vertical" />
          <ColorSelector open={openColor} onOpenChange={setOpenColor} />
        </EditorBubble>
      </EditorContent>
    </EditorRoot>
  );
}
