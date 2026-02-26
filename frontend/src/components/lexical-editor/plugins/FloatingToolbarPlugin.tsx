import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isCodeNode } from '@lexical/code';
import { mergeRegister } from '@lexical/utils';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function getSelectedNode(selection: ReturnType<typeof $getSelection>) {
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = anchor.getNode();
  const focusNode = focus.getNode();
  if (anchorNode === focusNode) {
    return anchorNode;
  }
  const isBackward = selection.isBackward();
  return isBackward ? focusNode : anchorNode;
}

export function FloatingToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) {
      setIsVisible(false);
      return;
    }

    // Don't show toolbar inside code blocks
    const node = getSelectedNode(selection);
    if (node) {
      const parent = node.getParent();
      if ($isCodeNode(node) || (parent && $isCodeNode(parent))) {
        setIsVisible(false);
        return;
      }
    }

    // Update format states
    setIsBold(selection.hasFormat('bold'));
    setIsItalic(selection.hasFormat('italic'));
    setIsUnderline(selection.hasFormat('underline'));
    setIsStrikethrough(selection.hasFormat('strikethrough'));
    setIsCode(selection.hasFormat('code'));

    // Check if link
    if (node) {
      const parent = node.getParent();
      setIsLink($isLinkNode(node) || $isLinkNode(parent));
    }

    // Position the toolbar
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0) {
      setIsVisible(false);
      return;
    }

    const range = nativeSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setIsVisible(false);
      return;
    }

    const toolbarWidth = 320;
    const toolbarHeight = 40;
    let top = rect.top - toolbarHeight - 8 + window.scrollY;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2 + window.scrollX;

    // Keep within viewport
    if (top < 0) {
      top = rect.bottom + 8 + window.scrollY;
    }
    if (left < 8) left = 8;
    if (left + toolbarWidth > window.innerWidth - 8) {
      left = window.innerWidth - toolbarWidth - 8;
    }

    setPosition({ top, left });
    setIsVisible(true);
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, updateToolbar]);

  // Hide on scroll
  useEffect(() => {
    const handleScroll = () => setIsVisible(false);
    document.addEventListener('scroll', handleScroll, { capture: true });
    return () => document.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  const formatText = useCallback(
    (format: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code') => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const toggleLink = useCallback(() => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://');
    }
  }, [editor, isLink]);

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
      style={{
        top: position.top,
        left: position.left,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
    >
      <ToolbarButton
        active={isBold}
        onClick={() => formatText('bold')}
        title="加粗 (⌘B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        active={isItalic}
        onClick={() => formatText('italic')}
        title="斜体 (⌘I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        active={isUnderline}
        onClick={() => formatText('underline')}
        title="下划线 (⌘U)"
      >
        <Underline className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        active={isStrikethrough}
        onClick={() => formatText('strikethrough')}
        title="删除线"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        active={isCode}
        onClick={() => formatText('code')}
        title="行内代码"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-0.5" />
      <ToolbarButton
        active={isLink}
        onClick={toggleLink}
        title="链接"
      >
        <Link className="w-4 h-4" />
      </ToolbarButton>
    </div>,
    document.body,
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-sm transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
