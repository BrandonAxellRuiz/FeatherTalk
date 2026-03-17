# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FeatherTalk is a Windows-first local dictation desktop app built on Electron. It records audio via a global hotkey, transcribes speech using NVIDIA Parakeet ASR, cleans the text with a local Llama LLM, and pastes the result into the active application.

Pipeline: `Record → Parakeet ASR → Llama Cleanup (mandatory) → Paste`

## Non-Negotiable Product Rule

Llama cleanup is **mandatory** before pasting. If Llama fails, FeatherTalk must NOT autopaste the raw transcript. This invariant is enforced by `LlamaCleanupError` in the pipeline and tested explicitly.

## Commands

```bash
npm install              # Install dependencies (only devDep is electron)
npm test                 # Run all tests (custom runner: scripts/run-tests.js)
npm run start:desktop    # Launch Electron app
npm run start:all        # PowerShell: start all services + desktop app
npm run diagnose:mic     # Microphone diagnostic tool
```

Tests use Node.js built-in `assert/strict` with a custom runner — no test framework. All test files are in `tests/` and imported from a single `scripts/run-tests.js` entry point. Tests run sequentially and stop on first failure.

## Architecture

### Layers

- **`src/desktop/`** — Electron shell: main process bootstrap, global hotkey, system tray, floating widget overlay, toast notifications. Entry point: `main.js`.
- **`src/controllers/`** — `FeatherTalkAppController` orchestrates the full dictation flow (toggle → record → process → paste), owns the state machine, and coordinates UI feedback.
- **`src/core/`** — Pure logic: `FeatherTalkStateMachine` (strict FSM with 7 states and enforced transitions), `DictationPipeline` (ASR → Llama → Paste sequencing), custom error hierarchy.
- **`src/services/`** — Service implementations: ASR client (HTTP + Windows Speech fallback), Llama cleanup (Ollama/llama.cpp), audio capture (ffmpeg WASAPI/DSHOW), paste (PowerShell clipboard), settings, logging.
- **`src/modes/`** — LLM prompt templates for cleanup modes (Default, Email, Bullet, Coding).

### State Machine

States: `IDLE → RECORDING → PROCESSING_ASR → PROCESSING_LLAMA → PASTING → DONE → IDLE`. Any processing state can transition to `ERROR → IDLE`. Invalid transitions throw `InvalidStateTransitionError`.

### Dependency Injection

All services are injected into the controller and pipeline via constructor options. This enables full testability — tests use lightweight stubs (defined in `scripts/run-tests.js`) for `HotkeyService`, `WidgetOverlayService`, `TrayIconService`, `ToastNotifier`, and `SettingsStore` from `src/services/`.

### Key Patterns

- **ES Modules** throughout (`"type": "module"` in package.json).
- **Private class fields** (`#field`) for encapsulation in all classes.
- **No external runtime dependencies** — only Electron as a devDependency. Services use Node.js built-ins and HTTP calls to local endpoints.
- **GPU→CPU fallback**: ASR retries on CPU when GPU/CUDA errors are detected.
- **Language auto-detection**: ASR client retries with Spanish hint when `auto` transcript appears English-biased.
- **Leaked reasoning stripping**: Llama client strips meta-text (e.g., "Removed filler words:") from LLM output.

## Configuration

Settings file: `%LOCALAPPDATA%\FeatherTalk\config\settings.json`
Logs: `%LOCALAPPDATA%\FeatherTalk\logs\app.log`

Environment overrides: `FEATHERTALK_AUDIO_MODE=stub`, `FEATHERTALK_ASR_URL`, `FEATHERTALK_OLLAMA_URL`, `FEATHERTALK_FFMPEG_PATH`.

## Language

The codebase is in English. User-facing strings (toasts, errors shown to users) are in Spanish. README is in Spanish.
