import React, { useEffect, useMemo, useState } from 'react'
import { Bot, Download, Keyboard, Mic, MoonStar, Sparkles, SunMedium, Waves } from 'lucide-react'
import type {
  AiAnswerLength,
  AiGenerationPreferences,
  AiStatus,
  AudioCaptureSource,
  AudioTranscriptionMode,
  AudioTranscriptionPreferences,
} from '../../shared/ai'
import { settingsShortcutSections } from '../lib/keyboardShortcuts'
import { formatPrimaryShortcut, getAppDataLabel, getDesktopPlatform } from '../lib/platform'

type ThemeMode = 'light' | 'dark'

interface SettingsViewProps {
  themeMode: ThemeMode
  onThemeChange: (themeMode: ThemeMode) => void
  aiStatus: AiStatus
  onDownloadModel: () => void
  onDownloadVisionModel: () => void
  onDownloadSpeechModel: () => void
  onTranscriptionPreferencesChange: (preferences: AudioTranscriptionPreferences) => void
  onGenerationPreferencesChange: (preferences: AiGenerationPreferences) => void
}

interface DownloadableModelStatus {
  modelName: string
  modelPath: string
  status: AiStatus['status']
  progress: AiStatus['progress']
  error: string | null
  downloadedBytes: number
  totalBytes: number | null
}

const formatBytes = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return '0 B'

  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`
}

const getModelSummary = (
  modelStatus: DownloadableModelStatus,
  copy: {
    ready: string
    downloaded: string
    missing: string
    downloading: string
    starting?: string
  }
) => {
  const hasPartialDownload =
    modelStatus.downloadedBytes > 0 &&
    modelStatus.status !== 'ready' &&
    modelStatus.status !== 'downloaded'

  switch (modelStatus.status) {
    case 'downloading':
      return copy.downloading
    case 'starting':
      return copy.starting || copy.ready
    case 'ready':
      return copy.ready
    case 'downloaded':
      return copy.downloaded
    case 'error':
      return modelStatus.error || 'The local model could not be prepared.'
    default:
      return hasPartialDownload
        ? 'A partial download was found. Resume to continue from where it stopped.'
        : copy.missing
  }
}

const getProgressPercent = (modelStatus: DownloadableModelStatus) =>
  modelStatus.progress?.percent ??
  (modelStatus.status === 'ready' || modelStatus.status === 'downloaded'
    ? 100
    : modelStatus.downloadedBytes > 0 && modelStatus.totalBytes
      ? (modelStatus.downloadedBytes / modelStatus.totalBytes) * 100
      : 0)

const getDownloadButtonLabel = (modelStatus: DownloadableModelStatus) => {
  const hasPartialDownload =
    modelStatus.downloadedBytes > 0 &&
    modelStatus.status !== 'ready' &&
    modelStatus.status !== 'downloaded'

  if (modelStatus.status === 'downloading') return 'Downloading...'
  if (modelStatus.status === 'starting') return 'Starting...'
  if (modelStatus.status === 'ready') return 'Ready'
  if (modelStatus.status === 'downloaded') return 'Downloaded'

  return hasPartialDownload ? 'Resume Download' : 'Download Model'
}

export function SettingsView({
  themeMode,
  onThemeChange,
  aiStatus,
  onDownloadModel,
  onDownloadVisionModel,
  onDownloadSpeechModel,
  onTranscriptionPreferencesChange,
  onGenerationPreferencesChange,
}: SettingsViewProps) {
  const [microphoneSources, setMicrophoneSources] = useState<AudioCaptureSource[]>([])
  const [systemSources, setSystemSources] = useState<AudioCaptureSource[]>([])
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const isWindows = getDesktopPlatform() === 'win32'
  const ghostShortcut = formatPrimaryShortcut('Space')
  const inlineShortcut = formatPrimaryShortcut('L')
  const voiceShortcut = formatPrimaryShortcut('J')
  const appDataLabel = getAppDataLabel()

  useEffect(() => {
    let cancelled = false

    const loadAudioSources = async () => {
      setDeviceError(null)

      let permissionStream: MediaStream | null = null
      let microphones: AudioCaptureSource[] = []
      let nextSystemSources: AudioCaptureSource[] = []
      let nextDeviceError: string | null = null

      try {
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          permissionStream = null
        }

        const devices = await navigator.mediaDevices.enumerateDevices()
        microphones = devices
          .filter(
            (device) =>
              device.kind === 'audioinput' &&
              device.deviceId !== 'default' &&
              device.deviceId !== 'communications'
          )
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
            kind: 'microphone' as const,
          }))
      } catch (error) {
        nextDeviceError = error instanceof Error ? error.message : 'Unable to load microphone devices.'
      } finally {
        permissionStream?.getTracks().forEach((track) => track.stop())
      }

      try {
        nextSystemSources = await window.ai.getSystemAudioSources()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load system audio sources.'
        nextDeviceError = nextDeviceError ? `${nextDeviceError} ${message}` : message
      }

      if (!cancelled) {
        setMicrophoneSources(microphones)
        setSystemSources(nextSystemSources)
        setDeviceError(nextDeviceError)
      }
    }

    void loadAudioSources()

    const handleDeviceChange = () => {
      void loadAudioSources()
    }

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
    }
  }, [])

  const textModelStatus: DownloadableModelStatus = useMemo(
    () => ({
      modelName: aiStatus.modelName,
      modelPath: aiStatus.modelPath,
      status: aiStatus.status,
      progress: aiStatus.progress,
      error: aiStatus.error,
      downloadedBytes: aiStatus.downloadedBytes,
      totalBytes: aiStatus.totalBytes,
    }),
    [aiStatus]
  )

  const speechModelStatus: DownloadableModelStatus = aiStatus.speechModel
  const visualModelStatus: DownloadableModelStatus = aiStatus.visualModel
  const answerLengthOptions: Array<{
    id: AiAnswerLength
    title: string
    description: string
  }> = [
    {
      id: 'concise',
      title: 'Concise',
      description: 'Short, direct answers when you want quick help inside the current block.',
    },
    {
      id: 'balanced',
      title: 'Balanced',
      description: 'A middle ground with enough detail to be useful without getting too long.',
    },
    {
      id: 'detailed',
      title: 'Detailed',
      description: 'Longer, smarter, more complete answers that follow the user prompt more deeply.',
    },
  ]
  const transcriptionModeOptions: Array<{
    id: AudioTranscriptionMode
    title: string
    description: string
  }> = [
    {
      id: 'manual',
      title: 'Manual at end',
      description: 'Keep the current flow: record first, then write the transcript after you stop.',
    },
    {
      id: 'live',
      title: 'Live in block',
      description: 'Write speech into the focused block while the recording is still running.',
    },
  ]
  const activeSources =
    aiStatus.transcriptionPreferences.captureMode === 'system' ? systemSources : microphoneSources
  const selectedSourceId = aiStatus.transcriptionPreferences.deviceId
  const selectedSourceLabel =
    activeSources.find((source) => source.id === selectedSourceId)?.label ||
    aiStatus.transcriptionPreferences.deviceLabel

  useEffect(() => {
    if (activeSources.length === 0) {
      return
    }

    if (!selectedSourceId || !activeSources.some((source) => source.id === selectedSourceId)) {
      const fallbackSource = activeSources[0]
      onTranscriptionPreferencesChange({
        captureMode: aiStatus.transcriptionPreferences.captureMode,
        deviceId: fallbackSource.id,
        deviceLabel: fallbackSource.label,
        transcriptionMode: aiStatus.transcriptionPreferences.transcriptionMode,
      })
    }
  }, [
    activeSources,
    aiStatus.transcriptionPreferences.captureMode,
    onTranscriptionPreferencesChange,
    selectedSourceId,
  ])

  const renderModelCard = (
    modelStatus: DownloadableModelStatus,
    options: {
      title: string
      summary: string
      readyHint: string
      buttonLabel: string
      onDownload: () => void
      storageHint?: string
    }
  ) => {
    const progressPercent = getProgressPercent(modelStatus)
    const progressWidth = progressPercent > 0 ? Math.max(4, Math.min(progressPercent, 100)) : 0
    const hasPartialDownload =
      modelStatus.downloadedBytes > 0 &&
      modelStatus.status !== 'ready' &&
      modelStatus.status !== 'downloaded'
    const statusLabel = hasPartialDownload && modelStatus.status === 'missing' ? 'partial' : modelStatus.status
    const isBusy = modelStatus.status === 'downloading' || modelStatus.status === 'starting'

    return (
      <div className="rounded-xl border border-border/60 bg-background/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{options.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{options.summary}</p>
          </div>

          <button
            onClick={options.onDownload}
            disabled={isBusy || modelStatus.status === 'ready' || modelStatus.status === 'downloaded'}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
              isBusy || modelStatus.status === 'ready' || modelStatus.status === 'downloaded'
                ? 'cursor-default border-border bg-muted text-muted-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <Download className="h-4 w-4" />
            <span>{options.buttonLabel}</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">{modelStatus.modelName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{options.readyHint}</p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80 transition-[width] duration-300"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {formatBytes(modelStatus.downloadedBytes)}
              {modelStatus.totalBytes ? ` / ${formatBytes(modelStatus.totalBytes)}` : ''}
            </span>
            <span>
              {modelStatus.progress?.speedBytesPerSecond
                ? `${formatBytes(modelStatus.progress.speedBytesPerSecond)}/s`
                : modelStatus.status === 'ready'
                  ? options.readyHint
                  : options.storageHint || `Stored in ${appDataLabel}`}
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Storage</p>
          <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
            {modelStatus.modelPath || `${appDataLabel}/models`}
          </p>
        </div>

        {modelStatus.error && (
          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {modelStatus.error}
          </div>
        )}
      </div>
    )
  }

  const keyboardShortcutsSection = (
    <section className="rounded-xl border border-border/70 bg-card/70 p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
          <Keyboard className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-base font-medium text-foreground">Keyboard shortcuts</h2>
          <p className="text-sm text-muted-foreground">
            The main shortcuts available across the workspace, editor, AI tools, and voice capture.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {settingsShortcutSections.map((section) => (
          <div key={section.title} className="rounded-xl border border-border/60 bg-background/60 p-5">
            <p className="text-sm font-medium text-foreground">{section.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>

            <div className="mt-4 grid gap-3">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={`${section.title}-${shortcut.combo}-${shortcut.label}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{shortcut.label}</p>
                    {shortcut.context && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{shortcut.context}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {shortcut.combo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="flex h-full w-full flex-col gap-6 px-6 py-8 md:px-10">
        <div className="max-w-3xl space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Settings</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Workspace preferences</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Keep the UI calm, manage local models, and choose exactly which audio source feeds {voiceShortcut} dictation.
          </p>
        </div>

        <section className="rounded-xl border border-border/70 bg-card/70 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <SunMedium className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground">Theme</h2>
              <p className="text-sm text-muted-foreground">Choose the atmosphere that feels right for long note sessions.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                id: 'light' as const,
                title: 'Light',
                description: 'Keeps the current soft white canvas without pushing into bright white.',
                icon: SunMedium,
              },
              {
                id: 'dark' as const,
                title: 'Dark',
                description: 'Uses a muted black palette that stays gentle instead of going pure black.',
                icon: MoonStar,
              },
            ].map((option) => {
              const Icon = option.icon
              const isActive = themeMode === option.id

              return (
                <button
                  key={option.id}
                  onClick={() => onThemeChange(option.id)}
                  className={`group rounded-xl border p-5 text-left transition-colors ${
                    isActive
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                  }`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card shadow-sm">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.24em]">
                      {isActive ? 'Active' : 'Select'}
                    </span>
                  </div>

                  <h3 className="text-base font-medium">{option.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground group-hover:text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border/70 bg-card/70 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground">Local AI</h2>
              <p className="text-sm text-muted-foreground">
                Phi-3 handles ghost text and inline writing. MiniCPM-V 4.5 reads image blocks for {inlineShortcut}. Whisper small.en powers {voiceShortcut} speech transcription.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {renderModelCard(textModelStatus, {
              title: 'Text model',
              summary: getModelSummary(textModelStatus, {
                ready: 'Ghost text and inline AI are ready.',
                downloaded: 'Model downloaded. It starts automatically on first use.',
                missing: `Download the local text model to enable ${ghostShortcut} and ${inlineShortcut}.`,
                downloading: 'Downloading the local text model.',
                starting: 'Starting the local text model.',
              }),
              readyHint: `${ghostShortcut} and ${inlineShortcut} inside the editor`,
              buttonLabel: getDownloadButtonLabel(textModelStatus),
              onDownload: onDownloadModel,
            })}

            {renderModelCard(visualModelStatus, {
              title: 'Vision model',
              summary: getModelSummary(visualModelStatus, {
                ready: 'Image-aware inline AI is ready for real image blocks.',
                downloaded: 'MiniCPM-V 4.5 is downloaded. The local visual runtime starts automatically on first image request.',
                missing: `Download MiniCPM-V 4.5 so ${inlineShortcut} can analyze image blocks and answer below them.`,
                downloading: 'Downloading MiniCPM-V 4.5 and its visual projector.',
                starting: 'Starting the local MiniCPM-V runtime.',
              }),
              readyHint: `${inlineShortcut} on image blocks`,
              buttonLabel: getDownloadButtonLabel(visualModelStatus),
              onDownload: onDownloadVisionModel,
            })}

            {renderModelCard(speechModelStatus, {
              title: 'Speech model',
              summary: getModelSummary(speechModelStatus, {
                ready: `Speech transcription is ready for ${voiceShortcut}.`,
                downloaded: 'Speech assets were downloaded and are ready to transcribe.',
                missing: isWindows
                  ? 'Download Whisper small.en to transcribe microphone or system audio locally.'
                  : 'Install whisper.cpp with Homebrew or place whisper-cli on PATH, then download Whisper small.en for local transcription.',
                downloading: isWindows
                  ? 'Preparing the Whisper runtime and small.en model.'
                  : 'Preparing local speech assets.',
              }),
              readyHint: `${voiceShortcut} on the focused block`,
              buttonLabel: getDownloadButtonLabel(speechModelStatus),
              onDownload: onDownloadSpeechModel,
              storageHint:
                aiStatus.speechModel.runtimePath ||
                (isWindows ? `Stored in ${appDataLabel}` : `Stored in ${appDataLabel} or detected on PATH`),
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/50 p-5">
              <p className="text-sm font-medium text-foreground">Writing shortcuts</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">{ghostShortcut}</span> for ghost text,
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground"> {inlineShortcut}</span> for inline AI,
                <span className="rounded bg-muted px-1.5 py-0.5 text-foreground"> Tab</span> to accept the full suggestion,
                and <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">{voiceShortcut}</span> for speech capture.
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/50 p-5">
              <p className="text-sm font-medium text-foreground">Speech runtime</p>
              <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">
                {aiStatus.speechModel.runtimePath ||
                  (isWindows ? `${appDataLabel}/whispercpp` : `${appDataLabel}/whispercpp or PATH`)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-background/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Inline AI answer length</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Choose how much detail the inline AI should produce before it writes into the current block.
                </p>
              </div>

              <div className="rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {aiStatus.generationPreferences.answerLength}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {answerLengthOptions.map((option) => {
                const isActive = aiStatus.generationPreferences.answerLength === option.id

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onGenerationPreferencesChange({ answerLength: option.id })}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      isActive
                        ? 'border-foreground/20 bg-muted text-foreground'
                        : 'border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.22em]">{isActive ? 'Active' : 'Select'}</p>
                    <p className="mt-3 text-sm font-medium">{option.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/70 bg-card/70 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
              <Mic className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground">Audio Capture</h2>
              <p className="text-sm text-muted-foreground">
                Choose whether {voiceShortcut} listens to a microphone or captures system audio from a selected source.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Capture mode</p>
              <div className="mt-3 grid gap-2">
                {[
                  {
                    id: 'microphone' as const,
                    title: 'Microphone',
                    description: 'Capture spoken dictation from a selected input device.',
                    icon: Mic,
                    sources: microphoneSources,
                  },
                  {
                    id: 'system' as const,
                    title: 'System audio',
                    description: 'Capture audio from a selected screen or app source.',
                    icon: Waves,
                    sources: systemSources,
                  },
                ].map((option) => {
                  const Icon = option.icon
                  const isActive = aiStatus.transcriptionPreferences.captureMode === option.id

                  return (
                    <button
                      key={option.id}
                      onClick={() => {
                        const fallbackSource = option.sources[0]
                        onTranscriptionPreferencesChange({
                          captureMode: option.id,
                          deviceId: fallbackSource?.id ?? null,
                          deviceLabel: fallbackSource?.label ?? '',
                          transcriptionMode: aiStatus.transcriptionPreferences.transcriptionMode,
                        })
                      }}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        isActive
                          ? 'border-foreground/20 bg-muted text-foreground'
                          : 'border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{option.title}</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/60 p-5">
              <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Transcription mode</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Pick whether {voiceShortcut} waits until you stop or writes into the active block while audio is still coming in.
                    </p>
                  </div>

                  <div className="rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {aiStatus.transcriptionPreferences.transcriptionMode === 'live' ? 'live' : 'manual'}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {transcriptionModeOptions.map((option) => {
                    const isActive = aiStatus.transcriptionPreferences.transcriptionMode === option.id

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          onTranscriptionPreferencesChange({
                            ...aiStatus.transcriptionPreferences,
                            transcriptionMode: option.id,
                          })
                        }
                        className={`rounded-xl border p-4 text-left transition-colors ${
                          isActive
                            ? 'border-foreground/20 bg-muted text-foreground'
                            : 'border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground'
                        }`}
                      >
                        <p className="text-xs uppercase tracking-[0.22em]">{isActive ? 'Active' : 'Select'}</p>
                        <p className="mt-3 text-sm font-medium">{option.title}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/60 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Device picker</p>
                <label className="text-sm font-medium text-foreground">
                  {aiStatus.transcriptionPreferences.captureMode === 'system' ? 'System source' : 'Microphone device'}
                </label>

                <select
                  value={selectedSourceId || ''}
                  onChange={(event) => {
                    const nextSource = activeSources.find((source) => source.id === event.target.value)
                    if (!nextSource) {
                      return
                    }

                    onTranscriptionPreferencesChange({
                      captureMode: aiStatus.transcriptionPreferences.captureMode,
                      deviceId: nextSource.id,
                      deviceLabel: nextSource.label,
                      transcriptionMode: aiStatus.transcriptionPreferences.transcriptionMode,
                    })
                  }}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/30"
                >
                  {activeSources.length === 0 ? (
                    <option value="">No sources available</option>
                  ) : (
                    activeSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.label}
                      </option>
                    ))
                  )}
                </select>

                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {selectedSourceLabel
                    ? `Current source: ${selectedSourceLabel}`
                    : aiStatus.transcriptionPreferences.captureMode === 'system'
                      ? 'Pick the screen or app source whose audio you want to capture.'
                      : 'Pick the exact input device, including connected AirPods or USB microphones.'}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="text-sm font-medium text-foreground">Microphone selection</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Only currently connected input devices are shown, so Bluetooth mics disappear automatically when they are disconnected.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="text-sm font-medium text-foreground">System capture</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    System audio uses the selected screen or window source, then applies either end-of-recording or live transcription into the focused block.
                  </p>
                </div>
              </div>

              {deviceError && (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {deviceError}
                </div>
              )}
            </div>
          </div>
        </section>

        {keyboardShortcutsSection}
      </div>
    </div>
  )
}
