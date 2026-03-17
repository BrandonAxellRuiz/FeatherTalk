import { WIDGET_STATES } from "../services/widgetOverlayService.js";
import { WIDGET_HTML_INK_V2 } from "./widgetInkRingV2Html.js";

const WIDGET_WIDTH = 260;
const WIDGET_HEIGHT = 260;

export class ElectronWidgetOverlayService {
  #window;
  #screen;
  #events = [];
  #state = WIDGET_STATES.HIDDEN;
  #visible = false;
  #ready;
  #customPosition = null;
  #ipcMain;

  constructor({ BrowserWindow, screen, ipcMain: ipc, onPositionChanged }) {
    this.#screen = screen;
    this.#ipcMain = ipc;
    this.#window = new BrowserWindow({
      width: WIDGET_WIDTH,
      height: WIDGET_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    this.#window.setAlwaysOnTop(true, "screen-saver");
    this.#window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.#window.setIgnoreMouseEvents(true, { forward: true });

    this.#ready = this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(WIDGET_HTML_INK_V2)}`
    );

    if (this.#ipcMain) {
      this.#ipcMain.on("widget:drag-move", (_event, { dx, dy }) => {
        if (this.#window.isDestroyed()) return;
        const [cx, cy] = this.#window.getPosition();
        this.#window.setPosition(cx + dx, cy + dy, false);
      });

      this.#ipcMain.on("widget:drag-end", () => {
        if (this.#window.isDestroyed()) return;
        const [x, y] = this.#window.getPosition();
        this.#customPosition = { x, y };
        onPositionChanged?.({ x, y });
      });
    }
  }

  async #emit(payload) {
    this.#events.push(payload);

    await this.#ready;
    if (this.#window.isDestroyed()) {
      return;
    }

    this.#window.webContents.send("widget:event", payload);
  }

  #positionTopCenter() {
    const display = this.#screen.getPrimaryDisplay();
    const area = display.workArea;
    const x = Math.round(area.x + (area.width - WIDGET_WIDTH) / 2);
    const y = Math.round(area.y + 18);
    this.#window.setPosition(x, y, false);
  }

  setPosition(x, y) {
    this.#customPosition = { x, y };
    if (!this.#window.isDestroyed()) {
      this.#window.setPosition(Math.round(x), Math.round(y), false);
    }
  }

  set_position(x, y) {
    this.setPosition(x, y);
  }

  showWidget() {
    this.#visible = true;
    if (this.#customPosition) {
      this.#window.setPosition(
        Math.round(this.#customPosition.x),
        Math.round(this.#customPosition.y),
        false
      );
    } else {
      this.#positionTopCenter();
    }
    this.#window.showInactive();
    this.#emit({ type: "show" }).catch(() => {});
  }

  show_widget() {
    this.showWidget();
  }

  setState(nextState) {
    this.#state = nextState;
    this.#emit({ type: "state", value: nextState }).catch(() => {});
  }

  set_state(nextState) {
    this.setState(nextState);
  }

  updateLevel(level) {
    this.#emit({ type: "level", value: level }).catch(() => {});
  }

  update_level(level) {
    this.updateLevel(level);
  }

  setMode(mode) {
    this.#emit({ type: "mode", value: mode }).catch(() => {});
  }

  set_mode(mode) {
    this.setMode(mode);
  }

  setStage(stage) {
    this.#emit({ type: "stage", value: stage }).catch(() => {});
  }

  setHotkey(hotkey) {
    this.#emit({ type: "hotkey", value: hotkey }).catch(() => {});
  }

  hideWidget() {
    this.#visible = false;
    this.#state = WIDGET_STATES.HIDDEN;
    this.#emit({ type: "hide" }).catch(() => {});

    setTimeout(() => {
      if (!this.#window.isDestroyed()) {
        this.#window.hide();
      }
    }, 190);
  }

  hide_widget() {
    this.hideWidget();
  }

  emitEvent(payload) {
    this.#emit(payload).catch(() => {});
  }

  destroy() {
    if (!this.#window.isDestroyed()) {
      this.#window.destroy();
    }
  }

  get visible() {
    return this.#visible;
  }

  get state() {
    return this.#state;
  }

  get events() {
    return [...this.#events];
  }
}
