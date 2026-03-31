import React, { useMemo, useState } from 'react'
import { Download, Puzzle, RefreshCcw, Trash2, WifiOff } from 'lucide-react'
import type { InstalledPluginState } from '../../shared/plugins'
import {
  type PluginCardData,
  type PluginManifestEntry,
  buildInstalledPluginLookup,
  hasPluginUpdateAvailable,
} from '../lib/pluginStore'

type PluginStoreFilter = 'available' | 'installed' | 'updates'

interface PluginStoreProps {
  installPlugin: (plugin: PluginManifestEntry) => Promise<void>
  installedPlugins: InstalledPluginState[]
  manifestUrl: string
  pendingPluginIds: Record<string, boolean>
  pluginErrors: Record<string, string>
  plugins: PluginManifestEntry[]
  refreshStore: (options?: { background?: boolean; notifyChanges?: boolean }) => Promise<void>
  removePlugin: (plugin: Pick<InstalledPluginState, 'id' | 'filename' | 'name'>) => Promise<void>
  storeError: string | null
  storeState: 'loading' | 'ready' | 'offline'
  togglePlugin: (pluginId: string, action: 'enable' | 'disable') => Promise<void>
  updatesAvailableCount: number
}

const sortPluginCards = (left: PluginCardData, right: PluginCardData) =>
  Number(right.hasUpdateAvailable) - Number(left.hasUpdateAvailable) ||
  Number(right.installed) - Number(left.installed) ||
  left.name.localeCompare(right.name)

const getVersionChips = (plugin: PluginCardData) => {
  if (plugin.hasUpdateAvailable && plugin.installedVersion) {
    return [`Installed v${plugin.installedVersion}`, `Latest v${plugin.version}`]
  }

  if (plugin.source === 'local') {
    return [plugin.installedVersion ? `v${plugin.installedVersion}` : 'Local']
  }

  if (plugin.installed && plugin.installedVersion) {
    return [`v${plugin.installedVersion}`]
  }

  return [`v${plugin.version}`]
}

export function PluginStore({
  installPlugin,
  installedPlugins,
  manifestUrl,
  pendingPluginIds,
  pluginErrors,
  plugins,
  refreshStore,
  removePlugin,
  storeError,
  storeState,
  togglePlugin,
  updatesAvailableCount,
}: PluginStoreProps) {
  const [activeFilter, setActiveFilter] = useState<PluginStoreFilter>('available')

  const installedPluginLookup = useMemo(
    () => buildInstalledPluginLookup(installedPlugins),
    [installedPlugins]
  )

  const availablePlugins = useMemo<PluginCardData[]>(
    () =>
      plugins
        .map((plugin) => {
          const installedPlugin = installedPluginLookup.get(plugin.id)

          return {
            ...plugin,
            installed: !!installedPlugin,
            disabled: !!installedPlugin?.disabled,
            source: 'manifest' as const,
            installedVersion: installedPlugin?.installedVersion || null,
            lastUpdatedAt: installedPlugin?.lastUpdatedAt || null,
            hasUpdateAvailable: hasPluginUpdateAvailable(
              installedPlugin?.installedVersion || null,
              plugin.version
            ),
          }
        })
        .sort(sortPluginCards),
    [installedPluginLookup, plugins]
  )

  const installedOnlyPlugins = useMemo<PluginCardData[]>(() => {
    const manifestPluginIds = new Set(plugins.map((plugin) => plugin.id))
    const pluginsFromManifest = availablePlugins.filter((plugin) => plugin.installed)
    const localOnlyPlugins = installedPlugins
      .filter((plugin) => !manifestPluginIds.has(plugin.id))
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        author: 'Local file',
        version: plugin.installedVersion || 'Installed',
        description:
          plugin.description ||
          'Installed locally. This plugin is not currently listed in the remote manifest.',
        downloadUrl: '',
        filename: plugin.filename,
        installed: true,
        disabled: plugin.disabled,
        source: 'local' as const,
        installedVersion: plugin.installedVersion,
        lastUpdatedAt: plugin.lastUpdatedAt,
        hasUpdateAvailable: false,
      }))

    return [...pluginsFromManifest, ...localOnlyPlugins].sort(sortPluginCards)
  }, [availablePlugins, installedPlugins, plugins])

  const updatedPlugins = useMemo(
    () => installedOnlyPlugins.filter((plugin) => plugin.hasUpdateAvailable),
    [installedOnlyPlugins]
  )

  const visiblePlugins =
    activeFilter === 'installed'
      ? installedOnlyPlugins
      : activeFilter === 'updates'
        ? updatedPlugins
        : availablePlugins

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="flex h-full w-full flex-col gap-6 px-6 py-8 md:px-10">
        <div className="max-w-3xl space-y-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Plugins</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Plugin Store</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Browse remote plugins, install them into your local workspace, and get live update signals without refreshing the app.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live sync is on
          </div>
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
                  {storeError ||
                    'The plugin manifest could not be loaded right now. Check your connection or the GitHub manifest URL and try again.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshStore()}
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    id: 'available' as const,
                    title: 'Available',
                    count: storeState === 'loading' ? '...' : String(plugins.length),
                    description: 'Every plugin currently listed in the remote manifest.',
                  },
                  {
                    id: 'installed' as const,
                    title: 'Installed',
                    count: String(installedPlugins.length),
                    description: 'Plugins already present in your local app data folder.',
                  },
                  {
                    id: 'updates' as const,
                    title: 'Updates',
                    count: String(updatesAvailableCount),
                    description: 'Installed plugins with a newer version available now.',
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
                      <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        {card.title}
                      </p>
                      <p className="mt-3 text-3xl font-semibold">{card.count}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {card.description}
                      </p>
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
                      {activeFilter === 'installed'
                        ? 'Installed Plugins'
                        : activeFilter === 'updates'
                          ? 'Available Updates'
                          : 'Available Plugins'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeFilter === 'installed'
                        ? 'Manage the plugins already downloaded to your local app data folder.'
                        : activeFilter === 'updates'
                          ? 'Update installed plugins the moment the manifest publishes a newer version.'
                          : 'Browse the full manifest and install plugins directly into your local app data directory.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void refreshStore()}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {storeError && storeState === 'ready' ? (
                <div className="mb-5 rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                  {storeError}
                </div>
              ) : null}

              {storeState === 'loading' ? (
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={`plugin-skeleton-${index}`}
                      className="animate-pulse rounded-xl border border-border/60 bg-background/50 p-5"
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
                    const pluginStatusLabel = plugin.hasUpdateAvailable
                      ? 'Update'
                      : plugin.installed
                        ? plugin.disabled
                          ? 'Disabled'
                          : 'Enabled'
                        : 'Available'
                    const versionChips = getVersionChips(plugin)

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

                          <div
                            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${
                              plugin.hasUpdateAvailable
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-border/70 bg-card text-muted-foreground'
                            }`}
                          >
                            {pluginStatusLabel}
                          </div>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-muted-foreground">
                          {plugin.description}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {versionChips.map((chip) => (
                            <span
                              key={`${plugin.id}-${chip}`}
                              className="rounded-full border border-border/70 bg-card px-2.5 py-1"
                            >
                              {chip}
                            </span>
                          ))}
                          <span className="rounded-full border border-border/70 bg-card px-2.5 py-1">
                            {plugin.filename}
                          </span>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">
                            {plugin.hasUpdateAvailable
                              ? 'A newer version is available in the store.'
                              : plugin.source === 'local'
                                ? 'Local plugin file'
                                : 'Manifest plugin'}
                          </div>

                          {plugin.installed ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {plugin.hasUpdateAvailable && plugin.source === 'manifest' ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => void installPlugin(plugin)}
                                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                                    isPending
                                      ? 'cursor-wait border-border bg-muted text-muted-foreground'
                                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  }`}
                                >
                                  <Download className="h-4 w-4" />
                                  <span>{isPending ? 'Loading...' : 'Update'}</span>
                                </button>
                              ) : null}

                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  void togglePlugin(plugin.id, plugin.disabled ? 'enable' : 'disable')
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
                                onClick={() => void removePlugin(plugin)}
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
                              onClick={() => void installPlugin(plugin)}
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
                    : activeFilter === 'updates'
                      ? 'Everything is up to date right now.'
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
