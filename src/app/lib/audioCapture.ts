import type { AudioTranscriptionPreferences } from '../../shared/ai'

export interface AudioCaptureStopResult {
  fullAudio: Uint8Array
  pendingAudio: Uint8Array
}

export interface AudioCaptureSession {
  stop: () => Promise<AudioCaptureStopResult>
}

interface StartAudioCaptureOptions {
  chunkDurationMs?: number
  onChunk?: (audioData: Uint8Array) => void | Promise<void>
}

const mergeFloat32Arrays = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0

  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })

  return merged
}

const downsampleAudioBuffer = (buffer: Float32Array, inputSampleRate: number, outputSampleRate: number) => {
  if (outputSampleRate >= inputSampleRate) {
    return buffer
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.round(buffer.length / ratio)
  const output = new Float32Array(outputLength)

  let outputOffset = 0
  let inputOffset = 0

  while (outputOffset < output.length) {
    const nextInputOffset = Math.round((outputOffset + 1) * ratio)
    let accumulator = 0
    let count = 0

    for (let index = inputOffset; index < nextInputOffset && index < buffer.length; index += 1) {
      accumulator += buffer[index]
      count += 1
    }

    output[outputOffset] = count > 0 ? accumulator / count : 0
    outputOffset += 1
    inputOffset = nextInputOffset
  }

  return output
}

const encodeWav = (buffer: Float32Array, sampleRate: number) => {
  const byteCount = buffer.length * 2
  const wavBuffer = new ArrayBuffer(44 + byteCount)
  const view = new DataView(wavBuffer)

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + byteCount, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, byteCount, true)

  let offset = 44
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[index]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Uint8Array(wavBuffer)
}

const createMicrophoneStream = async (preferences: AudioTranscriptionPreferences) => {
  if (preferences.deviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: {
          exact: preferences.deviceId,
        },
      },
    })
  }

  return navigator.mediaDevices.getUserMedia({ audio: true })
}

const createSystemAudioStream = async (preferences: AudioTranscriptionPreferences) => {
  const availableSources = await window.ai.getSystemAudioSources()
  const fallbackSourceId = preferences.deviceId || availableSources[0]?.id

  if (!fallbackSourceId) {
    throw new Error('No system audio source is available right now.')
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: fallbackSourceId,
      },
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: fallbackSourceId,
        maxWidth: 1,
        maxHeight: 1,
        maxFrameRate: 1,
      },
    } as MediaTrackConstraints,
  } as MediaStreamConstraints)
}

const createCaptureStream = async (preferences: AudioTranscriptionPreferences) =>
  preferences.captureMode === 'system'
    ? createSystemAudioStream(preferences)
    : createMicrophoneStream(preferences)

export const startAudioCapture = async (
  preferences: AudioTranscriptionPreferences,
  options: StartAudioCaptureOptions = {}
): Promise<AudioCaptureSession> => {
  const stream = await createCaptureStream(preferences)

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('The selected source did not provide an audio track.')
  }

  const audioContext = new AudioContext()
  const sourceNode = audioContext.createMediaStreamSource(stream)
  const processorBufferSize = options.onChunk ? 2048 : 4096
  const processorNode = audioContext.createScriptProcessor(processorBufferSize, 2, 1)
  const silenceNode = audioContext.createGain()
  const chunks: Float32Array[] = []
  const pendingChunks: Float32Array[] = []
  const liveChunkDurationMs = Math.max(500, options.chunkDurationMs ?? 3000)
  const liveChunkSampleThreshold = Math.max(1, Math.round((audioContext.sampleRate * liveChunkDurationMs) / 1000))
  let pendingSampleCount = 0
  silenceNode.gain.value = 0

  const encodeChunk = (audioChunks: Float32Array[]) => {
    if (audioChunks.length === 0) {
      return new Uint8Array()
    }

    const mergedAudio = mergeFloat32Arrays(audioChunks)
    const downsampledAudio = downsampleAudioBuffer(mergedAudio, audioContext.sampleRate, 16000)
    return encodeWav(downsampledAudio, 16000)
  }

  const flushPendingChunk = () => {
    if (!options.onChunk || pendingChunks.length === 0) {
      return
    }

    const nextAudio = encodeChunk(pendingChunks)
    pendingChunks.length = 0
    pendingSampleCount = 0

    if (nextAudio.length > 0) {
      void Promise.resolve(options.onChunk(nextAudio)).catch((error) => {
        console.error('Failed to process a live transcription chunk:', error)
      })
    }
  }

  processorNode.onaudioprocess = (event) => {
    const input = event.inputBuffer
    const monoChunk = new Float32Array(input.length)

    for (let sampleIndex = 0; sampleIndex < input.length; sampleIndex += 1) {
      let sample = 0

      for (let channelIndex = 0; channelIndex < input.numberOfChannels; channelIndex += 1) {
        sample += input.getChannelData(channelIndex)[sampleIndex] || 0
      }

      monoChunk[sampleIndex] = sample / Math.max(1, input.numberOfChannels)
    }

    chunks.push(monoChunk)
    if (options.onChunk) {
      pendingChunks.push(monoChunk)
      pendingSampleCount += monoChunk.length

      if (pendingSampleCount >= liveChunkSampleThreshold) {
        flushPendingChunk()
      }
    }
  }

  sourceNode.connect(processorNode)
  processorNode.connect(silenceNode)
  silenceNode.connect(audioContext.destination)
  await audioContext.resume()

  let stopped = false

  return {
    stop: async () => {
      if (stopped) {
        return {
          fullAudio: new Uint8Array(),
          pendingAudio: new Uint8Array(),
        }
      }

      stopped = true

      processorNode.disconnect()
      silenceNode.disconnect()
      sourceNode.disconnect()
      stream.getTracks().forEach((track) => track.stop())

      const fullAudio = encodeChunk(chunks)
      const pendingAudio = encodeChunk(pendingChunks)
      pendingChunks.length = 0
      pendingSampleCount = 0

      await audioContext.close()

      return {
        fullAudio,
        pendingAudio,
      }
    },
  }
}
