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
