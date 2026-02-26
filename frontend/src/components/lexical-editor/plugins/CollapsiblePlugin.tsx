import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW } from 'lexical';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import {
  INSERT_COLLAPSIBLE_COMMAND,
  TOGGLE_COLLAPSIBLE_COMMAND,
  $createCollapsibleWithChildren,
  $isCollapsibleContainerNode,
} from '../nodes/CollapsibleNodes';
import { $getNodeByKey } from 'lexical';

export function CollapsiblePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregisterInsert = editor.registerCommand(
      INSERT_COLLAPSIBLE_COMMAND,
      () => {
        editor.update(() => {
          const container = $createCollapsibleWithChildren();
          $insertNodeToNearestRoot(container);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterToggle = editor.registerCommand(
      TOGGLE_COLLAPSIBLE_COMMAND,
      (key: string) => {
        editor.update(() => {
          const node = $getNodeByKey(key);
          if ($isCollapsibleContainerNode(node)) {
            node.toggleOpen();
          }
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterInsert();
      unregisterToggle();
    };
  }, [editor]);

  return null;
}
