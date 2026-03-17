import test from "node:test";
import assert from "node:assert/strict";
import { HealthCheckService } from "../src/services/healthCheckService.js";

test("health check reports ok when both services respond", async () => {
  const service = new HealthCheckService({
    asrEndpoint: "http://127.0.0.1:8787/transcribe",
    llamaBackend: "ollama",
    llamaBaseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => ({ ok: true, status: 200 })
  });

  const result = await service.checkAll();
  assert.equal(result.asr.ok, true);
  assert.equal(result.llama.ok, true);
});

test("health check reports failure when fetch throws", async () => {
  const service = new HealthCheckService({
    asrEndpoint: "http://127.0.0.1:8787/transcribe",
    llamaBackend: "ollama",
    llamaBaseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => { throw new Error("connection refused"); }
  });

  const result = await service.checkAll();
  assert.equal(result.asr.ok, false);
  assert.match(result.asr.error, /connection refused/);
  assert.equal(result.llama.ok, false);
});

test("health check reports failure when endpoint not configured", async () => {
  const service = new HealthCheckService({
    fetchImpl: async () => ({ ok: true })
  });

  const result = await service.checkAll();
  assert.equal(result.asr.ok, false);
  assert.match(result.asr.error, /not configured/);
  assert.equal(result.llama.ok, false);
});

test("health check uses /health for llama.cpp backend", async () => {
  const urls = [];
  const service = new HealthCheckService({
    asrEndpoint: "http://asr:8787/transcribe",
    llamaBackend: "llama.cpp",
    llamaBaseUrl: "http://127.0.0.1:8080",
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true };
    }
  });

  await service.checkAll();
  assert.equal(urls.some((u) => u.includes("/health")), true);
  assert.equal(urls.some((u) => u.includes("/api/tags")), false);
});
