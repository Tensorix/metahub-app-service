import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  ElementNode,
  createCommand,
} from 'lexical';

export type CalloutType = 'info' | 'warning' | 'error' | 'success' | 'note';

const CALLOUT_ICONS: Record<CalloutType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
  note: '📝',
};

export type SerializedCalloutNode = Spread<
  {
    calloutType: CalloutType;
  },
  SerializedElementNode
>;

export const INSERT_CALLOUT_COMMAND = createCommand<CalloutType>('INSERT_CALLOUT_COMMAND');

function $convertCalloutElement(domNode: Node): DOMConversionOutput | null {
  const element = domNode as HTMLElement;
  const type = (element.getAttribute('data-callout-type') || 'info') as CalloutType;
  const node = $createCalloutNode(type);
  return { node };
}

export class CalloutNode extends ElementNode {
  __calloutType: CalloutType;

  static getType(): string {
    return 'callout';
  }

  static clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__calloutType, node.__key);
  }

  static importJSON(serializedNode: SerializedCalloutNode): CalloutNode {
    return $createCalloutNode(serializedNode.calloutType);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (domNode.hasAttribute('data-callout-type')) {
          return {
            conversion: $convertCalloutElement,
            priority: 1,
          };
        }
        return null;
      },
    };
  }

  constructor(calloutType: CalloutType = 'info', key?: NodeKey) {
    super(key);
    this.__calloutType = calloutType;
  }

  exportJSON(): SerializedCalloutNode {
    return {
      ...super.exportJSON(),
      type: 'callout',
      calloutType: this.__calloutType,
    };
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('div');
    el.setAttribute('data-callout-type', this.__calloutType);
    el.className = `callout callout-${this.__calloutType}`;
    return { element: el };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement('div');
    dom.setAttribute('data-callout-type', this.__calloutType);

    // Apply theme classes
    const themeClasses = (config.theme as Record<string, unknown>).callout as string | undefined;
    const typeClasses = (
      (config.theme as Record<string, unknown>).calloutTypes as Record<string, string> | undefined
    )?.[this.__calloutType];

    if (themeClasses) dom.className = themeClasses;
    if (typeClasses) dom.className += ' ' + typeClasses;

    // Add icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'select-none text-lg shrink-0 mt-0.5';
    iconSpan.textContent = CALLOUT_ICONS[this.__calloutType];
    iconSpan.contentEditable = 'false';
    dom.prepend(iconSpan);

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'flex-1 min-w-0';
    dom.appendChild(content);

    return dom;
  }

  updateDOM(prevNode: CalloutNode): boolean {
    if (prevNode.__calloutType !== this.__calloutType) {
      return true; // Re-create DOM
    }
    return false;
  }

  getCalloutType(): CalloutType {
    return this.__calloutType;
  }

  setCalloutType(type: CalloutType): void {
    const writable = this.getWritable();
    writable.__calloutType = type;
  }

  // Content is rendered in the second child (content wrapper)
  getContentDOMNode(dom: HTMLElement): HTMLElement | null {
    return dom.querySelector('div') || dom;
  }

  // Override to make children render into the content wrapper
  isContentRequired(): boolean {
    return true;
  }
}

export function $createCalloutNode(calloutType: CalloutType = 'info'): CalloutNode {
  const node = new CalloutNode(calloutType);
  node.append($createParagraphNode());
  return $applyNodeReplacement(node);
}

export function $isCalloutNode(
  node: LexicalNode | null | undefined,
): node is CalloutNode {
  return node instanceof CalloutNode;
}
