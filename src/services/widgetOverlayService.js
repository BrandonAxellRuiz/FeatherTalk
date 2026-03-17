export const WIDGET_STATES = Object.freeze({
  HIDDEN: "hidden",
  RECORDING: "recording",
  PROCESSING: "processing",
  ERROR: "error"
});

export class WidgetOverlayService {
  #visible = false;
  #state = WIDGET_STATES.HIDDEN;
  #level = 0;
  #events = [];

  showWidget() {
    this.#visible = true;
    this.#events.push({ type: "show" });
  }

  show_widget() {
    this.showWidget();
  }

  setState(nextState) {
    this.#state = nextState;
    this.#events.push({ type: "state", value: nextState });
  }

  set_state(nextState) {
    this.setState(nextState);
  }

  updateLevel(level) {
    this.#level = Math.max(0, Math.min(1, level));
    this.#events.push({ type: "level", value: this.#level });
  }

  update_level(level) {
    this.updateLevel(level);
  }

  hideWidget() {
    this.#visible = false;
    this.#state = WIDGET_STATES.HIDDEN;
    this.#events.push({ type: "hide" });
  }

  setMode(mode) {
    this.#events.push({ type: "mode", value: mode });
  }

  set_mode(mode) {
    this.setMode(mode);
  }

  setPosition(x, y) {
    this.#events.push({ type: "position", value: { x, y } });
  }

  set_position(x, y) {
    this.setPosition(x, y);
  }

  setStage(stage) {
    this.#events.push({ type: "stage", value: stage });
  }

  setHotkey(hotkey) {
    this.#events.push({ type: "hotkey", value: hotkey });
  }

  emitEvent(payload) {
    this.#events.push(payload);
  }

  hide_widget() {
    this.hideWidget();
  }

  get visible() {
    return this.#visible;
  }

  get state() {
    return this.#state;
  }

  get level() {
    return this.#level;
  }

  get events() {
    return [...this.#events];
  }
}
