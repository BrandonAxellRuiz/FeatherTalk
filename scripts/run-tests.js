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
import { HotkeyService } from "../src/services/hotkeyService.js";
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
  assert.deepEqual(list, [
    "WASAPI default",
    "WASAPI audio=default",
    "DSHOW audio=default"
  ]);
});

addTest("buildInputCandidates can disable DSHOW fallback", () => {
  const list = buildInputCandidates("default", false);
  assert.equal(list.some((item) => item.format === "dshow"), false);
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







