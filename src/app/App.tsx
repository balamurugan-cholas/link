import React, { useState, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { Block } from './components/types';
import { DatabaseView, Task } from './components/DatabaseView'
import { SettingsView } from './components/SettingsView'
import { TodoListView } from './components/TodoListView'
import { PluginStore } from './components/PluginStorePanel'
import { WelcomeView } from './components/WelcomeView'
import { usePluginStore } from './hooks/usePluginStore'
import { startAudioCapture, type AudioCaptureSession } from './lib/audioCapture'
import {
  DEFAULT_PAGE_PROPERTIES,
  normalizePageProperties,
  normalizeStringArray,
  PageProperties,
} from '../shared/page-properties'
import {
  type AiGenerationPreferences,
  type AiStatus,
  type AudioCaptureMode,
  type AudioTranscriptionMode,
  type AudioTranscriptionPreferences,
  createDefaultAiStatus,
} from '../shared/ai'

interface Page {
  id: string
  title: string
  parentId?: string | null
  properties: PageProperties
  isFavourite?: boolean; 
  isPinned?: boolean; 
  children?: Page[]
  blocks: Block[]
}

interface ArchivedPage {
  id: string
  title: string
  parentId?: string | null
  updatedAt?: number
}

interface PersistentHistoryResult {
  blocks: Block[]
  focusBlockId?: string | null
  currentRevision?: number
}

interface HistoryFocusRequest {
  pageId: string
  blockId: string | null
  token: number
}

type ThemeMode = 'light' | 'dark'
type MainView = 'page' | 'todo'
const WELCOME_FLAG_KEY = 'link-has-seen-welcome-v1'
const LIVE_TRANSCRIPTION_CHUNK_DURATION_MS = 1000
const AUDIO_TRANSCRIPTION_CANCELLED_ERROR = 'Audio transcription cancelled.'
const BLANK_AUDIO_TOKEN_PATTERN = /\[BLANK_AUDIO\]/gi

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

const flattenPages = (pages: any[], parentTitle: string = ''): any[] => {
  let flat: any[] = [];

  pages.forEach(page => {
    // We add the page and tell it who its parent was
    flat.push({ 
      id: page.id, 
      title: page.title, 
      parentTitle: parentTitle // This is the magic line
    });

    // If this page has children, we flatten them and pass THIS page's title as the new parentTitle
    if (page.children && page.children.length > 0) {
      const nested = flattenPages(page.children, page.title);
      flat = [...flat, ...nested];
    }
  });

  return flat;
};

const flattenPageNodes = (pages: Page[]): Page[] => {
  return pages.flatMap((page) => [page, ...(page.children ? flattenPageNodes(page.children) : [])])
}

const findBlockDeep = (blocks: Block[], targetId: string): Block | null => {
  for (const block of blocks) {
    if (block.id === targetId) {
      return block
    }

    if (block.children) {
      const found = findBlockDeep(block.children, targetId)
      if (found) {
        return found
      }
    }
  }

  return null
}

const updateBlockDeep = (blocks: Block[], targetId: string, updater: (block: Block) => Block): Block[] =>
  blocks.map((block) => {
    if (block.id === targetId) {
      return updater(block)
    }

    if (block.children) {
      return {
        ...block,
        children: updateBlockDeep(block.children, targetId, updater),
      }
    }

    return block
  })

const getVoiceRecorderTargetBlockType = (block: Block): Block['type'] => {
  if (block.type === 'divider' || block.type === 'image' || block.type === 'page_link') {
    return 'text'
  }

  if (block.type === 'column' || block.type === 'column_group') {
    return 'text'
  }

  return block.type
}

const getAppendSeparator = (
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

const mergeBlockContent = (
  existingContent: string,
  generatedContent: string,
  blockType: Block['type']
) => {
  if (!generatedContent) {
    return existingContent
  }

  if (!existingContent) {
    return generatedContent
  }

  return `${existingContent}${getAppendSeparator(existingContent, generatedContent, blockType)}${generatedContent}`
}

const applyBlockUpdate = (
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

const normalizeBlocksForSave = (blocks: Block[]): Block[] =>
  blocks.map((block) => ({
    ...block,
    checked: block.type === 'checklist' ? !!block.checked : undefined,
    children: block.children ? normalizeBlocksForSave(block.children) : undefined,
  }))

const getFirstBlockId = (blocks: Block[]): string | null => {
  for (const block of blocks) {
    if (block.type === 'column_group' || block.type === 'column') {
      const nestedId = getFirstBlockId(block.children || [])
      if (nestedId) {
        return nestedId
      }
      continue
    }

    return block.id
  }

  return null
}

const createDefaultVoiceRecorderState = (): VoiceRecorderState => ({
  pageId: null,
  blockId: null,
  captureMode: 'microphone',
  deviceLabel: '',
  transcriptionMode: 'manual',
  isRecording: false,
  isTranscribing: false,
  elapsedSeconds: 0,
  error: null,
})

const isExpectedEmptyTranscriptionError = (message: string | null | undefined) =>
  message === 'No audio was captured.' || message === 'No speech was detected in the captured audio.'

const isCancelledAudioTranscriptionError = (message: string | null | undefined) =>
  message === AUDIO_TRANSCRIPTION_CANCELLED_ERROR

const sanitizeVoiceRecorderTranscript = (value: string | null | undefined) =>
  (value || '')
    .replace(BLANK_AUDIO_TOKEN_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ==============================
// APP
// ==============================
export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const [mainView, setMainView] = useState<MainView>('page')
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem(WELCOME_FLAG_KEY) !== 'true')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const storedTheme = localStorage.getItem('app-theme-mode')
    return storedTheme === 'dark' ? 'dark' : 'light'
  })
  const pluginStore = usePluginStore()
  const [aiStatus, setAiStatus] = useState<AiStatus>(createDefaultAiStatus())
  const [voiceRecorderState, setVoiceRecorderState] = useState<VoiceRecorderState>(
    createDefaultVoiceRecorderState
  )

  const [pages, setPages] = useState<Page[]>([])
  const [archivedPages, setArchivedPages] = useState<ArchivedPage[]>([])
  const [activePage, setActivePage] = useState<string>('')
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [historyFocusRequest, setHistoryFocusRequest] = useState<HistoryFocusRequest | null>(null)

  const [tasks, setTasks] = useState<Task[]>([])
  const pagesRef = useRef<Page[]>([])
  const voiceRecorderStateRef = useRef<VoiceRecorderState>(createDefaultVoiceRecorderState())
  const voiceRecorderSessionRef = useRef<AudioCaptureSession | null>(null)
  const voiceRecorderSessionTokenRef = useRef(0)
  const voiceRecorderLiveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const voiceRecorderLiveTranscriptRef = useRef('')
  const voiceRecorderActiveTranscriptionRequestIdsRef = useRef<Set<string>>(new Set())
  const pageSaveQueueRef = useRef<Map<string, Promise<unknown>>>(new Map())
  const activeBlockByPageRef = useRef<Record<string, string | null>>({})

  const allFlatPages = React.useMemo(() => flattenPages(pages), [pages]);
  const projectActiveTasks = React.useMemo(
    () => tasks.filter((task) => task.scope === 'project' && !task.isDeleted),
    [tasks]
  )
  const todoActiveTasks = React.useMemo(
    () => tasks.filter((task) => task.scope === 'todo' && !task.isDeleted),
    [tasks]
  )
  const todoDeletedTasks = React.useMemo(
    () => tasks.filter((task) => task.scope === 'todo' && task.isDeleted),
    [tasks]
  )

  // ==============================
  // FIND PAGE
  // ==============================
  const findPageById = (pages: Page[], id: string): Page | null => {
    for (const page of pages) {
      if (page.id === id) return page
      if (page.children) {
        const found = findPageById(page.children, id)
        if (found) return found
      }
    }
    return null
  }

  const currentPage = findPageById(pages, activePage)

  const enqueuePageSave = (pageId: string, task: () => Promise<unknown>) => {
    const previousTask = pageSaveQueueRef.current.get(pageId) ?? Promise.resolve()
    const nextTask = previousTask.catch(() => undefined).then(task)
    pageSaveQueueRef.current.set(pageId, nextTask)

    return nextTask.finally(() => {
      if (pageSaveQueueRef.current.get(pageId) === nextTask) {
        pageSaveQueueRef.current.delete(pageId)
      }
    })
  }

  const waitForPageSaves = async (pageId: string) => {
    await (pageSaveQueueRef.current.get(pageId) ?? Promise.resolve())
  }

  const applyHistoryResultToPage = (pageId: string, result: PersistentHistoryResult | null) => {
    if (!result) {
      return
    }

    const normalizedBlocks = normalizeBlocksForSave(result.blocks || [])
    const fallbackBlockId = result.focusBlockId || activeBlockByPageRef.current[pageId] || getFirstBlockId(normalizedBlocks)

    setPages((prev) => updatePageInTree(prev, pageId, { blocks: normalizedBlocks }))
    setHistoryFocusRequest({
      pageId,
      blockId: fallbackBlockId,
      token: Date.now(),
    })
  }

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    voiceRecorderStateRef.current = voiceRecorderState
  }, [voiceRecorderState])

  const normalizeTaskTimestamp = (value: unknown): number | null => {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  const normalizeTaskScope = (value: unknown): Task['scope'] => {
    return value === 'todo' ? 'todo' : 'project'
  }

  const normalizeTask = (task: Task): Task => ({
    ...task,
    scope: normalizeTaskScope(task.scope),
    assignee: task.assignee ?? '',
    tags: normalizeStringArray(task.tags),
    date: typeof task.date === 'string' && task.date.trim() ? task.date : null,
    isDeleted: !!task.isDeleted,
    completedAt: normalizeTaskTimestamp(task.completedAt),
    deletedAt: normalizeTaskTimestamp(task.deletedAt),
  })

  const normalizeTaskUpdates = (updates: Partial<Task>): Partial<Task> => ({
    ...updates,
    ...(Object.prototype.hasOwnProperty.call(updates, 'scope')
      ? { scope: normalizeTaskScope(updates.scope) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'assignee')
      ? { assignee: updates.assignee ?? '' }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'tags')
      ? { tags: normalizeStringArray(updates.tags) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'date')
      ? { date: typeof updates.date === 'string' && updates.date.trim() ? updates.date : null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'isDeleted')
      ? { isDeleted: !!updates.isDeleted }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'completedAt')
      ? { completedAt: normalizeTaskTimestamp(updates.completedAt) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'deletedAt')
      ? { deletedAt: normalizeTaskTimestamp(updates.deletedAt) }
      : {}),
  })

  const updateTaskInList = (tasks: Task[], id: string, updates: Partial<Task>): Task[] => {
    const normalizedUpdates = normalizeTaskUpdates(updates)

    return tasks.map((task) =>
      task.id === id
        ? normalizeTask({
            ...task,
            ...normalizedUpdates,
          })
        : task
    )
  }

  const selectPage = (id: string) => {
    setActivePage(id)
    if (id) {
      localStorage.setItem('lastOpenedPageId', id)
    } else {
      localStorage.removeItem('lastOpenedPageId')
    }
  }

  const markWelcomeSeen = () => {
    localStorage.setItem(WELCOME_FLAG_KEY, 'true')
    setShowWelcome(false)
  }

  const handlePageSelect = (id: string) => {
    if (showWelcome) {
      markWelcomeSeen()
    }
    setSettingsOpen(false)
    setPluginsOpen(false)
    setMainView('page')
    selectPage(id)
  }

  const handleTodoViewSelect = () => {
    if (showWelcome) {
      markWelcomeSeen()
    }
    setSettingsOpen(false)
    setPluginsOpen(false)
    setMainView('todo')
  }

  const handleOpenPageInNewTab = (id: string) => {
    setOpenTabs((prev) => [...prev.filter((tabId) => tabId !== id), id].slice(-4))
    selectPage(id)
  }

  const handleCloseTab = (id: string) => {
    const nextTabs = openTabs.filter((tabId) => tabId !== id)
    setOpenTabs(nextTabs)

    if (activePage !== id) return

    const fallbackId = nextTabs[nextTabs.length - 1] || allFlatPages[0]?.id || ''
    selectPage(fallbackId)
  }

  // ==============================
  // LOAD TASKS
  // ==============================
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await window.db.getTasks()
        setTasks(data.map(normalizeTask))
      } catch (err) {
        console.error('Failed to load tasks:', err)
      }
    }

    loadTasks()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark')
    localStorage.setItem('app-theme-mode', themeMode)
  }, [themeMode])

  useEffect(() => {
    let isMounted = true
    let unsubscribe: () => void = () => {}

    const syncAiStatus = async () => {
      try {
        const status = await window.ai.getStatus()
        if (isMounted) {
          setAiStatus(status)
        }
      } catch (error) {
        console.error('Failed to load AI status:', error)
      }
    }

    syncAiStatus()
    unsubscribe = window.ai.onStatusChange((status: AiStatus) => {
      if (isMounted) {
        setAiStatus(status)
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  // ==============================
  // BUILD TREE (IMPORTANT FIX)
  // ==============================
  const buildTree = (pages: any[], parentId: string | null = null): Page[] => {
    return pages
    .filter((p: any) => p.parentId === parentId) // ✅ Added (p: any)
    .map((p: any) => ({                         // ✅ Added (p: any)
      id: p.id,
      title: p.title,
      parentId: p.parentId,
      properties: normalizePageProperties(p.properties),
      isFavourite: !!p.isFavourite, 
      isPinned: !!p.isPinned,   
      children: buildTree(pages, p.id),
      blocks: [],
    }))
}

  // ==============================
// LOAD PAGES + BLOCKS (FIXED & PERSISTENT)
// ==============================
const loadPages = async () => {
  try {
    const pagesFromDB = await window.db.getPages();
    const activePagesFromDB = pagesFromDB.filter((page: any) => !page.isArchived);
    const archivedPagesFromDB = pagesFromDB
      .filter((page: any) => page.isArchived)
      .map((page: any) => ({
        id: page.id,
        title: page.title,
        parentId: page.parentId,
        updatedAt: page.updatedAt,
      }))
      .sort((left: ArchivedPage, right: ArchivedPage) => (right.updatedAt || 0) - (left.updatedAt || 0));

    const tree = buildTree(activePagesFromDB);

    const attachBlocks = async (nodes: Page[]): Promise<Page[]> => {
      return Promise.all(
        nodes.map(async (node) => ({
          ...node,
          blocks: (await window.db.getBlocks(node.id))?.map((b: any) => ({
            ...b,
            checked: b.type === 'checklist' ? !!b.checked : undefined,
          })) || [],
          children: await attachBlocks(node.children || []),
        }))
      );
    };

    const finalTree = await attachBlocks(tree);
    setPages(finalTree);
    setArchivedPages(archivedPagesFromDB);

    await Promise.all(
      flattenPageNodes(finalTree).map((page) =>
        window.db.ensurePageHistory(page.id, normalizeBlocksForSave(page.blocks), {
          focusBlockId: activeBlockByPageRef.current[page.id] ?? null,
        })
      )
    )

    return {
      allPages: pagesFromDB,
      activePages: activePagesFromDB,
      activeTree: finalTree,
      archivedPages: archivedPagesFromDB,
    };
  } catch (err) {
    console.error('Failed to load pages:', err);
    setPages([]);
    setArchivedPages([]);
    return {
      allPages: [],
      activePages: [],
      activeTree: [],
      archivedPages: [],
    };
  }
};

// 2. Initial load effect
useEffect(() => {
  const init = async () => {
    const { activePages } = await loadPages();
    
    const savedId = localStorage.getItem('lastOpenedPageId');
    const pageExists = activePages.some((p: any) => p.id === savedId);

    if (savedId && pageExists) {
      setActivePage(savedId);
    } else if (activePages.length > 0) {
      setActivePage(activePages[0].id);
    }
  };
  init();
}, []);

useEffect(() => {
  setOpenTabs((prev) => prev.filter((tabId) => !!findPageById(pages, tabId)))
}, [pages])

  // ==============================
  // PAGE HELPERS
  // ==============================
  const updatePageInTree = (pages: Page[], id: string, updates: Partial<Page>): Page[] => {
    return pages.map((page) => {
      if (page.id === id) return { ...page, ...updates }

      if (page.children) {
        return {
          ...page,
          children: updatePageInTree(page.children, id, updates),
        }
      }

      return page
    })
  }

  const deletePageFromTree = (pages: Page[], id: string): Page[] => {
    return pages
      .filter((page) => page.id !== id)
      .map((page) => ({
        ...page,
        children: page.children ? deletePageFromTree(page.children, id) : undefined,
      }))
  }

  const addPageToTree = (pages: Page[], newPage: Page, parentId?: string): Page[] => {
    if (!parentId) return [...pages, newPage]

    return pages.map((page) => {
      if (page.id === parentId) {
        return {
          ...page,
          children: [...(page.children || []), newPage],
        }
      }

      if (page.children) {
        return {
          ...page,
          children: addPageToTree(page.children, newPage, parentId),
        }
      }

      return page
    })
  }

  // ==============================
  // PAGE ACTIONS (SQLITE FIXED)
  // ==============================
  const handleAddPage = async (parentId?: string) => {
    const newPage = {
      id: Date.now().toString(),
      title: 'Untitled',
      parentId: parentId || null,
      properties: { ...DEFAULT_PAGE_PROPERTIES },
    }

    await window.db.addPage(newPage)
    await loadPages()
    selectPage(newPage.id)
    if (showWelcome) {
      markWelcomeSeen()
    }
  }

  const handleWelcomeDismiss = () => {
    markWelcomeSeen()
  }

  const handleWelcomeCreateFirstPage = async () => {
    await handleAddPage()
  }

  const handleWelcomeOpenTodo = () => {
    markWelcomeSeen()
    setSettingsOpen(false)
    setPluginsOpen(false)
    setMainView('todo')
  }

  const handleDownloadModel = async () => {
    try {
      const nextStatus = await window.ai.downloadModel()
      setAiStatus(nextStatus)
    } catch (error) {
      console.error('Failed to start model download:', error)
    }
  }

  const handleDownloadSpeechModel = async () => {
    try {
      const nextStatus = await window.ai.downloadSpeechModel()
      setAiStatus(nextStatus)
    } catch (error) {
      console.error('Failed to start speech model download:', error)
    }
  }

  const handleDownloadVisionModel = async () => {
    try {
      const nextStatus = await window.ai.downloadVisionModel()
      setAiStatus(nextStatus)
    } catch (error) {
      console.error('Failed to start vision model download:', error)
    }
  }

  const handleTranscriptionPreferencesChange = async (preferences: AudioTranscriptionPreferences) => {
    try {
      const nextStatus = await window.ai.updateTranscriptionPreferences(preferences)
      setAiStatus(nextStatus)
    } catch (error) {
      console.error('Failed to update transcription preferences:', error)
    }
  }

  const handleGenerationPreferencesChange = async (preferences: AiGenerationPreferences) => {
    try {
      const nextStatus = await window.ai.updateGenerationPreferences(preferences)
      setAiStatus(nextStatus)
    } catch (error) {
      console.error('Failed to update AI generation preferences:', error)
    }
  }

  const handleDeletePage = async (id: string) => {
    await window.db.deletePage(id)
    const { activeTree } = await loadPages()

    const nextTabs = openTabs.filter((tabId) => tabId !== id && !!findPageById(activeTree, tabId))
    setOpenTabs(nextTabs)

    if (activePage === id) {
      const fallbackId = nextTabs[nextTabs.length - 1] || activeTree[0]?.id || ''
      selectPage(fallbackId)
    } else if (!findPageById(activeTree, activePage)) {
      const fallbackId = nextTabs[nextTabs.length - 1] || activeTree[0]?.id || ''
      selectPage(fallbackId)
    }
  }

  const handleRestorePage = async (id: string) => {
    await window.db.restorePage(id)
    await loadPages()
  }

  const handleDeletePagePermanently = async (id: string) => {
    await window.db.deletePagePermanently(id)
    await loadPages()
  }

  const handleTitleChange = async (title: string) => {
    setPages((prev) => updatePageInTree(prev, activePage, { title }))
    await window.db.updatePage(activePage, { title })
  }

  const handlePagePropertiesChange = async (properties: PageProperties) => {
    const normalizedProperties = normalizePageProperties(properties)
    setPages((prev) => updatePageInTree(prev, activePage, { properties: normalizedProperties }))
    await window.db.updatePage(activePage, { properties: normalizedProperties })
  }

  const saveBlocksForPage = async (pageId: string, blocks: Block[]) => {
    if (!pageId) {
      return null
    }

    const normalized = normalizeBlocksForSave(blocks)

    setPages((prev) => {
      const nextPages = updatePageInTree(prev, pageId, { blocks: normalized })
      pagesRef.current = nextPages
      return nextPages
    })
    return enqueuePageSave(pageId, async () => {
      return window.db.saveBlocksWithHistory(pageId, normalized, {
        focusBlockId: activeBlockByPageRef.current[pageId] ?? null,
      })
    })
  }

  const saveBlocksWithoutHistory = async (pageId: string, blocks: Block[]) => {
    if (!pageId) {
      return null
    }

    const normalized = normalizeBlocksForSave(blocks)

    setPages((prev) => {
      const nextPages = updatePageInTree(prev, pageId, { blocks: normalized })
      pagesRef.current = nextPages
      return nextPages
    })

    return enqueuePageSave(pageId, async () => window.db.saveBlocks(pageId, normalized))
  }

  const resetVoiceRecorderLiveState = () => {
    voiceRecorderLiveQueueRef.current = Promise.resolve()
    voiceRecorderLiveTranscriptRef.current = ''
    voiceRecorderActiveTranscriptionRequestIdsRef.current.clear()
  }

  const createVoiceRecorderTranscriptionRequestId = (sessionToken: number) =>
    `voice-${sessionToken}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const cancelActiveVoiceRecorderTranscriptions = async () => {
    const activeRequestIds = Array.from(voiceRecorderActiveTranscriptionRequestIdsRef.current)
    if (activeRequestIds.length === 0) {
      return
    }

    await Promise.allSettled(
      activeRequestIds.map((requestId) => window.ai.cancelAudioTranscription(requestId))
    )
  }

  const transcribeVoiceRecorderAudio = async (
    sessionToken: number,
    audioData: Uint8Array,
    captureMode: AudioCaptureMode
  ) => {
    const requestId = createVoiceRecorderTranscriptionRequestId(sessionToken)
    voiceRecorderActiveTranscriptionRequestIdsRef.current.add(requestId)

    try {
      return await window.ai.transcribeAudio({
        requestId,
        audioData,
        captureMode,
      })
    } finally {
      voiceRecorderActiveTranscriptionRequestIdsRef.current.delete(requestId)
    }
  }

  const getCurrentVoiceRecorderBlockContent = (pageId: string, blockId: string) => {
    const page = findPageById(pagesRef.current, pageId)
    const block = page ? findBlockDeep(page.blocks, blockId) : null
    return block?.content ?? null
  }

  const appendTranscriptToVoiceRecorderBlock = async (
    pageId: string,
    blockId: string,
    transcript: string,
    options: {
      saveWithHistory?: boolean
    } = {}
  ) => {
    const normalizedTranscript = sanitizeVoiceRecorderTranscript(transcript)
    if (!normalizedTranscript) {
      return null
    }

    const page = findPageById(pagesRef.current, pageId)
    if (!page) {
      throw new Error('The original page is no longer available.')
    }

    const block = findBlockDeep(page.blocks, blockId)
    if (!block) {
      throw new Error('The original block is no longer available.')
    }

    const targetType = getVoiceRecorderTargetBlockType(block)
    const nextContent = mergeBlockContent(block.content, normalizedTranscript, targetType)
    const updatedBlocks = updateBlockDeep(page.blocks, blockId, (currentBlock) =>
      applyBlockUpdate(currentBlock, targetType, nextContent)
    )

    if (options.saveWithHistory) {
      await saveBlocksForPage(pageId, updatedBlocks)
    } else {
      await saveBlocksWithoutHistory(pageId, updatedBlocks)
    }

    return nextContent
  }

  const queueLiveVoiceRecorderTranscription = (
    sessionToken: number,
    pageId: string,
    blockId: string,
    captureMode: AudioCaptureMode,
    audioData: Uint8Array
  ) => {
    if (audioData.length === 0) {
      return
    }

    voiceRecorderLiveQueueRef.current = voiceRecorderLiveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return
        }

        const response = await transcribeVoiceRecorderAudio(sessionToken, audioData, captureMode)

        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return
        }

        const transcript = sanitizeVoiceRecorderTranscript(response.text)
        if (!transcript) {
          if (
            !isExpectedEmptyTranscriptionError(response.error) &&
            !isCancelledAudioTranscriptionError(response.error)
          ) {
            setVoiceRecorderState((prev) =>
              prev.pageId === pageId && prev.blockId === blockId
                ? {
                    ...prev,
                    error: response.error || 'Unable to transcribe audio.',
                  }
                : prev
            )
          }
          return
        }

        await appendTranscriptToVoiceRecorderBlock(pageId, blockId, transcript)

        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return
        }

        voiceRecorderLiveTranscriptRef.current = voiceRecorderLiveTranscriptRef.current
          ? `${voiceRecorderLiveTranscriptRef.current}\n${transcript}`
          : transcript

        setVoiceRecorderState((prev) =>
          prev.pageId === pageId && prev.blockId === blockId
            ? {
                ...prev,
                error: null,
              }
            : prev
        )
      })
      .catch((error) => {
        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return
        }

        setVoiceRecorderState((prev) =>
          prev.pageId === pageId && prev.blockId === blockId
            ? {
                ...prev,
                error: error instanceof Error ? error.message : 'Unable to transcribe audio.',
              }
            : prev
        )
      })
  }

  const stopVoiceRecorderSession = async () => {
    const activeSession = voiceRecorderSessionRef.current
    voiceRecorderSessionRef.current = null

    if (!activeSession) {
      return {
        fullAudio: new Uint8Array(),
        pendingAudio: new Uint8Array(),
      }
    }

    try {
      return await activeSession.stop()
    } catch {
      return {
        fullAudio: new Uint8Array(),
        pendingAudio: new Uint8Array(),
      }
    }
  }

  const openVoiceRecorder = (pageId: string, blockId: string) => {
    const page = findPageById(pagesRef.current, pageId)
    const block = page ? findBlockDeep(page.blocks, blockId) : null
    if (!block || block.type === 'column' || block.type === 'column_group') {
      return
    }

    const nextCaptureMode = aiStatus.transcriptionPreferences.captureMode
    const nextDeviceLabel = aiStatus.transcriptionPreferences.deviceLabel
    const nextTranscriptionMode = aiStatus.transcriptionPreferences.transcriptionMode

    setVoiceRecorderState((prev) => {
      if (prev.isRecording || prev.isTranscribing) {
        if (prev.pageId === pageId && prev.blockId === blockId) {
          return {
            ...prev,
            error: null,
          }
        }

        return prev
      }

      if (prev.pageId === pageId && prev.blockId === blockId) {
        return {
          ...prev,
          captureMode: nextCaptureMode,
          deviceLabel: nextDeviceLabel,
          transcriptionMode: nextTranscriptionMode,
          error: null,
        }
      }

      return {
        ...createDefaultVoiceRecorderState(),
        pageId,
        blockId,
        captureMode: nextCaptureMode,
        deviceLabel: nextDeviceLabel,
        transcriptionMode: nextTranscriptionMode,
      }
    })
  }

  const startVoiceRecorder = async () => {
    const currentVoiceRecorder = voiceRecorderStateRef.current
    if (
      !currentVoiceRecorder.pageId ||
      !currentVoiceRecorder.blockId ||
      currentVoiceRecorder.isRecording ||
      currentVoiceRecorder.isTranscribing
    ) {
      return
    }

    const preferences = aiStatus.transcriptionPreferences
    const sessionToken = voiceRecorderSessionTokenRef.current + 1
    voiceRecorderSessionTokenRef.current = sessionToken
    resetVoiceRecorderLiveState()

    try {
      const session = await startAudioCapture(
        preferences,
        preferences.transcriptionMode === 'live'
          ? {
              chunkDurationMs: LIVE_TRANSCRIPTION_CHUNK_DURATION_MS,
              onChunk: (audioData) => {
                queueLiveVoiceRecorderTranscription(
                  sessionToken,
                  currentVoiceRecorder.pageId!,
                  currentVoiceRecorder.blockId!,
                  preferences.captureMode,
                  audioData
                )
              },
            }
          : {}
      )
      voiceRecorderSessionRef.current = session

      setVoiceRecorderState((prev) =>
        prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
          ? {
              ...prev,
              captureMode: preferences.captureMode,
              deviceLabel: preferences.deviceLabel,
              transcriptionMode: preferences.transcriptionMode,
              isRecording: true,
              isTranscribing: false,
              elapsedSeconds: 0,
              error: null,
            }
          : prev
      )
    } catch (error) {
      setVoiceRecorderState((prev) =>
        prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
          ? {
              ...prev,
              transcriptionMode: preferences.transcriptionMode,
              isRecording: false,
              isTranscribing: false,
              error: error instanceof Error ? error.message : 'Unable to start audio capture.',
            }
          : prev
      )
    }
  }

  const stopVoiceRecorder = async (): Promise<VoiceRecorderStopResult | null> => {
    const currentVoiceRecorder = voiceRecorderStateRef.current
    if (
      !currentVoiceRecorder.pageId ||
      !currentVoiceRecorder.blockId ||
      !currentVoiceRecorder.isRecording
    ) {
      return null
    }

    const sessionToken = voiceRecorderSessionTokenRef.current

    setVoiceRecorderState((prev) =>
      prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
        ? {
            ...prev,
            isRecording: false,
            isTranscribing: true,
            error: null,
          }
        : prev
    )

    try {
      const { fullAudio, pendingAudio } = await stopVoiceRecorderSession()

      if (currentVoiceRecorder.transcriptionMode === 'live') {
        await voiceRecorderLiveQueueRef.current.catch(() => undefined)

        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return null
        }

        if (pendingAudio.length > 0) {
          const pendingResponse = await transcribeVoiceRecorderAudio(
            sessionToken,
            pendingAudio,
            currentVoiceRecorder.captureMode
          )

          if (voiceRecorderSessionTokenRef.current !== sessionToken) {
            return null
          }

          const pendingTranscript = sanitizeVoiceRecorderTranscript(pendingResponse.text)
          if (pendingTranscript) {
            await appendTranscriptToVoiceRecorderBlock(
              currentVoiceRecorder.pageId,
              currentVoiceRecorder.blockId,
              pendingTranscript
            )
            if (voiceRecorderSessionTokenRef.current !== sessionToken) {
              return null
            }
            voiceRecorderLiveTranscriptRef.current = voiceRecorderLiveTranscriptRef.current
              ? `${voiceRecorderLiveTranscriptRef.current}\n${pendingTranscript}`
              : pendingTranscript
          } else if (
            !isExpectedEmptyTranscriptionError(pendingResponse.error) &&
            !isCancelledAudioTranscriptionError(pendingResponse.error)
          ) {
            throw new Error(pendingResponse.error || 'Unable to transcribe audio.')
          }
        }

        const hasLiveTranscript = voiceRecorderLiveTranscriptRef.current.trim().length > 0
        if (!hasLiveTranscript) {
          voiceRecorderSessionTokenRef.current += 1
          resetVoiceRecorderLiveState()
          setVoiceRecorderState((prev) =>
            prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
              ? {
                  ...prev,
                  isRecording: false,
                  isTranscribing: false,
                  error: 'No transcript was returned.',
                }
              : prev
          )

          return {
            pageId: currentVoiceRecorder.pageId,
            blockId: currentVoiceRecorder.blockId,
            nextContent: null,
          }
        }

        const livePage = findPageById(pagesRef.current, currentVoiceRecorder.pageId)
        if (!livePage) {
          throw new Error('The original page is no longer available.')
        }

        await saveBlocksForPage(currentVoiceRecorder.pageId, livePage.blocks)
        if (voiceRecorderSessionTokenRef.current !== sessionToken) {
          return null
        }
        const nextContent = getCurrentVoiceRecorderBlockContent(
          currentVoiceRecorder.pageId,
          currentVoiceRecorder.blockId
        )

        voiceRecorderSessionTokenRef.current += 1
        resetVoiceRecorderLiveState()
        setVoiceRecorderState(createDefaultVoiceRecorderState())

        return {
          pageId: currentVoiceRecorder.pageId,
          blockId: currentVoiceRecorder.blockId,
          nextContent,
        }
      }

      const response = await transcribeVoiceRecorderAudio(
        sessionToken,
        fullAudio,
        currentVoiceRecorder.captureMode
      )

      if (voiceRecorderSessionTokenRef.current !== sessionToken) {
        return null
      }

      const finalizedTranscript = sanitizeVoiceRecorderTranscript(response.text)

      if (!finalizedTranscript) {
        voiceRecorderSessionTokenRef.current += 1
        resetVoiceRecorderLiveState()
        setVoiceRecorderState((prev) =>
          prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
            ? {
                ...prev,
                isRecording: false,
                isTranscribing: false,
                error: response.error || 'No transcript was returned.',
              }
            : prev
        )

        return {
          pageId: currentVoiceRecorder.pageId,
          blockId: currentVoiceRecorder.blockId,
          nextContent: null,
        }
      }

      const nextContent = await appendTranscriptToVoiceRecorderBlock(
        currentVoiceRecorder.pageId,
        currentVoiceRecorder.blockId,
        finalizedTranscript,
        {
          saveWithHistory: true,
        }
      )

      if (voiceRecorderSessionTokenRef.current !== sessionToken) {
        return null
      }

      voiceRecorderSessionTokenRef.current += 1
      resetVoiceRecorderLiveState()
      setVoiceRecorderState(createDefaultVoiceRecorderState())

      return {
        pageId: currentVoiceRecorder.pageId,
        blockId: currentVoiceRecorder.blockId,
        nextContent,
      }
    } catch (error) {
      voiceRecorderSessionTokenRef.current += 1
      resetVoiceRecorderLiveState()
      setVoiceRecorderState((prev) =>
        prev.pageId === currentVoiceRecorder.pageId && prev.blockId === currentVoiceRecorder.blockId
          ? {
              ...prev,
              isRecording: false,
              isTranscribing: false,
              error: error instanceof Error ? error.message : 'Unable to transcribe audio.',
            }
          : prev
      )

      return {
        pageId: currentVoiceRecorder.pageId,
        blockId: currentVoiceRecorder.blockId,
        nextContent: null,
      }
    }
  }

  const cancelVoiceRecorder = async () => {
    const currentVoiceRecorder = voiceRecorderStateRef.current
    if (!currentVoiceRecorder.pageId || !currentVoiceRecorder.blockId) {
      return null
    }

    voiceRecorderSessionTokenRef.current += 1
    await stopVoiceRecorderSession()
    await cancelActiveVoiceRecorderTranscriptions()
    resetVoiceRecorderLiveState()
    setVoiceRecorderState(createDefaultVoiceRecorderState())

    return {
      pageId: currentVoiceRecorder.pageId,
      blockId: currentVoiceRecorder.blockId,
    }
  }

  const handleBlocksChange = async (blocks: Block[]) => {
    await saveBlocksForPage(activePage, blocks)
  }

  const handleUndoBlocks = async (pageId: string) => {
    if (!pageId) {
      return
    }

    await waitForPageSaves(pageId)
    const result = await window.db.undoBlocks(pageId)
    applyHistoryResultToPage(pageId, result as PersistentHistoryResult | null)
  }

  const handleRedoBlocks = async (pageId: string) => {
    if (!pageId) {
      return
    }

    await waitForPageSaves(pageId)
    const result = await window.db.redoBlocks(pageId)
    applyHistoryResultToPage(pageId, result as PersistentHistoryResult | null)
  }

  const handleActiveBlockChange = (pageId: string, blockId: string | null) => {
    activeBlockByPageRef.current[pageId] = blockId
  }

  const handleTogglePin = async (id: string) => {
  const page = findPageById(pages, id);
  if (!page) return;
  const newStatus = !page.isPinned;
  await window.db.updatePage(id, { isPinned: newStatus ? 1 : 0 });
  await loadPages(); // ✅ This works now!
};

const handleToggleFavourite = async (id: string) => {
  const page = findPageById(pages, id);
  if (!page) return;
  const newStatus = !page.isFavourite;
  await window.db.updatePage(id, { isFavourite: newStatus ? 1 : 0 });
  await loadPages(); // ✅ This works now!
};

  useEffect(() => {
    if (!voiceRecorderState.isRecording) {
      return
    }

    const interval = window.setInterval(() => {
      setVoiceRecorderState((prev) =>
        prev.isRecording
          ? {
              ...prev,
              elapsedSeconds: prev.elapsedSeconds + 1,
            }
          : prev
      )
    }, 1000)

    return () => window.clearInterval(interval)
  }, [voiceRecorderState.isRecording])

  useEffect(() => {
    return () => {
      void stopVoiceRecorderSession()
    }
  }, [])

  useEffect(() => {
    const handleHistoryHotkeys = (event: KeyboardEvent) => {
      if (settingsOpen || pluginsOpen || mainView !== 'page' || !activePage) {
        return
      }

      const target = event.target
      const targetElement = target instanceof HTMLElement ? target : null
      const isBlockTarget =
        (targetElement instanceof HTMLTextAreaElement && targetElement.matches('textarea[data-block-id]')) ||
        !!targetElement?.closest('[data-block-id]')

      if (!isBlockTarget) {
        return
      }

      const usesModifier = event.ctrlKey || event.metaKey
      if (!usesModifier || event.altKey) {
        return
      }

      const normalizedKey = event.key.toLowerCase()
      const isUndo = normalizedKey === 'z' && !event.shiftKey
      const isRedo = normalizedKey === 'z' && event.shiftKey

      if (!isUndo && !isRedo) {
        return
      }

      event.preventDefault()

      if (isUndo) {
        void handleUndoBlocks(activePage)
        return
      }

      void handleRedoBlocks(activePage)
    }

    window.addEventListener('keydown', handleHistoryHotkeys, true)
    return () => window.removeEventListener('keydown', handleHistoryHotkeys, true)
  }, [activePage, mainView, pluginsOpen, settingsOpen])


  // ==============================
  // TASKS
  // ==============================
  const handleAddTask = async (status?: Task['status'], seed: Partial<Task> = {}) => {
    const newTask = normalizeTask({
      id: Date.now().toString(),
      title: seed.title || 'New Task',
      status: seed.status || status || 'todo',
      priority: seed.priority || 'medium',
      scope: seed.scope || 'project',
      assignee: seed.assignee ?? '',
      tags: seed.tags || [],
      date: seed.date ?? null,
      isDeleted: false,
      completedAt: seed.status === 'done' || status === 'done' ? Date.now() : null,
      deletedAt: null,
    })

    await window.db.addTask(newTask)
    setTasks((prev) => [...prev, newTask])
  }

  const handleAddUpcoming = async () => {
    const nextDay = new Date()
    nextDay.setDate(nextDay.getDate() + 1)
    const upcomingDate = [
      nextDay.getFullYear(),
      String(nextDay.getMonth() + 1).padStart(2, '0'),
      String(nextDay.getDate()).padStart(2, '0'),
    ].join('-')

    await handleAddTask('todo', {
      title: 'Upcoming Task',
      scope: 'project',
      date: upcomingDate,
    })
  }

  const handleAddTodoTask = async (status?: Task['status'], seed: Partial<Task> = {}) => {
    await handleAddTask(status, {
      ...seed,
      scope: 'todo',
    })
  }

  const handleAddProjectTask = async (status?: Task['status'], seed: Partial<Task> = {}) => {
    await handleAddTask(status, {
      ...seed,
      scope: 'project',
    })
  }

  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    const normalizedUpdates = normalizeTaskUpdates(updates)
    const currentTask = tasks.find((task) => task.id === id) || null
    const optimisticUpdates = {
      ...normalizedUpdates,
      ...(Object.prototype.hasOwnProperty.call(normalizedUpdates, 'status')
        ? {
            completedAt:
              normalizedUpdates.status === 'done'
                ? currentTask?.completedAt ?? Date.now()
                : null,
          }
        : {}),
    }

    setTasks((prev) => updateTaskInList(prev, id, optimisticUpdates))
    await window.db.updateTask(id, normalizedUpdates)
  }

  const handleDeleteTask = async (id: string) => {
    await window.db.deleteTask(id)
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? normalizeTask({
              ...task,
              isDeleted: true,
              deletedAt: Date.now(),
            })
          : task
      )
    )
  }

  const handleRestoreTask = async (id: string) => {
    await window.db.restoreTask(id)
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? normalizeTask({
              ...task,
              isDeleted: false,
              deletedAt: null,
            })
          : task
      )
    )
  }

  const handleDeleteTaskPermanently = async (id: string) => {
    await window.db.deleteTaskPermanently(id)
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }

  const handleMovePage = async (draggedId: string, targetParentId: string | null) => {
    try {
      // 1. Update the parentId in SQLite (null = move to top level)
      await window.db.updatePage(draggedId, { parentId: targetParentId });

      // 2. Refresh the UI using your helper
      await loadPages(); 
    } catch (err) {
      console.error("Failed to move page:", err);
    }
  };


  // ==============================
  // UI
  // ==============================
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        pages={pages}
        activePageId={activePage}
        onSelectPage={handlePageSelect}
        openTabs={openTabs}
        onCloseTab={handleCloseTab}
        isSettingsOpen={settingsOpen}
        isPluginsOpen={pluginsOpen}
        isTodoView={mainView === 'todo'}
        isWelcomeOpen={showWelcome && !settingsOpen && !pluginsOpen && mainView === 'page'}
        onToggleSettings={() => {
          setPluginsOpen(false)
          setSettingsOpen((prev) => !prev)
        }}
        onTogglePlugins={() => {
          setSettingsOpen(false)
          setPluginsOpen((prev) => !prev)
        }}
      />

      {settingsOpen ? (
        <SettingsView
          themeMode={themeMode}
          onThemeChange={setThemeMode}
          aiStatus={aiStatus}
          onDownloadModel={handleDownloadModel}
          onDownloadVisionModel={handleDownloadVisionModel}
          onDownloadSpeechModel={handleDownloadSpeechModel}
          onTranscriptionPreferencesChange={handleTranscriptionPreferencesChange}
          onGenerationPreferencesChange={handleGenerationPreferencesChange}
        />
      ) : pluginsOpen ? (
        <PluginStore {...pluginStore} />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            pages={pages}
            archivedPages={archivedPages}
            onAddPage={handleAddPage}
            onSelectPage={handlePageSelect}
            activePage={mainView === 'page' ? activePage : null}
            onDeletePage={handleDeletePage}
            onRestorePage={handleRestorePage}
            onDeletePagePermanently={handleDeletePagePermanently}
            onMovePage={handleMovePage}
            onTogglePin={handleTogglePin}          
            onToggleFavourite={handleToggleFavourite} 
            onOpenInNewTab={handleOpenPageInNewTab}
            onSelectTodoView={handleTodoViewSelect}
            isTodoView={mainView === 'todo'}
          />

          <div className="flex-1 flex flex-col overflow-hidden">
            {showWelcome && mainView === 'page' ? (
              <WelcomeView
                hasPages={pages.length > 0}
                onCreateFirstPage={handleWelcomeCreateFirstPage}
                onOpenTodoList={handleWelcomeOpenTodo}
                onDismiss={handleWelcomeDismiss}
              />
            ) : mainView === 'todo' ? (
              <TodoListView
                tasks={todoActiveTasks}
                deletedTasks={todoDeletedTasks}
                onAddTask={handleAddTodoTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onRestoreTask={handleRestoreTask}
                onDeleteTaskPermanently={handleDeleteTaskPermanently}
              />
            ) : currentPage ? (
              <>
                <div className="flex-1 w-full overflow-y-auto custom-scrollbar">
                  <Editor
                    pageId={currentPage.id}
                    pageTitle={currentPage.title}
                    blocks={currentPage.blocks}
                    historyFocusRequest={
                      historyFocusRequest?.pageId === currentPage.id ? historyFocusRequest : null
                    }
                    voiceRecorderState={voiceRecorderState}
                    onTitleChange={handleTitleChange}
                    onBlocksChange={handleBlocksChange}
                    onActiveBlockChange={(blockId) => handleActiveBlockChange(currentPage.id, blockId)}
                    onNavigate={handlePageSelect}
                    onOpenVoiceRecorder={openVoiceRecorder}
                    onStartVoiceRecorder={startVoiceRecorder}
                    onStopVoiceRecorder={stopVoiceRecorder}
                    onCancelVoiceRecorder={cancelVoiceRecorder}
                    allPages={allFlatPages} 
                  />
                </div>

                <div className="border-t border-border">
                  <DatabaseView
                    tasks={projectActiveTasks}
                    currentPage={currentPage ? {
                      id: currentPage.id,
                      title: currentPage.title,
                      properties: currentPage.properties,
                    } : null}
                    onAddTask={handleAddProjectTask}
                    onAddUpcoming={handleAddUpcoming}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onPagePropertiesChange={handlePagePropertiesChange}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p>No page selected. Create a new page to get started.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <Toaster
        closeButton={false}
        duration={3200}
        expand={false}
        position="top-right"
        richColors={false}
        theme={themeMode}
        visibleToasts={3}
      />
    </div>
  )
}
