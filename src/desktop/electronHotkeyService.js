function normalizeToken(token) {
  const value = token.trim().toLowerCase();

  switch (value) {
    case "ctrl":
    case "control":
      return "CommandOrControl";
    case "alt":
      return "Alt";
    case "shift":
      return "Shift";
    case "win":
    case "meta":
      return "Super";
    case "space":
      return "Space";
    case "enter":
      return "Enter";
    case "esc":
    case "escape":
      return "Escape";
    default:
      return token.length === 1 ? token.toUpperCase() : token;
  }
}

export function toElectronAccelerator(hotkey) {
  if (!hotkey || typeof hotkey !== "string") {
    throw new Error("Hotkey is required");
  }

  const parts = hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => normalizeToken(part));

  if (parts.length === 0) {
    throw new Error(`Invalid hotkey: ${hotkey}`);
  }

  return parts.join("+");
}

export class ElectronHotkeyService {
  #globalShortcut;
  #registeredHotkey = null;
  #registeredAccelerator = null;

  constructor({ globalShortcut }) {
    this.#globalShortcut = globalShortcut;
  }

  registerToggleHotkey(hotkey, handler) {
    const accelerator = toElectronAccelerator(hotkey);

    if (this.#registeredAccelerator) {
      this.#globalShortcut.unregister(this.#registeredAccelerator);
    }

    const ok = this.#globalShortcut.register(accelerator, handler);
    if (!ok) {
      throw new Error(`Unable to register global hotkey: ${hotkey}`);
    }

    this.#registeredHotkey = hotkey;
    this.#registeredAccelerator = accelerator;
  }

  unregister() {
    if (this.#registeredAccelerator) {
      this.#globalShortcut.unregister(this.#registeredAccelerator);
    }

    this.#registeredAccelerator = null;
    this.#registeredHotkey = null;
  }

  get registeredHotkey() {
    return this.#registeredHotkey;
  }
}
