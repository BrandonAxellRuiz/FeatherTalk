export class ElectronBeepService {
  #widget;
  #enabled;

  constructor({ widget, enabled = true }) {
    this.#widget = widget;
    this.#enabled = enabled;
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(value) {
    this.#enabled = value;
  }

  #emit(tone) {
    if (!this.#enabled) return;
    this.#widget.emitEvent({ type: "beep", tone });
  }

  playRecordStart() {
    this.#emit("start");
  }

  playRecordStop() {
    this.#emit("stop");
  }

  playSuccess() {
    this.#emit("success");
  }

  playError() {
    this.#emit("error");
  }
}
