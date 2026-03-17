import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  app,
  clipboard,
  globalShortcut,
  ipcMain,
  systemPreferences,
  Tray,
  Menu,
  nativeImage,
  Notification,
  BrowserWindow,
  screen,
  shell
} from "electron";

import { FeatherTalkAppController } from "../controllers/featherTalkAppController.js";
import { AsrWorkerClient } from "../services/asrWorkerClient.js";
import { AudioRecorderService } from "../services/audioRecorderService.js";
import { BeepService } from "../services/beepService.js";
import { FileSettingsStore } from "../services/fileSettingsStore.js";
import { HealthCheckService } from "../services/healthCheckService.js";
import { HistoryService } from "../services/historyService.js";
import { LlamaCleanupClient } from "../services/llamaCleanupClient.js";
import { createAppLogger, serializeError } from "../services/logger.js";
import { resolveHistoryFilePath, resolveLogsDir } from "../services/appPaths.js";
import { WindowsPasteController } from "../services/windowsPasteController.js";
import { WindowsSpeechAsrClient } from "../services/windowsSpeechAsrClient.js";
import { WindowsWasapiRecorderService } from "../services/windowsWasapiRecorderService.js";
import { CLEANUP_MODES } from "../modes/prompts.js";
import { TRAY_STATES } from "../services/trayIconService.js";
import { buildHotkeyCandidates } from "./hotkeyCandidates.js";
import { ElectronBeepService } from "./electronBeepService.js";
import { ElectronHotkeyService } from "./electronHotkeyService.js";
import { ElectronToastNotifier } from "./electronToastNotifier.js";
import { ElectronTrayIconService } from "./electronTrayIconService.js";
import { ElectronWidgetOverlayService } from "./electronWidgetOverlayService.js";
import { HotkeyHelpWindow } from "./hotkeyHelpWindow.js";

// Load .env file from project root (values only applied if not already set in process.env)
(function loadDotenv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
})();

app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function createAudioRecorder(settings, logger) {
  const useStub = process.env.FEATHERTALK_AUDIO_MODE === "stub";
  if (useStub) {
    return new AudioRecorderService();
  }

  const ffmpegPath = process.env.FEATHERTALK_FFMPEG_PATH ?? settings.ffmpegPath;

  return new WindowsWasapiRecorderService({
    ffmpegPath,
    microphoneDeviceId: settings.microphoneDeviceId,
    allowDshowFallback: settings.audioAllowDshowFallback !== false,
    logger
  });
}

function createAsrClient(settings, logger) {
  const fallbackClient =
    process.platform !== "win32" || settings.asrAllowWindowsSpeechFallback === false
      ? null
      : new WindowsSpeechAsrClient({ timeoutMs: settings.asrTimeoutMs });

  return new AsrWorkerClient({
    endpoint: settings.asrWorkerUrl,
    timeoutMs: settings.asrTimeoutMs,
    fallbackClient,
    logger
  });
}

function createLlamaClient(settings, logger) {
  const backend = settings.llamaBackend;
  const baseUrl =
    backend === "llama.cpp" ? settings.llamaCppBaseUrl : settings.ollamaBaseUrl;
  const model = process.env.FEATHERTALK_LLAMA_MODEL ?? settings.llamaModel;

  return new LlamaCleanupClient({
    backend,
    model,
    baseUrl,
    timeoutMs: settings.llamaTimeoutMs,
    keepAlive: settings.llamaKeepAlive,
    numPredict: settings.llamaNumPredict,
    autoStartOllama: true,
    ollamaCommand: settings.ollamaCommand,
    logger
  });
}

function registerHotkeyWithFallback(
  controller,
  hotkeyService,
  settingsStore,
  toast,
  logger
) {
  const settings = settingsStore.getAll();
  const requested = settings.hotkey;
  const candidates = buildHotkeyCandidates(requested, settings.hotkeyFallbacks);
  const errors = [];

  for (const candidate of candidates) {
    try {
      controller.registerHotkey(hotkeyService, candidate);
      logger.info("Hotkey registered", { requested, registered: candidate });

      if (candidate !== requested) {
        toast.warning(
          `Hotkey ${requested} en uso/reservado. FeatherTalk usara ${candidate}.`
        );
      }

      return candidate;
    } catch (error) {
      const detail = `${candidate}: ${error.message}`;
      errors.push(detail);
      logger.warn("Hotkey registration failed", {
        candidate,
        error: serializeError(error)
      });
    }
  }

  throw new Error(
    `Unable to register hotkeys. Tried ${candidates.join(", ")}. Details: ${errors.join(" | ")}`
  );
}

async function bootstrap() {
  await app.whenReady();

  const logger = await createAppLogger();
  logger.info("Desktop bootstrap start", {
    cwd: process.cwd(),
    platform: process.platform,
    node: process.version
  });

  if (process.platform === "darwin") {
    const micAccess = await systemPreferences.askForMediaAccess("microphone");
    logger.info("Microphone permission", { granted: micAccess });
  }

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", {
      reason: serializeError(reason)
    });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: serializeError(error)
    });
  });

  const settingsStore = new FileSettingsStore();
  await settingsStore.load();
  const settings = settingsStore.getAll();
  logger.info("Settings loaded", {
    settingsPath: settingsStore.filePath,
    asrWorkerUrl: settings.asrWorkerUrl,
    ffmpegPath: process.env.FEATHERTALK_FFMPEG_PATH ?? settings.ffmpegPath,
    microphoneDeviceId: settings.microphoneDeviceId,
    llamaBackend: settings.llamaBackend,
    llamaModel: process.env.FEATHERTALK_LLAMA_MODEL ?? settings.llamaModel,
    ollamaBaseUrl: settings.ollamaBaseUrl,
    ollamaCommand: settings.ollamaCommand,
    llamaCppBaseUrl: settings.llamaCppBaseUrl,
    llamaKeepAlive: settings.llamaKeepAlive,
    llamaNumPredict: settings.llamaNumPredict
  });

  // F15: Widget with drag support + custom position persistence
  const widget = new ElectronWidgetOverlayService({
    BrowserWindow,
    screen,
    ipcMain,
    onPositionChanged: (pos) => {
      settingsStore.update({ widget: { position: pos } });
    }
  });

  // Restore persisted widget position if it's an {x,y} object
  const widgetPos = settings.widget?.position;
  if (widgetPos && typeof widgetPos === "object" && widgetPos.x != null) {
    widget.setPosition(widgetPos.x, widgetPos.y);
  }

  const toast = new ElectronToastNotifier({ Notification });

  // F8: Beep service routed through widget AudioContext
  const beep = new ElectronBeepService({
    widget,
    enabled: settings.beepsEnabled !== false
  });

  // F6: Health check service
  const healthCheck = new HealthCheckService({
    asrEndpoint: settings.asrWorkerUrl,
    llamaBackend: settings.llamaBackend,
    llamaBaseUrl: settings.llamaBackend === "llama.cpp"
      ? settings.llamaCppBaseUrl
      : settings.ollamaBaseUrl
  });

  // F14: Settings window (lazy import to avoid ipcMain conflicts)
  const { SettingsWindow } = await import("./settingsWindow.js");
  const settingsWindow = new SettingsWindow({
    BrowserWindow,
    settingsStore,
    onSettingsChanged: (newSettings) => {
      controller.setMode(newSettings.defaultMode);
      tray.setLanguage(newSettings.language);
      beep.enabled = newSettings.beepsEnabled !== false;
      logger.info("Settings updated from UI");
    }
  });

  // F15: Hotkey help window
  const hotkeyHelp = new HotkeyHelpWindow({ BrowserWindow });

  // History window (lazy import, Feature 1)
  let historyWindow = null;
  async function ensureHistoryWindow() {
    if (historyWindow) return historyWindow;
    const { HistoryWindow } = await import("./historyWindow.js");
    historyWindow = new HistoryWindow({
      BrowserWindow,
      historyService: history,
      clipboard,
      onRetryCleanup: ({ rawText, mode }) => {
        controller.retryCleanup(mode, rawText);
      }
    });
    return historyWindow;
  }

  // F5: Expanded tray menu with callbacks
  const tray = new ElectronTrayIconService({
    Tray,
    Menu,
    nativeImage,
    onModeChange: (mode) => {
      controller.setMode(mode);
    },
    onLanguageChange: (lang) => {
      settingsStore.update({ language: lang });
      tray.setLanguage(lang);
      toast.info(`Idioma: ${lang === "auto" ? "Auto" : lang}`);
    },
    onCopyLastDictation: () => {
      const last = controller.getLastDictation();
      if (last?.finalText) {
        clipboard.writeText(last.finalText);
        toast.info("Ultimo dictado copiado al clipboard");
      }
    },
    onOpenLogs: () => {
      shell.openPath(resolveLogsDir());
    },
    onOpenSettings: () => {
      settingsWindow.show();
      logger.info("Settings window opened");
    },
    onShowHotkeyHelp: () => {
      hotkeyHelp.show(hotkey.registeredHotkey ?? settings.hotkey);
      logger.info("Hotkey help window opened");
    },
    onOpenHistory: async () => {
      if (!history) {
        toast.warning("Historial deshabilitado. Actívalo en Settings.");
        return;
      }
      const hw = await ensureHistoryWindow();
      hw.show();
      logger.info("History window opened");
    },
    onRefreshServices: () => {
      healthCheck.checkAll().then((result) => {
        tray.setServiceStatus({
          asr: result.asr.ok,
          llama: result.llama.ok
        });
        logger.info("Health check refreshed from tray menu", { result });
      }).catch((err) => {
        logger.warn("Health check refresh error", { error: serializeError(err) });
      });
    },
    onQuit: () => {
      logger.info("Quit requested from tray menu");
      app.quit();
    }
  });

  // F1: Set initial mode and hotkey on tray tooltip
  tray.setMode(settings.defaultMode);
  tray.setLanguage(settings.language);

  // F12: History service
  const historySettings = settings.history ?? {};
  let history = null;
  if (historySettings.enabled) {
    history = new HistoryService({
      filePath: resolveHistoryFilePath(),
      retentionDays: historySettings.retentionDays ?? 7
    });
    history.cleanup().catch((err) => {
      logger.warn("History cleanup failed", { error: serializeError(err) });
    });
  }

  // F11: Preview service
  let preview = null;
  if (settings.previewBeforePaste) {
    const { ElectronPreviewService } = await import("./previewWindow.js");
    preview = new ElectronPreviewService({ BrowserWindow });
  }

  const llamaClient = createLlamaClient(settings, logger);

  // Feature 9: Warmup with visual feedback
  if (settings.llamaWarmupOnStart !== false && typeof llamaClient.warmup === "function") {
    toast.info("Cargando modelo Llama...");
    tray.setState(TRAY_STATES.WARNING);
    llamaClient.warmup().then(() => {
      toast.info("Modelo Llama listo");
      tray.setState(TRAY_STATES.NEUTRAL);
      logger.info("Llama warmup completed");
    }).catch((err) => {
      toast.warning("Warmup de Llama fallo. Se reintentara al dictar.");
      tray.setState(TRAY_STATES.NEUTRAL);
      logger.warn("Llama warmup failed", { error: serializeError(err) });
    });
  }

  const controller = new FeatherTalkAppController({
    audioRecorder: createAudioRecorder(settings, logger),
    asrClient: createAsrClient(settings, logger),
    llamaClient,
    pasteController: new WindowsPasteController(),
    widget,
    tray,
    toast,
    settings: settingsStore,
    logger,
    beep,
    history,
    preview
  });

  const hotkey = new ElectronHotkeyService({ globalShortcut });

  try {
    const registeredHotkey = registerHotkeyWithFallback(
      controller, hotkey, settingsStore, toast, logger
    );
    // F1: Set hotkey on tray tooltip + widget shortcuts overlay
    tray.setHotkey(registeredHotkey);
    widget.setHotkey(registeredHotkey);
  } catch (error) {
    logger.error("Global hotkey setup failed", { error: serializeError(error) });
    toast.error(
      `Global hotkey failed. Edit hotkey in ${settingsStore.filePath}. ${error.message}`
    );
  }

  // F7: Register Escape to cancel recording (dynamic — only during recording)
  const originalToggle = controller.toggle.bind(controller);
  const wrappedToggle = async () => {
    const result = await originalToggle();
    if (result?.recording) {
      hotkey.registerAdditionalHotkey("escape-cancel", "Escape", () => {
        controller.cancel();
        hotkey.unregisterAdditionalHotkey("escape-cancel");
      });
    }
    return result;
  };

  // Re-register the toggle hotkey with the wrapped version that manages Escape
  const currentHotkey = hotkey.registeredHotkey;
  if (currentHotkey) {
    hotkey.registerToggleHotkey(currentHotkey, wrappedToggle);
  }

  // F9: Mode shortcuts
  const modes = Object.values(CLEANUP_MODES);
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    try {
      hotkey.registerAdditionalHotkey(
        `mode-${i + 1}`,
        `Ctrl+Win+${i + 1}`,
        () => controller.setMode(mode)
      );
    } catch {
      logger.warn("Mode hotkey registration failed", { mode, key: `Ctrl+Win+${i + 1}` });
    }
  }

  // F9: Ctrl+Win+M to cycle modes
  try {
    hotkey.registerAdditionalHotkey("mode-cycle", "Ctrl+Win+M", () => {
      const currentMode = controller.mode;
      const idx = modes.indexOf(currentMode);
      const nextMode = modes[(idx + 1) % modes.length];
      controller.setMode(nextMode);
    });
  } catch {
    logger.warn("Mode cycle hotkey registration failed");
  }

  // F10: Undo and retry shortcuts
  try {
    hotkey.registerAdditionalHotkey("undo-paste", "Ctrl+Win+Z", () => {
      controller.undoPaste();
    });
  } catch {
    logger.warn("Undo hotkey registration failed");
  }

  try {
    hotkey.registerAdditionalHotkey("retry-cleanup", "Ctrl+Win+R", () => {
      controller.retryCleanup();
    });
  } catch {
    logger.warn("Retry hotkey registration failed");
  }

  // Show tray menu via hotkey
  try {
    hotkey.registerAdditionalHotkey("show-menu", "Ctrl+Win+H", () => {
      tray.popUpMenu();
    });
  } catch {
    logger.warn("Show menu hotkey registration failed");
  }

  // F6: Health check on start
  healthCheck.checkAll().then((result) => {
    tray.setServiceStatus({
      asr: result.asr.ok,
      llama: result.llama.ok
    });

    if (!result.asr.ok || !result.llama.ok) {
      const msgs = [];
      if (!result.asr.ok) msgs.push(`ASR: ${result.asr.error}`);
      if (!result.llama.ok) msgs.push(`Llama: ${result.llama.error}`);
      toast.warning(`Servicios no disponibles: ${msgs.join(" | ")}`);
      logger.warn("Health check failed", { result });
    } else {
      logger.info("Health check passed");
    }
  }).catch((err) => {
    logger.warn("Health check error", { error: serializeError(err) });
  });

  // Feature 5: Health polling — periodic checks with proactive warnings
  const pollInterval = settings.healthPollIntervalMs ?? 60000;
  if (pollInterval > 0) {
    healthCheck.startPolling(pollInterval, (result) => {
      tray.setServiceStatus({
        asr: result.asr.ok,
        llama: result.llama.ok
      });

      const msgs = [];
      if (!result.asr.ok) msgs.push(`ASR: ${result.asr.error}`);
      if (!result.llama.ok) msgs.push(`Llama: ${result.llama.error}`);

      // Only change tray icon if controller is idle to avoid overwriting RECORDING/PROCESSING
      const isIdle = controller.state === "IDLE";
      if (msgs.length > 0) {
        toast.warning(`Servicio caido: ${msgs.join(" | ")}`);
        if (isIdle) tray.setState(TRAY_STATES.WARNING);
        logger.warn("Health poll detected service down", { result });
      } else if (isIdle && tray.state === TRAY_STATES.WARNING) {
        tray.setState(TRAY_STATES.NEUTRAL);
        logger.info("Health poll: services recovered");
      }
    });
  }

  // F13: Onboarding on first run
  if (settingsStore.isFirstRun && !settings.onboardingCompleted) {
    const { OnboardingWindow } = await import("./onboardingWindow.js");
    const onboarding = new OnboardingWindow({
      BrowserWindow,
      healthCheck,
      settingsStore,
      onComplete: () => {
        logger.info("Onboarding completed");
        toast.info("FeatherTalk configurado. Usa tu hotkey para dictar.");
      }
    });
    onboarding.show();
  }

  app.on("will-quit", () => {
    logger.info("App will quit");
    healthCheck.stopPolling();
    hotkey.unregister();
    widget.destroy();
    tray.destroy();
    settingsWindow.destroy();
    hotkeyHelp.destroy();
    preview?.destroy();
    historyWindow?.destroy();
  });

  app.on("window-all-closed", (event) => {
    event.preventDefault();
  });

  logger.info("Desktop bootstrap complete", { logFilePath: logger.logFilePath });
}

if (hasSingleInstanceLock) {
  bootstrap().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("FeatherTalk desktop bootstrap failed", error);
    app.quit();
  });
} else {
  // eslint-disable-next-line no-console
  console.log("FeatherTalk is already running in the tray. Close the existing instance before starting a new one.");
  app.quit();
}
