import { useCallback, useMemo, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createParagraphNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { $createCodeNode } from '@lexical/code';
import {
  Heading1,
  Heading2,
  Heading3,
  Type,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Image,
  Table,
  Minus,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { INSERT_IMAGE_COMMAND } from '../nodes/ImageNode';
import { INSERT_CALLOUT_COMMAND } from '../nodes/CalloutNode';
import { INSERT_COLLAPSIBLE_COMMAND } from '../nodes/CollapsibleNodes';

class SlashCommandOption extends MenuOption {
  title: string;
  description: string;
  icon: JSX.Element;
  keywords: string[];
  onSelect: (editor: ReturnType<typeof useLexicalComposerContext>[0]) => void;

  constructor(
    title: string,
    options: {
      description: string;
      icon: JSX.Element;
      keywords?: string[];
      onSelect: (editor: ReturnType<typeof useLexicalComposerContext>[0]) => void;
    },
  ) {
    super(title);
    this.title = title;
    this.description = options.description;
    this.icon = options.icon;
    this.keywords = options.keywords || [];
    this.onSelect = options.onSelect;
  }
}

function getSlashCommandOptions(
  onUploadImage?: (file: File) => Promise<string>,
): SlashCommandOption[] {
  return [
    new SlashCommandOption('文本', {
      description: '普通文本段落',
      icon: <Type className="w-4 h-4" />,
      keywords: ['text', 'paragraph', 'p', '文本', '段落'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createParagraphNode());
          }
        });
      },
    }),
    new SlashCommandOption('标题 1', {
      description: '大标题',
      icon: <Heading1 className="w-4 h-4" />,
      keywords: ['heading', 'h1', '标题', '大标题'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode('h1'));
          }
        });
      },
    }),
    new SlashCommandOption('标题 2', {
      description: '中标题',
      icon: <Heading2 className="w-4 h-4" />,
      keywords: ['heading', 'h2', '标题', '中标题'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode('h2'));
          }
        });
      },
    }),
    new SlashCommandOption('标题 3', {
      description: '小标题',
      icon: <Heading3 className="w-4 h-4" />,
      keywords: ['heading', 'h3', '标题', '小标题'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode('h3'));
          }
        });
      },
    }),
    new SlashCommandOption('无序列表', {
      description: '项目符号列表',
      icon: <List className="w-4 h-4" />,
      keywords: ['bullet', 'list', 'ul', '无序', '列表'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      },
    }),
    new SlashCommandOption('有序列表', {
      description: '编号列表',
      icon: <ListOrdered className="w-4 h-4" />,
      keywords: ['numbered', 'list', 'ol', '有序', '编号'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      },
    }),
    new SlashCommandOption('待办列表', {
      description: '可勾选的任务列表',
      icon: <CheckSquare className="w-4 h-4" />,
      keywords: ['check', 'todo', 'task', '待办', '任务'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      },
    }),
    new SlashCommandOption('引用', {
      description: '引用段落',
      icon: <Quote className="w-4 h-4" />,
      keywords: ['quote', 'blockquote', '引用'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createQuoteNode());
          }
        });
      },
    }),
    new SlashCommandOption('代码块', {
      description: '带语法高亮的代码',
      icon: <Code className="w-4 h-4" />,
      keywords: ['code', 'codeblock', '代码'],
      onSelect: (editor) => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createCodeNode());
          }
        });
      },
    }),
    new SlashCommandOption('图片', {
      description: '上传或插入图片',
      icon: <Image className="w-4 h-4" />,
      keywords: ['image', 'photo', 'picture', '图片', '照片'],
      onSelect: (editor) => {
        // Open file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) return;
          if (onUploadImage) {
            onUploadImage(file).then((url) => {
              editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                src: url,
                altText: file.name,
              });
            });
          }
        };
        input.click();
      },
    }),
    new SlashCommandOption('表格', {
      description: '插入表格',
      icon: <Table className="w-4 h-4" />,
      keywords: ['table', '表格'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: '3',
          rows: '3',
          includeHeaders: true,
        });
      },
    }),
    new SlashCommandOption('提示块', {
      description: '彩色提示信息块',
      icon: <AlertCircle className="w-4 h-4" />,
      keywords: ['callout', 'alert', 'info', 'warning', '提示', '警告'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'info');
      },
    }),
    new SlashCommandOption('折叠块', {
      description: '可展开/折叠的内容',
      icon: <ChevronRight className="w-4 h-4" />,
      keywords: ['toggle', 'collapsible', 'collapse', '折叠', '展开'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_COLLAPSIBLE_COMMAND, undefined);
      },
    }),
    new SlashCommandOption('分割线', {
      description: '水平分割线',
      icon: <Minus className="w-4 h-4" />,
      keywords: ['divider', 'hr', 'rule', '分割', '分隔'],
      onSelect: (editor) => {
        editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
      },
    }),
  ];
}

interface SlashCommandPluginProps {
  onUploadImage?: (file: File) => Promise<string>;
}

export function SlashCommandPlugin({ onUploadImage }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  });

  const options = useMemo(() => {
    const baseOptions = getSlashCommandOptions(onUploadImage);
    if (queryString === null || queryString === '') return baseOptions;

    const query = queryString.toLowerCase();
    return baseOptions.filter((option) => {
      return (
        option.title.toLowerCase().includes(query) ||
        option.keywords.some((kw) => kw.toLowerCase().includes(query))
      );
    });
  }, [queryString, onUploadImage]);

  const onSelectOption = useCallback(
    (
      selectedOption: SlashCommandOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        nodeToRemove?.remove();
      });
      selectedOption.onSelect(editor);
      closeMenu();
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        if (!anchorElementRef.current || options.length === 0) return null;
        return createPortal(
          <div className="z-50 min-w-[220px] max-h-[330px] overflow-y-auto rounded-md border border-border bg-popover px-1 py-2 shadow-md animate-in fade-in-0 zoom-in-95">
            {options.map((option, i) => (
              <div
                key={option.key}
                ref={(el) => option.setRefElement(el)}
                role="option"
                aria-selected={selectedIndex === i}
                tabIndex={-1}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm cursor-pointer ${
                  selectedIndex === i
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => {
                  setHighlightedIndex(i);
                  selectOptionAndCleanUp(option);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                  {option.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{option.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {option.description}
                  </p>
                </div>
              </div>
            ))}
          </div>,
          anchorElementRef.current,
        );
      }}
    />
  );
}
