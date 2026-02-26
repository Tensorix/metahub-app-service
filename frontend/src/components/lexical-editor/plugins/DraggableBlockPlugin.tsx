import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $getRoot,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  DRAGOVER_COMMAND,
} from 'lexical';
import { GripVertical } from 'lucide-react';

const DRAG_DATA_FORMAT = 'application/x-lexical-drag-block';

function getBlockElement(
  _anchorElem: HTMLElement,
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  event: MouseEvent,
): HTMLElement | null {
  const editorDOM = editor.getRootElement();
  if (!editorDOM) return null;

  let blockElem: HTMLElement | null = null;

  // Walk through root children to find the nearest block element
  editor.getEditorState().read(() => {
    const root = $getRoot();
    const children = root.getChildren();

    for (const child of children) {
      const key = child.getKey();
      const elem = editor.getElementByKey(key);
      if (!elem) continue;

      const rect = elem.getBoundingClientRect();
      if (event.clientY >= rect.top - 4 && event.clientY <= rect.bottom + 4) {
        blockElem = elem;
        break;
      }
    }
  });

  return blockElem;
}

export function DraggableBlockPlugin() {
  const [editor] = useLexicalComposerContext();
  const [targetBlockElem, setTargetBlockElem] = useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggedNodeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const editorRoot = editor.getRootElement();
    if (!editorRoot) return;

    const parentElement = editorRoot.parentElement;
    if (!parentElement) return;

    function handleMouseMove(event: MouseEvent) {
      if (isDragging) return;
      const editorRoot = editor.getRootElement();
      if (!editorRoot || !parentElement) return;

      const { left: editorLeft } = editorRoot.getBoundingClientRect();
      // Only show handle when mouse is near the left edge
      if (event.clientX > editorLeft + 60) {
        setTargetBlockElem(null);
        return;
      }

      const blockElem = getBlockElement(parentElement, editor, event);
      setTargetBlockElem(blockElem);
    }

    function handleMouseLeave() {
      if (!isDragging) {
        setTargetBlockElem(null);
      }
    }

    parentElement.addEventListener('mousemove', handleMouseMove);
    parentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      parentElement.removeEventListener('mousemove', handleMouseMove);
      parentElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor, isDragging]);

  // Handle drag over
  useEffect(() => {
    return editor.registerCommand(
      DRAGOVER_COMMAND,
      (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes(DRAG_DATA_FORMAT)) return false;
        event.preventDefault();

        const editorRoot = editor.getRootElement();
        if (!editorRoot) return false;

        // Show drop line
        let closestElem: HTMLElement | null = null;
        let closestDistance = Infinity;
        let insertBefore = true;

        editor.getEditorState().read(() => {
          const root = $getRoot();
          for (const child of root.getChildren()) {
            const elem = editor.getElementByKey(child.getKey());
            if (!elem) continue;
            const rect = elem.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const distance = Math.abs(event.clientY - midY);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestElem = elem;
              insertBefore = event.clientY < midY;
            }
          }
        });

        if (closestElem) {
          const rect = (closestElem as HTMLElement).getBoundingClientRect();
          const top = insertBefore ? rect.top : rect.bottom;
          setDropLine({
            top: top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
          });
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  // Handle drop
  useEffect(() => {
    return editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) => {
        const data = event.dataTransfer?.getData(DRAG_DATA_FORMAT);
        if (!data) return false;

        event.preventDefault();
        setDropLine(null);
        setIsDragging(false);

        const draggedKey = data;
        const editorRoot = editor.getRootElement();
        if (!editorRoot) return false;

        // Find target position
        let targetKey: string | null = null;
        let insertBefore = true;

        editor.getEditorState().read(() => {
          const root = $getRoot();
          let closestDistance = Infinity;

          for (const child of root.getChildren()) {
            const elem = editor.getElementByKey(child.getKey());
            if (!elem) continue;
            const rect = elem.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const distance = Math.abs(event.clientY - midY);
            if (distance < closestDistance) {
              closestDistance = distance;
              targetKey = child.getKey();
              insertBefore = event.clientY < midY;
            }
          }
        });

        if (targetKey && targetKey !== draggedKey) {
          editor.update(() => {
            const draggedNode = $getNodeByKey(draggedKey);
            const targetNode = $getNodeByKey(targetKey!);
            if (!draggedNode || !targetNode) return;

            draggedNode.remove();
            if (insertBefore) {
              targetNode.insertBefore(draggedNode);
            } else {
              targetNode.insertAfter(draggedNode);
            }
          });
        }

        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  const handleDragStart = (event: React.DragEvent) => {
    if (!targetBlockElem) return;

    const nodeKey = editor.getEditorState().read(() => {
      const node = $getNearestNodeFromDOMNode(targetBlockElem!);
      return node?.getKey() || null;
    });

    if (!nodeKey) return;

    event.dataTransfer.setData(DRAG_DATA_FORMAT, nodeKey);
    event.dataTransfer.effectAllowed = 'move';
    draggedNodeKeyRef.current = nodeKey;
    setIsDragging(true);

    // Set a transparent drag image
    const dragImage = document.createElement('div');
    dragImage.style.width = '1px';
    dragImage.style.height = '1px';
    dragImage.style.opacity = '0';
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => dragImage.remove(), 0);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDropLine(null);
    draggedNodeKeyRef.current = null;
  };

  // Render drag handle
  const handlePosition = targetBlockElem
    ? (() => {
        const rect = targetBlockElem.getBoundingClientRect();
        const editorRoot = editor.getRootElement();
        const editorRect = editorRoot?.getBoundingClientRect();
        return {
          top: rect.top + window.scrollY + rect.height / 2 - 12,
          left: (editorRect?.left || 0) + window.scrollX - 24,
        };
      })()
    : null;

  return (
    <>
      {targetBlockElem &&
        handlePosition &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-40 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity"
            style={{
              top: handlePosition.top,
              left: handlePosition.left,
            }}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-muted">
              <GripVertical className="w-4 h-4" />
            </div>
          </div>,
          document.body,
        )}
      {dropLine &&
        createPortal(
          <div
            className="fixed z-50 h-0.5 bg-primary pointer-events-none"
            style={{
              top: dropLine.top,
              left: dropLine.left,
              width: dropLine.width,
            }}
          />,
          document.body,
        )}
    </>
  );
}
