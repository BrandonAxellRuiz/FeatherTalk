import test from "node:test";
import assert from "node:assert/strict";
import { FeatherTalkAppController } from "../src/controllers/featherTalkAppController.js";
import { STATES } from "../src/core/stateMachine.js";
import { HotkeyService } from "../src/services/hotkeyService.js";
import { SettingsStore } from "../src/services/settingsStore.js";
import { ToastNotifier } from "../src/services/toastNotifier.js";
import { TrayIconService, TRAY_STATES } from "../src/services/trayIconService.js";
import { WidgetOverlayService } from "../src/services/widgetOverlayService.js";
import { BeepService } from "../src/services/beepService.js";

function immediateDelay() {
  return Promise.resolve();
}

function createController() {
  const toast = new ToastNotifier();
  const widget = new WidgetOverlayService();
  const tray = new TrayIconService();
  const beep = new BeepService();

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
    delay: immediateDelay,
    beep
  });

  return { controller, toast, widget, tray, beep };
}

test("cancel during recording transitions back to IDLE", async () => {
  const { controller, toast, widget, tray } = createController();
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger(); // start recording
  assert.equal(controller.state, STATES.RECORDING);

  const result = await controller.cancel();
  assert.equal(result.cancelled, true);
  assert.equal(controller.state, STATES.IDLE);
  assert.equal(widget.visible, false);
  assert.equal(tray.state, TRAY_STATES.NEUTRAL);
  assert.equal(toast.events.some((e) => /cancelada/i.test(e.message)), true);
});

test("cancel outside of recording is no-op", async () => {
  const { controller } = createController();

  const result = await controller.cancel();
  assert.equal(result.ignored, true);
  assert.equal(controller.state, STATES.IDLE);
});

test("cancel triggers error beep", async () => {
  const { controller, beep } = createController();
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  await controller.cancel();

  assert.equal(beep.events.includes("error"), true);
});
