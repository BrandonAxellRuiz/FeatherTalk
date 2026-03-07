import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AudioCaptureError } from "../core/errors.js";
import { resolveRecordingsDirCandidates } from "./appPaths.js";

async function ensureWritableDir() {
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

export class AudioRecorderService {
  #recording = false;
  #levelTimer = null;
  #onLevel = null;

  async startRecording({ onLevel } = {}) {
    if (this.#recording) {
      throw new AudioCaptureError("Recorder already active");
    }

    this.#recording = true;
    this.#onLevel = onLevel ?? null;

    this.#levelTimer = setInterval(() => {
      if (!this.#onLevel) {
        return;
      }

      // Keep a low baseline animation so the widget always feels alive.
      const sample = 0.06 + Math.random() * 0.64;
      this.#onLevel(sample);
    }, 50);
  }

  async stopRecording() {
    if (!this.#recording) {
      throw new AudioCaptureError("Recorder is not active");
    }

    this.#recording = false;

    if (this.#levelTimer) {
      clearInterval(this.#levelTimer);
      this.#levelTimer = null;
    }

    const dir = await ensureWritableDir();

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(dir, `recording-${stamp}.wav`);

    // Placeholder content; replace with real PCM WAV writer on WASAPI integration.
    await writeFile(outputPath, "WAV_PLACEHOLDER_16K_MONO");

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
}
