export const PREVIEW_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk Preview</title>
  <style>
    :root { color-scheme: dark; }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      height: 100vh;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
    }

    #title-bar {
      height: 32px;
      background: #16162a;
      display: flex;
      align-items: center;
      padding: 0 12px;
      -webkit-app-region: drag;
      font-size: 12px;
      color: #888;
      flex-shrink: 0;
    }

    #editor {
      flex: 1;
      padding: 12px 16px;
      font-size: 14px;
      line-height: 1.6;
      background: #1a1a2e;
      color: #e0e0e0;
      border: none;
      outline: none;
      resize: none;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    #actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 16px 12px;
      flex-shrink: 0;
    }

    button {
      padding: 6px 18px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    #btn-paste {
      background: #4f46e5;
      color: white;
    }

    #btn-paste:hover { background: #4338ca; }

    #btn-cancel {
      background: #374151;
      color: #d1d5db;
    }

    #btn-cancel:hover { background: #4b5563; }

    .shortcut {
      font-size: 11px;
      color: #888;
      margin-left: 6px;
    }

    #stats {
      padding: 4px 14px;
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
    }

    #original-section {
      flex-shrink: 0;
    }
    #toggle-original {
      background: none;
      border: none;
      color: #64748b;
      font-size: 11px;
      cursor: pointer;
      padding: 6px 14px;
      width: 100%;
      text-align: left;
    }
    #toggle-original:hover {
      color: #94a3b8;
    }
    #original-text {
      display: none;
      padding: 6px 14px;
      font-size: 12px;
      color: #94a3b8;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      max-height: 80px;
      overflow-y: auto;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    #original-text.expanded {
      display: block;
    }
  </style>
</head>
<body>
  <div role="dialog" aria-label="Vista previa del dictado" style="display:flex;flex-direction:column;height:100vh">
  <div id="title-bar">Vista previa del dictado</div>
  <div id="original-section" role="region" aria-label="Texto original" style="display:none">
    <button id="toggle-original" type="button" aria-expanded="false">&#9654; Ver texto original</button>
    <div id="original-text"></div>
  </div>
  <textarea id="editor" spellcheck="false" aria-label="Texto del dictado" aria-describedby="stats"></textarea>
  <div id="stats" role="status" aria-live="polite">0 palabras &middot; 0 caracteres</div>
  <div id="actions">
    <button id="btn-cancel" aria-label="Cancelar">Cancelar <span class="shortcut">Esc</span></button>
    <button id="btn-paste" aria-label="Pegar">Pegar <span class="shortcut">Ctrl+Enter</span></button>
  </div>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    const editor = document.getElementById("editor");
    const btnPaste = document.getElementById("btn-paste");
    const btnCancel = document.getElementById("btn-cancel");

    function updateStats() {
      const text = editor.value;
      const chars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      document.getElementById("stats").textContent = words + " palabras \u00b7 " + chars + " caracteres";
    }

    editor.addEventListener("input", updateStats);

    document.getElementById("toggle-original").addEventListener("click", () => {
      const ot = document.getElementById("original-text");
      const btn = document.getElementById("toggle-original");
      const expanded = ot.classList.toggle("expanded");
      btn.textContent = (expanded ? "\u25bc" : "\u25b6") + " Ver texto original";
      btn.setAttribute("aria-expanded", expanded);
    });

    ipcRenderer.on("preview:show", (_event, payload) => {
      const text = typeof payload === "string" ? payload : payload.text;
      editor.value = text;
      editor.focus();
      editor.setSelectionRange(0, 0);
      updateStats();

      if (typeof payload === "object" && payload.originalText) {
        document.getElementById("original-text").textContent = payload.originalText;
        document.getElementById("original-section").style.display = "block";
      } else {
        document.getElementById("original-section").style.display = "none";
      }
    });

    function sendResult(action) {
      ipcRenderer.send("preview:result", { action, text: editor.value });
    }

    btnPaste.addEventListener("click", () => sendResult("paste"));
    btnCancel.addEventListener("click", () => sendResult("cancel"));

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        sendResult("cancel");
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        sendResult("paste");
      }
    });
  </script>
</body>
</html>`;
