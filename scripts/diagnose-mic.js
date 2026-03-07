import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const settingsCandidates = [
  path.join(process.env.LOCALAPPDATA || "", "FeatherTalk", "config", "settings.json"),
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

async function main() {
  const settings = await readSettings();
  const configuredMic = settings.microphoneDeviceId ?? "default";
  const ffmpegPath =
    process.env.FEATHERTALK_FFMPEG_PATH || settings.ffmpegPath || "ffmpeg";

  console.log(`FeatherTalk mic diagnose - ffmpeg: ${ffmpegPath}`);
  console.log(`Configured microphoneDeviceId: ${configuredMic}`);

  const version = await run(ffmpegPath, ["-version"]);
  printBlock("ffmpeg -version (stdout)", version.stdout);
  if (!version.ok) {
    printBlock("ffmpeg -version (stderr)", version.stderr);
    console.log("\nFAIL: ffmpeg is not available. Install ffmpeg and ensure it is in PATH.");
    process.exitCode = 1;
    return;
  }

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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


