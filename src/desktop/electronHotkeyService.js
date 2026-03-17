const IS_MACOS = process.platform === "darwin";

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
      return IS_MACOS ? "Control" : "Super";
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
  #additionalHotkeys = new Map();

  constructor({ globalShortcut }) {
    this.#globalShortcut = globalShortcut;
  }

  registerToggleHotkey(hotkey, handler) {
    this.registerHotkey("__toggle__", hotkey, handler);
    this.#registeredHotkey = hotkey;
    this.#registeredAccelerator = toElectronAccelerator(hotkey);
  }

  registerHotkey(name, hotkey, handler) {
    const accelerator = toElectronAccelerator(hotkey);

    if (this.#additionalHotkeys.has(name)) {
      const prev = this.#additionalHotkeys.get(name);
      this.#globalShortcut.unregister(prev.accelerator);
    }

    const ok = this.#globalShortcut.register(accelerator, handler);
    if (!ok) {
      throw new Error(`Unable to register global hotkey: ${hotkey}`);
    }

    this.#additionalHotkeys.set(name, { hotkey, accelerator, handler });
  }

  registerAdditionalHotkey(name, hotkey, handler) {
    this.registerHotkey(name, hotkey, handler);
  }

  unregisterAdditionalHotkey(name) {
    const entry = this.#additionalHotkeys.get(name);
    if (entry) {
      this.#globalShortcut.unregister(entry.accelerator);
      this.#additionalHotkeys.delete(name);
    }
  }

  unregister() {
    for (const [, entry] of this.#additionalHotkeys) {
      this.#globalShortcut.unregister(entry.accelerator);
    }
    this.#additionalHotkeys.clear();
    this.#registeredAccelerator = null;
    this.#registeredHotkey = null;
  }

  get registeredHotkey() {
    return this.#registeredHotkey;
  }
}
