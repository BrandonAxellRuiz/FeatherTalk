import { buildFullReference, formatHotkey } from "./hotkeyMap.js";
import { buildHotkeyHelpHtml } from "./hotkeyHelpHtml.js";

export class HotkeyHelpWindow {
  #window = null;
  #BrowserWindow;

  constructor({ BrowserWindow }) {
    this.#BrowserWindow = BrowserWindow;
  }

  show(toggleHotkey) {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }

    const ref = buildFullReference(toggleHotkey);
    const entries = ref.map((e) => ({
      action: e.action,
      winLabel: e.hotkey,
      macLabel: formatHotkey(e.hotkey, "darwin")
    }));

    const isMac = process.platform === "darwin";
    const html = buildHotkeyHelpHtml(entries, isMac);

    this.#window = new this.#BrowserWindow({
      width: 480,
      height: 440,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`
    );

    this.#window.on("closed", () => {
      this.#window = null;
    });
  }

  destroy() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.destroy();
    }
  }
}
