import { WIDGET_STATES } from "../services/widgetOverlayService.js";
import { WIDGET_HTML_INK_V2 } from "./widgetInkRingV2Html.js";

const WIDGET_WIDTH = 260;
const WIDGET_HEIGHT = 170;

const WIDGET_ANIMATION_VARIANTS = Object.freeze({
  ORGANIC_V1: "organic-v1",
  INK_V2: "ink-v2"
});

const WIDGET_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk Widget</title>
  <style>
    :root {
      color-scheme: light;
    }

    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      overflow: hidden;
      font-family: Segoe UI, Arial, sans-serif;
    }

    #root {
      position: relative;
      width: 260px;
      height: 170px;
      margin: 0;
      opacity: 0;
      transform: scale(0.92);
      transition: opacity 180ms ease-in-out, transform 180ms ease-in-out;
      pointer-events: none;
    }

    #root.visible {
      opacity: 1;
      transform: scale(1);
    }

    canvas {
      position: absolute;
      inset: 0;
      width: 260px;
      height: 170px;
      display: block;
    }

    #blur-core {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 148px;
      height: 148px;
      transform: translate(-50%, -50%);
      border-radius: 9999px;
      backdrop-filter: blur(14px) saturate(140%);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.24);
      box-shadow: 0 0 45px rgba(255, 255, 255, 0.2);
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="blur-core"></div>
    <canvas id="canvas" width="520" height="340"></canvas>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    const root = document.getElementById("root");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    const CENTER_X = 260;
    const CENTER_Y = 170;
    const ACTIVE_LEVEL = 0.02;

    const state = {
      mode: "recording",
      level: 0,
      phase: 0,
      spinner: 0,
      breath: 0,
      errorPulse: 0,
      visible: false,
      lastTs: performance.now()
    };

    function organicNoise(angle, phase, seed) {
      return (
        Math.sin(angle * (2.7 + seed * 0.17) + phase * (0.0018 + seed * 0.0002)) * 0.52 +
        Math.sin(angle * (6.3 + seed * 0.11) - phase * (0.0012 + seed * 0.00013)) * 0.31 +
        Math.sin(angle * (11.5 + seed * 0.09) + phase * (0.0021 + seed * 0.00017)) * 0.17
      );
    }

    function drawOrganicRing({ radius, roughness, thickness, ink, phaseOffset }) {
      const segments = 180;

      ctx.beginPath();
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = t * Math.PI * 2;
        const n = organicNoise(angle, state.phase + phaseOffset, i % 7);
        const r = radius + n * roughness;
        const x = CENTER_X + Math.cos(angle) * r;
        const y = CENTER_Y + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255, 255, 255, " + ink.toFixed(3) + ")";
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    function drawSplashStrokes(level) {
      const energy = Math.max(0, Math.min(1, (level - ACTIVE_LEVEL) * 1.45));
      const count = Math.floor(8 + energy * 28);
      const baseRadius = 66;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
      ctx.lineCap = "round";

      for (let i = 0; i < count; i += 1) {
        const p = i / Math.max(1, count);
        const angle =
          p * Math.PI * 2 +
          state.phase * 0.0016 +
          Math.sin(i * 3.41 + state.phase * 0.0011) * 0.42;

        const localNoise = organicNoise(angle, state.phase, i % 5);
        const startR = baseRadius + 1 + localNoise * 3.8;
        const len = 5 + energy * 30 * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.91 + state.phase * 0.0022)));

        const x0 = CENTER_X + Math.cos(angle) * startR;
        const y0 = CENTER_Y + Math.sin(angle) * startR;
        const x1 = CENTER_X + Math.cos(angle) * (startR + len);
        const y1 = CENTER_Y + Math.sin(angle) * (startR + len);

        ctx.lineWidth = 1 + energy * 2.7 * (0.45 + 0.55 * Math.abs(Math.cos(i * 0.83)));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        if (energy > 0.18 && i % 4 === 0) {
          const dotR = startR + len + 2 + Math.abs(localNoise) * 6;
          const dx = CENTER_X + Math.cos(angle + localNoise * 0.2) * dotR;
          const dy = CENTER_Y + Math.sin(angle + localNoise * 0.2) * dotR;
          const dotSize = 0.8 + energy * 2.2;

          ctx.beginPath();
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawListening(dt) {
      const active = state.level > ACTIVE_LEVEL;
      if (active) {
        state.phase += dt;
      }

      const energy = active ? Math.min(1, (state.level - ACTIVE_LEVEL) * 1.45) : 0;

      drawOrganicRing({
        radius: 62,
        roughness: 1.4 + energy * 7.4,
        thickness: 2.1 + energy * 1.5,
        ink: 0.92,
        phaseOffset: 0
      });

      drawOrganicRing({
        radius: 62,
        roughness: 0.9 + energy * 4.6,
        thickness: 1.2,
        ink: active ? 0.45 : 0.28,
        phaseOffset: 700
      });

      if (active) {
        drawSplashStrokes(state.level);
      }
    }

    function drawLoading(dt) {
      state.spinner += dt;
      state.breath += dt * 0.0025;

      const pulse = 1 + Math.sin(state.breath) * 0.08;
      const turbulence = 3.6 + Math.sin(state.spinner * 0.0015) * 1.2;

      drawOrganicRing({
        radius: 62 * pulse,
        roughness: turbulence,
        thickness: 2.35,
        ink: 0.92,
        phaseOffset: 0
      });

      drawOrganicRing({
        radius: 62 * pulse + 1.3,
        roughness: turbulence * 0.7,
        thickness: 1.15,
        ink: 0.35,
        phaseOffset: 900
      });
    }

    function drawError(dt) {
      state.errorPulse += dt * 0.006;
      const pulse = 1 + Math.sin(state.errorPulse) * 0.05;

      ctx.save();
      ctx.translate(CENTER_X, CENTER_Y);
      ctx.scale(pulse, pulse);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2.7;
      ctx.beginPath();
      ctx.moveTo(-18, -18);
      ctx.lineTo(18, 18);
      ctx.moveTo(18, -18);
      ctx.lineTo(-18, 18);
      ctx.stroke();

      ctx.restore();
    }

    function render(ts) {
      const dt = ts - state.lastTs;
      state.lastTs = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (state.mode === "recording") {
        drawListening(dt);
      } else if (state.mode === "processing") {
        drawLoading(dt);
      } else if (state.mode === "error") {
        drawError(dt);
      }

      requestAnimationFrame(render);
    }

    ipcRenderer.on("widget:event", (_event, payload) => {
      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "show") {
        state.visible = true;
        root.classList.add("visible");
      }

      if (payload.type === "hide") {
        state.visible = false;
        root.classList.remove("visible");
      }

      if (payload.type === "state") {
        state.mode = payload.value || state.mode;
      }

      if (payload.type === "level") {
        const v = Number(payload.value);
        if (Number.isFinite(v)) {
          state.level = Math.max(0, Math.min(1, v));
        }
      }
    });

    requestAnimationFrame(render);
  </script>
</body>
</html>`;

function resolveWidgetHtml(animationVariant) {
  if (animationVariant === WIDGET_ANIMATION_VARIANTS.ORGANIC_V1) {
    return WIDGET_HTML;
  }

  return WIDGET_HTML_INK_V2;
}


export class ElectronWidgetOverlayService {
  #window;
  #screen;
  #events = [];
  #state = WIDGET_STATES.HIDDEN;
  #visible = false;
  #ready;

  constructor({ BrowserWindow, screen, widget = {} }) {
    this.#screen = screen;
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

    const animationVariant =
      typeof widget.animationVariant === "string"
        ? widget.animationVariant
        : WIDGET_ANIMATION_VARIANTS.INK_V2;

    const widgetHtml = resolveWidgetHtml(animationVariant);

    this.#ready = this.#window.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(widgetHtml)}`
    );
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

  showWidget() {
    this.#visible = true;
    this.#positionTopCenter();
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

