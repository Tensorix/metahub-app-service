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
  $createTextNode,
  ElementNode,
  createCommand,
} from 'lexical';

export const INSERT_COLLAPSIBLE_COMMAND = createCommand<void>('INSERT_COLLAPSIBLE_COMMAND');
export const TOGGLE_COLLAPSIBLE_COMMAND = createCommand<NodeKey>('TOGGLE_COLLAPSIBLE_COMMAND');

// ─── Container ───────────────────────────────────────────────────────────────

export type SerializedCollapsibleContainerNode = Spread<
  { open: boolean },
  SerializedElementNode
>;

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  static getType(): string {
    return 'collapsible-container';
  }

  static clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  static importJSON(
    serializedNode: SerializedCollapsibleContainerNode,
  ): CollapsibleContainerNode {
    const node = new CollapsibleContainerNode(serializedNode.open);
    return $applyNodeReplacement(node);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      details: () => ({
        conversion: (domNode: Node): DOMConversionOutput | null => {
          const el = domNode as HTMLDetailsElement;
          const node = new CollapsibleContainerNode(el.open);
          return { node };
        },
        priority: 1,
      }),
    };
  }

  constructor(open: boolean = true, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  exportJSON(): SerializedCollapsibleContainerNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-container',
      open: this.__open,
    };
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('details');
    if (this.__open) el.open = true;
    return { element: el };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement('details');
    dom.className = 'my-3 rounded-md border border-border bg-card';
    if (this.__open) dom.open = true;
    dom.addEventListener('toggle', () => {
      // Sync DOM toggle state back to node
    });
    return dom;
  }

  updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLDetailsElement): boolean {
    if (prevNode.__open !== this.__open) {
      dom.open = this.__open;
    }
    return false;
  }

  getOpen(): boolean {
    return this.__open;
  }

  toggleOpen(): void {
    const writable = this.getWritable();
    writable.__open = !writable.__open;
  }

  setOpen(open: boolean): void {
    const writable = this.getWritable();
    writable.__open = open;
  }
}

// ─── Title ───────────────────────────────────────────────────────────────────

export class CollapsibleTitleNode extends ElementNode {
  static getType(): string {
    return 'collapsible-title';
  }

  static clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key);
  }

  static importJSON(): CollapsibleTitleNode {
    return $applyNodeReplacement(new CollapsibleTitleNode());
  }

  static importDOM(): DOMConversionMap | null {
    return {
      summary: () => ({
        conversion: (): DOMConversionOutput | null => {
          return { node: new CollapsibleTitleNode() };
        },
        priority: 1,
      }),
    };
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-title',
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('summary') };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('summary');
    dom.className = 'cursor-pointer select-none px-4 py-2 font-medium hover:bg-muted/50 list-none';
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  // Prevent collapsible title from being deleted when empty
  collapseAtStart(): boolean {
    return false;
  }
}

// ─── Content ─────────────────────────────────────────────────────────────────

export class CollapsibleContentNode extends ElementNode {
  static getType(): string {
    return 'collapsible-content';
  }

  static clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }

  static importJSON(): CollapsibleContentNode {
    return $applyNodeReplacement(new CollapsibleContentNode());
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  exportJSON(): SerializedElementNode {
    return {
      ...super.exportJSON(),
      type: 'collapsible-content',
    };
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('div') };
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'px-4 pb-3';
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function $createCollapsibleContainerNode(
  open: boolean = true,
): CollapsibleContainerNode {
  return $applyNodeReplacement(new CollapsibleContainerNode(open));
}

export function $createCollapsibleWithChildren(): CollapsibleContainerNode {
  const container = $createCollapsibleContainerNode(true);
  const title = $applyNodeReplacement(new CollapsibleTitleNode());
  title.append($createTextNode('折叠块'));
  const content = $applyNodeReplacement(new CollapsibleContentNode());
  content.append($createParagraphNode());
  container.append(title, content);
  return container;
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode;
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode;
}

export function $isCollapsibleContentNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleContentNode {
  return node instanceof CollapsibleContentNode;
}
