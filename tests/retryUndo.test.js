import test from "node:test";
import assert from "node:assert/strict";
import { FeatherTalkAppController } from "../src/controllers/featherTalkAppController.js";
import { STATES } from "../src/core/stateMachine.js";
import { HotkeyService } from "../src/services/hotkeyService.js";
import { SettingsStore } from "../src/services/settingsStore.js";
import { ToastNotifier } from "../src/services/toastNotifier.js";
import { TrayIconService } from "../src/services/trayIconService.js";
import { WidgetOverlayService } from "../src/services/widgetOverlayService.js";
import { BeepService } from "../src/services/beepService.js";

function immediateDelay() {
  return Promise.resolve();
}

function createController({ llamaCleanImpl } = {}) {
  const toast = new ToastNotifier();
  const widget = new WidgetOverlayService();
  const tray = new TrayIconService();
  const beep = new BeepService();
  let cleanCallCount = 0;

  const llamaClient = {
    async cleanText({ mode, rawText }) {
      cleanCallCount++;
      return (llamaCleanImpl ?? (() => "Texto limpio."))({ mode, rawText });
    }
  };

  const controller = new FeatherTalkAppController({
    audioRecorder: {
      async startRecording() {},
      async stopRecording() {
        return { audioPath: "/tmp/test.wav" };
      }
    },
    asrClient: {
      async transcribe() {
        return { raw_text: "texto crudo" };
      }
    },
    llamaClient,
    pasteController: {
      async pasteText() {
        return { pasted: true, copied_to_clipboard: false };
      }
    },
    widget,
    tray,
    toast,
    settings: new SettingsStore(),
    delay: immediateDelay,
    beep
  });

  return { controller, toast, widget, tray, beep, getCleanCallCount: () => cleanCallCount };
}

test("retry cleanup re-processes with Llama and pastes", async () => {
  const { controller, getCleanCallCount } = createController();
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  // Complete a normal dictation first
  await hotkey.trigger(); // start recording
  await hotkey.trigger(); // stop and process

  assert.equal(controller.state, STATES.IDLE);
  assert.equal(getCleanCallCount(), 1);

  // Retry cleanup
  const result = await controller.retryCleanup();
  assert.equal(result.pasted, true);
  assert.equal(getCleanCallCount(), 2);
  assert.equal(controller.state, STATES.IDLE);
});

test("retry cleanup with different mode", async () => {
  const modes = [];
  const { controller } = createController({
    llamaCleanImpl: ({ mode }) => {
      modes.push(mode);
      return `Limpio (${mode})`;
    }
  });
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await hotkey.trigger();

  const result = await controller.retryCleanup("Email");
  assert.equal(result.pasted, true);
  assert.equal(modes.at(-1), "Email");
});

test("retry without prior dictation is ignored", async () => {
  const { controller, toast } = createController();

  const result = await controller.retryCleanup();
  assert.equal(result.ignored, true);
  assert.equal(toast.events.some((e) => /no hay dictado/i.test(e.message)), true);
});

test("undo without prior dictation is ignored", async () => {
  const { controller, toast } = createController();

  const result = await controller.undoPaste();
  assert.equal(result.ignored, true);
  assert.equal(toast.events.some((e) => /no hay dictado/i.test(e.message)), true);
});
