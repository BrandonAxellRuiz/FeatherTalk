import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CLEANUP_MODES, buildCleanupPrompt, SYSTEM_PROMPT } from "../modes/prompts.js";
import { LlamaCleanupError } from "../core/errors.js";
import { createConsoleLogger, serializeError } from "./logger.js";

function normalizeSpaces(text) {
  return text.replace(/\s+/g, " ").trim();
}

function sentenceCase(text) {
  if (!text) {
    return "";
  }

  const trimmed = normalizeSpaces(text);
  const head = trimmed.charAt(0).toUpperCase();
  const tail = trimmed.slice(1);
  const cased = `${head}${tail}`;

  if (/[.!?]$/.test(cased)) {
    return cased;
  }

  return `${cased}.`;
}

function toBullets(text) {
  const parts = text
    .split(/[.!?\n]+/)
    .map((part) => normalizeSpaces(part))
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  return parts.map((item) => `- ${item}`).join("\n");
}

function defaultClean(mode, rawText) {
  switch (mode) {
    case CLEANUP_MODES.BULLET:
      return toBullets(minimalCleanup(rawText));
    case CLEANUP_MODES.CODING:
      return minimalCleanup(rawText);
    case CLEANUP_MODES.EMAIL:
      return sentenceCase(minimalCleanup(rawText));
    case CLEANUP_MODES.DEFAULT:
    default:
      return minimalCleanup(rawText);
  }
}

function withTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function trimFence(text) {
  const compact = text.trim();

  if (compact.startsWith("```") && compact.endsWith("```")) {
    return compact.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  return compact;
}

function stripCommonPreamble(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return text;
  }

  const first = lines[0].toLowerCase();
  const looksLikePreamble =
    first.includes("cleaned dictation") ||
    first.includes("cleaned text") ||
    first.includes("final text") ||
    first.includes("texto limpio") ||
    first.includes("texto final") ||
    first.includes("resultado") ||
    first.startsWith("here is the cleaned") ||
    first.startsWith("aqui esta");

  if (!looksLikePreamble) {
    return text;
  }

  return lines.slice(1).join("\n");
}

function stripReasoningArtifacts(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const cleanedLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    const isReasoningStart =
      lower.startsWith("removed filler words") ||
      lower.startsWith("i removed the following") ||
      lower.startsWith("removed the following") ||
      lower.startsWith("changes made") ||
      lower.startsWith("edits made") ||
      lower.startsWith("not present, but") ||
      lower.startsWith("filler words removed");

    if (isReasoningStart) {
      break;
    }

    cleanedLines.push(line);
  }

  return cleanedLines.join("\n");
}

function removeFillerWords(text) {
  return text
    .replace(/\b(?:um+|uh+|erm+|emm+|hmm+|eh+|este+|pues)\b/gi, "")
    .replace(/\bo\s+sea\b/gi, "");
}

function collapseImmediateDuplicateWords(text) {
  return text.replace(/\b([\p{L}\p{N}_]+)\b(?:\s+\1\b)+/giu, "$1");
}

function normalizePunctuationSpacing(text) {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([\{])\s+/g, "$1")
    .replace(/\s+([)\]\}])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function minimalCleanup(rawText) {
  const normalized = normalizeSpaces(rawText);
  const noFillers = removeFillerWords(normalized);
  const deduped = collapseImmediateDuplicateWords(noFillers);
  return normalizePunctuationSpacing(deduped);
}

function toComparisonTokens(text) {
  return normalizeSpaces(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenOverlap(rawText, cleanedText) {
  const rawTokens = toComparisonTokens(rawText);
  const cleanedSet = new Set(toComparisonTokens(cleanedText));

  if (rawTokens.length === 0) {
    return 1;
  }

  let matches = 0;
  for (const token of rawTokens) {
    if (cleanedSet.has(token)) {
      matches += 1;
    }
  }

  return matches / rawTokens.length;
}

function postProcessCleanup(text) {
  const noFence = trimFence(text);
  const noPreamble = stripCommonPreamble(noFence);
  const noReasoning = stripReasoningArtifacts(noPreamble);
  const noFillers = removeFillerWords(noReasoning);
  const deduped = collapseImmediateDuplicateWords(noFillers);
  return normalizePunctuationSpacing(deduped);
}

function toErrorText(error) {
  if (!error) {
    return "unknown error";
  }

  return `${error.message ?? error}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionError(error) {
  const text = toErrorText(error).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("econnrefused") ||
    text.includes("network") ||
    text.includes("etimedout") ||
    text.includes("abort")
  );
}

function buildLlamaHint(backend, baseUrl) {
  if (backend === "ollama") {
    return `Start Ollama (ollama serve), verify model pull, and check ${baseUrl}.`;
  }

  if (backend === "llama.cpp") {
    return `Start llama.cpp server and verify ${baseUrl}.`;
  }

  return "Check local Llama backend configuration.";
}

export class LlamaCleanupClient {
  #cleaner;
  #backend;
  #model;
  #baseUrl;
  #timeoutMs;
  #fetchImpl;
  #httpRetries;
  #retryDelayMs;
  #autoStartOllama;
  #ollamaCommand;
  #logger;
  #spawnImpl;
  #keepAlive;
  #numPredict;
  #warmupPromise = null;

  constructor({
    cleaner,
    backend = "ollama",
    model = "llama3.1:8b",
    baseUrl,
    timeoutMs = 45000,
    fetchImpl,
    httpRetries = 1,
    retryDelayMs = 600,
    autoStartOllama = true,
    keepAlive = "30m",
    numPredict = 96,
    ollamaCommand = process.env.FEATHERTALK_OLLAMA_COMMAND ?? "ollama",
    logger,
    spawnImpl
  } = {}) {
    this.#cleaner = cleaner ?? null;
    this.#backend = backend;
    this.#model = model;
    this.#baseUrl =
      baseUrl ??
      (backend === "llama.cpp"
        ? process.env.FEATHERTALK_LLAMA_CPP_URL ?? "http://127.0.0.1:8080"
        : process.env.FEATHERTALK_OLLAMA_URL ?? "http://127.0.0.1:11434");
    this.#timeoutMs = timeoutMs;
    this.#fetchImpl = fetchImpl ?? global.fetch;
    this.#httpRetries = httpRetries;
    this.#retryDelayMs = retryDelayMs;
    this.#autoStartOllama = autoStartOllama;
    this.#keepAlive = keepAlive;
    this.#numPredict = numPredict;
    this.#ollamaCommand = ollamaCommand;
    this.#logger = logger ?? createConsoleLogger();
    this.#spawnImpl = spawnImpl ?? spawn;
  }

  #resolveOllamaCommand() {
    if (this.#ollamaCommand && this.#ollamaCommand.includes("\\")) {
      return this.#ollamaCommand;
    }

    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = path.join(localAppData, "Programs", "Ollama", "ollama.exe");
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return this.#ollamaCommand;
  }

  async #startOllamaServe() {
    const command = this.#resolveOllamaCommand();

    return new Promise((resolve) => {
      let proc;
      try {
        proc = this.#spawnImpl(command, ["serve"], {
          detached: true,
          stdio: "ignore",
          windowsHide: true
        });
      } catch (error) {
        this.#logger.warn("Failed to spawn ollama serve", {
          command,
          error: serializeError(error)
        });
        resolve({
          started: false,
          error: `spawn failed: ${toErrorText(error)}`,
          command
        });
        return;
      }

      let settled = false;

      proc.once("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.#logger.warn("Ollama serve process error", {
          command,
          error: serializeError(error)
        });
        resolve({
          started: false,
          error: `process error: ${toErrorText(error)}`,
          command
        });
      });

      setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          proc.unref();
        } catch {
          // ignore
        }
        this.#logger.info("Attempted to auto-start ollama serve", { command });
        resolve({ started: true, command });
      }, 120);
    });
  }

  async #fetchJson(url, body) {
    const timeout = withTimeoutSignal(this.#timeoutMs);
    try {
      const response = await this.#fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: timeout.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      timeout.clear();
    }
  }

  #estimatePredictFromRawText(rawText) {
    const normalized = normalizeSpaces(rawText ?? "");
    const approxTokens = Math.ceil(normalized.length / 3.5);
    return Math.max(96, Math.min(1024, approxTokens));
  }

  #resolveNumPredict(rawText, fallback = 96) {
    const configured = Number(this.#numPredict);
    if (Number.isFinite(configured) && configured <= 0) {
      return -1;
    }

    const estimated = this.#estimatePredictFromRawText(rawText);
    const base = Number.isFinite(configured) && configured > 0 ? configured : fallback;
    return Math.max(base, estimated);
  }

  #buildOllamaRequest(prompt, numPredict) {
    const resolvedNumPredict =
      Number.isFinite(numPredict) || numPredict === -1
        ? numPredict
        : this.#resolveNumPredict(prompt, 96);

    return {
      model: this.#model,
      system: SYSTEM_PROMPT,
      prompt,
      stream: false,
      keep_alive: this.#keepAlive,
      options: {
        temperature: 0,
        num_predict: resolvedNumPredict
      }
    };
  }

  async warmup() {
    if (this.#backend !== "ollama" || !this.#fetchImpl || !this.#baseUrl) {
      return false;
    }

    if (this.#warmupPromise) {
      return this.#warmupPromise;
    }

    this.#warmupPromise = this.#fetchJson(
      `${this.#baseUrl}/api/generate`,
      {
        model: this.#model,
        prompt: ".",
        stream: false,
        keep_alive: this.#keepAlive,
        options: {
          temperature: 0,
          num_predict: 1
        }
      }
    )
      .then(() => {
        this.#logger.info("Llama warmup succeeded", {
          baseUrl: this.#baseUrl,
          model: this.#model,
          keepAlive: this.#keepAlive
        });
        return true;
      })
      .catch((error) => {
        this.#logger.warn("Llama warmup failed", {
          baseUrl: this.#baseUrl,
          model: this.#model,
          error: serializeError(error)
        });
        return false;
      })
      .finally(() => {
        this.#warmupPromise = null;
      });

    return this.#warmupPromise;
  }

  async #cleanWithOllama({ prompt, rawText }) {
    const errors = [];
    const numPredict = this.#resolveNumPredict(rawText, 96);

    for (let attempt = 0; attempt <= this.#httpRetries; attempt += 1) {
      try {
        const payload = await this.#fetchJson(
          `${this.#baseUrl}/api/generate`,
          this.#buildOllamaRequest(prompt, numPredict)
        );

        if (!payload.response || typeof payload.response !== "string") {
          throw new Error("Ollama response is empty");
        }

        this.#logger.info("Llama cleanup succeeded via Ollama", {
          baseUrl: this.#baseUrl,
          model: this.#model,
          attempt
        });
        return trimFence(payload.response);
      } catch (error) {
        errors.push(toErrorText(error));
        this.#logger.warn("Llama cleanup attempt failed via Ollama", {
          attempt,
          baseUrl: this.#baseUrl,
          error: serializeError(error)
        });

        if (attempt === 0 && this.#autoStartOllama && isConnectionError(error)) {
          const startResult = await this.#startOllamaServe();
          if (startResult.started) {
            await sleep(1200);
            continue;
          }

          if (startResult.error) {
            errors.push(`auto-start failed: ${startResult.error}`);
          }
        }

        const canRetry = attempt < this.#httpRetries && isConnectionError(error);
        if (canRetry) {
          await sleep(this.#retryDelayMs);
          continue;
        }

        break;
      }
    }

    const hint = buildLlamaHint("ollama", this.#baseUrl);
    throw new LlamaCleanupError(
      `Ollama cleanup failed at ${this.#baseUrl}. ${hint} Details: ${errors.join(" | ")}`
    );
  }

  async #cleanWithLlamaCpp({ prompt, rawText }) {
    const errors = [];
    const resolved = this.#resolveNumPredict(rawText, 192);
    const nPredict = resolved > 0 ? resolved : 1024;

    for (let attempt = 0; attempt <= this.#httpRetries; attempt += 1) {
      try {
        const payload = await this.#fetchJson(`${this.#baseUrl}/completion`, {
          prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
          temperature: 0,
          n_predict: nPredict,
          stop: ["<|eot_id|>"]
        });

        const text = payload.content ?? payload.text ?? payload.response;

        if (!text || typeof text !== "string") {
          throw new Error("llama.cpp response is empty");
        }

        this.#logger.info("Llama cleanup succeeded via llama.cpp", {
          baseUrl: this.#baseUrl,
          attempt
        });
        return trimFence(text);
      } catch (error) {
        errors.push(toErrorText(error));
        this.#logger.warn("Llama cleanup attempt failed via llama.cpp", {
          attempt,
          baseUrl: this.#baseUrl,
          error: serializeError(error)
        });

        const canRetry = attempt < this.#httpRetries && isConnectionError(error);
        if (canRetry) {
          await sleep(this.#retryDelayMs);
          continue;
        }

        break;
      }
    }

    const hint = buildLlamaHint("llama.cpp", this.#baseUrl);
    throw new LlamaCleanupError(
      `llama.cpp cleanup failed at ${this.#baseUrl}. ${hint} Details: ${errors.join(" | ")}`
    );
  }

  #finalizeCleanup(selectedMode, rawText, outputText) {
    const cleaned = postProcessCleanup(outputText);

    if (!cleaned) {
      return minimalCleanup(rawText);
    }

    if (
      selectedMode === CLEANUP_MODES.EMAIL ||
      selectedMode === CLEANUP_MODES.BULLET
    ) {
      return cleaned;
    }

    const fallback = minimalCleanup(rawText);
    const overlap = tokenOverlap(rawText, cleaned);
    const lengthRatio = cleaned.length / Math.max(1, fallback.length);

    if (overlap < 0.7 || lengthRatio < 0.55 || lengthRatio > 1.45) {
      this.#logger.warn("Llama output drift detected; using conservative cleanup", {
        mode: selectedMode,
        overlap,
        lengthRatio
      });
      return fallback;
    }

    return cleaned;
  }

  async cleanText({ mode, rawText, context } = {}) {
    if (!rawText || typeof rawText !== "string") {
      throw new LlamaCleanupError("rawText is required for cleanup");
    }

    const selectedMode = mode ?? CLEANUP_MODES.DEFAULT;
    const prompt = buildCleanupPrompt(selectedMode, rawText);

    if (this.#cleaner) {
      const output = await this.#cleaner({
        mode: selectedMode,
        rawText,
        context: context ?? {},
        prompt,
        systemPrompt: SYSTEM_PROMPT
      });

      if (!output || typeof output !== "string") {
        throw new LlamaCleanupError("Llama returned an invalid response");
      }

      return this.#finalizeCleanup(selectedMode, rawText, output);
    }

    if (!this.#fetchImpl || !this.#baseUrl) {
      this.#logger.warn("Llama backend unavailable; using local default cleaner", {
        backend: this.#backend,
        baseUrl: this.#baseUrl
      });
      return defaultClean(selectedMode, rawText);
    }

    let outputText;
    if (this.#backend === "ollama") {
      outputText = await this.#cleanWithOllama({ prompt, rawText });
    } else if (this.#backend === "llama.cpp") {
      outputText = await this.#cleanWithLlamaCpp({ prompt, rawText });
    } else {
      throw new LlamaCleanupError(`Unsupported llama backend: ${this.#backend}`);
    }

    return this.#finalizeCleanup(selectedMode, rawText, outputText);
  }
}




