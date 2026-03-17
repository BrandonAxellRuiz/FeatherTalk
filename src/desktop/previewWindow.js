import { ipcMain } from "electron";
import { PREVIEW_HTML } from "./previewHtml.js";

export class ElectronPreviewService {
  #BrowserWindow;
  #window = null;
  #pendingResolve = null;

  constructor({ BrowserWindow }) {
    this.#BrowserWindow = BrowserWindow;

    ipcMain.on("preview:result", (_event, result) => {
      if (this.#pendingResolve) {
        this.#pendingResolve(result);
        this.#pendingResolve = null;
      }
      this.#hideWindow();
    });
  }

  async showPreview(input) {
    const payload = typeof input === "string"
      ? { text: input, originalText: null }
      : { text: input.text, originalText: input.originalText ?? null };

    return new Promise((resolve) => {
      this.#pendingResolve = resolve;
      this.#createOrShowWindow();
      this.#window.webContents.send("preview:show", payload);
    });
  }

  #createOrShowWindow() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.show();
      this.#window.focus();
      return;
    }

    this.#window = new this.#BrowserWindow({
      width: 520,
      height: 400,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: false,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(PREVIEW_HTML)}`
    );

    this.#window.once("ready-to-show", () => {
      this.#window.show();
      this.#window.focus();
    });

    this.#window.on("closed", () => {
      if (this.#pendingResolve) {
        this.#pendingResolve({ action: "cancel", text: "" });
        this.#pendingResolve = null;
      }
      this.#window = null;
    });
  }

  #hideWindow() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.hide();
    }
  }

  destroy() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.destroy();
    }
  }
}
