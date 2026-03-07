export class PasteController {
  #paster;
  #clipboard = "";
  #lastPasted = null;

  constructor({ paster } = {}) {
    this.#paster = paster ?? null;
  }

  async pasteText(text) {
    const previousClipboard = this.#clipboard;
    this.#clipboard = text;

    let result;

    if (this.#paster) {
      result = await this.#paster(text);
    } else {
      result = { pasted: true, copied_to_clipboard: false };
    }

    if (result.pasted) {
      this.#lastPasted = text;
      this.#clipboard = previousClipboard;
      return { pasted: true, copied_to_clipboard: false };
    }

    this.#clipboard = text;
    return {
      pasted: false,
      copied_to_clipboard: true,
      error: result.error ?? "Paste blocked"
    };
  }

  get clipboard() {
    return this.#clipboard;
  }

  get lastPasted() {
    return this.#lastPasted;
  }
}
