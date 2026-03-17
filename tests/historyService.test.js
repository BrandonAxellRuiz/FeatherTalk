import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HistoryService } from "../src/services/historyService.js";

async function createTempHistory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-history-"));
  const filePath = path.join(dir, "history.jsonl");
  const service = new HistoryService({ filePath, retentionDays: 7 });
  return {
    service,
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

test("history: add and retrieve entries", async () => {
  const { service, cleanup } = await createTempHistory();

  try {
    await service.addEntry({
      rawText: "hola mundo",
      finalText: "Hola mundo.",
      mode: "Default",
      elapsedMs: 1500,
      asrSource: "parakeet-http",
      timestamp: "2026-03-15T10:00:00.000Z"
    });

    await service.addEntry({
      rawText: "segunda prueba",
      finalText: "Segunda prueba.",
      mode: "Email",
      elapsedMs: 2000,
      asrSource: "parakeet-http",
      timestamp: "2026-03-15T10:01:00.000Z"
    });

    const entries = await service.getEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].finalText, "Hola mundo.");
    assert.equal(entries[1].mode, "Email");
  } finally {
    await cleanup();
  }
});

test("history: limit returns last N entries", async () => {
  const { service, cleanup } = await createTempHistory();

  try {
    for (let i = 0; i < 5; i++) {
      await service.addEntry({
        rawText: `entry ${i}`,
        finalText: `Entry ${i}.`,
        mode: "Default",
        elapsedMs: 1000,
        asrSource: "test",
        timestamp: new Date(Date.now() + i * 60000).toISOString()
      });
    }

    const entries = await service.getEntries({ limit: 2 });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].rawText, "entry 3");
    assert.equal(entries[1].rawText, "entry 4");
  } finally {
    await cleanup();
  }
});

test("history: deleteOlderThan removes old entries", async () => {
  const { service, cleanup } = await createTempHistory();

  try {
    await service.addEntry({
      rawText: "old",
      finalText: "Old.",
      mode: "Default",
      elapsedMs: 1000,
      asrSource: "test",
      timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    await service.addEntry({
      rawText: "recent",
      finalText: "Recent.",
      mode: "Default",
      elapsedMs: 1000,
      asrSource: "test",
      timestamp: new Date().toISOString()
    });

    const removed = await service.deleteOlderThan(7);
    assert.equal(removed, 1);

    const entries = await service.getEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].rawText, "recent");
  } finally {
    await cleanup();
  }
});

test("history: clear removes all entries", async () => {
  const { service, cleanup } = await createTempHistory();

  try {
    await service.addEntry({
      rawText: "test",
      finalText: "Test.",
      mode: "Default",
      elapsedMs: 1000,
      asrSource: "test"
    });

    await service.clear();
    const entries = await service.getEntries();
    assert.equal(entries.length, 0);
  } finally {
    await cleanup();
  }
});

test("history: getEntries on empty file returns empty array", async () => {
  const { service, cleanup } = await createTempHistory();

  try {
    const entries = await service.getEntries();
    assert.equal(entries.length, 0);
  } finally {
    await cleanup();
  }
});
