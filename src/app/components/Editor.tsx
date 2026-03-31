import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { Block } from './types';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SelectionToolbar } from './SelectionToolbar';
import { PagePicker } from './PagePicker';
import { InlineAgentComposer } from './InlineAgentComposer';
import { InlineAudioRecorder } from './InlineAudioRecorder';
import type { AudioCaptureMode, AudioTranscriptionMode } from '../../shared/ai';
import { hasPrimaryModifier } from '../lib/platform';

interface VoiceRecorderState {
  pageId: string | null
  blockId: string | null
  captureMode: AudioCaptureMode
  deviceLabel: string
  transcriptionMode: AudioTranscriptionMode
  isRecording: boolean
  isTranscribing: boolean
  elapsedSeconds: number
  error: string | null
}

interface VoiceRecorderStopResult {
  pageId: string | null
  blockId: string | null
  nextContent: string | null
}

export interface EditorProps {
  pageId: string;
  pageTitle: string;
  blocks: Block[];
  historyFocusRequest?: { pageId: string; blockId: string | null; token: number } | null;
  voiceRecorderState: VoiceRecorderState;
  onTitleChange: (title: string) => void;
  onBlocksChange: (blocks: Block[]) => void;
  onActiveBlockChange?: (blockId: string | null) => void;
  onNavigate: (id: string) => void;
  onOpenVoiceRecorder: (pageId: string, blockId: string) => void;
  onStartVoiceRecorder: () => Promise<void>;
  onStopVoiceRecorder: () => Promise<VoiceRecorderStopResult | null>;
  onCancelVoiceRecorder: () => Promise<{ pageId: string | null; blockId: string | null } | null>;
  allPages: { id: string; title: string }[];
}

// --- DEEP TREE UTILITY FUNCTIONS ---

const findBlockDeep = (blocksList: Block[], id: string): Block | null => {
  for (const b of blocksList) {
    if (b.id === id) return b;
    if (b.children) {
      const found = findBlockDeep(b.children, id);
      if (found) return found;
    }
  }
  return null;
};

const removeBlockDeep = (blocksList: Block[], id: string): Block[] => {
  return blocksList
    .filter((b) => b.id !== id)
    .map((b) => {
      if (b.children) {
        return { ...b, children: removeBlockDeep(b.children, id) };
      }
      return b;
    });
};

const updateBlockDeep = (blocksList: Block[], id: string, updater: (b: Block) => Block): Block[] => {
  return blocksList.map((b) => {
    if (b.id === id) return updater(b);
    if (b.children) return { ...b, children: updateBlockDeep(b.children, id, updater) };
    return b;
  });
};

const insertAfterDeep = (blocksList: Block[], targetId: string, newBlocks: Block[]): Block[] => {
  const result: Block[] = [];
  for (const b of blocksList) {
    result.push(b);
    if (b.id === targetId) {
      result.push(...newBlocks);
    } else if (b.children) {
      b.children = insertAfterDeep(b.children, targetId, newBlocks);
    }
  }
  return result;
};

const insertBeforeDeep = (blocksList: Block[], targetId: string, newBlocks: Block[]): Block[] => {
  const result: Block[] = [];
  for (const b of blocksList) {
    if (b.id === targetId) {
      result.push(...newBlocks);
    }
    result.push(b);
    if (b.children) {
      b.children = insertBeforeDeep(b.children, targetId, newBlocks);
    }
  }
  return result;
};

const replaceBlockDeep = (blocksList: Block[], targetId: string, newBlock: Block): Block[] => {
  return blocksList.map((b) => {
    if (b.id === targetId) return newBlock;
    if (b.children) return { ...b, children: replaceBlockDeep(b.children, targetId, newBlock) };
    return b;
  });
};

const swapBlocksDeep = (blocksList: Block[], firstId: string, secondId: string): Block[] => {
  const firstBlock = findBlockDeep(blocksList, firstId);
  const secondBlock = findBlockDeep(blocksList, secondId);

  if (!firstBlock || !secondBlock) {
    return blocksList;
  }

  const replacements = new Map<string, Block>([
    [firstId, secondBlock],
    [secondId, firstBlock],
  ]);

  const replaceBlocks = (list: Block[]): Block[] =>
    list.map((block) => {
      const replacement = replacements.get(block.id);

      if (replacement) {
        return replacement;
      }

      if (block.children) {
        return { ...block, children: replaceBlocks(block.children) };
      }

      return block;
    });

  return replaceBlocks(blocksList);
};

const isInsideColumnGroup = (blocksList: Block[], id: string): boolean => {
  for (const b of blocksList) {
    if (b.type === 'column_group') {
      if (b.id === id || findBlockDeep(b.children || [], id)) return true;
    } else if (b.children) {
      if (isInsideColumnGroup(b.children, id)) return true;
    }
  }
  return false;
};

// --- NEW NOTION-STYLE LOGIC UTILS ---

// 1. Flatten Tree: Gets all editable text blocks in visual order so backspace jumps correctly
const getFlatBlocks = (blocksList: Block[]): Block[] => {
  return blocksList.reduce((acc: Block[], b) => {
    if (b.type === 'column_group' || b.type === 'column') {
      return [...acc, ...getFlatBlocks(b.children || [])];
    }
    return [...acc, b];
  }, []);
};

// 2. Clean Tree: Dissolves empty columns and redistributes width
const cleanTree = (blocksList: Block[]): Block[] => {
  let result: Block[] = [];
  for (const b of blocksList) {
    if (b.type === 'column_group') {
      // First clean the children columns
      const cleanedCols = cleanTree(b.children || []).filter(col => col.children && col.children.length > 0);

      if (cleanedCols.length === 0) {
        continue; // Group is totally empty, dissolve it
      } else if (cleanedCols.length === 1) {
        // Only 1 column left, unwrap it to normal blocks
        result.push(...(cleanedCols[0].children || []));
      } else {
        // Recalculate widths so remaining columns fill 100%
        const totalWidth = cleanedCols.reduce((sum, col) => sum + parseFloat(col.width || '0'), 0);
        const normalizedCols = cleanedCols.map(col => ({
          ...col,
          width: `${(parseFloat(col.width || '0') / totalWidth) * 100}%`
        }));
        result.push({ ...b, children: normalizedCols });
      }
    } else if (b.type === 'column') {
      result.push({ ...b, children: cleanTree(b.children || []) });
    } else {
      result.push(b);
    }
  }
  return result;
};

const createEmptyTextBlock = (): Block => ({
  id: Date.now().toString(),
  type: 'text',
  content: '',
});

interface GhostSuggestionState {
  blockId: string
  beforeText: string
  afterText: string
  suggestion: string
  isLoading: boolean
}

interface GhostOverlayState {
  prefixText: string
  afterText: string
  remainingText: string
  isLoading: boolean
}

interface GhostSuggestionMatch {
  typedSuggestion: string
  matchesSuggestion: boolean
  remainingText: string
}

interface InlineAgentState {
  blockId: string | null
  prompt: string
  isRunning: boolean
  requestId: string | null
  actionMode: 'append' | 'replace'
  baseContent: string
  previewContent: string
  previewType: Block['type'] | null
  insertsBelowBlock: boolean
  error: string | null
}

const GHOST_SUPPORTED_TYPES = new Set<Block['type']>([
  'text',
  'h1',
  'h2',
  'h3',
  'list',
  'numbered',
  'checklist',
  'quote',
  'code',
])

const INLINE_AGENT_CODE_PROMPT_PATTERN =
  /\b(code|coding|function|typescript|javascript|js|ts|python|java|c\+\+|c#|html|css|sql|regex|query|script|algorithm|component|react|api|json|yaml|xml|bash|shell|terminal|debug|bug|refactor|implement)\b/i

const createDefaultInlineAgentState = (): InlineAgentState => ({
  blockId: null,
  prompt: '',
  isRunning: false,
  requestId: null,
  actionMode: 'append',
  baseContent: '',
  previewContent: '',
  previewType: null,
  insertsBelowBlock: false,
  error: null,
})

const createInlineAgentRequestId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const INLINE_AGENT_REPLACE_PROMPT_PATTERN =
  /\b(replace|overwrite|rewrite|refactor|fix|update|modify|change|convert|transform|turn\b.*\binto|edit)\b/i

const inferInlineAgentTargetBlockType = (
  prompt: string,
  currentType: Block['type']
): Block['type'] => {
  if (INLINE_AGENT_CODE_PROMPT_PATTERN.test(prompt)) {
    return 'code'
  }

  if (/\b(heading|headline|title)\b/i.test(prompt)) {
    return currentType === 'h2' || currentType === 'h3' ? currentType : 'h1'
  }

  if (/\bquote\b/i.test(prompt)) {
    return 'quote'
  }

  if (currentType === 'divider' || currentType === 'image' || currentType === 'page_link') {
    return 'text'
  }

  return currentType === 'column' || currentType === 'column_group' ? 'text' : currentType
}

const inferInlineAgentActionMode = (
  prompt: string,
  currentType: Block['type'],
  targetType: Block['type'],
  currentContent: string
): 'append' | 'replace' => {
  if (!currentContent.trim()) {
    return 'replace'
  }

  if (INLINE_AGENT_REPLACE_PROMPT_PATTERN.test(prompt)) {
    return 'replace'
  }

  if (targetType === 'code' && currentType !== 'code') {
    return 'replace'
  }

  return 'append'
}

const getInlineAgentAppendSeparator = (
  existingContent: string,
  generatedContent: string,
  blockType: Block['type']
) => {
  if (!existingContent || !generatedContent) {
    return ''
  }

  if (/\s$/.test(existingContent) || /^\s/.test(generatedContent)) {
    return ''
  }

  if (blockType === 'code') {
    return existingContent.endsWith('\n') ? '\n' : '\n\n'
  }

  return generatedContent.includes('\n') ? '\n\n' : ' '
}

const mergeInlineAgentContent = (
  existingContent: string,
  generatedContent: string,
  blockType: Block['type'],
  actionMode: 'append' | 'replace'
) => {
  if (actionMode === 'replace') {
    return generatedContent
  }

  if (!generatedContent) {
    return existingContent
  }

  if (!existingContent) {
    return generatedContent
  }

  return `${existingContent}${getInlineAgentAppendSeparator(existingContent, generatedContent, blockType)}${generatedContent}`
}

const applyInlineAgentBlockUpdate = (
  block: Block,
  nextType: Block['type'],
  nextContent: string
): Block => ({
  ...block,
  type: nextType,
  content: nextContent,
  checked: nextType === 'checklist' ? !!block.checked : undefined,
  refId: nextType === 'page_link' ? block.refId : undefined,
})

const getGhostSuggestionMatch = (
  ghostState: GhostSuggestionState | null,
  blockId: string,
  currentValue: string
) => {
  if (!ghostState || ghostState.blockId !== blockId) {
    return null
  }

  if (currentValue.length < ghostState.beforeText.length + ghostState.afterText.length) {
    return null
  }

  if (!currentValue.startsWith(ghostState.beforeText) || !currentValue.endsWith(ghostState.afterText)) {
    return null
  }

  const typedSuggestion = currentValue.slice(
    ghostState.beforeText.length,
    currentValue.length - ghostState.afterText.length
  )

  if (ghostState.isLoading) {
    return {
      typedSuggestion,
      matchesSuggestion: typedSuggestion.length === 0,
      remainingText: '',
    }
  }

  const matchesSuggestion = ghostState.suggestion.startsWith(typedSuggestion)
  return {
    typedSuggestion,
    matchesSuggestion,
    remainingText: matchesSuggestion ? ghostState.suggestion.slice(typedSuggestion.length) : '',
  }
}

const getRemainingGhostText = (
  ghostState: GhostSuggestionState | null,
  blockId: string,
  currentValue: string
) => {
  const ghostMatch = getGhostSuggestionMatch(ghostState, blockId, currentValue)
  if (!ghostMatch || !ghostMatch.matchesSuggestion) {
    return ''
  }

  return ghostMatch.remainingText
}

const getGhostOverlayState = (
  ghostState: GhostSuggestionState | null,
  blockId: string,
  currentValue: string
): GhostOverlayState | null => {
  if (!ghostState || ghostState.blockId !== blockId) {
    return null
  }

  const ghostMatch = getGhostSuggestionMatch(ghostState, blockId, currentValue)
  if (!ghostMatch) {
    return null
  }

  if (ghostState.isLoading) {
    if (ghostMatch.typedSuggestion.length > 0) {
      return null
    }

    return {
      prefixText: ghostState.beforeText,
      afterText: ghostState.afterText,
      remainingText: '',
      isLoading: true,
    }
  }

  if (!ghostMatch.matchesSuggestion || !ghostMatch.remainingText) {
    return null
  }

  return {
    prefixText: `${ghostState.beforeText}${ghostMatch.typedSuggestion}`,
    afterText: ghostState.afterText,
    remainingText: ghostMatch.remainingText,
    isLoading: false,
  }
}

const getNextGhostWordChunk = (remainingText: string) => {
  if (!remainingText) {
    return ''
  }

  let index = 0

  while (index < remainingText.length && /\s/.test(remainingText.charAt(index))) {
    index += 1
  }

  while (index < remainingText.length && !/\s/.test(remainingText.charAt(index))) {
    index += 1
  }

  while (index < remainingText.length && /\s/.test(remainingText.charAt(index))) {
    index += 1
  }

  return remainingText.slice(0, index || remainingText.length)
}

const getNumberedListIndex = (blocksList: Block[], targetId: string): number => {
  const findIndex = (list: Block[]): number => {
    let currentIndex = 0;

    for (const block of list) {
      if (block.type === 'numbered') {
        currentIndex += 1;
        if (block.id === targetId) {
          return currentIndex;
        }
      } else {
        currentIndex = 0;
      }

      if (block.children) {
        const childIndex = findIndex(block.children);
        if (childIndex > 0) {
          return childIndex;
        }
      }
    }

    return 0;
  };

  return findIndex(blocksList);
};

const findColumnGroupIdForBlock = (blocksList: Block[], targetId: string): string | null => {
  for (const block of blocksList) {
    if (block.type === 'column_group' && findBlockDeep(block.children || [], targetId)) {
      return block.id;
    }

    if (block.children) {
      const nestedGroupId = findColumnGroupIdForBlock(block.children, targetId);
      if (nestedGroupId) {
        return nestedGroupId;
      }
    }
  }

  return null;
};

const isImageFileTransfer = (dataTransfer: DataTransfer | null) => {
  if (!dataTransfer) {
    return false;
  }

  const items = Array.from(dataTransfer.items || []);
  if (items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))) {
    return true;
  }

  return Array.from(dataTransfer.files || []).some((file) => file.type.startsWith('image/'));
};

const getImageSourceFromBlock = (block: Block | null) => {
  if (!block || block.type !== 'image') {
    return null;
  }

  const normalizedContent = block.content.trim();
  if (!normalizedContent) {
    return null;
  }

  if (/^https?:\/\//.test(normalizedContent) || normalizedContent.startsWith('data:image')) {
    return normalizedContent;
  }

  return null;
};


// --- MAIN COMPONENT ---
export function Editor({
  pageId,
  pageTitle,
  blocks,
  historyFocusRequest,
  voiceRecorderState,
  onTitleChange,
  onBlocksChange,
  onActiveBlockChange,
  onNavigate,
  onOpenVoiceRecorder,
  onStartVoiceRecorder,
  onStopVoiceRecorder,
  onCancelVoiceRecorder,
  allPages,
}: EditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [ghostState, setGhostState] = useState<GhostSuggestionState | null>(null);
  const [inlineAgentState, setInlineAgentState] = useState<InlineAgentState>(createDefaultInlineAgentState);
  
  // Drag and Drop State
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropSide, setDropSide] = useState<'top' | 'bottom' | 'left' | 'right' | 'center' | null>(null);

  // Resize State
  const [resizing, setResizing] = useState<{groupId: string, colIndex: number, startX: number, startWidths: number[]} | null>(null);
  
  const editorRef = useRef<HTMLDivElement>(null);
  const inlineAgentInputRef = useRef<HTMLInputElement>(null);
  const inlineAudioContainerRef = useRef<HTMLDivElement>(null);
  const lastFocusedBlockByPageRef = useRef<Record<string, string>>({});
  const ghostRequestIdRef = useRef(0);
  const focusTimeoutRef = useRef<number | null>(null);
  const pendingGlobalResizeAfterBlocksChangeRef = useRef(false);
  const blocksRef = useRef(blocks);
  const inlineAgentStateRef = useRef(inlineAgentState);
  const onBlocksChangeRef = useRef(onBlocksChange);
  const suppressNextPageLinkPickerRef = useRef(false);
  const lastAppliedHistoryFocusTokenRef = useRef<number | null>(null);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [
    blocks,
    onCancelVoiceRecorder,
    pageId,
    voiceRecorderState.blockId,
    voiceRecorderState.isTranscribing,
    voiceRecorderState.pageId,
  ]);

  useEffect(() => {
    inlineAgentStateRef.current = inlineAgentState;
  }, [inlineAgentState]);

  useEffect(() => {
    onBlocksChangeRef.current = onBlocksChange;
  }, [onBlocksChange]);

  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // --- RESIZE EVENT LISTENER ---
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - resizing.startX;
      const containerWidth = editorRef.current?.offsetWidth || 800; // Use editor width
      const percentChange = (dx / containerWidth) * 100;

      onBlocksChange(
        updateBlockDeep(blocks, resizing.groupId, (group) => {
          const newChildren = [...(group.children || [])];
          // Ensure columns don't shrink past 10%
          const leftWidth = Math.max(10, resizing.startWidths[resizing.colIndex] + percentChange);
          const rightWidth = Math.max(10, resizing.startWidths[resizing.colIndex + 1] - percentChange);

          newChildren[resizing.colIndex] = { ...newChildren[resizing.colIndex], width: `${leftWidth}%` };
          newChildren[resizing.colIndex + 1] = { ...newChildren[resizing.colIndex + 1], width: `${rightWidth}%` };

          return { ...group, children: newChildren };
        })
      );
    };

    const handleMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, blocks, onBlocksChange]);

  const resizeTextarea = (target: HTMLTextAreaElement) => {
    target.style.height = 'auto';
    target.style.height = target.scrollHeight + 'px';
  };

  const resizeBlockTextareaById = (id: string) => {
    const textarea = document.querySelector(`textarea[data-block-id="${id}"]`) as HTMLTextAreaElement | null;
    if (textarea) {
      resizeTextarea(textarea);
    }
  };

  const resizeVisibleTextareas = () => {
    const textareas = document.querySelectorAll('textarea[data-block-id]');
    textareas.forEach((node) => resizeTextarea(node as HTMLTextAreaElement));
  };

  const scrollBlockIntoView = (id: string) => {
    const container = editorRef.current;
    const target = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!container || !target) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const padding = 28;

    if (targetRect.bottom > containerRect.bottom - padding) {
      container.scrollTop += targetRect.bottom - containerRect.bottom + padding;
    } else if (targetRect.top < containerRect.top + padding) {
      container.scrollTop -= containerRect.top - targetRect.top + padding;
    }
  };

  const openPagePickerForBlock = (id: string) => {
    const block = findBlockDeep(blocksRef.current, id);
    if (!block || block.type !== 'page_link' || block.refId) {
      setShowPagePicker(false);
      return;
    }

    window.setTimeout(() => {
      const el = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
      if (!el) {
        return;
      }

      const rect = el.getBoundingClientRect();
      setSlashMenuPosition({
        x: rect.left,
        y: rect.bottom,
      });
      setSearchQuery('');
      setShowPagePicker(true);
    }, 40);
  };

  const rememberFocusedBlock = (id: string, options: { suppressPageLinkPicker?: boolean } = {}) => {
    lastFocusedBlockByPageRef.current[pageId] = id;
    setActiveBlockId(id);
    onActiveBlockChange?.(id);
    setGhostState((prev) => (prev?.blockId === id ? prev : null));

    const block = findBlockDeep(blocksRef.current, id);
    if (block?.type === 'page_link' && !block.refId) {
      if (options.suppressPageLinkPicker || suppressNextPageLinkPickerRef.current) {
        suppressNextPageLinkPickerRef.current = false;
        setShowPagePicker(false);
        return;
      }

      openPagePickerForBlock(id);
      return;
    }

    suppressNextPageLinkPickerRef.current = false;
    setShowPagePicker(false);
  };

  const focusBlock = (id: string, options: { suppressPageLinkPicker?: boolean } = {}) => {
  const blockRoot = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
  if (!blockRoot) return false;

  const textarea = blockRoot.tagName === 'TEXTAREA'
    ? blockRoot as HTMLTextAreaElement
    : blockRoot.querySelector(`textarea[data-block-id="${id}"]`) as HTMLTextAreaElement | null;

  const focusTarget = textarea || blockRoot;
  focusTarget.focus();
  rememberFocusedBlock(id, options);

  if (focusTarget instanceof HTMLTextAreaElement) {
    focusTarget.setSelectionRange(focusTarget.value.length, focusTarget.value.length);
  }

  return true;
};

  const scheduleFocus = (callback: () => boolean, delay: number, maxAttempts = 12) => {
    if (focusTimeoutRef.current !== null) {
      window.clearTimeout(focusTimeoutRef.current);
    }

    const runAttempt = (attempt: number) => {
      focusTimeoutRef.current = null;
      const didFocus = callback();

      if (!didFocus && attempt < maxAttempts) {
        focusTimeoutRef.current = window.setTimeout(() => {
          runAttempt(attempt + 1);
        }, 16);
      }
    };

    focusTimeoutRef.current = window.setTimeout(() => {
      runAttempt(1);
    }, delay);
  };

  const queueFocus = (id: string, delay = 10, options: { suppressPageLinkPicker?: boolean } = {}) => {
    scheduleFocus(() => focusBlock(id, options), delay);
  };

  const appendBlockToEditorEnd = () => {
    const newBlock = createEmptyTextBlock();
    onBlocksChange([...blocks, newBlock]);
    queueFocus(newBlock.id, 10);
  };

  const queueFocusSelection = (
    id: string,
    selectionStart: number,
    selectionEnd = selectionStart,
    delay = 10,
    options: { suppressPageLinkPicker?: boolean } = {}
  ) => {
    scheduleFocus(() => {
      const textarea = document.querySelector(`textarea[data-block-id="${id}"]`) as HTMLTextAreaElement | null;
      if (!textarea) {
        return false;
      }

      textarea.focus();
      rememberFocusedBlock(id, options);
      textarea.setSelectionRange(selectionStart, selectionEnd);
      return true;
    }, delay);
  };

  const commitInlineAgentResult = (blockId: string, nextType: Block['type'], nextContent: string) => {
    const updatedBlocks = updateBlockDeep(blocksRef.current, blockId, (currentBlock) =>
      applyInlineAgentBlockUpdate(currentBlock, nextType, nextContent)
    );

    void onBlocksChangeRef.current(updatedBlocks);
    queueFocusSelection(blockId, nextContent.length, nextContent.length, 20);
  };

  const insertInlineAgentResultBelowBlock = (blockId: string, nextType: Block['type'], nextContent: string) => {
    const newBlock = applyInlineAgentBlockUpdate(createEmptyTextBlock(), nextType, nextContent);
    const updatedBlocks = insertBlockAfterContext(blocksRef.current, blockId, newBlock);

    void onBlocksChangeRef.current(updatedBlocks);
    queueFocusSelection(newBlock.id, nextContent.length, nextContent.length, 20);
  };

  const refocusInlineBlock = (blockId: string) => {
    const block = findBlockDeep(blocksRef.current, blockId);
    if (!block) {
      return;
    }

    if (block.type === 'divider' || block.type === 'image' || (block.type === 'page_link' && block.refId)) {
      queueFocus(blockId, 20, { suppressPageLinkPicker: true });
      return;
    }

    queueFocusSelection(blockId, block.content.length, block.content.length, 20, {
      suppressPageLinkPicker: true,
    });
  };

  const closeInlineAgentComposer = (options: { refocusBlock?: boolean } = {}) => {
    const currentBlockId = inlineAgentStateRef.current.blockId;
    const currentRequestId = inlineAgentStateRef.current.requestId;
    if (currentRequestId) {
      void window.ai.cancelInlineAgent(currentRequestId);
    }

    setInlineAgentState(createDefaultInlineAgentState());

    if (options.refocusBlock && currentBlockId) {
      refocusInlineBlock(currentBlockId);
    }
  };

  const cancelInlineAgentRun = () => {
    const currentRequestId = inlineAgentStateRef.current.requestId;
    if (currentRequestId) {
      void window.ai.cancelInlineAgent(currentRequestId);
    }

    setInlineAgentState((prev) => ({
      ...prev,
      isRunning: false,
      requestId: null,
      actionMode: 'append',
      baseContent: '',
      previewContent: '',
      previewType: null,
      insertsBelowBlock: false,
      error: null,
    }));
  };

  const closeInlineAudioRecorder = async (blockId: string) => {
    const result = await onCancelVoiceRecorder();
    if (result?.pageId === pageId && result.blockId === blockId) {
      refocusInlineBlock(blockId);
    }
  };

  const openInlineAudioRecorder = (blockId: string) => {
    const block = findBlockDeep(blocks, blockId);
    if (!block || block.type === 'column' || block.type === 'column_group') {
      return;
    }

    setGhostState(null);
    rememberFocusedBlock(blockId);
    onOpenVoiceRecorder(pageId, blockId);
  };

  const startInlineAudioRecording = async () => {
    if (
      voiceRecorderState.pageId !== pageId ||
      !voiceRecorderState.blockId ||
      voiceRecorderState.isRecording ||
      voiceRecorderState.isTranscribing
    ) {
      return;
    }

    await onStartVoiceRecorder();
  };

  const stopInlineAudioRecording = async () => {
    const currentBlockId = voiceRecorderState.blockId;
    if (
      voiceRecorderState.pageId !== pageId ||
      !currentBlockId ||
      !voiceRecorderState.isRecording
    ) {
      return;
    }

    const result = await onStopVoiceRecorder();
    if (result?.pageId === pageId && result.blockId === currentBlockId && result.nextContent !== null) {
      queueFocusSelection(currentBlockId, result.nextContent.length, result.nextContent.length, 20, {
        suppressPageLinkPicker: true,
      });
    }
  };

  const openInlineAgentComposer = (blockId: string) => {
    const block = findBlockDeep(blocks, blockId);
    if (!block || block.type === 'column' || block.type === 'column_group') {
      return;
    }

    const currentRequestId = inlineAgentStateRef.current.requestId;
    if (currentRequestId && inlineAgentStateRef.current.blockId !== blockId) {
      void window.ai.cancelInlineAgent(currentRequestId);
    }

    setGhostState(null);
    rememberFocusedBlock(blockId);
    setInlineAgentState((prev) =>
      prev.blockId === blockId
        ? { ...prev, error: null }
        : {
            ...createDefaultInlineAgentState(),
            blockId,
          }
    );
  };

  const runInlineAgent = () => {
    const currentInlineAgent = inlineAgentStateRef.current;
    if (!currentInlineAgent.blockId || currentInlineAgent.isRunning) {
      return;
    }

    const block = findBlockDeep(blocksRef.current, currentInlineAgent.blockId);
    const prompt = currentInlineAgent.prompt.trim();
    if (!block) {
      return;
    }

    if (!prompt) {
      setInlineAgentState((prev) => ({
        ...prev,
        error: 'Enter a prompt before running the AI agent.',
      }));
      return;
    }

    const requestId = createInlineAgentRequestId();
    const targetBlockType = inferInlineAgentTargetBlockType(prompt, block.type);
    const actionMode = inferInlineAgentActionMode(prompt, block.type, targetBlockType, block.content);
    const imageSource = getImageSourceFromBlock(block);
    const insertsBelowBlock = imageSource !== null;

    setGhostState(null);
    setInlineAgentState((prev) =>
      prev.blockId !== currentInlineAgent.blockId
        ? prev
        : {
            ...prev,
            isRunning: true,
            requestId,
            actionMode,
            baseContent: block.content,
            previewContent: '',
            previewType: targetBlockType,
            insertsBelowBlock,
            error: null,
          }
    );

    void window.ai.runInlineAgent({
      requestId,
      pageId,
      prompt,
      currentBlockType: block.type,
      currentBlockContent: block.content,
      targetBlockType,
      actionMode,
      imageUrl: imageSource,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Unable to run the inline AI agent.';

      setInlineAgentState((prev) =>
        prev.requestId === requestId
          ? {
              ...prev,
              isRunning: false,
              requestId: null,
              actionMode: 'append',
              baseContent: '',
              previewContent: '',
              previewType: null,
              insertsBelowBlock: false,
              error: message,
            }
          : prev
      );
    });
  };

  useEffect(() => {
    if (!inlineAgentState.blockId || inlineAgentState.isRunning) {
      return;
    }

    const timer = window.setTimeout(() => {
      inlineAgentInputRef.current?.focus();
    }, 20);

    return () => window.clearTimeout(timer);
  }, [inlineAgentState.blockId, inlineAgentState.isRunning]);

  useEffect(() => {
    if (!voiceRecorderState.blockId || voiceRecorderState.pageId !== pageId) {
      return;
    }

    const timer = window.setTimeout(() => {
      inlineAudioContainerRef.current?.focus();
    }, 20);

    return () => window.clearTimeout(timer);
  }, [voiceRecorderState.blockId, voiceRecorderState.pageId, pageId]);

  useEffect(() => {
    const unsubscribe = window.ai.onInlineAgentEvent((event) => {
      const currentInlineAgent = inlineAgentStateRef.current;
      if (currentInlineAgent.requestId !== event.requestId) {
        return;
      }

      if (event.type === 'chunk') {
        setInlineAgentState((prev) =>
          prev.requestId === event.requestId
            ? {
                ...prev,
                previewContent: `${prev.previewContent}${event.chunk ?? ''}`,
              }
            : prev
        );
        return;
      }

      if (event.type === 'complete') {
        const finalText = event.fullText ?? currentInlineAgent.previewContent;

        if (!currentInlineAgent.blockId || !currentInlineAgent.previewType) {
          setInlineAgentState(createDefaultInlineAgentState());
          return;
        }

        if (!finalText.trim()) {
          setInlineAgentState((prev) =>
            prev.requestId === event.requestId
              ? {
                  ...prev,
                  isRunning: false,
                  requestId: null,
                  actionMode: 'append',
                  baseContent: '',
                  previewContent: '',
                  previewType: null,
                  insertsBelowBlock: false,
                  error: 'AI returned empty content.',
                }
              : prev
          );
          return;
        }

        if (currentInlineAgent.insertsBelowBlock) {
          insertInlineAgentResultBelowBlock(currentInlineAgent.blockId, currentInlineAgent.previewType, finalText);
        } else {
          const mergedContent = mergeInlineAgentContent(
            currentInlineAgent.baseContent,
            finalText,
            currentInlineAgent.previewType,
            currentInlineAgent.actionMode
          );

          commitInlineAgentResult(currentInlineAgent.blockId, currentInlineAgent.previewType, mergedContent);
        }

        setInlineAgentState(createDefaultInlineAgentState());
        return;
      }

      if (event.type === 'cancelled') {
        setInlineAgentState((prev) =>
          prev.requestId === event.requestId
            ? {
                ...prev,
                isRunning: false,
                requestId: null,
                actionMode: 'append',
                baseContent: '',
                previewContent: '',
                previewType: null,
                insertsBelowBlock: false,
              }
            : prev
        );
        return;
      }

      if (event.type === 'error') {
        setInlineAgentState((prev) =>
          prev.requestId === event.requestId
            ? {
                ...prev,
                isRunning: false,
                requestId: null,
                actionMode: 'append',
                baseContent: '',
                previewContent: '',
                previewType: null,
                insertsBelowBlock: false,
                error: event.error || 'Unable to generate inline AI content.',
              }
            : prev
        );
      }
    });

    return unsubscribe;
  }, []);

  const getGhostHintForBlock = (blockId: string, currentValue: string) => {
    if (!ghostState || ghostState.blockId !== blockId) {
      return '';
    }

    if (ghostState.isLoading) {
      return '…';
    }

    return getRemainingGhostText(ghostState, blockId, currentValue);
  };

  const requestGhostText = async (blockId: string, target: HTMLTextAreaElement) => {
    const block = findBlockDeep(blocks, blockId);
    if (!block || !GHOST_SUPPORTED_TYPES.has(block.type)) {
      return;
    }

    const selectionStart = target.selectionStart ?? target.value.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const baseValue = target.value;
    const beforeText = baseValue.slice(0, selectionStart);
    const afterText = baseValue.slice(selectionEnd);
    const requestId = ghostRequestIdRef.current + 1;

    ghostRequestIdRef.current = requestId;
    setGhostState({
      blockId,
      beforeText,
      afterText,
      suggestion: '',
      isLoading: true,
    });

    try {
      const response = await window.ai.generateGhostText({
        pageId,
        blockType: block.type,
        beforeText,
        afterText,
      });

      if (ghostRequestIdRef.current !== requestId) {
        return;
      }

      const latestTextarea = document.querySelector(`textarea[data-block-id="${blockId}"]`) as HTMLTextAreaElement | null;

      if (!latestTextarea || latestTextarea.value !== baseValue) {
        setGhostState(null);
        return;
      }

      if (!response.suggestion) {
        setGhostState(null);
        return;
      }

      setGhostState({
        blockId,
        beforeText,
        afterText,
        suggestion: response.suggestion,
        isLoading: false,
      });
    } catch (error) {
      console.error('Ghost text request failed:', error);
      setGhostState(null);
    }
  };

  const acceptGhostText = (blockId: string) => {
    const block = findBlockDeep(blocks, blockId);
    if (!block || !ghostState || ghostState.blockId !== blockId || ghostState.isLoading) {
      return false;
    }

    const ghostMatch = getGhostSuggestionMatch(ghostState, blockId, block.content);
    if (!ghostMatch) {
      setGhostState(null);
      return false;
    }

    if (!ghostMatch.matchesSuggestion) {
      return false;
    }

    if (!ghostMatch.remainingText) {
      if (ghostMatch.typedSuggestion === ghostState.suggestion) {
        setGhostState(null);
      }
      return false;
    }

    const acceptedText = ghostMatch.remainingText;
    const nextTypedSuggestion = `${ghostMatch.typedSuggestion}${acceptedText}`;
    const nextContent = `${ghostState.beforeText}${nextTypedSuggestion}${ghostState.afterText}`;
    const caretPosition = ghostState.beforeText.length + nextTypedSuggestion.length;

    onBlocksChange(updateBlockDeep(blocks, blockId, (currentBlock) => ({
      ...currentBlock,
      content: nextContent,
    })));
    setGhostState(null);
    queueFocusSelection(blockId, caretPosition, caretPosition, 20);
    return true;
  };

  const acceptGhostTextByWord = (blockId: string) => {
    const block = findBlockDeep(blocks, blockId);
    if (!block || !ghostState || ghostState.blockId !== blockId || ghostState.isLoading) {
      return false;
    }

    const ghostMatch = getGhostSuggestionMatch(ghostState, blockId, block.content);
    if (!ghostMatch) {
      setGhostState(null);
      return false;
    }

    if (!ghostMatch.matchesSuggestion || !ghostMatch.remainingText) {
      return false;
    }

    const acceptedText = getNextGhostWordChunk(ghostMatch.remainingText);
    if (!acceptedText) {
      return false;
    }

    const nextTypedSuggestion = `${ghostMatch.typedSuggestion}${acceptedText}`;
    const nextContent = `${ghostState.beforeText}${nextTypedSuggestion}${ghostState.afterText}`;
    const caretPosition = ghostState.beforeText.length + nextTypedSuggestion.length;
    const shouldClearGhost = nextTypedSuggestion === ghostState.suggestion;

    onBlocksChange(updateBlockDeep(blocks, blockId, (currentBlock) => ({
      ...currentBlock,
      content: nextContent,
    })));

    if (shouldClearGhost) {
      setGhostState(null);
    }

    queueFocusSelection(blockId, caretPosition, caretPosition, 20);
    return true;
  };

  const renderGhostTextarea = (
    block: Block,
    placeholder: string,
    className: string,
    options: {
      onMouseUp?: React.MouseEventHandler<HTMLTextAreaElement>;
      readOnly?: boolean;
    } = {}
  ) => {
    const ghostOverlay = getGhostOverlayState(ghostState, block.id, block.content);
    const onFocus = () => {
      rememberFocusedBlock(block.id);
      setGhostState((prev) => (prev?.blockId === block.id ? prev : null));
    };

    return (
      <div className="relative w-full">
        {ghostOverlay && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-muted-foreground/40 ${className}`}
          >
            <span className="invisible">{ghostOverlay.prefixText}</span>
            {ghostOverlay.isLoading ? (
              <span className="inline-flex h-[0.8em] w-[0.8em] translate-y-[0.08em] rounded-full border border-current border-r-transparent align-middle animate-spin" />
            ) : (
              <span>{ghostOverlay.remainingText}</span>
            )}
            <span className="invisible">{ghostOverlay.afterText}</span>
          </div>
        )}

        <textarea
          data-block-id={block.id}
          value={block.content}
          onFocus={onFocus}
          onChange={(e) => handleInput(block.id, e.target.value, e)}
          onMouseUp={options.onMouseUp}
          onKeyDown={(e) => handleKeyDown(e, block.id)}
          placeholder={placeholder}
          readOnly={options.readOnly}
          className={`${className} relative z-[1]`}
          rows={1}
        />
      </div>
    );
  };

  const insertBlockAfterContext = (blocksList: Block[], currentBlockId: string, newBlock: Block) => {
    return insertAfterDeep(blocksList, currentBlockId, [newBlock]);
  };

  const activeResizeBlock = activeBlockId ? findBlockDeep(blocks, activeBlockId) : null;
  const inlineAgentResizeBlock =
    inlineAgentState.blockId && inlineAgentState.blockId !== activeBlockId
      ? findBlockDeep(blocks, inlineAgentState.blockId)
      : null;

  useLayoutEffect(() => {
    resizeVisibleTextareas();
  }, [pageId]);

  useLayoutEffect(() => {
    if (!pendingGlobalResizeAfterBlocksChangeRef.current) {
      return;
    }

    resizeVisibleTextareas();
    pendingGlobalResizeAfterBlocksChangeRef.current = false;
  }, [blocks]);

  useLayoutEffect(() => {
    const targetIds = new Set<string>();

    if (activeBlockId) {
      targetIds.add(activeBlockId);
    }

    if (inlineAgentState.blockId) {
      targetIds.add(inlineAgentState.blockId);
    }

    targetIds.forEach((id) => resizeBlockTextareaById(id));
  }, [
    activeBlockId,
    activeResizeBlock?.type,
    activeResizeBlock?.content,
    inlineAgentState.blockId,
    inlineAgentResizeBlock?.type,
    inlineAgentResizeBlock?.content,
    inlineAgentState.previewContent,
    inlineAgentState.previewType,
  ]);

  useEffect(() => {
    if (!inlineAgentState.isRunning || !inlineAgentState.blockId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      resizeBlockTextareaById(inlineAgentState.blockId!);
      scrollBlockIntoView(inlineAgentState.blockId!);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [inlineAgentState.isRunning, inlineAgentState.blockId, inlineAgentState.previewContent]);

  useEffect(() => {
    setGhostState((prev) => (prev && findBlockDeep(blocks, prev.blockId) ? prev : null));

    setInlineAgentState((prev) => {
      if (!prev.blockId || findBlockDeep(blocks, prev.blockId)) {
        return prev;
      }

      if (prev.requestId) {
        void window.ai.cancelInlineAgent(prev.requestId);
      }

      return createDefaultInlineAgentState();
    });

    if (
      voiceRecorderState.pageId === pageId &&
      voiceRecorderState.blockId &&
      !findBlockDeep(blocks, voiceRecorderState.blockId)
    ) {
      void onCancelVoiceRecorder();
    }
  }, [blocks]);

  useEffect(() => {
    if (!pageId) return;

    const currentRequestId = inlineAgentStateRef.current.requestId;
    if (currentRequestId) {
      void window.ai.cancelInlineAgent(currentRequestId);
    }

    setGhostState(null);
    setInlineAgentState(createDefaultInlineAgentState());

    if (blocks.length === 0) {
      const newBlock = createEmptyTextBlock();
      onBlocksChange([newBlock]);
      queueFocus(newBlock.id, 30);
      return;
    }

    const rememberedId = lastFocusedBlockByPageRef.current[pageId];
    const flatBlocks = getFlatBlocks(blocks);
    const targetId = rememberedId && findBlockDeep(blocks, rememberedId)
      ? rememberedId
      : flatBlocks[flatBlocks.length - 1]?.id;

    if (targetId) {
      suppressNextPageLinkPickerRef.current = true;
      queueFocus(targetId, 10, { suppressPageLinkPicker: true });
    }
  }, [pageId]);

  useEffect(() => {
    if (!historyFocusRequest || historyFocusRequest.pageId !== pageId) {
      return
    }

    if (lastAppliedHistoryFocusTokenRef.current === historyFocusRequest.token) {
      return
    }

    lastAppliedHistoryFocusTokenRef.current = historyFocusRequest.token

    const targetBlockId =
      historyFocusRequest.blockId && findBlockDeep(blocks, historyFocusRequest.blockId)
        ? historyFocusRequest.blockId
        : getFlatBlocks(blocks)[0]?.id

    if (!targetBlockId) {
      return
    }

    suppressNextPageLinkPickerRef.current = true
    queueFocus(targetBlockId, 20, { suppressPageLinkPicker: true })
  }, [historyFocusRequest, pageId])

  const handleInput = (id: string, value: string, e?: React.FormEvent) => {
  let newContent = value;
  let newType: Block['type'] | null = null;

  // MARKDOWN RULES
  if (value === '# ') { newType = 'h1'; newContent = ''; }
  else if (value === '## ') { newType = 'h2'; newContent = ''; }
  else if (value === '### ') { newType = 'h3'; newContent = ''; }
  else if (value === '- ' || value === '* ') { newType = 'list'; newContent = ''; }
  else if (value === '1. ') { newType = 'numbered'; newContent = ''; }
  else if (value === '[] ') { newType = 'checklist'; newContent = ''; }
  else if (value === '> ') { newType = 'quote'; newContent = ''; }
  else if (value === '``` ') { newType = 'code'; newContent = ''; }

  const updatedBlocks = updateBlockDeep(blocks, id, (b) => ({ 
    ...b, 
    content: newContent,
    type: newType || b.type,
    // Ensure checked state is added if it just became a checklist
    checked: newType === 'checklist' ? false : b.checked 
  }));
  
  onBlocksChange(updatedBlocks);
  setGhostState((prev) => {
    if (!prev || prev.blockId !== id) {
      return prev;
    }

    if (prev.isLoading) {
      return null;
    }

    return getGhostSuggestionMatch(prev, id, newContent) ? prev : null;
  });

  if (e && e.target instanceof HTMLTextAreaElement) {
    resizeTextarea(e.target);
  }

  // --- SLASH MENU TRIGGER ---
  if (value.includes('/') && e) {
    const slashIndex = value.lastIndexOf('/');
    const query = value.substring(slashIndex + 1);
    
    setSearchQuery(query); 
    
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    // Position logic...
    setSlashMenuPosition({ x: rect.left, y: rect.bottom + 5 });
    setShowSlashMenu(true);
    setActiveBlockId(id);
  } else {
    setShowSlashMenu(false);
  }
};

  const handleSlashCommand = (commandId: string) => {
  // 1. Guard against null
  if (!activeBlockId) return; 
  const targetId = activeBlockId;
  setGhostState(null);

  if (commandId === 'page_link') {
    setShowSlashMenu(false);
    setShowPagePicker(true);
    return;
  }

  let nextFocusId = targetId;
  const updatedBlocks = updateBlockDeep(blocks, targetId, (b) => {
    const slashIndex = b.content.lastIndexOf('/');
    const textToKeep = slashIndex >= 0 ? b.content.substring(0, slashIndex).trim() : b.content;
    
    return { 
      ...b, 
      type: commandId as Block['type'], 
      content: textToKeep,
      checked: commandId === 'checklist' ? false : undefined 
    };
  });

  if (commandId === 'divider') {
    const nextBlock = createEmptyTextBlock();
    nextFocusId = nextBlock.id;
    onBlocksChange(insertBlockAfterContext(updatedBlocks, targetId, nextBlock));
  } else {
    onBlocksChange(updatedBlocks);
  }

  setShowSlashMenu(false);
  setSearchQuery(''); 
  
  queueFocus(nextFocusId, 30); 
};

  const handleEditorClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('editor-padding-area')) {
      if (blocks.length === 0) {
        const newBlock = createEmptyTextBlock();
        onBlocksChange([newBlock]);
        queueFocus(newBlock.id, 30);
        return;
      }

      const rememberedId = lastFocusedBlockByPageRef.current[pageId];
      const flatBlocks = getFlatBlocks(blocks);
      const targetId = rememberedId && findBlockDeep(blocks, rememberedId)
        ? rememberedId
        : flatBlocks[flatBlocks.length - 1]?.id;
      if (targetId) {
        focusBlock(targetId);
      }
    }
  };

  const handleSelectExistingPage = (selectedPage: { id: string, title: string }) => {
  // 1. Capture the ID and check for null immediately
  const targetId = activeBlockId;
  if (!targetId) return;
  setGhostState(null);

  const updatedBlocks = updateBlockDeep(blocks, targetId, (b) => {
    const slashIndex = b.content.lastIndexOf('/');
    const textToKeep = slashIndex >= 0 ? b.content.substring(0, slashIndex).trim() : b.content;
    
    return {
      ...b,
      type: 'page_link',
      content: selectedPage.title || 'Untitled Page',
      refId: selectedPage.id
    };
  });

  onBlocksChange(updatedBlocks);
  setShowPagePicker(false);

  // 2. Use the local 'targetId' variable (which TS knows is a string)
  queueFocus(targetId, 50);
};

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setShowSelectionToolbar(true);
      setToolbarPosition({ x: rect.left, y: rect.top });
    } else {
      setShowSelectionToolbar(false);
    }
  };

  const handleCheckboxToggle = (id: string) => {
    setGhostState((prev) => (prev?.blockId === id ? null : prev));
    const updatedBlocks = updateBlockDeep(blocks, id, (b) => ({ ...b, checked: !b.checked }));
    onBlocksChange(updatedBlocks);
  };

 const handleKeyDown = (e: React.KeyboardEvent, blockId: string) => {
  const currentBlock = findBlockDeep(blocks, blockId);
  if (!currentBlock) return;
  const multilineTypes = new Set<Block['type']>(['text', 'h1', 'h2', 'h3']);
  const repeatedTypes = new Set<Block['type']>(['text', 'h1', 'h2', 'h3', 'list', 'numbered', 'checklist', 'quote', 'code']);

  if (inlineAgentState.isRunning && inlineAgentState.blockId === blockId) {
    e.preventDefault();
    return;
  }

  if (voiceRecorderState.pageId === pageId && voiceRecorderState.blockId === blockId) {
    if (e.key === 'Escape') {
      e.preventDefault();
      void closeInlineAudioRecorder(blockId);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!voiceRecorderState.isTranscribing) {
        if (voiceRecorderState.isRecording) {
          void stopInlineAudioRecording();
        } else {
          void startInlineAudioRecording();
        }
      }
      return;
    }
  }

  if (hasPrimaryModifier(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    openInlineAudioRecorder(blockId);
    return;
  }

  if (hasPrimaryModifier(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    openInlineAgentComposer(blockId);
    return;
  }

  if (hasPrimaryModifier(e) && !e.altKey && !e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    appendBlockToEditorEnd();
    return;
  }

  if (hasPrimaryModifier(e) && !e.altKey && (e.key === ' ' || e.code === 'Space')) {
    if (e.currentTarget instanceof HTMLTextAreaElement && GHOST_SUPPORTED_TYPES.has(currentBlock.type)) {
      e.preventDefault();
      requestGhostText(blockId, e.currentTarget);
    }
    return;
  }

  if (e.key === 'Tab' && acceptGhostText(blockId)) {
    e.preventDefault();
    return;
  }

  if (hasPrimaryModifier(e) && !e.altKey && !e.shiftKey && e.key === 'ArrowRight' && acceptGhostTextByWord(blockId)) {
    e.preventDefault();
    return;
  }

  // 1. BLOCKS KEYBOARD NAVIGATION WHEN MENUS ARE OPEN
  if ((showSlashMenu || showPagePicker) && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    return;
  }

  // 2. SHIFT + ENTER: THE "BREAK OUT" KEY (Always creates a plain text block)
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    const newBlock = createEmptyTextBlock();
    onBlocksChange(insertBlockAfterContext(blocks, blockId, newBlock));
    queueFocus(newBlock.id, 10);
    return;
  }

  // 3. ENTER KEY LOGIC
  if (e.key === 'Enter') {
    if (multilineTypes.has(currentBlock.type)) {
      return;
    }

    e.preventDefault();

    // A. Column Breakout Logic (If empty in a column, move out of column)
    if (currentBlock.content === '' && isInsideColumnGroup(blocks, blockId)) {
      const parentGroupId = findColumnGroupIdForBlock(blocks, blockId);

      if (parentGroupId) {
        let newBlocks = removeBlockDeep(blocks, blockId);
        const newBlock = createEmptyTextBlock();
        newBlocks = insertAfterDeep(newBlocks, parentGroupId, [newBlock]);
        newBlocks = cleanTree(newBlocks);
        onBlocksChange(newBlocks);
        queueFocus(newBlock.id, 10);
        return;
      }
    }

    // B. Page links always break into a plain text block
    if (currentBlock.type === 'page_link') {
      const newBlock = createEmptyTextBlock();
      onBlocksChange(insertBlockAfterContext(blocks, blockId, newBlock));
      queueFocus(newBlock.id, 10);
      return;
    }

    // C. Repeated block types continue with the same type on Enter
    if (repeatedTypes.has(currentBlock.type)) {
      if (currentBlock.type !== 'text' && currentBlock.content.trim() === '') {
        const updatedBlocks = updateBlockDeep(blocks, blockId, (b) => ({
          ...b,
          type: 'text',
          checked: undefined,
          refId: undefined,
        }));
        onBlocksChange(updatedBlocks);
        queueFocus(blockId, 10);
        return;
      }

      const newId = Date.now().toString();
      const newBlock: Block = {
        id: newId,
        type: currentBlock.type,
        content: '',
        refId: undefined,
        checked: currentBlock.type === 'checklist' ? false : undefined,
      };
      onBlocksChange(insertBlockAfterContext(blocks, blockId, newBlock));
      queueFocus(newId, 30);
      return;
    }

    // D. Default logic falls back to a new text block
    const newBlock = createEmptyTextBlock();
    onBlocksChange(insertBlockAfterContext(blocks, blockId, newBlock));
    queueFocus(newBlock.id, 10);
    return;
  }

  // 4. BACKSPACE KEY LOGIC (DELETION)
  if (e.key === 'Backspace') {
    const isImageWithUrl = currentBlock.type === 'image' && (/^https?:\/\//.test(currentBlock.content) || currentBlock.content.startsWith('data:image'));

    if (
      currentBlock.content === '' ||
      currentBlock.type === 'divider' ||
      currentBlock.type === 'page_link' ||
      isImageWithUrl
    ) {
      e.preventDefault();

      const flatBlocks = getFlatBlocks(blocks);
      const currentIndex = flatBlocks.findIndex((b) => b.id === blockId);
      const prevBlock = currentIndex > 0 ? flatBlocks[currentIndex - 1] : null;

      let newBlocks = removeBlockDeep(blocks, blockId);
      newBlocks = cleanTree(newBlocks);

      if (newBlocks.length === 0) {
        newBlocks = [createEmptyTextBlock()];
      }

      onBlocksChange(newBlocks);

      if (prevBlock) {
        queueFocus(prevBlock.id, 10);
      } else {
        const newFlat = getFlatBlocks(newBlocks);
        if (newFlat.length > 0) queueFocus(newFlat[0].id, 10);
      }
    }
  }
};

  // --- IMAGE DROP HANDLER ---
  const handleImageFileDrop = (e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation(); // Prevents the global block drag-and-drop from firing

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target?.result as string;
        onBlocksChange(updateBlockDeep(blocks, blockId, b => ({ ...b, content: base64String })));
      };
      reader.readAsDataURL(file);
    }
  };

  // --- DRAG AND DROP HANDLERS (BLOCKS) ---
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedBlockId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedBlockId(null);
    setDropTargetId(null);
    setDropSide(null);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move'; 
    
    if (!draggedBlockId || draggedBlockId === targetId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDropTargetId(targetId);

    const targetBlock = findBlockDeep(blocks, targetId);
    const insideCol = targetBlock?.type === 'column_group' || targetBlock?.type === 'column' || isInsideColumnGroup(blocks, targetId);
    const horizontalEdgeThreshold = insideCol ? 0 : Math.min(Math.max(rect.width * 0.08, 14), 20);
    const verticalEdgeThreshold = Math.min(Math.max(rect.height * 0.18, 10), 18);

    if (x <= horizontalEdgeThreshold && !insideCol) {
      setDropSide('left');
    } else if (x >= rect.width - horizontalEdgeThreshold && !insideCol) {
      setDropSide('right');
    } else if (y <= verticalEdgeThreshold) {
      setDropSide('top');
    } else if (y >= rect.height - verticalEdgeThreshold) {
      setDropSide('bottom');
    } else {
      setDropSide('center');
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedBlockId || draggedBlockId === targetId || !dropSide) {
      handleDragEnd();
      return;
    }

    const sourceBlock = findBlockDeep(blocks, draggedBlockId);
    const targetBlock = findBlockDeep(blocks, targetId);
    
    if (!sourceBlock || !targetBlock) {
      handleDragEnd();
      return;
    }

    if (findBlockDeep([sourceBlock], targetId)) {
      handleDragEnd();
      return;
    }

    if (dropSide === 'center' && findBlockDeep([targetBlock], draggedBlockId)) {
      handleDragEnd();
      return;
    }

    if (dropSide === 'left' || dropSide === 'right') {
      if (targetBlock.type === 'column_group' || targetBlock.type === 'column' || isInsideColumnGroup(blocks, targetId)) {
        handleDragEnd();
        return;
      }
    }

    let newBlocks = blocks;

    if (dropSide === 'center') {
      newBlocks = swapBlocksDeep(blocks, draggedBlockId, targetId);
    } else if (dropSide === 'left' || dropSide === 'right') {
      newBlocks = removeBlockDeep(blocks, draggedBlockId);
      const newColGroup: Block = {
        id: `group-${Date.now()}`,
        type: 'column_group',
        content: '',
        children: [
          {
            id: `col-1-${Date.now()}`,
            type: 'column',
            content: '',
            width: '50%',
            children: dropSide === 'left' ? [sourceBlock] : [targetBlock]
          },
          {
            id: `col-2-${Date.now()}`,
            type: 'column',
            content: '',
            width: '50%',
            children: dropSide === 'left' ? [targetBlock] : [sourceBlock]
          }
        ]
      };
      newBlocks = replaceBlockDeep(newBlocks, targetId, newColGroup);
    } else if (dropSide === 'top') {
      newBlocks = removeBlockDeep(blocks, draggedBlockId);
      newBlocks = insertBeforeDeep(newBlocks, targetId, [sourceBlock]);
    } else if (dropSide === 'bottom') {
      newBlocks = removeBlockDeep(blocks, draggedBlockId);
      newBlocks = insertAfterDeep(newBlocks, targetId, [sourceBlock]);
    }

    newBlocks = cleanTree(newBlocks);

    pendingGlobalResizeAfterBlocksChangeRef.current = true;
    onBlocksChange(newBlocks);
    handleDragEnd();
  };

  const handleColumnClick = (e: React.MouseEvent, columnId: string) => {
    if (e.target !== e.currentTarget) return;
    e.stopPropagation();

    const column = findBlockDeep(blocks, columnId);
    if (!column || column.type !== 'column') return;

    const lastChildId = column.children?.[column.children.length - 1]?.id;
    if (lastChildId) {
      focusBlock(lastChildId);
      return;
    }

    const newBlock = createEmptyTextBlock();
    const updatedBlocks = updateBlockDeep(blocks, columnId, (block) => ({
      ...block,
      children: [...(block.children || []), newBlock],
    }));

    onBlocksChange(updatedBlocks);
    queueFocus(newBlock.id, 20);
  };

  // --- RENDERERS ---
  const renderBlockContent = (block: Block) => {
    const isInlineAgentPreview =
      inlineAgentState.isRunning &&
      inlineAgentState.blockId === block.id &&
      !inlineAgentState.insertsBelowBlock;
    const resolvedBlock =
      inlineAgentState.blockId === block.id &&
      inlineAgentState.previewType &&
      !inlineAgentState.insertsBelowBlock
        ? {
            ...block,
            type: inlineAgentState.previewType,
            content: mergeInlineAgentContent(
              inlineAgentState.baseContent,
              inlineAgentState.previewContent,
              inlineAgentState.previewType,
              inlineAgentState.actionMode
            ),
          }
        : block;
    const commonClasses = 'w-full bg-transparent border-none outline-none resize-none focus:ring-0 overflow-hidden break-words p-0 whitespace-pre-wrap';
    const onFocus = () => rememberFocusedBlock(resolvedBlock.id);

    if (Boolean(resolvedBlock.type === 'list')) {
      return (
        <div className="flex items-start gap-2 py-1 w-full">
          <span className="mt-1 text-foreground text-xl leading-none shrink-0">&#8226;</span>
          {renderGhostTextarea(resolvedBlock, 'List item', `${commonClasses} flex-1 py-1`, {
            readOnly: isInlineAgentPreview,
          })}
        </div>
      );
    }

    switch (resolvedBlock.type) {
      case 'h1':
        return renderGhostTextarea(resolvedBlock, 'Heading 1', `${commonClasses} text-4xl font-bold mt-2 mb-2`, {
          onMouseUp: handleTextSelection,
          readOnly: isInlineAgentPreview,
        });
      case 'h2':
        return renderGhostTextarea(resolvedBlock, 'Heading 2', `${commonClasses} text-2xl font-semibold mt-2 mb-1`, {
          onMouseUp: handleTextSelection,
          readOnly: isInlineAgentPreview,
        });
      case 'h3':
        return renderGhostTextarea(resolvedBlock, 'Heading 3', `${commonClasses} text-xl font-medium mt-2`, {
          onMouseUp: handleTextSelection,
          readOnly: isInlineAgentPreview,
        });
      case 'list': return <div className="flex items-start gap-2 py-1 w-full"><span className="mt-1 text-foreground text-xl leading-none shrink-0">•</span><textarea data-block-id={block.id} value={block.content} onFocus={onFocus} onChange={(e) => handleInput(block.id, e.target.value, e)} onKeyDown={(e) => handleKeyDown(e, block.id)} placeholder="List item" className={`${commonClasses} flex-1 py-1`} rows={1} /></div>;
      case 'numbered':
        return (
          <div className="flex items-start gap-2 py-1 w-full">
            <span className="mt-1 text-muted-foreground font-medium shrink-0">{getNumberedListIndex(blocks, resolvedBlock.id)}.</span>
            {renderGhostTextarea(resolvedBlock, 'List item', `${commonClasses} flex-1 py-1`, {
              readOnly: isInlineAgentPreview,
            })}
          </div>
        );
      case 'checklist':
        return (
          <div className="flex items-start gap-3 py-1 w-full">
            <input
              type="checkbox"
              checked={resolvedBlock.checked || false}
              onChange={() => handleCheckboxToggle(resolvedBlock.id)}
              disabled={isInlineAgentPreview}
              className="mt-2 rounded border-border w-4 h-4 shrink-0 cursor-pointer accent-primary disabled:cursor-wait"
            />
            {renderGhostTextarea(
              resolvedBlock,
              'To-do',
              `${commonClasses} flex-1 py-1 ${resolvedBlock.checked ? 'line-through text-muted-foreground' : ''}`,
              {
                readOnly: isInlineAgentPreview,
              }
            )}
          </div>
        );
      case 'quote':
        return (
          <div className="py-2 my-2 w-full">
            <div className="border-l-4 border-primary pl-4 py-1">
              {renderGhostTextarea(resolvedBlock, 'Empty quote', `${commonClasses} italic text-xl text-muted-foreground`, {
                onMouseUp: handleTextSelection,
                readOnly: isInlineAgentPreview,
              })}
            </div>
          </div>
        );
      case 'code':
        return (
          <div className="py-2 my-2 w-full">
            {renderGhostTextarea(
              resolvedBlock,
              'Write code here...',
              `${commonClasses} bg-muted border border-border focus:ring-1 focus:ring-primary rounded-md px-4 py-4 font-mono text-sm`,
              {
                onMouseUp: handleTextSelection,
                readOnly: isInlineAgentPreview,
              }
            )}
          </div>
        );
      case 'divider': return <div className="py-4 my-2 outline-none cursor-pointer focus:bg-accent/50 rounded-md transition-colors w-full" tabIndex={0} data-block-id={resolvedBlock.id} onFocus={onFocus} onKeyDown={(e) => handleKeyDown(e, resolvedBlock.id)} onClick={(e) => e.currentTarget.focus()}><hr className="border-t border-border w-full pointer-events-none" /></div>;

      case 'page_link': return (
  <div
    tabIndex={0}
    data-block-id={resolvedBlock.id}
    onFocus={onFocus}
    // FIX: Pass all key events to handleKeyDown so Enter can work
    onKeyDown={(e) => {
      handleKeyDown(e, resolvedBlock.id);
    }}
    onClick={(e) => {
      e.stopPropagation();
      // Only navigate if the user specifically clicks the link text
      // This prevents accidental navigation when just trying to focus the block
    }}
    className="flex items-start gap-2 py-1 w-full group/link cursor-pointer outline-none focus:bg-accent/30 rounded-md transition-colors px-1"
  >
    <span className="mt-1 text-muted-foreground shrink-0 group-hover/link:text-blue-500 transition-colors">📄</span>
    
    {resolvedBlock.refId ? (
      <div 
        className={`${commonClasses} flex-1 py-1 text-blue-500 hover:underline font-medium truncate`}
        onClick={() => onNavigate(resolvedBlock.refId!)}
      >
        {resolvedBlock.content || "Untitled Page"}
      </div>
    ) : (
      <textarea
        data-block-id={resolvedBlock.id}
        value={resolvedBlock.content}
        onFocus={onFocus}
        onChange={(e) => handleInput(resolvedBlock.id, e.target.value, e)}
        onKeyDown={(e) => handleKeyDown(e, resolvedBlock.id)}
        placeholder="Link to page..."
        readOnly={isInlineAgentPreview}
        className={`${commonClasses} flex-1 py-1 text-muted-foreground`}
        rows={1}
      />
    )}
  </div>
);

      case 'image': {
        const hasImageSource = /^https?:\/\//.test(resolvedBlock.content) || resolvedBlock.content.startsWith('data:image');
        return (
          <div
            className="py-2 my-2 w-full group relative"
            onClick={() => focusBlock(resolvedBlock.id)}
            onDragOver={(e) => {
              if (isImageFileTransfer(e.dataTransfer)) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onDrop={(e) => {
              if (isImageFileTransfer(e.dataTransfer)) {
                handleImageFileDrop(e, resolvedBlock.id);
              }
            }}
          >
            {hasImageSource ? (
              <>
                <img src={resolvedBlock.content} alt="Media" className="max-w-full rounded-md border border-border" />
                <textarea data-block-id={resolvedBlock.id} value={resolvedBlock.content} onChange={() => { }} onKeyDown={(e) => handleKeyDown(e, resolvedBlock.id)} onFocus={onFocus} readOnly={isInlineAgentPreview} className="absolute w-0 h-0 opacity-0" />
              </>
            ) : (
              <div className="relative">
                <textarea
                  data-block-id={resolvedBlock.id}
                  value={resolvedBlock.content}
                  onFocus={onFocus}
                  onChange={(e) => {
                    handleInput(resolvedBlock.id, e.target.value, e);
                    setSearchQuery(e.target.value); // Filters the list as you type
                  }}
                  onKeyDown={(e) => handleKeyDown(e, resolvedBlock.id)}
                  placeholder="Paste image URL, or Drag & Drop an image file here"
                  readOnly={isInlineAgentPreview}
                  className={`${commonClasses} bg-muted border border-border border-dashed focus:border-solid focus:ring-1 focus:ring-primary rounded-md px-4 py-8 text-center font-mono text-sm`}
                  rows={1}
                />
              </div>
            )}
          </div>
        );
      }

      case 'column_group': return (
        <div className="flex w-full my-2 items-stretch relative group/colgroup">
          {block.children?.map((col, index) => (
            <React.Fragment key={col.id}>
              <div
                style={{ width: col.width || '50%' }}
                className="flex flex-col gap-1 min-w-0 pr-2 min-h-[2.5rem]"
                onClick={(e) => handleColumnClick(e, col.id)}
              >
                {col.children?.map((child) => renderDraggableBlock(child))}
              </div>
              {index < (block.children?.length || 0) - 1 && (
                <div
                  className="w-4 cursor-col-resize shrink-0 mx-1 flex items-stretch justify-center group/resize-handle"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const startWidths = block.children!.map(c => parseFloat(c.width || '50'));
                    setResizing({ groupId: block.id, colIndex: index, startX: e.clientX, startWidths });
                  }}
                >
                  <div className="w-1.5 rounded bg-transparent opacity-0 transition-all duration-150 group-hover/resize-handle:bg-blue-500 group-hover/resize-handle:opacity-100" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      );

      default:
        return renderGhostTextarea(resolvedBlock, "Type '/' for commands...", `${commonClasses} min-h-[2.5rem] leading-relaxed py-2`, {
          onMouseUp: handleTextSelection,
          readOnly: isInlineAgentPreview,
        });
    }
  };

  const renderDraggableBlock = (block: Block) => {
    if (block.type === 'column_group') {
      return <div key={block.id} className="w-full">{renderBlockContent(block)}</div>;
    }

    return (
      <div
        key={block.id}
        className={`block-container relative group flex items-start w-full ${draggedBlockId === block.id ? 'opacity-20' : 'opacity-100'}`}
        onDragOver={(e) => handleDragOver(e, block.id)}
        onDrop={(e) => handleDrop(e, block.id)}
      >
        {dropTargetId === block.id && dropSide === 'top' && <div className="absolute top-0 left-6 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropTargetId === block.id && dropSide === 'bottom' && <div className="absolute bottom-0 left-6 right-0 h-0.5 bg-blue-500 z-10" />}
        {dropTargetId === block.id && dropSide === 'left' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 z-10" />}
        {dropTargetId === block.id && dropSide === 'right' && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500 z-10" />}
        {dropTargetId === block.id && dropSide === 'center' && (
          <div className="absolute inset-1 rounded-xl border-2 border-blue-500 bg-blue-500/5 z-10 pointer-events-none" />
        )}

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, block.id)}
          onDragEnd={handleDragEnd}
          className="w-6 h-10 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 cursor-pinter active:cursor-pointer text-muted-foreground/40 hover:text-muted-foreground transition-opacity"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 pr-4">
          {renderBlockContent(block)}
          {inlineAgentState.blockId === block.id && (
            <InlineAgentComposer
              value={inlineAgentState.prompt}
              isRunning={inlineAgentState.isRunning}
              error={inlineAgentState.error}
              inputRef={inlineAgentInputRef}
              onChange={(value) =>
                setInlineAgentState((prev) =>
                  prev.blockId === block.id
                    ? {
                        ...prev,
                        prompt: value,
                        error: null,
                      }
                    : prev
                )
              }
              onSubmit={runInlineAgent}
              onCancel={cancelInlineAgentRun}
              onClose={() => closeInlineAgentComposer({ refocusBlock: true })}
            />
          )}

          {voiceRecorderState.pageId === pageId && voiceRecorderState.blockId === block.id && (
            <InlineAudioRecorder
              containerRef={inlineAudioContainerRef}
              captureMode={voiceRecorderState.captureMode}
              deviceLabel={voiceRecorderState.deviceLabel}
              transcriptionMode={voiceRecorderState.transcriptionMode}
              isRecording={voiceRecorderState.isRecording}
              isTranscribing={voiceRecorderState.isTranscribing}
              elapsedSeconds={voiceRecorderState.elapsedSeconds}
              error={voiceRecorderState.error}
              onStart={() => {
                void startInlineAudioRecording();
              }}
              onStop={() => {
                void stopInlineAudioRecording();
              }}
              onClose={() => {
                void closeInlineAudioRecorder(block.id);
              }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={editorRef}
      onClick={handleEditorClick}
      className={`w-full h-full flex-1 overflow-y-auto custom-scrollbar relative bg-background ${resizing ? 'cursor-col-resize select-none' : ''}`}
    >
      <div className="editor-padding-area w-full pt-2 pb-32 px-3 md:px-3">
        <div className="ml-3">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (hasPrimaryModifier(e) && !e.altKey && !e.shiftKey && e.key === 'Enter') {
                e.preventDefault();
                appendBlockToEditorEnd();
              }
            }}
            placeholder="Untitled"
            className="w-full text-5xl font-bold bg-transparent border-none outline-none mb-4 placeholder:text-muted-foreground/50 break-words p-0"
          />
        </div>

        <div className="space-y-0 w-full relative">
          {blocks.map((block) => renderDraggableBlock(block))}
        </div>

        <button
          onClick={appendBlockToEditorEnd}
          className="mt-4 ml-4 px-2 py-2 flex items-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors text-sm"
        >
          <span className="text-lg leading-none">+</span>
        </button>
      </div>

      {showSlashMenu && (
        <SlashCommandMenu
          position={slashMenuPosition}
          onSelect={handleSlashCommand}
          onClose={() => {
            setShowSlashMenu(false);
            setSearchQuery('');
          }}
          query={searchQuery}
        />
      )}

      {showPagePicker && (
        <PagePicker
          position={slashMenuPosition}
          pages={allPages}
          onSelect={handleSelectExistingPage}
          onClose={() => setShowPagePicker(false)}
        />
      )}

      <SelectionToolbar visible={showSelectionToolbar} position={toolbarPosition} onFormat={(type) => console.log('Format:', type)} />
    </div>
  );
}
