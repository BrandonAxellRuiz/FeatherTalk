function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildHotkeyHelpHtml(entries, isMac) {
  const rows = entries
    .map(
      (e) => `
        <tr role="row">
          <td role="cell" class="action">${escapeHtml(e.action)}</td>
          <td role="cell" class="key${!isMac ? " current" : ""}">${escapeHtml(e.winLabel)}</td>
          <td role="cell" class="key${isMac ? " current" : ""}">${escapeHtml(e.macLabel)}</td>
        </tr>`
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk \u2014 Atajos de teclado</title>
  <style>
    :root { color-scheme: dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #title-bar {
      height: 36px;
      background: #0c1323;
      display: flex;
      align-items: center;
      padding: 0 16px;
      -webkit-app-region: drag;
      font-size: 13px;
      color: #94a3b8;
      flex-shrink: 0;
    }

    #content {
      flex: 1;
      padding: 20px 24px;
      overflow-y: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #1e293b;
    }

    td {
      padding: 8px 12px;
      font-size: 13px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.5);
    }

    .action { color: #cbd5e1; }

    .key {
      font-family: "SF Mono", "Consolas", "Menlo", monospace;
      font-size: 12px;
      color: #64748b;
    }

    .current {
      color: #a5b4fc !important;
      font-weight: 600;
    }

    th.current { color: #818cf8 !important; }

    .close-hint {
      text-align: center;
      font-size: 11px;
      color: #475569;
      padding: 12px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div id="title-bar">FeatherTalk \u2014 Atajos de teclado</div>
  <div id="content" role="dialog" aria-label="FeatherTalk - Atajos de teclado">
    <table role="table" aria-label="Tabla de atajos de teclado">
      <thead>
        <tr role="row">
          <th class="action" scope="col">Accion</th>
          <th class="key${!isMac ? " current" : ""}" scope="col">Windows</th>
          <th class="key${isMac ? " current" : ""}" scope="col">macOS</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
  <div class="close-hint" role="button" tabindex="0" aria-label="Cerrar ventana">Presiona Esc para cerrar</div>
  <script>
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") window.close();
    });
    document.querySelector(".close-hint").addEventListener("keydown", (e) => {
      if (e.key === "Enter") window.close();
    });
  </script>
</body>
</html>`;
}
