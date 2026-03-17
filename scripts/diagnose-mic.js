import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const IS_MACOS = process.platform === "darwin";

const settingsCandidates = [
  IS_MACOS
    ? path.join(os.homedir(), "Library", "Application Support", "FeatherTalk", "config", "settings.json")
    : path.join(process.env.LOCALAPPDATA || "", "FeatherTalk", "config", "settings.json"),
  path.join(process.cwd(), "data", "localappdata", "FeatherTalk", "config", "settings.json")
].filter(Boolean);

async function readSettings() {
  for (const filePath of settingsCandidates) {
    try {
      const raw = await readFile(filePath, "utf8");
      const json = JSON.parse(raw);
      if (json && typeof json === "object") {
        return json;
      }
    } catch {
      // try next
    }
  }

  return {};
}

function run(command, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(command, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({ ok: false, code: null, stdout: "", stderr: error.message });
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
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out` });
    }, timeoutMs);

    proc.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function printBlock(title, text) {
  console.log(`\n=== ${title} ===`);
  console.log(text && text.trim().length > 0 ? text.trim() : "(empty)");
}

function parseDshowAudioDevices(text) {
  const lines = `${text}`.split(/\r?\n/);
  const names = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/directshow audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/directshow video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection || /alternative name/i.test(line)) {
      continue;
    }

    const match = line.match(/"([^"]+)"/);
    if (match && match[1]) {
      names.push(match[1].trim());
    }
  }

  if (names.length === 0) {
    for (const line of lines) {
      const match = line.match(/"([^"]+)"\s*\(audio\)/i);
      if (match && match[1]) {
        names.push(match[1].trim());
      }
    }
  }

  return [...new Set(names)];
}

function normalizeDshowInput(deviceId) {
  const raw = `${deviceId ?? "default"}`.trim();
  if (!raw || raw === "default") {
    return "audio=default";
  }

  if (raw.startsWith("audio=")) {
    return raw;
  }

  return `audio=${raw}`;
}

function parseAvfoundationAudioDevices(stderrText) {
  const lines = `${stderrText ?? ""}`.split(/\r?\n/);
  const devices = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (/avfoundation audio devices/i.test(line)) {
      inAudioSection = true;
      continue;
    }

    if (/avfoundation video devices/i.test(line)) {
      inAudioSection = false;
      continue;
    }

    if (!inAudioSection) {
      continue;
    }

    const match = line.match(/\[(\d+)]\s+(.+)/);
    if (match) {
      devices.push({ index: match[1], name: match[2].trim() });
    }
  }

  return devices;
}

async function diagnoseMac(ffmpegPath, configuredMic) {
  const avfDevices = await run(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "avfoundation",
    "-i",
    ""
  ]);

  printBlock("AVFoundation device listing (stderr)", avfDevices.stderr);

  const audioDevices = parseAvfoundationAudioDevices(
    `${avfDevices.stderr}\n${avfDevices.stdout}`
  );

  if (audioDevices.length > 0) {
    console.log("\nDetected audio devices:");
    for (const dev of audioDevices) {
      console.log(`  [${dev.index}] ${dev.name}`);
    }
  } else {
    console.log("\nWARNING: No audio input devices detected by AVFoundation.");

    // Check system_profiler for input devices to distinguish hardware vs permission issue
    const profiler = await run("system_profiler", ["SPAudioDataType"], 10000);
    const profilerText = `${profiler.stdout ?? ""}`.toLowerCase();
    const hasInputDevice =
      profilerText.includes("input") ||
      profilerText.includes("microphone") ||
      profilerText.includes("mic");

    if (!hasInputDevice) {
      console.log("No microphone hardware detected on this Mac.");
      console.log("This Mac (likely a Mac mini, Mac Pro, or Mac Studio) has no built-in microphone.");
      console.log("Connect an external microphone (USB, headset, or audio interface) and retry.");
    } else {
      console.log("A microphone may be connected but macOS TCC privacy is blocking access.");
      console.log("Your terminal app needs microphone permission. Try these steps:");
      console.log("  1. Run directly in terminal: ffmpeg -f avfoundation -i \":default\" -t 1 /tmp/mic-test.wav");
      console.log("     (this may trigger the macOS permission prompt)");
      console.log("  2. If no prompt appears, reset permissions: tccutil reset Microphone");
      console.log("     then retry step 1.");
      console.log("  3. Check System Settings > Privacy & Security > Microphone");
      console.log("     and ensure your terminal app (Terminal, iTerm2, VS Code, etc.) is enabled.");
    }
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "feathertalk-mic-"));
  const avfFile = path.join(tempRoot, "probe-avf.wav");
  await mkdir(tempRoot, { recursive: true });

  // Determine which input to try
  let avfInput = ":default";
  if (configuredMic !== "default") {
    avfInput = configuredMic.startsWith(":") ? configuredMic : `:${configuredMic}`;
  } else if (audioDevices.length > 0) {
    avfInput = `:${audioDevices[0].index}`;
  }

  const captureAvf = await run(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "avfoundation",
      "-i",
      avfInput,
      "-t",
      "1",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      avfFile
    ],
    20000
  );

  printBlock(`1s AVFoundation capture (${avfInput}) (stderr)`, captureAvf.stderr);

  // If the configured input failed and it wasn't :0, try :0 as fallback
  if (!captureAvf.ok && avfInput !== ":0") {
    const fallbackFile = path.join(tempRoot, "probe-avf-fallback.wav");
    const fallback = await run(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        ":0",
        "-t",
        "1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-y",
        fallbackFile
      ],
      20000
    );

    printBlock("1s AVFoundation capture (:0) (stderr)", fallback.stderr);
    await rm(tempRoot, { recursive: true, force: true });

    if (fallback.ok) {
      console.log("\nPASS: AVFoundation capture succeeded with :0.");
      console.log("Recommendation: set microphoneDeviceId to \"0\" in settings.");
      return;
    }
  } else {
    await rm(tempRoot, { recursive: true, force: true });
  }

  if (captureAvf.ok) {
    console.log(`\nPASS: AVFoundation capture succeeded (${avfInput}).`);
    return;
  }

  console.log("\nFAIL: AVFoundation capture failed.");
  if (audioDevices.length === 0) {
    const profilerCheck = await run("system_profiler", ["SPAudioDataType"], 10000);
    const profilerOut = `${profilerCheck.stdout ?? ""}`.toLowerCase();
    const hasMicHardware =
      profilerOut.includes("input") ||
      profilerOut.includes("microphone") ||
      profilerOut.includes("mic");

    if (!hasMicHardware) {
      console.log("Root cause: no microphone hardware detected.");
      console.log("Connect an external microphone (USB, headset, or audio interface) and retry.");
    } else {
      console.log("Root cause: macOS is blocking microphone access for this terminal app.");
      console.log("Fix: run 'tccutil reset Microphone' then retry, or grant microphone");
      console.log("permission to your terminal in System Settings > Privacy & Security > Microphone.");
    }
  } else {
    console.log("Check System Settings > Privacy & Security > Microphone.");
  }
  process.exitCode = 1;
}

async function diagnoseWindows(ffmpegPath, configuredMic) {
  const wasapiDevices = await run(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "wasapi",
    "-i",
    "dummy"
  ]);

  printBlock("WASAPI device listing (stderr)", wasapiDevices.stderr);

  const dshowDevices = await run(ffmpegPath, [
    "-hide_banner",
    "-list_devices",
    "true",
    "-f",
    "dshow",
    "-i",
    "dummy"
  ]);

  printBlock("DSHOW device listing (stderr)", dshowDevices.stderr);

  const dshowAudioDevices = parseDshowAudioDevices(`${dshowDevices.stderr}\n${dshowDevices.stdout}`);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "feathertalk-mic-"));
  const wasapiFile = path.join(tempRoot, "probe-wasapi.wav");
  const dshowFile = path.join(tempRoot, "probe-dshow.wav");
  await mkdir(tempRoot, { recursive: true });

  const captureWasapi = await run(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "wasapi",
      "-i",
      "default",
      "-t",
      "1",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      wasapiFile
    ],
    20000
  );

  printBlock("1s WASAPI capture (stderr)", captureWasapi.stderr);

  const dshowInput = normalizeDshowInput(
    configuredMic !== "default"
      ? configuredMic
      : dshowAudioDevices[0]
        ? dshowAudioDevices[0]
        : "default"
  );

  const captureDshow = await run(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "dshow",
      "-i",
      dshowInput,
      "-t",
      "1",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      dshowFile
    ],
    20000
  );

  printBlock(`1s DSHOW capture (${dshowInput}) (stderr)`, captureDshow.stderr);

  await rm(tempRoot, { recursive: true, force: true });

  if (captureWasapi.ok) {
    console.log("\nPASS: default WASAPI capture succeeded.");
    return;
  }

  if (captureDshow.ok) {
    console.log("\nPASS: DSHOW capture succeeded.");
    console.log(
      "Recommendation: set audioAllowDshowFallback=true and microphoneDeviceId to the selected DSHOW device."
    );
    return;
  }

  console.log("\nFAIL: WASAPI and DSHOW capture failed. Check mic privacy permissions and chosen microphoneDeviceId.");
  process.exitCode = 1;
}

async function main() {
  const settings = await readSettings();
  const configuredMic = settings.microphoneDeviceId ?? "default";
  const ffmpegPath =
    process.env.FEATHERTALK_FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  console.log(`FeatherTalk mic diagnose - ffmpeg: ${ffmpegPath}`);
  console.log(`Configured microphoneDeviceId: ${configuredMic}`);
  console.log(`Platform: ${process.platform}`);

  const version = await run(ffmpegPath, ["-version"]);
  printBlock("ffmpeg -version (stdout)", version.stdout);
  if (!version.ok) {
    printBlock("ffmpeg -version (stderr)", version.stderr);
    console.log("\nFAIL: ffmpeg is not available. Install ffmpeg and ensure it is in PATH.");
    process.exitCode = 1;
    return;
  }

  if (IS_MACOS) {
    await diagnoseMac(ffmpegPath, configuredMic);
  } else {
    await diagnoseWindows(ffmpegPath, configuredMic);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


