import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DictationPipeline } from "../src/core/dictationPipeline.js";
import { LlamaCleanupError } from "../src/core/errors.js";
import { FeatherTalkStateMachine, STATES } from "../src/core/stateMachine.js";
import { FeatherTalkAppController } from "../src/controllers/featherTalkAppController.js";
import {
  buildHotkeyCandidates,
  DEFAULT_HOTKEY_FALLBACKS
} from "../src/desktop/hotkeyCandidates.js";
import { AsrWorkerClient } from "../src/services/asrWorkerClient.js";
import { BeepService } from "../src/services/beepService.js";
import { HealthCheckService } from "../src/services/healthCheckService.js";
import { HistoryService } from "../src/services/historyService.js";
import { HotkeyService } from "../src/services/hotkeyService.js";
import { PreviewService } from "../src/services/previewService.js";
import { SettingsStore } from "../src/services/settingsStore.js";
import { ToastNotifier } from "../src/services/toastNotifier.js";
import { TrayIconService, TRAY_STATES } from "../src/services/trayIconService.js";
import { WidgetOverlayService } from "../src/services/widgetOverlayService.js";
import { buildInputCandidates } from "../src/services/windowsWasapiRecorderService.js";

const tests = [];

function addTest(name, fn) {
  tests.push({ name, fn });
}

function immediateDelay() {
  return Promise.resolve();
}

async function createTinyWavFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-test-"));
  const filePath = path.join(dir, "sample.wav");
  const dataSize = 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  buffer.writeInt16LE(0, 44);

  await writeFile(filePath, buffer);

  return {
    filePath,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function createMockChildProcess() {
  const handlers = new Map();
  return {
    unrefCalled: false,
    once(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      const handler = handlers.get(event);
      if (!handler) {
        return;
      }

      handlers.delete(event);
      handler(payload);
    },
    unref() {
      this.unrefCalled = true;
    }
  };
}

addTest("buildHotkeyCandidates deprioritizes Alt and removes duplicates", () => {
  const list = buildHotkeyCandidates("Ctrl+Win+Space", [
    "Ctrl+Alt+Space",
    "Ctrl+Win+Space",
    "Ctrl+Space"
  ]);

  assert.deepEqual(list, ["Ctrl+Win+Space", "Ctrl+Space", "Ctrl+Alt+Space"]);
});

addTest("default hotkey fallbacks are available", () => {
  assert.deepEqual(DEFAULT_HOTKEY_FALLBACKS, [
    "Ctrl+Shift+Space",
    "Ctrl+Alt+Space",
    "Ctrl+Space"
  ]);
});

addTest("buildInputCandidates includes WASAPI and optional DSHOW fallback", () => {
  const list = buildInputCandidates("default", true).map((item) => item.label);

  if (process.platform === "darwin") {
    assert.deepEqual(list, [
      "AVFoundation :default",
      "AVFoundation :0"
    ]);
  } else {
    assert.deepEqual(list, [
      "WASAPI default",
      "WASAPI audio=default",
      "DSHOW audio=default"
    ]);
  }
});

addTest("buildInputCandidates can disable DSHOW fallback", () => {
  const list = buildInputCandidates("default", false);

  if (process.platform === "darwin") {
    assert.equal(list.every((item) => item.format === "avfoundation"), true);
  } else {
    assert.equal(list.some((item) => item.format === "dshow"), false);
  }
});

addTest("ASR client uses fallback when HTTP endpoint fails", async () => {
  const fixture = await createTinyWavFixture();

  try {
    const client = new AsrWorkerClient({
      endpoint: "http://127.0.0.1:8787/transcribe",
      fetchImpl: async () => {
        throw new Error("fetch failed");
      },
      fallbackClient: {
        async transcribe() {
          return {
            raw_text: "fallback transcript",
            source: "asr-fallback"
          };
        }
      },
      retries: 0
    });

    const result = await client.transcribe({ audioPath: fixture.filePath });
    assert.equal(result.raw_text, "fallback transcript");
    assert.equal(result.source, "asr-fallback");
    assert.match(result.warning, /using windows speech fallback/i);
  } finally {
    await fixture.cleanup();
  }
});

addTest("ASR client uses fallback when endpoint is not configured", async () => {
  const client = new AsrWorkerClient({
    endpoint: null,
    fallbackClient: {
      async transcribe() {
        return {
          raw_text: "fallback without endpoint",
          source: "asr-fallback"
        };
      }
    }
  });

  const result = await client.transcribe({ audioPath: "C:/tmp/test.wav" });
  assert.equal(result.raw_text, "fallback without endpoint");
  assert.equal(result.source, "asr-fallback");
  assert.match(result.warning, /endpoint not configured/i);
});
addTest("ASR client surfaces endpoint details when no fallback is available", async () => {
  const fixture = await createTinyWavFixture();

  try {
    const client = new AsrWorkerClient({
      endpoint: "http://127.0.0.1:8787/transcribe",
      fetchImpl: async () => {
        throw new Error("fetch failed");
      },
      retries: 0
    });

    await assert.rejects(
      () => client.transcribe({ audioPath: fixture.filePath }),
      /ASR request failed at http:\/\/127\.0\.0\.1:8787\/transcribe/i
    );
  } finally {
    await fixture.cleanup();
  }
});

addTest("ASR client retries language hints when auto transcript is empty", async () => {
  const fixture = await createTinyWavFixture();

  let fallbackCalled = false;
  const seenLanguages = [];

  try {
    const client = new AsrWorkerClient({
      endpoint: "http://127.0.0.1:8787/transcribe",
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        seenLanguages.push(body.language);

        if (body.language === "auto") {
          return {
            ok: true,
            async json() {
              return { raw_text: "" };
            }
          };
        }

        if (body.language === "es") {
          return {
            ok: true,
            async json() {
              return { raw_text: "hola mundo", elapsed_ms: 111 };
            }
          };
        }

        return {
          ok: true,
          async json() {
            return { raw_text: "should-not-be-used" };
          }
        };
      },
      fallbackClient: {
        async transcribe() {
          fallbackCalled = true;
          return { raw_text: "fallback" };
        }
      },
      retries: 0
    });

    const result = await client.transcribe({
      audioPath: fixture.filePath,
      language: "auto"
    });

    assert.equal(result.raw_text, "hola mundo");
    assert.equal(result.source, "parakeet-http");
    assert.equal(fallbackCalled, false);
    assert.deepEqual(seenLanguages, ["auto", "es"]);
  } finally {
    await fixture.cleanup();
  }
});
addTest("ASR client prefers Spanish hint when auto looks English-biased", async () => {
  const fixture = await createTinyWavFixture();

  try {
    const client = new AsrWorkerClient({
      endpoint: "http://127.0.0.1:8787/transcribe",
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);

        if (body.language === "auto") {
          return {
            ok: true,
            async json() {
              return {
                raw_text:
                  "what happens is that when I start speaking en espanol the model mixes words"
              };
            }
          };
        }

        if (body.language === "es") {
          return {
            ok: true,
            async json() {
              return {
                raw_text:
                  "lo que pasa es que cuando empiezo a hablar en espanol el modelo mezcla palabras"
              };
            }
          };
        }

        throw new Error("unexpected language");
      },
      retries: 0
    });

    const result = await client.transcribe({
      audioPath: fixture.filePath,
      language: "auto"
    });

    assert.equal(result.language_used, "es");
    assert.match(result.raw_text, /cuando empiezo a hablar en espanol/i);
  } finally {
    await fixture.cleanup();
  }
});
addTest("Llama client handles missing ollama command", async () => {
  const { LlamaCleanupClient } = await import("../src/services/llamaCleanupClient.js");

  let spawnCount = 0;
  const client = new LlamaCleanupClient({
    backend: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.1:8b",
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
    spawnImpl: () => {
      spawnCount += 1;
      const error = new Error("spawn ollama ENOENT");
      error.code = "ENOENT";
      throw error;
    },
    httpRetries: 0,
    autoStartOllama: true
  });

  await assert.rejects(
    () => client.cleanText({ rawText: "hola" }),
    /Ollama cleanup failed at http:\/\/127\.0\.0\.1:11434/i
  );

  assert.equal(spawnCount, 1);
});

addTest("Llama client retries after auto-start attempt", async () => {
  const { LlamaCleanupClient } = await import("../src/services/llamaCleanupClient.js");

  let fetchCount = 0;
  let proc = null;

  const client = new LlamaCleanupClient({
    backend: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.1:8b",
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        throw new Error("fetch failed");
      }

      return {
        ok: true,
        async json() {
          return { response: "Texto limpio." };
        }
      };
    },
    spawnImpl: () => {
      proc = createMockChildProcess();
      return proc;
    },
    httpRetries: 1,
    retryDelayMs: 0,
    autoStartOllama: true
  });

  const output = await client.cleanText({ rawText: "texto crudo" });

  assert.equal(output, "texto crudo");
  assert.equal(fetchCount, 2);
  assert.equal(proc.unrefCalled, true);
});
addTest("Llama client strips leaked reasoning text from cleanup output", async () => {
  const { LlamaCleanupClient } = await import("../src/services/llamaCleanupClient.js");

  const client = new LlamaCleanupClient({
    cleaner: async () =>
      [
        "Hola, esto es una prueba para ver que tal se escucha.",
        "",
        'Removed filler words: "", "I tr I"',
        "",
        "I removed the following:",
        '* ""',
        '* ""'
      ].join("\n")
  });

  const output = await client.cleanText({
    rawText: "Hola, esto es una prueba para ver que tal se escucha"
  });

  assert.equal(output, "Hola, esto es una prueba para ver que tal se escucha.");
});
addTest("FSM happy-path transitions", () => {
  const transitions = [];
  const fsm = new FeatherTalkStateMachine((event) => transitions.push(event));

  fsm.transition(STATES.RECORDING);
  fsm.transition(STATES.PROCESSING_ASR);
  fsm.transition(STATES.PROCESSING_LLAMA);
  fsm.transition(STATES.PASTING);
  fsm.transition(STATES.DONE);
  fsm.transition(STATES.IDLE);

  assert.equal(fsm.state, STATES.IDLE);
  assert.equal(transitions.length, 6);
});

addTest("FSM rejects invalid transition", () => {
  const fsm = new FeatherTalkStateMachine();
  assert.throws(() => fsm.transition(STATES.PROCESSING_ASR), /Invalid transition/);
});

addTest("Pipeline order ASR -> Llama -> Paste", async () => {
  const order = [];

  const pipeline = new DictationPipeline({
    asrClient: {
      async transcribe() {
        order.push("asr");
        return { raw_text: "hola mundo", source: "parakeet-http" };
      }
    },
    llamaClient: {
      async cleanText() {
        order.push("llama");
        return "Hola mundo.";
      }
    },
    pasteController: {
      async pasteText() {
        order.push("paste");
        return { pasted: true, copied_to_clipboard: false };
      }
    }
  });

  const stageOrder = [];
  const result = await pipeline.processRecording({
    audioPath: "C:/tmp/test.wav",
    onStage: (stage) => stageOrder.push(stage)
  });

  assert.equal(result.finalText, "Hola mundo.");
  assert.equal(result.asrSource, "parakeet-http");
  assert.deepEqual(order, ["asr", "llama", "paste"]);
  assert.deepEqual(stageOrder, ["asr", "llama", "paste"]);
});

addTest("Pipeline blocks paste if Llama fails", async () => {
  let pasteCount = 0;

  const pipeline = new DictationPipeline({
    asrClient: {
      async transcribe() {
        return { raw_text: "texto" };
      }
    },
    llamaClient: {
      async cleanText() {
        throw new Error("llama offline");
      }
    },
    pasteController: {
      async pasteText() {
        pasteCount += 1;
        return { pasted: true, copied_to_clipboard: false };
      }
    }
  });

  await assert.rejects(
    () => pipeline.processRecording({ audioPath: "C:/tmp/test.wav" }),
    (error) => error instanceof LlamaCleanupError
  );

  assert.equal(pasteCount, 0);
});

addTest("Controller: start/stop toggles and pastes final text", async () => {
  let pastedText = null;

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording({ onLevel }) {
        onLevel(0.4);
      },
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return { raw_text: "hola mundo" };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Hola mundo.";
      }
    },
    pasteController: {
      async pasteText(text) {
        pastedText = text;
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const result = await hotkey.trigger();

  assert.equal(result.pasted, true);
  assert.equal(pastedText, "Hola mundo.");
  assert.equal(controller.state, STATES.IDLE);
});

addTest("Controller: processing ignores additional toggle", async () => {
  let continueAsr;

  const asrWait = new Promise((resolve) => {
    continueAsr = resolve;
  });

  const widget = new WidgetOverlayService();
  const tray = new TrayIconService();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        await asrWait;
        return { raw_text: "texto" };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Texto.";
      }
    },
    pasteController: {
      async pasteText() {
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget,
    tray,
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const processingPromise = hotkey.trigger();

  const ignored = await hotkey.trigger();
  assert.equal(ignored.ignored, true);
  assert.equal(ignored.state, STATES.PROCESSING_ASR);

  continueAsr();
  await processingPromise;

  assert.equal(controller.state, STATES.IDLE);
  assert.equal(widget.visible, false);
  assert.equal(tray.state, TRAY_STATES.NEUTRAL);
});

addTest("Controller: exposes ASR fallback warning as toast", async () => {
  const toast = new ToastNotifier();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return {
          raw_text: "texto",
          source: "asr-fallback",
          warning: "ASR worker unavailable at x. Using Windows speech fallback."
        };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Texto.";
      }
    },
    pasteController: {
      async pasteText() {
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();

  assert.equal(toast.events.some((event) => /windows speech fallback/i.test(event.message)), true);
});

addTest("Controller: Llama failure returns error and no autopaste", async () => {
  let pasteCount = 0;
  const toast = new ToastNotifier();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return { raw_text: "texto" };
      }
    },
    llamaClient: {
      async cleanText() {
        throw new Error("llama offline");
      }
    },
    pasteController: {
      async pasteText() {
        pasteCount += 1;
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const result = await hotkey.trigger();

  assert.equal(result.error, true);
  assert.equal(pasteCount, 0);
  assert.equal(controller.state, STATES.IDLE);
  assert.match(toast.events.at(-1).message, /no se hizo autopaste/i);
});

addTest("Controller: retries ASR on CPU when GPU error appears", async () => {
  let pasteCount = 0;
  const toast = new ToastNotifier();
  const settings = new SettingsStore();
  settings.update({ asrCompute: "gpu" });

  const seenCompute = [];

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe(request) {
        seenCompute.push(request.compute);
        if (request.compute !== "cpu") {
          throw new Error("CUDA GPU unavailable");
        }

        return { raw_text: "texto limpio" };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Texto limpio.";
      }
    },
    pasteController: {
      async pasteText() {
        pasteCount += 1;
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast,
    settings,
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const result = await hotkey.trigger();

  assert.equal(result.pasted, true);
  assert.equal(pasteCount, 1);
  assert.deepEqual(seenCompute, ["gpu", "cpu"]);
  assert.match(toast.events[0].message, /reintentando en cpu/i);
});

// ── F2: Success toast with timing ──

addTest("Controller: success toast includes total time", async () => {
  const toast = new ToastNotifier();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "C:/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return { raw_text: "hola" };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Hola.";
      }
    },
    pasteController: {
      async pasteText() {
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();

  const successToast = toast.events.find((e) => /dictado pegado/i.test(e.message));
  assert.ok(successToast, "Should have a success toast with total time");
  assert.match(successToast.message, /\d+\.\d+s/);
});

// ── F6: Health check ──

addTest("HealthCheck: reports ok for reachable services", async () => {
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

addTest("HealthCheck: reports failure when fetch throws", async () => {
  const service = new HealthCheckService({
    asrEndpoint: "http://127.0.0.1:8787/transcribe",
    llamaBackend: "ollama",
    llamaBaseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => { throw new Error("connection refused"); }
  });

  const result = await service.checkAll();
  assert.equal(result.asr.ok, false);
  assert.match(result.asr.error, /connection refused/);
});

addTest("HealthCheck: unconfigured endpoints report not configured", async () => {
  const service = new HealthCheckService({
    fetchImpl: async () => ({ ok: true })
  });

  const result = await service.checkAll();
  assert.equal(result.asr.ok, false);
  assert.match(result.asr.error, /not configured/);
});

// ── F7: Cancel recording ──

addTest("Controller: cancel during recording returns to IDLE", async () => {
  const toast = new ToastNotifier();
  const widget = new WidgetOverlayService();
  const tray = new TrayIconService();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return { raw_text: "texto" };
      }
    },
    llamaClient: {
      async cleanText() {
        return "Texto.";
      }
    },
    pasteController: {
      async pasteText() {
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget,
    tray,
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  assert.equal(controller.state, STATES.RECORDING);

  const result = await controller.cancel();
  assert.equal(result.cancelled, true);
  assert.equal(controller.state, STATES.IDLE);
  assert.equal(widget.visible, false);
  assert.equal(tray.state, TRAY_STATES.NEUTRAL);
});

addTest("Controller: cancel outside recording is no-op", async () => {
  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "/tmp/test.wav" };
      }
    },
    asrClient: { async transcribe() { return { raw_text: "x" }; } },
    llamaClient: { async cleanText() { return "X."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const result = await controller.cancel();
  assert.equal(result.ignored, true);
});

// ── F8: Beep service ──

addTest("Beep service tracks event sequence", async () => {
  const beep = new BeepService();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "/tmp/test.wav" };
      }
    },
    asrClient: { async transcribe() { return { raw_text: "hola" }; } },
    llamaClient: { async cleanText() { return "Hola."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay,
    beep
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger(); // start → beep start
  await hotkey.trigger(); // stop → beep stop, then success

  assert.equal(beep.events[0], "start");
  assert.equal(beep.events[1], "stop");
  assert.equal(beep.events[2], "success");
});

addTest("Beep service error on failure", async () => {
  const beep = new BeepService();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "/tmp/test.wav" };
      }
    },
    asrClient: { async transcribe() { return { raw_text: "x" }; } },
    llamaClient: { async cleanText() { throw new Error("llama offline"); } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay,
    beep
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();

  assert.equal(beep.events.includes("start"), true);
  assert.equal(beep.events.includes("error"), true);
  assert.equal(beep.events.includes("success"), false);
});

// ── F9: setMode changes mode ──

addTest("Controller: setMode updates settings and fires toast", () => {
  const toast = new ToastNotifier();
  const tray = new TrayIconService();

  const controller = new FeatherTalkAppController({
    audioRecorder: { async startRecording() {}, async stopRecording() { return { audioPath: "" }; } },
    asrClient: { async transcribe() { return { raw_text: "x" }; } },
    llamaClient: { async cleanText() { return "X."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray,
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  controller.setMode("Email");
  assert.equal(controller.mode, "Email");
  assert.equal(tray.mode, "Email");
  assert.equal(toast.events.some((e) => /modo: email/i.test(e.message)), true);
});

// ── F10: Retry cleanup ──

addTest("Controller: retry cleanup re-processes and pastes", async () => {
  let cleanCount = 0;

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() { return { audioPath: "/tmp/test.wav" }; }
    },
    asrClient: { async transcribe() { return { raw_text: "crudo" }; } },
    llamaClient: { async cleanText() { cleanCount++; return "Limpio."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();
  assert.equal(cleanCount, 1);

  const result = await controller.retryCleanup();
  assert.equal(result.pasted, true);
  assert.equal(cleanCount, 2);
  assert.equal(controller.state, STATES.IDLE);
});

addTest("Controller: retry without prior dictation is no-op", async () => {
  const toast = new ToastNotifier();
  const controller = new FeatherTalkAppController({
    audioRecorder: { async startRecording() {}, async stopRecording() { return { audioPath: "" }; } },
    asrClient: { async transcribe() { return { raw_text: "x" }; } },
    llamaClient: { async cleanText() { return "X."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const result = await controller.retryCleanup();
  assert.equal(result.ignored, true);
});

// ── F11: Preview flow ──

addTest("Pipeline: preview paste action completes flow", async () => {
  let pastedText = null;

  const pipeline = new DictationPipeline({
    asrClient: { async transcribe() { return { raw_text: "hola" }; } },
    llamaClient: { async cleanText() { return "Hola."; } },
    pasteController: { async pasteText(text) { pastedText = text; return { pasted: true, copied_to_clipboard: false }; } }
  });

  const result = await pipeline.processRecording({
    audioPath: "C:/tmp/test.wav",
    onPreview: (text) => ({ action: "paste", text })
  });

  assert.equal(result.finalText, "Hola.");
  assert.equal(pastedText, "Hola.");
  assert.equal(result.paste.pasted, true);
});

addTest("Pipeline: preview cancel action skips paste", async () => {
  let pasteCount = 0;

  const pipeline = new DictationPipeline({
    asrClient: { async transcribe() { return { raw_text: "hola" }; } },
    llamaClient: { async cleanText() { return "Hola."; } },
    pasteController: { async pasteText() { pasteCount++; return { pasted: true, copied_to_clipboard: false }; } }
  });

  const result = await pipeline.processRecording({
    audioPath: "C:/tmp/test.wav",
    onPreview: () => ({ action: "cancel", text: "" })
  });

  assert.equal(result.paste.cancelled, true);
  assert.equal(result.paste.pasted, false);
  assert.equal(pasteCount, 0);
});

// ── F12: History service ──

addTest("HistoryService: add and retrieve entries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-history-"));
  const filePath = path.join(dir, "history.jsonl");
  const service = new HistoryService({ filePath, retentionDays: 7 });

  try {
    await service.addEntry({
      rawText: "hola",
      finalText: "Hola.",
      mode: "Default",
      elapsedMs: 1000,
      asrSource: "test",
      timestamp: "2026-03-15T10:00:00.000Z"
    });

    const entries = await service.getEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].finalText, "Hola.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

addTest("HistoryService: clear removes all entries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-history-"));
  const filePath = path.join(dir, "history.jsonl");
  const service = new HistoryService({ filePath, retentionDays: 7 });

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
    await rm(dir, { recursive: true, force: true });
  }
});

// ── FSM: New transitions (F7, F10, F11) ──

addTest("FSM: RECORDING can transition to IDLE (cancel)", () => {
  const fsm = new FeatherTalkStateMachine();
  fsm.transition(STATES.RECORDING);
  fsm.transition(STATES.IDLE);
  assert.equal(fsm.state, STATES.IDLE);
});

addTest("FSM: IDLE can transition to PROCESSING_LLAMA (retry)", () => {
  const fsm = new FeatherTalkStateMachine();
  fsm.transition(STATES.PROCESSING_LLAMA);
  assert.equal(fsm.state, STATES.PROCESSING_LLAMA);
});

addTest("FSM: PROCESSING_LLAMA can transition to PREVIEWING", () => {
  const fsm = new FeatherTalkStateMachine();
  fsm.transition(STATES.RECORDING);
  fsm.transition(STATES.PROCESSING_ASR);
  fsm.transition(STATES.PROCESSING_LLAMA);
  fsm.transition(STATES.PREVIEWING);
  assert.equal(fsm.state, STATES.PREVIEWING);
});

addTest("FSM: PREVIEWING can transition to PASTING or IDLE", () => {
  const fsm1 = new FeatherTalkStateMachine();
  fsm1.transition(STATES.RECORDING);
  fsm1.transition(STATES.PROCESSING_ASR);
  fsm1.transition(STATES.PROCESSING_LLAMA);
  fsm1.transition(STATES.PREVIEWING);
  fsm1.transition(STATES.PASTING);
  assert.equal(fsm1.state, STATES.PASTING);

  const fsm2 = new FeatherTalkStateMachine();
  fsm2.transition(STATES.RECORDING);
  fsm2.transition(STATES.PROCESSING_ASR);
  fsm2.transition(STATES.PROCESSING_LLAMA);
  fsm2.transition(STATES.PREVIEWING);
  fsm2.transition(STATES.IDLE);
  assert.equal(fsm2.state, STATES.IDLE);
});

// ── Feature: Multi-level undo stack ──

addTest("Controller: multi-level undo pops stack", async () => {
  let pasteCount = 0;

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() { return { audioPath: "/tmp/test.wav" }; }
    },
    asrClient: { async transcribe() { return { raw_text: "first" }; } },
    llamaClient: { async cleanText({ rawText }) { return rawText.charAt(0).toUpperCase() + rawText.slice(1) + "."; } },
    pasteController: {
      async pasteText() { pasteCount++; return { pasted: true, copied_to_clipboard: false }; },
      setClipboard() {}
    },
    widget: new WidgetOverlayService(),
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  // First dictation
  await hotkey.trigger();
  await hotkey.trigger();

  // Second dictation
  await hotkey.trigger();
  await hotkey.trigger();

  assert.equal(pasteCount, 2);

  // First undo
  const undo1 = await controller.undoPaste();
  assert.equal(undo1.undone, true);
  assert.equal(undo1.remaining, 0);

  // Second undo (stack empty now)
  const undo2 = await controller.undoPaste();
  assert.equal(undo2.ignored, true);
});

// ── Feature: Stage forwarding to widget ──

addTest("Controller: pipeline stages forwarded to widget", async () => {
  const widget = new WidgetOverlayService();

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() { return { audioPath: "/tmp/test.wav" }; }
    },
    asrClient: { async transcribe() { return { raw_text: "hola" }; } },
    llamaClient: { async cleanText() { return "Hola."; } },
    pasteController: { async pasteText() { return { pasted: true, copied_to_clipboard: false }; } },
    widget,
    tray: new TrayIconService(),
    toast: new ToastNotifier(),
    settings: new SettingsStore(),
    delay: immediateDelay
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();

  const stageEvents = widget.events.filter(e => e.type === "stage");
  assert.ok(stageEvents.length >= 2, "Should have stage events for asr and llama");
  assert.equal(stageEvents[0].value, "asr");
  assert.equal(stageEvents[1].value, "llama");
});

// ── Feature: Health polling ──

addTest("HealthCheck: polling calls onChange when status changes", async () => {
  let pollCount = 0;
  let changeCount = 0;

  const service = new HealthCheckService({
    asrEndpoint: "http://127.0.0.1:8787/transcribe",
    llamaBackend: "ollama",
    llamaBaseUrl: "http://127.0.0.1:11434",
    fetchImpl: async () => {
      pollCount++;
      return { ok: pollCount > 1, status: pollCount > 1 ? 200 : 500 };
    }
  });

  await new Promise((resolve) => {
    service.startPolling(50, (result) => {
      changeCount++;
      if (changeCount >= 2) {
        service.stopPolling();
        resolve();
      }
    });
  });

  assert.ok(changeCount >= 2);
  service.stopPolling();
});

// ── Feature: Custom modes ──

addTest("buildCleanupPrompt uses custom modes when provided", async () => {
  const { buildCleanupPrompt } = await import("../src/modes/prompts.js");
  const custom = { Medical: "Limpia terminologia medica. Text:\n{raw_text}" };
  const result = buildCleanupPrompt("Medical", "el paciente tiene fiebre", custom);
  assert.match(result, /terminologia medica/);
  assert.match(result, /el paciente tiene fiebre/);
});

addTest("getAllModes includes built-in and custom modes", async () => {
  const { getAllModes } = await import("../src/modes/prompts.js");
  const modes = getAllModes({ Medical: "...", Legal: "..." });
  assert.ok(modes.includes("Default"));
  assert.ok(modes.includes("Email"));
  assert.ok(modes.includes("Medical"));
  assert.ok(modes.includes("Legal"));
});

// ── Feature: History export and stats ──

addTest("HistoryService: getStats aggregates entries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-history-"));
  const filePath = path.join(dir, "history.jsonl");
  const service = new HistoryService({ filePath, retentionDays: 7 });

  try {
    await service.addEntry({ rawText: "a", finalText: "A.", mode: "Default", elapsedMs: 1000, asrSource: "test" });
    await service.addEntry({ rawText: "b", finalText: "B.", mode: "Email", elapsedMs: 2000, asrSource: "test" });
    await service.addEntry({ rawText: "c", finalText: "C.", mode: "Default", elapsedMs: 1500, asrSource: "test" });

    const stats = await service.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.modes.Default, 2);
    assert.equal(stats.modes.Email, 1);
    assert.equal(stats.mostUsedMode, "Default");
    assert.equal(stats.avgElapsedMs, 1500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

addTest("HistoryService: exportEntries formats CSV correctly", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "feathertalk-history-"));
  const filePath = path.join(dir, "history.jsonl");
  const service = new HistoryService({ filePath, retentionDays: 7 });

  try {
    await service.addEntry({ rawText: "hola", finalText: "Hola.", mode: "Default", elapsedMs: 1000, asrSource: "test", timestamp: "2026-03-16T10:00:00.000Z" });

    const csv = await service.exportEntries("csv");
    assert.match(csv, /timestamp,mode,rawText,finalText,elapsedMs,asrSource/);
    assert.match(csv, /"2026-03-16/);
    assert.match(csv, /"Default"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

let passed = 0;

for (const testCase of tests) {
  try {
    await testCase.fn();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode !== 1) {
  console.log(`\n${passed}/${tests.length} tests passed`);
}







