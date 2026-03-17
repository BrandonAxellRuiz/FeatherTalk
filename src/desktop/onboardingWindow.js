import { ipcMain } from "electron";
import { ONBOARDING_HTML } from "./onboardingHtml.js";

export class OnboardingWindow {
  #window = null;
  #BrowserWindow;
  #healthCheck;
  #settingsStore;
  #onComplete;

  constructor({ BrowserWindow, healthCheck, settingsStore, onComplete }) {
    this.#BrowserWindow = BrowserWindow;
    this.#healthCheck = healthCheck;
    this.#settingsStore = settingsStore;
    this.#onComplete = onComplete;

    ipcMain.on("onboarding:check-deps", async () => {
      const result = await this.#healthCheck.checkAll();
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.webContents.send("onboarding:deps-result", result);
      }
    });

    ipcMain.on("onboarding:save-settings", (_event, patch) => {
      this.#settingsStore.update(patch);
    });

    ipcMain.on("onboarding:complete", () => {
      this.#settingsStore.update({ onboardingCompleted: true });
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.close();
      }
      this.#onComplete?.();
    });

    ipcMain.on("onboarding:skip", () => {
      this.#settingsStore.update({ onboardingCompleted: true });
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.close();
      }
      this.#onComplete?.();
    });
  }

  show() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }

    this.#window = new this.#BrowserWindow({
      width: 600,
      height: 500,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(ONBOARDING_HTML)}`
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
