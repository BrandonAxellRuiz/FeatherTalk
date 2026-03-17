import { spawn, execFile } from "node:child_process";

const IS_MACOS = process.platform === "darwin";

// ── macOS helpers (pbcopy / pbpaste / osascript) ──

function runCommand(cmd, args, { input, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });

    if (input != null) {
      proc.stdin.end(input);
    }
  });
}

async function getMacClipboard() {
  const output = await runCommand("pbpaste", []);
  return output.replace(/\n$/, "");
}

async function setMacClipboard(text) {
  await runCommand("pbcopy", [], { input: text });
}

async function sendCmdV() {
  await runCommand("osascript", [
    "-e",
    'tell application "System Events" to keystroke "v" using command down'
  ], { timeoutMs: 3000 });
}

async function macPasteWithRestore(text) {
  let previous = "";
  try {
    previous = await getMacClipboard();
  } catch {
    previous = "";
  }

  await setMacClipboard(text);

  // Small delay so the clipboard is ready before simulating the keystroke.
  await new Promise((resolve) => setTimeout(resolve, 30));
  await sendCmdV();

  // Wait for paste to complete, then restore.
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (typeof previous === "string") {
    await setMacClipboard(previous).catch(() => {});
  }
}

// ── Windows helpers (PowerShell) ──

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
  const script = "$shell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 20; $shell.SendKeys('^v')";
  await runPowerShell(script, 3000);
}

async function pasteWithClipboardRestore(text) {
  const base64 = Buffer.from(text, "utf8").toString("base64");
  const script = `
$ErrorActionPreference = 'Stop'
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}'))
$prev = $null
$hasPrev = $false
try {
  $prev = Get-Clipboard -Raw -ErrorAction SilentlyContinue
  if ($null -ne $prev) { $hasPrev = $true }
} catch {}
Set-Clipboard -Value $text
$shell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 20
$shell.SendKeys('^v')
Start-Sleep -Milliseconds 40
if ($hasPrev) {
  Set-Clipboard -Value $prev
}
Write-Output 'ok'
`;

  await runPowerShell(script, 3200);
}

export class WindowsPasteController {
  #memoryClipboard = "";

  async getClipboard() {
    if (IS_MACOS) return getMacClipboard();
    if (process.platform === "win32") return getClipboardText();
    return this.#memoryClipboard;
  }

  async setClipboard(text) {
    if (IS_MACOS) {
      await setMacClipboard(text);
      return;
    }
    if (process.platform === "win32") {
      await setClipboardText(text);
      return;
    }
    this.#memoryClipboard = text;
  }

  async pasteText(text) {
    if (typeof text !== "string" || text.length === 0) {
      return { pasted: false, copied_to_clipboard: false, error: "Empty text" };
    }

    // ── macOS path ──
    if (IS_MACOS) {
      try {
        await macPasteWithRestore(text);
        return { pasted: true, copied_to_clipboard: false };
      } catch (error) {
        try {
          await setMacClipboard(text);
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

    // ── Unsupported platform stub ──
    if (process.platform !== "win32") {
      this.#memoryClipboard = text;
      return { pasted: true, copied_to_clipboard: false };
    }

    // ── Windows path ──
    try {
      await pasteWithClipboardRestore(text);
      return { pasted: true, copied_to_clipboard: false };
    } catch {
      // fallback path
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
          // non-fatal
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
