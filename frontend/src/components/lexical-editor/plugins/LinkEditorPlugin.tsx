import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { mergeRegister } from '@lexical/utils';
import { ExternalLink, Pencil, Trash2, Check } from 'lucide-react';

function getSelectedLinkNode() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const node = selection.anchor.getNode();
  const parent = node.getParent();
  if ($isLinkNode(parent)) return parent;
  if ($isLinkNode(node)) return node;
  return null;
}

export function LinkEditorPlugin() {
  const [editor] = useLexicalComposerContext();
  const [linkUrl, setLinkUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const editedUrl = useRef('');

  const updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      setIsVisible(false);
      return;
    }

    const linkNode = getSelectedLinkNode();
    if (!linkNode) {
      setIsVisible(false);
      return;
    }

    const url = linkNode.getURL();
    setLinkUrl(url);
    editedUrl.current = url;

    // Position near the link
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      setIsVisible(false);
      return;
    }

    const range = nativeSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8 + window.scrollY,
      left: rect.left + window.scrollX,
    });
    setIsVisible(true);
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateLinkEditor();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateLinkEditor();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isVisible) {
            setIsVisible(false);
            setIsEditing(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, isVisible, updateLinkEditor]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const url = editedUrl.current.trim();
    if (url) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    }
    setIsEditing(false);
  }, [editor]);

  const handleRemove = useCallback(() => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setIsVisible(false);
    setIsEditing(false);
  }, [editor]);

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed z-50 flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1.5 shadow-md text-sm animate-in fade-in-0"
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            className="w-48 bg-transparent border-none outline-none text-sm"
            defaultValue={linkUrl}
            onChange={(e) => {
              editedUrl.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') {
                setIsEditing(false);
              }
            }}
            placeholder="输入链接地址..."
          />
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={handleSave}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline truncate max-w-[200px]"
          >
            {linkUrl}
          </a>
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => window.open(linkUrl, '_blank')}
            title="在新标签页打开"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => setIsEditing(true)}
            title="编辑链接"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-sm text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
            title="删除链接"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
