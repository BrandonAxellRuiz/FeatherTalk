# FeatherTalk

FeatherTalk is a Windows-first, local dictation app that turns speech into cleaned text with a single hotkey.

Core pipeline (always local):

`Record -> NVIDIA Parakeet ASR -> Llama cleanup (mandatory) -> Paste`

## What It Does

- Global hotkey toggles recording on/off.
- Shows a floating widget while recording/processing.
- Transcribes speech with local Parakeet ASR.
- Always runs Llama cleanup before pasting.
- Pastes final text into the active app (Chrome, VS Code, Slack, Notion, Word, etc.).

## Privacy Model

- 100% local processing after setup.
- No cloud API is required for transcription or cleanup.
- Audio and text stay on your machine.

## Current MVP Status

Implemented:

- UX state machine (`IDLE`, `RECORDING`, `PROCESSING_ASR`, `PROCESSING_LLAMA`, `PASTING`, `DONE`, `ERROR`)
- Mandatory Llama cleanup rule (no autopaste when cleanup fails)
- Desktop Electron runtime with tray icon + global hotkey fallback
- Floating overlay widget with recording/processing/error states
- Windows audio capture via `ffmpeg` (WASAPI with DSHOW fallback)
- Clipboard-safe paste flow with fallback copy mode
- Local ASR fallback via Windows Speech when ASR endpoint is unavailable
- Structured logs to console and `app.log`

## Project Scripts

```powershell
npm.cmd install
npm.cmd test
npm.cmd run start:all
npm.cmd run start:desktop
npm.cmd run start:asr-worker
npm.cmd run diagnose:mic
```

## Recommended Way To Run

Use one command to start required local services and desktop app:

```powershell
npm.cmd run start:all
```

This script:

- Resolves and exports `ffmpeg` path
- Starts/validates Ollama
- Warms up Llama model
- Starts/validates Parakeet ASR worker
- Stops stale FeatherTalk Electron instance
- Launches desktop app

## Local Configuration

Settings file location:

`%LOCALAPPDATA%\FeatherTalk\config\settings.json`

Fallback location (if `%LOCALAPPDATA%` is unavailable):

`<repo>\data\localappdata\FeatherTalk\config\settings.json`

Important keys:

- `hotkey` (example: `Ctrl+Shift+Space`)
- `hotkeyFallbacks`
- `microphoneDeviceId`
- `widget.animationVariant` (`ink-v2` or `organic-v1`)
- `audioAllowDshowFallback`
- `ffmpegPath`
- `asrWorkerUrl` (default `http://127.0.0.1:8787/transcribe`)
- `asrAllowWindowsSpeechFallback`
- `language` (`auto`, `es`, `en`)
- `llamaBackend` (`ollama` or `llama.cpp`)
- `ollamaBaseUrl` (default `http://127.0.0.1:11434`)
- `ollamaCommand` (absolute path to `ollama.exe` recommended)
- `llamaCppBaseUrl`
- `llamaModel` (example: `llama3.1:8b`)

## Useful Environment Overrides

- `FEATHERTALK_AUDIO_MODE=stub` (demo recorder)
- `FEATHERTALK_ASR_URL`
- `FEATHERTALK_OLLAMA_URL`
- `FEATHERTALK_OLLAMA_COMMAND`
- `FEATHERTALK_LLAMA_CPP_URL`
- `FEATHERTALK_FFMPEG_PATH`

## Logs

Log file:

`%LOCALAPPDATA%\FeatherTalk\logs\app.log`

Follow logs live:

```powershell
Get-Content "$env:LOCALAPPDATA\FeatherTalk\logs\app.log" -Wait
```

## Troubleshooting

### Microphone fails to start

Run:

```powershell
npm.cmd run diagnose:mic
```

Then verify:

- `ffmpeg` exists and is executable
- Your build supports required capture mode (WASAPI/DSHOW)
- `microphoneDeviceId` matches a real DSHOW device when needed

### ASR request failed (`fetch failed`)

- Confirm ASR worker is running on `127.0.0.1:8787`
- Check connectivity:

```powershell
Test-NetConnection 127.0.0.1 -Port 8787
```

### Llama cleanup failed

- Ensure Ollama is installed and running
- Pull model:

```powershell
ollama pull llama3.1:8b
```

- Check Ollama port:

```powershell
Test-NetConnection 127.0.0.1 -Port 11434
```

## Architecture Summary

- `src/desktop/*`: Electron desktop runtime (hotkey, tray, overlay)
- `src/controllers/*`: orchestration and UX flow
- `src/core/*`: FSM and pipeline rules
- `src/services/*`: ASR, cleanup, audio capture, paste, settings, logging
- `scripts/*`: startup/diagnostics/ASR worker helpers

## Product Rule (Non-Negotiable)

Llama cleanup is mandatory before paste.
If cleanup fails, FeatherTalk does **not** autopaste raw transcript.

