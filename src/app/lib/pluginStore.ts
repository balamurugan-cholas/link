import type { InstalledPluginState } from '../../shared/plugins'

export const DEFAULT_PLUGIN_STORE_MANIFEST_URL =
  'https://raw.githubusercontent.com/balamurugan-cholas/link-plugins/main/manifest.json'

export interface PluginManifestEntry {
  id: string
  name: string
  author: string
  version: string
  description: string
  downloadUrl: string
  filename: string
}

export interface PluginCardData extends PluginManifestEntry {
  installed: boolean
  disabled: boolean
  source: 'manifest' | 'local'
  installedVersion: string | null
  lastUpdatedAt: number | null
  hasUpdateAvailable: boolean
}

export const getPluginStoreManifestUrl = () => {
  const storedOverride = window.localStorage.getItem('plugin-store-manifest-url')
  return storedOverride && storedOverride.trim()
    ? storedOverride.trim()
    : DEFAULT_PLUGIN_STORE_MANIFEST_URL
}

export const normalizeGitHubRawUrl = (value: string) => {
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

export const resolvePluginDownloadUrl = (value: string, manifestUrl: string) => {
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

export const normalizePluginEntry = (
  value: unknown,
  manifestUrl: string
): PluginManifestEntry | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawPlugin = value as Record<string, unknown>
  const id = typeof rawPlugin.id === 'string' ? rawPlugin.id.trim().toLowerCase() : ''
  const name = typeof rawPlugin.name === 'string' ? rawPlugin.name.trim() : ''
  const author =
    typeof rawPlugin.author === 'string' && rawPlugin.author.trim()
      ? rawPlugin.author.trim()
      : 'Unknown author'
  const version =
    typeof rawPlugin.version === 'string' && rawPlugin.version.trim()
      ? rawPlugin.version.trim()
      : '0.0.0'
  const description =
    typeof rawPlugin.description === 'string' && rawPlugin.description.trim()
      ? rawPlugin.description.trim()
      : 'No description provided.'
  const rawDownloadUrl =
    typeof rawPlugin.downloadUrl === 'string' && rawPlugin.downloadUrl.trim()
      ? rawPlugin.downloadUrl.trim()
      : typeof rawPlugin.url === 'string' && rawPlugin.url.trim()
        ? rawPlugin.url.trim()
        : ''
  const downloadUrl = rawDownloadUrl ? resolvePluginDownloadUrl(rawDownloadUrl, manifestUrl) : ''
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

export const normalizeInstalledPluginRecord = (value: unknown): InstalledPluginState | null => {
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
    name:
      typeof rawPlugin.name === 'string' && rawPlugin.name.trim()
        ? rawPlugin.name.trim()
        : id,
    description:
      typeof rawPlugin.description === 'string' && rawPlugin.description.trim()
        ? rawPlugin.description.trim()
        : null,
    disabled: !!rawPlugin.disabled,
    installedVersion:
      typeof rawPlugin.installedVersion === 'string' && rawPlugin.installedVersion.trim()
        ? rawPlugin.installedVersion.trim()
        : null,
    lastUpdatedAt:
      typeof rawPlugin.lastUpdatedAt === 'number' && Number.isFinite(rawPlugin.lastUpdatedAt)
        ? rawPlugin.lastUpdatedAt
        : null,
  }
}

const tokenizeVersion = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^v/, '')
    .split(/([0-9]+)/)
    .map((token) => token.trim())
    .filter(Boolean)

export const comparePluginVersions = (left: string, right: string) => {
  const leftTokens = tokenizeVersion(left)
  const rightTokens = tokenizeVersion(right)
  const longestLength = Math.max(leftTokens.length, rightTokens.length)

  for (let index = 0; index < longestLength; index += 1) {
    const leftToken = leftTokens[index]
    const rightToken = rightTokens[index]

    if (leftToken === rightToken) {
      continue
    }

    if (leftToken == null) {
      return -1
    }

    if (rightToken == null) {
      return 1
    }

    const leftNumber = Number(leftToken)
    const rightNumber = Number(rightToken)
    const leftIsNumber = Number.isFinite(leftNumber) && /^\d+$/.test(leftToken)
    const rightIsNumber = Number.isFinite(rightNumber) && /^\d+$/.test(rightToken)

    if (leftIsNumber && rightIsNumber) {
      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber
      }

      continue
    }

    return leftToken.localeCompare(rightToken)
  }

  return 0
}

export const hasPluginUpdateAvailable = (
  installedVersion: string | null,
  latestVersion: string
) => {
  if (!installedVersion) {
    return false
  }

  return comparePluginVersions(latestVersion, installedVersion) > 0
}

export const buildInstalledPluginLookup = (plugins: InstalledPluginState[]) =>
  new Map(plugins.map((plugin) => [plugin.id, plugin]))

export const formatPluginNotificationNames = (names: string[]) => {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)))

  if (uniqueNames.length <= 2) {
    return uniqueNames.join(', ')
  }

  return `${uniqueNames.slice(0, 2).join(', ')} +${uniqueNames.length - 2} more`
}
