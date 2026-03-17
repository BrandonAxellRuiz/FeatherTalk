import { CLEANUP_MODES } from "../modes/prompts.js";

export const DEFAULT_SETTINGS = Object.freeze({
  hotkey: "Ctrl+Win+Space",
  hotkeyFallbacks: ["Ctrl+Shift+Space", "Ctrl+Alt+Space", "Ctrl+Space"],
  microphoneDeviceId: "default",
  audioAllowDshowFallback: true,
  asrAllowWindowsSpeechFallback: true,
  beepsEnabled: true,
  language: "auto",
  asrCompute: "auto",
  asrModelId: "parakeet-tdt-0.6b",
  asrWorkerUrl: "http://127.0.0.1:8787/transcribe",
  asrTimeoutMs: 90000,
  llamaBackend: "ollama",
  llamaModel: "qwen2.5:3b",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaCommand: "ollama",
  llamaCppBaseUrl: "http://127.0.0.1:8080",
  llamaTimeoutMs: 45000,
  llamaKeepAlive: "30m",
  llamaNumPredict: 96,
  llamaWarmupOnStart: true,
  ffmpegPath: "ffmpeg",
  pasteMode: "powershell",
  defaultMode: CLEANUP_MODES.DEFAULT,
  previewBeforePaste: false,
  undoStackSize: 5,
  healthPollIntervalMs: 60000,
  appModeMap: {},
  customModes: {},
  widget: {
    enabled: true,
    position: "top-center",
    size: "M"
  },
  history: {
    enabled: false,
    retentionDays: 7
  }
});

export class SettingsStore {
  #settings;

  constructor(seed = DEFAULT_SETTINGS) {
    this.#settings = structuredClone(seed);
  }

  getAll() {
    return structuredClone(this.#settings);
  }

  get(key) {
    return this.#settings[key];
  }

  update(patch) {
    this.#settings = {
      ...this.#settings,
      ...patch,
      widget: {
        ...this.#settings.widget,
        ...(patch.widget ?? {})
      },
      history: {
        ...this.#settings.history,
        ...(patch.history ?? {})
      }
    };

    return this.getAll();
  }
}


