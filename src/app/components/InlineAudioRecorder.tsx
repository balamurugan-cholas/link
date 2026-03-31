import React from 'react'
import type { AudioCaptureMode, AudioTranscriptionMode } from '../../shared/ai'

interface InlineAudioRecorderProps {
  containerRef: React.RefObject<HTMLDivElement>
  captureMode: AudioCaptureMode
  deviceLabel: string
  transcriptionMode: AudioTranscriptionMode
  isRecording: boolean
  isTranscribing: boolean
  elapsedSeconds: number
  error: string | null
  onStart: () => void
  onStop: () => void
  onClose: () => void
}

const formatElapsedTime = (elapsedSeconds: number) => {
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function InlineAudioRecorder({
  containerRef,
  captureMode,
  deviceLabel,
  transcriptionMode,
  isRecording,
  isTranscribing,
  elapsedSeconds,
  error,
  onStart,
  onStop,
  onClose,
}: InlineAudioRecorderProps) {
  const sourceLabel = captureMode === 'system' ? 'System audio' : 'Microphone'
  const sourceDetails = deviceLabel ? `${sourceLabel} / ${deviceLabel}` : sourceLabel
  const modeLabel = transcriptionMode === 'live' ? 'Live' : 'Manual'
  const helperText = error
    ? error
    : isTranscribing
      ? transcriptionMode === 'live'
        ? 'Finishing the live transcript in the current block...'
        : 'Transcribing the captured audio into the current block...'
      : isRecording
        ? `${sourceLabel}${deviceLabel ? ` · ${deviceLabel}` : ''} · ${formatElapsedTime(elapsedSeconds)}`
        : `${sourceLabel}${deviceLabel ? ` · ${deviceLabel}` : ''}`
  const resolvedHelperText = error
    ? error
    : isTranscribing
      ? transcriptionMode === 'live'
        ? 'Finishing the live transcript in the current block...'
        : 'Transcribing the captured audio into the current block...'
      : isRecording
        ? transcriptionMode === 'live'
          ? `Live transcription / ${sourceDetails} / ${formatElapsedTime(elapsedSeconds)}`
          : `${sourceDetails} / ${formatElapsedTime(elapsedSeconds)}`
        : transcriptionMode === 'live'
          ? `${sourceDetails} / Live in block`
          : `${sourceDetails} / Transcribe on stop`

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          if (isTranscribing) {
            return
          }

          if (isRecording) {
            onStop()
          } else {
            onStart()
          }
        }
      }}
      className="mt-2 rounded-xl border border-border/70 bg-background/95 px-3 py-2 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Voice
        </span>

        <span className="inline-flex shrink-0 rounded-full border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {modeLabel}
        </span>

        <p className="flex-1 truncate text-sm text-foreground">{resolvedHelperText}</p>

        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            disabled={isTranscribing}
            className="shrink-0 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={isTranscribing}
            className="shrink-0 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Esc
        </button>
      </div>
    </div>
  )
}
