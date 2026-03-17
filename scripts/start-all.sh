#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS_PATH="${HOME}/Library/Application Support/FeatherTalk/config/settings.json"

# ── Read settings ───────────────────────────────────────────────────
ollama_base_url="http://127.0.0.1:11434"
llama_model="${FEATHERTALK_LLAMA_MODEL:-qwen2.5:3b}"
llama_keep_alive="30m"

if [ -f "$SETTINGS_PATH" ]; then
  val=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d.get('ollamaBaseUrl',''))" "$SETTINGS_PATH" 2>/dev/null || true)
  [ -n "$val" ] && ollama_base_url="$val"

  val=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d.get('llamaModel',''))" "$SETTINGS_PATH" 2>/dev/null || true)
  [ -n "$val" ] && llama_model="$val"

  val=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d.get('llamaKeepAlive',''))" "$SETTINGS_PATH" 2>/dev/null || true)
  [ -n "$val" ] && llama_keep_alive="$val"
fi

# ── Helpers ─────────────────────────────────────────────────────────
wait_http_ok() {
  local url="$1" timeout="${2:-20}" desc="${3:-service}"
  local deadline=$((SECONDS + timeout))

  while [ $SECONDS -lt $deadline ]; do
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
      echo "$desc is ready at $url"
      return 0
    fi
    sleep 0.5
  done

  return 1
}

# ── 1. Ollama ───────────────────────────────────────────────────────
if ! curl -sf --max-time 1 "${ollama_base_url}/api/tags" >/dev/null 2>&1; then
  if ! command -v ollama >/dev/null 2>&1; then
    echo "ERROR: Ollama not found. Install with: brew install ollama"
    exit 1
  fi

  echo "Starting Ollama..."
  ollama serve >/dev/null 2>&1 &
  OLLAMA_PID=$!
  echo "Ollama started (pid $OLLAMA_PID)"
fi

if ! wait_http_ok "${ollama_base_url}/api/tags" 25 "Ollama"; then
  echo "ERROR: Ollama did not become ready at ${ollama_base_url}/api/tags"
  exit 1
fi

# ── 2. Warmup Llama model ──────────────────────────────────────────
echo "Warming up model: ${llama_model}..."
curl -sf --max-time 90 "${ollama_base_url}/api/generate" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${llama_model}\",\"prompt\":\".\",\"stream\":false,\"keep_alive\":\"${llama_keep_alive}\",\"options\":{\"temperature\":0,\"num_predict\":1}}" \
  >/dev/null 2>&1 && echo "Ollama warmup completed for model: ${llama_model}" \
  || echo "WARNING: Ollama warmup skipped (model may not be pulled yet — run: ollama pull ${llama_model})"

# ── 3. ASR Worker (Parakeet) ───────────────────────────────────────
if curl -sf --max-time 1 "http://127.0.0.1:8787/health" >/dev/null 2>&1; then
  echo "Parakeet ASR already running on :8787"
else
  ASR_VENV="${REPO_ROOT}/.venv-asr/bin/python"
  ASR_SCRIPT="${REPO_ROOT}/scripts/parakeet-asr-worker.py"

  if [ -x "$ASR_VENV" ] && [ -f "$ASR_SCRIPT" ]; then
    echo "Starting Parakeet ASR worker..."
    "$ASR_VENV" "$ASR_SCRIPT" &
    ASR_PID=$!
    echo "ASR worker started (pid $ASR_PID)"

    if wait_http_ok "http://127.0.0.1:8787/health" 30 "Parakeet ASR"; then
      echo "Parakeet ASR is ready (CPU mode)"
    else
      echo "WARNING: Parakeet ASR worker started but did not become ready."
    fi
  else
    echo "WARNING: ASR venv not found at ${ASR_VENV}"
    echo "  Set up with: python3.12 -m venv .venv-asr && .venv-asr/bin/pip install onnx_asr onnxruntime fastapi uvicorn pydantic"
  fi
fi

# ── 4. Kill existing FeatherTalk Electron ───────────────────────────
pkill -f "electron.*src/desktop/main.js" 2>/dev/null && sleep 0.3 || true

# ── 5. Launch desktop app ──────────────────────────────────────────
echo "Starting FeatherTalk desktop..."
cd "$REPO_ROOT"
npx electron src/desktop/main.js
