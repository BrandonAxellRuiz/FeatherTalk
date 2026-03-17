export class HotkeyService {
  #toggleHandler = null;
  #registeredHotkey = null;
  #additionalHandlers = new Map();

  registerToggleHotkey(hotkey, handler) {
    this.#registeredHotkey = hotkey;
    this.#toggleHandler = handler;
  }

  registerHotkey(name, hotkey, handler) {
    this.#additionalHandlers.set(name, { hotkey, handler });
  }

  registerAdditionalHotkey(name, hotkey, handler) {
    this.registerHotkey(name, hotkey, handler);
  }

  unregisterAdditionalHotkey(name) {
    this.#additionalHandlers.delete(name);
  }

  unregister() {
    this.#toggleHandler = null;
    this.#registeredHotkey = null;
    this.#additionalHandlers.clear();
  }

  trigger() {
    if (this.#toggleHandler) {
      return this.#toggleHandler();
    }

    return undefined;
  }

  triggerHotkey(name) {
    const entry = this.#additionalHandlers.get(name);
    if (entry) {
      return entry.handler();
    }
    return undefined;
  }

  get registeredHotkey() {
    return this.#registeredHotkey;
  }

  get additionalHotkeys() {
    return new Map(this.#additionalHandlers);
  }
}
