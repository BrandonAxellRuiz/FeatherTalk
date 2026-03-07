export class ToastNotifier {
  #events = [];

  info(message) {
    this.#events.push({ level: "info", message });
  }

  warning(message) {
    this.#events.push({ level: "warning", message });
  }

  error(message) {
    this.#events.push({ level: "error", message });
  }

  get events() {
    return [...this.#events];
  }
}
