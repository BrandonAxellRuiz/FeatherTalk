import {
  app,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  Notification,
  BrowserWindow,
  screen
} from "electron";
import { FeatherTalkAppController } from "../controllers/featherTalkAppController.js";
import { AsrWorkerClient } from "../services/asrWorkerClient.js";
import { AudioRecorderService } from "../services/audioRecorderService.js";
import { FileSettingsStore } from "../services/fileSettingsStore.js";
import { LlamaCleanupClient } from "../services/llamaCleanupClient.js";
import { createAppLogger, serializeError } from "../services/logger.js";
import { WindowsPasteController } from "../services/windowsPasteController.js";
import { WindowsSpeechAsrClient } from "../services/windowsSpeechAsrClient.js";
import { WindowsWasapiRecorderService } from "../services/windowsWasapiRecorderService.js";
import { buildHotkeyCandidates } from "./hotkeyCandidates.js";
import { ElectronHotkeyService } from "./electronHotkeyService.js";
import { ElectronToastNotifier } from "./electronToastNotifier.js";
import { ElectronTrayIconService } from "./electronTrayIconService.js";
import { ElectronWidgetOverlayService } from "./electronWidgetOverlayService.js";

app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function createAudioRecorder(settings) {
  const useStub = process.env.FEATHERTALK_AUDIO_MODE === "stub";
  if (useStub) {
    return new AudioRecorderService();
  }

  const ffmpegPath = process.env.FEATHERTALK_FFMPEG_PATH ?? settings.ffmpegPath;

  return new WindowsWasapiRecorderService({
    ffmpegPath,
    microphoneDeviceId: settings.microphoneDeviceId,
    allowDshowFallback: settings.audioAllowDshowFallback !== false
  });
}

function createAsrClient(settings, logger) {
  const fallbackClient =
    settings.asrAllowWindowsSpeechFallback === false
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

  return new LlamaCleanupClient({
    backend,
    model: settings.llamaModel,
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
    ollamaBaseUrl: settings.ollamaBaseUrl,
    ollamaCommand: settings.ollamaCommand,
    llamaCppBaseUrl: settings.llamaCppBaseUrl,
    llamaKeepAlive: settings.llamaKeepAlive,
    llamaNumPredict: settings.llamaNumPredict,
    widgetAnimationVariant: settings.widget?.animationVariant
  });

  const widget = new ElectronWidgetOverlayService({
    BrowserWindow,
    screen,
    widget: settings.widget
  });
  const toast = new ElectronToastNotifier({ Notification });

  const tray = new ElectronTrayIconService({
    Tray,
    Menu,
    nativeImage,
    onOpenSettings: () => {
      toast.info(`Edit settings here: ${settingsStore.filePath}`);
      logger.info("Settings menu opened", { settingsPath: settingsStore.filePath });
    },
    onQuit: () => {
      logger.info("Quit requested from tray menu");
      app.quit();
    }
  });

  const llamaClient = createLlamaClient(settings, logger);
  if (settings.llamaWarmupOnStart !== false && typeof llamaClient.warmup === "function") {
    llamaClient.warmup().catch(() => {});
  }

  const controller = new FeatherTalkAppController({
    audioRecorder: createAudioRecorder(settings),
    asrClient: createAsrClient(settings, logger),
    llamaClient,
    pasteController: new WindowsPasteController(),
    widget,
    tray,
    toast,
    settings: settingsStore,
    logger
  });

  const hotkey = new ElectronHotkeyService({ globalShortcut });

  try {
    registerHotkeyWithFallback(controller, hotkey, settingsStore, toast, logger);
  } catch (error) {
    logger.error("Global hotkey setup failed", { error: serializeError(error) });
    toast.error(
      `Global hotkey failed. Edit hotkey in ${settingsStore.filePath}. ${error.message}`
    );
  }

  app.on("will-quit", () => {
    logger.info("App will quit");
    hotkey.unregister();
    widget.destroy();
    tray.destroy();
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

