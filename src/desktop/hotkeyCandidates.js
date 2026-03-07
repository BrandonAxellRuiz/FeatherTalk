export const DEFAULT_HOTKEY_FALLBACKS = Object.freeze([
  "Ctrl+Shift+Space",
  "Ctrl+Alt+Space",
  "Ctrl+Space"
]);

function hasAltModifier(hotkey) {
  return /\balt\b/i.test(hotkey);
}

export function buildHotkeyCandidates(primary, fallbacks = DEFAULT_HOTKEY_FALLBACKS) {
  const primaryValue = typeof primary === "string" ? primary.trim() : "";
  const fallbackValues = (Array.isArray(fallbacks) ? fallbacks : [])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => value !== primaryValue);

  const uniqueFallbacks = [...new Set(fallbackValues)];
  const nonAltFallbacks = uniqueFallbacks.filter(
    (value) => !hasAltModifier(value)
  );
  const altFallbacks = uniqueFallbacks.filter(hasAltModifier);

  const combined = [primaryValue, ...nonAltFallbacks, ...altFallbacks].filter(
    Boolean
  );

  return [...new Set(combined)];
}
