const MAC_SYMBOLS = {
  ctrl: "\u2318",
  control: "\u2318",
  win: "\u2303",
  meta: "\u2303",
  alt: "\u2325",
  option: "\u2325",
  shift: "\u21E7"
};

export function formatHotkey(hotkey, platform = process.platform) {
  if (!hotkey || typeof hotkey !== "string") return "";
  if (platform !== "darwin") return hotkey;

  return hotkey
    .split("+")
    .map((token) => {
      const key = token.trim().toLowerCase();
      return MAC_SYMBOLS[key] ?? token.trim();
    })
    .join("");
}

export const SECONDARY_HOTKEYS = Object.freeze([
  { id: "mode-1", action: "Modo Default", hotkey: "Ctrl+Win+1" },
  { id: "mode-2", action: "Modo Email", hotkey: "Ctrl+Win+2" },
  { id: "mode-3", action: "Modo Bullet", hotkey: "Ctrl+Win+3" },
  { id: "mode-4", action: "Modo Coding", hotkey: "Ctrl+Win+4" },
  { id: "mode-cycle", action: "Cambiar modo", hotkey: "Ctrl+Win+M" },
  { id: "undo", action: "Deshacer pegado", hotkey: "Ctrl+Win+Z" },
  { id: "retry", action: "Reintentar limpieza", hotkey: "Ctrl+Win+R" },
  { id: "cancel", action: "Cancelar grabacion", hotkey: "Escape" },
  { id: "menu", action: "Abrir menu de bandeja", hotkey: "Ctrl+Win+H" }
]);

export function buildFullReference(toggleHotkey = "Ctrl+Win+Space") {
  return [
    { id: "toggle", action: "Iniciar/detener dictado", hotkey: toggleHotkey },
    ...SECONDARY_HOTKEYS
  ];
}
