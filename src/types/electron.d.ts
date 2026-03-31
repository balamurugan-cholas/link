import type {
  AiGenerationPreferences,
  AudioCaptureSource,
  AudioTranscriptionPreferences,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  AiStatus,
  GhostTextRequest,
  GhostTextResponse,
  InlineAgentEvent,
  InlineAgentRequest,
} from '../shared/ai'
import type {
  InstalledPluginState,
  PluginInstallRequest,
  PluginStateChangeEvent,
} from '../shared/plugins'

export {}

declare global {
  interface Window {
    db: any;
    ai: {
      getStatus: () => Promise<AiStatus>;
      downloadModel: () => Promise<AiStatus>;
      downloadVisionModel: () => Promise<AiStatus>;
      downloadSpeechModel: () => Promise<AiStatus>;
      generateGhostText: (request: GhostTextRequest) => Promise<GhostTextResponse>;
      runInlineAgent: (request: InlineAgentRequest) => Promise<void>;
      cancelInlineAgent: (requestId: string) => Promise<void>;
      updateTranscriptionPreferences: (preferences: AudioTranscriptionPreferences) => Promise<AiStatus>;
      updateGenerationPreferences: (preferences: AiGenerationPreferences) => Promise<AiStatus>;
      transcribeAudio: (request: AudioTranscriptionRequest) => Promise<AudioTranscriptionResponse>;
      cancelAudioTranscription: (requestId: string) => Promise<void>;
      getSystemAudioSources: () => Promise<AudioCaptureSource[]>;
      onStatusChange: (listener: (status: AiStatus) => void) => () => void;
      onInlineAgentEvent: (listener: (event: InlineAgentEvent) => void) => () => void;
    };
    electron: {
      platform: string;
      isMac: boolean;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
      ipcRenderer: {
        invoke: (
          channel: 'plugins:listInstalled' | 'plugins:install' | 'plugins:remove' | 'plugins:disable' | 'plugins:enable',
          payload?: unknown
        ) => Promise<any>;
      };
    };
    plugins: {
      getState: () => Promise<InstalledPluginState[]>;
      install: (payload: PluginInstallRequest) => Promise<any>;
      remove: (payload: { filename?: string; name?: string }) => Promise<any>;
      disable: (pluginId: string) => Promise<any>;
      enable: (pluginId: string) => Promise<any>;
      onStateChanged: (listener: (event: PluginStateChangeEvent) => void) => () => void;
    };
  }
}
