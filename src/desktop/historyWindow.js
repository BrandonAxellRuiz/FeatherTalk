import { ipcMain, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { HISTORY_HTML } from "./historyHtml.js";

export class HistoryWindow {
  #window = null;
  #BrowserWindow;
  #historyService;
  #clipboard;
  #onRetryCleanup;

  constructor({ BrowserWindow, historyService, clipboard, onRetryCleanup }) {
    this.#BrowserWindow = BrowserWindow;
    this.#historyService = historyService;
    this.#clipboard = clipboard;
    this.#onRetryCleanup = onRetryCleanup;

    ipcMain.on("history:load", async () => {
      if (!this.#window || this.#window.isDestroyed()) return;
      try {
        const entries = await this.#historyService.getEntries({ limit: Infinity });
        this.#window.webContents.send("history:loaded", entries);
      } catch {
        this.#window.webContents.send("history:loaded", []);
      }
    });

    ipcMain.on("history:clear", async () => {
      if (!this.#historyService) return;
      try {
        await this.#historyService.clear();
        if (this.#window && !this.#window.isDestroyed()) {
          this.#window.webContents.send("history:cleared");
        }
      } catch {
        // Non-fatal
      }
    });

    ipcMain.on("history:export", async (_event, { format }) => {
      if (!this.#historyService) return;
      try {
        const content = await this.#historyService.exportEntries(format);
        const ext = format === "csv" ? "csv" : format === "txt" ? "txt" : "json";
        const result = await dialog.showSaveDialog(this.#window, {
          defaultPath: `feathertalk-historial.${ext}`,
          filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
        });

        if (!result.canceled && result.filePath) {
          await writeFile(result.filePath, content, "utf8");
          if (this.#window && !this.#window.isDestroyed()) {
            this.#window.webContents.send("history:exported", { path: result.filePath });
          }
        }
      } catch {
        // Non-fatal
      }
    });

    ipcMain.on("history:copy-entry", (_event, { text }) => {
      if (this.#clipboard && text) {
        this.#clipboard.writeText(text);
      }
    });

    ipcMain.on("history:retry-entry", (_event, { rawText, mode }) => {
      this.#onRetryCleanup?.({ rawText, mode });
    });
  }

  show() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }

    this.#window = new this.#BrowserWindow({
      width: 800,
      height: 600,
      frame: false,
      resizable: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(HISTORY_HTML)}`
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
