/* ============================================
   KONFIGURACJA
============================================ */

const API_BASE = "https://chatbot-backend-x2cy.onrender.com";

/* ============================================
   ELEMENTY DOM
============================================ */

const loginView = document.getElementById("login-view");
const panelView = document.getElementById("panel-view");

const loginBtn = document.getElementById("login-btn");
const passwordInput = document.getElementById("admin-password");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const clientsListEl = document.getElementById("clients-list");
const addClientBtn = document.getElementById("add-client-btn");
const emptyState = document.getElementById("empty-state");

const clientForm = document.getElementById("client-form");
const clientIdLabel = document.getElementById("client-id-label");
const deleteClientBtn = document.getElementById("delete-client-btn");
const saveStatus = document.getElementById("save-status");

const statsContent = document.getElementById("stats-content");
const logsContent = document.getElementById("logs-content");
const previewIframe = document.getElementById("widget-preview");

/* ============================================
   ZMIENNE GLOBALNE
============================================ */

let token = null;
let clients = {};
let currentClientId = null;

/* ============================================
   AUTH — TOKEN
============================================ */

function getToken() {
  if (token) return token;
  const t = localStorage.getItem("kontaktio-admin-token");
  if (t) token = t;
  return token;
}

function setToken(t) {
  token = t;
  if (t) {
    localStorage.setItem("kontaktio-admin-token", t);
  } else {
    localStorage.removeItem("kontaktio-admin-token");
  }
}

/* ============================================
   API WRAPPER
============================================ */

async function api(path, options = {}) {
  const t = getToken();
  const headers = options.headers || {};

  if (t) headers["Authorization"] = "Bearer " + t;

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(API_BASE + path, {
    method: options.method || "GET",
    headers,
    body: options.body
      ? options.body instanceof FormData
        ? options.body
        : JSON.stringify(options.body)
      : undefined
  });

  if (res.status === 401 || res.status === 403) {
    setToken(null);
    setView(false);
    throw new Error("unauthorized");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error || "Błąd serwera";
    throw new Error(msg);
  }

  return data;
}

/* ============================================
   LOGOWANIE
============================================ */

function setView(isLoggedIn) {
  if (isLoggedIn) {
    loginView.classList.remove("active");
    panelView.classList.add("active");
  } else {
    loginView.classList.add("active");
    panelView.classList.remove("active");
  }
}

async function handleLogin() {
  loginError.textContent = "";
  const pwd = passwordInput.value.trim();

  if (!pwd) {
    loginError.textContent = "Podaj hasło administratora.";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.token) {
      loginError.textContent = data.error || "Nieprawidłowe hasło.";
      return;
    }

    setToken(data.token);
    passwordInput.value = "";

    await loadClients();
    setView(true);

  } catch (e) {
    loginError.textContent = "Błąd logowania.";
  }
}

/* ============================================
   ŁADOWANIE LISTY KLIENTÓW
============================================ */

async function loadClients() {
  try {
    const data = await api("/admin/clients");
    clients = data || {};
    renderClientsList();
  } catch (e) {
    alert("Nie udało się pobrać listy klientów. " + e.message);
  }
}

/* ============================================
   INICJALIZACJA
============================================ */

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

logoutBtn.addEventListener("click", () => {
  setToken(null);
  currentClientId = null;
  clients = {};
  clientsListEl.innerHTML = "";
  clientForm.classList.remove("active");
  emptyState.style.display = "block";
  setView(false);
});

(async function init() {
  const t = getToken();
  if (!t) {
    setView(false);
    return;
  }

  try {
    await loadClients();
    setView(true);
  } catch (err) {
    setToken(null);
    setView(false);
  }
})();

/* ============================================
   RENDEROWANIE LISTY KLIENTÓW
============================================ */

function renderClientsList() {
  clientsListEl.innerHTML = "";
  const entries = Object.entries(clients);

  if (!entries.length) {
    clientsListEl.innerHTML =
      '<li><span>Brak klientów</span><small></small></li>';
    return;
  }

  entries.forEach(([id, cfg]) => {
    const li = document.createElement("li");
    li.dataset.id = id;

    if (id === currentClientId) li.classList.add("active");

    const name = cfg.company?.name || id;
    const status = cfg.status || "active";

    li.innerHTML = `
      <span>${name}</span>
      <small>${id} • ${status}</small>
    `;

    li.addEventListener("click", () => {
      currentClientId = id;
      renderClientsList();
      showClientForm(id);
      loadStats(id);
      loadLogs(id);
      updateWidgetPreview(id);
    });

    clientsListEl.appendChild(li);
  });
}

/* ============================================
   WYŚWIETLANIE FORMULARZA KLIENTA
============================================ */

function showClientForm(id) {
  emptyState.style.display = "none";
  clientForm.classList.add("active");
  fillClientForm(id);
  saveStatus.textContent = "";
}

/* ============================================
   PODGLĄD WIDGETU
============================================ */

function updateWidgetPreview(clientId) {
  previewIframe.src = API_BASE + "/admin/preview.html?client=" + encodeURIComponent(clientId);
}

/* ============================================
   STATYSTYKI
============================================ */

async function loadStats(clientId) {
  statsContent.innerHTML = "Ładowanie...";

  try {
    const data = await api(`/admin/stats/${clientId}`);

    statsContent.innerHTML = `
      <div class="stat-card">
        <h3>Rozmowy</h3>
        <p>${data.conversations || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Wiadomości użytkowników</h3>
        <p>${data.messages_user || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Wiadomości asystenta</h3>
        <p>${data.messages_assistant || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Ostatnia aktywność</h3>
        <p>${data.last_activity || "—"}</p>
      </div>
    `;
  } catch (err) {
    statsContent.innerHTML = "Błąd ładowania statystyk.";
  }
}

/* ============================================
   LOGI
============================================ */

async function loadLogs(clientId) {
  logsContent.innerHTML = "Ładowanie...";

  try {
    const data = await api(`/admin/logs/${clientId}`);

    if (!data.length) {
      logsContent.innerHTML = "<p>Brak logów.</p>";
      return;
    }

    logsContent.innerHTML = data
      .map(
        (log) => `
      <div class="log-entry ${log.role}">
        <div class="log-meta">
          <span>${log.role}</span>
          <small>${log.createdAt}</small>
        </div>
        <div class="log-content">${log.content}</div>
      </div>
    `
      )
      .join("");
  } catch (err) {
    logsContent.innerHTML = "Błąd ładowania logów.";
  }
}

/* ============================================
   TABS
============================================ */

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;

    document
      .querySelectorAll(".tab-content")
      .forEach((el) => el.classList.remove("active"));

    const target = document.querySelector(`.tab-content[data-tab="${tab}"]`);
    if (target) target.classList.add("active");
  });
});

/* ============================================
   WYPEŁNIANIE FORMULARZA KLIENTA
============================================ */

function fillClientForm(id) {
  const cfg = clients[id];
  if (!cfg) return;

  clientIdLabel.textContent = id;

  /* ---------------- COMPANY ---------------- */
  document.getElementById("company-name").value = cfg.company?.name || "";
  document.getElementById("company-email").value = cfg.company?.email || "";
  document.getElementById("company-phone").value = cfg.company?.phone || "";
  document.getElementById("company-address").value = cfg.company?.address || "";
  document.getElementById("company-hours").value = cfg.company?.hours || "";

  /* ---------------- STATUS ---------------- */
  document.getElementById("client-status").value = cfg.status || "active";
  document.getElementById("client-status-message").value =
    cfg.statusMessage || "";

  /* ---------------- AI ---------------- */
  document.getElementById("model").value = cfg.model || "";
  document.getElementById("temperature").value = cfg.temperature ?? 0.4;
  document.getElementById("max-tokens").value = cfg.maxTokens ?? 300;
  document.getElementById("top-p").value = cfg.top_p ?? 1;
  document.getElementById("presence-penalty").value =
    cfg.presence_penalty ?? 0;
  document.getElementById("frequency-penalty").value =
    cfg.frequency_penalty ?? 0;
  document.getElementById("context-limit").value = cfg.context_limit ?? 3000;

  document.getElementById("system-prompt").value = cfg.system_prompt || "";
  document.getElementById("knowledge").value = cfg.knowledge || "";
  document.getElementById("rules").value = cfg.rules || "";

  /* ---------------- BEHAVIOR ---------------- */
  document.getElementById("welcome-message").value =
    cfg.welcome_message || "";
  document.getElementById("welcome-hint").value = cfg.welcome_hint || "";
  document.getElementById("launcher-icon").value = cfg.launcher_icon || "";

  document.getElementById("auto-open-enabled").value =
    cfg.auto_open_enabled ? "true" : "false";
  document.getElementById("auto-open-delay").value =
    cfg.auto_open_delay ?? 15000;

  document.getElementById("quick-replies").value =
    Array.isArray(cfg.quick_replies)
      ? cfg.quick_replies.join(", ")
      : "";

  /* ---------------- THEME ---------------- */
  const theme = cfg.theme || {};

  document.getElementById("theme-header-bg").value =
    theme.headerBg || "#020617";
  document.getElementById("theme-header-text").value =
    theme.headerText || "#e5e7eb";

  document.getElementById("theme-user-bubble-bg").value =
    theme.userBubbleBg || "#0f172a";
  document.getElementById("theme-user-bubble-text").value =
    theme.userBubbleText || "#e5e7eb";

  document.getElementById("theme-bot-bubble-bg").value =
    theme.botBubbleBg || "#020617";
  document.getElementById("theme-bot-bubble-text").value =
    theme.botBubbleText || "#94a3b8";

  document.getElementById("theme-widget-bg").value =
    theme.widgetBg || "#020617";
  document.getElementById("theme-input-bg").value =
    theme.inputBg || "#020617";
  document.getElementById("theme-input-text").value =
    theme.inputText || "#e5e7eb";

  document.getElementById("theme-button-bg").value =
    theme.buttonBg || "#7c3aed";
  document.getElementById("theme-button-text").value =
    theme.buttonText || "#ffffff";

  document.getElementById("theme-radius").value = theme.radius ?? 22;
  document.getElementById("theme-position").value = theme.position || "right";

  /* ---------------- UI ---------------- */
  document.getElementById("launcher-size").value =
    cfg.launcher_size ?? 64;
  document.getElementById("header-height").value =
    cfg.header_height ?? 52;
  document.getElementById("input-height").value =
    cfg.input_height ?? 48;
  document.getElementById("bubble-radius").value =
    cfg.bubble_radius ?? 18;

  /* ---------------- POSITIONING ---------------- */
  document.getElementById("offset-x").value = cfg.offset_x ?? 20;
  document.getElementById("offset-y").value = cfg.offset_y ?? 20;

  /* ---------------- DARK MODE ---------------- */
  document.getElementById("dark-mode-enabled").value =
    cfg.dark_mode_enabled ? "true" : "false";

  document.getElementById("dark-mode-theme").value =
    cfg.dark_mode_theme
      ? JSON.stringify(cfg.dark_mode_theme, null, 2)
      : "";

  /* ---------------- BUSINESS LINKS ---------------- */
  document.getElementById("website").value = cfg.website || "";
  document.getElementById("facebook-url").value = cfg.facebook_url || "";
  document.getElementById("instagram-url").value = cfg.instagram_url || "";
  document.getElementById("google-maps-url").value =
    cfg.google_maps_url || "";

  /* ---------------- LEAD FORM ---------------- */
  document.getElementById("lead-form-enabled").value =
    cfg.lead_form_enabled ? "true" : "false";

  document.getElementById("lead-form-title").value =
    cfg.lead_form_title || "";

  document.getElementById("lead-form-success-message").value =
    cfg.lead_form_success_message || "";

  document.getElementById("lead-form-fields").value =
    cfg.lead_form_fields
      ? JSON.stringify(cfg.lead_form_fields, null, 2)
      : "";

  /* ---------------- ROUTING ---------------- */
  document.getElementById("forward-to-email").value =
    cfg.forward_to_email || "";
  document.getElementById("webhook-url").value = cfg.webhook_url || "";
  document.getElementById("zapier-url").value = cfg.zapier_url || "";
  document.getElementById("make-url").value = cfg.make_url || "";

  /* ---------------- LOGIC ---------------- */
  document.getElementById("blocked-keywords").value =
    Array.isArray(cfg.blocked_keywords)
      ? cfg.blocked_keywords.join(", ")
      : "";

  document.getElementById("allowed-keywords").value =
    Array.isArray(cfg.allowed_keywords)
      ? cfg.allowed_keywords.join(", ")
      : "";

  document.getElementById("fallback-message").value =
    cfg.fallback_message || "";

  document.getElementById("handoff-message").value =
    cfg.handoff_message || "";
}

/* ============================================
   ZBIERANIE DANYCH Z FORMULARZA
============================================ */

function getClientFormData() {
  return {
    /* ---------------- COMPANY ---------------- */
    company: {
      name: document.getElementById("company-name").value.trim(),
      email: document.getElementById("company-email").value.trim(),
      phone: document.getElementById("company-phone").value.trim(),
      address: document.getElementById("company-address").value.trim(),
      hours: document.getElementById("company-hours").value.trim()
    },

    /* ---------------- STATUS ---------------- */
    status: document.getElementById("client-status").value,
    statusMessage: document.getElementById("client-status-message").value.trim(),

    /* ---------------- AI ---------------- */
    model: document.getElementById("model").value.trim(),
    temperature: parseFloat(document.getElementById("temperature").value),
    maxTokens: parseInt(document.getElementById("max-tokens").value, 10),
    top_p: parseFloat(document.getElementById("top-p").value),
