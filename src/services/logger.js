import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveLogsDir } from "./appPaths.js";

const LEVELS = Object.freeze({
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR"
});

function toIsoTimestamp() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "\"[unserializable]\"";
  }
}

function serializeErrorCause(cause, depth) {
  if (!cause || depth > 2) {
    return undefined;
  }

  if (cause instanceof Error) {
    const nested = {
      name: cause.name,
      message: cause.message,
      code: cause.code,
      errno: cause.errno,
      syscall: cause.syscall,
      address: cause.address,
      port: cause.port,
      stack: cause.stack
    };

    const child = serializeErrorCause(cause.cause, depth + 1);
    if (child) {
      nested.cause = child;
    }

    return nested;
  }

  if (typeof cause === "object") {
    const nested = {};
    for (const key of [
      "name",
      "message",
      "code",
      "errno",
      "syscall",
      "address",
      "port"
    ]) {
      if (cause[key] !== undefined) {
        nested[key] = cause[key];
      }
    }

    const child = serializeErrorCause(cause.cause, depth + 1);
    if (child) {
      nested.cause = child;
    }

    if (Object.keys(nested).length > 0) {
      return nested;
    }
  }

  return { message: String(cause) };
}

export function serializeError(error) {
  if (!error) {
    return { message: "unknown error" };
  }

  const payload = {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
    port: error.port,
    stack: error.stack
  };

  const cause = serializeErrorCause(error.cause, 0);
  if (cause) {
    payload.cause = cause;
  }

  return payload;
}

function createLine(level, message, meta) {
  const head = `[${toIsoTimestamp()}] [${level}] ${message}`;
  if (meta === undefined) {
    return head;
  }

  return `${head} ${safeJson(meta)}`;
}

function noOp() {}

function isBrokenConsoleError(error) {
  if (!error) {
    return false;
  }

  if (error.code === "EPIPE" || error.code === "ERR_STREAM_DESTROYED") {
    return true;
  }

  const message = String(error.message ?? "");
  return message.includes("EPIPE") || message.includes("stream is destroyed");
}

function defaultConsoleWriter(level, line) {
  try {
    if (level === LEVELS.ERROR) {
      console.error(line);
      return;
    }

    if (level === LEVELS.WARN) {
      console.warn(line);
      return;
    }

    console.log(line);
  } catch (error) {
    if (isBrokenConsoleError(error)) {
      return;
    }

    throw error;
  }
}

export class FeatherLogger {
  #logFilePath;
  #consoleWriter;

  constructor({ logFilePath = null, consoleWriter } = {}) {
    this.#logFilePath = logFilePath;
    this.#consoleWriter = consoleWriter ?? defaultConsoleWriter;
  }

  async #write(level, message, meta) {
    const line = createLine(level, message, meta);
    this.#consoleWriter(level, line);

    if (!this.#logFilePath) {
      return;
    }

    try {
      await appendFile(this.#logFilePath, `${line}\n`, "utf8");
    } catch {
      // Keep app alive even if log file is not writable.
    }
  }

  debug(message, meta) {
    this.#write(LEVELS.DEBUG, message, meta).catch(noOp);
  }

  info(message, meta) {
    this.#write(LEVELS.INFO, message, meta).catch(noOp);
  }

  warn(message, meta) {
    this.#write(LEVELS.WARN, message, meta).catch(noOp);
  }

  error(message, meta) {
    this.#write(LEVELS.ERROR, message, meta).catch(noOp);
  }

  get logFilePath() {
    return this.#logFilePath;
  }
}

export async function createAppLogger() {
  const dir = resolveLogsDir();
  await mkdir(dir, { recursive: true });
  const logFilePath = path.join(dir, "app.log");
  const logger = new FeatherLogger({ logFilePath });

  logger.info("Logger initialized", { logFilePath });
  return logger;
}

export function createConsoleLogger() {
  return new FeatherLogger({ logFilePath: null });
}