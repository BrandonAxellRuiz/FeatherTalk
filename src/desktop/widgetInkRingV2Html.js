export const WIDGET_HTML_INK_V2 = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk Widget Ink V2</title>
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
      opacity: 0;
      transform: scale(0.92);
      transition: opacity 190ms ease-in-out, transform 190ms ease-in-out;
      pointer-events: none;
    }

    #root.visible {
      opacity: 1;
      transform: scale(1);
    }

    #blur-core {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 150px;
      height: 150px;
      transform: translate(-50%, -50%);
      border-radius: 9999px;
      backdrop-filter: blur(13px) saturate(145%);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 0 42px rgba(255, 255, 255, 0.16);
      pointer-events: none;
    }

    canvas {
      position: absolute;
      inset: 0;
      width: 260px;
      height: 170px;
      display: block;
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
    const ACTIVE_LEVEL = 0.045;

    const state = {
      mode: "recording",
      levelRaw: 0,
      level: 0,
      phase: 0,
      spinner: 0,
      breath: 0,
      errorPulse: 0,
      visible: false,
      lastTs: performance.now()
    };

    const cfg = {
      radius: 62,
      points: 280,
      restNoise: 1.0,
      talkNoise: 8.0,
      restThickness: 2.0,
      talkThickness: 3.6,
      strands: 3,
      strandOffset: 1.05,
      strandAlpha: 0.92,
      brushSize: 96,
      brushRoughness: 0.52,
      bleedAlpha: 0.12,
      maxSplashes: 22,
      splashThreshold: 0.09,
      splashDotChance: 0.34,
      splashLenMin: 4,
      splashLenMax: 27,
      splashWidthMin: 1.0,
      splashWidthMax: 3.6,
      loadingNoise: 4.0
    };

    function clamp01(v) {
      if (!Number.isFinite(v) || v <= 0) {
        return 0;
      }
      if (v >= 1) {
        return 1;
      }
      return v;
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function smoothstep(t) {
      return t * t * (3 - 2 * t);
    }

    function hash2(x, y) {
      let n = (x * 374761393 + y * 668265263) | 0;
      n = (n ^ (n >>> 13)) | 0;
      n = Math.imul(n, 1274126177) | 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }

    function vnoise2(x, y) {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const sx = smoothstep(x - x0);
      const sy = smoothstep(y - y0);

      const n00 = hash2(x0, y0);
      const n10 = hash2(x1, y0);
      const n01 = hash2(x0, y1);
      const n11 = hash2(x1, y1);

      const ix0 = lerp(n00, n10, sx);
      const ix1 = lerp(n01, n11, sx);
      return lerp(ix0, ix1, sy) * 2 - 1;
    }

    function makeBrushSprite(size, roughness, seed) {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const cctx = c.getContext("2d");
      const img = cctx.createImageData(size, size);
      const cx = size / 2;
      const cy = size / 2;
      const baseR = size * 0.46;

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = Math.atan2(dy, dx);
          const wob =
            (vnoise2(Math.cos(a) * 2.4 + seed * 0.01, Math.sin(a) * 2.4 + seed * 0.01) * 0.6 +
              vnoise2(x * 0.09 + seed * 0.02, y * 0.09 + seed * 0.02) * 0.4) *
            roughness;
          const edge = baseR * (1 + wob * 0.36);

          let alpha = 0;
          if (d < edge) {
            const t = Math.max(0, Math.min(1, (edge - d) / (size * 0.16)));
            const grain = (vnoise2(x * 0.11 + 40, y * 0.11 + 40) * 0.5 + 0.5) * 0.32;
            alpha = Math.min(1, t + grain);
          }

          const idx = (y * size + x) * 4;
          img.data[idx] = 255;
          img.data[idx + 1] = 255;
          img.data[idx + 2] = 255;
          img.data[idx + 3] = Math.floor(alpha * 255);
        }
      }

      cctx.putImageData(img, 0, 0);
      return c;
    }

    const brush = makeBrushSprite(cfg.brushSize, cfg.brushRoughness, 20260307);
    const brushBleed = makeBrushSprite(cfg.brushSize, cfg.brushRoughness * 0.78, 20260308);

    function stamp(x, y, radius, rot, alpha, bleedScale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const scale = (radius * 2) / brush.width;
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.drawImage(brush, -brush.width / 2, -brush.height / 2);

      if (bleedScale > 0) {
        ctx.globalAlpha = alpha * cfg.bleedAlpha;
        ctx.scale(bleedScale, bleedScale);
        ctx.drawImage(brushBleed, -brushBleed.width / 2, -brushBleed.height / 2);
      }

      ctx.restore();
    }

    function ringRadiusAt(theta, phase, energy) {
      const n = vnoise2(
        Math.cos(theta) * 1.5 + phase * 0.45,
        Math.sin(theta) * 1.5 + phase * 0.38
      );
      const noiseAmp = lerp(cfg.restNoise, cfg.talkNoise, energy);
      return cfg.radius + n * noiseAmp;
    }

    function ringThicknessAt(theta, phase, energy) {
      const n = vnoise2(
        Math.cos(theta) * 2.2 + phase * 0.6 + 20,
        Math.sin(theta) * 2.2 + phase * 0.5 + 20
      );
      const base = lerp(cfg.restThickness, cfg.talkThickness, energy);
      return Math.max(0.8, base * (1 + n * 0.42));
    }

    function drawRing(energy, phase) {
      for (let s = 0; s < cfg.strands; s += 1) {
        const offset = (s - (cfg.strands - 1) / 2) * cfg.strandOffset;
        const alpha = cfg.strandAlpha * (0.84 + 0.16 * (1 - Math.abs(s - 1) * 0.5));

        let prevX = null;
        let prevY = null;

        for (let i = 0; i <= cfg.points; i += 1) {
          const u = i / cfg.points;
          const theta = u * Math.PI * 2;
          const r = ringRadiusAt(theta, phase, energy) + offset;
          const x = CENTER_X + Math.cos(theta) * r;
          const y = CENTER_Y + Math.sin(theta) * r;
          const thick = ringThicknessAt(theta, phase, energy);

          stamp(x, y, thick, theta + Math.PI * 0.5, alpha, 1.28);

          if (prevX !== null) {
            const dx = x - prevX;
            const dy = y - prevY;
            const dist = Math.hypot(dx, dy);
            const bridgeCount = Math.min(2, Math.floor(dist / Math.max(1, thick * 0.82)));

            for (let k = 1; k < bridgeCount; k += 1) {
              const kk = k / bridgeCount;
              stamp(prevX + dx * kk, prevY + dy * kk, thick * 0.94, theta, alpha * 0.9, 0);
            }
          }

          prevX = x;
          prevY = y;
        }
      }
    }

    function drawSplashes(energy, phase) {
      if (energy < cfg.splashThreshold) {
        return;
      }

      const count = Math.floor(4 + energy * cfg.maxSplashes);

      for (let i = 0; i < count; i += 1) {
        const seed = i * 37.13;
        const wob = vnoise2(seed * 0.2 + phase * 0.8, 0.8 + phase * 0.5);
        const angle =
          i / Math.max(1, count) * Math.PI * 2 +
          phase * 0.95 +
          wob * 0.44;

        const local = Math.abs(vnoise2(seed + 10, phase * 0.4 + 50));
        const startR = cfg.radius + 3 + local * 5.2;
        const len = lerp(cfg.splashLenMin, cfg.splashLenMax, energy) * (0.72 + local * 0.52);

        const x0 = CENTER_X + Math.cos(angle) * startR;
        const y0 = CENTER_Y + Math.sin(angle) * startR;
        const x1 = CENTER_X + Math.cos(angle) * (startR + len);
        const y1 = CENTER_Y + Math.sin(angle) * (startR + len);

        const width = lerp(cfg.splashWidthMin, cfg.splashWidthMax, energy) * (0.7 + local * 0.5);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineCap = "round";
        ctx.lineWidth = width;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        if (local > 0.58 && energy > 0.2) {
          const dotR = startR + len + 1 + local * 8;
          const dx = CENTER_X + Math.cos(angle + wob * 0.2) * dotR;
          const dy = CENTER_Y + Math.sin(angle + wob * 0.2) * dotR;
          const dotSize = 0.8 + energy * 2.8 * (0.5 + local * 0.5);

          ctx.beginPath();
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawListening(dt) {
      const target = clamp01(state.levelRaw);
      const smoothing = target > state.level ? 0.28 : 0.16;
      state.level = lerp(state.level, target, smoothing);

      const energy = Math.max(0, Math.min(1, (state.level - ACTIVE_LEVEL) / (1 - ACTIVE_LEVEL)));
      const idleDrift = 0.00038;
      const talkDrift = 0.0045;

      state.phase += dt * (idleDrift + talkDrift * energy);

      drawRing(energy, state.phase);
      drawSplashes(energy, state.phase);
    }

    function drawLoading(dt) {
      state.spinner += dt * 0.0015;
      state.breath += dt * 0.0028;

      const pulse = 1 + Math.sin(state.breath) * 0.09;
      const turbulence = cfg.loadingNoise + Math.sin(state.spinner * 1.2) * 1.2;

      drawRing(0.2, state.spinner);

      ctx.save();
      ctx.globalAlpha = 0.9;
      const segments = 180;
      ctx.beginPath();
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const a = t * Math.PI * 2;
        const n = vnoise2(Math.cos(a) * 1.6 + state.spinner * 0.9, Math.sin(a) * 1.6 + state.spinner * 0.7);
        const r = cfg.radius * pulse + n * turbulence;
        const x = CENTER_X + Math.cos(a) * r;
        const y = CENTER_Y + Math.sin(a) * r;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    function drawError(dt) {
      state.errorPulse += dt * 0.0052;
      const pulse = 1 + Math.sin(state.errorPulse) * 0.06;

      ctx.save();
      ctx.translate(CENTER_X, CENTER_Y);
      ctx.scale(pulse, pulse);

      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2.8;
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
          state.levelRaw = clamp01(v);
        }
      }
    });

    requestAnimationFrame(render);
  </script>
</body>
</html>`;
