import { CLEANUP_MODES } from "../modes/prompts.js";
import { LlamaCleanupError } from "./errors.js";

export class DictationPipeline {
  #asrClient;
  #llamaClient;
  #pasteController;

  constructor({ asrClient, llamaClient, pasteController }) {
    this.#asrClient = asrClient;
    this.#llamaClient = llamaClient;
    this.#pasteController = pasteController;
  }

  async processRecording({
    audioPath,
    language = "auto",
    modelId = "parakeet-tdt-0.6b",
    compute = "gpu",
    mode = CLEANUP_MODES.DEFAULT,
    context = {},
    onStage
  }) {
    const startedAt = Date.now();

    onStage?.("asr");
    const asrStartedAt = Date.now();

    const asrResponse = await this.#asrClient.transcribe({
      audio_path: audioPath,
      audioPath,
      language,
      model_id: modelId,
      modelId,
      compute
    });
    const asrElapsedMs = Date.now() - asrStartedAt;

    const rawText = asrResponse.raw_text ?? asrResponse.rawText;
    if (!rawText) {
      throw new Error("ASR returned empty transcript");
    }

    if (!this.#llamaClient) {
      throw new LlamaCleanupError("Llama backend is required");
    }

    onStage?.("llama");
    const llamaStartedAt = Date.now();

    let finalText;
    try {
      finalText = await this.#llamaClient.cleanText({
        mode,
        rawText,
        context
      });
    } catch (error) {
      throw new LlamaCleanupError(error.message);
    }
    const llamaElapsedMs = Date.now() - llamaStartedAt;

    onStage?.("paste");
    const pasteStartedAt = Date.now();

    const paste = await this.#pasteController.pasteText(finalText);
    const pasteElapsedMs = Date.now() - pasteStartedAt;

    return {
      rawText,
      finalText,
      paste,
      asrSource: asrResponse.source ?? "unknown",
      asrWarning: asrResponse.warning ?? null,
      asrElapsedMs,
      llamaElapsedMs,
      pasteElapsedMs,
      elapsedMs: Date.now() - startedAt
    };
  }
}
