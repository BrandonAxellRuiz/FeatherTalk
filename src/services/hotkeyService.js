export class HotkeyService {
  #toggleHandler = null;
  #registeredHotkey = null;

  registerToggleHotkey(hotkey, handler) {
    this.#registeredHotkey = hotkey;
    this.#toggleHandler = handler;
  }

  unregister() {
    this.#toggleHandler = null;
    this.#registeredHotkey = null;
  }

  trigger() {
    if (this.#toggleHandler) {
      return this.#toggleHandler();
    }

    return undefined;
  }

  get registeredHotkey() {
    return this.#registeredHotkey;
  }
}
