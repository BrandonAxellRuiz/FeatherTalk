export class PreviewService {
  #autoResolve;

  constructor({ autoResolve } = {}) {
    this.#autoResolve = autoResolve ?? null;
  }

  async showPreview(input) {
    const text = typeof input === "string" ? input : input.text;
    if (this.#autoResolve) {
      return this.#autoResolve(text);
    }

    return { action: "paste", text };
  }
}
