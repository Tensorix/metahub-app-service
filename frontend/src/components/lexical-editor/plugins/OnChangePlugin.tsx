import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface OnChangePluginProps {
  onChange: (jsonString: string) => void;
}

export function OnChangePlugin({ onChange }: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // Skip if nothing actually changed
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      const json = editorState.toJSON();
      onChange(JSON.stringify(json));
    });
  }, [editor, onChange]);

  return null;
}
