import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical';
import { Suspense, lazy } from 'react';

const ImageComponent = lazy(() => import('../ui/ImageComponent'));

export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
    width: number | 'inherit';
    height: number | 'inherit';
  },
  SerializedLexicalNode
>;

export const INSERT_IMAGE_COMMAND = createCommand<{
  src: string;
  altText?: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
}>('INSERT_IMAGE_COMMAND');

function $convertImageElement(domNode: Node): DOMConversionOutput | null {
  const img = domNode as HTMLImageElement;
  if (img.src) {
    const node = $createImageNode({
      src: img.src,
      altText: img.alt || '',
      width: img.width || 'inherit',
      height: img.height || 'inherit',
    });
    return { node };
  }
  return null;
}

export class ImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __altText: string;
  __width: number | 'inherit';
  __height: number | 'inherit';

  static getType(): string {
    return 'image';
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      altText: serializedNode.altText,
      width: serializedNode.width,
      height: serializedNode.height,
    });
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    };
  }

  constructor(
    src: string,
    altText: string,
    width?: number | 'inherit',
    height?: number | 'inherit',
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width || 'inherit';
    this.__height = height || 'inherit';
  }

  exportJSON(): SerializedImageNode {
    return {
      type: 'image',
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
    };
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement('img');
    img.setAttribute('src', this.__src);
    img.setAttribute('alt', this.__altText);
    if (this.__width !== 'inherit') {
      img.setAttribute('width', String(this.__width));
    }
    if (this.__height !== 'inherit') {
      img.setAttribute('height', String(this.__height));
    }
    return { element: img };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    const theme = config.theme;
    const className = theme.image;
    if (className) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  setSrc(src: string): void {
    const writable = this.getWritable();
    writable.__src = src;
  }

  setWidthAndHeight(width: number | 'inherit', height: number | 'inherit'): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    return (
      <Suspense fallback={null}>
        <ImageComponent
          src={this.__src}
          altText={this.__altText}
          width={this.__width}
          height={this.__height}
          nodeKey={this.__key}
          className={config.theme.image}
        />
      </Suspense>
    );
  }
}

export function $createImageNode({
  src,
  altText = '',
  width,
  height,
}: {
  src: string;
  altText?: string;
  width?: number | 'inherit';
  height?: number | 'inherit';
}): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, altText, width, height));
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
