export class BeepService {
  #enabled;
  #events = [];

  constructor({ enabled = true } = {}) {
    this.#enabled = enabled;
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(value) {
    this.#enabled = value;
  }

  playRecordStart() {
    if (this.#enabled) {
      this.#events.push("start");
    }
  }

  playRecordStop() {
    if (this.#enabled) {
      this.#events.push("stop");
    }
  }

  playSuccess() {
    if (this.#enabled) {
      this.#events.push("success");
    }
  }

  playError() {
    if (this.#enabled) {
      this.#events.push("error");
    }
  }

  get events() {
    return [...this.#events];
  }
}
