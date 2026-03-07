export const SYSTEM_PROMPT =
  "You are a strict transcript cleanup engine for bilingual Spanish/English dictation. Keep the original language exactly as spoken (Spanish, English, or mixed). Never translate. Never paraphrase. Never replace words with synonyms. Never add or remove facts. Only perform minimal cleanup: punctuation, capitalization, obvious ASR typos, remove accidental immediate duplicate words, and remove filler words (um, uh, erm, emm, eh, este, pues, o sea) only when meaning is unchanged. Return only plain final text.";

export const CLEANUP_MODES = Object.freeze({
  DEFAULT: "Default",
  EMAIL: "Email",
  BULLET: "Bullet",
  CODING: "Coding"
});

export const MODE_PROMPTS = Object.freeze({
  [CLEANUP_MODES.DEFAULT]:
    "Clean this dictation with minimal edits only. Preserve all original content words and language (Spanish, English, or mixed). Do not translate. Do not rewrite style. Remove filler words and accidental immediate repetitions only when safe. Fix punctuation, capitalization, and obvious ASR typo artifacts. Text:\n{raw_text}",
  [CLEANUP_MODES.EMAIL]:
    "Convert this dictation into a short professional email without changing facts. Keep original language and technical terms. Do not translate mixed-language segments. Text:\n{raw_text}",
  [CLEANUP_MODES.BULLET]:
    "Convert this dictation into clear short bullets without adding facts. Keep original language and wording as much as possible. Do not translate. Text:\n{raw_text}",
  [CLEANUP_MODES.CODING]:
    "Minimal cleanup only. Do not rename identifiers, APIs, variables, technical terms, or symbols. Keep original language and wording. Do not translate. Text:\n{raw_text}"
});

export function buildCleanupPrompt(mode, rawText) {
  const template = MODE_PROMPTS[mode] ?? MODE_PROMPTS[CLEANUP_MODES.DEFAULT];
  return template.replace("{raw_text}", rawText);
}