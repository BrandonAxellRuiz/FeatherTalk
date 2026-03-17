export const ONBOARDING_HTML = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FeatherTalk — Bienvenido</title>
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
      font-size: 12px;
      color: #64748b;
      flex-shrink: 0;
    }

    #content {
      flex: 1;
      padding: 32px;
      overflow-y: auto;
    }

    .step { display: none; }
    .step.active { display: block; }

    h1 {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #f1f5f9;
    }

    h2 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #f1f5f9;
    }

    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin-bottom: 16px;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      margin-bottom: 8px;
      background: #1e293b;
      border-radius: 8px;
      font-size: 14px;
    }

    .status-ok { color: #22c55e; }
    .status-fail { color: #ef4444; }
    .status-check { color: #eab308; }

    input, select {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1e293b;
      color: #e2e8f0;
      margin-bottom: 12px;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    label {
      display: block;
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 4px;
    }

    #nav {
      display: flex;
      justify-content: space-between;
      padding: 16px 32px 24px;
      flex-shrink: 0;
    }

    button {
      padding: 8px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      font-family: "Segoe UI", Arial, sans-serif;
    }

    #btn-next {
      background: #4f46e5;
      color: white;
    }

    #btn-next:hover { background: #4338ca; }

    #btn-prev {
      background: #334155;
      color: #d1d5db;
    }

    #btn-prev:hover { background: #475569; }

    .progress {
      display: flex;
      gap: 6px;
      justify-content: center;
      padding: 0 32px 16px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #334155;
    }

    .dot.active { background: #4f46e5; }
    .dot.done { background: #22c55e; }

    .feature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 16px 0;
    }

    .feature-card {
      background: #1e293b;
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 13px;
    }

    .feature-card strong {
      color: #f1f5f9;
      display: block;
      margin-bottom: 4px;
    }

    .dep-help {
      font-size: 11px;
      color: #f97316;
      margin-top: 4px;
      margin-left: 28px;
      line-height: 1.4;
    }

    .key-recorder {
      cursor: pointer;
      caret-color: transparent;
    }
    .key-recorder:focus {
      border-color: #4f46e5;
      box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.3);
    }
    .key-recorder.recording-keys {
      border-color: #22c55e;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
    }

    #skip-onboarding:hover {
      color: #94a3b8;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div id="title-bar">FeatherTalk Setup</div>

  <div id="content" role="main" aria-label="FeatherTalk - Configuración inicial">
    <div class="step active" data-step="0">
      <h1>Bienvenido a FeatherTalk</h1>
      <p>Tu asistente de dictado local con ASR y limpieza inteligente.</p>
      <div class="feature-grid">
        <div class="feature-card" tabindex="0">
          <strong>Dictado por voz</strong>
          Graba con un hotkey, transcribe al instante
        </div>
        <div class="feature-card" tabindex="0">
          <strong>Limpieza con IA</strong>
          Llama limpia puntuacion y fillers automaticamente
        </div>
        <div class="feature-card" tabindex="0">
          <strong>Privacidad total</strong>
          Todo corre local, nada sale de tu PC
        </div>
        <div class="feature-card" tabindex="0">
          <strong>Pega directo</strong>
          El texto aparece donde lo necesitas
        </div>
      </div>
      <div style="text-align: center; margin-top: 12px;">
        <a href="#" id="skip-onboarding" aria-label="Saltar configuración" style="color: #64748b; font-size: 12px; text-decoration: none;">
          Saltar configuración →
        </a>
      </div>
    </div>

    <div class="step" data-step="1">
      <h2>Verificando dependencias</h2>
      <p>Comprobando que los servicios necesarios estan disponibles...</p>
      <div aria-live="polite" id="dep-status-area">
      <div id="dep-asr" class="status-item">
        <span class="status-check">&#9679;</span>
        <span id="dep-asr-text">ASR (Parakeet) — verificando...</span>
      </div>
      <div id="dep-asr-help" class="dep-help" style="display:none;">Verifica que el servidor Parakeet esté ejecutándose en el puerto configurado</div>
      <div id="dep-llama" class="status-item">
        <span class="status-check">&#9679;</span>
        <span id="dep-llama-text">Llama (Ollama) — verificando...</span>
      </div>
      <div id="dep-llama-help" class="dep-help" style="display:none;">Verifica que Ollama esté instalado y ejecutándose (ollama serve)</div>
      </div>
    </div>

    <div class="step" data-step="2">
      <h2>Configurar hotkey</h2>
      <p>Elige la combinacion de teclas para iniciar/detener el dictado.</p>
      <label for="hotkey-input">Hotkey principal</label>
      <input type="text" id="hotkey-input" value="Ctrl+Win+Space" aria-label="Hotkey principal" />
      <p style="font-size:12px;color:#64748b;">Presiona la combinacion deseada o escribe manualmente.</p>
    </div>

    <div class="step" data-step="3">
      <h2>Seleccionar microfono</h2>
      <p>Elige el dispositivo de audio para la grabacion.</p>
      <label for="mic-select">Microfono</label>
      <select id="mic-select" aria-label="Seleccionar microfono">
        <option value="default">Default</option>
      </select>
    </div>

    <div class="step" data-step="4">
      <h2>Probar dictado</h2>
      <p>Prueba rapida: presiona el boton, habla por unos segundos y presiona de nuevo para ver el resultado.</p>
      <button id="btn-test" aria-label="Iniciar prueba de dictado" style="background:#22c55e;color:white;margin-bottom:12px;">Iniciar prueba</button>
      <div id="test-result" aria-live="polite" style="background:#1e293b;padding:12px;border-radius:8px;min-height:60px;font-size:14px;display:none;"></div>
    </div>

    <div class="step" data-step="5">
      <h2>Listo!</h2>
      <p>FeatherTalk esta configurado. Usa tu hotkey para comenzar a dictar.</p>
      <div class="feature-grid">
        <div class="feature-card" tabindex="0">
          <strong>Hotkey</strong>
          <span id="summary-hotkey">Ctrl+Win+Space</span>
        </div>
        <div class="feature-card" tabindex="0">
          <strong>Modo</strong>
          Default
        </div>
      </div>
      <div id="hotkey-ref" style="margin-top:20px;"></div>
      <p style="margin-top:16px;">Puedes cambiar la configuracion desde el menu del tray en cualquier momento.</p>
    </div>
  </div>

  <div class="progress" id="progress" role="progressbar" aria-valuenow="0" aria-valuemax="5"></div>

  <div id="nav">
    <button id="btn-prev" aria-label="Paso anterior" style="visibility:hidden;">Anterior</button>
    <button id="btn-next" aria-label="Siguiente paso">Siguiente</button>
  </div>

  <script>
    const { ipcRenderer } = require("electron");

    const TOTAL_STEPS = 6;
    let currentStep = 0;
    const steps = document.querySelectorAll(".step");
    const progressEl = document.getElementById("progress");
    const btnNext = document.getElementById("btn-next");
    const btnPrev = document.getElementById("btn-prev");

    function buildDots() {
      progressEl.setAttribute("aria-valuenow", String(currentStep));
      while (progressEl.firstChild) {
        progressEl.removeChild(progressEl.firstChild);
      }
      for (let i = 0; i < TOTAL_STEPS; i++) {
        const dot = document.createElement("div");
        dot.className = "dot" + (i === currentStep ? " active" : i < currentStep ? " done" : "");
        progressEl.appendChild(dot);
      }
    }

    function showStep(idx) {
      currentStep = Math.max(0, Math.min(idx, TOTAL_STEPS - 1));
      steps.forEach((s, i) => s.classList.toggle("active", i === currentStep));
      btnPrev.style.visibility = currentStep === 0 ? "hidden" : "visible";
      btnNext.textContent = currentStep === TOTAL_STEPS - 1 ? "Comenzar" : "Siguiente";
      buildDots();

      if (currentStep === 1) checkDeps();
      if (currentStep === 5) {
        document.getElementById("summary-hotkey").textContent =
          document.getElementById("hotkey-input").value;
        buildHotkeyRef();
      }
    }

    btnNext.addEventListener("click", () => {
      if (currentStep === TOTAL_STEPS - 1) {
        const hotkey = document.getElementById("hotkey-input").value;
        const mic = document.getElementById("mic-select").value;
        ipcRenderer.send("onboarding:save-settings", { hotkey, microphoneDeviceId: mic });
        ipcRenderer.send("onboarding:complete");
        return;
      }
      showStep(currentStep + 1);
    });

    btnPrev.addEventListener("click", () => showStep(currentStep - 1));

    function checkDeps() {
      ipcRenderer.send("onboarding:check-deps");
    }

    function updateDepStatus(id, ok, label, errorMsg) {
      const container = document.getElementById(id);
      const icon = container.querySelector("span:first-child");
      const text = document.getElementById(id + "-text");
      const helpEl = document.getElementById(id + "-help");

      if (ok) {
        icon.className = "status-ok";
        icon.textContent = "\u2713";
        text.textContent = label + " — disponible";
        if (helpEl) helpEl.style.display = "none";
      } else {
        icon.className = "status-fail";
        icon.textContent = "\u2717";
        text.textContent = label + " — " + (errorMsg || "no disponible");
        if (helpEl) helpEl.style.display = "block";
      }
    }

    ipcRenderer.on("onboarding:deps-result", (_event, result) => {
      updateDepStatus("dep-asr", result.asr.ok, "ASR (Parakeet)", result.asr.error);
      updateDepStatus("dep-llama", result.llama.ok, "Llama (Ollama)", result.llama.error);
    });

    const btnTest = document.getElementById("btn-test");
    const testResult = document.getElementById("test-result");

    btnTest.addEventListener("click", () => {
      ipcRenderer.send("onboarding:test-dictation");
      btnTest.textContent = "Escuchando...";
      btnTest.disabled = true;
    });

    ipcRenderer.on("onboarding:test-result", (_event, result) => {
      testResult.style.display = "block";
      testResult.textContent = result.text || result.error || "Sin resultado";
      btnTest.textContent = "Iniciar prueba";
      btnTest.disabled = false;
    });

    function buildHotkeyRef() {
      const isMac = typeof process !== "undefined" && process.platform === "darwin";
      const fmt = (hk) => {
        if (!isMac) return hk;
        const m = { ctrl: "\u2318", win: "\u2303", alt: "\u2325", shift: "\u21E7" };
        return hk.split("+").map((t) => m[t.trim().toLowerCase()] || t.trim()).join("");
      };

      const toggle = document.getElementById("hotkey-input").value;
      const entries = [
        ["Iniciar/detener dictado", toggle],
        ["Cambiar modo", "Ctrl+Win+M"],
        ["Deshacer pegado", "Ctrl+Win+Z"],
        ["Reintentar limpieza", "Ctrl+Win+R"],
        ["Cancelar grabacion", "Escape"]
      ];

      const container = document.getElementById("hotkey-ref");
      while (container.firstChild) container.removeChild(container.firstChild);

      const heading = document.createElement("div");
      heading.style.cssText = "font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:8px;";
      heading.textContent = "Atajos principales";
      container.appendChild(heading);

      for (const [action, hk] of entries) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:space-between;padding:7px 14px;background:#1e293b;border-radius:6px;margin-bottom:4px;font-size:13px;";
        const actionSpan = document.createElement("span");
        actionSpan.style.color = "#cbd5e1";
        actionSpan.textContent = action;
        const keySpan = document.createElement("span");
        keySpan.style.cssText = "font-family:SF Mono,Consolas,Menlo,monospace;color:#a5b4fc;";
        keySpan.textContent = fmt(hk);
        row.appendChild(actionSpan);
        row.appendChild(keySpan);
        container.appendChild(row);
      }
    }

    // Skip onboarding
    document.getElementById("skip-onboarding")?.addEventListener("click", (e) => {
      e.preventDefault();
      ipcRenderer.send("onboarding:skip");
    });

    // Key recorder for hotkey input
    const hotkeyInput = document.getElementById("hotkey-input");
    if (hotkeyInput) {
      hotkeyInput.classList.add("key-recorder");
      hotkeyInput.setAttribute("readonly", true);
      hotkeyInput.setAttribute("placeholder", "Click aquí y presiona la combinación...");

      hotkeyInput.addEventListener("keydown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.metaKey) parts.push("Win");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");

        const key = e.key;
        if (!["Control", "Meta", "Alt", "Shift"].includes(key)) {
          let keyName = key.length === 1 ? key.toUpperCase() : key;
          if (keyName === " ") keyName = "Space";
          parts.push(keyName);
          hotkeyInput.value = parts.join("+");
          hotkeyInput.classList.remove("recording-keys");
        } else {
          hotkeyInput.value = parts.join("+") + "+...";
          hotkeyInput.classList.add("recording-keys");
        }
      });

      hotkeyInput.addEventListener("keyup", () => {
        hotkeyInput.classList.remove("recording-keys");
      });
    }

    showStep(0);
  </script>
</body>
</html>`;
