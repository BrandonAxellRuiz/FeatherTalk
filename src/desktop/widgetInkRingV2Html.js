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
      height: 260px;
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
      height: 260px;
      display: block;
    }
  </style>
</head>
<body>
  <div id="root">
    <div id="blur-core"></div>
    <canvas id="canvas" width="520" height="520"></canvas>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    const root = document.getElementById("root");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    const CENTER_X = 260;
    const CENTER_Y = 260;
    const ACTIVE_LEVEL = 0.045;

    // Tune these first for style:
    // talkNoise, talkThick, blobLenMax, blobBodyMaxWidth, tendrilLenMax, blobsPerSecondAtMax
    const cfg = {
      radius: 62,
      points: 260,

      restNoise: 0.95,
      talkNoise: 15,

      restThick: 2.0,
      talkThick: 4,

      strands: 3,
      strandOffset: 1.0,
      strandAlpha: 7,

      blobsPerSecondAtMax: 3.0,
      blobSpawnThreshold: 0.01,
      blobGateOpen: 0.13,
      blobGateClose: 0.055,
      blobSilenceHoldMs: 110,
      blobLenMin: 12,
      blobLenMax: 18,
      blobBodyMinWidth: 12,
      blobBodyMaxWidth: 20,
      blobDriftSpeed: 38,
      maxActiveBlobs: 12,
      silenceClearMultiplier: 2.8,

      lockBlobSide: false,
      lockedBlobAngle: -1.05,
      blobAngleDrift: 0.42,
      blobSpread: 3.14,

      particleChance: 0.35,
      particleSpeed: 28,
      particleTtl: 0.9,
      particleSizeMin: 1.2,
      particleSizeMax: 3.5,
      maxParticles: 40,

      brushSize: 960,
      brushRoughness: 52,
      bleedAlpha: 0.12,
      loadingNoise: 4.0
    };

    const state = {
      mode: "recording",
      levelRaw: 0,
      level: 0,
      phase: 0,
      spinner: 0,
      breath: 0,
      errorPulse: 0,
      clusterAngle: -1.05,
      blobAccumulator: 0,
      blobs: [],
      particles: [],
      blobGateActive: false,
      blobSilenceMs: 0,
      visible: false,
      lastTs: performance.now()
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
      const base = lerp(cfg.restThick, cfg.talkThick, energy);
      return Math.max(0.9, base * (1 + n * 0.42));
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

    function spawnBlob(energy, phase) {
      const local = Math.random();
      const baseAngle = cfg.lockBlobSide
        ? cfg.lockedBlobAngle
        : state.clusterAngle + Math.sin(phase * 0.7) * 0.35;
      const angle = baseAngle + (Math.random() * 2 - 1) * cfg.blobSpread;

      const blobW = lerp(cfg.blobBodyMinWidth, cfg.blobBodyMaxWidth, energy) * (0.7 + local * 0.3);
      const blobH = lerp(cfg.blobLenMin, cfg.blobLenMax, energy) * (0.7 + local * 0.3);

      state.blobs.push({
        angle,
        local,
        w: blobW,
        h: blobH,
        drift: 0,
        driftSpeed: cfg.blobDriftSpeed * (0.6 + local * 0.5),
        ttl: 0.8 + local * 0.7,
        age: 0,
        particleTimer: 0,
        shapeSeed: Math.random() * 999,
        stretchX: 0.7 + Math.random() * 0.6,
        stretchY: 0.7 + Math.random() * 0.6,
        shapeRot: Math.random() * Math.PI * 2,
        noiseScale: 1.2 + Math.random() * 1.6,
        noiseAmp: 0.2 + Math.random() * 0.25
      });

      if (state.blobs.length > cfg.maxActiveBlobs) {
        state.blobs.splice(0, state.blobs.length - cfg.maxActiveBlobs);
      }
    }

    function spawnParticle(x, y, angle, speed) {
      if (state.particles.length >= cfg.maxParticles) {
        return;
      }
      const spread = (Math.random() - 0.5) * 0.8;
      const dir = angle + spread;
      const spd = speed * (0.5 + Math.random() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(dir) * spd,
        vy: Math.sin(dir) * spd,
        size: lerp(cfg.particleSizeMin, cfg.particleSizeMax, Math.random()),
        ttl: cfg.particleTtl * (0.5 + Math.random() * 0.5),
        age: 0,
        wobSeed: Math.random() * 100
      });
    }

    function updateAndDrawParticles(dtSec, phase) {
      for (let i = state.particles.length - 1; i >= 0; i -= 1) {
        const p = state.particles[i];
        p.age += dtSec;
        if (p.age >= p.ttl) {
          state.particles.splice(i, 1);
          continue;
        }

        const life = 1 - p.age / p.ttl;
        // Slow down + gentle drift
        const drag = 0.97;
        p.vx *= drag;
        p.vy *= drag;
        // Gentle lateral wobble
        const wobF = vnoise2(p.wobSeed + phase * 1.5, p.age * 3) * 12;
        p.x += p.vx * dtSec + wobF * dtSec;
        p.y += p.vy * dtSec + wobF * dtSec * 0.6;

        const alpha = smoothstep(life) * 0.85;
        const r = p.size * (0.6 + 0.4 * life);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawBlob(blob, phase, dtSec) {
      const life = Math.max(0, 1 - blob.age / blob.ttl);
      if (life <= 0) {
        return false;
      }

      // Drift outward over time
      blob.drift += blob.driftSpeed * dtSec;

      // Fade: quick appear, hold, then fade at the end
      const appear = smoothstep(Math.min(1, blob.age / 0.15));
      const fade = life < 0.3 ? smoothstep(life / 0.3) : 1;
      const alpha = appear * fade;
      if (alpha <= 0.01) {
        return true;
      }

      // Angle with gentle wobble
      const wob = vnoise2(blob.local * 9 + phase * 0.5, 3.3 + phase * 0.3);
      const angle = blob.angle + wob * 0.15;

      // Position: starts at ring edge, drifts outward
      const r = cfg.radius + blob.drift;
      const perpA = angle + Math.PI * 0.5;

      // Gentle lateral wobble while drifting
      const latWob = vnoise2(
        blob.local * 5 + phase * 0.4,
        phase * 0.25 + blob.angle * 2
      ) * 8;

      const cx = CENTER_X + Math.cos(angle) * r + Math.cos(perpA) * latWob;
      const cy = CENTER_Y + Math.sin(angle) * r + Math.sin(perpA) * latWob;

      // Organic wobbling shape — unique per blob
      const pts = 40;

      ctx.save();
      ctx.globalAlpha = alpha * 0.88;
      ctx.fillStyle = "rgba(255,255,255,1)";
      ctx.beginPath();

      for (let i = 0; i <= pts; i += 1) {
        const t = i / pts;
        const a = t * Math.PI * 2;

        // Apply per-blob random rotation to the sampling angle
        const sa = a + blob.shapeRot;

        // Multi-octave noise for varied organic shape
        const n1 = vnoise2(
          Math.cos(sa) * blob.noiseScale + blob.shapeSeed,
          Math.sin(sa) * blob.noiseScale + blob.shapeSeed * 0.7 + phase * 0.25
        );
        const n2 = vnoise2(
          Math.cos(sa * 2.3) * blob.noiseScale * 0.6 + blob.shapeSeed * 1.3,
          Math.sin(sa * 2.3) * blob.noiseScale * 0.6 + blob.shapeSeed * 0.4 + phase * 0.15
        );
        const noise = n1 * 0.7 + n2 * 0.3;

        // Per-blob elliptical stretch
        const rx = blob.w * 0.5 * blob.stretchX;
        const ry = blob.h * 0.5 * blob.stretchY;
        const baseR = Math.sqrt(
          (rx * Math.cos(a)) * (rx * Math.cos(a)) +
          (ry * Math.sin(a)) * (ry * Math.sin(a))
        );
        const blobR = baseR * (1 + noise * blob.noiseAmp);

        const px = cx + Math.cos(a) * blobR;
        const py = cy + Math.sin(a) * blobR;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Spawn particles from blob
      blob.particleTimer += dtSec;
      if (blob.particleTimer > 0.08 && alpha > 0.3) {
        blob.particleTimer = 0;
        if (Math.random() < cfg.particleChance * alpha) {
          spawnParticle(cx, cy, angle, cfg.particleSpeed * alpha);
        }
      }

      return true;
    }

    function updateAndDrawBlobs(energy, dtSec, phase) {
      if (energy < cfg.blobSpawnThreshold) {
        // Silence: stop spawning but let existing blobs fade naturally
        state.blobAccumulator = 0;
      } else {
        const spawnRate = cfg.blobsPerSecondAtMax * (0.25 + 0.75 * energy);
        state.blobAccumulator += spawnRate * dtSec;
        const spawnCount = Math.floor(state.blobAccumulator);

        if (spawnCount > 0) {
          state.blobAccumulator -= spawnCount;
          for (let i = 0; i < spawnCount; i += 1) {
            spawnBlob(energy, phase);
          }
        }
      }

      for (let i = state.blobs.length - 1; i >= 0; i -= 1) {
        const blob = state.blobs[i];
        blob.age += dtSec;

        if (!drawBlob(blob, phase, dtSec)) {
          state.blobs.splice(i, 1);
        }
      }
    }

    function drawListening(dt) {
      const dtSec = dt / 1000;
      const target = clamp01(state.levelRaw);

      // Time-based exponential smoothing: slow attack, slower release
      const attackRate = 4.0;  // seconds to ~63% when rising
      const releaseRate = 1.8; // seconds to ~63% when falling
      const rate = target > state.level ? attackRate : releaseRate;
      state.level = lerp(state.level, target, 1 - Math.exp(-rate * dtSec));

      const energy = Math.max(0, Math.min(1, (state.level - ACTIVE_LEVEL) / (1 - ACTIVE_LEVEL)));
      const rawEnergy = Math.max(0, Math.min(1, (state.levelRaw - ACTIVE_LEVEL) / (1 - ACTIVE_LEVEL)));

      if (rawEnergy >= cfg.blobGateOpen) {
        state.blobGateActive = true;
        state.blobSilenceMs = 0;
      } else if (rawEnergy <= cfg.blobGateClose) {
        state.blobSilenceMs += dt;
        if (state.blobSilenceMs >= cfg.blobSilenceHoldMs) {
          state.blobGateActive = false;
        }
      } else {
        state.blobSilenceMs = 0;
      }

      const blobEnergy = state.blobGateActive
        ? Math.max(0, Math.min(1, (rawEnergy - cfg.blobGateClose) / (1 - cfg.blobGateClose)))
        : 0;

      state.phase += dt * (0.00042 + 0.0049 * energy);
      state.clusterAngle += dtSec * (cfg.blobAngleDrift * (cfg.lockBlobSide ? 0.2 : 1));

      drawRing(energy, state.phase);
      updateAndDrawBlobs(blobEnergy, dtSec, state.phase);
      updateAndDrawParticles(dtSec, state.phase);
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
        const n = vnoise2(
          Math.cos(a) * 1.6 + state.spinner * 0.9,
          Math.sin(a) * 1.6 + state.spinner * 0.7
        );
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


