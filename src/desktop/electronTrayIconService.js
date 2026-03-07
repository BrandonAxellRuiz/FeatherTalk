import { TRAY_STATES } from "../services/trayIconService.js";

function svgDataUrl(fill, stroke = "#101828") {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='13' fill='${fill}' stroke='${stroke}' stroke-width='2'/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function iconMap(nativeImage) {
  return {
    [TRAY_STATES.NEUTRAL]: nativeImage.createFromDataURL(svgDataUrl("#94a3b8")),
    [TRAY_STATES.RECORDING]: nativeImage.createFromDataURL(svgDataUrl("#ef4444")),
    [TRAY_STATES.PROCESSING]: nativeImage.createFromDataURL(svgDataUrl("#22c55e")),
    [TRAY_STATES.ERROR]: nativeImage.createFromDataURL(svgDataUrl("#f97316"))
  };
}

export class ElectronTrayIconService {
  #tray;
  #state = TRAY_STATES.NEUTRAL;
  #history = [];
  #icons;

  constructor({ Tray, Menu, nativeImage, onOpenSettings, onQuit }) {
    this.#icons = iconMap(nativeImage);
    this.#tray = new Tray(this.#icons[TRAY_STATES.NEUTRAL]);
    this.#tray.setToolTip("FeatherTalk");

    const menu = Menu.buildFromTemplate([
      {
        label: "Open Settings",
        click: () => onOpenSettings?.()
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => onQuit?.()
      }
    ]);

    this.#tray.setContextMenu(menu);
  }

  setState(nextState) {
    this.#state = nextState;
    this.#history.push(nextState);

    const icon = this.#icons[nextState] ?? this.#icons[TRAY_STATES.NEUTRAL];
    this.#tray.setImage(icon);
    this.#tray.setToolTip(`FeatherTalk - ${nextState}`);
  }

  destroy() {
    this.#tray?.destroy();
  }

  get state() {
    return this.#state;
  }

  get history() {
    return [...this.#history];
  }
}
