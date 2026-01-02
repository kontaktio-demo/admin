const API_BASE = "https://chatbot-backend-x2cy.onrender.com";

/* ---------------- ELEMENTS ---------------- */

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

let token = null;
let clients = {};
let currentClientId = null;

/* ---------------- AUTH ---------------- */

function setView(isLoggedIn) {
  if (isLoggedIn) {
    loginView.classList.remove("active");
    panelView.classList.add("active");
  } else {
    loginView.classList.add("active");
    panelView.classList.remove("active");
  }
}

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
    throw new Error("unauthorized");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error || "Błąd serwera";
    throw new Error(msg);
  }

  return data;
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

/* ---------------- CLIENTS ---------------- */

async function loadClients() {
  try {
    const data = await api("/admin/clients");
    clients = data || {};
    renderClientsList();
  } catch (e) {
    alert("Nie udało się pobrać listy klientów. " + e.message);
  }
}

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

function fillClientForm(id) {
  const cfg = clients[id];
  if (!cfg) return;

  clientIdLabel.textContent = id;

  document.getElementById("company-name").value = cfg.company?.name || "";
  document.getElementById("company-email").value = cfg.company?.email || "";
  document.getElementById("company-phone").value = cfg.company?.phone || "";
  document.getElementById("company-address").value = cfg.company?.address || "";
  document.getElementById("company-hours").value = cfg.company?.hours || "";

  document.getElementById("client-status").value = cfg.status || "active";
  document.getElementById("client-status-message").value =
    cfg.statusMessage || "";

  document.getElementById("temperature").value = cfg.temperature ?? 0.4;
  document.getElementById("max-tokens").value = cfg.maxTokens ?? 300;

  document.getElementById("knowledge").value = cfg.knowledge || "";
  document.getElementById("rules").value = cfg.rules || "";

  const theme = cfg.theme || {};
  document.getElementById("theme-header-bg").value = theme.headerBg || "#020617";
  document.getElementById("theme-header-text").value = theme.headerText || "#e5e7eb";
  document.getElementById("theme-user-bubble-bg").value = theme.userBubbleBg || "#0f172a";
  document.getElementById("theme-user-bubble-text").value = theme.userBubbleText || "#e5e7eb";
  document.getElementById("theme-bot-bubble-bg").value = theme.botBubbleBg || "#020617";
  document.getElementById("theme-bot-bubble-text").value = theme.botBubbleText || "#94a3b8";
  document.getElementById("theme-widget-bg").value = theme.widgetBg || "#020617";
  document.getElementById("theme-input-bg").value = theme.inputBg || "#020617";
  document.getElementById("theme-input-text").value = theme.inputText || "#e5e7eb";
  document.getElementById("theme-button-bg").value = theme.buttonBg || "#7c3aed";
  document.getElementById("theme-button-text").value = theme.buttonText || "#ffffff";
  document.getElementById("theme-radius").value = theme.radius ?? 22;
  document.getElementById("theme-position").value = theme.position || "right";
}

function getClientFormData() {
  return {
    company: {
      name: document.getElementById("company-name").value.trim(),
      email: document.getElementById("company-email").value.trim(),
      phone: document.getElementById("company-phone").value.trim(),
      address: document.getElementById("company-address").value.trim(),
      hours: document.getElementById("company-hours").value.trim()
    },
    status: document.getElementById("client-status").value,
    statusMessage: document.getElementById("client-status-message").value.trim(),
    temperature: parseFloat(document.getElementById("temperature").value),
    maxTokens: parseInt(document.getElementById("max-tokens").value, 10),
    knowledge: document.getElementById("knowledge").value,
    rules: document.getElementById("rules").value,
    theme: {
      headerBg: document.getElementById("theme-header-bg").value,
      headerText: document.getElementById("theme-header-text").value,
      userBubbleBg: document.getElementById("theme-user-bubble-bg").value,
      userBubbleText: document.getElementById("theme-user-bubble-text").value,
      botBubbleBg: document.getElementById("theme-bot-bubble-bg").value,
      botBubbleText: document.getElementById("theme-bot-bubble-text").value,
      widgetBg: document.getElementById("theme-widget-bg").value,
      inputBg: document.getElementById("theme-input-bg").value,
      inputText: document.getElementById("theme-input-text").value,
      buttonBg: document.getElementById("theme-button-bg").value,
      buttonText: document.getElementById("theme-button-text").value,
      radius: parseInt(document.getElementById("theme-radius").value, 10),
      position: document.getElementById("theme-position").value
    }
  };
}

function showClientForm(id) {
  emptyState.style.display = "none";
  clientForm.classList.add("active");
  fillClientForm(id);
  saveStatus.textContent = "";
}

/* ---------------- SAVE / DELETE ---------------- */

async function handleSaveClient(e) {
  e.preventDefault();
  if (!currentClientId) return;

  saveStatus.textContent = "Zapisywanie...";
  const payload = getClientFormData();

  try {
    const data = await api(`/admin/clients/${currentClientId}`, {
      method: "PUT",
      body: payload
    });

    clients[currentClientId] = data.client;
    renderClientsList();
    saveStatus.textContent = "Zapisano zmiany.";

    updateWidgetPreview(currentClientId);

    setTimeout(() => {
      saveStatus.textContent = "";
    }, 2000);
  } catch (err) {
    saveStatus.textContent = "Błąd zapisu: " + err.message;
  }
}

async function handleDeleteClient() {
  if (!currentClientId) return;
  if (!confirm(`Na pewno chcesz usunąć klienta "${currentClientId}"?`)) return;

  try {
    await api(`/admin/clients/${currentClientId}`, { method: "DELETE" });
    delete clients[currentClientId];
    currentClientId = null;
    renderClientsList();
    clientForm.classList.remove("active");
    emptyState.style.display = "block";
  } catch (err) {
    alert("Błąd usuwania: " + err.message);
  }
}

async function handleAddClient() {
  const id = prompt("Podaj ID nowego klienta:");
  if (!id) return;

  try {
    const data = await api("/admin/clients", {
      method: "POST",
      body: { id }
    });

    clients[id] = data.client;
    currentClientId = id;
    renderClientsList();
    showClientForm(id);
  } catch (err) {
    alert("Błąd dodawania: " + err.message);
  }
}

/* ---------------- STATS ---------------- */

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
        <p>${data.messagesUser || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Wiadomości asystenta</h3>
        <p>${data.messagesAssistant || 0}</p>
      </div>
      <div class="stat-card">
        <h3>Ostatnia aktywność</h3>
        <p>${data.lastActivity || "—"}</p>
      </div>
    `;
  } catch (err) {
    statsContent.innerHTML = "Błąd ładowania statystyk.";
  }
}

/* ---------------- LOGS ---------------- */

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

/* ---------------- PREVIEW ---------------- */

function updateWidgetPreview(clientId) {
  previewIframe.src = "preview.html?client=" + encodeURIComponent(clientId);
}

/* ---------------- TABS ---------------- */

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

/* ---------------- LOGOUT ---------------- */

function handleLogout() {
  setToken(null);
  currentClientId = null;
  clients = {};
  clientsListEl.innerHTML = "";
  clientForm.classList.remove("active");
  emptyState.style.display = "block";
  setView(false);
}

/* ---------------- INIT ---------------- */

loginBtn.addEventListener("click", handleLogin);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});

logoutBtn.addEventListener("click", handleLogout);

clientForm.addEventListener("submit", handleSaveClient);
deleteClientBtn.addEventListener("click", handleDeleteClient);
addClientBtn.addEventListener("click", handleAddClient);

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

