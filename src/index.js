import { FeatherTalkAppController } from "./controllers/featherTalkAppController.js";
import { AsrWorkerClient } from "./services/asrWorkerClient.js";
import { AudioRecorderService } from "./services/audioRecorderService.js";
import { HotkeyService } from "./services/hotkeyService.js";
import { LlamaCleanupClient } from "./services/llamaCleanupClient.js";
import { PasteController } from "./services/pasteController.js";
import { SettingsStore } from "./services/settingsStore.js";
import { ToastNotifier } from "./services/toastNotifier.js";
import { TrayIconService } from "./services/trayIconService.js";
import { WidgetOverlayService } from "./services/widgetOverlayService.js";

async function main() {
  const settings = new SettingsStore();
  const toast = new ToastNotifier();
  const tray = new TrayIconService();
  const widget = new WidgetOverlayService();

  const controller = new FeatherTalkAppController({
    audioRecorder: new AudioRecorderService(),
    asrClient: new AsrWorkerClient(),
    llamaClient: new LlamaCleanupClient({
      cleaner: async ({ rawText }) => {
        const compact = rawText.replace(/\s+/g, " ").trim();
        if (!compact) {
          return "";
        }

        return `${compact.charAt(0).toUpperCase()}${compact.slice(1)}.`;
      }
    }),
    pasteController: new PasteController(),
    widget,
    tray,
    toast,
    settings
  });

  const hotkey = new HotkeyService();
  controller.registerHotkey(hotkey);

  console.log("FeatherTalk demo scaffold running");
  console.log(`Registered hotkey: ${hotkey.registeredHotkey}`);

  await hotkey.trigger();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const result = await hotkey.trigger();

  console.log("Result:", result);
  console.log("Tray state:", tray.state);
  console.log("Widget visible:", widget.visible);
  console.log("Toast events:", toast.events);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
