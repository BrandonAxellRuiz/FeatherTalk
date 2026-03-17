export const TRAY_STATES = Object.freeze({
  NEUTRAL: "neutral",
  RECORDING: "recording",
  PROCESSING: "processing",
  ERROR: "error",
  WARNING: "warning"
});

export class TrayIconService {
  #state = TRAY_STATES.NEUTRAL;
  #history = [];
  #mode = "Default";
  #hotkey = "";
  #lastDictation = null;
  #serviceStatus = { asr: true, llama: true };

  setState(nextState) {
    this.#state = nextState;
    this.#history.push(nextState);
  }

  setMode(mode) {
    this.#mode = mode;
  }

  setHotkey(hotkey) {
    this.#hotkey = hotkey;
  }

  setLastDictation(text) {
    this.#lastDictation = text;
  }

  setLanguage(language) {
    // stub: no-op for test compatibility
  }

  popUpMenu() {
    // stub: no-op for test compatibility
  }

  setServiceStatus(status) {
    this.#serviceStatus = { ...this.#serviceStatus, ...status };
  }

  get state() {
    return this.#state;
  }

  get mode() {
    return this.#mode;
  }

  get hotkey() {
    return this.#hotkey;
  }

  get lastDictation() {
    return this.#lastDictation;
  }

  get serviceStatus() {
    return { ...this.#serviceStatus };
  }

  get history() {
    return [...this.#history];
  }
}
