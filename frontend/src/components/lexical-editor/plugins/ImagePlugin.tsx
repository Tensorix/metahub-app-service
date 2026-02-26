import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  DROP_COMMAND,
} from 'lexical';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import {
  INSERT_IMAGE_COMMAND,
  $createImageNode,
  $isImageNode,
} from '../nodes/ImageNode';

interface ImagePluginProps {
  onUploadImage?: (file: File) => Promise<string>;
}

export function ImagePlugin({ onUploadImage }: ImagePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterInsert = editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          const imageNode = $createImageNode({
            src: payload.src,
            altText: payload.altText || '',
            width: payload.width,
            height: payload.height,
          });
          $insertNodeToNearestRoot(imageNode);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const files = event.clipboardData?.files;
        if (!files || files.length === 0 || !onUploadImage) return false;

        const imageFiles = Array.from(files).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFiles.length === 0) return false;

        event.preventDefault();
        for (const file of imageFiles) {
          handleImageUpload(file);
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    const unregisterDrop = editor.registerCommand(
      DROP_COMMAND,
      (event: DragEvent) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0 || !onUploadImage) return false;

        const imageFiles = Array.from(files).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFiles.length === 0) return false;

        event.preventDefault();
        for (const file of imageFiles) {
          handleImageUpload(file);
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    function handleImageUpload(file: File) {
      if (!onUploadImage) return;

      // Insert placeholder node immediately
      let placeholderKey: string | null = null;
      editor.update(() => {
        const placeholderNode = $createImageNode({
          src: '', // Will be replaced
          altText: file.name,
        });
        $insertNodeToNearestRoot(placeholderNode);
        placeholderKey = placeholderNode.getKey();
      });

      // Create a temporary object URL for preview
      const objectUrl = URL.createObjectURL(file);
      if (placeholderKey) {
        editor.update(() => {
          const node = $getNodeByKey(placeholderKey!);
          if ($isImageNode(node)) {
            node.setSrc(objectUrl);
          }
        });
      }

      // Upload
      onUploadImage(file)
        .then((url) => {
          URL.revokeObjectURL(objectUrl);
          if (placeholderKey) {
            editor.update(() => {
              const node = $getNodeByKey(placeholderKey!);
              if ($isImageNode(node)) {
                node.setSrc(url);
              }
            });
          }
        })
        .catch((err) => {
          console.error('Image upload failed:', err);
          URL.revokeObjectURL(objectUrl);
          // Remove the placeholder on failure
          if (placeholderKey) {
            editor.update(() => {
              const node = $getNodeByKey(placeholderKey!);
              if ($isImageNode(node)) {
                node.remove();
              }
            });
          }
        });
    }

    return () => {
      unregisterInsert();
      unregisterPaste();
      unregisterDrop();
    };
  }, [editor, onUploadImage]);

  return null;
}
