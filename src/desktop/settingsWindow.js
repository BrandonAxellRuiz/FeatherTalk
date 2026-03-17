import { ipcMain } from "electron";
import { SETTINGS_HTML } from "./settingsHtml.js";

export class SettingsWindow {
  #window = null;
  #BrowserWindow;
  #settingsStore;
  #onSettingsChanged;

  constructor({ BrowserWindow, settingsStore, onSettingsChanged }) {
    this.#BrowserWindow = BrowserWindow;
    this.#settingsStore = settingsStore;
    this.#onSettingsChanged = onSettingsChanged;

    ipcMain.on("settings:load", () => {
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.webContents.send("settings:loaded", this.#settingsStore.getAll());
      }
    });

    ipcMain.on("settings:save", (_event, patch) => {
      this.#settingsStore.update(patch);
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.webContents.send("settings:saved");
      }
      this.#onSettingsChanged?.(this.#settingsStore.getAll());
    });

    ipcMain.on("settings:enumerate-mics", () => {
      this.#enumerateMics();
    });
  }

  async #enumerateMics() {
    if (!this.#window || this.#window.isDestroyed()) return;
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      let devices = [];
      if (process.platform === "win32") {
        const { stdout } = await execAsync(
          'powershell -NoProfile -Command "Get-CimInstance Win32_SoundDevice | Select-Object Name, DeviceID | ConvertTo-Json"',
          { timeout: 5000 }
        );
        const parsed = JSON.parse(stdout);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        devices = arr.filter(Boolean).map(d => ({ id: d.DeviceID || d.Name, label: d.Name }));
      } else if (process.platform === "darwin") {
        const { stdout } = await execAsync(
          'system_profiler SPAudioDataType -json 2>/dev/null',
          { timeout: 5000 }
        );
        const parsed = JSON.parse(stdout);
        const items = parsed?.SPAudioDataType ?? [];
        for (const group of items) {
          const inputs = group?._items ?? [];
          for (const item of inputs) {
            if (item.coreaudio_input_source) {
              devices.push({ id: item._name, label: item._name });
            }
          }
        }
      }

      if (devices.length === 0) {
        devices = [{ id: "default", label: "Default" }];
      }

      this.#window.webContents.send("settings:mic-devices", devices);
    } catch {
      if (this.#window && !this.#window.isDestroyed()) {
        this.#window.webContents.send("settings:mic-devices", [{ id: "default", label: "Default" }]);
      }
    }
  }

  show() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }

    this.#window = new this.#BrowserWindow({
      width: 700,
      height: 600,
      frame: false,
      resizable: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(SETTINGS_HTML)}`
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
