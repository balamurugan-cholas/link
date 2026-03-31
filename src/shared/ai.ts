export const LOCAL_MODEL_FILENAME = 'Phi-3-mini-4k-instruct-q4.gguf'
export const LOCAL_MODEL_DOWNLOAD_URL =
  'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf?download=true'
export const LOCAL_VISION_MODEL_FILENAME = 'MiniCPM-V-4_5-Q4_K_M.gguf'
export const LOCAL_VISION_MODEL_DOWNLOAD_URL =
  'https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf/resolve/main/MiniCPM-V-4_5-Q4_K_M.gguf?download=true'
export const LOCAL_VISION_PROJECTOR_FILENAME = 'mmproj-model-f16.gguf'
export const LOCAL_VISION_PROJECTOR_DOWNLOAD_URL =
  'https://huggingface.co/openbmb/MiniCPM-V-4_5-gguf/resolve/main/mmproj-model-f16.gguf?download=true'
export const WHISPER_MODEL_FILENAME = 'ggml-small.en.bin'
export const WHISPER_MODEL_DOWNLOAD_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin?download=true'

export type AiModelState = 'missing' | 'downloading' | 'downloaded' | 'starting' | 'ready' | 'error'

export interface AiDownloadProgress {
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
  speedBytesPerSecond?: number | null
}

export interface AiStatus {
  modelName: string
  modelPath: string
  status: AiModelState
  progress: AiDownloadProgress | null
  error: string | null
  downloadedBytes: number
  totalBytes: number | null
  visualModel: VisualModelStatus
  speechModel: SpeechModelStatus
  transcriptionPreferences: AudioTranscriptionPreferences
  generationPreferences: AiGenerationPreferences
}

export interface VisualModelStatus {
  modelName: string
  modelPath: string
  projectorName: string
  projectorPath: string
  status: AiModelState
  progress: AiDownloadProgress | null
  error: string | null
  downloadedBytes: number
  totalBytes: number | null
}

export interface SpeechModelStatus {
  modelName: string
  modelPath: string
  runtimeName: string
  runtimePath: string
  status: AiModelState
  progress: AiDownloadProgress | null
  error: string | null
  downloadedBytes: number
  totalBytes: number | null
}

export type AudioCaptureMode = 'microphone' | 'system'
export type AudioTranscriptionMode = 'manual' | 'live'

export interface AudioTranscriptionPreferences {
  captureMode: AudioCaptureMode
  deviceId: string | null
  deviceLabel: string
  transcriptionMode: AudioTranscriptionMode
}

export type AiAnswerLength = 'concise' | 'balanced' | 'detailed'

export interface AiGenerationPreferences {
  answerLength: AiAnswerLength
}

export interface AudioCaptureSource {
  id: string
  label: string
  kind: AudioCaptureMode
}

export interface AudioTranscriptionRequest {
  requestId: string
  audioData: Uint8Array
  captureMode: AudioCaptureMode
}

export interface AudioTranscriptionResponse {
  text: string
  status: AiModelState
  error?: string | null
}

export interface GhostTextRequest {
  pageId: string
  blockType: string
  beforeText: string
  afterText: string
}

export interface GhostTextResponse {
  suggestion: string
  status: AiModelState
  error?: string | null
}

export type InlineAgentActionMode = 'append' | 'replace'

export interface InlineAgentRequest {
  requestId: string
  pageId: string
  prompt: string
  currentBlockType: string
  currentBlockContent: string
  targetBlockType: string
  actionMode: InlineAgentActionMode
  imageUrl?: string | null
}

export type InlineAgentEventType = 'chunk' | 'complete' | 'error' | 'cancelled'

export interface InlineAgentEvent {
  requestId: string
  type: InlineAgentEventType
  chunk?: string
  fullText?: string
  error?: string | null
}

export const createDefaultAiStatus = (): AiStatus => ({
  modelName: LOCAL_MODEL_FILENAME,
  modelPath: '',
  status: 'missing',
  progress: null,
  error: null,
  downloadedBytes: 0,
  totalBytes: null,
  visualModel: {
    modelName: LOCAL_VISION_MODEL_FILENAME,
    modelPath: '',
    projectorName: LOCAL_VISION_PROJECTOR_FILENAME,
    projectorPath: '',
    status: 'missing',
    progress: null,
    error: null,
    downloadedBytes: 0,
    totalBytes: null,
  },
  speechModel: {
    modelName: WHISPER_MODEL_FILENAME,
    modelPath: '',
    runtimeName: 'whisper-cli',
    runtimePath: '',
    status: 'missing',
    progress: null,
    error: null,
    downloadedBytes: 0,
    totalBytes: null,
  },
  transcriptionPreferences: {
    captureMode: 'microphone',
    deviceId: null,
    deviceLabel: '',
    transcriptionMode: 'manual',
  },
  generationPreferences: {
    answerLength: 'detailed',
  },
})

export const normalizeAudioTranscriptionPreferences = (
  value: Partial<AudioTranscriptionPreferences> | null | undefined
): AudioTranscriptionPreferences => ({
  captureMode: value?.captureMode === 'system' ? 'system' : 'microphone',
  deviceId: typeof value?.deviceId === 'string' && value.deviceId.trim() ? value.deviceId : null,
  deviceLabel: typeof value?.deviceLabel === 'string' ? value.deviceLabel : '',
  transcriptionMode: value?.transcriptionMode === 'live' ? 'live' : 'manual',
})

export const normalizeAiGenerationPreferences = (
  value: Partial<AiGenerationPreferences> | null | undefined
): AiGenerationPreferences => ({
  answerLength:
    value?.answerLength === 'concise' || value?.answerLength === 'balanced' || value?.answerLength === 'detailed'
      ? value.answerLength
      : 'detailed',
})
