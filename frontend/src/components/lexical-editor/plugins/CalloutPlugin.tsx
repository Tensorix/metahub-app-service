import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { COMMAND_PRIORITY_LOW } from 'lexical';
import { $insertNodeToNearestRoot } from '@lexical/utils';
import {
  INSERT_CALLOUT_COMMAND,
  $createCalloutNode,
  type CalloutType,
} from '../nodes/CalloutNode';

export function CalloutPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_CALLOUT_COMMAND,
      (calloutType: CalloutType) => {
        editor.update(() => {
          const node = $createCalloutNode(calloutType);
          $insertNodeToNearestRoot(node);
        });
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  return null;
}
