import { unlink } from "node:fs/promises";
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

function formatSeconds(ms) {
  return (ms / 1000).toFixed(1);
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
  #beep;
  #history;
  #preview;
  #lastResult = null;
  #undoStack = [];

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
    logger,
    beep,
    history,
    preview
  }) {
    this.#audioRecorder = audioRecorder;
    this.#widget = widget;
    this.#tray = tray;
    this.#toast = toast;
    this.#settings = settings;
    this.#delay = delay;
    this.#logger = logger ?? createConsoleLogger();
    this.#beep = beep ?? null;
    this.#history = history ?? null;
    this.#preview = preview ?? null;
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

  async cancel() {
    const current = this.#stateMachine.state;
    if (current !== STATES.RECORDING) {
      return { ignored: true, state: current };
    }

    this.#logger.info("Recording cancelled by user");
    this.#beep?.playError();

    let audioPath = null;
    try {
      const capture = await this.#audioRecorder.stopRecording();
      audioPath = capture?.audioPath;
    } catch (error) {
      this.#logger.warn("Error stopping recorder during cancel", {
        error: serializeError(error)
      });
    }

    this.#stateMachine.transition(STATES.IDLE);
    this.#widget.hideWidget();
    this.#tray.setState(TRAY_STATES.NEUTRAL);
    this.#toast.info("Grabacion cancelada");
    this.#widget?.emitEvent({ type: "toast", value: "Cancelado" });

    if (audioPath) {
      unlink(audioPath).catch(() => {});
    }

    return { cancelled: true };
  }

  setMode(mode) {
    this.#settings.update({ defaultMode: mode });
    this.#tray.setMode(mode);
    this.#widget.setMode(mode);
    this.#toast.info(`Modo: ${mode}`);
    this.#widget?.emitEvent({ type: "toast", value: `Modo: ${mode}` });
    this.#logger.info("Mode changed", { mode });
  }

  get mode() {
    return this.#settings.get("defaultMode");
  }

  getLastDictation() {
    return this.#lastResult;
  }

  async undoPaste() {
    if (this.#undoStack.length === 0 && !this.#lastResult?.clipboardBefore) {
      this.#toast.warning("No hay dictado previo para deshacer");
      return { ignored: true };
    }

    const current = this.#stateMachine.state;
    if (current !== STATES.IDLE) {
      return { ignored: true, state: current };
    }

    const entry = this.#undoStack.pop();
    const clipboardToRestore = entry?.clipboardBefore ?? this.#lastResult?.clipboardBefore;

    if (clipboardToRestore) {
      try {
        this.#pipeline.pasteController?.setClipboard?.(clipboardToRestore);
      } catch {
        // non-fatal
      }
    }

    // Clear lastResult after consuming it so subsequent undos don't silently "succeed"
    if (this.#undoStack.length === 0) {
      this.#lastResult = null;
    }

    const remaining = this.#undoStack.length;
    this.#toast.info(`Deshecho. Clipboard restaurado.${remaining > 0 ? ` (${remaining} más)` : ""}`);
    this.#widget?.emitEvent({ type: "toast", value: "Deshecho" });
    this.#logger.info("Undo paste executed", { remaining });
    return { undone: true, remaining };
  }

  async retryCleanup(newMode, overrideRawText = null) {
    const rawText = overrideRawText ?? this.#lastResult?.rawText;
    if (!rawText) {
      this.#toast.warning("No hay dictado previo para reintentar");
      return { ignored: true };
    }

    const current = this.#stateMachine.state;
    if (current !== STATES.IDLE) {
      return { ignored: true, state: current };
    }

    const mode = newMode ?? this.#settings.get("defaultMode");
    this.#logger.info("Retry cleanup", { mode, originalMode: this.#lastResult?.mode });

    try {
      this.#stateMachine.transition(STATES.PROCESSING_LLAMA);
      this.#tray.setState(TRAY_STATES.PROCESSING);
      this.#widget.showWidget();
      this.#widget.setState(WIDGET_STATES.PROCESSING);

      const finalText = await this.#pipeline.llamaClient.cleanText({
        mode,
        rawText,
        context: { app: "FeatherTalk" }
      });

      this.#stateMachine.transition(STATES.PASTING);
      const paste = await this.#pipeline.pasteController.pasteText(finalText);

      this.#lastResult = {
        ...(this.#lastResult ?? {}),
        rawText,
        finalText,
        mode
      };
      this.#tray.setLastDictation(finalText);

      this.#stateMachine.transition(STATES.DONE);
      this.#widget.hideWidget();
      this.#tray.setState(TRAY_STATES.NEUTRAL);

      if (paste.pasted) {
        this.#beep?.playSuccess();
        this.#toast.info(`Retry pegado (${mode})`);
      } else {
        this.#toast.warning("Texto en clipboard (retry)");
      }

      this.#stateMachine.transition(STATES.IDLE);
      return { pasted: paste.pasted, text: finalText };
    } catch (error) {
      return this.#handleError(error);
    }
  }

  async #startRecording() {
    this.#stateMachine.transition(STATES.RECORDING);
    this.#tray.setState(TRAY_STATES.RECORDING);
    this.#widget.showWidget();
    this.#widget.setState(WIDGET_STATES.RECORDING);
    this.#widget.setMode(this.#settings.get("defaultMode"));
    this.#beep?.playRecordStart();
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
        this.#widget.setStage?.(stage);
        if (stage === "llama") {
          this.#stateMachine.transition(STATES.PROCESSING_LLAMA);
        }

        if (stage === "preview") {
          this.#stateMachine.transition(STATES.PREVIEWING);
        }

        if (stage === "paste") {
          this.#stateMachine.transition(STATES.PASTING);
        }
      },
      onPreview: (settings.previewBeforePaste && this.#preview)
        ? (text, originalText) => this.#preview.showPreview({ text, originalText })
        : undefined
    });
  }

  async #stopAndProcess() {
    try {
      this.#stateMachine.transition(STATES.PROCESSING_ASR);
      this.#tray.setState(TRAY_STATES.PROCESSING);
      this.#widget.setState(WIDGET_STATES.PROCESSING);
      this.#beep?.playRecordStop();

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

      if (result.paste.cancelled) {
        this.#stateMachine.transition(STATES.IDLE);
        this.#widget.hideWidget();
        this.#tray.setState(TRAY_STATES.NEUTRAL);
        this.#toast.info("Vista previa cancelada");
        this.#logger.info("Preview cancelled by user");
        return { pasted: false, cancelled: true };
      }

      if (!result.paste.pasted) {
        this.#logger.warn("Paste fallback to clipboard", {
          error: result.paste.error
        });
        this.#toast.warning(
          "No se pudo pegar en la app activa. El texto limpio quedo en clipboard."
        );
      }

      // Store last result for retry/undo (F10) with multi-level undo stack
      if (this.#lastResult) {
        this.#undoStack.push(this.#lastResult);
        const maxStack = this.#settings.get("undoStackSize") ?? 5;
        while (this.#undoStack.length > maxStack) {
          this.#undoStack.shift();
        }
      }
      this.#lastResult = {
        rawText: result.rawText,
        finalText: result.finalText,
        audioPath: capture.audioPath,
        mode: settings.defaultMode,
        clipboardBefore: null
      };
      this.#tray.setLastDictation(result.finalText);

      this.#stateMachine.transition(STATES.DONE);
      this.#widget.hideWidget();
      this.#tray.setState(TRAY_STATES.NEUTRAL);
      this.#stateMachine.transition(STATES.IDLE);

      // F2: Toast with total time (detailed timing in log below)
      if (result.paste.pasted) {
        this.#beep?.playSuccess();
        this.#toast.info(
          `\u2713 Dictado pegado (${formatSeconds(result.elapsedMs)}s)`
        );
        this.#widget?.emitEvent({ type: "toast", value: "\u2713 Pegado" });
      } else {
        this.#toast.info(
          `Texto en clipboard (${formatSeconds(result.elapsedMs)}s)`
        );
        this.#widget?.emitEvent({ type: "toast", value: "En clipboard" });
      }

      // F12: History entry
      if (this.#history?.enabled !== false && this.#history) {
        this.#history.addEntry({
          rawText: result.rawText,
          finalText: result.finalText,
          mode: settings.defaultMode,
          elapsedMs: result.elapsedMs,
          asrSource: result.asrSource,
          timestamp: new Date().toISOString()
        }).catch((err) => {
          this.#logger.warn("History entry failed", { error: serializeError(err) });
        });
      }

      // F4: Auto-cleanup temp WAV
      const historyEnabled = this.#settings.get("history")?.enabled;
      if (!historyEnabled && capture.audioPath) {
        unlink(capture.audioPath).catch(() => {});
      }

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
    this.#beep?.playError();

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
