import { open } from "node:fs/promises";
import { createConsoleLogger, serializeError } from "./logger.js";

function defaultTranscriptFromPath(audioPath) {
  const name = audioPath.split(/[\\/]/).at(-1) ?? "audio.wav";
  return `dictado transcrito desde ${name}`;
}

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorText(error) {
  if (!error) {
    return "unknown error";
  }

  return `${error.message ?? error}`;
}

function isRetryableError(error) {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("abort")
  );
}

function isTransientAsrContentError(error) {
  const text = toErrorText(error).toLowerCase();
  return text.includes("empty raw_text") || text.includes("empty transcript");
}

function isAvailabilityError(error) {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("network") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("abort") ||
    text.includes("http 5") ||
    text.includes("http 429") ||
    text.includes("connection") ||
    text.includes("refused")
  );
}

function buildLanguageCandidates(language) {
  const normalized = `${language ?? "auto"}`.trim().toLowerCase();

  if (!normalized || normalized === "auto") {
    return ["auto", "es", "en"];
  }

  return [normalized];
}

const ENGLISH_STOPWORDS = new Set([
  "the",
  "and",
  "is",
  "are",
  "to",
  "of",
  "for",
  "in",
  "with",
  "that",
  "this",
  "you",
  "we",
  "it",
  "on",
  "at",
  "be",
  "have",
  "not",
  "do",
  "from"
]);

const SPANISH_STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "de",
  "del",
  "y",
  "que",
  "en",
  "con",
  "para",
  "por",
  "como",
  "es",
  "son",
  "se",
  "no",
  "lo",
  "le"
]);

function toLanguageTokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreLanguageSignals(text) {
  const tokens = toLanguageTokens(text);
  let english = 0;
  let spanish = 0;

  for (const token of tokens) {
    if (ENGLISH_STOPWORDS.has(token)) {
      english += 1;
    }

    if (SPANISH_STOPWORDS.has(token)) {
      spanish += 1;
    }
  }

  if (/[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00BF\u00A1]/i.test(String(text ?? ""))) {
    spanish += 2;
  }

  return { english, spanish, tokenCount: tokens.length };
}

function shouldProbeSpanishFromAuto(autoText) {
  const signals = scoreLanguageSignals(autoText);

  // Probe Spanish broadly in auto mode unless the auto transcript already
  // has clear Spanish evidence. This avoids English-biased auto outputs.
  if (signals.spanish >= 2) {
    return false;
  }

  return true;
}

function chooseBetweenAutoAndSpanish(autoResponse, spanishResponse) {
  const autoSignals = scoreLanguageSignals(autoResponse.raw_text);
  const spanishSignals = scoreLanguageSignals(spanishResponse.raw_text);

  const autoTokenCount = toLanguageTokens(autoResponse.raw_text).length;
  const spanishTokenCount = toLanguageTokens(spanishResponse.raw_text).length;

  if (spanishTokenCount === 0) {
    return { chosen: "auto", response: autoResponse };
  }

  const autoEnglishDominant = autoSignals.english >= autoSignals.spanish + 1;
  const spanishEnglishDominant =
    spanishSignals.english >= spanishSignals.spanish + 2;
  const spanishLooksMoreSpanish =
    spanishSignals.spanish > autoSignals.spanish ||
    spanishSignals.english < autoSignals.english ||
    spanishSignals.spanish >= 2;

  const spanishTooShortComparedToAuto =
    autoTokenCount >= 4 && spanishTokenCount < Math.floor(autoTokenCount * 0.4);

  const spanishClearlyBetterForSpanishSpeech =
    !spanishTooShortComparedToAuto &&
    autoEnglishDominant &&
    spanishLooksMoreSpanish &&
    !spanishEnglishDominant;

  if (spanishClearlyBetterForSpanishSpeech) {
    return { chosen: "es", response: spanishResponse };
  }

  // Keep auto only when both outputs look clearly English-dominant,
  // or when the Spanish-hint output is suspiciously short.
  if (
    (autoEnglishDominant && spanishEnglishDominant) ||
    spanishTooShortComparedToAuto
  ) {
    return { chosen: "auto", response: autoResponse };
  }

  // Bias toward the Spanish-hint result for bilingual dictation to avoid
  // English translation drift when speaking Spanish.
  return { chosen: "es", response: spanishResponse };
}

function buildAsrHint(endpoint) {
  return `Start ASR worker and verify ${endpoint}.`;
}

function summarizeBody(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.detail) {
      const detail =
        typeof parsed.detail === "string"
          ? parsed.detail
          : JSON.stringify(parsed.detail);
      return detail.length > 400 ? `${detail.slice(0, 400)}...` : detail;
    }
  } catch {
    // Body is not JSON; fall through to plain text handling.
  }

  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}...` : trimmed;
}

async function readErrorBody(response) {
  try {
    const text = await response.text();
    return summarizeBody(text);
  } catch {
    return "";
  }
}

async function validateWavFile(audioPath) {
  let handle;

  try {
    handle = await open(audioPath, "r");
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);

    if (bytesRead < 12) {
      return {
        ok: false,
        reason: `file is too small (${bytesRead} bytes)`
      };
    }

    const riff = header.toString("ascii", 0, 4);
    const wave = header.toString("ascii", 8, 12);

    if (riff !== "RIFF" || wave !== "WAVE") {
      return {
        ok: false,
        reason: `invalid header (expected RIFF/WAVE, got ${riff}/${wave})`
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `unable to read file: ${toErrorText(error)}`
    };
  } finally {
    if (handle) {
      await handle.close().catch(() => {});
    }
  }
}

export class AsrWorkerClient {
  #mockTranscriber;
  #endpoint;
  #timeoutMs;
  #fetchImpl;
  #fallbackClient;
  #retries;
  #retryDelayMs;
  #logger;
  #endpointCooldownMs;
  #endpointDisabledUntil = 0;

  constructor({
    transcriber,
    endpoint,
    timeoutMs = 90000,
    fetchImpl,
    fallbackClient,
    retries = 1,
    retryDelayMs = 450,
    endpointCooldownMs = 120000,
    logger
  } = {}) {
    this.#mockTranscriber = transcriber ?? null;
    this.#endpoint = endpoint ?? process.env.FEATHERTALK_ASR_URL ?? null;
    this.#timeoutMs = timeoutMs;
    this.#fetchImpl = fetchImpl ?? global.fetch;
    this.#fallbackClient = fallbackClient ?? null;
    this.#retries = retries;
    this.#retryDelayMs = retryDelayMs;
    this.#logger = logger ?? createConsoleLogger();
    this.#endpointCooldownMs = endpointCooldownMs;
  }

  #isEndpointTemporarilyDisabled() {
    return Date.now() < this.#endpointDisabledUntil;
  }

  #disableEndpointTemporarily(reason) {
    this.#endpointDisabledUntil = Date.now() + this.#endpointCooldownMs;
    this.#logger.warn("ASR endpoint temporarily disabled", {
      endpoint: this.#endpoint,
      cooldownMs: this.#endpointCooldownMs,
      reason
    });
  }

  async #callEndpoint(request, startedAt, languageOverride = null) {
    const timeout = withTimeoutSignal(this.#timeoutMs);
    const languageForRequest = languageOverride ?? request.language ?? "auto";

    try {
      const response = await this.#fetchImpl(this.#endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audio_path: request.audio_path ?? request.audioPath,
          language: languageForRequest,
          model_id: request.model_id ?? request.modelId,
          compute: request.compute ?? "auto"
        }),
        signal: timeout.signal
      });

      if (!response.ok) {
        const detail = await readErrorBody(response);
        const suffix = detail ? `: ${detail}` : "";
        throw new Error(`ASR worker HTTP ${response.status}${suffix}`);
      }

      const payload = await response.json();
      if (!payload?.raw_text || typeof payload.raw_text !== "string") {
        throw new Error("ASR worker returned empty raw_text");
      }

      return {
        raw_text: payload.raw_text,
        elapsed_ms: payload.elapsed_ms ?? Date.now() - startedAt,
        source: "parakeet-http",
        language_used: languageForRequest
      };
    } finally {
      timeout.clear();
    }
  }

  async #transcribeWithFallback(request, startedAt, warning) {
    if (!this.#fallbackClient) {
      throw new Error(warning);
    }

    try {
      const fallback = await this.#fallbackClient.transcribe(request);
      this.#logger.info("ASR fallback success", {
        source: fallback.source ?? "asr-fallback"
      });
      return {
        raw_text: fallback.raw_text ?? fallback.rawText,
        elapsed_ms: fallback.elapsed_ms ?? Date.now() - startedAt,
        source: fallback.source ?? "asr-fallback",
        warning
      };
    } catch (fallbackError) {
      this.#logger.error("ASR fallback failed", {
        error: serializeError(fallbackError)
      });
      throw new Error(
        `${warning} | Fallback failed: ${toErrorText(fallbackError)}`
      );
    }
  }

  async transcribe(request) {
    const startedAt = Date.now();

    if (!request?.audioPath) {
      throw new Error("audioPath is required");
    }

    if (this.#mockTranscriber) {
      return this.#mockTranscriber(request);
    }

    if (this.#endpoint) {
      const wavCheck = await validateWavFile(request.audioPath);
      if (!wavCheck.ok) {
        throw new Error(
          `Invalid WAV recording at ${request.audioPath}. ${wavCheck.reason}`
        );
      }

      if (this.#isEndpointTemporarilyDisabled() && this.#fallbackClient) {
        const warning =
          `ASR worker temporarily disabled at ${this.#endpoint}. ` +
          "Using Windows speech fallback.";
        this.#logger.warn("ASR endpoint is in cooldown; skipping HTTP request", {
          endpoint: this.#endpoint,
          disabledUntil: this.#endpointDisabledUntil
        });

        return this.#transcribeWithFallback(request, startedAt, warning);
      }

      const failures = [];
      const failureErrors = [];
      const languageCandidates = buildLanguageCandidates(request.language);
      const isAutoLanguageRequest =
        `${request.language ?? "auto"}`.trim().toLowerCase() === "auto";
      let deferredAutoResponse = null;

      this.#logger.info("ASR request start", {
        endpoint: this.#endpoint,
        compute: request.compute,
        modelId: request.modelId,
        language: request.language,
        languageCandidates
      });

      let abortCandidates = false;

      for (const languageCandidate of languageCandidates) {
        for (let attempt = 0; attempt <= this.#retries; attempt += 1) {
          try {
            const response = await this.#callEndpoint(
              request,
              startedAt,
              languageCandidate
            );
            this.#logger.info("ASR endpoint success", {
              endpoint: this.#endpoint,
              attempt,
              languageUsed: languageCandidate,
              elapsedMs: response.elapsed_ms,
              rawTextChars: response.raw_text.trim().length
            });

            if (isAutoLanguageRequest && languageCandidate === "auto") {
              const probeSpanish = shouldProbeSpanishFromAuto(response.raw_text);
              if (probeSpanish) {
                deferredAutoResponse = response;
                this.#logger.info(
                  "ASR auto transcript appears English-biased; probing Spanish hint",
                  {
                    endpoint: this.#endpoint,
                    rawTextChars: response.raw_text.trim().length
                  }
                );
                break;
              }
            }

            if (
              isAutoLanguageRequest &&
              languageCandidate === "es" &&
              deferredAutoResponse
            ) {
              const arbitration = chooseBetweenAutoAndSpanish(
                deferredAutoResponse,
                response
              );
              this.#logger.info("ASR language arbitration complete", {
                endpoint: this.#endpoint,
                chosen: arbitration.chosen
              });
              this.#endpointDisabledUntil = 0;
              return arbitration.response;
            }

            this.#endpointDisabledUntil = 0;
            return response;
          } catch (error) {
            failures.push(`[${languageCandidate}] ${toErrorText(error)}`);
            failureErrors.push(error);
            this.#logger.warn("ASR endpoint attempt failed", {
              endpoint: this.#endpoint,
              attempt,
              retries: this.#retries,
              languageUsed: languageCandidate,
              error: serializeError(error)
            });

            const canRetry =
              attempt < this.#retries &&
              (isRetryableError(error) || isTransientAsrContentError(error));
            if (canRetry) {
              await sleep(this.#retryDelayMs);
              continue;
            }

            if (isAvailabilityError(error)) {
              abortCandidates = true;
            }
            break;
          }
        }

        if (abortCandidates) {
          break;
        }
      }

      if (deferredAutoResponse) {
        this.#logger.warn(
          "ASR Spanish probe did not produce a better transcript; using auto result",
          {
            endpoint: this.#endpoint
          }
        );
        this.#endpointDisabledUntil = 0;
        return deferredAutoResponse;
      }

      const shouldCooldown = failureErrors.some((error) =>
        isAvailabilityError(error)
      );

      if (shouldCooldown) {
        this.#disableEndpointTemporarily(failures.join(" | "));
      } else {
        this.#logger.warn(
          "ASR endpoint kept active after non-availability failure",
          {
            endpoint: this.#endpoint,
            failures
          }
        );
      }

      if (shouldCooldown && this.#fallbackClient) {
        const warning =
          `ASR worker unavailable at ${this.#endpoint}. ` +
          "Using Windows speech fallback.";

        try {
          return await this.#transcribeWithFallback(request, startedAt, warning);
        } catch (fallbackError) {
          throw new Error(
            `ASR request failed at ${this.#endpoint}. ${buildAsrHint(
              this.#endpoint
            )} Details: ${failures.join(" | ")} | ${toErrorText(fallbackError)}`
          );
        }
      }

      if (!shouldCooldown) {
        throw new Error(
          `ASR returned empty/invalid transcript at ${this.#endpoint}. ` +
            "Parakeet endpoint is reachable but did not detect usable speech. " +
            "Retry speaking closer to the selected microphone, then check microphone device in settings. " +
            `Details: ${failures.join(" | ")}`
        );
      }

      throw new Error(
        `ASR request failed at ${this.#endpoint}. ${buildAsrHint(
          this.#endpoint
        )} Details: ${failures.join(" | ")}`
      );
    }

    if (this.#fallbackClient) {
      const warning = "ASR endpoint not configured. Using Windows speech fallback.";
      this.#logger.warn("ASR endpoint not configured; using fallback client", {
        audioPath: request.audioPath
      });

      return this.#transcribeWithFallback(request, startedAt, warning);
    }

    this.#logger.warn("ASR endpoint not configured; using stub transcript", {
      audioPath: request.audioPath
    });
    return {
      raw_text: defaultTranscriptFromPath(request.audioPath),
      elapsed_ms: Date.now() - startedAt,
      source: "asr-stub"
    };
  }
}
