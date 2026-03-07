export const TRAY_STATES = Object.freeze({
  NEUTRAL: "neutral",
  RECORDING: "recording",
  PROCESSING: "processing",
  ERROR: "error"
});

export class TrayIconService {
  #state = TRAY_STATES.NEUTRAL;
  #history = [];

  setState(nextState) {
    this.#state = nextState;
    this.#history.push(nextState);
  }

  get state() {
    return this.#state;
  }

  get history() {
    return [...this.#history];
  }
}
