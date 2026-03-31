import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Puzzle, RefreshCcw, Trash2, WifiOff } from 'lucide-react'

const DEFAULT_PLUGIN_STORE_MANIFEST_URL = 'https://raw.githubusercontent.com/balamurugan-cholas/link-plugins/main/manifest.json'

interface PluginManifestEntry {
  id: string
  name: string
  author: string
  version: string
  description: string
  downloadUrl: string
  filename: string
}

interface InstalledPluginRecord {
  id: string
  filename: string
  disabled: boolean
}

interface PluginCardData extends PluginManifestEntry {
  installed: boolean
  disabled: boolean
  source: 'manifest' | 'local'
}

const getPluginStoreManifestUrl = () => {
  const storedOverride = window.localStorage.getItem('plugin-store-manifest-url')
  return storedOverride && storedOverride.trim()
    ? storedOverride.trim()
    : DEFAULT_PLUGIN_STORE_MANIFEST_URL
}

const normalizeGitHubRawUrl = (value: string) => {
  try {
    const parsedUrl = new URL(value)
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
  } catch {
    return value
  }
}

const resolvePluginDownloadUrl = (value: string, manifestUrl: string) => {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return ''
  }

  try {
    return normalizeGitHubRawUrl(new URL(trimmedValue, manifestUrl).toString())
  } catch {
    return normalizeGitHubRawUrl(trimmedValue)
  }
}

const normalizePluginEntry = (value: unknown, manifestUrl: string): PluginManifestEntry | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawPlugin = value as Record<string, unknown>
  const id = typeof rawPlugin.id === 'string' ? rawPlugin.id.trim().toLowerCase() : ''
  const name = typeof rawPlugin.name === 'string' ? rawPlugin.name.trim() : ''
  const author = typeof rawPlugin.author === 'string' && rawPlugin.author.trim()
    ? rawPlugin.author.trim()
    : 'Unknown author'
  const version = typeof rawPlugin.version === 'string' && rawPlugin.version.trim()
    ? rawPlugin.version.trim()
    : '0.0.0'
  const description = typeof rawPlugin.description === 'string' && rawPlugin.description.trim()
    ? rawPlugin.description.trim()
    : 'No description provided.'
  const rawDownloadUrl =
    typeof rawPlugin.downloadUrl === 'string' && rawPlugin.downloadUrl.trim()
      ? rawPlugin.downloadUrl.trim()
      : typeof rawPlugin.url === 'string' && rawPlugin.url.trim()
        ? rawPlugin.url.trim()
        : ''
  const downloadUrl = rawDownloadUrl
    ? resolvePluginDownloadUrl(rawDownloadUrl, manifestUrl)
    : ''
  const filename =
    typeof rawPlugin.filename === 'string' && rawPlugin.filename.trim()
      ? rawPlugin.filename.trim()
      : id
        ? `${id}.js`
        : ''

  if (!id || !name || !downloadUrl || !filename) {
    return null
  }

  return {
    id,
    name,
    author,
    version,
    description,
    downloadUrl,
    filename,
  }
}

const normalizeInstalledPluginRecord = (value: unknown): InstalledPluginRecord | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawPlugin = value as Record<string, unknown>
  const id = typeof rawPlugin.id === 'string' ? rawPlugin.id.trim().toLowerCase() : ''
  const filename = typeof rawPlugin.filename === 'string' ? rawPlugin.filename.trim() : ''

  if (!id || !filename) {
    return null
  }

  return {
    id,
    filename,
    disabled: !!rawPlugin.disabled,
  }
}

const buildInstalledPluginLookup = (plugins: InstalledPluginRecord[]) =>
  new Map(plugins.map((plugin) => [plugin.id, plugin]))

export function PluginStore() {
  const [plugins, setPlugins] = useState<PluginManifestEntry[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([])
  const [storeState, setStoreState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [storeError, setStoreError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<'available' | 'installed'>('available')
  const [pendingPluginIds, setPendingPluginIds] = useState<Record<string, boolean>>({})
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({})

  const manifestUrl = getPluginStoreManifestUrl()

  const installedPluginLookup = useMemo(
    () => buildInstalledPluginLookup(installedPlugins),
    [installedPlugins]
  )

  const refreshInstalledPlugins = useCallback(async () => {
    const payload = await window.electron.ipcRenderer.invoke('plugins:listInstalled')
    const nextInstalledPlugins = Array.isArray(payload)
      ? payload
          .map((entry) => normalizeInstalledPluginRecord(entry))
          .filter((entry): entry is InstalledPluginRecord => entry !== null)
      : []

    setInstalledPlugins(nextInstalledPlugins)
  }, [])

  const availablePlugins = useMemo<PluginCardData[]>(
    () =>
      plugins.map((plugin) => {
        const installedPlugin = installedPluginLookup.get(plugin.id)
        return {
          ...plugin,
          installed: !!installedPlugin,
          disabled: !!installedPlugin?.disabled,
          source: 'manifest',
        }
      }),
    [installedPluginLookup, plugins]
  )

  const installedOnlyPlugins = useMemo<PluginCardData[]>(() => {
    const manifestPluginIds = new Set(plugins.map((plugin) => plugin.id))
    const pluginsFromManifest = availablePlugins.filter((plugin) => plugin.installed)
    const localOnlyPlugins = installedPlugins
      .filter((plugin) => !manifestPluginIds.has(plugin.id))
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.id,
        author: 'Local file',
        version: 'Installed',
        description: 'Installed locally. This plugin is not currently listed in the remote manifest.',
        downloadUrl: '',
        filename: plugin.filename,
        installed: true,
        disabled: plugin.disabled,
        source: 'local' as const,
      }))

    return [...pluginsFromManifest, ...localOnlyPlugins]
  }, [availablePlugins, installedPlugins, plugins])

  const visiblePlugins = activeFilter === 'installed' ? installedOnlyPlugins : availablePlugins

  const loadStore = useCallback(async () => {
    setStoreState('loading')
    setStoreError(null)

    try {
      await refreshInstalledPlugins()

      const response = await fetch(manifestUrl, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? 'The plugin manifest could not be found.'
            : `The plugin store returned ${response.status}.`
        )
      }

      const payload = await response.json()
      const manifestEntries = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { plugins?: unknown[] })?.plugins)
          ? (payload as { plugins: unknown[] }).plugins
          : []
      const nextPlugins = manifestEntries
        .map((entry) => normalizePluginEntry(entry, manifestUrl))
        .filter((entry): entry is PluginManifestEntry => entry !== null)

      setPlugins(nextPlugins)
      setStoreState('ready')
    } catch (error) {
      setStoreState('offline')
      setStoreError(error instanceof Error ? error.message : 'Unable to reach the plugin store.')
    }
  }, [manifestUrl, refreshInstalledPlugins])

  useEffect(() => {
    void loadStore()
  }, [loadStore])

  const clearPluginError = (pluginId: string) => {
    setPluginErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors[pluginId]
      return nextErrors
    })
  }

  const handleInstall = async (plugin: PluginManifestEntry) => {
    setPendingPluginIds((current) => ({ ...current, [plugin.id]: true }))
    clearPluginError(plugin.id)

    try {
      await window.electron.ipcRenderer.invoke('plugins:install', {
        url: plugin.downloadUrl,
        name: plugin.filename,
      })
      await refreshInstalledPlugins()
    } catch (error) {
      setPluginErrors((current) => ({
        ...current,
        [plugin.id]: error instanceof Error ? error.message : 'Unable to install this plugin.',
      }))
    } finally {
      setPendingPluginIds((current) => ({
        ...current,
        [plugin.id]: false,
      }))
    }
  }

  const handleTogglePlugin = async (pluginId: string, action: 'enable' | 'disable') => {
    setPendingPluginIds((current) => ({ ...current, [pluginId]: true }))
    clearPluginError(pluginId)

    try {
      await window.electron.ipcRenderer.invoke(
        action === 'enable' ? 'plugins:enable' : 'plugins:disable',
        pluginId
      )
      await refreshInstalledPlugins()
    } catch (error) {
      setPluginErrors((current) => ({
        ...current,
        [pluginId]: error instanceof Error ? error.message : `Unable to ${action} this plugin.`,
      }))
    } finally {
      setPendingPluginIds((current) => ({
        ...current,
        [pluginId]: false,
      }))
    }
  }

  const handleRemovePlugin = async (plugin: Pick<PluginCardData, 'id' | 'filename' | 'name'>) => {
    const shouldRemove = window.confirm(
      `Remove "${plugin.name}" from your installed plugins? This deletes the local plugin file.`
    )

    if (!shouldRemove) {
      return
    }

    setPendingPluginIds((current) => ({ ...current, [plugin.id]: true }))
    clearPluginError(plugin.id)

    try {
      await window.electron.ipcRenderer.invoke('plugins:remove', {
        filename: plugin.filename,
      })
      await refreshInstalledPlugins()
    } catch (error) {
      setPluginErrors((current) => ({
        ...current,
        [plugin.id]: error instanceof Error ? error.message : 'Unable to remove this plugin.',
      }))
    } finally {
      setPendingPluginIds((current) => ({
        ...current,
        [plugin.id]: false,
      }))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="flex h-full w-full flex-col gap-6 px-6 py-8 md:px-10">
        <div className="max-w-3xl space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Plugins</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Plugin Store</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Browse remote plugins, install them into your local workspace, and enable new capabilities without restarting the app.
          </p>
        </div>

        {storeState === 'offline' ? (
          <section className="rounded-xl border border-border/70 bg-card/70 p-6">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/70 bg-background/40 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground">
                <WifiOff className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-medium text-foreground">Store Offline</h2>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  {storeError || 'The plugin manifest could not be loaded right now. Check your connection or the GitHub manifest URL and try again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadStore()}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCcw className="h-4 w-4" />
                Retry
              </button>
              <p className="text-xs text-muted-foreground">
                Local plugins already installed: {installedPlugins.length}
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-xl border border-border/70 bg-card/70 p-6">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    id: 'available' as const,
                    title: 'Available',
                    count: storeState === 'loading' ? '...' : String(plugins.length),
                    description: 'Show every plugin listed in the remote manifest.',
                  },
                  {
                    id: 'installed' as const,
                    title: 'Installed',
                    count: String(installedPlugins.length),
                    description: 'Show only plugins already present in your local plugins folder.',
                  },
                ].map((card) => {
                  const isActive = activeFilter === card.id

                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setActiveFilter(card.id)}
                      className={`rounded-xl border p-5 text-left transition-colors ${
                        isActive
                          ? 'border-foreground/20 bg-muted text-foreground'
                          : 'border-border/60 bg-background/50 text-foreground hover:border-border hover:bg-background/70'
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{card.title}</p>
                      <p className="mt-3 text-3xl font-semibold">{card.count}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
                    </button>
                  )
                })}

                <div className="rounded-xl border border-border/60 bg-background/50 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Manifest</p>
                  <p className="mt-3 text-sm font-medium text-foreground">Remote JSON source</p>
                  <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
                    {manifestUrl}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-card/70 p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                    <Puzzle className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-medium text-foreground">
                      {activeFilter === 'installed' ? 'Installed Plugins' : 'Available Plugins'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeFilter === 'installed'
                        ? 'Manage the plugins already downloaded to your local app data folder.'
                        : 'Browse the full manifest and install plugins directly into your local app data directory.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void loadStore()}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {storeState === 'loading' ? (
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={`plugin-skeleton-${index}`}
                      className="rounded-xl border border-border/60 bg-background/50 p-5 animate-pulse"
                    >
                      <div className="h-5 w-32 rounded bg-muted" />
                      <div className="mt-3 h-4 w-24 rounded bg-muted" />
                      <div className="mt-6 space-y-2">
                        <div className="h-3 rounded bg-muted" />
                        <div className="h-3 rounded bg-muted" />
                        <div className="h-3 w-4/5 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visiblePlugins.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {visiblePlugins.map((plugin) => {
                    const isPending = !!pendingPluginIds[plugin.id]
                    const pluginStatusLabel = plugin.installed
                      ? plugin.disabled
                        ? 'Disabled'
                        : 'Enabled'
                      : 'Available'

                    return (
                      <article
                        key={`${plugin.source}-${plugin.id}`}
                        className="rounded-xl border border-border/60 bg-background/60 p-5 backdrop-blur-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-medium text-foreground">{plugin.name}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">by {plugin.author}</p>
                          </div>

                          <div className="rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                            {pluginStatusLabel}
                          </div>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-muted-foreground">
                          {plugin.description}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border/70 bg-card px-2.5 py-1">
                            v{plugin.version}
                          </span>
                          <span className="rounded-full border border-border/70 bg-card px-2.5 py-1">
                            {plugin.filename}
                          </span>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">
                            {plugin.source === 'local' ? 'Local plugin file' : 'Manifest plugin'}
                          </div>

                          {plugin.installed ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  void handleTogglePlugin(plugin.id, plugin.disabled ? 'enable' : 'disable')
                                }
                                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                                  isPending
                                    ? 'cursor-wait border-border bg-muted text-muted-foreground'
                                    : plugin.disabled
                                      ? 'border-border bg-background text-foreground hover:bg-muted'
                                      : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                }`}
                              >
                                {isPending ? 'Loading...' : plugin.disabled ? 'Enable' : 'Disable'}
                              </button>

                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => void handleRemovePlugin(plugin)}
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                                  isPending
                                    ? 'cursor-wait border-border bg-muted text-muted-foreground'
                                    : 'border-destructive/25 bg-destructive/5 text-destructive hover:bg-destructive/10'
                                }`}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>{isPending ? 'Loading...' : 'Delete'}</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => void handleInstall(plugin)}
                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                                isPending
                                  ? 'cursor-wait border-border bg-muted text-muted-foreground'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              }`}
                            >
                              <Download className="h-4 w-4" />
                              <span>{isPending ? 'Loading...' : 'Install'}</span>
                            </button>
                          )}
                        </div>

                        {pluginErrors[plugin.id] ? (
                          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                            {pluginErrors[plugin.id]}
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-6 py-12 text-center text-sm text-muted-foreground">
                  {activeFilter === 'installed'
                    ? 'No plugins are installed yet. Switch to Available and install one to see it here.'
                    : 'The store is reachable, but no plugins are listed in the manifest yet.'}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
