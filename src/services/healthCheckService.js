export class HealthCheckService {
  #fetchImpl;
  #asrEndpoint;
  #llamaBackend;
  #llamaBaseUrl;
  #timeoutMs;
  #pollTimer = null;
  #lastStatus = null;

  constructor({
    fetchImpl = globalThis.fetch,
    asrEndpoint,
    llamaBackend = "ollama",
    llamaBaseUrl,
    timeoutMs = 5000
  } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#asrEndpoint = asrEndpoint;
    this.#llamaBackend = llamaBackend;
    this.#llamaBaseUrl = llamaBaseUrl;
    this.#timeoutMs = timeoutMs;
  }

  startPolling(intervalMs, onChange) {
    this.stopPolling();
    this.#pollTimer = setInterval(async () => {
      try {
        const result = await this.checkAll();
        const prev = this.#lastStatus;
        this.#lastStatus = result;

        const changed =
          !prev ||
          prev.asr.ok !== result.asr.ok ||
          prev.llama.ok !== result.llama.ok;

        if (changed) {
          onChange?.(result);
        }
      } catch {
        // Non-fatal polling error
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  get lastStatus() {
    return this.#lastStatus;
  }

  async checkAsr() {
    if (!this.#asrEndpoint) {
      return { ok: false, error: "ASR endpoint not configured" };
    }

    try {
      const url = new URL(this.#asrEndpoint);
      url.pathname = "/health";
      const healthUrl = url.toString();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      const response = await this.#fetchImpl(healthUrl, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timer);
      return { ok: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async checkLlama() {
    if (!this.#llamaBaseUrl) {
      return { ok: false, error: "Llama base URL not configured" };
    }

    const healthUrl = this.#llamaBackend === "ollama"
      ? `${this.#llamaBaseUrl}/api/tags`
      : `${this.#llamaBaseUrl}/health`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

      const response = await this.#fetchImpl(healthUrl, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timer);
      return { ok: response.ok, error: response.ok ? null : `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async checkAll() {
    const [asr, llama] = await Promise.all([
      this.checkAsr(),
      this.checkLlama()
    ]);

    return { asr, llama };
  }
}
