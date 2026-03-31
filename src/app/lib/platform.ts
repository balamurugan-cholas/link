export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'unknown'

type ModifierEvent = {
  ctrlKey: boolean
  metaKey: boolean
}

const detectNavigatorPlatform = (): DesktopPlatform => {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }

  const platform = navigator.platform.toLowerCase()
  if (platform.includes('mac')) return 'darwin'
  if (platform.includes('win')) return 'win32'
  if (platform.includes('linux')) return 'linux'
  return 'unknown'
}

export const getDesktopPlatform = (): DesktopPlatform => {
  if (typeof window !== 'undefined' && typeof window.electron?.platform === 'string') {
    const platform = window.electron.platform
    if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
      return platform
    }
  }

  return detectNavigatorPlatform()
}

export const isMacOS = () => getDesktopPlatform() === 'darwin'

export const hasPrimaryModifier = (event: ModifierEvent) =>
  isMacOS() ? event.metaKey : event.ctrlKey

export const getPrimaryModifierLabel = () => (isMacOS() ? 'Cmd' : 'Ctrl')

export const formatPrimaryShortcut = (key: string) => `${getPrimaryModifierLabel()} + ${key}`

export const getAppDataLabel = () => {
  const platform = getDesktopPlatform()
  if (platform === 'darwin') return 'Application Support'
  if (platform === 'win32') return 'AppData'
  return 'app data'
}

export const getGenericAppDataHint = () => `Stored in ${getAppDataLabel()}`
