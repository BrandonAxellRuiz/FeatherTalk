import { mkdir } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { AudioCaptureError } from "../core/errors.js";
import { resolveRecordingsDirCandidates } from "./appPaths.js";

const IS_MACOS = process.platform === "darwin";
const MIN_ACTIVE_LEVEL = 0.005;
const ATTACK_SMOOTHING = 0.6;
const RELEASE_SMOOTHING = 0.25;

function nextRecordingPath(recordingsDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(recordingsDir, `recording-${stamp}.wav`);
}

function clampLevel(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function dedupeInputs(entries) {
  const seen = new Set();
  const output = [];

  for (const item of entries) {
    const key = `${item.format}::${item.input}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function normalizeMicId(deviceId) {
  const raw = `${deviceId ?? "default"}`.trim();
  const normalized =
    !raw || raw === "default"
      ? "default"
      : raw.startsWith("audio=")
        ? raw
        : `audio=${raw}`;

  return { raw, normalized };
}

function parseDshowAudioDevices(stderrText) {
  const lines = `${stderrText ?? ""}`.split(/\r?\n/);
  const names = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/directshow audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/directshow video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection || /alternative name/i.test(line)) {
      continue;
    }

    const match = line.match(/"([^"]+)"/);
    if (match && match[1]) {
      names.push(match[1].trim());
    }
  }

  if (names.length === 0) {
    for (const line of lines) {
      const match = line.match(/"([^"]+)"\s*\(audio\)/i);
      if (match && match[1]) {
        names.push(match[1].trim());
      }
    }
  }

  return [...new Set(names)];
}

function parseAvfoundationAudioDevices(stderrText) {
  const lines = `${stderrText ?? ""}`.split(/\r?\n/);
  const devices = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/avfoundation audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/avfoundation video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection) {
      continue;
    }

    const match = line.match(/\[(\d+)]\s+(.+)/);
    if (match) {
      devices.push({ index: match[1], name: match[2].trim() });
    }
  }

  return devices;
}

function buildMacInputCandidates(deviceId, capability = {}) {
  const avfDevices = Array.isArray(capability.avfAudioDevices)
    ? capability.avfAudioDevices
    : [];
  const candidates = [];
  const raw = `${deviceId ?? "default"}`.trim();

  if (!raw || raw === "default") {
    candidates.push({
      format: "avfoundation",
      input: ":default",
      label: "AVFoundation :default"
    });
    candidates.push({
      format: "avfoundation",
      input: ":0",
      label: "AVFoundation :0"
    });

    for (const dev of avfDevices) {
      candidates.push({
        format: "avfoundation",
        input: `:${dev.index}`,
        label: `AVFoundation :${dev.index} (${dev.name})`
      });
    }
  } else {
    const input = raw.startsWith(":") ? raw : `:${raw}`;
    candidates.push({
      format: "avfoundation",
      input,
      label: `AVFoundation ${input}`
    });
    candidates.push({
      format: "avfoundation",
      input: ":default",
      label: "AVFoundation :default"
    });
    candidates.push({
      format: "avfoundation",
      input: ":0",
      label: "AVFoundation :0"
    });
  }

  return dedupeInputs(candidates);
}

function buildInputCandidates(
  deviceId,
  allowDshowFallback = true,
  capability = {}
) {
  if (IS_MACOS) {
    return buildMacInputCandidates(deviceId, capability);
  }

  const { raw, normalized } = normalizeMicId(deviceId);
  const supportsWasapi = capability.supportsWasapi !== false;
  const dshowAudioDevices = Array.isArray(capability.dshowAudioDevices)
    ? capability.dshowAudioDevices
    : [];

  const wasapiCandidates = supportsWasapi
    ? normalized === "default"
      ? [
          { format: "wasapi", input: "default", label: "WASAPI default" },
          {
            format: "wasapi",
            input: "audio=default",
            label: "WASAPI audio=default"
          }
        ]
      : [
          {
            format: "wasapi",
            input: normalized,
            label: `WASAPI ${normalized}`
          },
          { format: "wasapi", input: raw, label: `WASAPI ${raw}` }
        ]
    : [];

  const dshowInputs = [];
  if (allowDshowFallback) {
    if (normalized === "default") {
      if (dshowAudioDevices.length > 0) {
        for (const deviceName of dshowAudioDevices) {
          dshowInputs.push(`audio=${deviceName}`);
        }
      }
      dshowInputs.push("audio=default");
    } else {
      dshowInputs.push(normalized);
      if (raw !== normalized) {
        dshowInputs.push(raw);
      }
    }
  }

  const fallbackCandidates = dshowInputs.map((input) => ({
    format: "dshow",
    input,
    label: `DSHOW ${input}`
  }));

  return dedupeInputs([...wasapiCandidates, ...fallbackCandidates]);
}

async function runFfmpegProbe(ffmpegPath, args, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    let settled = false;
    const done = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
      done({ ok: false, stdout, stderr });
    }, timeoutMs);

    proc.once("error", (error) => {
      clearTimeout(timer);
      done({
        ok: false,
        stdout,
        stderr: `${stderr}\n${error.message}`
      });
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function detectFfmpegCaptureCapability(ffmpegPath) {
  if (IS_MACOS) {
    const avfProbe = await runFfmpegProbe(ffmpegPath, [
      "-hide_banner",
      "-list_devices",
      "true",
      "-f",
      "avfoundation",
      "-i",
      ""
    ]);

    const avfText = `${avfProbe.stderr ?? ""}\n${avfProbe.stdout ?? ""}`;
    const supportsAvfoundation = !avfText
      .toLowerCase()
      .includes("unknown input format");
    const avfAudioDevices = parseAvfoundationAudioDevices(avfText);

    return {
      supportsWasapi: false,
      dshowAudioDevices: [],
      supportsAvfoundation,
      avfAudioDevices
    };
  }

  const wasapiProbe = await runFfmpegProbe(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "wasapi",
    "-i",
    "dummy"
  ]);

  const wasapiProbeText =
    `${wasapiProbe.stderr ?? ""}\n${wasapiProbe.stdout ?? ""}`.toLowerCase();
  const supportsWasapi =
    !wasapiProbeText.includes("unknown input format: 'wasapi'") &&
    !wasapiProbeText.includes('unknown input format "wasapi"') &&
    !(
      wasapiProbeText.includes("unknown input format") &&
      wasapiProbeText.includes("wasapi")
    );

  const dshowProbe = await runFfmpegProbe(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "dshow",
    "-i",
    "dummy"
  ]);

  const dshowProbeText = `${dshowProbe.stderr ?? ""}\n${dshowProbe.stdout ?? ""}`;
  const dshowAudioDevices = parseDshowAudioDevices(dshowProbeText);

  return {
    supportsWasapi,
    dshowAudioDevices
  };
}

async function ensureRecordingsDir() {
  const errors = [];

  for (const dir of resolveRecordingsDirCandidates()) {
    try {
      await mkdir(dir, { recursive: true });
      return dir;
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new AudioCaptureError(
    `Unable to create recordings directory: ${errors.join(" | ")}`
  );
}

function buildCaptureArgs({ format, input, outputPath }) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    format,
    "-i",
    input,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-y",
    outputPath
  ];
}

function buildMeterArgs({ format, input }) {
  return [
    "-hide_banner",
    "-nostats",
    "-loglevel",
    "error",
    "-f",
    format,
    "-i",
    input,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "wav",
    "-"
  ];
}

async function spawnCapture(ffmpegPath, candidate, outputPath) {
  const args = buildCaptureArgs({
    format: candidate.format,
    input: candidate.input,
    outputPath
  });

  const proc = spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"]
  });

  let startupError = "";
  proc.stderr.on("data", (chunk) => {
    startupError += String(chunk);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve();
    }, 300);

    proc.once("error", (error) => {
      clearTimeout(timer);
      reject(
        new AudioCaptureError(
          `ffmpeg failed (${candidate.label}): ${error.message}`
        )
      );
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new AudioCaptureError(
          `ffmpeg exited early (${candidate.label}, code ${code}). ${startupError}`
        )
      );
    });
  });

  return proc;
}

function spawnLevelMeter(ffmpegPath, candidate, onLevel, logger = null) {
  const args = buildMeterArgs({
    format: candidate.format,
    input: candidate.input
  });

  const proc = spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const bytesPerSample = 2;
  const sampleRate = 16000;
  const sampleWindowMs = 60;
  const samplesPerWindow = Math.max(
    128,
    Math.floor((sampleRate * sampleWindowMs) / 1000)
  );
  const bytesPerWindow = samplesPerWindow * bytesPerSample;

  let meterBuffer = Buffer.alloc(0);
  let wavHeaderBuffer = Buffer.alloc(0);
  let awaitingWavHeader = true;
  let gotSample = false;
  let lastSampleAt = Date.now();
  let noiseFloor = 0.003;

  const emitLevel = (value) => {
    try {
      onLevel(value);
    } catch {
      // Ignore callback failures.
    }
  };

  const rmsToLevel = (rms, floor) => {
    if (!Number.isFinite(rms) || rms <= 0) {
      return 0;
    }

    const headroom = rms - floor;
    if (headroom <= 0.0008) {
      return 0;
    }

    // High-gain mapping because some ffmpeg/device combos deliver very low amplitudes.
    return Math.pow(Math.min(1, headroom * 110), 0.7);
  };

  const emitFromPcm = (buffer) => {
    const samples = Math.floor(buffer.length / bytesPerSample);
    if (samples <= 0) {
      return;
    }

    let sumSquares = 0;
    for (let offset = 0; offset + 1 < buffer.length; offset += bytesPerSample) {
      const sample = buffer.readInt16LE(offset) / 32768;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);
    const floorLerp = rms < noiseFloor ? 0.1 : 0.004;
    noiseFloor += (rms - noiseFloor) * floorLerp;

    if (noiseFloor < 0.0006) {
      noiseFloor = 0.0006;
    } else if (noiseFloor > 0.05) {
      noiseFloor = 0.05;
    }

    gotSample = true;
    lastSampleAt = Date.now();
    emitLevel(rmsToLevel(rms, noiseFloor));
  };

  const feedAudioBytes = (chunk) => {
    meterBuffer =
      meterBuffer.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([meterBuffer, chunk]);

    while (meterBuffer.length >= bytesPerWindow) {
      emitFromPcm(meterBuffer.subarray(0, bytesPerWindow));
      meterBuffer = meterBuffer.subarray(bytesPerWindow);
    }
  };

  const tryConsumeWavHeader = (chunk) => {
    wavHeaderBuffer =
      wavHeaderBuffer.length === 0
        ? Buffer.from(chunk)
        : Buffer.concat([wavHeaderBuffer, chunk]);

    if (wavHeaderBuffer.length < 44) {
      return;
    }

    let dataStart = 44;
    const dataIndex = wavHeaderBuffer.indexOf(Buffer.from("data"));
    if (dataIndex >= 0 && wavHeaderBuffer.length >= dataIndex + 8) {
      dataStart = dataIndex + 8;
    }

    const riff = wavHeaderBuffer.toString("ascii", 0, 4);
    const wave = wavHeaderBuffer.toString("ascii", 8, 12);
    if (riff !== "RIFF" || wave !== "WAVE") {
      // Fallback: treat output as raw PCM if header is not standard WAV.
      dataStart = 0;
    }

    awaitingWavHeader = false;
    const payload = wavHeaderBuffer.subarray(dataStart);
    wavHeaderBuffer = Buffer.alloc(0);
    if (payload.length > 0) {
      feedAudioBytes(payload);
    }
  };

  const watchdog = setInterval(() => {
    if (Date.now() - lastSampleAt > 350) {
      emitLevel(0);
    }
  }, 140);

  proc.stdout.on("data", (chunk) => {
    if (awaitingWavHeader) {
      tryConsumeWavHeader(chunk);
      return;
    }

    feedAudioBytes(chunk);
  });

  proc.stdout.on("error", (error) => {
    if (logger) {
      logger.warn("Audio level meter stdout error", {
        error: error?.message ?? String(error)
      });
    }
  });

  proc.stderr.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (!text || !logger) {
      return;
    }

    logger.warn("Audio level meter stderr", { text });
  });

  proc.stderr.on("error", (error) => {
    if (logger) {
      logger.warn("Audio level meter stderr stream error", {
        error: error?.message ?? String(error)
      });
    }
  });

  proc.on("exit", (code) => {
    clearInterval(watchdog);
    emitLevel(0);

    if (logger) {
      logger.debug("Audio level meter exited", {
        code,
        gotSample,
        input: candidate.input,
        format: candidate.format
      });
    }
  });

  return proc;
}

async function stopChildProcess(proc, { timeoutMs = 2000, strict = true } = {}) {
  const exitPromise = once(proc, "exit").then(([code]) => code);
  const timeoutToken = Symbol("timeout");

  try {
    proc.stdin.end("q\n");
  } catch {
    // ignore
  }

  let code = await Promise.race([
    exitPromise,
    new Promise((resolve) => {
      setTimeout(() => resolve(timeoutToken), timeoutMs);
    })
  ]);

  if (code === timeoutToken) {
    try {
      proc.kill();
    } catch {
      // ignore
    }

    code = await Promise.race([
      exitPromise,
      new Promise((resolve) => {
        setTimeout(() => resolve(timeoutToken), 1200);
      })
    ]);
  }

  if (code === timeoutToken) {
    if (strict) {
      throw new AudioCaptureError("Timed out stopping ffmpeg capture");
    }

    return null;
  }

  if (strict && code !== 0 && code !== null) {
    throw new AudioCaptureError(`ffmpeg stopped with code ${code}`);
  }

  return code;
}

function explainMicFailure(message) {
  const text = `${message}`.toLowerCase();

  if (text.includes("enoent") || text.includes("not found")) {
    return IS_MACOS
      ? "ffmpeg no esta disponible en PATH. Instala con: brew install ffmpeg"
      : "ffmpeg no esta disponible en PATH. Instala ffmpeg o configura settings.ffmpegPath.";
  }

  if (text.includes("permission") || text.includes("acceso denegado")) {
    return IS_MACOS
      ? "macOS bloqueo acceso al microfono. Ve a Ajustes del Sistema > Privacidad > Microfono."
      : "Windows bloqueo acceso al microfono. Revisa Privacy > Microphone para permitir la app.";
  }

  if (text.includes("unknown input format")) {
    return IS_MACOS
      ? "El ffmpeg configurado no soporta avfoundation. Instala con: brew install ffmpeg"
      : "El ffmpeg configurado no soporta WASAPI. Usa DSHOW con microphoneDeviceId explicito o cambia ffmpegPath.";
  }

  if (text.includes("no such") || text.includes("cannot find") || text.includes("device")) {
    return "No se encontro el dispositivo de microfono. Ajusta settings.microphoneDeviceId o corre npm run diagnose:mic.";
  }

  return "Ejecuta npm run diagnose:mic para ver detalle de ffmpeg y dispositivos.";
}

export class WindowsWasapiRecorderService {
  #ffmpegPath;
  #deviceId;
  #allowDshowFallback;
  #recording = false;
  #proc = null;
  #meterProc = null;
  #outputPath = null;
  #onLevel = null;
  #activeInputLabel = null;
  #smoothedLevel = 0;
  #capability = null;
  #logger = null;

  constructor({
    ffmpegPath = "ffmpeg",
    microphoneDeviceId = "default",
    allowDshowFallback = true,
    logger = null
  } = {}) {
    this.#ffmpegPath = ffmpegPath;
    this.#deviceId = microphoneDeviceId;
    this.#allowDshowFallback = allowDshowFallback;
    this.#logger = logger;
  }

  async #getCapability() {
    if (this.#capability) {
      return this.#capability;
    }

    try {
      this.#capability = await detectFfmpegCaptureCapability(this.#ffmpegPath);
    } catch {
      this.#capability = {
        supportsWasapi: true,
        dshowAudioDevices: []
      };
    }

    return this.#capability;
  }

  #emitLevelSample(sample) {
    if (!this.#onLevel) {
      return;
    }

    const target = clampLevel(sample);
    const factor =
      target > this.#smoothedLevel ? ATTACK_SMOOTHING : RELEASE_SMOOTHING;

    this.#smoothedLevel += (target - this.#smoothedLevel) * factor;
    if (this.#smoothedLevel < MIN_ACTIVE_LEVEL) {
      this.#smoothedLevel = 0;
    }

    this.#onLevel(this.#smoothedLevel);
  }

  async startRecording({ onLevel } = {}) {
    if (this.#recording) {
      throw new AudioCaptureError("Recorder already active");
    }

    const recordingsDir = await ensureRecordingsDir();
    const outputPath = nextRecordingPath(recordingsDir);
    const capability = await this.#getCapability();
    const candidates = buildInputCandidates(
      this.#deviceId,
      this.#allowDshowFallback,
      capability
    );

    const failures = [];
    let proc = null;
    let meterProc = null;

    for (const candidate of candidates) {
      try {
        proc = await spawnCapture(this.#ffmpegPath, candidate, outputPath);
        this.#activeInputLabel = candidate.label;

        if (typeof onLevel === "function") {
          try {
            meterProc = spawnLevelMeter(this.#ffmpegPath, candidate, (level) => {
              this.#emitLevelSample(level);
            }, this.#logger);

            if (this.#logger) {
              this.#logger.debug("Audio level meter started", {
                input: candidate.input,
                format: candidate.format
              });
            }
          } catch (error) {
            meterProc = null;
            if (this.#logger) {
              this.#logger.warn("Audio level meter failed to start", {
                input: candidate.input,
                format: candidate.format,
                error: error?.message ?? String(error)
              });
            }
          }
        }

        break;
      } catch (error) {
        failures.push(error.message);
      }
    }

    if (!proc) {
      const reason = failures.join(" | ");
      const hint = explainMicFailure(reason);
      throw new AudioCaptureError(
        `No se pudo iniciar microfono. ${hint} Details: ${reason}`
      );
    }

    this.#recording = true;
    this.#proc = proc;
    this.#meterProc = meterProc;
    this.#outputPath = outputPath;
    this.#onLevel = onLevel ?? null;
    this.#smoothedLevel = 0;

    if (this.#onLevel) {
      this.#onLevel(0);
    }

    return {
      audioPath: outputPath,
      inputLabel: this.#activeInputLabel
    };
  }

  async stopRecording() {
    if (!this.#recording || !this.#proc || !this.#outputPath) {
      throw new AudioCaptureError("Recorder is not active");
    }

    this.#recording = false;

    if (this.#onLevel) {
      this.#onLevel(0);
    }

    const proc = this.#proc;
    const meterProc = this.#meterProc;
    const outputPath = this.#outputPath;

    this.#proc = null;
    this.#meterProc = null;
    this.#outputPath = null;
    this.#onLevel = null;
    this.#smoothedLevel = 0;

    if (meterProc) {
      await stopChildProcess(meterProc, { timeoutMs: 1200, strict: false }).catch(
        () => {}
      );
    }

    await stopChildProcess(proc, { timeoutMs: 2200, strict: true });

    return {
      audioPath: outputPath,
      sampleRateHz: 16000,
      channels: 1,
      format: "wav"
    };
  }

  get isRecording() {
    return this.#recording;
  }

  get activeInputLabel() {
    return this.#activeInputLabel;
  }
}

export { buildInputCandidates };
