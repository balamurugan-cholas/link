const { contextBridge, ipcRenderer } = require('electron')
import type { PageProperties } from '../src/shared/page-properties'
import type {
  AiGenerationPreferences,
  AudioCaptureSource,
  AudioTranscriptionPreferences,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  AiStatus,
  GhostTextRequest,
  GhostTextResponse,
  InlineAgentEvent,
  InlineAgentRequest,
} from '../src/shared/ai'
import type {
  InstalledPluginState,
  PluginInstallRequest,
  PluginStateChangeEvent,
} from '../src/shared/plugins'

// ==============================
// TYPES
// ==============================
type Task = {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  scope?: 'todo' | 'project'
  assignee?: string
  tags: string[]
  date?: string | null
  isDeleted?: boolean
  completedAt?: number | null
  deletedAt?: number | null
}

type Page = {
  id: string
  title: string
  parentId?: string | null
  properties?: PageProperties
  isArchived?: boolean
  isFavourite?: number
  isPinned?: number
  createdAt?: number
  updatedAt?: number
}

type Block = {
  id: string
  pageId: string
  type: string
  content: string
  position?: number
}

// ==============================
// SAFE DB API
// ==============================
contextBridge.exposeInMainWorld('db', {
  // ======================
  // TASKS
  // ======================
  getTasks: (): Promise<Task[]> => ipcRenderer.invoke('db:getTasks'),

  addTask: (task: Task): Promise<boolean> =>
    ipcRenderer.invoke('db:addTask', task),

  updateTask: (
    id: string,
    updates: Partial<Task>
  ): Promise<boolean> =>
    ipcRenderer.invoke('db:updateTask', { id, updates }),

  deleteTask: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deleteTask', id),

  restoreTask: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:restoreTask', id),

  deleteTaskPermanently: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deleteTaskPermanently', id),

  // ======================
  // PAGES (NOTES)
  // ======================
  getPages: (): Promise<Page[]> =>
    ipcRenderer.invoke('db:getPages'),

  addPage: (page: Page): Promise<boolean> =>
    ipcRenderer.invoke('db:addPage', page),

  updatePage: (
    id: string,
    updates: Partial<Page>
  ): Promise<boolean> =>
    ipcRenderer.invoke('db:updatePage', { id, updates }),

  deletePage: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deletePage', id),

  restorePage: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:restorePage', id),

  deletePagePermanently: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deletePagePermanently', id),

  // ======================
  // BLOCKS (EDITOR CONTENT)
  // ======================
  getBlocks: (pageId: string): Promise<Block[]> =>
    ipcRenderer.invoke('db:getBlocks', pageId),

  saveBlocks: (
    pageId: string,
    blocks: Block[]
  ): Promise<boolean> =>
    ipcRenderer.invoke('db:saveBlocks', { pageId, blocks }),

  saveBlocksWithHistory: (
    pageId: string,
    blocks: Block[],
    history?: { focusBlockId?: string | null }
  ): Promise<{
    blocks: Block[]
    focusBlockId?: string | null
    currentRevision?: number
  } | null> =>
    ipcRenderer.invoke('db:saveBlocksWithHistory', { pageId, blocks, history }),

  ensurePageHistory: (
    pageId: string,
    blocks: Block[],
    history?: { focusBlockId?: string | null }
  ): Promise<{
    blocks: Block[]
    focusBlockId?: string | null
    currentRevision?: number
  } | null> =>
    ipcRenderer.invoke('db:ensurePageHistory', { pageId, blocks, history }),

  undoBlocks: (
    pageId: string
  ): Promise<{
    blocks: Block[]
    focusBlockId?: string | null
    currentRevision?: number
  } | null> =>
    ipcRenderer.invoke('db:undoBlocks', pageId),

  redoBlocks: (
    pageId: string
  ): Promise<{
    blocks: Block[]
    focusBlockId?: string | null
    currentRevision?: number
  } | null> =>
    ipcRenderer.invoke('db:redoBlocks', pageId),
})

// ==============================
// WINDOW CONTROLS
// ==============================
const allowedElectronInvokeChannels = new Set([
  'plugins:listInstalled',
  'plugins:install',
  'plugins:remove',
  'plugins:disable',
  'plugins:enable',
])

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isMac: process.platform === 'darwin',
  windowControl: (action: 'minimize' | 'maximize' | 'close') => {
    ipcRenderer.send('window-control', action)
  },
  ipcRenderer: {
    invoke: (channel: string, payload?: unknown) => {
      if (!allowedElectronInvokeChannels.has(channel)) {
        return Promise.reject(new Error(`Unsupported IPC channel: ${channel}`))
      }

      return ipcRenderer.invoke(channel, payload)
    },
  },
})

contextBridge.exposeInMainWorld('plugins', {
  getState: (): Promise<InstalledPluginState[]> => ipcRenderer.invoke('plugins:getState'),

  install: (payload: PluginInstallRequest): Promise<unknown> =>
    ipcRenderer.invoke('plugins:install', payload),

  remove: (payload: { filename?: string; name?: string }): Promise<unknown> =>
    ipcRenderer.invoke('plugins:remove', payload),

  disable: (pluginId: string): Promise<unknown> =>
    ipcRenderer.invoke('plugins:disable', pluginId),

  enable: (pluginId: string): Promise<unknown> =>
    ipcRenderer.invoke('plugins:enable', pluginId),

  onStateChanged: (listener: (event: PluginStateChangeEvent) => void) => {
    const handler = (_event: unknown, event: PluginStateChangeEvent) => {
      listener(event)
    }

    ipcRenderer.on('plugins:changed', handler)

    return () => {
      ipcRenderer.removeListener('plugins:changed', handler)
    }
  },
})

contextBridge.exposeInMainWorld('ai', {
  getStatus: (): Promise<AiStatus> => ipcRenderer.invoke('ai:getStatus'),

  downloadModel: (): Promise<AiStatus> => ipcRenderer.invoke('ai:downloadModel'),

  downloadVisionModel: (): Promise<AiStatus> => ipcRenderer.invoke('ai:downloadVisionModel'),

  downloadSpeechModel: (): Promise<AiStatus> => ipcRenderer.invoke('ai:downloadSpeechModel'),

  generateGhostText: (request: GhostTextRequest): Promise<GhostTextResponse> =>
    ipcRenderer.invoke('ai:generateGhostText', request),

  runInlineAgent: (request: InlineAgentRequest): Promise<void> =>
    ipcRenderer.invoke('ai:runInlineAgent', request),

  cancelInlineAgent: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('ai:cancelInlineAgent', requestId),

  updateTranscriptionPreferences: (preferences: AudioTranscriptionPreferences): Promise<AiStatus> =>
    ipcRenderer.invoke('ai:updateTranscriptionPreferences', preferences),

  updateGenerationPreferences: (preferences: AiGenerationPreferences): Promise<AiStatus> =>
    ipcRenderer.invoke('ai:updateGenerationPreferences', preferences),

  transcribeAudio: (request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> =>
    ipcRenderer.invoke('ai:transcribeAudio', request),

  cancelAudioTranscription: (requestId: string): Promise<void> =>
    ipcRenderer.invoke('ai:cancelAudioTranscription', requestId),

  getSystemAudioSources: (): Promise<AudioCaptureSource[]> =>
    ipcRenderer.invoke('ai:getSystemAudioSources'),

  onStatusChange: (listener: (status: AiStatus) => void) => {
    const handler = (_event: unknown, status: AiStatus) => {
      listener(status)
    }

    ipcRenderer.on('ai:status', handler)

    return () => {
      ipcRenderer.removeListener('ai:status', handler)
    }
  },

  onInlineAgentEvent: (listener: (event: InlineAgentEvent) => void) => {
    const handler = (_event: unknown, event: InlineAgentEvent) => {
      listener(event)
    }

    ipcRenderer.on('ai:inlineAgentEvent', handler)

    return () => {
      ipcRenderer.removeListener('ai:inlineAgentEvent', handler)
    }
  },
})

// ==============================
// SAFE EVENTS (OPTIONAL)
// ==============================
contextBridge.exposeInMainWorld('events', {
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const handler = (_event: any, ...args: unknown[]) => {
      listener(...args)
    }

    ipcRenderer.on(channel, handler)

    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },

  off: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
})
