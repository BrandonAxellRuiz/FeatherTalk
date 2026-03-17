import { InvalidStateTransitionError } from "./errors.js";

export const STATES = Object.freeze({
  IDLE: "IDLE",
  RECORDING: "RECORDING",
  PROCESSING_ASR: "PROCESSING_ASR",
  PROCESSING_LLAMA: "PROCESSING_LLAMA",
  PREVIEWING: "PREVIEWING",
  PASTING: "PASTING",
  DONE: "DONE",
  ERROR: "ERROR"
});

const ALLOWED_TRANSITIONS = {
  [STATES.IDLE]: new Set([STATES.RECORDING, STATES.PROCESSING_LLAMA]),
  [STATES.RECORDING]: new Set([STATES.PROCESSING_ASR, STATES.ERROR, STATES.IDLE]),
  [STATES.PROCESSING_ASR]: new Set([STATES.PROCESSING_LLAMA, STATES.ERROR]),
  [STATES.PROCESSING_LLAMA]: new Set([STATES.PASTING, STATES.PREVIEWING, STATES.ERROR]),
  [STATES.PREVIEWING]: new Set([STATES.PASTING, STATES.IDLE, STATES.ERROR]),
  [STATES.PASTING]: new Set([STATES.DONE, STATES.ERROR]),
  [STATES.DONE]: new Set([STATES.IDLE]),
  [STATES.ERROR]: new Set([STATES.IDLE])
};

export class FeatherTalkStateMachine {
  #state = STATES.IDLE;
  #onTransition;

  constructor(onTransition = () => {}) {
    this.#onTransition = onTransition;
  }

  get state() {
    return this.#state;
  }

  isBusy() {
    return (
      this.#state === STATES.PROCESSING_ASR ||
      this.#state === STATES.PROCESSING_LLAMA ||
      this.#state === STATES.PREVIEWING ||
      this.#state === STATES.PASTING
    );
  }

  transition(nextState, context = undefined) {
    const allowed = ALLOWED_TRANSITIONS[this.#state] ?? new Set();
    if (!allowed.has(nextState)) {
      throw new InvalidStateTransitionError(this.#state, nextState);
    }

    const previous = this.#state;
    this.#state = nextState;
    this.#onTransition({ from: previous, to: nextState, context });
  }

  fail(error) {
    if (this.#state === STATES.ERROR) {
      return;
    }

    const previous = this.#state;
    this.#state = STATES.ERROR;
    this.#onTransition({ from: previous, to: STATES.ERROR, context: { error } });
  }
}
