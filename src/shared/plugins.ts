export type PluginStateChangeReason =
  | 'load'
  | 'install'
  | 'remove'
  | 'enable'
  | 'disable'
  | 'filesystem'

export interface InstalledPluginState {
  id: string
  filename: string
  name: string
  description: string | null
  disabled: boolean
  installedVersion: string | null
  lastUpdatedAt: number | null
}

export interface PluginStateChangeEvent {
  reason: PluginStateChangeReason
  plugins: InstalledPluginState[]
  occurredAt: number
}

export interface PluginInstallRequest {
  downloadUrl?: string
  url?: string
  filename?: string
  name?: string
}
