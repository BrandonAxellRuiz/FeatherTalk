export const HISTORY_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk — Historial</title>
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
      justify-content: space-between;
      padding: 0 16px;
      -webkit-app-region: drag;
      font-size: 13px;
      color: #94a3b8;
      flex-shrink: 0;
    }

    #toolbar {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      flex-shrink: 0;
      border-bottom: 1px solid #1e293b;
      align-items: center;
    }

    #search {
      flex: 1;
      padding: 7px 12px;
      font-size: 13px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    #filter-mode {
      padding: 7px 10px;
      font-size: 12px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
    }

    #stats-panel {
      display: none;
      padding: 12px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    #stats-panel.visible { display: block; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    .stat-card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
      text-align: center;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #f1f5f9;
    }

    .stat-label {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    #entries-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px;
    }

    .entry {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 150ms;
    }

    .entry:hover { border-color: #475569; }

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .entry-text {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entry-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    .mode-badge {
      background: #334155;
      color: #a5b4fc;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    .entry-detail {
      display: none;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .entry-detail.visible { display: block; }

    .detail-label {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 2px;
    }

    .detail-text {
      font-size: 12px;
      color: #94a3b8;
      background: rgba(0,0,0,0.2);
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 6px;
      white-space: pre-wrap;
      max-height: 80px;
      overflow-y: auto;
      line-height: 1.5;
    }

    .entry-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }

    .entry-actions button {
      padding: 4px 12px;
      font-size: 11px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    .btn-copy { background: #334155; color: #d1d5db; }
    .btn-copy:hover { background: #475569; }
    .btn-retry { background: #4f46e5; color: white; }
    .btn-retry:hover { background: #4338ca; }

    #bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      border-top: 1px solid #1e293b;
      flex-shrink: 0;
    }

    #bottom-bar button {
      padding: 6px 16px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    .btn-stats { background: #334155; color: #d1d5db; }
    .btn-stats:hover { background: #475569; }
    .btn-export { background: #334155; color: #d1d5db; }
    .btn-export:hover { background: #475569; }
    .btn-clear { background: #7f1d1d; color: #fca5a5; }
    .btn-clear:hover { background: #991b1b; }

    .export-group { display: flex; gap: 4px; }

    #empty-state {
      display: none;
      text-align: center;
      padding: 60px 20px;
      color: #475569;
      font-size: 14px;
    }

    #confirm-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    #confirm-overlay.visible { display: flex; }
    #confirm-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 24px 28px;
      text-align: center;
      max-width: 340px;
    }
    #confirm-box p { font-size: 14px; color: #e2e8f0; margin-bottom: 18px; }
    .confirm-actions { display: flex; gap: 10px; justify-content: center; }
    .confirm-actions button { min-width: 70px; }
    #confirm-yes { background: #ef4444; color: white; }
    #confirm-no { background: #334155; color: #d1d5db; }

    #entry-count { font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div id="title-bar">
    <span>FeatherTalk — Historial</span>
  </div>

  <div id="toolbar" role="toolbar" aria-label="Filtros de historial">
    <input type="text" id="search" placeholder="Buscar dictados..." aria-label="Buscar en historial" />
    <select id="filter-mode" aria-label="Filtrar por modo">
      <option value="">Todos</option>
      <option value="Default">Default</option>
      <option value="Email">Email</option>
      <option value="Bullet">Bullet</option>
      <option value="Coding">Coding</option>
    </select>
  </div>

  <div id="stats-panel" role="region" aria-label="Estadisticas">
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="stat-total">0</div>
        <div class="stat-label">Dictados</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-time-saved">0m</div>
        <div class="stat-label">Tiempo ahorrado</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-top-mode">—</div>
        <div class="stat-label">Modo mas usado</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-avg-latency">0s</div>
        <div class="stat-label">Latencia promedio</div>
      </div>
    </div>
  </div>

  <div id="entries-list" role="list" aria-label="Lista de dictados" aria-live="polite"></div>
  <div id="empty-state">No hay dictados en el historial</div>

  <div id="bottom-bar">
    <div style="display:flex;gap:6px;">
      <button class="btn-stats" id="btn-toggle-stats">Estadisticas</button>
      <span id="entry-count"></span>
    </div>
    <div style="display:flex;gap:6px;">
      <div class="export-group">
        <button class="btn-export" id="btn-export-csv">CSV</button>
        <button class="btn-export" id="btn-export-json">JSON</button>
        <button class="btn-export" id="btn-export-txt">TXT</button>
      </div>
      <button class="btn-clear" id="btn-clear">Limpiar</button>
    </div>
  </div>

  <div id="confirm-overlay">
    <div id="confirm-box">
      <p>¿Eliminar todo el historial?</p>
      <div class="confirm-actions">
        <button id="confirm-no">No</button>
        <button id="confirm-yes">Si</button>
      </div>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    let allEntries = [];
    const searchEl = document.getElementById("search");
    const filterEl = document.getElementById("filter-mode");
    const listEl = document.getElementById("entries-list");
    const emptyEl = document.getElementById("empty-state");
    const countEl = document.getElementById("entry-count");

    function formatDate(ts) {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    function formatMs(ms) {
      return (ms / 1000).toFixed(1) + "s";
    }

    function truncate(text, max) {
      if (!text) return "";
      return text.length > max ? text.slice(0, max) + "..." : text;
    }

    function computeStats(entries) {
      const total = entries.length;
      if (total === 0) return;

      document.getElementById("stat-total").textContent = total;

      // Estimate time saved: assume 40 WPM typing, average 5 chars per word
      let totalWords = 0;
      let totalElapsed = 0;
      const modes = {};
      for (const e of entries) {
        const words = (e.finalText || "").split(/\s+/).filter(Boolean).length;
        totalWords += words;
        totalElapsed += e.elapsedMs || 0;
        modes[e.mode] = (modes[e.mode] || 0) + 1;
      }

      const typingMinutes = totalWords / 40;
      const dictationMinutes = totalElapsed / 60000;
      const saved = Math.max(0, typingMinutes - dictationMinutes);
      document.getElementById("stat-time-saved").textContent = saved < 60 ? Math.round(saved) + "m" : (saved / 60).toFixed(1) + "h";

      const topMode = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
      document.getElementById("stat-top-mode").textContent = topMode ? topMode[0] : "—";

      const avgLatency = total > 0 ? totalElapsed / total : 0;
      document.getElementById("stat-avg-latency").textContent = formatMs(avgLatency);
    }

    function renderEntries() {
      const query = searchEl.value.toLowerCase().trim();
      const modeFilter = filterEl.value;

      let filtered = allEntries;
      if (query) {
        filtered = filtered.filter(e =>
          (e.finalText || "").toLowerCase().includes(query) ||
          (e.rawText || "").toLowerCase().includes(query)
        );
      }
      if (modeFilter) {
        filtered = filtered.filter(e => e.mode === modeFilter);
      }

      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

      if (filtered.length === 0) {
        emptyEl.style.display = "block";
        countEl.textContent = "";
        return;
      }

      emptyEl.style.display = "none";
      countEl.textContent = filtered.length + " de " + allEntries.length;

      // Show newest first
      for (let i = filtered.length - 1; i >= 0; i--) {
        const e = filtered[i];
        const entry = document.createElement("div");
        entry.className = "entry";
        entry.setAttribute("role", "listitem");
        entry.setAttribute("tabindex", "0");

        const header = document.createElement("div");
        header.className = "entry-header";

        const textEl = document.createElement("div");
        textEl.className = "entry-text";
        textEl.textContent = truncate(e.finalText, 100);

        const badge = document.createElement("span");
        badge.className = "mode-badge";
        badge.textContent = e.mode || "Default";

        header.appendChild(textEl);
        header.appendChild(badge);

        const meta = document.createElement("div");
        meta.className = "entry-meta";

        const timeSpan = document.createElement("span");
        timeSpan.textContent = formatMs(e.elapsedMs || 0);
        const sourceSpan = document.createElement("span");
        sourceSpan.textContent = e.asrSource || "";
        const dateSpan = document.createElement("span");
        dateSpan.textContent = formatDate(e.timestamp);

        meta.appendChild(timeSpan);
        meta.appendChild(sourceSpan);
        meta.appendChild(dateSpan);

        const detail = document.createElement("div");
        detail.className = "entry-detail";

        const rawLabel = document.createElement("div");
        rawLabel.className = "detail-label";
        rawLabel.textContent = "Texto original (ASR):";
        const rawText = document.createElement("div");
        rawText.className = "detail-text";
        rawText.textContent = e.rawText || "";

        const finalLabel = document.createElement("div");
        finalLabel.className = "detail-label";
        finalLabel.textContent = "Texto limpio:";
        const finalText = document.createElement("div");
        finalText.className = "detail-text";
        finalText.textContent = e.finalText || "";

        const actions = document.createElement("div");
        actions.className = "entry-actions";

        const copyBtn = document.createElement("button");
        copyBtn.className = "btn-copy";
        copyBtn.textContent = "Copiar";
        copyBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          ipcRenderer.send("history:copy-entry", { text: e.finalText });
        });

        const retryBtn = document.createElement("button");
        retryBtn.className = "btn-retry";
        retryBtn.textContent = "Re-limpiar";
        retryBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          ipcRenderer.send("history:retry-entry", { rawText: e.rawText, mode: e.mode });
        });

        actions.appendChild(copyBtn);
        actions.appendChild(retryBtn);

        detail.appendChild(rawLabel);
        detail.appendChild(rawText);
        detail.appendChild(finalLabel);
        detail.appendChild(finalText);
        detail.appendChild(actions);

        entry.appendChild(header);
        entry.appendChild(meta);
        entry.appendChild(detail);

        entry.addEventListener("click", () => {
          detail.classList.toggle("visible");
        });
        entry.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            detail.classList.toggle("visible");
          }
        });

        listEl.appendChild(entry);
      }
    }

    searchEl.addEventListener("input", renderEntries);
    filterEl.addEventListener("change", renderEntries);

    // Toggle stats
    document.getElementById("btn-toggle-stats").addEventListener("click", () => {
      document.getElementById("stats-panel").classList.toggle("visible");
    });

    // Export
    document.getElementById("btn-export-csv").addEventListener("click", () => {
      ipcRenderer.send("history:export", { format: "csv" });
    });
    document.getElementById("btn-export-json").addEventListener("click", () => {
      ipcRenderer.send("history:export", { format: "json" });
    });
    document.getElementById("btn-export-txt").addEventListener("click", () => {
      ipcRenderer.send("history:export", { format: "txt" });
    });

    // Clear
    const overlay = document.getElementById("confirm-overlay");
    document.getElementById("btn-clear").addEventListener("click", () => {
      overlay.classList.add("visible");
    });
    document.getElementById("confirm-yes").addEventListener("click", () => {
      ipcRenderer.send("history:clear");
      overlay.classList.remove("visible");
    });
    document.getElementById("confirm-no").addEventListener("click", () => {
      overlay.classList.remove("visible");
    });
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) overlay.classList.remove("visible");
    });

    // Load entries
    ipcRenderer.on("history:loaded", (_event, entries) => {
      allEntries = entries || [];
      computeStats(allEntries);
      renderEntries();
    });

    ipcRenderer.on("history:cleared", () => {
      allEntries = [];
      computeStats([]);
      renderEntries();
    });

    ipcRenderer.on("history:exported", (_event, result) => {
      // Show feedback
    });

    ipcRenderer.send("history:load");

    // Keyboard
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (overlay.classList.contains("visible")) {
          overlay.classList.remove("visible");
        } else {
          window.close();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchEl.focus();
      }
    });
  </script>
</body>
</html>`;
