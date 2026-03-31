import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as http from 'node:http'
import * as net from 'node:net'
import path from 'node:path'
import * as https from 'node:https'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import fs from 'fs'
import {
  DEFAULT_PAGE_PROPERTIES,
  normalizeStringArray,
  parsePageProperties,
  serializePageProperties,
} from '../src/shared/page-properties'
import {
  createDefaultAiStatus,
  LOCAL_MODEL_DOWNLOAD_URL,
  LOCAL_MODEL_FILENAME,
  LOCAL_VISION_MODEL_DOWNLOAD_URL,
  LOCAL_VISION_MODEL_FILENAME,
  LOCAL_VISION_PROJECTOR_DOWNLOAD_URL,
  LOCAL_VISION_PROJECTOR_FILENAME,
  WHISPER_MODEL_DOWNLOAD_URL,
  WHISPER_MODEL_FILENAME,
  normalizeAiGenerationPreferences,
  normalizeAudioTranscriptionPreferences,
  type AiAnswerLength,
  type AiGenerationPreferences,
  type AudioCaptureSource,
  type AudioTranscriptionPreferences,
  type AudioTranscriptionRequest,
  type AudioTranscriptionResponse,
  type AiStatus,
  type GhostTextRequest,
  type GhostTextResponse,
  type InlineAgentRequest,
} from '../src/shared/ai'
import type {
  InstalledPluginState,
  PluginStateChangeEvent,
  PluginStateChangeReason,
} from '../src/shared/plugins'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT!, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT!, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT!, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null
let db: Database
let aiStatus: AiStatus = createDefaultAiStatus()
let aiDownloadPromise: Promise<void> | null = null
let visionDownloadPromise: Promise<void> | null = null
let visionRuntimeDownloadPromise: Promise<string> | null = null
let speechDownloadPromise: Promise<void> | null = null
let aiStartPromise: Promise<unknown> | null = null
let aiRuntime: {
  llama: any
  model: any
} | null = null
let visionServerStartPromise: Promise<string> | null = null
let visionServerProcess: ChildProcessWithoutNullStreams | null = null
let visionServerPort: number | null = null
let visionServerStopRequested = false
let visionInputServer: http.Server | null = null
let visionInputServerPort: number | null = null
let visionInputServerStartPromise: Promise<number> | null = null
const IS_MACOS = process.platform === 'darwin'
const IS_WINDOWS = process.platform === 'win32'
const PRIMARY_SHORTCUT_LABEL = IS_MACOS ? 'Cmd' : 'Ctrl'
const loadedPluginModules = new Map<string, unknown>()
const inlineAgentControllers = new Map<string, AbortController>()
const activeAudioTranscriptionChildren = new Map<string, ChildProcessWithoutNullStreams>()
const cancelledAudioTranscriptionIds = new Set<string>()
let pluginDirectoryWatcher: fs.FSWatcher | null = null
let pluginDirectoryWatchDebounce: NodeJS.Timeout | null = null
let pluginSyncQueue = Promise.resolve<InstalledPluginState[]>([])
const APP_SETTING_TRANSCRIPTION_PREFERENCES = 'audio_transcription_preferences'
const APP_SETTING_GENERATION_PREFERENCES = 'ai_generation_preferences'
const APP_SETTING_DISABLED_PLUGINS = 'disabled_plugins'
const MAX_PAGE_HISTORY_ENTRIES = 250
const VISION_SERVER_MODEL_ALIAS = 'minicpm-v-4_5-local'
const VISION_SERVER_HEALTH_TIMEOUT_MS = 180000
const VISION_SERVER_POLL_INTERVAL_MS = 600
const LLAMA_RUNTIME_RELEASE_TAG = 'b8589'
const LLAMA_SERVER_BINARY_NAME = IS_WINDOWS ? 'llama-server.exe' : 'llama-server'
const WHISPER_RUNTIME_FILENAME = IS_WINDOWS ? 'whisper-cli.exe' : 'whisper-cli'
const WHISPER_RUNTIME_ARCHIVE_NAME = 'whisper-bin-x64.zip'
const WHISPER_RUNTIME_DOWNLOAD_URL =
  'https://sourceforge.net/projects/whisper-cpp.mirror/files/v1.8.0/whisper-bin-x64.zip/download'

const parseTaskTags = (value: unknown): string[] => {
  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeStringArray(JSON.parse(value))
    } catch {
      return []
    }
  }

  return normalizeStringArray(value)
}

const normalizeTaskDate = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value : null
}

const normalizeTaskTimestamp = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const normalizeTaskScope = (value: unknown): 'todo' | 'project' => {
  return value === 'todo' ? 'todo' : 'project'
}

const serializeTaskTags = (value: unknown): string => {
  return JSON.stringify(normalizeStringArray(value))
}

const parseTaskRow = (task: any) => ({
  ...task,
  scope: normalizeTaskScope(task.scope),
  assignee: task.assignee ?? '',
  tags: parseTaskTags(task.tags),
  date: normalizeTaskDate(task.date),
  isDeleted: !!task.isDeleted,
  completedAt: normalizeTaskTimestamp(task.completedAt),
  deletedAt: normalizeTaskTimestamp(task.deletedAt),
})

const parsePageRow = (page: any) => ({
  ...page,
  isArchived: !!page.isArchived,
  isFavourite: !!page.isFavourite,
  isPinned: !!page.isPinned,
  properties: parsePageProperties(page.properties),
})

const normalizeHistoryFocusBlockId = (value: unknown): string | null => {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const normalizeHistoryBlocks = (blocks: unknown): any[] => {
  if (!Array.isArray(blocks)) {
    return []
  }

  return blocks.map((block, index) => {
    const rawBlock = block as Record<string, unknown>
    const normalizedType = typeof rawBlock.type === 'string' && rawBlock.type.trim()
      ? rawBlock.type.trim()
      : 'text'

    return {
      id:
        typeof rawBlock.id === 'string' && rawBlock.id.trim()
          ? rawBlock.id.trim()
          : `history-block-${Date.now()}-${index}`,
      type: normalizedType,
      content: typeof rawBlock.content === 'string' ? rawBlock.content : '',
      checked: normalizedType === 'checklist' ? !!rawBlock.checked : undefined,
      children:
        Array.isArray(rawBlock.children) && rawBlock.children.length > 0
          ? normalizeHistoryBlocks(rawBlock.children)
          : undefined,
      width:
        typeof rawBlock.width === 'string' || typeof rawBlock.width === 'number'
          ? rawBlock.width
          : undefined,
      refId:
        typeof rawBlock.refId === 'string' && rawBlock.refId.trim()
          ? rawBlock.refId.trim()
          : undefined,
    }
  })
}

const serializePageHistoryBlocks = (blocks: unknown) => JSON.stringify(normalizeHistoryBlocks(blocks))

const parsePageHistoryBlocks = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    return normalizeHistoryBlocks(JSON.parse(value))
  } catch {
    return []
  }
}

const getPageTreeIds = (rootId: string): string[] => {
  const pageIds = new Set<string>()
  const pending = [rootId]
  const findChildren = db.prepare('SELECT id FROM pages WHERE parentId = ?')

  while (pending.length > 0) {
    const currentId = pending.pop()!
    if (pageIds.has(currentId)) continue

    pageIds.add(currentId)

    const children = findChildren.all(currentId) as Array<{ id: string }>
    children.forEach((child) => pending.push(child.id))
  }

  return Array.from(pageIds)
}

const runPageIdsUpdate = (sql: string, ids: string[], params: unknown[] = []) => {
  if (ids.length === 0) return

  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(sql.replace('__IDS__', placeholders)).run(...params, ...ids)
}

const persistBlocksForPage = (pageId: string, blocks: unknown) => {
  const normalizedBlocks = normalizeHistoryBlocks(blocks)
  const deleteStmt = db.prepare('DELETE FROM blocks WHERE pageId = ?')
  const insertStmt = db.prepare(`
    INSERT INTO blocks (id, pageId, parentId, type, content, position, width, checked, refId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const saveBlock = (block: any, index: number, parentId: string | null = null) => {
    insertStmt.run(
      block.id,
      pageId,
      parentId,
      block.type,
      block.content,
      index,
      block.width ?? 100,
      block.checked ? 1 : 0,
      block.refId ?? null
    )

    if (Array.isArray(block.children)) {
      block.children.forEach((child: any, childIndex: number) => {
        saveBlock(child, childIndex, block.id)
      })
    }
  }

  deleteStmt.run(pageId)
  normalizedBlocks.forEach((block, index) => saveBlock(block, index))

  return normalizedBlocks
}

const getPageHistoryState = (pageId: string) =>
  db.prepare('SELECT currentRevision FROM page_history_state WHERE pageId = ?').get(pageId) as
    | { currentRevision: number }
    | undefined

const getPageHistoryEntryByRevision = (pageId: string, revision: number) =>
  db
    .prepare('SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision = ?')
    .get(pageId, revision) as
    | { revision: number; blocks: string; focusBlockId: string | null }
    | undefined

const getAdjacentPageHistoryEntry = (pageId: string, currentRevision: number, direction: 'undo' | 'redo') =>
  db
    .prepare(
      direction === 'undo'
        ? 'SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision < ? ORDER BY revision DESC LIMIT 1'
        : 'SELECT revision, blocks, focusBlockId FROM page_history WHERE pageId = ? AND revision > ? ORDER BY revision ASC LIMIT 1'
    )
    .get(pageId, currentRevision) as
    | { revision: number; blocks: string; focusBlockId: string | null }
    | undefined

const getLatestPageHistoryRevision = (pageId: string) => {
  const row = db.prepare('SELECT MAX(revision) AS maxRevision FROM page_history WHERE pageId = ?').get(pageId) as
    | { maxRevision: number | null }
    | undefined

  return typeof row?.maxRevision === 'number' ? row.maxRevision : 0
}

const setPageHistoryCurrentRevision = (pageId: string, revision: number) => {
  db.prepare(
    `
      INSERT INTO page_history_state (pageId, currentRevision)
      VALUES (?, ?)
      ON CONFLICT(pageId) DO UPDATE SET currentRevision = excluded.currentRevision
    `
  ).run(pageId, revision)
}

const trimPageHistory = (pageId: string) => {
  const staleRows = db
    .prepare('SELECT revision FROM page_history WHERE pageId = ? ORDER BY revision DESC LIMIT -1 OFFSET ?')
    .all(pageId, MAX_PAGE_HISTORY_ENTRIES) as Array<{ revision: number }>

  if (staleRows.length === 0) {
    return
  }

  runPageIdsUpdate(
    'DELETE FROM page_history WHERE pageId = ? AND revision IN (__IDS__)',
    staleRows.map((row) => String(row.revision)),
    [pageId]
  )
}

const ensurePageHistorySeed = (pageId: string, blocks: unknown, focusBlockId?: string | null) => {
  const normalizedBlocks = normalizeHistoryBlocks(blocks)
  const serializedBlocks = JSON.stringify(normalizedBlocks)
  const normalizedFocusBlockId = normalizeHistoryFocusBlockId(focusBlockId)

  return db.transaction(() => {
    const existingState = getPageHistoryState(pageId)
    if (existingState) {
      return {
        blocks: normalizedBlocks,
        focusBlockId: normalizedFocusBlockId,
        currentRevision: existingState.currentRevision,
      }
    }

    db.prepare(
      `
        INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(pageId, 1, serializedBlocks, normalizedFocusBlockId, Date.now())
    setPageHistoryCurrentRevision(pageId, 1)

    return {
      blocks: normalizedBlocks,
      focusBlockId: normalizedFocusBlockId,
      currentRevision: 1,
    }
  })()
}

const saveBlocksWithHistory = (pageId: string, blocks: unknown, focusBlockId?: string | null) => {
  const normalizedBlocks = normalizeHistoryBlocks(blocks)
  const serializedBlocks = JSON.stringify(normalizedBlocks)
  const normalizedFocusBlockId = normalizeHistoryFocusBlockId(focusBlockId)

  return db.transaction(() => {
    persistBlocksForPage(pageId, normalizedBlocks)

    const existingState = getPageHistoryState(pageId)
    if (!existingState) {
      db.prepare(
        `
          INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `
      ).run(pageId, 1, serializedBlocks, normalizedFocusBlockId, Date.now())
      setPageHistoryCurrentRevision(pageId, 1)

      return {
        blocks: normalizedBlocks,
        focusBlockId: normalizedFocusBlockId,
        currentRevision: 1,
      }
    }

    const currentEntry = getPageHistoryEntryByRevision(pageId, existingState.currentRevision)

    if (currentEntry?.blocks === serializedBlocks) {
      db.prepare(
        `
          UPDATE page_history
          SET focusBlockId = ?, createdAt = ?
          WHERE pageId = ? AND revision = ?
        `
      ).run(normalizedFocusBlockId, Date.now(), pageId, existingState.currentRevision)

      return {
        blocks: normalizedBlocks,
        focusBlockId: normalizedFocusBlockId,
        currentRevision: existingState.currentRevision,
      }
    }

    db.prepare('DELETE FROM page_history WHERE pageId = ? AND revision > ?').run(pageId, existingState.currentRevision)

    const nextRevision = getLatestPageHistoryRevision(pageId) + 1
    db.prepare(
      `
        INSERT INTO page_history (pageId, revision, blocks, focusBlockId, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(pageId, nextRevision, serializedBlocks, normalizedFocusBlockId, Date.now())

    setPageHistoryCurrentRevision(pageId, nextRevision)
    trimPageHistory(pageId)

    return {
      blocks: normalizedBlocks,
      focusBlockId: normalizedFocusBlockId,
      currentRevision: nextRevision,
    }
  })()
}

const applyPageHistoryStep = (pageId: string, direction: 'undo' | 'redo') =>
  db.transaction(() => {
    const existingState = getPageHistoryState(pageId)
    if (!existingState) {
      return null
    }

    const targetEntry = getAdjacentPageHistoryEntry(pageId, existingState.currentRevision, direction)
    if (!targetEntry) {
      return null
    }

    const blocks = parsePageHistoryBlocks(targetEntry.blocks)
    persistBlocksForPage(pageId, blocks)
    setPageHistoryCurrentRevision(pageId, targetEntry.revision)

    return {
      blocks,
      focusBlockId: normalizeHistoryFocusBlockId(targetEntry.focusBlockId),
      currentRevision: targetEntry.revision,
    }
  })()

const getTextModelDirectory = () => path.join(app.getPath('userData'), 'models')

const getModelPath = () => path.join(getTextModelDirectory(), LOCAL_MODEL_FILENAME)

const getModelTempPath = () => `${getModelPath()}.download`

const getVisionModelDirectory = () => path.join(app.getPath('userData'), 'models', 'vision')

const getVisionModelPath = () => path.join(getVisionModelDirectory(), LOCAL_VISION_MODEL_FILENAME)

const getVisionModelTempPath = () => `${getVisionModelPath()}.download`

const getVisionProjectorPath = () => path.join(getVisionModelDirectory(), LOCAL_VISION_PROJECTOR_FILENAME)

const getVisionProjectorTempPath = () => `${getVisionProjectorPath()}.download`

const getVisionRuntimeDirectory = () => path.join(app.getPath('userData'), 'llama-runtime')

const getSpeechModelDirectory = () => path.join(app.getPath('userData'), 'models', 'whisper')

const getSpeechModelPath = () => path.join(getSpeechModelDirectory(), WHISPER_MODEL_FILENAME)

const getSpeechModelTempPath = () => `${getSpeechModelPath()}.download`

const getSpeechRuntimeDirectory = () => path.join(app.getPath('userData'), 'whispercpp')

const getSpeechRuntimeArchivePath = () => path.join(getSpeechRuntimeDirectory(), WHISPER_RUNTIME_ARCHIVE_NAME)

const getSpeechRuntimeTempPath = () => `${getSpeechRuntimeArchivePath()}.download`

const getFileSize = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return 0
  }

  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

const getExistingModelSize = () => getFileSize(getModelPath())

const getPartialModelSize = () => getFileSize(getModelTempPath())

const getExistingVisionModelSize = () => getFileSize(getVisionModelPath())

const getPartialVisionModelSize = () => getFileSize(getVisionModelTempPath())

const getExistingVisionProjectorSize = () => getFileSize(getVisionProjectorPath())

const getPartialVisionProjectorSize = () => getFileSize(getVisionProjectorTempPath())

const getExistingSpeechModelSize = () => getFileSize(getSpeechModelPath())

const getPartialSpeechModelSize = () => getFileSize(getSpeechModelTempPath())

const getPartialSpeechRuntimeSize = () => getFileSize(getSpeechRuntimeTempPath())

const findFileRecursive = (rootPath: string, filename: string): string | null => {
  if (!fs.existsSync(rootPath)) {
    return null
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return entryPath
    }

    if (entry.isDirectory()) {
      const nestedResult = findFileRecursive(entryPath, filename)
      if (nestedResult) {
        return nestedResult
      }
    }
  }

  return null
}

const getVisionRuntimeArchiveName = () => {
  if (IS_WINDOWS) {
    return process.arch === 'arm64'
      ? `llama-${LLAMA_RUNTIME_RELEASE_TAG}-bin-win-cpu-arm64.zip`
      : `llama-${LLAMA_RUNTIME_RELEASE_TAG}-bin-win-cpu-x64.zip`
  }

  if (IS_MACOS) {
    return process.arch === 'x64'
      ? `llama-${LLAMA_RUNTIME_RELEASE_TAG}-bin-macos-x64.tar.gz`
      : `llama-${LLAMA_RUNTIME_RELEASE_TAG}-bin-macos-arm64.tar.gz`
  }

  if (process.platform === 'linux') {
    return `llama-${LLAMA_RUNTIME_RELEASE_TAG}-bin-ubuntu-x64.tar.gz`
  }

  return null
}

const getVisionRuntimeArchivePath = () => {
  const archiveName = getVisionRuntimeArchiveName()
  if (!archiveName) {
    return null
  }

  return path.join(getVisionRuntimeDirectory(), archiveName)
}

const getVisionRuntimeTempPath = () => {
  const archivePath = getVisionRuntimeArchivePath()
  return archivePath ? `${archivePath}.download` : null
}

const getVisionRuntimeDownloadUrl = () => {
  const archiveName = getVisionRuntimeArchiveName()
  if (!archiveName) {
    return null
  }

  return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RUNTIME_RELEASE_TAG}/${archiveName}`
}

const getVisionRuntimePath = () => findFileRecursive(getVisionRuntimeDirectory(), LLAMA_SERVER_BINARY_NAME)

const resolveSpeechRuntimeCandidate = (candidatePath: string) => {
  if (!candidatePath || !fs.existsSync(candidatePath)) {
    return null
  }

  try {
    const stats = fs.statSync(candidatePath)
    if (!stats.isFile()) {
      return null
    }

    if (!IS_WINDOWS) {
      fs.accessSync(candidatePath, fs.constants.X_OK)
    }

    return candidatePath
  } catch {
    return null
  }
}

const getSpeechRuntimePath = () => {
  const bundledRuntimePath = findFileRecursive(getSpeechRuntimeDirectory(), WHISPER_RUNTIME_FILENAME)
  if (bundledRuntimePath) {
    return bundledRuntimePath
  }

  const candidatePaths = new Set<string>()
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean)

  pathEntries.forEach((entry) => {
    candidatePaths.add(path.join(entry, WHISPER_RUNTIME_FILENAME))
  })

  if (!IS_WINDOWS) {
    candidatePaths.add('/opt/homebrew/bin/whisper-cli')
    candidatePaths.add('/usr/local/bin/whisper-cli')
  }

  for (const candidatePath of candidatePaths) {
    const resolvedCandidate = resolveSpeechRuntimeCandidate(candidatePath)
    if (resolvedCandidate) {
      return resolvedCandidate
    }
  }

  return null
}

const getPluginsDirectory = () => path.join(app.getPath('userData'), 'plugins')

const ensurePluginsDirectory = () => {
  fs.mkdirSync(getPluginsDirectory(), { recursive: true })
}

const getSafePluginFilename = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('A valid plugin filename is required.')
  }

  const trimmedValue = value.trim()
  const safeFilename = path.basename(trimmedValue)

  if (safeFilename !== trimmedValue || !safeFilename.toLowerCase().endsWith('.js')) {
    throw new Error('Plugin filenames must be local .js files.')
  }

  return safeFilename
}

const normalizePluginDownloadUrl = (value: string) => {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(value)
  } catch {
    return value
  }

  const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)

  if (parsedUrl.hostname === 'github.com') {
    const [owner, repo, mode, ...rest] = pathnameParts
    const [branch, ...filePathParts] = rest

    if (
      owner &&
      repo &&
      (mode === 'blob' || mode === 'raw') &&
      branch &&
      filePathParts.length > 0
    ) {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePathParts.join('/')}`
    }
  }

  if (parsedUrl.hostname === 'raw.githubusercontent.com') {
    const [owner, repo, maybeRefs, maybeHeads, branch, ...filePathParts] = pathnameParts

    if (
      owner &&
      repo &&
      maybeRefs === 'refs' &&
      maybeHeads === 'heads' &&
      branch &&
      filePathParts.length > 0
    ) {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePathParts.join('/')}`
    }
  }

  return parsedUrl.toString()
}

const listInstalledPluginFiles = () => {
  ensurePluginsDirectory()

  return fs
    .readdirSync(getPluginsDirectory(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.js'))
    .map((entry) => ({
      filename: entry.name,
      id: entry.name.replace(/\.js$/i, '').toLowerCase(),
      pluginPath: path.join(getPluginsDirectory(), entry.name),
    }))
}

const extractPluginMetadataField = (source: string, fieldName: string) => {
  const fieldPattern = new RegExp(`${fieldName}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`)
  const match = source.match(fieldPattern)

  return match?.[2]?.trim() || null
}

const readPluginMetadata = (pluginPath: string) => {
  try {
    const pluginSource = fs.readFileSync(pluginPath, 'utf8')

    return {
      description: extractPluginMetadataField(pluginSource, 'description'),
      name: extractPluginMetadataField(pluginSource, 'name'),
      version: extractPluginMetadataField(pluginSource, 'version'),
    }
  } catch (error) {
    console.error(`Failed to read plugin metadata from "${pluginPath}":`, error)

    return {
      description: null,
      name: null,
      version: null,
    }
  }
}

const buildInstalledPluginStates = (): InstalledPluginState[] => {
  const disabledPluginIds = getDisabledPluginIds()

  return listInstalledPluginFiles().map((plugin) => {
    const metadata = readPluginMetadata(plugin.pluginPath)
    const stats = fs.statSync(plugin.pluginPath)

    return {
      id: plugin.id,
      filename: plugin.filename,
      name: metadata.name || plugin.id,
      description: metadata.description,
      disabled: disabledPluginIds.has(plugin.id),
      installedVersion: metadata.version,
      lastUpdatedAt: Number.isFinite(stats.mtimeMs) ? stats.mtimeMs : null,
    }
  })
}

const emitPluginStateChange = (
  reason: PluginStateChangeReason,
  plugins: InstalledPluginState[]
) => {
  if (win && !win.isDestroyed()) {
    const payload: PluginStateChangeEvent = {
      reason,
      plugins,
      occurredAt: Date.now(),
    }

    win.webContents.send('plugins:changed', payload)
  }
}

const downloadPluginFile = (downloadUrl: string, destinationPath: string, redirectCount = 0): Promise<void> =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while downloading the plugin.'))
      return
    }

    const normalizedDownloadUrl = normalizePluginDownloadUrl(downloadUrl)

    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalizedDownloadUrl)
    } catch {
      reject(new Error('The plugin download URL is invalid.'))
      return
    }

    if (parsedUrl.protocol !== 'https:') {
      reject(new Error('Plugins must be downloaded over HTTPS.'))
      return
    }

    ensurePluginsDirectory()

    let fileStream: fs.WriteStream | null = null
    const cleanup = () => {
      fileStream?.close()
      if (fs.existsSync(destinationPath)) {
        fs.unlinkSync(destinationPath)
      }
    }

    const request = https.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'link-plugin-store',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          response.headers.location
        ) {
          const redirectedUrl = new URL(response.headers.location, parsedUrl).toString()
          void downloadPluginFile(redirectedUrl, destinationPath, redirectCount + 1)
            .then(resolve)
            .catch(reject)
          return
        }

        if (statusCode !== 200) {
          response.resume()
          cleanup()
          reject(
            new Error(
              statusCode === 404
                ? 'Plugin download failed with status 404. The manifest may be pointing to a missing file or a non-raw GitHub URL.'
                : `Plugin download failed with status ${statusCode}.`
            )
          )
          return
        }

        fileStream = fs.createWriteStream(destinationPath)
        fileStream.on('error', (error) => {
          cleanup()
          reject(error)
        })
        response.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          resolve()
        })
      }
    )

    request.on('error', (error) => {
      cleanup()
      reject(error)
    })

  })

const normalizePluginIds = (value: unknown) =>
  normalizeStringArray(value)
    .map((pluginId) => pluginId.trim().toLowerCase())
    .filter(Boolean)

const getDisabledPluginIds = () =>
  new Set(normalizePluginIds(readAppSetting(APP_SETTING_DISABLED_PLUGINS, [])))

const saveDisabledPluginIds = (pluginIds: string[]) => {
  saveAppSetting(APP_SETTING_DISABLED_PLUGINS, normalizePluginIds(pluginIds))
}

const setPluginDisabledState = (pluginId: string, isDisabled: boolean) => {
  const normalizedPluginId = pluginId.trim().toLowerCase()
  const disabledPluginIds = getDisabledPluginIds()

  if (isDisabled) {
    disabledPluginIds.add(normalizedPluginId)
  } else {
    disabledPluginIds.delete(normalizedPluginId)
  }

  saveDisabledPluginIds(Array.from(disabledPluginIds))
}

const disposeRendererPlugins = async () => {
  if (!win || win.isDestroyed()) {
    return
  }

  try {
    await win.webContents.executeJavaScript(`
      (() => {
        const runtime = window.__linkPluginRuntime
        if (!runtime || !runtime.plugins) {
          return true
        }

        for (const pluginId of Object.keys(runtime.plugins)) {
          const plugin = runtime.plugins[pluginId]
          if (plugin && typeof plugin.dispose === 'function') {
            try {
              plugin.dispose()
            } catch (error) {
              console.error('Failed to dispose plugin', pluginId, error)
            }
          }
        }

        runtime.plugins = {}
        return true
      })()
    `)
  } catch (error) {
    console.error('Failed to dispose renderer plugins:', error)
  }
}

const loadRendererPlugin = async (plugin: {
  id: string
  filename: string
  pluginPath: string
}) => {
  if (!win || win.isDestroyed()) {
    return
  }

  const pluginSource = await fs.promises.readFile(plugin.pluginPath, 'utf8')
  const executionResult = (await win.webContents.executeJavaScript(
    `
      (() => {
        const source = ${JSON.stringify(pluginSource)}
        const pluginId = ${JSON.stringify(plugin.id)}

        window.__linkPluginRuntime = window.__linkPluginRuntime || { plugins: {} }

        const module = { exports: {} }
        const exports = module.exports

        try {
          new Function('module', 'exports', source)(module, exports)

          if (module.exports && typeof module.exports === 'object') {
            window.__linkPluginRuntime.plugins[pluginId] = module.exports
            return { ok: true }
          }

          return { ok: false, error: 'Plugin did not export an object.' }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })()
    `
  )) as
    | {
        ok?: boolean
        error?: string
      }
    | undefined

  if (!executionResult?.ok) {
    throw new Error(executionResult?.error || 'Renderer plugin execution failed.')
  }
}

const loadPlugins = async () => {
  const installedPlugins = listInstalledPluginFiles()
  const disabledPluginIds = getDisabledPluginIds()

  await disposeRendererPlugins()
  loadedPluginModules.clear()

  for (const plugin of installedPlugins) {
    if (disabledPluginIds.has(plugin.id)) {
      continue
    }

    try {
      const cacheBustedUrl = `${pathToFileURL(plugin.pluginPath).href}?v=${fs.statSync(plugin.pluginPath).mtimeMs}`
      const importedModule = await import(cacheBustedUrl)
      loadedPluginModules.set(plugin.id, importedModule)
      await loadRendererPlugin(plugin)
    } catch (error) {
      console.error(`Failed to load plugin "${plugin.filename}":`, error)
    }
  }

  return buildInstalledPluginStates()
}

const syncPlugins = async (reason: PluginStateChangeReason) => {
  const nextSync = pluginSyncQueue
    .catch(() => buildInstalledPluginStates())
    .then(async () => {
      const pluginState = await loadPlugins()
      emitPluginStateChange(reason, pluginState)
      return pluginState
    })

  pluginSyncQueue = nextSync.catch(() => buildInstalledPluginStates())

  return nextSync
}

const schedulePluginDirectorySync = (reason: PluginStateChangeReason = 'filesystem') => {
  if (pluginDirectoryWatchDebounce) {
    clearTimeout(pluginDirectoryWatchDebounce)
  }

  pluginDirectoryWatchDebounce = setTimeout(() => {
    pluginDirectoryWatchDebounce = null
    void syncPlugins(reason)
  }, 250)
}

const stopPluginDirectoryWatcher = () => {
  if (pluginDirectoryWatchDebounce) {
    clearTimeout(pluginDirectoryWatchDebounce)
    pluginDirectoryWatchDebounce = null
  }

  if (pluginDirectoryWatcher) {
    pluginDirectoryWatcher.close()
    pluginDirectoryWatcher = null
  }
}

const startPluginDirectoryWatcher = () => {
  ensurePluginsDirectory()
  stopPluginDirectoryWatcher()

  try {
    pluginDirectoryWatcher = fs.watch(getPluginsDirectory(), (_eventType, filename) => {
      const normalizedFilename = typeof filename === 'string' ? filename : String(filename || '')

      if (!normalizedFilename || !normalizedFilename.toLowerCase().endsWith('.js')) {
        return
      }

      schedulePluginDirectorySync('filesystem')
    })

    pluginDirectoryWatcher.on('error', (error) => {
      console.error('Plugin directory watcher error:', error)
      schedulePluginDirectorySync('filesystem')
      startPluginDirectoryWatcher()
    })
  } catch (error) {
    console.error('Failed to start plugin directory watcher:', error)
  }
}

const getStoredModelProgress = () => {
  const completedBytes = getExistingModelSize()
  if (completedBytes > 0) {
    return {
      downloadedBytes: completedBytes,
      totalBytes: completedBytes,
      isComplete: true,
    }
  }

  return {
    downloadedBytes: getPartialModelSize(),
    totalBytes: null,
    isComplete: false,
  }
}

const getStoredVisionModelProgress = () => {
  const completedModelBytes = getExistingVisionModelSize()
  const completedProjectorBytes = getExistingVisionProjectorSize()
  const isComplete = completedModelBytes > 0 && completedProjectorBytes > 0

  if (isComplete) {
    return {
      downloadedBytes: completedModelBytes + completedProjectorBytes,
      totalBytes: completedModelBytes + completedProjectorBytes,
      isComplete: true,
    }
  }

  return {
    downloadedBytes: getPartialVisionModelSize() + getPartialVisionProjectorSize(),
    totalBytes: null,
    isComplete: false,
  }
}

const getStoredSpeechModelProgress = () => {
  const completedBytes = getExistingSpeechModelSize()
  const runtimePath = getSpeechRuntimePath()

  if (completedBytes > 0 && runtimePath) {
    return {
      downloadedBytes: completedBytes,
      totalBytes: completedBytes,
      isComplete: true,
    }
  }

  const partialBytes = getPartialSpeechModelSize() + getPartialSpeechRuntimeSize()
  return {
    downloadedBytes: partialBytes,
    totalBytes: null,
    isComplete: false,
  }
}

const emitStatusChange = () => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('ai:status', aiStatus)
  }

  return aiStatus
}

const emitAiStatus = (updates: Partial<AiStatus> = {}) => {
  aiStatus = {
    ...aiStatus,
    ...updates,
    modelName: LOCAL_MODEL_FILENAME,
    modelPath: getModelPath(),
  }

  if (aiStatus.status !== 'downloading') {
    const storedModel = getStoredModelProgress()
    aiStatus.downloadedBytes = storedModel.downloadedBytes

    if (storedModel.isComplete) {
      aiStatus.totalBytes = storedModel.totalBytes
    } else if (aiStatus.totalBytes != null && aiStatus.totalBytes < storedModel.downloadedBytes) {
      aiStatus.totalBytes = storedModel.downloadedBytes
    }
  }

  return emitStatusChange()
}

const emitVisionModelStatus = (updates: Partial<AiStatus['visualModel']> = {}) => {
  aiStatus = {
    ...aiStatus,
    visualModel: {
      ...aiStatus.visualModel,
      ...updates,
      modelName: LOCAL_VISION_MODEL_FILENAME,
      modelPath: getVisionModelPath(),
      projectorName: LOCAL_VISION_PROJECTOR_FILENAME,
      projectorPath: getVisionProjectorPath(),
    },
  }

  if (aiStatus.visualModel.status !== 'downloading') {
    const storedVisionModel = getStoredVisionModelProgress()
    aiStatus.visualModel.downloadedBytes = storedVisionModel.downloadedBytes

    if (storedVisionModel.isComplete) {
      aiStatus.visualModel.totalBytes = storedVisionModel.totalBytes
    } else if (
      aiStatus.visualModel.totalBytes != null &&
      aiStatus.visualModel.totalBytes < storedVisionModel.downloadedBytes
    ) {
      aiStatus.visualModel.totalBytes = storedVisionModel.downloadedBytes
    }
  }

  return emitStatusChange()
}

const emitSpeechModelStatus = (updates: Partial<AiStatus['speechModel']> = {}) => {
  aiStatus = {
    ...aiStatus,
    speechModel: {
      ...aiStatus.speechModel,
      ...updates,
      modelName: WHISPER_MODEL_FILENAME,
      modelPath: getSpeechModelPath(),
      runtimeName: WHISPER_RUNTIME_FILENAME,
      runtimePath: getSpeechRuntimePath() || path.join(getSpeechRuntimeDirectory(), WHISPER_RUNTIME_FILENAME),
    },
  }

  if (aiStatus.speechModel.status !== 'downloading') {
    const storedSpeechModel = getStoredSpeechModelProgress()
    aiStatus.speechModel.downloadedBytes = storedSpeechModel.downloadedBytes

    if (storedSpeechModel.isComplete) {
      aiStatus.speechModel.totalBytes = storedSpeechModel.totalBytes
    } else if (
      aiStatus.speechModel.totalBytes != null &&
      aiStatus.speechModel.totalBytes < storedSpeechModel.downloadedBytes
    ) {
      aiStatus.speechModel.totalBytes = storedSpeechModel.downloadedBytes
    }
  }

  return emitStatusChange()
}

const saveAppSetting = (key: string, value: unknown) => {
  db.prepare(
    `
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(key, JSON.stringify(value))
}

const readAppSetting = <T>(key: string, fallbackValue: T): T => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined

  if (!row?.value) {
    return fallbackValue
  }

  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallbackValue
  }
}

const loadTranscriptionPreferences = (): AudioTranscriptionPreferences =>
  normalizeAudioTranscriptionPreferences(
    readAppSetting(APP_SETTING_TRANSCRIPTION_PREFERENCES, aiStatus.transcriptionPreferences)
  )

const loadGenerationPreferences = (): AiGenerationPreferences =>
  normalizeAiGenerationPreferences(
    readAppSetting(APP_SETTING_GENERATION_PREFERENCES, aiStatus.generationPreferences)
  )

const updateTranscriptionPreferences = (preferences: AudioTranscriptionPreferences) => {
  const normalizedPreferences = normalizeAudioTranscriptionPreferences(preferences)
  saveAppSetting(APP_SETTING_TRANSCRIPTION_PREFERENCES, normalizedPreferences)
  aiStatus = {
    ...aiStatus,
    transcriptionPreferences: normalizedPreferences,
  }

  return emitStatusChange()
}

const updateGenerationPreferences = (preferences: AiGenerationPreferences) => {
  const normalizedPreferences = normalizeAiGenerationPreferences(preferences)
  saveAppSetting(APP_SETTING_GENERATION_PREFERENCES, normalizedPreferences)
  aiStatus = {
    ...aiStatus,
    generationPreferences: normalizedPreferences,
  }

  return emitStatusChange()
}

const initializeAiStatus = () => {
  const storedModel = getStoredModelProgress()
  const storedVisionModel = getStoredVisionModelProgress()
  const storedSpeechModel = getStoredSpeechModelProgress()
  aiStatus = {
    ...createDefaultAiStatus(),
    modelName: LOCAL_MODEL_FILENAME,
    modelPath: getModelPath(),
    status: storedModel.isComplete ? 'downloaded' : 'missing',
    downloadedBytes: storedModel.downloadedBytes,
    totalBytes: storedModel.totalBytes,
    visualModel: {
      ...createDefaultAiStatus().visualModel,
      modelName: LOCAL_VISION_MODEL_FILENAME,
      modelPath: getVisionModelPath(),
      projectorName: LOCAL_VISION_PROJECTOR_FILENAME,
      projectorPath: getVisionProjectorPath(),
      status: storedVisionModel.isComplete ? 'downloaded' : 'missing',
      downloadedBytes: storedVisionModel.downloadedBytes,
      totalBytes: storedVisionModel.totalBytes,
    },
    speechModel: {
      ...createDefaultAiStatus().speechModel,
      modelName: WHISPER_MODEL_FILENAME,
      modelPath: getSpeechModelPath(),
      runtimeName: WHISPER_RUNTIME_FILENAME,
      runtimePath: getSpeechRuntimePath() || path.join(getSpeechRuntimeDirectory(), WHISPER_RUNTIME_FILENAME),
      status: storedSpeechModel.isComplete && !!getSpeechRuntimePath() ? 'ready' : 'missing',
      downloadedBytes: storedSpeechModel.downloadedBytes,
      totalBytes: storedSpeechModel.totalBytes,
    },
    transcriptionPreferences: loadTranscriptionPreferences(),
    generationPreferences: loadGenerationPreferences(),
  }
}

const ensureTextModelDirectory = async () => {
  await fs.promises.mkdir(getTextModelDirectory(), { recursive: true })
}

const ensureVisionModelDirectory = async () => {
  await fs.promises.mkdir(getVisionModelDirectory(), { recursive: true })
}

const getVisionInputDirectory = () => path.join(app.getPath('userData'), 'vision-inputs')

const ensureVisionInputDirectory = async () => {
  await fs.promises.mkdir(getVisionInputDirectory(), { recursive: true })
}

const getVisionInputContentType = (filePath: string) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    default:
      return 'application/octet-stream'
  }
}

const ensureVisionRuntimeDirectory = async () => {
  await fs.promises.mkdir(getVisionRuntimeDirectory(), { recursive: true })
}

const ensureSpeechModelDirectory = async () => {
  await fs.promises.mkdir(getSpeechModelDirectory(), { recursive: true })
}

const ensureSpeechRuntimeDirectory = async () => {
  await fs.promises.mkdir(getSpeechRuntimeDirectory(), { recursive: true })
}

const parseTotalBytes = (value: string | string[] | undefined) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const match = value.match(/\/(\d+)\s*$/)
  if (!match) {
    return null
  }

  const totalBytes = Number(match[1])
  return Number.isFinite(totalBytes) ? totalBytes : null
}

const downloadFileWithProgress = (
  url: string,
  destination: string,
  options: {
    tempPath?: string
    resourceLabel?: string
    onProgress?: (progress: {
      receivedBytes: number
      totalBytes: number | null
      percent: number | null
      speedBytesPerSecond: number | null
    }) => void
  } = {}
) =>
  new Promise<void>((resolve, reject) => {
    const tempPath = options.tempPath ?? `${destination}.download`
    const resourceLabel = options.resourceLabel ?? 'Model'
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    const requestFile = (currentUrl: string) => {
      const resumeOffset = getFileSize(tempPath)
      const request = https.get(
        currentUrl,
        {
          headers: {
            'User-Agent': 'Link-Desktop/1.0',
            ...(resumeOffset > 0 ? { Range: `bytes=${resumeOffset}-` } : {}),
          },
        },
        (response) => {
          const statusCode = response.statusCode ?? 0

          if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
            response.resume()
            const redirectedUrl = new URL(response.headers.location, currentUrl).toString()
            requestFile(redirectedUrl)
            return
          }

          if (statusCode === 416 && resumeOffset > 0) {
            const totalBytes = parseTotalBytes(response.headers['content-range'])
            response.resume()

            if (totalBytes != null && resumeOffset >= totalBytes) {
              fs.promises
                .unlink(destination)
                .catch(() => undefined)
                .finally(() => {
                  fs.promises
                    .rename(tempPath, destination)
                    .then(() => {
                      settled = true
                      resolve()
                    })
                    .catch((error) =>
                      fail(error instanceof Error ? error : new Error('Unable to save the model file.'))
                    )
                })
              return
            }

            fs.promises
              .unlink(tempPath)
              .catch(() => undefined)
              .finally(() => requestFile(currentUrl))
            return
          }

          if (statusCode !== 200 && statusCode !== 206) {
            response.resume()
            fail(new Error(`${resourceLabel} download failed with status ${statusCode}.`))
            return
          }

          const totalBytesHeader = response.headers['content-length']
          const responseLength =
            typeof totalBytesHeader === 'string' && totalBytesHeader.trim()
              ? Number(totalBytesHeader)
              : null
          const shouldAppend = resumeOffset > 0 && statusCode === 206
          const totalBytes =
            shouldAppend
              ? parseTotalBytes(response.headers['content-range']) ??
                (responseLength != null ? resumeOffset + responseLength : null)
              : responseLength

          let receivedBytes = shouldAppend ? resumeOffset : 0
          let lastSampleTime = Date.now()
          let lastSampleBytes = receivedBytes
          let latestSpeed: number | null = null

          options.onProgress?.({
            receivedBytes,
            totalBytes,
            percent: totalBytes ? (receivedBytes / totalBytes) * 100 : null,
            speedBytesPerSecond: null,
          })

          const fileStream = fs.createWriteStream(tempPath, { flags: shouldAppend ? 'a' : 'w' })

          response.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length

            const now = Date.now()
            if (now - lastSampleTime >= 250) {
              latestSpeed = Math.round(((receivedBytes - lastSampleBytes) * 1000) / (now - lastSampleTime))
              lastSampleBytes = receivedBytes
              lastSampleTime = now
            }

            options.onProgress?.({
              receivedBytes,
              totalBytes,
              percent: totalBytes ? (receivedBytes / totalBytes) * 100 : null,
              speedBytesPerSecond: latestSpeed,
            })
          })

          response.on('error', (error) => {
            fileStream.destroy()
            fail(error instanceof Error ? error : new Error('Model download failed.'))
          })

          fileStream.on('error', (error) => {
            response.destroy()
            fail(error)
          })

          fileStream.on('finish', () => {
            fileStream.close(async () => {
              if (settled) return

              try {
                if (fs.existsSync(destination)) {
                  await fs.promises.unlink(destination)
                }
                await fs.promises.rename(tempPath, destination)
                settled = true
                resolve()
              } catch (error) {
                fail(error instanceof Error ? error : new Error('Unable to save the model file.'))
              }
            })
          })

          response.pipe(fileStream)
        }
      )

      request.on('error', (error) => fail(error))
    }

    requestFile(url)
  })

const ensureAiRuntimeReady = async () => {
  if (aiRuntime?.model) {
    emitAiStatus({
      status: 'ready',
      progress: null,
      error: null,
    })
    return aiRuntime.model
  }

  if (aiStartPromise) {
    await aiStartPromise
    return aiRuntime?.model
  }

  const modelPath = getModelPath()

  if (!fs.existsSync(modelPath)) {
    emitAiStatus({
      status: 'missing',
      error: 'Download the Phi-3 model from Settings before requesting ghost text.',
      progress: null,
      downloadedBytes: 0,
      totalBytes: null,
    })
    throw new Error('Local model is not downloaded yet.')
  }

  aiStartPromise = (async () => {
    emitAiStatus({
      status: 'starting',
      progress: null,
      error: null,
    })

    try {
      const llamaModule = await import('node-llama-cpp')
      const llama = await llamaModule.getLlama()
      const model = await llama.loadModel({ modelPath })

      aiRuntime = {
        llama,
        model,
      }

      emitAiStatus({
        status: 'ready',
        progress: null,
        error: null,
        downloadedBytes: getExistingModelSize(),
        totalBytes: getExistingModelSize(),
      })

      return model
    } catch (error) {
      aiRuntime = null
      emitAiStatus({
        status: 'error',
        progress: null,
        error: error instanceof Error ? error.message : 'Unable to start the local model.',
      })
      throw error
    } finally {
      aiStartPromise = null
    }
  })()

  return aiStartPromise
}

const startModelDownload = () => {
  if (aiDownloadPromise) {
    return aiDownloadPromise
  }

  aiDownloadPromise = (async () => {
    try {
      await ensureTextModelDirectory()
      const modelPath = getModelPath()
      const partialBytes = getPartialModelSize()

      emitAiStatus({
        status: 'downloading',
        progress: {
          receivedBytes: partialBytes,
          totalBytes: aiStatus.totalBytes,
          percent: aiStatus.totalBytes ? (partialBytes / aiStatus.totalBytes) * 100 : null,
          speedBytesPerSecond: null,
        },
        downloadedBytes: partialBytes,
        totalBytes: aiStatus.totalBytes,
        error: null,
      })

      await downloadFileWithProgress(LOCAL_MODEL_DOWNLOAD_URL, modelPath, {
        tempPath: getModelTempPath(),
        onProgress: ({ receivedBytes, totalBytes, percent, speedBytesPerSecond }) => {
          emitAiStatus({
            status: 'downloading',
            progress: {
              receivedBytes,
              totalBytes,
              percent,
              speedBytesPerSecond,
            },
            downloadedBytes: receivedBytes,
            totalBytes,
            error: null,
          })
        },
      })

      const savedBytes = getExistingModelSize()
      emitAiStatus({
        status: 'downloaded',
        progress: null,
        downloadedBytes: savedBytes,
        totalBytes: savedBytes,
        error: null,
      })

      await ensureAiRuntimeReady()
    } catch (error) {
      emitAiStatus({
        status: 'error',
        progress: null,
        error: error instanceof Error ? error.message : 'Unable to download the local model.',
      })
    } finally {
      aiDownloadPromise = null
    }
  })()

  return aiDownloadPromise
}

const runWindowsPowerShell = (script: string, args: string[] = []) =>
  new Promise<void>((resolve, reject) => {
    if (!IS_WINDOWS) {
      reject(new Error('Whisper runtime extraction is currently available only on Windows.'))
      return
    }

    const windowsPowerShellPath =
      process.env.SYSTEMROOT != null
        ? path.join(process.env.SYSTEMROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        : 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

    const child = spawn(windowsPowerShellPath, ['-NoProfile', '-NonInteractive', '-Command', script, ...args], {
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`))
    })
  })

const runCommand = (command: string, args: string[], options: { cwd?: string } = {}) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `${path.basename(command)} exited with code ${code}.`))
    })
  })

const extractArchive = async (archivePath: string, destinationPath: string) => {
  await fs.promises.mkdir(destinationPath, { recursive: true })
  await runWindowsPowerShell(
    '& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }',
    [archivePath, destinationPath]
  )
}

const extractCompressedArchive = async (archivePath: string, destinationPath: string) => {
  await fs.promises.mkdir(destinationPath, { recursive: true })

  if (archivePath.toLowerCase().endsWith('.zip')) {
    await extractArchive(archivePath, destinationPath)
    return
  }

  if (archivePath.toLowerCase().endsWith('.tar.gz')) {
    await runCommand('tar', ['-xzf', archivePath, '-C', destinationPath])
    return
  }

  throw new Error('Unsupported runtime archive format.')
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const getAvailableLocalPort = () =>
  new Promise<number>((resolve, reject) => {
    const probeServer = net.createServer()

    probeServer.on('error', (error) => {
      reject(error)
    })

    probeServer.listen(0, '127.0.0.1', () => {
      const address = probeServer.address()
      if (!address || typeof address === 'string') {
        probeServer.close()
        reject(new Error('Unable to allocate a local port for the vision model server.'))
        return
      }

      const { port } = address
      probeServer.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })

const stopVisionInputServer = async () => {
  const server = visionInputServer
  if (!server) {
    return
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })

  if (visionInputServer === server) {
    visionInputServer = null
    visionInputServerPort = null
  }
}

const ensureVisionInputServerReady = async () => {
  if (visionInputServer && visionInputServerPort) {
    return visionInputServerPort
  }

  if (visionInputServerStartPromise) {
    return visionInputServerStartPromise
  }

  visionInputServerStartPromise = (async () => {
    await ensureVisionInputDirectory()
    const visionInputDirectory = getVisionInputDirectory()
    const port = await getAvailableLocalPort()

    const server = http.createServer((request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.statusCode = 405
        response.end()
        return
      }

      let requestedName = ''
      try {
        const requestUrl = new URL(request.url || '/', `http://127.0.0.1:${port}`)
        requestedName = decodeURIComponent(requestUrl.pathname.replace(/^\/+/, ''))
      } catch {
        response.statusCode = 400
        response.end('Invalid request.')
        return
      }

      if (!requestedName || path.basename(requestedName) !== requestedName) {
        response.statusCode = 403
        response.end('File path is not allowed.')
        return
      }

      const filePath = path.join(visionInputDirectory, requestedName)

      fs.promises
        .readFile(filePath)
        .then((fileBuffer) => {
          response.statusCode = 200
          response.setHeader('Content-Type', getVisionInputContentType(filePath))
          response.setHeader('Cache-Control', 'no-store')

          if (request.method === 'HEAD') {
            response.end()
            return
          }

          response.end(fileBuffer)
        })
        .catch((error) => {
          response.statusCode = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT' ? 404 : 500
          response.end()
        })
    })

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error) => {
        server.off('listening', handleListening)
        reject(error)
      }

      const handleListening = () => {
        server.off('error', handleError)
        resolve()
      }

      server.once('error', handleError)
      server.once('listening', handleListening)
      server.listen(port, '127.0.0.1')
    })

    server.on('close', () => {
      if (visionInputServer === server) {
        visionInputServer = null
        visionInputServerPort = null
      }
    })

    visionInputServer = server
    visionInputServerPort = port
    return port
  })().finally(() => {
    visionInputServerStartPromise = null
  })

  return visionInputServerStartPromise
}

const requestJson = <T>(
  url: string,
  options: {
    method?: 'GET' | 'POST'
    body?: unknown
    signal?: AbortSignal
    headers?: Record<string, string>
  } = {}
) =>
  new Promise<T>((resolve, reject) => {
    const requestUrl = new URL(url)
    const serializedBody = options.body == null ? null : JSON.stringify(options.body)
    const transport = requestUrl.protocol === 'https:' ? https : http
    const request = transport.request(
      requestUrl,
      {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(serializedBody
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(serializedBody).toString(),
              }
            : {}),
          ...options.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        response.on('end', () => {
          const payloadText = Buffer.concat(chunks).toString('utf8')
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(
              new Error(
                payloadText.trim() || `Request failed with status ${response.statusCode ?? 500}.`
              )
            )
            return
          }

          if (!payloadText.trim()) {
            resolve({} as T)
            return
          }

          try {
            resolve(JSON.parse(payloadText) as T)
          } catch (error) {
            reject(error instanceof Error ? error : new Error('The server returned invalid JSON.'))
          }
        })
      }
    )

    const abortRequest = () => {
      request.destroy(new Error('The request was cancelled.'))
    }

    if (options.signal) {
      if (options.signal.aborted) {
        abortRequest()
      } else {
        options.signal.addEventListener('abort', abortRequest, { once: true })
      }
    }

    request.on('error', (error) => {
      reject(error)
    })

    if (serializedBody) {
      request.write(serializedBody)
    }

    request.end()
  })

const extractStructuredErrorMessage = (value: string) => {
  try {
    const parsed = JSON.parse(value) as
      | {
          error?: {
            message?: unknown
          }
          message?: unknown
        }
      | null

    if (parsed?.error?.message && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }

    if (parsed?.message && typeof parsed.message === 'string') {
      return parsed.message
    }
  } catch {
    return value
  }

  return value
}

const getReadableErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallbackMessage
  }

  return extractStructuredErrorMessage(error.message.trim())
}

const requestBinary = (
  url: string,
  options: {
    signal?: AbortSignal
    headers?: Record<string, string>
  } = {}
) =>
  new Promise<Buffer>((resolve, reject) => {
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    const makeRequest = (currentUrl: string) => {
      const requestUrl = new URL(currentUrl)
      const transport = requestUrl.protocol === 'https:' ? https : http
      const request = transport.request(
        requestUrl,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Link-Desktop/1.0',
            ...options.headers,
          },
        },
        (response) => {
          const statusCode = response.statusCode ?? 0

          if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
            response.resume()
            makeRequest(new URL(response.headers.location, currentUrl).toString())
            return
          }

          const chunks: Buffer[] = []
          response.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })

          response.on('end', () => {
            if (settled) {
              return
            }

            if (statusCode < 200 || statusCode >= 300) {
              fail(
                new Error(
                  Buffer.concat(chunks).toString('utf8').trim() || `Request failed with status ${statusCode}.`
                )
              )
              return
            }

            settled = true
            resolve(Buffer.concat(chunks))
          })
        }
      )

      const abortRequest = () => {
        request.destroy(new Error('The request was cancelled.'))
      }

      if (options.signal) {
        if (options.signal.aborted) {
          abortRequest()
        } else {
          options.signal.addEventListener('abort', abortRequest, { once: true })
        }
      }

      request.on('error', (error) => {
        fail(error instanceof Error ? error : new Error('Unable to load the image.'))
      })

      request.end()
    }

    makeRequest(url)
  })


const readVisionImageBuffer = async (imageUrl: string, signal?: AbortSignal) => {
  const normalizedImageUrl = imageUrl.trim()
  if (!normalizedImageUrl) {
    throw new Error('No image was found in the focused block.')
  }

  if (normalizedImageUrl.startsWith('data:image')) {
    const separatorIndex = normalizedImageUrl.indexOf(',')
    if (separatorIndex <= 0) {
      throw new Error('The image block contains invalid image data.')
    }

    const metadata = normalizedImageUrl.slice(5, separatorIndex)
    const encodedPayload = normalizedImageUrl.slice(separatorIndex + 1).replace(/\s+/g, '')
    const [mimeType = 'image/png', ...flags] = metadata.split(';')

    if (mimeType.toLowerCase() === 'image/svg+xml') {
      throw new Error('SVG images are not supported for local vision analysis. Use PNG, JPG, or WebP.')
    }

    if (!flags.some((flag) => flag.toLowerCase() === 'base64')) {
      throw new Error('The image block uses an unsupported encoding. Use a standard image file instead.')
    }

    const imageBuffer = Buffer.from(encodedPayload, 'base64')
    if (!imageBuffer.length) {
      throw new Error('The image block is empty.')
    }

    return imageBuffer
  }

  if (normalizedImageUrl.startsWith('file://')) {
    return fs.promises.readFile(fileURLToPath(normalizedImageUrl))
  }

  if (/^https?:\/\//i.test(normalizedImageUrl)) {
    return requestBinary(normalizedImageUrl, { signal })
  }

  throw new Error('The image block must contain a valid image.')
}

const getVisionImageExtensionFromMimeType = (mimeType: string) => {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/bmp':
      return '.bmp'
    case 'image/tiff':
      return '.tiff'
    default:
      return '.img'
  }
}

const createVisionInputTempPath = (extension = '.img') =>
  path.join(
    getVisionInputDirectory(),
    `vision-input-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`
  )

const createVisionInputAccessUrl = async (filePath: string) => {
  const port = await ensureVisionInputServerReady()
  return `http://127.0.0.1:${port}/${encodeURIComponent(path.basename(filePath))}`
}

const prepareVisionInputFile = async (imageUrl: string, signal?: AbortSignal) => {
  const normalizedImageUrl = imageUrl.trim()
  if (!normalizedImageUrl) {
    throw new Error('No image was found in the focused block.')
  }

  await ensureVisionInputDirectory()

  if (normalizedImageUrl.startsWith('data:image')) {
    const separatorIndex = normalizedImageUrl.indexOf(',')
    if (separatorIndex <= 0) {
      throw new Error('The image block contains invalid image data.')
    }

    const metadata = normalizedImageUrl.slice(5, separatorIndex)
    const [mimeType = 'image/png'] = metadata.split(';')
    const imageBuffer = await readVisionImageBuffer(normalizedImageUrl, signal)
    const tempPath = createVisionInputTempPath(getVisionImageExtensionFromMimeType(mimeType))
    await fs.promises.writeFile(tempPath, imageBuffer)

    return {
      url: await createVisionInputAccessUrl(tempPath),
      cleanup: async () => {
        await fs.promises.unlink(tempPath).catch(() => undefined)
      },
    }
  }

  if (normalizedImageUrl.startsWith('file://')) {
    const sourcePath = fileURLToPath(normalizedImageUrl)
    const tempPath = createVisionInputTempPath(path.extname(sourcePath) || '.img')
    await fs.promises.copyFile(sourcePath, tempPath)

    return {
      url: await createVisionInputAccessUrl(tempPath),
      cleanup: async () => {
        await fs.promises.unlink(tempPath).catch(() => undefined)
      },
    }
  }

  if (/^https?:\/\//i.test(normalizedImageUrl)) {
    const remotePathname = (() => {
      try {
        return new URL(normalizedImageUrl).pathname
      } catch {
        return ''
      }
    })()
    const tempPath = createVisionInputTempPath(path.extname(remotePathname) || '.img')
    await downloadFileWithProgress(normalizedImageUrl, tempPath, {
      tempPath: `${tempPath}.download`,
      resourceLabel: 'Vision image',
    })

    return {
      url: await createVisionInputAccessUrl(tempPath),
      cleanup: async () => {
        await fs.promises.unlink(tempPath).catch(() => undefined)
      },
    }
  }

  throw new Error('The image block must contain a valid image.')
}

const requestOk = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const requestUrl = new URL(url)
    const transport = requestUrl.protocol === 'https:' ? https : http
    const request = transport.request(
      requestUrl,
      {
        method: 'GET',
      },
      (response) => {
        response.resume()

        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) {
          resolve()
          return
        }

        reject(new Error(`Request failed with status ${response.statusCode ?? 500}.`))
      }
    )

    request.on('error', reject)
    request.end()
  })

const hasVisionModelFiles = () => fs.existsSync(getVisionModelPath()) && fs.existsSync(getVisionProjectorPath())

const getStoredVisionStatusAfterShutdown = () =>
  getStoredVisionModelProgress().isComplete ? 'downloaded' : 'missing'

const ensureVisionModelFilesReady = async () => {
  const modelPath = getVisionModelPath()
  const projectorPath = getVisionProjectorPath()

  if (!fs.existsSync(modelPath) || !fs.existsSync(projectorPath)) {
    const message =
      `Download MiniCPM-V 4.5 in Settings before using ${PRIMARY_SHORTCUT_LABEL} + L on an image block.`

    emitVisionModelStatus({
      status: 'missing',
      progress: null,
      error: message,
    })
    throw new Error(message)
  }

  emitVisionModelStatus({
    status: aiStatus.visualModel.status === 'ready' ? 'ready' : 'downloaded',
    progress: null,
    error: aiStatus.visualModel.status === 'ready' ? aiStatus.visualModel.error : null,
    downloadedBytes: getExistingVisionModelSize() + getExistingVisionProjectorSize(),
    totalBytes: getExistingVisionModelSize() + getExistingVisionProjectorSize(),
  })

  return {
    modelPath,
    projectorPath,
  }
}

const ensureVisionRuntimeReady = async () => {
  const runtimePath = getVisionRuntimePath()
  if (runtimePath) {
    return runtimePath
  }

  if (visionRuntimeDownloadPromise) {
    return visionRuntimeDownloadPromise
  }

  visionRuntimeDownloadPromise = (async () => {
    const downloadUrl = getVisionRuntimeDownloadUrl()
    const archivePath = getVisionRuntimeArchivePath()
    const archiveTempPath = getVisionRuntimeTempPath()
    if (!downloadUrl || !archivePath || !archiveTempPath) {
      throw new Error('The local MiniCPM-V runtime is not available for this platform.')
    }

    await ensureVisionRuntimeDirectory()

    await downloadFileWithProgress(downloadUrl, archivePath, {
      tempPath: archiveTempPath,
      resourceLabel: 'Vision runtime',
    })

    await extractCompressedArchive(archivePath, getVisionRuntimeDirectory())
    await fs.promises.unlink(archivePath).catch(() => undefined)

    const extractedRuntimePath = getVisionRuntimePath()
    if (!extractedRuntimePath) {
      throw new Error('The MiniCPM-V runtime was downloaded but llama-server could not be found.')
    }

    return extractedRuntimePath
  })().finally(() => {
    visionRuntimeDownloadPromise = null
  })

  return visionRuntimeDownloadPromise
}

const waitForVisionServerHealth = async (port: number, timeoutMs = VISION_SERVER_HEALTH_TIMEOUT_MS) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await requestOk(`http://127.0.0.1:${port}/health`)
      return
    } catch {
      await delay(VISION_SERVER_POLL_INTERVAL_MS)
    }
  }

  throw new Error('MiniCPM-V took too long to become ready.')
}

const stopVisionServer = async () => {
  const child = visionServerProcess
  if (!child) {
    return
  }

  visionServerStopRequested = true

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      resolve()
    }

    child.once('exit', finish)

    try {
      child.kill()
    } catch {
      finish()
      return
    }

    setTimeout(() => {
      if (!settled) {
        try {
          child.kill('SIGKILL')
        } catch {
          finish()
        }
      }
    }, 5000)
  })

  visionServerStopRequested = false
}

const ensureVisionServerReady = async () => {
  if (visionServerProcess && visionServerPort) {
    try {
      await requestOk(`http://127.0.0.1:${visionServerPort}/health`)
      emitVisionModelStatus({
        status: 'ready',
        progress: null,
        error: null,
      })
      return `http://127.0.0.1:${visionServerPort}`
    } catch {
      await stopVisionServer()
    }
  }

  if (visionServerStartPromise) {
    return visionServerStartPromise
  }

  visionServerStartPromise = (async () => {
    const { modelPath, projectorPath } = await ensureVisionModelFilesReady()
    const runtimePath = await ensureVisionRuntimeReady()
    await ensureVisionInputDirectory()
    const port = await getAvailableLocalPort()
    const runtimeDirectory = path.dirname(runtimePath)
    let lastRuntimeLog = ''

    emitVisionModelStatus({
      status: 'starting',
      progress: null,
      error: null,
    })

    const child = spawn(
      runtimePath,
      [
        '-m',
        modelPath,
        '--mmproj',
        projectorPath,
        '--ctx-size',
        '8192',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--alias',
        VISION_SERVER_MODEL_ALIAS,
        '--media-path',
        getVisionInputDirectory(),
        '--no-webui',
      ],
      {
        cwd: runtimeDirectory,
        windowsHide: true,
      }
    )

    const appendRuntimeLog = (chunk: Buffer | string) => {
      lastRuntimeLog = `${lastRuntimeLog}${chunk.toString()}`.slice(-4000)
    }

    child.stdout.on('data', appendRuntimeLog)
    child.stderr.on('data', appendRuntimeLog)

    child.on('exit', (code, signal) => {
      if (visionServerProcess !== child) {
        return
      }

      visionServerProcess = null
      visionServerPort = null

      emitVisionModelStatus({
        status: getStoredVisionStatusAfterShutdown(),
        progress: null,
        error:
          visionServerStopRequested || code === 0
            ? null
            : `MiniCPM-V runtime stopped unexpectedly (${signal || code || 'unknown'}).`,
      })
    })

    visionServerProcess = child
    visionServerPort = port

    try {
      await waitForVisionServerHealth(port)

      emitVisionModelStatus({
        status: 'ready',
        progress: null,
        error: null,
      })

      return `http://127.0.0.1:${port}`
    } catch (error) {
      visionServerProcess = null
      visionServerPort = null
      visionServerStopRequested = true
      child.kill()
      visionServerStopRequested = false

      throw new Error(
        error instanceof Error && error.message
          ? `${error.message}${lastRuntimeLog.trim() ? ` ${lastRuntimeLog.trim()}` : ''}`
          : 'Unable to start the MiniCPM-V runtime.'
      )
    }
  })()
    .catch((error) => {
      emitVisionModelStatus({
        status: getStoredVisionStatusAfterShutdown(),
        progress: null,
        error: error instanceof Error ? error.message : 'Unable to prepare MiniCPM-V.',
      })
      throw error
    })
    .finally(() => {
      visionServerStartPromise = null
    })

  return visionServerStartPromise
}

const startVisionModelDownload = () => {
  if (visionDownloadPromise) {
    return visionDownloadPromise
  }

  visionDownloadPromise = (async () => {
    try {
      await ensureVisionModelDirectory()

      const existingModelBytes = getExistingVisionModelSize()
      const existingProjectorBytes = getExistingVisionProjectorSize()
      const baseDownloadedBytes =
        existingModelBytes + existingProjectorBytes + getPartialVisionModelSize() + getPartialVisionProjectorSize()

      emitVisionModelStatus({
        status: 'downloading',
        progress: {
          receivedBytes: baseDownloadedBytes,
          totalBytes: aiStatus.visualModel.totalBytes,
          percent: aiStatus.visualModel.totalBytes
            ? (baseDownloadedBytes / aiStatus.visualModel.totalBytes) * 100
            : null,
          speedBytesPerSecond: null,
        },
        downloadedBytes: baseDownloadedBytes,
        totalBytes: aiStatus.visualModel.totalBytes,
        error: null,
      })

      let modelTotalBytes: number | null = null

      if (existingModelBytes === 0) {
        await downloadFileWithProgress(LOCAL_VISION_MODEL_DOWNLOAD_URL, getVisionModelPath(), {
          tempPath: getVisionModelTempPath(),
          onProgress: ({ receivedBytes, totalBytes, percent, speedBytesPerSecond }) => {
            modelTotalBytes = totalBytes
            emitVisionModelStatus({
              status: 'downloading',
              progress: {
                receivedBytes,
                totalBytes:
                  totalBytes != null && aiStatus.visualModel.totalBytes != null
                    ? totalBytes + Math.max(aiStatus.visualModel.totalBytes - totalBytes, 0)
                    : totalBytes,
                percent,
                speedBytesPerSecond,
              },
              downloadedBytes: receivedBytes,
              totalBytes,
              error: null,
            })
          },
        })
      } else {
        modelTotalBytes = existingModelBytes
      }

      const completedModelBytes = getExistingVisionModelSize()
      const baseProjectorBytes = completedModelBytes + getPartialVisionProjectorSize()

      emitVisionModelStatus({
        status: 'downloading',
        progress: {
          receivedBytes: baseProjectorBytes,
          totalBytes: modelTotalBytes,
          percent: null,
          speedBytesPerSecond: null,
        },
        downloadedBytes: baseProjectorBytes,
        totalBytes: modelTotalBytes,
        error: null,
      })

      if (existingProjectorBytes === 0) {
        await downloadFileWithProgress(LOCAL_VISION_PROJECTOR_DOWNLOAD_URL, getVisionProjectorPath(), {
          tempPath: getVisionProjectorTempPath(),
          onProgress: ({ receivedBytes, totalBytes, speedBytesPerSecond }) => {
            const combinedReceivedBytes = completedModelBytes + receivedBytes
            const combinedTotalBytes = totalBytes != null ? completedModelBytes + totalBytes : null

            emitVisionModelStatus({
              status: 'downloading',
              progress: {
                receivedBytes: combinedReceivedBytes,
                totalBytes: combinedTotalBytes,
                percent: combinedTotalBytes ? (combinedReceivedBytes / combinedTotalBytes) * 100 : null,
                speedBytesPerSecond,
              },
              downloadedBytes: combinedReceivedBytes,
              totalBytes: combinedTotalBytes,
              error: null,
            })
          },
        })
      }

      const savedBytes = getExistingVisionModelSize() + getExistingVisionProjectorSize()

      emitVisionModelStatus({
        status: 'downloaded',
        progress: null,
        downloadedBytes: savedBytes,
        totalBytes: savedBytes,
        error: null,
      })
    } catch (error) {
      emitVisionModelStatus({
        status: getStoredVisionStatusAfterShutdown(),
        progress: null,
        error: error instanceof Error ? error.message : 'Unable to download the MiniCPM-V model.',
      })
    } finally {
      visionDownloadPromise = null
    }
  })()

  return visionDownloadPromise
}

const ensureSpeechAssetsReady = async () => {
  const modelPath = getSpeechModelPath()
  const runtimePath = getSpeechRuntimePath()

  if (!fs.existsSync(modelPath) || !runtimePath) {
    const platformMessage =
      !runtimePath && !IS_WINDOWS
        ? `Speech transcription on this build still needs a macOS whisper-cli runtime. Install whisper.cpp with Homebrew or place whisper-cli on PATH, then ${PRIMARY_SHORTCUT_LABEL} + J will work.`
        : `Download Whisper small.en in Settings before using ${PRIMARY_SHORTCUT_LABEL} + J.`

    emitSpeechModelStatus({
      status: 'missing',
      progress: null,
      error: platformMessage,
    })
    throw new Error(platformMessage)
  }

  emitSpeechModelStatus({
    status: 'ready',
    progress: null,
    error: null,
    downloadedBytes: getExistingSpeechModelSize(),
    totalBytes: getExistingSpeechModelSize(),
    runtimePath,
  })

  return {
    modelPath,
    runtimePath,
  }
}

const startSpeechModelDownload = () => {
  if (speechDownloadPromise) {
    return speechDownloadPromise
  }

  speechDownloadPromise = (async () => {
    try {
      if (!IS_WINDOWS && !getSpeechRuntimePath()) {
        throw new Error(
          'Speech runtime download is currently packaged for Windows only. On macOS, install whisper.cpp with Homebrew or place whisper-cli on PATH, then download Whisper small.en.'
        )
      }

      await ensureSpeechRuntimeDirectory()
      await ensureSpeechModelDirectory()

      const runtimePath = getSpeechRuntimePath()
      if (!runtimePath) {
        const partialRuntimeBytes = getPartialSpeechRuntimeSize()
        emitSpeechModelStatus({
          status: 'downloading',
          progress: {
            receivedBytes: partialRuntimeBytes,
            totalBytes: aiStatus.speechModel.totalBytes,
            percent:
              aiStatus.speechModel.totalBytes != null && aiStatus.speechModel.totalBytes > 0
                ? (partialRuntimeBytes / aiStatus.speechModel.totalBytes) * 100
                : null,
            speedBytesPerSecond: null,
          },
          downloadedBytes: partialRuntimeBytes,
          totalBytes: aiStatus.speechModel.totalBytes,
          error: null,
        })

        await downloadFileWithProgress(WHISPER_RUNTIME_DOWNLOAD_URL, getSpeechRuntimeArchivePath(), {
          tempPath: getSpeechRuntimeTempPath(),
          onProgress: ({ receivedBytes, totalBytes, percent, speedBytesPerSecond }) => {
            emitSpeechModelStatus({
              status: 'downloading',
              progress: {
                receivedBytes,
                totalBytes,
                percent,
                speedBytesPerSecond,
              },
              downloadedBytes: receivedBytes,
              totalBytes,
              error: null,
            })
          },
        })

        await extractArchive(getSpeechRuntimeArchivePath(), getSpeechRuntimeDirectory())
      }

      const resolvedRuntimePath = getSpeechRuntimePath()
      if (!resolvedRuntimePath) {
        throw new Error(
          `Whisper runtime was downloaded, but ${WHISPER_RUNTIME_FILENAME} could not be found.`
        )
      }

      if (!fs.existsSync(getSpeechModelPath())) {
        const partialModelBytes = getPartialSpeechModelSize()
        emitSpeechModelStatus({
          status: 'downloading',
          progress: {
            receivedBytes: partialModelBytes,
            totalBytes: aiStatus.speechModel.totalBytes,
            percent:
              aiStatus.speechModel.totalBytes != null && aiStatus.speechModel.totalBytes > 0
                ? (partialModelBytes / aiStatus.speechModel.totalBytes) * 100
                : null,
            speedBytesPerSecond: null,
          },
          downloadedBytes: partialModelBytes,
          totalBytes: aiStatus.speechModel.totalBytes,
          error: null,
          runtimePath: resolvedRuntimePath,
        })

        await downloadFileWithProgress(WHISPER_MODEL_DOWNLOAD_URL, getSpeechModelPath(), {
          tempPath: getSpeechModelTempPath(),
          onProgress: ({ receivedBytes, totalBytes, percent, speedBytesPerSecond }) => {
            emitSpeechModelStatus({
              status: 'downloading',
              progress: {
                receivedBytes,
                totalBytes,
                percent,
                speedBytesPerSecond,
              },
              downloadedBytes: receivedBytes,
              totalBytes,
              error: null,
              runtimePath: resolvedRuntimePath,
            })
          },
        })
      }

      const savedBytes = getExistingSpeechModelSize()
      emitSpeechModelStatus({
        status: 'ready',
        progress: null,
        downloadedBytes: savedBytes,
        totalBytes: savedBytes,
        error: null,
        runtimePath: resolvedRuntimePath,
      })
    } catch (error) {
      emitSpeechModelStatus({
        status: 'error',
        progress: null,
        error: error instanceof Error ? error.message : 'Unable to download the speech model.',
      })
    } finally {
      speechDownloadPromise = null
    }
  })()

  return speechDownloadPromise
}

const parseWhisperCliOutput = (output: string) =>
  output
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      const match = line.match(/^\[[^\]]+\]\s*(.*)$/)
      return match?.[1]?.trim() ?? ''
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

const AUDIO_TRANSCRIPTION_CANCELLED_ERROR = 'Audio transcription cancelled.'
const BLANK_AUDIO_TOKEN_PATTERN = /\[BLANK_AUDIO\]/gi

const sanitizeWhisperTranscript = (value: string) =>
  value
    .replace(BLANK_AUDIO_TOKEN_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isExpectedEmptyTranscription = (message: string) =>
  message === 'No audio was captured.' || message === 'No speech was detected in the captured audio.'

const isExpectedAudioTranscriptionCancellation = (message: string) =>
  message === AUDIO_TRANSCRIPTION_CANCELLED_ERROR

const cancelAudioTranscription = async (requestId: string) => {
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : ''
  if (!normalizedRequestId) {
    return
  }

  cancelledAudioTranscriptionIds.add(normalizedRequestId)
  const activeChild = activeAudioTranscriptionChildren.get(normalizedRequestId)

  if (activeChild && !activeChild.killed) {
    activeChild.kill()
    return
  }
}

const transcribeAudio = async (request: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> => {
  const tempDirectory = path.join(app.getPath('userData'), 'audio-transcription')
  const tempFilename = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`
  const tempAudioPath = path.join(tempDirectory, tempFilename)
  const requestId = typeof request.requestId === 'string' && request.requestId.trim() ? request.requestId.trim() : null

  try {
    const { modelPath, runtimePath } = await ensureSpeechAssetsReady()
    const audioData = Buffer.from(request.audioData ?? [])

    if (requestId && cancelledAudioTranscriptionIds.has(requestId)) {
      throw new Error(AUDIO_TRANSCRIPTION_CANCELLED_ERROR)
    }

    if (audioData.length === 0) {
      return {
        text: '',
        status: aiStatus.speechModel.status,
        error: 'No audio was captured.',
      }
    }

    await fs.promises.mkdir(tempDirectory, { recursive: true })
    await fs.promises.writeFile(tempAudioPath, audioData)

    const transcription = await new Promise<string>((resolve, reject) => {
      if (requestId && cancelledAudioTranscriptionIds.has(requestId)) {
        reject(new Error(AUDIO_TRANSCRIPTION_CANCELLED_ERROR))
        return
      }

      const child = spawn(runtimePath, ['-m', modelPath, '-f', tempAudioPath], {
        cwd: path.dirname(runtimePath),
        windowsHide: true,
      })

      if (requestId) {
        activeAudioTranscriptionChildren.set(requestId, child)
        if (cancelledAudioTranscriptionIds.has(requestId) && !child.killed) {
          child.kill()
        }
      }

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        if (requestId) {
          activeAudioTranscriptionChildren.delete(requestId)
          if (cancelledAudioTranscriptionIds.delete(requestId)) {
            reject(new Error(AUDIO_TRANSCRIPTION_CANCELLED_ERROR))
            return
          }
        }

        reject(error)
      })

      child.on('close', (code) => {
        if (requestId) {
          activeAudioTranscriptionChildren.delete(requestId)
          if (cancelledAudioTranscriptionIds.delete(requestId)) {
            reject(new Error(AUDIO_TRANSCRIPTION_CANCELLED_ERROR))
            return
          }
        }

        if (code !== 0) {
          reject(new Error(stderr.trim() || `whisper-cli exited with code ${code}.`))
          return
        }

        const text = sanitizeWhisperTranscript(parseWhisperCliOutput(`${stdout}\n${stderr}`))
        if (!text) {
          reject(new Error('No speech was detected in the captured audio.'))
          return
        }

        resolve(text)
      })
    })

    emitSpeechModelStatus({
      status: 'ready',
      progress: null,
      error: null,
    })

    return {
      text: transcription,
      status: 'ready',
      error: null,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unable to transcribe audio.'

    if (
      isExpectedEmptyTranscription(errorMessage) ||
      isExpectedAudioTranscriptionCancellation(errorMessage)
    ) {
      emitSpeechModelStatus({
        status: 'ready',
        progress: null,
        error: null,
      })

      return {
        text: '',
        status: 'ready',
        error: errorMessage,
      }
    }

    emitSpeechModelStatus({
      status: aiStatus.speechModel.status === 'missing' ? 'missing' : 'error',
      progress: null,
      error: errorMessage,
    })

    return {
      text: '',
      status: aiStatus.speechModel.status,
      error: errorMessage,
    }
  } finally {
    if (requestId) {
      activeAudioTranscriptionChildren.delete(requestId)
      cancelledAudioTranscriptionIds.delete(requestId)
    }
    await fs.promises.unlink(tempAudioPath).catch(() => undefined)
  }
}

const getGhostPromptLines = (text: string, maxLines: number, takeFromEnd: boolean) => {
  const normalizedText = text.replace(/\r/g, '')
  const lines = normalizedText.split('\n')
  return (takeFromEnd ? lines.slice(-maxLines) : lines.slice(0, maxLines)).join('\n')
}

const getTextOverlapLength = (left: string, right: string, maxScan = 160) => {
  const maxLength = Math.min(left.length, right.length, maxScan)

  for (let length = maxLength; length > 0; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) {
      return length
    }
  }

  return 0
}

const limitGhostSuggestion = (suggestion: string, request: GhostTextRequest) => {
  const maxLines = request.blockType === 'code' ? 6 : 2
  const maxLength = request.blockType === 'code' ? 240 : 160
  return suggestion.split('\n').slice(0, maxLines).join('\n').slice(0, maxLength)
}

const sanitizeGhostSuggestion = (rawSuggestion: string, request: GhostTextRequest) => {
  let suggestion = rawSuggestion
    .replace(/\r/g, '')
    .replace(/^```[A-Za-z0-9_-]*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^(sure|here(?:'s| is)|continuation:)\s*/i, '')
    .replace(/\u0000/g, '')

  if (!suggestion.trim()) {
    return ''
  }

  const leadingOverlap = getTextOverlapLength(request.beforeText, suggestion)
  if (leadingOverlap > 0) {
    suggestion = suggestion.slice(leadingOverlap)
  }

  const trailingOverlap = getTextOverlapLength(suggestion, request.afterText)
  if (trailingOverlap > 0) {
    suggestion = suggestion.slice(0, -trailingOverlap)
  }

  suggestion = suggestion
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/g, '')

  if (!suggestion.trim()) {
    return ''
  }

  const lastBeforeCharacter = request.beforeText.slice(-1)
  const firstSuggestionCharacter = suggestion.charAt(0)
  const shouldAddLeadingSpace =
    !!lastBeforeCharacter &&
    !!firstSuggestionCharacter &&
    !/\s/.test(lastBeforeCharacter) &&
    !/\s/.test(firstSuggestionCharacter) &&
    /[A-Za-z0-9([{'"`]/.test(firstSuggestionCharacter)

  const lastSuggestionCharacter = suggestion.slice(-1)
  const firstAfterCharacter = request.afterText.charAt(0)
  const shouldAddTrailingSpace =
    request.blockType !== 'code' &&
    !!lastSuggestionCharacter &&
    !!firstAfterCharacter &&
    !/\s/.test(lastSuggestionCharacter) &&
    !/\s/.test(firstAfterCharacter) &&
    /[A-Za-z0-9)]/.test(lastSuggestionCharacter) &&
    /[A-Za-z0-9([{'"`]/.test(firstAfterCharacter)

  suggestion = `${shouldAddLeadingSpace ? ' ' : ''}${suggestion}${shouldAddTrailingSpace ? ' ' : ''}`

  return limitGhostSuggestion(suggestion, request)
}

const generateGhostText = async (request: GhostTextRequest): Promise<GhostTextResponse> => {
  try {
    const model = await ensureAiRuntimeReady()
    const llamaModule = await import('node-llama-cpp')
    const context = await model.createContext({ contextSize: 2048 })

    try {
      const session = new llamaModule.LlamaChatSession({
        contextSequence: context.getSequence(),
      })

      const blockSnapshot = `${request.beforeText}<CURSOR>${request.afterText}` || '<CURSOR>'
      const recentLines = getGhostPromptLines(request.beforeText, 7, true)
      const upcomingLines = getGhostPromptLines(request.afterText, 3, false)
      const prompt = [
        'You generate inline ghost text inside a note-taking editor.',
        'Reply with only the exact text to insert at <CURSOR>.',
        'Use only the currently focused block. Ignore page titles, page metadata, and other blocks.',
        'Match the existing spacing, punctuation, indentation, and tone.',
        'Do not explain, do not quote, and do not repeat text that is already before or after the cursor.',
        request.blockType === 'code'
          ? 'Continue the code naturally and keep the syntax valid.'
          : 'Prefer a direct continuation of the current sentence or line.',
        'Do not add list bullets, heading markers, or checkbox syntax unless it belongs inside the block text itself.',
        `Focused block type: ${request.blockType}`,
        `Last 7 lines before cursor:\n${recentLines || '(empty)'}`,
        `Upcoming text after cursor:\n${upcomingLines || '(none)'}`,
        `Focused block with cursor:\n${blockSnapshot}`,
      ].join('\n\n')

      const rawSuggestion = await session.prompt(prompt, {
        maxTokens: request.blockType === 'code' ? 96 : 64,
        temperature: 0.1,
      })

      return {
        suggestion: sanitizeGhostSuggestion(rawSuggestion, request),
        status: 'ready',
        error: null,
      }
    } finally {
      if (context && typeof context.dispose === 'function') {
        context.dispose()
      }
    }
  } catch (error) {
    return {
      suggestion: '',
      status: aiStatus.status,
      error: error instanceof Error ? error.message : 'Unable to generate ghost text.',
    }
  }
}

const sanitizeInlineAgentChunk = (chunk: string) =>
  chunk
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')

const getInlineAgentGenerationSettings = (
  answerLength: AiAnswerLength,
  targetBlockType: InlineAgentRequest['targetBlockType']
) => {
  const isCode = targetBlockType === 'code'

  if (answerLength === 'concise') {
    return {
      maxTokens: isCode ? 480 : 260,
      outputLimit: isCode ? 6000 : 2800,
      instruction: isCode
        ? 'Keep the implementation compact, correct, and focused on the requested task.'
        : 'Keep the response concise, direct, and complete without unnecessary filler.',
      temperature: isCode ? 0.12 : 0.24,
    }
  }

  if (answerLength === 'balanced') {
    return {
      maxTokens: isCode ? 800 : 540,
      outputLimit: isCode ? 9000 : 4200,
      instruction: isCode
        ? 'Provide a solid implementation with the necessary structure, handling, and clarity.'
        : 'Give a complete answer with useful detail, but stay focused on the request.',
      temperature: isCode ? 0.14 : 0.3,
    }
  }

  return {
    maxTokens: isCode ? 1200 : 900,
    outputLimit: isCode ? 12000 : 7000,
    instruction: isCode
      ? 'Provide a robust, well-fleshed-out implementation with the important details handled.'
      : 'Be detailed, thoughtful, and complete. Include the useful specifics the user is implicitly asking for.',
    temperature: isCode ? 0.16 : 0.34,
  }
}

const trimInlineAgentOutput = (output: string, limit: number, isCode: boolean) => {
  if (output.length <= limit) {
    return output
  }

  const truncated = output.slice(0, limit)

  if (isCode) {
    return truncated.trimEnd()
  }

  return truncated
    .replace(/\s+\S*$/, '')
    .trim()
}

const sanitizeInlineAgentOutput = (rawOutput: string, request: InlineAgentRequest) => {
  const generationSettings = getInlineAgentGenerationSettings(
    aiStatus.generationPreferences.answerLength,
    request.targetBlockType
  )
  let output = rawOutput
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .replace(/^```[A-Za-z0-9_-]*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^(sure|here(?:'s| is)|result:|output:)\s*/i, '')

  output =
    request.targetBlockType === 'code'
      ? output.trimEnd()
      : output.trim()

  output = output.replace(/\n{3,}/g, '\n\n')

  return trimInlineAgentOutput(output, generationSettings.outputLimit, request.targetBlockType === 'code')
}

const buildInlineAgentPrompt = (request: InlineAgentRequest) => {
  const generationSettings = getInlineAgentGenerationSettings(
    aiStatus.generationPreferences.answerLength,
    request.targetBlockType
  )

  return [
    'You are an inline AI agent inside a block-based note editor.',
    'Reply with only the content for the currently focused block.',
    'Do not add explanations about what you did, markdown fences, labels, or surrounding quotes.',
    request.targetBlockType === 'code'
      ? 'Output only valid code or code-adjacent content for the requested task.'
      : 'Output polished block content that directly satisfies the instruction.',
    'Follow the user instruction closely and satisfy every concrete detail they asked for.',
    request.targetBlockType === 'code'
      ? 'Prefer code that is correct, coherent, and ready to use instead of pseudo-code.'
      : 'If the user is asking for an explanation, answer clearly and specifically rather than giving vague filler.',
    request.actionMode === 'append'
      ? 'Keep the existing block content unchanged. Output only the new content that should be appended.'
      : 'Replace the existing block content. Output the full new block content only.',
    generationSettings.instruction,
    'Finish cleanly instead of trailing off mid-thought.',
    `User instruction:\n${request.prompt}`,
    `Action mode: ${request.actionMode}`,
    `Current block type: ${request.currentBlockType}`,
    `Target block type: ${request.targetBlockType}`,
    `Current block content:\n${request.currentBlockContent || '(empty)'}`,
  ].join('\n\n')
}

const buildInlineVisionAgentPrompt = (request: InlineAgentRequest) => {
  const generationSettings = getInlineAgentGenerationSettings(
    aiStatus.generationPreferences.answerLength,
    request.targetBlockType
  )

  return [
    'You are a local visual AI agent inside a block-based note editor.',
    'An image from the currently focused block is attached.',
    'Reply with only the content for the new block that will be inserted directly below that image.',
    'Do not add markdown fences, labels, surrounding quotes, or meta commentary.',
    request.targetBlockType === 'code'
      ? 'If the user is asking for code, output only valid code or code-adjacent content.'
      : 'If the user is asking for an explanation, answer clearly, concretely, and accurately from the image.',
    'Base your answer on the visible evidence in the image and say when the image is insufficient instead of guessing.',
    generationSettings.instruction,
    'Finish cleanly instead of trailing off mid-thought.',
    `User instruction:\n${request.prompt}`,
    `Target block type: ${request.targetBlockType}`,
  ].join('\n\n')
}

const parseVisionCompletionContent = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }

        return ''
      })
      .filter(Boolean)
      .join('')
  }

  return ''
}

const runInlineVisionAgent = async (
  event: Electron.IpcMainInvokeEvent,
  request: InlineAgentRequest,
  controller: AbortController
) => {
  if (!request.imageUrl?.trim()) {
    throw new Error('No image was found in the focused block.')
  }

  const baseUrl = await ensureVisionServerReady()
  if (controller.signal.aborted) {
    throw new Error('Inline agent cancelled.')
  }

  const preparedImage = await prepareVisionInputFile(request.imageUrl, controller.signal)
  const generationSettings = getInlineAgentGenerationSettings(
    aiStatus.generationPreferences.answerLength,
    request.targetBlockType
  )

  try {
    const response = await requestJson<{
      choices?: Array<{
        message?: {
          content?: unknown
        }
      }>
      error?: {
        message?: string
      }
    }>(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      body: {
        model: VISION_SERVER_MODEL_ALIAS,
        max_tokens: generationSettings.maxTokens,
        temperature: Math.max(0.1, generationSettings.temperature - 0.06),
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You answer from the attached image for a block-based note editor. Return only the block content the app should insert.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildInlineVisionAgentPrompt(request),
              },
              {
                type: 'image_url',
                image_url: {
                  url: preparedImage.url,
                },
              },
            ],
          },
        ],
      },
    })

    const rawOutput = parseVisionCompletionContent(response.choices?.[0]?.message?.content)
    if (!rawOutput.trim()) {
      const serverError = response.error?.message?.trim()
      throw new Error(serverError || 'The local vision model returned empty content.')
    }

    event.sender.send('ai:inlineAgentEvent', {
      requestId: request.requestId,
      type: 'complete',
      fullText: sanitizeInlineAgentOutput(rawOutput, request),
    })
  } finally {
    await preparedImage.cleanup()
  }
}

const runInlineAgent = async (
  event: Electron.IpcMainInvokeEvent,
  request: InlineAgentRequest
): Promise<void> => {
  const prompt = request.prompt.trim()
  if (!prompt) {
    event.sender.send('ai:inlineAgentEvent', {
      requestId: request.requestId,
      type: 'error',
      error: 'Enter a prompt before running the AI agent.',
    })
    return
  }

  const controller = new AbortController()
  inlineAgentControllers.set(request.requestId, controller)

  try {
    if (request.imageUrl?.trim()) {
      await runInlineVisionAgent(event, request, controller)
      return
    }

    const model = await ensureAiRuntimeReady()
    const llamaModule = await import('node-llama-cpp')
    const context = await model.createContext({ contextSize: 4096 })

    try {
      const session = new llamaModule.LlamaChatSession({
        contextSequence: context.getSequence(),
      })

      const streamedChunks: string[] = []
      const generationSettings = getInlineAgentGenerationSettings(
        aiStatus.generationPreferences.answerLength,
        request.targetBlockType
      )

      await session.prompt(buildInlineAgentPrompt(request), {
        maxTokens: generationSettings.maxTokens,
        temperature: generationSettings.temperature,
        signal: controller.signal,
        stopOnAbortSignal: true,
        onTextChunk: (chunk: string) => {
          const sanitizedChunk = sanitizeInlineAgentChunk(chunk)
          if (!sanitizedChunk) {
            return
          }

          streamedChunks.push(sanitizedChunk)
          event.sender.send('ai:inlineAgentEvent', {
            requestId: request.requestId,
            type: 'chunk',
            chunk: sanitizedChunk,
          })
        },
      })

      event.sender.send('ai:inlineAgentEvent', {
        requestId: request.requestId,
        type: 'complete',
        fullText: sanitizeInlineAgentOutput(streamedChunks.join(''), request),
      })
    } finally {
      if (context && typeof context.dispose === 'function') {
        context.dispose()
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      event.sender.send('ai:inlineAgentEvent', {
        requestId: request.requestId,
        type: 'cancelled',
      })
      return
    }

    event.sender.send('ai:inlineAgentEvent', {
      requestId: request.requestId,
      type: 'error',
      error: getReadableErrorMessage(error, 'Unable to generate inline AI content.'),
    })
  } finally {
    inlineAgentControllers.delete(request.requestId)
  }
}

// ==============================
// CREATE WINDOW
// ==============================
function createWindow() {
  startPluginDirectoryWatcher()
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    width: 1200,
    height: 800,
    show: false,
    frame: IS_MACOS,
    titleBarStyle: IS_MACOS ? 'hiddenInset' : 'hidden',
    backgroundColor: '#FAFAFA',
  })

  win.maximize()
  win.once('ready-to-show', () => {
    win?.show()
  })
  win.webContents.on('did-finish-load', () => {
    void syncPlugins('load')
  })

  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools({ mode: 'detach' })
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ==============================
// WINDOW CONTROLS (SAFE)
// ==============================
ipcMain.on('window-control', (_event, action: 'minimize' | 'maximize' | 'close') => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return

  switch (action) {
    case 'minimize':
      win.minimize()
      break

    case 'maximize':
      win.isMaximized() ? win.unmaximize() : win.maximize()
      break

    case 'close':
      win.close()
      break
  }
})

// ==============================
// IPC REGISTRATION (CLEAN)
// ==============================
function registerIpcHandlers() {
  ipcMain.handle('ai:getStatus', () => {
    emitAiStatus({})
    return aiStatus
  })

  ipcMain.handle('ai:downloadModel', async () => {
    void startModelDownload()
    return aiStatus
  })

  ipcMain.handle('ai:downloadVisionModel', async () => {
    void startVisionModelDownload()
    return aiStatus
  })

  ipcMain.handle('ai:downloadSpeechModel', async () => {
    void startSpeechModelDownload()
    return aiStatus
  })

  ipcMain.handle('ai:generateGhostText', async (_event, request: GhostTextRequest) => {
    return generateGhostText(request)
  })

  ipcMain.handle('ai:runInlineAgent', async (event, request: InlineAgentRequest) => {
    await runInlineAgent(event, request)
  })

  ipcMain.handle('ai:cancelInlineAgent', async (_event, requestId: string) => {
    inlineAgentControllers.get(requestId)?.abort()
  })

  ipcMain.handle('ai:updateTranscriptionPreferences', async (_event, preferences: AudioTranscriptionPreferences) => {
    return updateTranscriptionPreferences(preferences)
  })

  ipcMain.handle('ai:updateGenerationPreferences', async (_event, preferences: AiGenerationPreferences) => {
    return updateGenerationPreferences(preferences)
  })

  ipcMain.handle('ai:getSystemAudioSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    })

    return sources.map((source) => ({
      id: source.id,
      label: source.name,
      kind: 'system',
    })) as AudioCaptureSource[]
  })

  ipcMain.handle('ai:transcribeAudio', async (_event, request: AudioTranscriptionRequest) => {
    return transcribeAudio(request)
  })

  ipcMain.handle('ai:cancelAudioTranscription', async (_event, requestId: string) => {
    await cancelAudioTranscription(requestId)
  })

  // ==============================
  // PLUGINS
  // ==============================

  ipcMain.handle('plugins:getState', () => {
    return buildInstalledPluginStates()
  })

  ipcMain.handle('plugins:listInstalled', () => {
    const disabledPluginIds = getDisabledPluginIds()

    return listInstalledPluginFiles().map((plugin) => ({
      filename: plugin.filename,
      id: plugin.id,
      disabled: disabledPluginIds.has(plugin.id),
    }))
  })

  ipcMain.handle('plugins:install', async (_event, payload) => {
    const downloadUrl =
      typeof payload?.downloadUrl === 'string'
        ? payload.downloadUrl
        : typeof payload?.url === 'string'
          ? payload.url
          : null
    const filenameSource =
      typeof payload?.filename === 'string'
        ? payload.filename
        : typeof payload?.name === 'string'
          ? payload.name
          : null

    if (!downloadUrl || !filenameSource) {
      throw new Error('The plugin download URL and filename are required.')
    }

    const safeFilename = getSafePluginFilename(filenameSource)
    const pluginId = safeFilename.replace(/\.js$/i, '').toLowerCase()
    const destinationPath = path.join(getPluginsDirectory(), safeFilename)

    await downloadPluginFile(downloadUrl, destinationPath)
    setPluginDisabledState(pluginId, false)
    await syncPlugins('install')

    return {
      filename: safeFilename,
      id: pluginId,
      installed: true,
    }
  })

  ipcMain.handle('plugins:remove', async (_event, payload) => {
    const filenameSource =
      typeof payload?.filename === 'string'
        ? payload.filename
        : typeof payload?.name === 'string'
          ? payload.name
          : null

    if (!filenameSource) {
      throw new Error('A plugin filename is required to remove a plugin.')
    }

    const safeFilename = getSafePluginFilename(filenameSource)
    const pluginId = safeFilename.replace(/\.js$/i, '').toLowerCase()
    const destinationPath = path.join(getPluginsDirectory(), safeFilename)

    if (!fs.existsSync(destinationPath)) {
      throw new Error('That plugin file could not be found in the local plugins folder.')
    }

    await fs.promises.unlink(destinationPath)
    setPluginDisabledState(pluginId, false)
    await syncPlugins('remove')

    return {
      filename: safeFilename,
      id: pluginId,
      removed: true,
    }
  })

  ipcMain.handle('plugins:disable', async (_event, pluginId) => {
    if (typeof pluginId !== 'string' || !pluginId.trim()) {
      throw new Error('A valid plugin id is required to disable a plugin.')
    }

    setPluginDisabledState(pluginId, true)
    await syncPlugins('disable')

    return {
      id: pluginId.trim().toLowerCase(),
      disabled: true,
    }
  })

  ipcMain.handle('plugins:enable', async (_event, pluginId) => {
    if (typeof pluginId !== 'string' || !pluginId.trim()) {
      throw new Error('A valid plugin id is required to enable a plugin.')
    }

    setPluginDisabledState(pluginId, false)
    await syncPlugins('enable')

    return {
      id: pluginId.trim().toLowerCase(),
      disabled: false,
    }
  })

  // ==============================
  // TASKS
  // ==============================

  ipcMain.handle('db:getTasks', () => {
    try {
      return (db.prepare('SELECT * FROM tasks').all() as any[]).map(parseTaskRow)
    } catch (err) {
      console.error('getTasks error:', err)
      return []
    }
  })

  ipcMain.handle('db:addTask', (_event, task) => {
    try {
      const completedAt =
        task.status === 'done' ? normalizeTaskTimestamp(task.completedAt) ?? Date.now() : null
      const isDeleted = !!task.isDeleted
      const deletedAt = isDeleted ? normalizeTaskTimestamp(task.deletedAt) ?? Date.now() : null
      const scope = normalizeTaskScope(task.scope)

      db.prepare(`
        INSERT INTO tasks (id, title, status, priority, scope, assignee, tags, date, isDeleted, completedAt, deletedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        task.id,
        task.title,
        task.status,
        task.priority,
        scope,
        task.assignee ?? null,
        serializeTaskTags(task.tags),
        normalizeTaskDate(task.date),
        isDeleted ? 1 : 0,
        completedAt,
        deletedAt
      )

      return true
    } catch (err) {
      console.error('addTask error:', err)
      return false
    }
  })

  ipcMain.handle('db:updateTask', (_event, { id, updates }) => {
    try {
      const currentTask = db.prepare('SELECT completedAt FROM tasks WHERE id = ?').get(id) as
        | { completedAt: number | null }
        | undefined

      if (!currentTask) {
        return false
      }

      const allowedFields = ['title', 'status', 'priority', 'scope', 'assignee', 'tags', 'date']

      const normalizedUpdates: Record<string, unknown> = {
        ...updates,
        ...(Object.prototype.hasOwnProperty.call(updates, 'scope')
          ? { scope: normalizeTaskScope(updates.scope) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'tags')
          ? { tags: serializeTaskTags(updates.tags) }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'date')
          ? { date: normalizeTaskDate(updates.date) }
          : {}),
      }

      if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
        normalizedUpdates.completedAt =
          updates.status === 'done'
            ? normalizeTaskTimestamp(currentTask.completedAt) ?? Date.now()
            : null
      }

      const fields = Object.keys(normalizedUpdates)
        .filter((key) => [...allowedFields, 'completedAt'].includes(key))
        .map((key) => `${key} = @${key}`)
        .join(', ')

      if (!fields) return false

      db.prepare(`
        UPDATE tasks
        SET ${fields}
        WHERE id = @id
      `).run({ id, ...normalizedUpdates })

      return true
    } catch (err) {
      console.error('updateTask error:', err)
      return false
    }
  })

  ipcMain.handle('db:deleteTask', (_event, id) => {
    try {
      db.prepare(`
        UPDATE tasks
        SET isDeleted = 1, deletedAt = ?
        WHERE id = ?
      `).run(Date.now(), id)
      return true
    } catch (err) {
      console.error('deleteTask error:', err)
      return false
    }
  })

  ipcMain.handle('db:restoreTask', (_event, id) => {
    try {
      db.prepare(`
        UPDATE tasks
        SET isDeleted = 0, deletedAt = NULL
        WHERE id = ?
      `).run(id)
      return true
    } catch (err) {
      console.error('restoreTask error:', err)
      return false
    }
  })

  ipcMain.handle('db:deleteTaskPermanently', (_event, id) => {
    try {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      return true
    } catch (err) {
      console.error('deleteTaskPermanently error:', err)
      return false
    }
  })

  // ==============================
  // PAGES (NOTES)
  // ==============================

  ipcMain.handle('db:getPages', () => {
    try {
      return (db.prepare('SELECT * FROM pages ORDER BY updatedAt DESC, createdAt DESC').all() as any[]).map(
        parsePageRow
      )
    } catch (err) {
      console.error('getPages error:', err)
      return []
    }
  })

  ipcMain.handle('db:addPage', (_event, page) => {
    try {
      db.prepare(`
        INSERT INTO pages (id, title, parentId, properties, isFavourite, isPinned, isArchived, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        page.id,
        page.title,
        page.parentId ?? null,
        serializePageProperties(page.properties ?? DEFAULT_PAGE_PROPERTIES),
        0,
        0,
        0,
        Date.now(),
        Date.now()
      )

      ensurePageHistorySeed(page.id, [], null)

      return true
    } catch (err) {
      console.error('addPage error:', err)
      return false
    }
  })

  ipcMain.handle('db:updatePage', (_event, { id, updates }) => {
    try {
      const allowed = ['title', 'parentId', 'isFavourite', 'isPinned', 'isArchived', 'properties']

      const normalizedUpdates = {
        ...updates,
        ...(Object.prototype.hasOwnProperty.call(updates, 'isArchived')
          ? { isArchived: updates.isArchived ? 1 : 0 }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(updates, 'properties')
          ? { properties: serializePageProperties(updates.properties) }
          : {}),
      }

      const fields = Object.keys(normalizedUpdates)
        .filter((k) => allowed.includes(k))
        .map((k) => `${k} = @${k}`)
        .join(', ')

      if (!fields) return false

      db.prepare(`
        UPDATE pages
        SET ${fields}, updatedAt = @updatedAt
        WHERE id = @id
      `).run({
        id,
        ...normalizedUpdates,
        updatedAt: Date.now(),
      })

      return true
    } catch (err) {
      console.error('updatePage error:', err)
      return false
    }
  })

  ipcMain.handle('db:deletePage', (_event, id) => {
    try {
      const pageIds = getPageTreeIds(id)
      runPageIdsUpdate(
        `
          UPDATE pages
          SET isArchived = 1,
              isFavourite = 0,
              isPinned = 0,
              updatedAt = ?
          WHERE id IN (__IDS__)
        `,
        pageIds,
        [Date.now()]
      )
      return true
    } catch (err) {
      console.error('deletePage error:', err)
      return false
    }
  })

  ipcMain.handle('db:restorePage', (_event, id) => {
    try {
      const rootPage = db.prepare('SELECT parentId FROM pages WHERE id = ?').get(id) as
        | { parentId: string | null }
        | undefined

      const parentPage = rootPage?.parentId
        ? (db.prepare('SELECT id, isArchived FROM pages WHERE id = ?').get(rootPage.parentId) as
            | { id: string; isArchived: number }
            | undefined)
        : undefined

      const restoredParentId =
        parentPage && !parentPage.isArchived ? rootPage?.parentId ?? null : null

      db.prepare(`
        UPDATE pages
        SET isArchived = 0,
            parentId = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(restoredParentId, Date.now(), id)

      const descendantIds = getPageTreeIds(id).filter((pageId) => pageId !== id)
      runPageIdsUpdate(
        `
          UPDATE pages
          SET isArchived = 0,
              updatedAt = ?
          WHERE id IN (__IDS__)
        `,
        descendantIds,
        [Date.now()]
      )

      return true
    } catch (err) {
      console.error('restorePage error:', err)
      return false
    }
  })

  ipcMain.handle('db:deletePagePermanently', (_event, id) => {
    try {
      const pageIds = getPageTreeIds(id)
      runPageIdsUpdate('DELETE FROM blocks WHERE pageId IN (__IDS__)', pageIds)
      runPageIdsUpdate('DELETE FROM page_history WHERE pageId IN (__IDS__)', pageIds)
      runPageIdsUpdate('DELETE FROM page_history_state WHERE pageId IN (__IDS__)', pageIds)
      runPageIdsUpdate('DELETE FROM pages WHERE id IN (__IDS__)', pageIds)
      return true
    } catch (err) {
      console.error('deletePagePermanently error:', err)
      return false
    }
  })

  // ==============================
  // BLOCKS (EDITOR CONTENT)
  // ==============================

  ipcMain.handle('db:getBlocks', (_event, pageId) => {
  try {
    const flatBlocks = db
      .prepare('SELECT * FROM blocks WHERE pageId = ? ORDER BY position ASC')
      .all(pageId) as any[];

    // Convert SQLite 1/0 to boolean
    const formattedBlocks = flatBlocks.map(block => ({
      ...block,
      checked: block.checked === 1,
      children: [] // Initialize empty children array
    }));

    // Reconstruct the tree structure
    const blockMap = new Map();
    const rootBlocks: any[] = [];

    // First pass: Put everything in a map for quick lookup
    formattedBlocks.forEach(block => blockMap.set(block.id, block));

    // Second pass: Assign children to parents or push to root
    formattedBlocks.forEach(block => {
      if (block.parentId && blockMap.has(block.parentId)) {
        blockMap.get(block.parentId).children.push(block);
      } else {
        rootBlocks.push(block);
      }
    });

    return rootBlocks;
  } catch (err) {
    console.error('getBlocks error:', err);
    return [];
  }
});

  ipcMain.handle('db:saveBlocks', (_event, { pageId, blocks }) => {
    try {
      persistBlocksForPage(pageId, blocks)
      return true
    } catch (err) {
      console.error('saveBlocks error:', err)
      return false
    }
  })

  ipcMain.handle('db:ensurePageHistory', (_event, { pageId, blocks, history }) => {
    try {
      return ensurePageHistorySeed(pageId, blocks, history?.focusBlockId)
    } catch (err) {
      console.error('ensurePageHistory error:', err)
      return null
    }
  })

  ipcMain.handle('db:saveBlocksWithHistory', (_event, { pageId, blocks, history }) => {
    try {
      return saveBlocksWithHistory(pageId, blocks, history?.focusBlockId)
    } catch (err) {
      console.error('saveBlocksWithHistory error:', err)
      return null
    }
  })

  ipcMain.handle('db:undoBlocks', (_event, pageId) => {
    try {
      return applyPageHistoryStep(pageId, 'undo')
    } catch (err) {
      console.error('undoBlocks error:', err)
      return null
    }
  })

  ipcMain.handle('db:redoBlocks', (_event, pageId) => {
    try {
      return applyPageHistoryStep(pageId, 'redo')
    } catch (err) {
      console.error('redoBlocks error:', err)
      return null
    }
  })
}

// ==============================
// APP READY
// ==============================
app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'app.db')

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'project',
      assignee TEXT,
      tags TEXT DEFAULT '[]',
      date TEXT,
      isDeleted INTEGER DEFAULT 0,
      completedAt INTEGER,
      deletedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      parentId TEXT,
      properties TEXT DEFAULT '{}',
      isFavourite INTEGER DEFAULT 0,
      isPinned INTEGER DEFAULT 0,
      isArchived INTEGER DEFAULT 0,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      pageId TEXT NOT NULL,
      parentId TEXT,
      type TEXT NOT NULL,
      content TEXT,
      position INTEGER,
      width REAL DEFAULT 100,
      checked INTEGER DEFAULT 0,
      refId TEXT,
      FOREIGN KEY(pageId) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageId TEXT NOT NULL,
      revision INTEGER NOT NULL,
      blocks TEXT NOT NULL,
      focusBlockId TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(pageId, revision)
    );

    CREATE TABLE IF NOT EXISTS page_history_state (
      pageId TEXT PRIMARY KEY,
      currentRevision INTEGER NOT NULL
    );
  `)

  const taskScopeColumns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
  const hasTaskScope = taskScopeColumns.some((column) => column.name === 'scope');

  if (!hasTaskScope) {
    db.exec("ALTER TABLE tasks ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';");
  }

  db.prepare("UPDATE tasks SET scope = 'project' WHERE scope IS NULL OR TRIM(scope) = ''").run();

  // Inside app.whenReady()
  const columns = db.prepare("PRAGMA table_info(blocks)").all() as any[];
  const hasParentId = columns.some(c => c.name === 'parentId');
  const hasWidth = columns.some(c => c.name === 'width');
  const hasRefId = columns.some(c => c.name === 'refId');

  if (!hasParentId) {
    db.exec("ALTER TABLE blocks ADD COLUMN parentId TEXT;");
  }

  if (!hasWidth) {
    db.exec("ALTER TABLE blocks ADD COLUMN width REAL DEFAULT 100;");
  }

  if (!hasRefId) {
    db.exec("ALTER TABLE blocks ADD COLUMN refId TEXT;");
  }

  if (!hasParentId || !hasWidth || !hasRefId) {
    console.log("Successfully migrated database schema!");
  }

  const pageColumns = db.prepare("PRAGMA table_info(pages)").all() as any[];
  const hasProperties = pageColumns.some((column) => column.name === 'properties');
  const hasArchived = pageColumns.some((column) => column.name === 'isArchived');

  if (!hasProperties) {
    db.exec("ALTER TABLE pages ADD COLUMN properties TEXT DEFAULT '{}';");
  }

  if (!hasArchived) {
    db.exec("ALTER TABLE pages ADD COLUMN isArchived INTEGER DEFAULT 0;");
  }

  db.prepare("UPDATE pages SET properties = ? WHERE properties IS NULL OR TRIM(properties) = ''").run(
    serializePageProperties(DEFAULT_PAGE_PROPERTIES)
  );
  db.prepare("UPDATE pages SET isArchived = 0 WHERE isArchived IS NULL").run();

  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
  const hasTaskTags = taskColumns.some((column) => column.name === 'tags');
  const hasTaskDate = taskColumns.some((column) => column.name === 'date');
  const hasTaskIsDeleted = taskColumns.some((column) => column.name === 'isDeleted');
  const hasTaskCompletedAt = taskColumns.some((column) => column.name === 'completedAt');
  const hasTaskDeletedAt = taskColumns.some((column) => column.name === 'deletedAt');

  if (!hasTaskTags) {
    db.exec("ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';");
  }

  if (!hasTaskDate) {
    db.exec("ALTER TABLE tasks ADD COLUMN date TEXT;");
  }

  if (!hasTaskIsDeleted) {
    db.exec("ALTER TABLE tasks ADD COLUMN isDeleted INTEGER DEFAULT 0;");
  }

  if (!hasTaskCompletedAt) {
    db.exec("ALTER TABLE tasks ADD COLUMN completedAt INTEGER;");
  }

  if (!hasTaskDeletedAt) {
    db.exec("ALTER TABLE tasks ADD COLUMN deletedAt INTEGER;");
  }

  db.prepare("UPDATE tasks SET tags = '[]' WHERE tags IS NULL OR TRIM(tags) = ''").run();
  db.prepare("UPDATE tasks SET isDeleted = 0 WHERE isDeleted IS NULL").run();
  db.prepare("UPDATE tasks SET completedAt = NULL WHERE status <> 'done'").run();
  db.prepare("UPDATE tasks SET deletedAt = NULL WHERE isDeleted = 0").run();

  initializeAiStatus()
  registerIpcHandlers()
  startPluginDirectoryWatcher()
  createWindow()

  if (getPartialModelSize() > 0 && getExistingModelSize() === 0) {
    void startModelDownload()
  }

  if (getStoredVisionModelProgress().downloadedBytes > 0 && !getStoredVisionModelProgress().isComplete) {
    void startVisionModelDownload()
  }
})

// ==============================
// LIFECYCLE
// ==============================
app.on('before-quit', () => {
  stopPluginDirectoryWatcher()
  visionServerStopRequested = true
  visionServerProcess?.kill()
  void stopVisionInputServer()
})

app.on('window-all-closed', () => {
  stopPluginDirectoryWatcher()

  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
