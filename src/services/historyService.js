import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class HistoryService {
  #filePath;
  #retentionDays;
  #ready;

  constructor({ filePath, retentionDays = 7 }) {
    this.#filePath = filePath;
    this.#retentionDays = retentionDays;
    this.#ready = this.#ensureDir();
  }

  async #ensureDir() {
    const dir = path.dirname(this.#filePath);
    await mkdir(dir, { recursive: true });
  }

  async addEntry({ rawText, finalText, mode, elapsedMs, asrSource, timestamp }) {
    await this.#ready;
    const entry = JSON.stringify({
      rawText,
      finalText,
      mode,
      elapsedMs,
      asrSource,
      timestamp: timestamp ?? new Date().toISOString()
    });
    await appendFile(this.#filePath, `${entry}\n`, "utf8");
  }

  async getEntries({ limit = 50 } = {}) {
    await this.#ready;
    let raw;
    try {
      raw = await readFile(this.#filePath, "utf8");
    } catch {
      return [];
    }

    const lines = raw.trim().split("\n").filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }

    return entries.slice(-limit);
  }

  async deleteOlderThan(days) {
    await this.#ready;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const entries = await this.getEntries({ limit: Infinity });
    const kept = entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    const body = kept.map((e) => JSON.stringify(e)).join("\n");
    await writeFile(this.#filePath, body ? `${body}\n` : "", "utf8");
    return entries.length - kept.length;
  }

  async clear() {
    await this.#ready;
    await writeFile(this.#filePath, "", "utf8");
  }

  async cleanup() {
    if (this.#retentionDays > 0) {
      return this.deleteOlderThan(this.#retentionDays);
    }
    return 0;
  }

  async getStats() {
    const entries = await this.getEntries({ limit: Infinity });
    if (entries.length === 0) {
      return { total: 0, modes: {}, avgElapsedMs: 0, totalElapsedMs: 0, mostUsedMode: "Default" };
    }

    const modes = {};
    let totalElapsedMs = 0;
    for (const e of entries) {
      modes[e.mode] = (modes[e.mode] || 0) + 1;
      totalElapsedMs += e.elapsedMs || 0;
    }

    return {
      total: entries.length,
      modes,
      avgElapsedMs: Math.round(totalElapsedMs / entries.length),
      totalElapsedMs,
      mostUsedMode: Object.entries(modes).sort((a, b) => b[1] - a[1])[0]?.[0] || "Default"
    };
  }

  async exportEntries(format = "json") {
    const entries = await this.getEntries({ limit: Infinity });

    if (format === "csv") {
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = "timestamp,mode,rawText,finalText,elapsedMs,asrSource";
      const rows = entries.map(e =>
        [q(e.timestamp), q(e.mode), q(e.rawText), q(e.finalText), q(e.elapsedMs), q(e.asrSource)].join(",")
      );
      return [header, ...rows].join("\n");
    }

    if (format === "txt") {
      return entries.map(e =>
        `[${e.timestamp}] (${e.mode}) ${e.finalText}`
      ).join("\n\n");
    }

    return JSON.stringify(entries, null, 2);
  }

  get filePath() {
    return this.#filePath;
  }
}
