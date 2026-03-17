export const SETTINGS_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk — Configuracion</title>
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

    #title-bar button {
      -webkit-app-region: no-drag;
    }

    #content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .section {
      margin-bottom: 24px;
    }

    .section h3 {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #1e293b;
    }

    .field {
      margin-bottom: 12px;
    }

    label {
      display: block;
      font-size: 12px;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    input, select {
      width: 100%;
      padding: 7px 10px;
      font-size: 13px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    input[type="checkbox"] {
      width: auto;
      margin-right: 6px;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    #actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 24px 16px;
      flex-shrink: 0;
      border-top: 1px solid #1e293b;
    }

    button {
      padding: 7px 20px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    #btn-save { background: #4f46e5; color: white; }
    #btn-save:hover { background: #4338ca; }
    #btn-cancel { background: #334155; color: #d1d5db; }
    #btn-cancel:hover { background: #475569; }

    .hint {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    /* Card grouping */
    .settings-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px 18px;
      margin-bottom: 16px;
    }
    .settings-card h3 {
      margin-top: 0;
    }

    /* Hint text */
    .field-hint {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    /* Validation */
    input.invalid, select.invalid {
      border-color: #ef4444 !important;
      box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.3);
    }
    .field-error {
      font-size: 11px;
      color: #ef4444;
      margin-top: 2px;
      display: none;
    }
    input.invalid + .field-hint + .field-error,
    input.invalid + .field-error,
    input.invalid ~ .field-error {
      display: block;
    }

    /* Defaults button */
    #s-defaults {
      background: transparent;
      color: #94a3b8;
      border: 1px solid #475569;
      padding: 7px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      margin-right: auto;
    }
    #s-defaults:hover {
      background: #1e293b;
      color: #e2e8f0;
    }

    /* Confirm overlay */
    #confirm-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    #confirm-overlay.visible {
      display: flex;
    }
    #confirm-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 24px 28px;
      text-align: center;
      max-width: 340px;
    }
    #confirm-box p {
      font-size: 14px;
      color: #e2e8f0;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    #confirm-box .confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    #confirm-box .confirm-actions button {
      min-width: 70px;
    }
    #confirm-yes {
      background: #4f46e5;
      color: white;
    }
    #confirm-yes:hover {
      background: #4338ca;
    }
    #confirm-no {
      background: #334155;
      color: #d1d5db;
    }
    #confirm-no:hover {
      background: #475569;
    }
  </style>
</head>
<body>
  <div id="title-bar">
    <span>FeatherTalk — Configuracion</span>
  </div>

  <div id="content" role="dialog" aria-label="FeatherTalk Settings">
    <div class="section">
      <div class="settings-card">
        <h3>General</h3>
        <div class="row">
          <div class="field">
            <label for="s-hotkey">Hotkey principal</label>
            <input type="text" id="s-hotkey" aria-describedby="hint-hotkey" />
            <div class="field-hint" id="hint-hotkey">Combinación de teclas para iniciar/detener grabación</div>
          </div>
          <div class="field">
            <label for="s-mode">Modo de limpieza</label>
            <select id="s-mode">
              <option value="Default">Default</option>
              <option value="Email">Email</option>
              <option value="Bullet">Bullet</option>
              <option value="Coding">Coding</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-lang">Idioma</label>
            <select id="s-lang">
              <option value="auto">Auto</option>
              <option value="es">Espanol</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="field">
            <label for="s-paste">Modo de pegado</label>
            <select id="s-paste">
              <option value="powershell">PowerShell</option>
            </select>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="s-beeps" />
          <label for="s-beeps" style="margin-bottom:0;">Beeps de audio</label>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="s-preview" />
          <label for="s-preview" style="margin-bottom:0;">Vista previa antes de pegar</label>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>Audio</h3>
        <div class="row">
          <div class="field">
            <label for="s-mic">Microfono</label>
            <select id="s-mic" aria-describedby="hint-mic">
              <option value="default">Default</option>
            </select>
            <div class="field-hint" id="hint-mic">Selecciona el dispositivo de audio para grabación</div>
          </div>
          <div class="field">
            <label for="s-ffmpeg">Ruta ffmpeg</label>
            <input type="text" id="s-ffmpeg" aria-describedby="hint-ffmpeg" />
            <div class="field-hint" id="hint-ffmpeg">Ruta al ejecutable ffmpeg para captura de audio</div>
          </div>
        </div>
        <div class="checkbox-row">
          <input type="checkbox" id="s-dshow" />
          <label for="s-dshow" style="margin-bottom:0;">Permitir fallback DSHOW</label>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>ASR</h3>
        <div class="row">
          <div class="field">
            <label for="s-asr-url">ASR Worker URL</label>
            <input type="text" id="s-asr-url" data-validate="url" aria-describedby="hint-asr-url" />
            <div class="field-hint" id="hint-asr-url">URL del servidor Parakeet local (ej: http://127.0.0.1:8787)</div>
            <div class="field-error">URL inválida — debe comenzar con http:// o https://</div>
          </div>
          <div class="field">
            <label for="s-asr-model">Modelo ASR</label>
            <input type="text" id="s-asr-model" aria-describedby="hint-asr-model" />
            <div class="field-hint" id="hint-asr-model">Modelo de reconocimiento de voz (ej: parakeet-tdt-0.6b)</div>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-asr-compute">Compute</label>
            <select id="s-asr-compute" aria-describedby="hint-asr-compute">
              <option value="auto">Auto</option>
              <option value="gpu">GPU</option>
              <option value="cpu">CPU</option>
            </select>
            <div class="field-hint" id="hint-asr-compute">Auto detecta GPU disponible. Usa CPU como respaldo</div>
          </div>
          <div class="field">
            <label for="s-asr-timeout">Timeout (ms)</label>
            <input type="number" id="s-asr-timeout" data-validate="number" aria-describedby="hint-asr-timeout" />
            <div class="field-hint" id="hint-asr-timeout">Tiempo máximo de espera en milisegundos</div>
            <div class="field-error">Valor numérico inválido</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>Llama</h3>
        <div class="row">
          <div class="field">
            <label for="s-llama-backend">Backend</label>
            <select id="s-llama-backend">
              <option value="ollama">Ollama</option>
              <option value="llama.cpp">llama.cpp</option>
            </select>
          </div>
          <div class="field">
            <label for="s-llama-model">Modelo</label>
            <input type="text" id="s-llama-model" />
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-ollama-url">Ollama Base URL</label>
            <input type="text" id="s-ollama-url" data-validate="url" aria-describedby="hint-ollama-url" />
            <div class="field-hint" id="hint-ollama-url">URL del servidor Ollama local (ej: http://127.0.0.1:11434)</div>
            <div class="field-error">URL inválida — debe comenzar con http:// o https://</div>
          </div>
          <div class="field">
            <label for="s-llama-cpp-url">llama.cpp Base URL</label>
            <input type="text" id="s-llama-cpp-url" data-validate="url" aria-describedby="hint-llama-cpp-url" />
            <div class="field-hint" id="hint-llama-cpp-url">URL del servidor llama.cpp (ej: http://127.0.0.1:8080)</div>
            <div class="field-error">URL inválida — debe comenzar con http:// o https://</div>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-llama-timeout">Timeout (ms)</label>
            <input type="number" id="s-llama-timeout" data-validate="number" aria-describedby="hint-llama-timeout" />
            <div class="field-hint" id="hint-llama-timeout">Tiempo máximo de espera en milisegundos</div>
            <div class="field-error">Valor numérico inválido</div>
          </div>
          <div class="field">
            <label for="s-llama-predict">Num predict</label>
            <input type="number" id="s-llama-predict" data-validate="number" aria-describedby="hint-llama-predict" />
            <div class="field-hint" id="hint-llama-predict">Máximo de tokens a generar en la limpieza</div>
            <div class="field-error">Valor numérico inválido</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>Widget</h3>
        <div class="row">
          <div class="field">
            <label for="s-widget-pos">Posicion</label>
            <select id="s-widget-pos">
              <option value="top-center">Top center</option>
              <option value="top-left">Top left</option>
              <option value="top-right">Top right</option>
            </select>
          </div>
          <div class="field">
            <label for="s-widget-size">Tamano</label>
            <select id="s-widget-size">
              <option value="S">Pequeno</option>
              <option value="M">Mediano</option>
              <option value="L">Grande</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>Historial</h3>
        <div class="checkbox-row">
          <input type="checkbox" id="s-history-on" />
          <label for="s-history-on" style="margin-bottom:0;">Guardar historial de dictados</label>
        </div>
        <div class="field">
          <label for="s-history-days">Retencion (dias)</label>
          <input type="number" id="s-history-days" style="width:120px;" data-validate="number" aria-describedby="hint-history-days" />
          <div class="field-hint" id="hint-history-days">Días que se conservan los dictados en el historial</div>
          <div class="field-error">Valor numérico inválido</div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="settings-card">
        <h3>Modos personalizados</h3>
        <div class="field-hint" style="margin-bottom:12px;">Crea modos de limpieza con prompts personalizados. Usa {raw_text} como placeholder para el texto dictado.</div>
        <div id="custom-modes-list"></div>
        <button id="btn-add-mode" style="background:#334155;color:#d1d5db;margin-top:8px;font-size:12px;padding:5px 14px;">+ Agregar modo</button>
      </div>
    </div>

    <div class="section">
      <div class="settings-card">
        <h3>Modo por aplicación</h3>
        <div class="field-hint" style="margin-bottom:12px;">Asigna modos automáticos según la app activa (ej: OUTLOOK.EXE → Email).</div>
        <div id="app-mode-list"></div>
        <button id="btn-add-app-mode" style="background:#334155;color:#d1d5db;margin-top:8px;font-size:12px;padding:5px 14px;">+ Agregar regla</button>
      </div>
    </div>
  </div>

  <div id="actions">
    <button id="s-defaults" title="Restaurar valores por defecto">Restaurar defaults</button>
    <button id="btn-cancel">Cancelar</button>
    <button id="btn-save">Guardar</button>
  </div>

  <!-- Confirm overlay for restore defaults -->
  <div id="confirm-overlay">
    <div id="confirm-box">
      <p>¿Restaurar todos los valores por defecto?</p>
      <div class="confirm-actions">
        <button id="confirm-no">No</button>
        <button id="confirm-yes">Sí</button>
      </div>
    </div>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    const DEFAULTS = {
      hotkey: 'Ctrl+Win+Space',
      cleanupMode: 'Default',
      language: 'auto',
      pasteMode: 'powershell',
      beep: true,
      preview: false,
      microphone: '',
      ffmpegPath: '',
      dshowFallback: true,
      asrUrl: 'http://127.0.0.1:8787',
      asrModel: 'parakeet-tdt-0.6b',
      asrCompute: 'auto',
      asrTimeout: 30000,
      llamaBackend: 'ollama',
      llamaModel: 'llama3.1:8b',
      ollamaUrl: 'http://127.0.0.1:11434',
      llamaCppUrl: 'http://127.0.0.1:8080',
      llamaTimeout: 60000,
      llamaNumPredict: 512,
      widgetPosition: 'top-center',
      widgetSize: 'medium',
      historyEnabled: true,
      historyRetentionDays: 30
    };

    const fields = {
      "s-hotkey": "hotkey",
      "s-mode": "defaultMode",
      "s-lang": "language",
      "s-paste": "pasteMode",
      "s-beeps": "beepsEnabled",
      "s-preview": "previewBeforePaste",
      "s-mic": "microphoneDeviceId",
      "s-ffmpeg": "ffmpegPath",
      "s-dshow": "audioAllowDshowFallback",
      "s-asr-url": "asrWorkerUrl",
      "s-asr-model": "asrModelId",
      "s-asr-compute": "asrCompute",
      "s-asr-timeout": "asrTimeoutMs",
      "s-llama-backend": "llamaBackend",
      "s-llama-model": "llamaModel",
      "s-ollama-url": "ollamaBaseUrl",
      "s-llama-cpp-url": "llamaCppBaseUrl",
      "s-llama-timeout": "llamaTimeoutMs",
      "s-llama-predict": "llamaNumPredict",
      "s-widget-pos": "widget.position",
      "s-widget-size": "widget.size",
      "s-history-on": "history.enabled",
      "s-history-days": "history.retentionDays"
    };

    // Map element IDs to DEFAULTS keys for restore-defaults feature
    const defaultsMap = {
      "s-hotkey": "hotkey",
      "s-mode": "cleanupMode",
      "s-lang": "language",
      "s-paste": "pasteMode",
      "s-beeps": "beep",
      "s-preview": "preview",
      "s-mic": "microphone",
      "s-ffmpeg": "ffmpegPath",
      "s-dshow": "dshowFallback",
      "s-asr-url": "asrUrl",
      "s-asr-model": "asrModel",
      "s-asr-compute": "asrCompute",
      "s-asr-timeout": "asrTimeout",
      "s-llama-backend": "llamaBackend",
      "s-llama-model": "llamaModel",
      "s-ollama-url": "ollamaUrl",
      "s-llama-cpp-url": "llamaCppUrl",
      "s-llama-timeout": "llamaTimeout",
      "s-llama-predict": "llamaNumPredict",
      "s-widget-pos": "widgetPosition",
      "s-widget-size": "widgetSize",
      "s-history-on": "historyEnabled",
      "s-history-days": "historyRetentionDays"
    };

    function getNestedValue(obj, path) {
      return path.split(".").reduce((o, k) => o?.[k], obj);
    }

    function loadSettings(settings) {
      for (const [elId, settingKey] of Object.entries(fields)) {
        const el = document.getElementById(elId);
        if (!el) continue;
        const value = getNestedValue(settings, settingKey);

        if (el.type === "checkbox") {
          el.checked = !!value;
        } else if (el.type === "number") {
          el.value = value ?? "";
        } else {
          el.value = value ?? "";
        }
      }
    }

    function applyDefaults() {
      for (const [elId, defaultKey] of Object.entries(defaultsMap)) {
        const el = document.getElementById(elId);
        if (!el) continue;
        const value = DEFAULTS[defaultKey];

        if (el.type === "checkbox") {
          el.checked = !!value;
        } else {
          el.value = value ?? "";
        }
        // Clear any validation errors
        el.classList.remove("invalid");
      }
    }

    function validateField(input) {
      const val = input.value.trim();
      const type = input.dataset.validate;
      let valid = true;

      if (type === 'url' && val) {
        valid = /^https?:\/\/.+/.test(val);
      } else if (type === 'number' && val) {
        valid = !isNaN(Number(val)) && Number(val) >= 0;
      }

      input.classList.toggle('invalid', !valid);
      return valid;
    }

    function validateAll() {
      let allValid = true;
      document.querySelectorAll('[data-validate]').forEach(input => {
        if (!validateField(input)) {
          allValid = false;
        }
      });
      return allValid;
    }

    function collectSettings() {
      const patch = {};
      for (const [elId, settingKey] of Object.entries(fields)) {
        const el = document.getElementById(elId);
        if (!el) continue;

        let value;
        if (el.type === "checkbox") {
          value = el.checked;
        } else if (el.type === "number") {
          value = el.value ? Number(el.value) : undefined;
        } else {
          value = el.value;
        }

        if (settingKey.includes(".")) {
          const [parent, child] = settingKey.split(".");
          if (!patch[parent]) patch[parent] = {};
          patch[parent][child] = value;
        } else {
          patch[settingKey] = value;
        }
      }
      return patch;
    }

    ipcRenderer.on("settings:loaded", (_event, settings) => {
      loadSettings(settings);
    });

    // Validation event listeners
    document.querySelectorAll('[data-validate]').forEach(input => {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => {
        if (input.classList.contains('invalid')) validateField(input);
      });
    });

    // Save with validation
    document.getElementById("btn-save").addEventListener("click", () => {
      if (!validateAll()) return;
      const patch = collectSettings();
      ipcRenderer.send("settings:save", patch);
    });

    document.getElementById("btn-cancel").addEventListener("click", () => {
      window.close();
    });

    ipcRenderer.on("settings:saved", () => {
      window.close();
    });

    // Restore defaults with confirmation overlay
    const overlay = document.getElementById("confirm-overlay");

    document.getElementById("s-defaults").addEventListener("click", () => {
      overlay.classList.add("visible");
    });

    document.getElementById("confirm-yes").addEventListener("click", () => {
      applyDefaults();
      overlay.classList.remove("visible");
    });

    document.getElementById("confirm-no").addEventListener("click", () => {
      overlay.classList.remove("visible");
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("visible");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (overlay.classList.contains("visible")) {
          overlay.classList.remove("visible");
        } else {
          window.close();
        }
      }
    });

    // Mic device enumeration
    ipcRenderer.on("settings:mic-devices", (_event, devices) => {
      const select = document.getElementById("s-mic");
      const currentVal = select.value;
      while (select.options.length > 1) select.remove(1);
      for (const dev of devices) {
        const opt = document.createElement("option");
        opt.value = dev.id;
        opt.textContent = dev.label || dev.id;
        select.appendChild(opt);
      }
      if (currentVal) select.value = currentVal;
    });
    ipcRenderer.send("settings:enumerate-mics");

    // Custom modes UI — safe DOM methods
    function createCustomModeRow(name, prompt) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:10px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;";
      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
      const nameInput = document.createElement("input");
      nameInput.type = "text"; nameInput.className = "cm-name"; nameInput.value = name;
      nameInput.placeholder = "Nombre";
      nameInput.style.cssText = "width:40%;padding:4px 8px;font-size:12px;border:1px solid #475569;border-radius:4px;background:#1e293b;color:#e2e8f0;";
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Eliminar";
      removeBtn.style.cssText = "background:#ef4444;color:white;font-size:11px;padding:3px 10px;border-radius:4px;";
      removeBtn.addEventListener("click", () => row.remove());
      header.appendChild(nameInput); header.appendChild(removeBtn);
      const promptArea = document.createElement("textarea");
      promptArea.className = "cm-prompt"; promptArea.rows = 3; promptArea.value = prompt;
      promptArea.placeholder = "Prompt con {raw_text}";
      promptArea.style.cssText = "width:100%;padding:6px 8px;font-size:12px;border:1px solid #475569;border-radius:4px;background:#1e293b;color:#e2e8f0;resize:vertical;font-family:Segoe UI,Arial,sans-serif;";
      row.appendChild(header); row.appendChild(promptArea);
      return row;
    }
    function renderCustomModes(customModes) {
      const container = document.getElementById("custom-modes-list");
      while (container.firstChild) container.removeChild(container.firstChild);
      for (const [n, p] of Object.entries(customModes || {})) container.appendChild(createCustomModeRow(n, p));
    }
    document.getElementById("btn-add-mode").addEventListener("click", () => {
      document.getElementById("custom-modes-list").appendChild(createCustomModeRow("", "Text:\n{raw_text}"));
    });

    // App mode mapping UI — safe DOM methods
    function createAppModeRow(appName, mode) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center;";
      const appInput = document.createElement("input");
      appInput.type = "text"; appInput.className = "am-app"; appInput.value = appName;
      appInput.placeholder = "Nombre proceso (ej: OUTLOOK.EXE)";
      appInput.style.cssText = "flex:1;padding:5px 8px;font-size:12px;border:1px solid #475569;border-radius:4px;background:#1e293b;color:#e2e8f0;";
      const modeInput = document.createElement("input");
      modeInput.type = "text"; modeInput.className = "am-mode"; modeInput.value = mode;
      modeInput.placeholder = "Modo";
      modeInput.style.cssText = "width:120px;padding:5px 8px;font-size:12px;border:1px solid #475569;border-radius:4px;background:#1e293b;color:#e2e8f0;";
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "X"; removeBtn.className = "am-remove";
      removeBtn.style.cssText = "background:#ef4444;color:white;font-size:11px;padding:3px 8px;border-radius:4px;";
      removeBtn.addEventListener("click", () => row.remove());
      row.appendChild(appInput); row.appendChild(modeInput); row.appendChild(removeBtn);
      return row;
    }
    function renderAppModes(appModeMap) {
      const container = document.getElementById("app-mode-list");
      while (container.firstChild) container.removeChild(container.firstChild);
      for (const [a, m] of Object.entries(appModeMap || {})) container.appendChild(createAppModeRow(a, m));
    }
    document.getElementById("btn-add-app-mode").addEventListener("click", () => {
      document.getElementById("app-mode-list").appendChild(createAppModeRow("", ""));
    });

    // Load custom sections from settings
    ipcRenderer.on("settings:loaded", (_ev2, s2) => {
      renderCustomModes(s2.customModes || {});
      renderAppModes(s2.appModeMap || {});
    });

    // Extend collectSettings for custom modes + app-mode map
    const originalCollect = collectSettings;
    collectSettings = function() {
      const patch = originalCollect();
      const customModes = {};
      document.querySelectorAll("#custom-modes-list > div").forEach(row => {
        const n = row.querySelector(".cm-name")?.value?.trim();
        const p = row.querySelector(".cm-prompt")?.value?.trim();
        if (n && p) customModes[n] = p;
      });
      patch.customModes = customModes;
      const appModeMap = {};
      document.querySelectorAll("#app-mode-list > div").forEach(row => {
        const a = row.querySelector(".am-app")?.value?.trim();
        const m = row.querySelector(".am-mode")?.value?.trim();
        if (a && m) appModeMap[a] = m;
      });
      patch.appModeMap = appModeMap;
      return patch;
    };

    // Send load request AFTER all listeners are registered
    ipcRenderer.send("settings:load");
  </script>
</body>
</html>`;
