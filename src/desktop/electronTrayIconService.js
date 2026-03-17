import { CLEANUP_MODES } from "../modes/prompts.js";
import { TRAY_STATES } from "../services/trayIconService.js";

// --- Icon rendering via raw RGBA buffers ---
// Electron's nativeImage.createFromDataURL does NOT support SVG.
// We draw icons programmatically using signed distance fields (SDF)
// for anti-aliased shapes, then create nativeImage from the RGBA buffer.

const ICON_SIZE = 32;
const CX = 16;
const CY = 16;

const STATE_RGB = {
  [TRAY_STATES.NEUTRAL]:    [148, 163, 184],
  [TRAY_STATES.RECORDING]:  [239, 68, 68],
  [TRAY_STATES.PROCESSING]: [34, 197, 94],
  [TRAY_STATES.ERROR]:      [249, 115, 22],
  [TRAY_STATES.WARNING]:    [234, 179, 8]
};

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function distCircle(x, y, r) {
  return Math.hypot(x - CX, y - CY) - r;
}

function distSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / len2) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function drawNeutral(x, y) {
  return clamp01(0.5 - (Math.abs(distCircle(x, y, 10)) - 1));
}

function drawRecording(x, y) {
  return clamp01(0.5 - distCircle(x, y, 10));
}

function drawProcessing(x, y) {
  return clamp01(0.5 - (Math.abs(distCircle(x, y, 8)) - 2.5));
}

function drawError(x, y) {
  const circle = clamp01(0.5 - (Math.abs(distCircle(x, y, 10)) - 1));
  const l1 = clamp01(0.5 - (distSegment(x, y, 11, 11, 21, 21) - 1));
  const l2 = clamp01(0.5 - (distSegment(x, y, 21, 11, 11, 21) - 1));
  return Math.max(circle, l1, l2);
}

function drawWarning(x, y) {
  const circle = clamp01(0.5 - (Math.abs(distCircle(x, y, 10)) - 1));
  const stem = clamp01(0.5 - (distSegment(x, y, 16, 10, 16, 17) - 1.2));
  const dot = clamp01(0.5 - (Math.hypot(x - CX, y - 21) - 1.5));
  return Math.max(circle, stem, dot);
}

const STATE_DRAW = {
  [TRAY_STATES.NEUTRAL]: drawNeutral,
  [TRAY_STATES.RECORDING]: drawRecording,
  [TRAY_STATES.PROCESSING]: drawProcessing,
  [TRAY_STATES.ERROR]: drawError,
  [TRAY_STATES.WARNING]: drawWarning
};

function renderIcon(drawFn, r, g, b) {
  const buf = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4, 0);

  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const a = drawFn(x + 0.5, y + 0.5);
      if (a > 0) {
        const idx = (y * ICON_SIZE + x) * 4;
        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = Math.round(a * 255);
      }
    }
  }

  return buf;
}

function iconMap(nativeImage) {
  const isMac = process.platform === "darwin";
  const map = {};

  for (const state of Object.values(TRAY_STATES)) {
    const drawFn = STATE_DRAW[state] ?? STATE_DRAW[TRAY_STATES.NEUTRAL];
    const [r, g, b] = isMac ? [0, 0, 0] : STATE_RGB[state];
    const buf = renderIcon(drawFn, r, g, b);
    const image = nativeImage.createFromBuffer(buf, {
      width: ICON_SIZE,
      height: ICON_SIZE
    });

    if (isMac) {
      image.setTemplateImage(true);
    }

    map[state] = image;
  }

  return map;
}

const STATE_LABELS = {
  [TRAY_STATES.NEUTRAL]: "Listo",
  [TRAY_STATES.RECORDING]: "Grabando",
  [TRAY_STATES.PROCESSING]: "Procesando",
  [TRAY_STATES.ERROR]: "Error",
  [TRAY_STATES.WARNING]: "Advertencia"
};

const LANGUAGE_LABELS = { auto: "Auto", es: "Español", en: "English" };

export class ElectronTrayIconService {
  #tray;
  #Menu;
  #state = TRAY_STATES.NEUTRAL;
  #history = [];
  #icons;
  #mode = CLEANUP_MODES.DEFAULT;
  #hotkey = "";
  #lastDictation = null;
  #serviceStatus = { asr: true, llama: true };
  #language = "auto";
  #callbacks;

  constructor({
    Tray,
    Menu,
    nativeImage,
    onOpenSettings,
    onOpenLogs,
    onQuit,
    onModeChange,
    onLanguageChange,
    onCopyLastDictation,
    onShowHotkeyHelp,
    onRefreshServices,
    onOpenHistory
  }) {
    this.#Menu = Menu;
    this.#icons = iconMap(nativeImage);
    this.#tray = new Tray(this.#icons[TRAY_STATES.NEUTRAL]);
    this.#callbacks = {
      onOpenSettings,
      onOpenLogs,
      onQuit,
      onModeChange,
      onLanguageChange,
      onCopyLastDictation,
      onShowHotkeyHelp,
      onRefreshServices,
      onOpenHistory
    };

    this.#rebuildTooltip();
    this.#rebuildMenu();
  }

  #rebuildTooltip() {
    const stateLabel = STATE_LABELS[this.#state] ?? this.#state;
    const parts = [`FeatherTalk — ${stateLabel} (${this.#mode})`];
    if (this.#hotkey) {
      parts.push(this.#hotkey);
    }
    this.#tray.setToolTip(parts.join(" | "));
  }

  #rebuildMenu() {
    const modes = Object.values(CLEANUP_MODES);
    const languages = Object.keys(LANGUAGE_LABELS);
    const asrOk = this.#serviceStatus.asr;
    const llamaOk = this.#serviceStatus.llama;
    const servicesLabel = `Servicios: ASR ${asrOk ? "\u2713" : "\u2717"} | Llama ${llamaOk ? "\u2713" : "\u2717"}`;

    const template = [
      { label: "FeatherTalk", enabled: false },
      { type: "separator" },
      {
        label: "Copiar ultimo dictado",
        enabled: this.#lastDictation !== null,
        click: () => this.#callbacks.onCopyLastDictation?.()
      },
      { type: "separator" },
      {
        label: "Modo",
        submenu: modes.map((m) => ({
          label: m,
          type: "radio",
          checked: this.#mode === m,
          click: () => this.#callbacks.onModeChange?.(m)
        }))
      },
      {
        label: "Idioma",
        submenu: languages.map((lang) => ({
          label: LANGUAGE_LABELS[lang],
          type: "radio",
          checked: this.#language === lang,
          click: () => this.#callbacks.onLanguageChange?.(lang)
        }))
      },
      { type: "separator" },
      {
        label: servicesLabel,
        click: () => {
          this.#refreshServices();
        }
      },
      { type: "separator" },
      {
        label: "Ver atajos de teclado",
        click: () => this.#callbacks.onShowHotkeyHelp?.()
      },
      {
        label: "Ver historial",
        click: () => this.#callbacks.onOpenHistory?.()
      },
      {
        label: "Abrir settings",
        click: () => this.#callbacks.onOpenSettings?.()
      },
      {
        label: "Abrir carpeta de logs",
        click: () => this.#callbacks.onOpenLogs?.()
      },
      { type: "separator" },
      {
        label: "Salir",
        click: () => this.#callbacks.onQuit?.()
      }
    ];

    this.#tray.setContextMenu(this.#Menu.buildFromTemplate(template));
  }

  #refreshServices() {
    this.#serviceStatus = { asr: false, llama: false };
    this.#rebuildMenu();
    this.#callbacks.onRefreshServices?.();
  }

  setState(nextState) {
    this.#state = nextState;
    this.#history.push(nextState);

    const icon = this.#icons[nextState] ?? this.#icons[TRAY_STATES.NEUTRAL];
    this.#tray.setImage(icon);
    this.#rebuildTooltip();
  }

  setMode(mode) {
    this.#mode = mode;
    this.#rebuildTooltip();
    this.#rebuildMenu();
  }

  setHotkey(hotkey) {
    this.#hotkey = hotkey;
    this.#rebuildTooltip();
    this.#rebuildMenu();
  }

  setLanguage(language) {
    this.#language = language;
    this.#rebuildMenu();
  }

  setLastDictation(text) {
    this.#lastDictation = text;
    this.#rebuildMenu();
  }

  setServiceStatus(status) {
    this.#serviceStatus = { ...this.#serviceStatus, ...status };
    this.#rebuildMenu();
  }

  popUpMenu() {
    this.#tray?.popUpContextMenu();
  }

  destroy() {
    this.#tray?.destroy();
  }

  get state() {
    return this.#state;
  }

  get mode() {
    return this.#mode;
  }

  get hotkey() {
    return this.#hotkey;
  }

  get lastDictation() {
    return this.#lastDictation;
  }

  get serviceStatus() {
    return { ...this.#serviceStatus };
  }

  get history() {
    return [...this.#history];
  }
}
