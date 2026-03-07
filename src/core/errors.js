export class FeatherTalkError extends Error {
  constructor(message, code = "FEATHERTALK_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class InvalidStateTransitionError extends FeatherTalkError {
  constructor(from, to) {
    super(`Invalid transition: ${from} -> ${to}`, "INVALID_STATE_TRANSITION");
    this.from = from;
    this.to = to;
  }
}

export class LlamaCleanupError extends FeatherTalkError {
  constructor(message = "Llama cleanup failed") {
    super(message, "LLAMA_CLEANUP_FAILED");
  }
}

export class AudioCaptureError extends FeatherTalkError {
  constructor(message = "Audio capture failed") {
    super(message, "AUDIO_CAPTURE_FAILED");
  }
}

export class PasteError extends FeatherTalkError {
  constructor(message = "Paste failed") {
    super(message, "PASTE_FAILED");
  }
}
