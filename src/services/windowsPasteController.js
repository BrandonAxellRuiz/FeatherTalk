import { spawn } from "node:child_process";

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const encoded = encodePowerShell(script);
    const proc = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error("PowerShell command timed out"));
    }, timeoutMs);

    proc.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || `PowerShell exited with code ${code}`));
    });
  });
}

async function getClipboardText() {
  const script = "$value = Get-Clipboard -Raw -ErrorAction SilentlyContinue; if ($null -eq $value) { '' } else { $value }";
  return runPowerShell(script).then((output) => output.replace(/\r?\n$/, ""));
}

async function setClipboardText(text) {
  const base64 = Buffer.from(text, "utf8").toString("base64");
  const script = `$value = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}')); Set-Clipboard -Value $value`;
  await runPowerShell(script);
}

async function sendCtrlV() {
  const script = "$shell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 45; $shell.SendKeys('^v')";
  await runPowerShell(script, 3000);
}

export class WindowsPasteController {
  #memoryClipboard = "";

  async pasteText(text) {
    if (typeof text !== "string" || text.length === 0) {
      return { pasted: false, copied_to_clipboard: false, error: "Empty text" };
    }

    if (process.platform !== "win32") {
      this.#memoryClipboard = text;
      return { pasted: true, copied_to_clipboard: false };
    }

    let previous = "";
    try {
      previous = await getClipboardText();
    } catch {
      previous = "";
    }

    try {
      await setClipboardText(text);
      await sendCtrlV();

      if (typeof previous === "string") {
        await setClipboardText(previous).catch(() => {
          // Non-fatal.
        });
      }

      return { pasted: true, copied_to_clipboard: false };
    } catch (error) {
      try {
        await setClipboardText(text);
      } catch {
        // ignore
      }

      return {
        pasted: false,
        copied_to_clipboard: true,
        error: error.message
      };
    }
  }
}
