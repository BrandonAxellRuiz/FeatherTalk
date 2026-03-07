import { DictationPipeline } from "../core/dictationPipeline.js";
import { LlamaCleanupError } from "../core/errors.js";
import { FeatherTalkStateMachine, STATES } from "../core/stateMachine.js";
import { createConsoleLogger, serializeError } from "../services/logger.js";
import { TRAY_STATES } from "../services/trayIconService.js";
import { WIDGET_STATES } from "../services/widgetOverlayService.js";

function createDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeGpuFailure(error) {
  const text = `${error?.message ?? ""}`.toLowerCase();
  return /gpu|cuda|cudnn|directml|dml/.test(text);
}

export class FeatherTalkAppController {
  #stateMachine;
  #audioRecorder;
  #pipeline;
  #widget;
  #tray;
  #toast;
  #settings;
  #delay;
  #hotkeyService;
  #logger;

  constructor({
    audioRecorder,
    asrClient,
    llamaClient,
    pasteController,
    widget,
    tray,
    toast,
    settings,
    delay = createDelay,
    stateMachine,
    logger
  }) {
    this.#audioRecorder = audioRecorder;
    this.#widget = widget;
    this.#tray = tray;
    this.#toast = toast;
    this.#settings = settings;
    this.#delay = delay;
    this.#logger = logger ?? createConsoleLogger();
    this.#stateMachine =
      stateMachine ?? new FeatherTalkStateMachine(() => {
        // Keep this callback as an extension point for logging/telemetry.
      });

    this.#pipeline = new DictationPipeline({
      asrClient,
      llamaClient,
      pasteController
    });
  }

  registerHotkey(hotkeyService, overrideHotkey = null) {
    this.#hotkeyService = hotkeyService;
    const hotkey = overrideHotkey ?? this.#settings.get("hotkey");
    hotkeyService.registerToggleHotkey(hotkey, () => this.toggle());
    this.#logger.info("Controller registered hotkey", { hotkey });
    return hotkey;
  }

  async toggle() {
    const current = this.#stateMachine.state;
    this.#logger.debug("Hotkey toggle received", { state: current });

    if (current === STATES.IDLE) {
      return this.#startRecording();
    }

    if (current === STATES.RECORDING) {
      return this.#stopAndProcess();
    }

    this.#logger.info("Toggle ignored while busy", { state: current });
    return { ignored: true, state: current };
  }

  async #startRecording() {
    this.#stateMachine.transition(STATES.RECORDING);
    this.#tray.setState(TRAY_STATES.RECORDING);
    this.#widget.showWidget();
    this.#widget.setState(WIDGET_STATES.RECORDING);
    this.#logger.info("Recording started");

    try {
      await this.#audioRecorder.startRecording({
        onLevel: (value) => this.#widget.updateLevel(value)
      });

      return { recording: true };
    } catch (error) {
      return this.#handleError(
        error,
        `No se pudo iniciar el microfono: ${error.message}`
      );
    }
  }

  async #runPipeline(settings, capture, compute) {
    this.#logger.info("Pipeline run start", {
      audioPath: capture.audioPath,
      compute,
      language: settings.language,
      modelId: settings.asrModelId,
      mode: settings.defaultMode
    });

    return this.#pipeline.processRecording({
      audioPath: capture.audioPath,
      language: settings.language,
      modelId: settings.asrModelId,
      compute,
      mode: settings.defaultMode,
      context: { app: "FeatherTalk" },
      onStage: (stage) => {
        this.#logger.debug("Pipeline stage", { stage });
        if (stage === "llama") {
          this.#stateMachine.transition(STATES.PROCESSING_LLAMA);
        }

        if (stage === "paste") {
          this.#stateMachine.transition(STATES.PASTING);
        }
      }
    });
  }

  async #stopAndProcess() {
    try {
      this.#stateMachine.transition(STATES.PROCESSING_ASR);
      this.#tray.setState(TRAY_STATES.PROCESSING);
      this.#widget.setState(WIDGET_STATES.PROCESSING);

      const capture = await this.#audioRecorder.stopRecording();
      const settings = this.#settings.getAll();
      this.#logger.info("Recording stopped", { audioPath: capture.audioPath });

      let result;
      try {
        result = await this.#runPipeline(settings, capture, settings.asrCompute);
      } catch (error) {
        if (
          error instanceof LlamaCleanupError ||
          settings.asrCompute === "cpu" ||
          !looksLikeGpuFailure(error)
        ) {
          throw error;
        }

        this.#logger.warn("ASR GPU path failed, retrying CPU", {
          error: serializeError(error)
        });
        this.#toast.warning("GPU no disponible para ASR. Reintentando en CPU.");
        result = await this.#runPipeline(settings, capture, "cpu");
      }

      if (result.asrWarning) {
        this.#logger.warn("ASR warning", { warning: result.asrWarning });
        this.#toast.warning(result.asrWarning);
      }

      if (!result.paste.pasted) {
        this.#logger.warn("Paste fallback to clipboard", {
          error: result.paste.error
        });
        this.#toast.warning(
          "No se pudo pegar en la app activa. El texto limpio quedo en clipboard."
        );
      }

      this.#stateMachine.transition(STATES.DONE);
      this.#widget.hideWidget();
      this.#tray.setState(TRAY_STATES.NEUTRAL);
      this.#stateMachine.transition(STATES.IDLE);
      this.#logger.info("Pipeline completed", {
        asrSource: result.asrSource,
        asrElapsedMs: result.asrElapsedMs,
        llamaElapsedMs: result.llamaElapsedMs,
        pasteElapsedMs: result.pasteElapsedMs,
        elapsedMs: result.elapsedMs,
        pasted: result.paste.pasted
      });

      return {
        pasted: result.paste.pasted,
        copiedToClipboard: result.paste.copied_to_clipboard,
        text: result.finalText,
        asrSource: result.asrSource,
        asrElapsedMs: result.asrElapsedMs,
        llamaElapsedMs: result.llamaElapsedMs,
        pasteElapsedMs: result.pasteElapsedMs,
        elapsedMs: result.elapsedMs
      };
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async #handleError(error, overrideMessage = null) {
    this.#logger.error("Controller error", {
      overrideMessage,
      error: serializeError(error)
    });

    this.#stateMachine.fail(error);
    this.#tray.setState(TRAY_STATES.ERROR);
    this.#widget.setState(WIDGET_STATES.ERROR);

    if (error instanceof LlamaCleanupError) {
      this.#toast.error(
        `Llama no disponible o fallo limpieza. No se hizo autopaste. ${error.message}`
      );
    } else {
      this.#toast.error(overrideMessage ?? error.message);
    }

    await this.#delay(2500);

    this.#widget.hideWidget();
    this.#tray.setState(TRAY_STATES.NEUTRAL);
    this.#stateMachine.transition(STATES.IDLE);

    return { error: true, code: error.code ?? "UNKNOWN", message: error.message };
  }

  get state() {
    return this.#stateMachine.state;
  }
}

