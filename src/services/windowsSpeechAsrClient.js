import { spawn } from "node:child_process";

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const encoded = encodePowerShell(script);
    let proc;

    try {
      proc = spawn(
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
    } catch (error) {
      reject(error);
      return;
    }

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
      reject(new Error("PowerShell ASR command timed out"));
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

function normalizeLanguage(language) {
  if (!language || language === "auto") {
    return "";
  }

  return language;
}

function buildSpeechScript({ audioPath, language }) {
  const escapedPath = audioPath.replace(/'/g, "''");
  const normalizedLang = normalizeLanguage(language).replace(/'/g, "''");

  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Speech",
    `$audioPath = '${escapedPath}'`,
    `$preferredCulture = '${normalizedLang}'`,
    "$recognizer = $null",
    "if ($preferredCulture -ne '') {",
    "  try {",
    "    $culture = New-Object System.Globalization.CultureInfo($preferredCulture)",
    "    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)",
    "  } catch {",
    "    $recognizer = $null",
    "  }",
    "}",
    "if ($null -eq $recognizer) {",
    "  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine",
    "}",
    "$grammar = New-Object System.Speech.Recognition.DictationGrammar",
    "$recognizer.LoadGrammar($grammar)",
    "$recognizer.SetInputToWaveFile($audioPath)",
    "$chunks = New-Object System.Collections.Generic.List[string]",
    "while ($true) {",
    "  $result = $recognizer.Recognize()",
    "  if ($null -eq $result) { break }",
    "  if ($result.Text) { $chunks.Add($result.Text) }",
    "}",
    "$final = ($chunks -join ' ').Trim()",
    "Write-Output $final"
  ].join("\n");
}

export class WindowsSpeechAsrClient {
  #timeoutMs;

  constructor({ timeoutMs = 120000 } = {}) {
    this.#timeoutMs = timeoutMs;
  }

  async transcribe(request) {
    if (!request?.audioPath) {
      throw new Error("audioPath is required");
    }

    if (process.platform !== "win32") {
      throw new Error("WindowsSpeechAsrClient is only available on Windows");
    }

    const script = buildSpeechScript({
      audioPath: request.audioPath,
      language: request.language ?? "auto"
    });

    const startedAt = Date.now();
    const output = await runPowerShell(script, this.#timeoutMs);
    const rawText = `${output}`.replace(/\r?\n/g, " ").trim();

    if (!rawText) {
      throw new Error(
        "Windows Speech could not produce transcript. Try another mic or language."
      );
    }

    return {
      raw_text: rawText,
      elapsed_ms: Date.now() - startedAt,
      source: "asr-fallback"
    };
  }
}
