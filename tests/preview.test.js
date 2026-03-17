import test from "node:test";
import assert from "node:assert/strict";
import { FeatherTalkAppController } from "../src/controllers/featherTalkAppController.js";
import { STATES } from "../src/core/stateMachine.js";
import { HotkeyService } from "../src/services/hotkeyService.js";
import { SettingsStore } from "../src/services/settingsStore.js";
import { ToastNotifier } from "../src/services/toastNotifier.js";
import { TrayIconService } from "../src/services/trayIconService.js";
import { WidgetOverlayService } from "../src/services/widgetOverlayService.js";
import { PreviewService } from "../src/services/previewService.js";

function immediateDelay() {
  return Promise.resolve();
}

function createControllerWithPreview(previewAction) {
  const toast = new ToastNotifier();
  let pastedText = null;

  const preview = new PreviewService({
    autoResolve: (text) => ({ action: previewAction, text })
  });

  const settings = new SettingsStore();
  settings.update({ previewBeforePaste: true });

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
    llamaClient: {
      async cleanText() {
        return "Texto limpio.";
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
    toast,
    settings,
    delay: immediateDelay,
    preview
  });

  return { controller, toast, getPastedText: () => pastedText };
}

test("preview with paste action completes full flow", async () => {
  const { controller, getPastedText } = createControllerWithPreview("paste");
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const result = await hotkey.trigger();

  assert.equal(result.pasted, true);
  assert.equal(getPastedText(), "Texto limpio.");
  assert.equal(controller.state, STATES.IDLE);
});

test("preview with cancel action skips paste", async () => {
  const { controller, getPastedText } = createControllerWithPreview("cancel");
  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  await hotkey.trigger();
  const result = await hotkey.trigger();

  assert.equal(result.pasted, false);
  assert.equal(getPastedText(), null);
  assert.equal(controller.state, STATES.IDLE);
});
