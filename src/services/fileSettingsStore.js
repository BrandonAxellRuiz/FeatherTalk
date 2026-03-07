import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveConfigPath,
  resolveConfigPathCandidates
} from "./appPaths.js";
import { DEFAULT_SETTINGS, SettingsStore } from "./settingsStore.js";

async function readJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

export class FileSettingsStore extends SettingsStore {
  #filePath;

  constructor({ filePath, seed } = {}) {
    super(seed ?? DEFAULT_SETTINGS);
    this.#filePath = filePath ?? resolveConfigPath();
  }

  get filePath() {
    return this.#filePath;
  }

  async load() {
    const candidates = [this.#filePath, ...resolveConfigPathCandidates()].filter(
      (value, index, arr) => arr.indexOf(value) === index
    );

    for (const candidate of candidates) {
      const saved = await readJsonFile(candidate);
      if (saved && typeof saved === "object") {
        this.#filePath = candidate;
        super.update(saved);
        return this.getAll();
      }
    }

    return this.getAll();
  }

  async save() {
    const candidates = [this.#filePath, ...resolveConfigPathCandidates()].filter(
      (value, index, arr) => arr.indexOf(value) === index
    );

    const body = JSON.stringify(this.getAll(), null, 2);
    let lastError;

    for (const candidate of candidates) {
      try {
        const dir = path.dirname(candidate);
        await mkdir(dir, { recursive: true });
        await writeFile(candidate, `${body}\n`, "utf8");
        this.#filePath = candidate;
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  update(patch) {
    const updated = super.update(patch);
    this.save().catch(() => {
      // Non-fatal for runtime; app continues with in-memory settings.
    });
    return updated;
  }
}
