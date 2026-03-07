# FeatherTalk (Scaffold MVP v1.1)

Base Windows-first para el flujo obligatorio:

`Record -> Parakeet ASR -> Llama cleanup (obligatorio) -> Paste`

## Lo que ya queda implementado

- FSM de estados UX (`IDLE`, `RECORDING`, `PROCESSING_ASR`, `PROCESSING_LLAMA`, `PASTING`, `DONE`, `ERROR`)
- Regla critica: si Llama falla, no hay autopaste
- Widget state model (recording/procesando/error/hide)
- Adaptadores HTTP para:
  - ASR Worker (`POST /transcribe`)
  - Llama cleanup (`ollama` o `llama.cpp`)
- Runtime desktop Electron:
  - Tray icon por estado
  - Hotkey global con fallback automatico
  - Overlay flotante animado
- Adaptadores Windows:
  - Captura via `ffmpeg` con `-f wasapi` (fallback opcional a dshow)
  - Paste en ventana activa por PowerShell (`Ctrl+V`) + fallback clipboard
  - Fallback ASR local con Windows Speech si el endpoint Parakeet no responde
- Resiliencia de red local:
  - Reintentos en ASR/Llama
  - Error de `fetch failed` incluye endpoint y accion sugerida
  - Auto-intento de `ollama serve` cuando backend Ollama no responde
- Logging completo:
  - Consola (al correr `start:desktop`)
  - Archivo `app.log`

## Scripts

```powershell
npm.cmd test
npm.cmd run start:demo
npm.cmd run start:asr-worker
npm.cmd run start:desktop
npm.cmd run diagnose:mic
```

## Configuracion local

`settings.json` se guarda en:

`%LOCALAPPDATA%\FeatherTalk\config\settings.json`

Si no hay permisos en `%LOCALAPPDATA%`, usa fallback en:

`<repo>\data\localappdata\FeatherTalk\config\settings.json`

Campos importantes:

- `hotkey` (default `Ctrl+Win+Space`)
- `hotkeyFallbacks` (default `Ctrl+Alt+Space`, `Ctrl+Shift+Space`, `Ctrl+Space`)
- `microphoneDeviceId` (default `default`)
- `audioAllowDshowFallback` (default `true`)
- `asrAllowWindowsSpeechFallback` (default `true`)
- `asrWorkerUrl` (ej: `http://127.0.0.1:8787/transcribe`)
- `llamaBackend` (`ollama` o `llama.cpp`)
- `ollamaBaseUrl` (ej: `http://127.0.0.1:11434`)
- `ollamaCommand` (default `ollama`, o ruta absoluta a `ollama.exe`)
- `llamaCppBaseUrl` (ej: `http://127.0.0.1:8080`)
- `llamaModel` (default `llama3.1:8b`)
- `ffmpegPath`

## Variables opcionales

- `FEATHERTALK_AUDIO_MODE=stub` para usar grabador de demo en desktop
- `FEATHERTALK_ASR_URL` para override rapido de endpoint ASR
- `FEATHERTALK_OLLAMA_URL` para override rapido de Ollama
- `FEATHERTALK_OLLAMA_COMMAND` para override rapido del binario `ollama`
- `FEATHERTALK_LLAMA_CPP_URL` para override rapido de llama.cpp
- `FEATHERTALK_FFMPEG_PATH` para diagnostico (`diagnose:mic`)

## Logs

Archivo de logs:

`%LOCALAPPDATA%\FeatherTalk\logs\app.log`

Comando para ver logs en vivo:

```powershell
Get-Content "$env:LOCALAPPDATA\FeatherTalk\logs\app.log" -Wait
```

## Notas de integracion

- `start:demo` no requiere servicios externos.
- `start:asr-worker` levanta el worker local de Parakeet (ONNX) en `http://127.0.0.1:8787`.
- `start:desktop` requiere `electron` instalado (`npm.cmd install`) y, para captura real, `ffmpeg` accesible en PATH o ruta absoluta.
- Si el hotkey principal esta ocupado o reservado por Windows, FeatherTalk intenta automaticamente los hotkeys en `hotkeyFallbacks`.
- Si hay error de microfono, ahora se muestra la causa real y sugerencia de accion en el toast.
- Usa `npm.cmd run diagnose:mic` para listar dispositivos WASAPI/DSHOW y validar captura de 1 segundo.
- En error de Llama, se emite toast y se bloquea autopaste por diseno.
- Si ves `spawn ollama ENOENT`, instala Ollama y define `ollamaCommand` con ruta absoluta (ej: `C:\Users\<tu_usuario>\AppData\Local\Programs\Ollama\ollama.exe`).

## Troubleshooting rapido

Si en logs aparece `ASR request failed ... fetch failed`:

- Verifica que el worker ASR este escuchando en `127.0.0.1:8787` (o cambia `asrWorkerUrl`).
- Comando de chequeo:

```powershell
Test-NetConnection 127.0.0.1 -Port 8787
```

Si en logs aparece `Ollama cleanup failed` o `spawn ollama ENOENT`:

- Instala Ollama o define `ollamaCommand` con ruta absoluta.
- Inicia servidor local:

```powershell
ollama serve
ollama pull llama3.1:8b
```

- Verifica puerto:

```powershell
Test-NetConnection 127.0.0.1 -Port 11434
```
