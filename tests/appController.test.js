import test from "node:test";
import assert from "node:assert/strict";
import { FeatherTalkAppController } from "../src/controllers/featherTalkAppController.js";
import { HotkeyService } from "../src/services/hotkeyService.js";
import { SettingsStore } from "../src/services/settingsStore.js";
import { ToastNotifier } from "../src/services/toastNotifier.js";
import { TrayIconService, TRAY_STATES } from "../src/services/trayIconService.js";
import { WidgetOverlayService } from "../src/services/widgetOverlayService.js";
import { STATES } from "../src/core/stateMachine.js";

function immediateDelay() {
  return Promise.resolve();
}

test("toggle flow starts recording and then processes until idle", async () => {
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

test("processing state ignores toggle", async () => {
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
  assert.equal(tray.state, TRAY_STATES.NEUTRAL);
  assert.equal(widget.visible, false);
});

test("llama failure returns error and blocks autopaste", async () => {
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
        return { raw_text: "texto en bruto" };
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

  const lastToast = toast.events.at(-1);
  assert.match(lastToast.message, /no se hizo autopaste/i);
});
