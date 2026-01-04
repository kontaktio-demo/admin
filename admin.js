/* Kontaktio Admin (no frameworks)
   - Works with your backend:
     POST  /admin/login
     GET   /admin/clients
     POST  /admin/clients
     PUT   /admin/clients/:id
     DELETE/admin/clients/:id
     GET   /admin/stats/:clientId
     GET   /admin/logs/:clientId?limit=...
*/

const LS = {
  token: "kontaktio_admin_token",
  apiBase: "kontaktio_admin_api_base",
  lastClient: "kontaktio_admin_last_client"
};

const DEFAULTS = {
  status: "active",
  statusMessage: "Asystent jest dostępny.",
  company: { name: "", email: "", hours: "", phone: "", address: "" },
  theme: {
    radius: 22,
    inputBg: "#020617",
    buttonBg: "#7c3aed",
    headerBg: "#020617",
    position: "right",
    widgetBg: "#020617",
    inputText: "#e5e7eb",
    buttonText: "#ffffff",
    headerText: "#e5e7eb",
    botBubbleBg: "#020617",
    userBubbleBg: "#0f172a",
    botBubbleText: "#94a3b8",
    userBubbleText: "#e5e7eb"
  },
  knowledge: "",
  rules: "",
  temperature: 0.4,
  maxTokens: 300,
  created_at: null,
  updated_at: null,
  welcome_message: "",
  welcome_hint: "",
  quick_replies: [],
  launcher_icon: "💬",
  system_prompt: "",
  model: "gpt-4o-mini",
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
  context_limit: 12,
  auto_open_enabled: false,
  auto_open_delay: 15000,
  sound_enabled: false,
  sound_send_url: null,
  sound_receive_url: null,
  font_family: null,
  font_size: null,
  bubble_radius: null,
  header_height: null,
  input_height: null,
  launcher_size: null,
  widget_border: null,
  widget_shadow: null,
  input_border: null,
  quick_reply_bg: null,
  quick_reply_text: null,
  quick_reply_border: null,
  offset_x: 20,
  offset_y: 20,
  dark_mode_enabled: false,
  dark_mode_theme: null,
  website: "",
  phone: "",
  address: "",
  hours: "",
  facebook_url: "",
  instagram_url: "",
  google_maps_url: "",
  lead_form_enabled: false,
  lead_form_fields: [],
  lead_form_title: "",
  lead_form_success_message: "",
  forward_to_email: "",
  webhook_url: "",
  zapier_url: "",
  make_url: "",
  blocked_keywords: [],
  allowed_keywords: [],
  fallback_message: "",
  handoff_message: ""
};

let state = {
  apiBase: "",
  token: "",
  clientsById: {},       // id -> client object (mapClientRow contract)
  currentId: null,
  current: null,         // editable
  original: null,        // for dirty compare
  stats: null,
  logs: [],
  dirty: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ----------------------------- boot ----------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  state.apiBase = localStorage.getItem(LS.apiBase) || "";
  state.token = localStorage.getItem(LS.token) || "";

  $("#apiBase").value = state.apiBase;
  $("#btnLogin").addEventListener("click", onLogin);
  $("#btnClearAuth").addEventListener("click", hardReset);

  $("#btnReload").addEventListener("click", () => reloadAll(true));
  $("#btnCreate").addEventListener("click", openCreateModal);
  $("#btnLogout").addEventListener("click", logout);

  $("#clientSearch").addEventListener("input", renderClientList);

  $("#btnSave").addEventListener("click", saveCurrent);
  $("#btnDelete").addEventListener("click", deleteCurrent);
  $("#btnPreview").addEventListener("click", () => switchTab("tab-stats"));
  $("#btnDuplicate").addEventListener("click", openDuplicateModal);

  $("#btnReloadStats").addEventListener("click", loadStats);
  $("#btnReloadLogs").addEventListener("click", loadLogs);
  $("#btnOpenPreviewTab").addEventListener("click", openPreviewTab);
  $("#btnReloadPreview").addEventListener("click", reloadPreviewFrame);

  $("#btnCopyJson").addEventListener("click", copyExportJson);
  $("#btnBeautifyJson").addEventListener("click", beautifyExportJson);
  $("#btnApplyImport").addEventListener("click", applyImportJson);
  $("#btnClearImport").addEventListener("click", () => ($("#jsonImport").value = ""));

  setupTabs();
  setupModal();

  // keyboard: Ctrl/Cmd+S to save
  window.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveCurrent();
    }
  });

  // warn on unload if dirty
  window.addEventListener("beforeunload", (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  if (state.token && state.apiBase) {
    enterApp();
    reloadAll(false);
  } else {
    enterLogin();
  }
});

/* --------------------------- view state -------------------------- */

function enterLogin() {
  $("#loginView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
}

function enterApp() {
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#apiBaseLabel").textContent = state.apiBase || "—";
}

function setDirty(isDirty) {
  state.dirty = !!isDirty;
  $("#dirtyBadge").classList.toggle("hidden", !state.dirty);
  syncJsonExport();
}

/* ---------------------------- toasts ---------------------------- */

let toastTimer = null;

function toast(kind, title, message) {
  const el = $("#toast");
  el.className = `toast ${kind || ""}`.trim();
  el.innerHTML = `<strong>${escapeHtml(title || "")}</strong><div>${escapeHtml(message || "")}</div>`;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ----------------------------- API ------------------------------ */

function normalizeApiBase(url) {
  const s = (url || "").trim().replace(/\/+$/, "");
  return s;
}

async function api(path, options = {}) {
  if (!state.apiBase) throw new Error("API_BASE not set");
  const url = `${state.apiBase}${path}`;
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    options.headers || {}
  );

  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  if (!res.ok) {
    const msg =
      (json && json.error) ? json.error :
      (typeof json === "string" && json) ? json :
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
}

/* ---------------------------- auth ------------------------------ */

async function onLogin() {
  $("#loginError").textContent = "";

  const apiBase = normalizeApiBase($("#apiBase").value);
  const password = $("#password").value;

  if (!apiBase) return ($("#loginError").textContent = "Wpisz API base (Render URL).");
  if (!password) return ($("#loginError").textContent = "Wpisz hasło.");

  state.apiBase = apiBase;
  localStorage.setItem(LS.apiBase, apiBase);

  try {
    // temporary: call without token
    const res = await fetch(`${state.apiBase}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      $("#loginError").textContent = data.error || "Błędne hasło lub błąd serwera.";
      return;
    }

    state.token = data.token;
    localStorage.setItem(LS.token, state.token);

    enterApp();
    await reloadAll(false);
    toast("ok", "Zalogowano", "Panel admina jest gotowy.");
  } catch (e) {
    $("#loginError").textContent = e.message || "Błąd połączenia.";
  }
}

function logout() {
  localStorage.removeItem(LS.token);
  state.token = "";
  state.clientsById = {};
  state.currentId = null;
  state.current = null;
  state.original = null;
  setDirty(false);
  enterLogin();
}

function hardReset() {
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.apiBase);
  localStorage.removeItem(LS.lastClient);
  state = { apiBase: "", token: "", clientsById: {}, currentId: null, current: null, original: null, stats: null, logs: [], dirty: false };
  location.reload();
}

/* ------------------------- load / render ------------------------ */

async function reloadAll(forceSelectFirst) {
  try {
    await loadClients();

    const last = localStorage.getItem(LS.lastClient);
    const ids = Object.keys(state.clientsById).sort();
    const preferred = forceSelectFirst ? null : (last && state.clientsById[last] ? last : null);
    const toSelect = preferred || ids[0] || null;

    if (toSelect) selectClient(toSelect);
    else {
      setCurrentClient(null);
      toast("warn", "Brak klientów", "Dodaj pierwszego klienta przez „+ Dodaj”.");
    }
  } catch (e) {
    if (e.status === 401) toast("err", "Brak autoryzacji", "Zaloguj się ponownie.");
    else toast("err", "Błąd", e.message || "Nie udało się załadować danych.");
  }
}

async function loadClients() {
  const data = await api("/admin/clients", { method: "GET" });

  // backend returns object map id -> client
  const map = data && typeof data === "object" ? data : {};
  state.clientsById = map;

  renderClientList();
}

function renderClientList() {
  const q = ($("#clientSearch").value || "").trim().toLowerCase();
  const wrap = $("#clientList");
  wrap.innerHTML = "";

  const ids = Object.keys(state.clientsById).sort((a,b) => a.localeCompare(b));

  const filtered = ids.filter((id) => {
    const c = state.clientsById[id];
    const name = c?.company?.name || "";
    return !q || id.toLowerCase().includes(q) || String(name).toLowerCase().includes(q);
  });

  if (!filtered.length) {
    wrap.innerHTML = `<div class="muted" style="padding:10px;">Brak wyników.</div>`;
    return;
  }

  for (const id of filtered) {
    const c = state.clientsById[id];
    const isActive = c?.status === "active";
    const pillClass = isActive ? "pill ok" : "pill off";
    const pillLabel = isActive ? "active" : (c?.status || "—");
    const name = c?.company?.name || "—";
    const meta = [
      name !== id ? name : "",
      c?.company?.phone ? `tel: ${c.company.phone}` : "",
      c?.company?.email ? c.company.email : ""
    ].filter(Boolean).join(" • ");

    const el = document.createElement("div");
    el.className = `clientItem ${state.currentId === id ? "active" : ""}`.trim();
    el.innerHTML = `
      <div class="clientItemTop">
        <div class="clientId">${escapeHtml(id)}</div>
        <div class="${pillClass}">${escapeHtml(pillLabel)}</div>
      </div>
      <div class="clientMeta">${escapeHtml(meta || "—")}</div>
    `;
    el.addEventListener("click", () => selectClient(id));
    wrap.appendChild(el);
  }
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x ?? null));
}

function stableStringify(obj) {
  // stable keys order for dirty compare
  const seen = new WeakSet();
  const sorter = (a, b) => a.localeCompare(b);
  return JSON.stringify(obj, function (key, value) {
    if (value && typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);

      if (Array.isArray(value)) return value;
      const sorted = {};
      Object.keys(value).sort(sorter).forEach(k => sorted[k] = value[k]);
      return sorted;
    }
    return value;
  }, 2);
}

function setCurrentClient(clientId) {
  state.currentId = clientId;
  state.current = clientId ? deepClone(state.clientsById[clientId]) : null;
  state.original = clientId ? deepClone(state.clientsById[clientId]) : null;
  state.stats = null;
  state.logs = [];
  setDirty(false);

  $("#currentClientId").textContent = clientId || "—";
  renderClientList();
  renderAllTabs();
  syncJsonExport();
  updatePreviewFrame();
}

function selectClient(clientId) {
  if (!clientId || !state.clientsById[clientId]) return;

  if (state.dirty) {
    confirmModal({
      title: "Masz niezapisane zmiany",
      body: `
        <div class="help">Chcesz porzucić zmiany i przejść do innego klienta?</div>
        <div class="help">Wskazówka: <span class="kbd">Ctrl</span> + <span class="kbd">S</span> zapisuje.</div>
      `,
      okText: "Porzuć i przejdź",
      danger: true,
      onOk: () => {
        localStorage.setItem(LS.lastClient, clientId);
        setCurrentClient(clientId);
      }
    });
    return;
  }

  localStorage.setItem(LS.lastClient, clientId);
  setCurrentClient(clientId);
}

/* ---------------------------- tabs ------------------------------ */

function setupTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

function switchTab(id) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  $$(".tabPane").forEach(p => p.classList.toggle("active", p.id === id));

  if (id === "tab-stats" && state.currentId) {
    loadStats().catch(() => {});
  }
  if (id === "tab-logs" && state.currentId) {
    loadLogs().catch(() => {});
  }
  if (id === "tab-json") syncJsonExport();
}

function renderAllTabs() {
  renderTabStatus();
  renderTabCompany();
  renderTabTheme();
  renderTabAI();
  renderTabBehavior();
  renderTabUI();
  renderTabBusiness();
  renderTabLead();
  renderTabRouting();
  renderTabLogic();
}

/* ---------------------- form helpers / bind --------------------- */

function get(obj, path, fallback) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || !(p in cur)) return fallback;
    cur = cur[p];
  }
  return cur ?? fallback;
}

function set(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function computeDirty() {
  if (!state.current || !state.original) return false;
  return stableStringify(state.current) !== stableStringify(state.original);
}

function afterChange() {
  setDirty(computeDirty());
  syncJsonExport();
  renderClientList(); // so status/name in list updates live
}

function fieldText({ label, path, placeholder = "", help = "", type = "text" }) {
  const value = get(state.current, path, "");
  const id = `f_${path.replaceAll(".", "_")}`;
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" data-path="${escapeHtml(path)}" data-kind="text" type="${escapeHtml(type)}" value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(placeholder)}" />
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldNumber({ label, path, min = null, max = null, step = "any", help = "" }) {
  const value = get(state.current, path, 0);
  const id = `f_${path.replaceAll(".", "_")}`;
  const minAttr = min !== null ? `min="${min}"` : "";
  const maxAttr = max !== null ? `max="${max}"` : "";
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <input id="${id}" data-path="${escapeHtml(path)}" data-kind="number" type="number" value="${escapeHtml(value ?? 0)}" step="${escapeHtml(step)}" ${minAttr} ${maxAttr} />
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldSelect({ label, path, options, help = "" }) {
  const value = get(state.current, path, "");
  const id = `f_${path.replaceAll(".", "_")}`;
  const opts = options.map(o => `<option value="${escapeHtml(o.value)}" ${o.value === value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <select id="${id}" data-path="${escapeHtml(path)}" data-kind="select">${opts}</select>
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldTextarea({ label, path, placeholder = "", help = "", mono = false, rows = 6 }) {
  const value = get(state.current, path, "");
  const id = `f_${path.replaceAll(".", "_")}`;
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <textarea id="${id}" data-path="${escapeHtml(path)}" data-kind="textarea" rows="${rows}" placeholder="${escapeHtml(placeholder)}" class="${mono ? "mono" : ""}" spellcheck="false">${escapeHtml(value ?? "")}</textarea>
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldJson({ label, path, placeholder = "", help = "", rows = 8 }) {
  const value = get(state.current, path, null);
  const id = `f_${path.replaceAll(".", "_")}`;
  const text = value === null || value === undefined ? "" : JSON.stringify(value, null, 2);
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <textarea id="${id}" data-path="${escapeHtml(path)}" data-kind="json" rows="${rows}" placeholder="${escapeHtml(placeholder)}" class="mono" spellcheck="false">${escapeHtml(text)}</textarea>
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldColor({ label, path, help = "" }) {
  const value = get(state.current, path, "#000000");
  const id = `f_${path.replaceAll(".", "_")}`;
  return `
    <div class="field">
      <label for="${id}">${escapeHtml(label)}</label>
      <div class="row">
        <input id="${id}" data-path="${escapeHtml(path)}" data-kind="color" type="color" value="${escapeHtml(value || "#000000")}" style="max-width:72px; padding:6px;" />
        <input data-path="${escapeHtml(path)}" data-kind="colorText" type="text" value="${escapeHtml(value || "")}" placeholder="#rrggbb" />
      </div>
      ${help ? `<div class="help">${escapeHtml(help)}</div>` : ""}
    </div>
  `;
}

function fieldSwitch({ title, path, meta = "" }) {
  const value = !!get(state.current, path, false);
  const id = `f_${path.replaceAll(".", "_")}`;
  return `
    <div class="switch">
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <input id="${id}" data-path="${escapeHtml(path)}" data-kind="switch" type="checkbox" ${value ? "checked" : ""} />
    </div>
  `;
}

function bindFields(container) {
  const root = container instanceof Element ? container : document;

  // text, textarea, select
  root.querySelectorAll("[data-kind='text'],[data-kind='textarea'],[data-kind='select']").forEach((el) => {
    el.addEventListener("input", () => {
      const path = el.dataset.path;
      set(state.current, path, el.value);
      afterChange();
      if (path === "status" || path === "company.name") updatePreviewFrame();
    });
  });

  // number
  root.querySelectorAll("[data-kind='number']").forEach((el) => {
    el.addEventListener("input", () => {
      const path = el.dataset.path;
      const v = el.value === "" ? null : Number(el.value);
      set(state.current, path, Number.isNaN(v) ? null : v);
      afterChange();
    });
  });

  // switch
  root.querySelectorAll("[data-kind='switch']").forEach((el) => {
    el.addEventListener("change", () => {
      const path = el.dataset.path;
      set(state.current, path, !!el.checked);
      afterChange();
      if (path === "auto_open_enabled" || path === "dark_mode_enabled") updatePreviewFrame();
    });
  });

  // JSON
  root.querySelectorAll("[data-kind='json']").forEach((el) => {
    el.addEventListener("blur", () => {
      const path = el.dataset.path;
      const raw = (el.value || "").trim();

      if (!raw) {
        set(state.current, path, Array.isArray(get(DEFAULTS, path, null)) ? [] : null);
        afterChange();
        updatePreviewFrame();
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        set(state.current, path, parsed);
        el.style.borderColor = "";
        afterChange();
        updatePreviewFrame();
      } catch (e) {
        el.style.borderColor = "rgba(239,68,68,.9)";
        toast("err", "Błąd JSON", `Pole "${path}" ma niepoprawny JSON.`);
      }
    });
  });

  // color + hex text pairing
  root.querySelectorAll("[data-kind='color']").forEach((picker) => {
    picker.addEventListener("input", () => {
      const path = picker.dataset.path;
      set(state.current, path, picker.value);
      const sibling = picker.parentElement?.querySelector("[data-kind='colorText']");
      if (sibling) sibling.value = picker.value;
      afterChange();
      updatePreviewFrame();
    });
  });

  root.querySelectorAll("[data-kind='colorText']").forEach((text) => {
    text.addEventListener("input", () => {
      const path = text.dataset.path;
      const v = text.value.trim();
      set(state.current, path, v);
      const picker = text.parentElement?.querySelector("[data-kind='color']");
      if (picker && /^#([0-9a-fA-F]{6})$/.test(v)) picker.value = v;
      afterChange();
      updatePreviewFrame();
    });
  });
}

/* --------------------------- render tabs ------------------------- */

function ensureCurrent() {
  if (!state.current) {
    // clear panes
    $$(".tabPane").forEach(p => {
      if (p.id.startsWith("tab-") && !["tab-stats","tab-logs","tab-json"].includes(p.id)) p.innerHTML = `<div class="muted">Wybierz klienta.</div>`;
    });
    $("#jsonExport").value = "";
    return false;
  }
  return true;
}

function renderTabStatus() {
  const pane = $("#tab-status");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Status</div>
      <div class="sectionHint">Kontroluje dostępność asystenta i komunikat, gdy jest wyłączony.</div>

      <div class="grid2">
        ${fieldSelect({
          label: "Status",
          path: "status",
          options: [
            { label: "active", value: "active" },
            { label: "unactive", value: "unactive" },
            { label: "disabled", value: "disabled" }
          ],
          help: "Widget /chat blokuje odpowiedzi, gdy status nie jest 'active'."
        })}
        ${fieldText({
          label: "Status message",
          path: "statusMessage",
          placeholder: "Asystent jest chwilowo niedostępny…",
          help: "Tekst zwracany do widgetu, gdy asystent jest wyłączony."
        })}
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Identyfikacja</div>
      <div class="sectionHint">ID jest kluczem głównym w bazie. Tu tylko podgląd.</div>

      <div class="grid2">
        ${fieldText({ label: "Client id (read-only)", path: "id", placeholder: "", help: "ID edytujesz przez duplikację lub dodanie nowego klienta.", type: "text" })}
        ${fieldText({ label: "Launcher icon", path: "launcher_icon", placeholder: "💬", help: "Emoji lub znak (jeśli widget to obsługuje)." })}
      </div>
    </div>
  `;

  // make id read-only
  const idEl = $("#f_id");
  if (idEl) {
    idEl.setAttribute("readonly", "readonly");
    idEl.style.opacity = "0.7";
  }

  bindFields(pane);
}

function renderTabCompany() {
  const pane = $("#tab-company");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Firma</div>
      <div class="sectionHint">Te dane są używane w system prompt i w odpowiedziach.</div>

      <div class="grid2">
        ${fieldText({ label: "Nazwa firmy", path: "company.name", placeholder: "Np. SAWO", help: "Wyświetla się też w promptach." })}
        ${fieldText({ label: "Email", path: "company.email", placeholder: "biuro@firma.pl" })}
      </div>

      <div class="grid2">
        ${fieldText({ label: "Telefon", path: "company.phone", placeholder: "(+48) ..." })}
        ${fieldText({ label: "Godziny", path: "company.hours", placeholder: "Pon–Pt 9:00–17:00" })}
      </div>

      ${fieldText({ label: "Adres", path: "company.address", placeholder: "Miasto, ulica..." })}

      <div class="grid2">
        ${fieldText({ label: "Strona www", path: "website", placeholder: "https://..." })}
        ${fieldText({ label: "Google Maps URL", path: "google_maps_url", placeholder: "https://maps.google.com/..." })}
      </div>

      <div class="grid2">
        ${fieldText({ label: "Facebook URL", path: "facebook_url", placeholder: "https://facebook.com/..." })}
        ${fieldText({ label: "Instagram URL", path: "instagram_url", placeholder: "https://instagram.com/..." })}
      </div>
    </div>
  `;

  bindFields(pane);
}

function renderTabTheme() {
  const pane = $("#tab-theme");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Wygląd widgetu</div>
      <div class="sectionHint">To jest obiekt <span class="mono">theme</span>. Kolory edytujesz wygodnie, resztę możesz też w JSON.</div>

      <div class="grid3">
        ${fieldColor({ label: "Header background", path: "theme.headerBg" })}
        ${fieldColor({ label: "Header text", path: "theme.headerText" })}
        ${fieldSelect({
          label: "Position (theme.position)",
          path: "theme.position",
          options: [
            { label: "right", value: "right" },
            { label: "left", value: "left" }
          ]
        })}
      </div>

      <div class="grid3">
        ${fieldColor({ label: "Widget background", path: "theme.widgetBg" })}
        ${fieldColor({ label: "Input background", path: "theme.inputBg" })}
        ${fieldColor({ label: "Input text", path: "theme.inputText" })}
      </div>

      <div class="grid3">
        ${fieldColor({ label: "Button background", path: "theme.buttonBg" })}
        ${fieldColor({ label: "Button text", path: "theme.buttonText" })}
        ${fieldNumber({ label: "Radius (theme.radius)", path: "theme.radius", min: 0, max: 40, step: 1 })}
      </div>

      <div class="grid3">
        ${fieldColor({ label: "User bubble bg", path: "theme.userBubbleBg" })}
        ${fieldColor({ label: "User bubble text", path: "theme.userBubbleText" })}
        ${fieldColor({ label: "Bot bubble bg", path: "theme.botBubbleBg" })}
      </div>

      <div class="grid3">
        ${fieldColor({ label: "Bot bubble text", path: "theme.botBubbleText" })}
        <div></div>
        <div></div>
      </div>

      ${fieldJson({
        label: "Theme JSON (advanced)",
        path: "theme",
        help: "Jeśli dodasz nowe pola do theme w przyszłości — tu je ogarniesz od razu.",
        rows: 10
      })}
    </div>

    <div class="section">
      <div class="sectionTitle">Pozycjonowanie</div>
      <div class="sectionHint">Offsety są poza theme (Twoje pola bazowe).</div>

      <div class="grid2">
        ${fieldNumber({ label: "Offset X", path: "offset_x", min: 0, max: 200, step: 1 })}
        ${fieldNumber({ label: "Offset Y", path: "offset_y", min: 0, max: 200, step: 1 })}
      </div>
    </div>
  `;

  bindFields(pane);
}

function renderTabAI() {
  const pane = $("#tab-ai");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Model i parametry</div>
      <div class="sectionHint">To idzie bezpośrednio do OpenAI w /chat.</div>

      <div class="grid3">
        ${fieldText({ label: "Model", path: "model", placeholder: "gpt-4o-mini" })}
        ${fieldNumber({ label: "Temperature", path: "temperature", min: 0, max: 2, step: 0.05 })}
        ${fieldNumber({ label: "Max tokens", path: "maxTokens", min: 1, max: 4000, step: 1 })}
      </div>

      <div class="grid3">
        ${fieldNumber({ label: "Top P", path: "top_p", min: 0, max: 1, step: 0.05 })}
        ${fieldNumber({ label: "Presence penalty", path: "presence_penalty", min: -2, max: 2, step: 0.1 })}
        ${fieldNumber({ label: "Frequency penalty", path: "frequency_penalty", min: -2, max: 2, step: 0.1 })}
      </div>

      <div class="grid2">
        ${fieldNumber({ label: "Context limit (messages)", path: "context_limit", min: 2, max: 80, step: 1, help: "Ile ostatnich wiadomości trzymać w pamięci per sesja." })}
        <div class="field">
          <label>Tip</label>
          <div class="help">Jeśli klient ma długie rozmowy, podnieś <span class="mono">context_limit</span> i ewentualnie <span class="mono">maxTokens</span>.</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Wiedza i zasady</div>
      <div class="sectionHint">To zasila system prompt: knowledge + rules + system_prompt.</div>

      ${fieldTextarea({
        label: "Knowledge",
        path: "knowledge",
        rows: 10,
        placeholder: "Opis firmy, oferta, cennik, typowe pytania, itd."
      })}

      ${fieldTextarea({
        label: "Rules",
        path: "rules",
        rows: 8,
        placeholder: "Styl wypowiedzi, długość, zakazy, sposób proponowania kontaktu..."
      })}

      ${fieldTextarea({
        label: "System prompt (dodatkowe zasady)",
        path: "system_prompt",
        rows: 8,
        placeholder: "Dodatkowe reguły dla konkretnego klienta."
      })}
    </div>
  `;

  bindFields(pane);
}

function renderTabBehavior() {
  const pane = $("#tab-behavior");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Powitanie i szybkie odpowiedzi</div>
      <div class="sectionHint">To jest logika UX: pierwsze wrażenie i prowadzenie rozmowy.</div>

      <div class="grid2">
        ${fieldTextarea({ label: "Welcome message", path: "welcome_message", rows: 4, placeholder: "Hej! W czym mogę pomóc?" })}
        ${fieldTextarea({ label: "Welcome hint", path: "welcome_hint", rows: 4, placeholder: "Możesz kliknąć jedno z gotowych pytań..." })}
      </div>

      ${fieldJson({
        label: "Quick replies (array)",
        path: "quick_replies",
        help: "Przykład: [\"Cennik\", \"Godziny otwarcia\", \"Kontakt\"]",
        rows: 8
      })}
    </div>

    <div class="section">
      <div class="sectionTitle">Auto-open + dźwięki</div>
      <div class="sectionHint">Jeśli widget to wspiera — tu to kontrolujesz.</div>

      <div class="grid2">
        <div>
          ${fieldSwitch({ title: "Auto open enabled", path: "auto_open_enabled", meta: "Automatycznie otwiera widget po czasie." })}
          <div style="height:10px"></div>
          ${fieldNumber({ label: "Auto open delay (ms)", path: "auto_open_delay", min: 0, max: 120000, step: 250 })}
        </div>

        <div>
          ${fieldSwitch({ title: "Sound enabled", path: "sound_enabled", meta: "Dźwięki wysyłania/odbioru wiadomości." })}
          <div style="height:10px"></div>
          ${fieldText({ label: "Sound send URL", path: "sound_send_url", placeholder: "https://..." })}
          ${fieldText({ label: "Sound receive URL", path: "sound_receive_url", placeholder: "https://..." })}
        </div>
      </div>
    </div>
  `;

  bindFields(pane);
}

function renderTabUI() {
  const pane = $("#tab-ui");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">UI rozszerzenia</div>
      <div class="sectionHint">Jeśli Twoje <span class="mono">kontaktio.js</span> to czyta — tu masz pełną kontrolę.</div>

      <div class="grid3">
        ${fieldText({ label: "Font family", path: "font_family", placeholder: "np. Inter, system-ui", help: "null = default" })}
        ${fieldNumber({ label: "Font size", path: "font_size", min: 10, max: 24, step: 1 })}
        ${fieldNumber({ label: "Bubble radius", path: "bubble_radius", min: 0, max: 40, step: 1 })}
      </div>

      <div class="grid3">
        ${fieldNumber({ label: "Header height", path: "header_height", min: 40, max: 120, step: 1 })}
        ${fieldNumber({ label: "Input height", path: "input_height", min: 40, max: 120, step: 1 })}
        ${fieldNumber({ label: "Launcher size", path: "launcher_size", min: 40, max: 120, step: 1 })}
      </div>

      <div class="grid2">
        ${fieldText({ label: "Widget border", path: "widget_border", placeholder: "np. 1px solid rgba(...)" })}
        ${fieldText({ label: "Widget shadow", path: "widget_shadow", placeholder: "np. 0 10px 40px rgba(...)" })}
      </div>

      <div class="grid2">
        ${fieldText({ label: "Input border", path: "input_border", placeholder: "np. 1px solid rgba(...)" })}
        <div></div>
      </div>

      <div class="grid3">
        ${fieldText({ label: "Quick reply bg", path: "quick_reply_bg", placeholder: "np. #111827" })}
        ${fieldText({ label: "Quick reply text", path: "quick_reply_text", placeholder: "np. #e5e7eb" })}
        ${fieldText({ label: "Quick reply border", path: "quick_reply_border", placeholder: "np. 1px solid #334155" })}
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Dark mode</div>
      <div class="sectionHint">Obsługa trybu ciemnego według Twoich pól.</div>

      ${fieldSwitch({ title: "Dark mode enabled", path: "dark_mode_enabled", meta: "Jeśli widget obsługuje — włącza tryb dark." })}
      <div style="height:10px"></div>
      ${fieldJson({ label: "Dark mode theme (JSON)", path: "dark_mode_theme", help: "Może być null lub obiekt analogiczny do theme.", rows: 10 })}
    </div>
  `;

  bindFields(pane);
}

function renderTabBusiness() {
  const pane = $("#tab-business");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Kontakt do firmy</div>
      <div class="sectionHint">To są pola „Business” poza obiektem company (w Twoim mapowaniu są osobno).</div>

      <div class="grid2">
        ${fieldText({ label: "Phone", path: "phone", placeholder: "(+48) ..." })}
        ${fieldText({ label: "Hours", path: "hours", placeholder: "Pon–Pt 9:00–17:00" })}
      </div>

      ${fieldText({ label: "Address", path: "address", placeholder: "Miasto, ulica..." })}
    </div>

    <div class="section">
      <div class="sectionTitle">Teksty awaryjne</div>
      <div class="sectionHint">Gdy blokada słów kluczowych lub błąd / brak danych.</div>

      <div class="grid2">
        ${fieldTextarea({ label: "Fallback message", path: "fallback_message", rows: 4, placeholder: "Niestety nie mogę pomóc w tej sprawie..." })}
        ${fieldTextarea({ label: "Handoff message", path: "handoff_message", rows: 4, placeholder: "Proszę o kontakt telefoniczny/mailowy..." })}
      </div>
    </div>
  `;

  bindFields(pane);
}

function renderTabLead() {
  const pane = $("#tab-lead");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Lead form</div>
      <div class="sectionHint">Jeśli widget ma formularz — tu go konfigurujesz.</div>

      ${fieldSwitch({ title: "Lead form enabled", path: "lead_form_enabled", meta: "Włącza formularz pozyskiwania leadów." })}
      <div style="height:10px"></div>

      <div class="grid2">
        ${fieldText({ label: "Lead form title", path: "lead_form_title", placeholder: "Zostaw kontakt" })}
        ${fieldText({ label: "Forward to email", path: "forward_to_email", placeholder: "np. kontakt@firma.pl", help: "Jeśli backend/automatyzacje to obsługują." })}
      </div>

      ${fieldTextarea({
        label: "Lead form success message",
        path: "lead_form_success_message",
        rows: 3,
        placeholder: "Dziękujemy! Odezwiemy się najszybciej jak to możliwe."
      })}

      ${fieldJson({
        label: "Lead form fields (array)",
        path: "lead_form_fields",
        help: "Przykład: [{\"name\":\"name\",\"label\":\"Imię\",\"required\":true},{\"name\":\"phone\",\"label\":\"Telefon\",\"required\":true}]",
        rows: 10
      })}
    </div>
  `;

  bindFields(pane);
}

function renderTabRouting() {
  const pane = $("#tab-routing");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Routing i integracje</div>
      <div class="sectionHint">Pola na webhooki, automatyzacje, przekierowania.</div>

      <div class="grid2">
        ${fieldText({ label: "Webhook URL", path: "webhook_url", placeholder: "https://..." })}
        ${fieldText({ label: "Zapier URL", path: "zapier_url", placeholder: "https://hooks.zapier.com/..." })}
      </div>

      <div class="grid2">
        ${fieldText({ label: "Make URL", path: "make_url", placeholder: "https://hook.eu1.make.com/..." })}
        <div></div>
      </div>
    </div>
  `;

  bindFields(pane);
}

function renderTabLogic() {
  const pane = $("#tab-logic");
  if (!ensureCurrent()) return;

  pane.innerHTML = `
    <div class="section">
      <div class="sectionTitle">Słowa kluczowe</div>
      <div class="sectionHint">Backend blokuje wiadomość, gdy wykryje słowo z <span class="mono">blocked_keywords</span>.</div>

      <div class="grid2">
        ${fieldJson({ label: "Blocked keywords (array)", path: "blocked_keywords", help: "Np. [\"samobójstwo\", \"narkotyki\"]", rows: 10 })}
        ${fieldJson({ label: "Allowed keywords (array)", path: "allowed_keywords", help: "Opcjonalnie — jeśli chcesz wprowadzić whitelistę po stronie widgetu/backendu.", rows: 10 })}
      </div>
    </div>

    <div class="section">
      <div class="sectionTitle">Zaawansowane</div>
      <div class="sectionHint">Jeśli dodasz nowe pola w Supabase / mapClientRow, a nie ma ich jeszcze w UI — nadal ogarniesz je w JSON tab.</div>
      <div class="help">Wskazówka: trzymaj „kanoniczną” konfigurację w formularzu, a JSON wykorzystuj do wyjątków.</div>
    </div>
  `;

  bindFields(pane);
}

/* -------------------------- stats + logs ------------------------- */

async function loadStats() {
  if (!state.currentId) return;
  try {
    const data = await api(`/admin/stats/${encodeURIComponent(state.currentId)}`, { method: "GET" });
    state.stats = data;

    const box = $("#statsBox");
    const last = data?.last_activity ? new Date(data.last_activity).toLocaleString() : "—";

    box.innerHTML = `
      <div class="stat"><div class="statLabel">Conversations</div><div class="statValue">${escapeHtml(data?.conversations ?? 0)}</div></div>
      <div class="stat"><div class="statLabel">User messages</div><div class="statValue">${escapeHtml(data?.messages_user ?? 0)}</div></div>
      <div class="stat"><div class="statLabel">Assistant messages</div><div class="statValue">${escapeHtml(data?.messages_assistant ?? 0)}</div></div>
      <div class="stat"><div class="statLabel">Last activity</div><div class="statValue">${escapeHtml(last)}</div></div>
    `;
  } catch (e) {
    toast("err", "Statystyki", e.message || "Nie udało się pobrać.");
  }
}

async function loadLogs() {
  if (!state.currentId) return;
  try {
    const limit = Math.max(1, Math.min(500, Number($("#logsLimit").value || 80)));
    const data = await api(`/admin/logs/${encodeURIComponent(state.currentId)}?limit=${limit}`, { method: "GET" });
    state.logs = Array.isArray(data) ? data : [];

    const box = $("#logsBox");
    if (!state.logs.length) {
      box.innerHTML = `<div class="logRow"><div class="muted">Brak logów.</div></div>`;
      return;
    }

    box.innerHTML = state.logs.map((row) => {
      const t = row.createdAt ? new Date(row.createdAt).toLocaleString() : "—";
      const roleClass = row.role === "user" ? "roleUser" : "roleAssistant";
      return `
        <div class="logRow">
          <div class="logMeta">
            <div><span class="logRole ${roleClass}">${escapeHtml(row.role || "")}</span> • ${escapeHtml(t)}</div>
            <div class="mono">${escapeHtml(row.sessionId || "")}</div>
          </div>
          <div class="logContent">${escapeHtml(row.content || "")}</div>
        </div>
      `;
    }).join("");
  } catch (e) {
    toast("err", "Logi", e.message || "Nie udało się pobrać.");
  }
}

/* --------------------------- preview iframe ---------------------- */

function updatePreviewFrame() {
  if (!state.currentId) return;
  // keep it simple: preview reads clientId and apiBase from query
  const src = `preview.html?client=${encodeURIComponent(state.currentId)}&api=${encodeURIComponent(state.apiBase)}`;
  const frame = $("#previewFrame");
  if (frame && frame.src !== src) frame.src = src;
}

function reloadPreviewFrame() {
  const frame = $("#previewFrame");
  if (!frame) return;
  frame.src = frame.src; // reload
}

function openPreviewTab() {
  if (!state.currentId) return;
  const url = `preview.html?client=${encodeURIComponent(state.currentId)}&api=${encodeURIComponent(state.apiBase)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* -------------------------- JSON tab ----------------------------- */

function syncJsonExport() {
  const out = $("#jsonExport");
  if (!out) return;
  out.value = state.current ? stableStringify(state.current) : "";
}

function copyExportJson() {
  const out = $("#jsonExport");
  if (!out || !out.value) return;
  navigator.clipboard?.writeText(out.value).then(
    () => toast("ok", "Skopiowano", "JSON trafił do schowka."),
    () => toast("err", "Błąd", "Nie udało się skopiować.")
  );
}

function beautifyExportJson() {
  try {
    const out = $("#jsonExport");
    const obj = JSON.parse(out.value || "{}");
    out.value = JSON.stringify(obj, null, 2);
    toast("ok", "Sformatowano", "JSON został uporządkowany.");
  } catch {
    toast("err", "Błąd", "Niepoprawny JSON w eksporcie.");
  }
}

function applyImportJson() {
  try {
    const raw = ($("#jsonImport").value || "").trim();
    if (!raw) return toast("warn", "Import", "Wklej JSON.");
    const obj = JSON.parse(raw);

    if (!obj || typeof obj !== "object") {
      toast("err", "Import", "JSON musi być obiektem.");
      return;
    }
    if (!obj.id || obj.id !== state.currentId) {
      toast("warn", "Import", `ID w imporcie (${obj.id || "brak"}) różni się od aktualnego (${state.currentId}). Zostawiam aktualne ID.`);
      obj.id = state.currentId;
    }

    state.current = obj;
    renderAllTabs();
    afterChange();
    toast("ok", "Zaimportowano", "Wklejony JSON został zastosowany w formularzu.");
  } catch {
    toast("err", "Import", "Niepoprawny JSON.");
  }
}

/* ----------------------------- save ------------------------------ */

function sanitizeForSave(client) {
  // Keep only fields the backend understands; but it’s okay to send extra too.
  // Here we ensure required nesting exists.
  const c = deepClone(client);

  // ensure required nodes
  if (!c.company || typeof c.company !== "object") c.company = {};
  if (!c.theme || typeof c.theme !== "object") c.theme = {};
  if (!Array.isArray(c.quick_replies)) c.quick_replies = [];
  if (!Array.isArray(c.blocked_keywords)) c.blocked_keywords = [];
  if (!Array.isArray(c.allowed_keywords)) c.allowed_keywords = [];
  if (!Array.isArray(c.lead_form_fields)) c.lead_form_fields = [];

  // normalize nullables from empty strings if you prefer (optional)
  // (left as-is; backend merge handles it)

  return c;
}

async function saveCurrent() {
  if (!state.currentId || !state.current) return;
  try {
    // quick guard: check JSON fields have been parsed (we parse on blur),
    // so user might be mid-edit; we’ll still try to parse the export as a final validation.
    try {
      JSON.parse(stableStringify(state.current));
    } catch {
      toast("err", "Zapis", "Wewnętrzny błąd JSON. Sprawdź pola JSON.");
      return;
    }

    const payload = sanitizeForSave(state.current);

    const res = await api(`/admin/clients/${encodeURIComponent(state.currentId)}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    // backend returns { ok, client }
    const updated = res?.client || payload;

    state.clientsById[state.currentId] = deepClone(updated);
    setCurrentClient(state.currentId);

    toast("ok", "Zapisano", "Zmiany trafiły do bazy.");
  } catch (e) {
    if (e.status === 401) toast("err", "Brak autoryzacji", "Zaloguj się ponownie.");
    else toast("err", "Zapis nieudany", e.message || "Błąd serwera.");
  }
}

async function deleteCurrent() {
  if (!state.currentId) return;

  confirmModal({
    title: "Usuń klienta",
    body: `
      <div class="help">Na pewno chcesz usunąć klienta <span class="mono">${escapeHtml(state.currentId)}</span>?</div>
      <div class="warn">Tej operacji nie da się cofnąć.</div>
    `,
    okText: "Usuń",
    danger: true,
    onOk: async () => {
      try {
        await api(`/admin/clients/${encodeURIComponent(state.currentId)}`, { method: "DELETE" });
        toast("ok", "Usunięto", `Klient ${state.currentId} został usunięty.`);
        state.currentId = null;
        await reloadAll(true);
      } catch (e) {
        toast("err", "Błąd", e.message || "Nie udało się usunąć.");
      }
    }
  });
}

/* ----------------------------- create ---------------------------- */

function openCreateModal() {
  openModal({
    title: "Dodaj nowego klienta",
    okText: "Utwórz",
    body: `
      <div class="grid2">
        <div class="field">
          <label for="newId">Nowe clientId</label>
          <input id="newId" type="text" placeholder="np. salon_xyz" />
          <div class="help">Tylko litery/cyfry/_/-. Unikaj spacji i polskich znaków.</div>
        </div>

        <div class="field">
          <label for="newFrom">Start z szablonu</label>
          <select id="newFrom">
            <option value="">(domyślny)</option>
            ${Object.keys(state.clientsById).sort().map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join("")}
          </select>
          <div class="help">Skopiuje całą konfigurację i podmieni tylko ID.</div>
        </div>
      </div>

      <div class="field">
        <label for="newName">Nazwa firmy (opcjonalnie)</label>
        <input id="newName" type="text" placeholder="np. Pracownia Kamieniarska AMICO" />
      </div>

      <div class="field">
        <label for="newNotes">Szybki start (opcjonalnie)</label>
        <textarea id="newNotes" rows="4" placeholder="1-2 zdania: co firma robi, co ma być priorytetem asystenta..."></textarea>
        <div class="help">Wstawię to do knowledge jako starter, żebyś nie zaczynał od pustej kartki.</div>
      </div>
    `,
    onOk: async () => {
      const id = ($("#newId").value || "").trim();
      const from = ($("#newFrom").value || "").trim();
      const name = ($("#newName").value || "").trim();
      const notes = ($("#newNotes").value || "").trim();

      if (!id) {
        toast("warn", "Brak ID", "Podaj clientId.");
        return false;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        toast("warn", "Niepoprawne ID", "Użyj tylko litery/cyfry/_/-. Bez spacji.");
        return false;
      }
      if (state.clientsById[id]) {
        toast("warn", "ID zajęte", "Taki klient już istnieje.");
        return false;
      }

      try {
        // Create server-side row first
        const created = await api("/admin/clients", {
          method: "POST",
          body: JSON.stringify({ id })
        });

        let clientObj = created?.client ? deepClone(created.client) : deepClone(DEFAULTS);
        clientObj.id = id;

        // If copy from template: overwrite local object and then PUT to server
        if (from && state.clientsById[from]) {
          clientObj = deepClone(state.clientsById[from]);
          clientObj.id = id;
          clientObj.company = clientObj.company || {};
        } else {
          // Ensure defaults structure
          clientObj = { ...deepClone(DEFAULTS), ...clientObj, id };
          clientObj.company = { ...deepClone(DEFAULTS.company), ...(clientObj.company || {}) };
          clientObj.theme = { ...deepClone(DEFAULTS.theme), ...(clientObj.theme || {}) };
        }

        if (name) clientObj.company.name = name;
        if (notes) clientObj.knowledge = notes;

        // push config
        await api(`/admin/clients/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(sanitizeForSave(clientObj))
        });

        // refresh list and select
        await loadClients();
        selectClient(id);
        toast("ok", "Utworzono", `Dodano klienta ${id}.`);
        return true;
      } catch (e) {
        toast("err", "Błąd", e.message || "Nie udało się utworzyć klienta.");
        return false;
      }
    }
  });
}

/* ---------------------------- duplicate -------------------------- */

function openDuplicateModal() {
  if (!state.currentId || !state.current) return;

  openModal({
    title: "Duplikuj klienta",
    okText: "Duplikuj",
    body: `
      <div class="help">Skopiuje całą konfigurację (lokalnie + zapis do bazy) i utworzy nowy rekord.</div>

      <div class="grid2">
        <div class="field">
          <label for="dupFrom">Źródło</label>
          <input id="dupFrom" type="text" value="${escapeHtml(state.currentId)}" readonly />
        </div>

        <div class="field">
          <label for="dupId">Nowe clientId</label>
          <input id="dupId" type="text" placeholder="np. ${escapeHtml(state.currentId)}_copy" />
        </div>
      </div>
    `,
    onOk: async () => {
      const id = ($("#dupId").value || "").trim();
      if (!id) { toast("warn", "Brak ID", "Podaj nowe clientId."); return false; }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) { toast("warn", "Niepoprawne ID", "Użyj tylko litery/cyfry/_/-."); return false; }
      if (state.clientsById[id]) { toast("warn", "ID zajęte", "Taki klient już istnieje."); return false; }

      try {
        await api("/admin/clients", { method: "POST", body: JSON.stringify({ id }) });

        const copy = deepClone(state.current);
        copy.id = id;

        await api(`/admin/clients/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(sanitizeForSave(copy))
        });

        await loadClients();
        selectClient(id);
        toast("ok", "Gotowe", `Utworzono kopię: ${id}.`);
        return true;
      } catch (e) {
        toast("err", "Błąd", e.message || "Nie udało się zduplikować.");
        return false;
      }
    }
  });
}

/* ------------------------------ modal ---------------------------- */

let modalState = { onOk: null };

function setupModal() {
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalCancel").addEventListener("click", closeModal);
  $("#modalRoot").addEventListener("click", (e) => {
    if (e.target.classList.contains("modalOverlay")) closeModal();
  });
  $("#modalOk").addEventListener("click", async () => {
    if (!modalState.onOk) return closeModal();
    const result = await modalState.onOk();
    if (result !== false) closeModal();
  });
}

function openModal({ title, body, okText = "OK", cancelText = "Anuluj", danger = false, onOk }) {
  $("#modalTitle").textContent = title || "";
  $("#modalBody").innerHTML = body || "";
  $("#modalOk").textContent = okText;
  $("#modalCancel").textContent = cancelText;
  $("#modalOk").classList.toggle("danger", !!danger);

  modalState.onOk = onOk || null;

  $("#modalRoot").classList.remove("hidden");
  $("#modalRoot").setAttribute("aria-hidden", "false");

  // focus first input
  setTimeout(() => {
    const first = $("#modalBody").querySelector("input,textarea,select,button");
    if (first) first.focus();
  }, 0);
}

function closeModal() {
  $("#modalRoot").classList.add("hidden");
  $("#modalRoot").setAttribute("aria-hidden", "true");
  modalState.onOk = null;
}

function confirmModal({ title, body, okText = "OK", cancelText = "Anuluj", danger = false, onOk }) {
  openModal({ title, body, okText, cancelText, danger, onOk });
}

