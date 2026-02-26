import { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import { mergeRegister } from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical';
import { $isImageNode } from '../nodes/ImageNode';
import { cn } from '@/lib/utils';

interface ImageComponentProps {
  src: string;
  altText: string;
  width: number | 'inherit';
  height: number | 'inherit';
  nodeKey: string;
  className?: string;
}

export default function ImageComponent({
  src,
  altText,
  width,
  height,
  nodeKey,
  className,
}: ImageComponentProps) {
  const [editor] = useLexicalComposerContext();
  const imageRef = useRef<HTMLImageElement>(null);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const [, setIsResizing] = useState(false);
  const [imageSize, setImageSize] = useState<{
    width: number | 'inherit';
    height: number | 'inherit';
  }>({ width, height });

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        editor.update(() => {
          const node = $getNodeByKey(nodeKey);
          if ($isImageNode(node)) {
            node.remove();
          }
        });
      }
      return false;
    },
    [editor, isSelected, nodeKey],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (event) => {
          if (imageRef.current && imageRef.current.contains(event.target as Node)) {
            if (!event.shiftKey) {
              clearSelection();
            }
            setSelected(true);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
    );
  }, [clearSelection, editor, isSelected, nodeKey, onDelete, setSelected]);

  const onResizeStart = useCallback(
    (direction: 'e' | 'w' | 'se') => {
      const image = imageRef.current;
      if (!image) return;

      setIsResizing(true);
      const startWidth = image.offsetWidth;

      const onMouseMove = (e: MouseEvent) => {
        let newWidth: number;
        if (direction === 'w') {
          newWidth = Math.max(100, startWidth - (e.movementX));
        } else {
          newWidth = Math.max(100, startWidth + (e.movementX));
        }
        const ratio = image.naturalHeight / image.naturalWidth;
        const newHeight = Math.round(newWidth * ratio);
        setImageSize({ width: newWidth, height: newHeight });
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const currentImage = imageRef.current;
        if (currentImage) {
          const finalWidth = currentImage.offsetWidth;
          const ratio = currentImage.naturalHeight / currentImage.naturalWidth;
          const finalHeight = Math.round(finalWidth * ratio);
          editor.update(() => {
            const node = $getNodeByKey(nodeKey);
            if ($isImageNode(node)) {
              node.setWidthAndHeight(finalWidth, finalHeight);
            }
          });
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [editor, nodeKey],
  );

  return (
    <div className="relative inline-block max-w-full my-2" draggable={false}>
      <img
        ref={imageRef}
        src={src}
        alt={altText}
        className={cn(
          'block max-w-full h-auto rounded-lg border border-border transition-[filter] duration-100',
          isSelected && 'ring-2 ring-primary ring-offset-2',
          className,
        )}
        style={{
          width: imageSize.width !== 'inherit' ? imageSize.width : undefined,
          height: imageSize.height !== 'inherit' ? imageSize.height : undefined,
        }}
        draggable={false}
      />
      {isSelected && (
        <>
          {/* Right resize handle */}
          <div
            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-primary rounded-sm cursor-e-resize opacity-80 hover:opacity-100"
            onMouseDown={(e) => {
              e.preventDefault();
              onResizeStart('e');
            }}
          />
          {/* Left resize handle */}
          <div
            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-8 bg-primary rounded-sm cursor-w-resize opacity-80 hover:opacity-100"
            onMouseDown={(e) => {
              e.preventDefault();
              onResizeStart('w');
            }}
          />
          {/* Bottom-right resize handle */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-primary rounded-sm cursor-se-resize opacity-80 hover:opacity-100"
            onMouseDown={(e) => {
              e.preventDefault();
              onResizeStart('se');
            }}
          />
        </>
      )}
    </div>
  );
}
