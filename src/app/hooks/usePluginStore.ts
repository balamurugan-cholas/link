import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  InstalledPluginState,
  PluginStateChangeEvent,
} from '../../shared/plugins'
import {
  type PluginManifestEntry,
  buildInstalledPluginLookup,
  formatPluginNotificationNames,
  getPluginStoreManifestUrl,
  hasPluginUpdateAvailable,
  normalizeInstalledPluginRecord,
  normalizePluginEntry,
} from '../lib/pluginStore'

const PLUGIN_STORE_POLL_INTERVAL_MS = 60_000

type StoreState = 'loading' | 'ready' | 'offline'

const buildManifestLookup = (plugins: PluginManifestEntry[]) =>
  new Map(plugins.map((plugin) => [plugin.id, plugin]))

const getManifestEntries = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray((payload as { plugins?: unknown[] } | null)?.plugins)) {
    return (payload as { plugins: unknown[] }).plugins
  }

  return []
}

export function usePluginStore() {
  const [plugins, setPlugins] = useState<PluginManifestEntry[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginState[]>([])
  const [storeState, setStoreState] = useState<StoreState>('loading')
  const [storeError, setStoreError] = useState<string | null>(null)
  const [pendingPluginIds, setPendingPluginIds] = useState<Record<string, boolean>>({})
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({})

  const manifestUrl = getPluginStoreManifestUrl()
  const installedPluginsRef = useRef<InstalledPluginState[]>([])
  const manifestPluginsRef = useRef<PluginManifestEntry[]>([])
  const pendingPluginIdsRef = useRef<Record<string, boolean>>({})

  const installedPluginLookup = useMemo(
    () => buildInstalledPluginLookup(installedPlugins),
    [installedPlugins]
  )

  useEffect(() => {
    installedPluginsRef.current = installedPlugins
  }, [installedPlugins])

  useEffect(() => {
    manifestPluginsRef.current = plugins
  }, [plugins])

  useEffect(() => {
    pendingPluginIdsRef.current = pendingPluginIds
  }, [pendingPluginIds])

  const clearPluginError = useCallback((pluginId: string) => {
    setPluginErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors[pluginId]
      return nextErrors
    })
  }, [])

  const notifyManifestChanges = useCallback(
    (previousPlugins: PluginManifestEntry[], nextPlugins: PluginManifestEntry[]) => {
      if (previousPlugins.length === 0) {
        return
      }

      const previousLookup = buildManifestLookup(previousPlugins)
      const addedPlugins: string[] = []
      const updatedPlugins: string[] = []

      for (const plugin of nextPlugins) {
        const previousPlugin = previousLookup.get(plugin.id)

        if (!previousPlugin) {
          addedPlugins.push(plugin.name)
          continue
        }

        if (previousPlugin.version !== plugin.version) {
          updatedPlugins.push(plugin.name)
        }
      }

      if (addedPlugins.length > 0) {
        toast('New plugins added', {
          description: formatPluginNotificationNames(addedPlugins),
        })
      }

      if (updatedPlugins.length > 0) {
        toast('Plugin updates available', {
          description: formatPluginNotificationNames(updatedPlugins),
        })
      }
    },
    []
  )

  const notifyFilesystemChanges = useCallback(
    (previousPlugins: InstalledPluginState[], nextPlugins: InstalledPluginState[]) => {
      if (previousPlugins.length === 0 || Object.values(pendingPluginIdsRef.current).some(Boolean)) {
        return
      }

      const previousLookup = buildInstalledPluginLookup(previousPlugins)
      const addedPlugins: string[] = []
      const updatedPlugins: string[] = []

      for (const plugin of nextPlugins) {
        const previousPlugin = previousLookup.get(plugin.id)

        if (!previousPlugin) {
          addedPlugins.push(plugin.name)
          continue
        }

        if (
          previousPlugin.installedVersion !== plugin.installedVersion ||
          previousPlugin.lastUpdatedAt !== plugin.lastUpdatedAt
        ) {
          updatedPlugins.push(plugin.name)
        }
      }

      if (addedPlugins.length > 0) {
        toast('Plugin added live', {
          description: formatPluginNotificationNames(addedPlugins),
        })
      }

      if (updatedPlugins.length > 0) {
        toast('Plugin refreshed live', {
          description: formatPluginNotificationNames(updatedPlugins),
        })
      }
    },
    []
  )

  const refreshInstalledPlugins = useCallback(async () => {
    const payload = await window.plugins.getState()
    const nextInstalledPlugins = Array.isArray(payload)
      ? payload
          .map((entry) => normalizeInstalledPluginRecord(entry))
          .filter((entry): entry is InstalledPluginState => entry !== null)
      : []

    setInstalledPlugins(nextInstalledPlugins)
    return nextInstalledPlugins
  }, [])

  const refreshManifest = useCallback(
    async (options?: { notifyChanges?: boolean }) => {
      const shouldNotify = !!options?.notifyChanges
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
      const nextPlugins = getManifestEntries(payload)
        .map((entry) => normalizePluginEntry(entry, manifestUrl))
        .filter((entry): entry is PluginManifestEntry => entry !== null)

      if (shouldNotify) {
        notifyManifestChanges(manifestPluginsRef.current, nextPlugins)
      }

      setPlugins(nextPlugins)
      setStoreState('ready')
      setStoreError(null)

      return nextPlugins
    },
    [manifestUrl, notifyManifestChanges]
  )

  const refreshStore = useCallback(
    async (options?: { background?: boolean; notifyChanges?: boolean }) => {
      const isBackgroundRefresh = !!options?.background

      if (!isBackgroundRefresh) {
        setStoreState('loading')
        setStoreError(null)
      }

      try {
        await refreshInstalledPlugins()
      } catch (error) {
        console.error('Failed to refresh installed plugins:', error)
      }

      try {
        await refreshManifest({
          notifyChanges: options?.notifyChanges,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unable to reach the plugin store.'

        setStoreError(errorMessage)

        if (manifestPluginsRef.current.length === 0) {
          setStoreState('offline')
        }
      }
    },
    [refreshInstalledPlugins, refreshManifest]
  )

  useEffect(() => {
    void refreshStore()
  }, [refreshStore])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshStore({
        background: true,
        notifyChanges: true,
      })
    }, PLUGIN_STORE_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refreshStore])

  useEffect(() => {
    const unsubscribe = window.plugins.onStateChanged((event: PluginStateChangeEvent) => {
      const nextInstalledPlugins = Array.isArray(event.plugins)
        ? event.plugins
            .map((entry) => normalizeInstalledPluginRecord(entry))
            .filter((entry): entry is InstalledPluginState => entry !== null)
        : []

      if (event.reason === 'filesystem') {
        notifyFilesystemChanges(installedPluginsRef.current, nextInstalledPlugins)
      }

      setInstalledPlugins(nextInstalledPlugins)
    })

    return unsubscribe
  }, [notifyFilesystemChanges])

  const installPlugin = useCallback(
    async (plugin: PluginManifestEntry) => {
      setPendingPluginIds((current) => ({ ...current, [plugin.id]: true }))
      clearPluginError(plugin.id)

      try {
        await window.plugins.install({
          downloadUrl: plugin.downloadUrl,
          filename: plugin.filename,
        })
        await refreshInstalledPlugins()
      } catch (error) {
        setPluginErrors((current) => ({
          ...current,
          [plugin.id]:
            error instanceof Error ? error.message : 'Unable to install this plugin.',
        }))
      } finally {
        setPendingPluginIds((current) => ({
          ...current,
          [plugin.id]: false,
        }))
      }
    },
    [clearPluginError, refreshInstalledPlugins]
  )

  const togglePlugin = useCallback(
    async (pluginId: string, action: 'enable' | 'disable') => {
      setPendingPluginIds((current) => ({ ...current, [pluginId]: true }))
      clearPluginError(pluginId)

      try {
        await window.plugins[action](pluginId)
        await refreshInstalledPlugins()
      } catch (error) {
        setPluginErrors((current) => ({
          ...current,
          [pluginId]:
            error instanceof Error ? error.message : `Unable to ${action} this plugin.`,
        }))
      } finally {
        setPendingPluginIds((current) => ({
          ...current,
          [pluginId]: false,
        }))
      }
    },
    [clearPluginError, refreshInstalledPlugins]
  )

  const removePlugin = useCallback(
    async (plugin: Pick<InstalledPluginState, 'id' | 'filename' | 'name'>) => {
      const shouldRemove = window.confirm(
        `Remove "${plugin.name}" from your installed plugins? This deletes the local plugin file.`
      )

      if (!shouldRemove) {
        return
      }

      setPendingPluginIds((current) => ({ ...current, [plugin.id]: true }))
      clearPluginError(plugin.id)

      try {
        await window.plugins.remove({
          filename: plugin.filename,
        })
        await refreshInstalledPlugins()
      } catch (error) {
        setPluginErrors((current) => ({
          ...current,
          [plugin.id]:
            error instanceof Error ? error.message : 'Unable to remove this plugin.',
        }))
      } finally {
        setPendingPluginIds((current) => ({
          ...current,
          [plugin.id]: false,
        }))
      }
    },
    [clearPluginError, refreshInstalledPlugins]
  )

  const updatesAvailableCount = useMemo(
    () =>
      plugins.reduce((count, plugin) => {
        const installedPlugin = installedPluginLookup.get(plugin.id)

        if (!installedPlugin) {
          return count
        }

        return hasPluginUpdateAvailable(installedPlugin.installedVersion, plugin.version)
          ? count + 1
          : count
      }, 0),
    [installedPluginLookup, plugins]
  )

  return {
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
  }
}
