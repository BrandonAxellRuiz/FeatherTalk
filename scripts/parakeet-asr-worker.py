from __future__ import annotations

import threading
import time
from pathlib import Path

import onnx_asr
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="FeatherTalk Parakeet ASR Worker", version="0.1.0")

MODEL_ALIAS_BY_ID = {
  "parakeet-tdt-0.6b": "nemo-parakeet-tdt-0.6b-v3",
  "parakeet-tdt-0.6b-v2": "nemo-parakeet-tdt-0.6b-v2",
  "parakeet-tdt-0.6b-v3": "nemo-parakeet-tdt-0.6b-v3"
}

_MODEL_CACHE = {}
_CACHE_LOCK = threading.Lock()


class TranscribeRequest(BaseModel):
  audio_path: str = Field(..., description="Absolute path to wav file")
  language: str = Field(default="auto")
  model_id: str = Field(default="parakeet-tdt-0.6b")
  compute: str = Field(default="auto")


class TranscribeResponse(BaseModel):
  raw_text: str
  elapsed_ms: int


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


def resolve_model_alias(model_id: str) -> str:
  return MODEL_ALIAS_BY_ID.get(model_id, "nemo-parakeet-tdt-0.6b-v3")


def build_providers(compute: str) -> list[str]:
  available = set(ort.get_available_providers())
  providers = []

  if compute in ("gpu", "auto"):
    for provider in ("CUDAExecutionProvider", "DmlExecutionProvider"):
      if provider in available:
        providers.append(provider)

  if "CPUExecutionProvider" in available:
    providers.append("CPUExecutionProvider")

  if not providers:
    providers = ["CPUExecutionProvider"]

  return providers


def get_model(model_alias: str, providers: list[str]):
  key = (model_alias, tuple(providers))

  with _CACHE_LOCK:
    if key not in _MODEL_CACHE:
      _MODEL_CACHE[key] = onnx_asr.load_model(model_alias, providers=providers)

    return _MODEL_CACHE[key]


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(payload: TranscribeRequest) -> TranscribeResponse:
  audio_path = Path(payload.audio_path)
  if not audio_path.exists():
    raise HTTPException(status_code=400, detail=f"audio file not found: {audio_path}")

  model_alias = resolve_model_alias(payload.model_id)
  providers = build_providers(payload.compute)

  started = time.perf_counter()

  try:
    model = get_model(model_alias, providers)

    kwargs = {}
    language = (payload.language or "auto").strip().lower()
    if language and language != "auto":
      kwargs["language"] = payload.language

    try:
      raw_text = model.recognize(str(audio_path), **kwargs)
    except TypeError:
      raw_text = model.recognize(str(audio_path))

    if isinstance(raw_text, list):
      raw_text = " ".join(str(part) for part in raw_text)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return TranscribeResponse(raw_text=str(raw_text).strip(), elapsed_ms=elapsed_ms)
  except HTTPException:
    raise
  except Exception as error:  # pragma: no cover
    raise HTTPException(
      status_code=500,
      detail={
        "error": str(error),
        "type": type(error).__name__,
        "model_alias": model_alias,
        "providers": providers,
        "audio_path": str(audio_path)
      }
    ) from error


if __name__ == "__main__":
  import uvicorn

  uvicorn.run(app, host="127.0.0.1", port=8787, log_level="info")