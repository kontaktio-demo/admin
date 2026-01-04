/* ============================================
   KONFIGURACJA
============================================ */

const API_BASE = "https://chatbot-backend-x2cy.onrender.com";

/* ============================================
   START
============================================ */

document.addEventListener("DOMContentLoaded", () => {

  /* ============================
     ELEMENTY DOM
  ============================ */

  const loginView = document.getElementById("login-view");
  const panelView = document.getElementById("panel-view");

  const loginBtn = document.getElementById("login-btn");
  const passwordInput = document.getElementById("admin-password");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  const clientsListEl = document.getElementById("clients-list");
  const emptyState = document.getElementById("empty-state");

  const clientForm = document.getElementById("client-form");
  const clientIdLabel = document.getElementById("client-id-label");
  const saveStatus = document.getElementById("save-status");

  const statsContent = document.getElementById("stats-content");
  const logsContent = document.getElementById("logs-content");
  const previewIframe = document.getElementById("widget-preview");

  /* ============================
     STATE
  ============================ */

  let token = null;
  let clients = {};
  let currentClientId = null;

  /* ============================
     TOKEN
  ============================ */

  function getToken() {
    if (token) return token;
    const t = localStorage.getItem("kontaktio-admin-token");
    if (t) token = t;
    return token;
  }

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem("kontaktio-admin-token", t);
    else localStorage.removeItem("kontaktio-admin-token");
  }

  /* ============================
     VIEW
  ============================ */

  function setView(loggedIn) {
    if (loggedIn) {
      loginView.classList.remove("active");
      panelView.classList.add("active");
    } else {
      loginView.classList.add("active");
      panelView.classList.remove("active");
    }
  }

  /* ============================
     API
  ============================ */

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
    if (!res.ok) throw new Error(data.error || "Błąd serwera");
    return data;
  }

  /* ============================
     LOGIN
  ============================ */

  async function handleLogin() {
    loginError.textContent = "";
    const password = passwordInput.value.trim();

    if (!password) {
      loginError.textContent = "Podaj hasło administratora.";
      return;
    }

    try {
      const res = await fetch(API_BASE + "/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok || !data.token) {
        loginError.textContent = data.error || "Nieprawidłowe hasło.";
        return;
      }

      setToken(data.token);
      passwordInput.value = "";
      await loadClients();
      setView(true);

    } catch (err) {
      loginError.textContent = "Błąd połączenia z backendem.";
    }
  }

  function handleLogout() {
    setToken(null);
    currentClientId = null;
    clients = {};
    clientsListEl.innerHTML = "";
    clientForm.classList.remove("active");
    emptyState.style.display = "block";
    setView(false);
  }

  /* ============================
     CLIENTS
  ============================ */

  async function loadClients() {
    const data = await api("/admin/clients");
    clients = data || {};
    renderClientsList();
  }

  function renderClientsList() {
    clientsListEl.innerHTML = "";
    const entries = Object.entries(clients);

    if (!entries.length) {
      clientsListEl.innerHTML = "<li><span>Brak klientów</span></li>";
      return;
    }

    entries.forEach(([id, cfg]) => {
      const li = document.createElement("li");
      if (id === currentClientId) li.classList.add("active");

      li.innerHTML = `
        <span>${cfg.company?.name || id}</span>
        <small>${id} • ${cfg.status}</small>
      `;

      li.addEventListener("click", () => {
        currentClientId = id;
        renderClientsList();
        showClientForm(id);
        loadStats(id);
        loadLogs(id);
        updatePreview(id);
      });

      clientsListEl.appendChild(li);
    });
  }

  function showClientForm(id) {
    emptyState.style.display = "none";
    clientForm.classList.add("active");
    fillClientForm(id);
    saveStatus.textContent = "";
  }

  /* ============================
     PREVIEW
  ============================ */

  function updatePreview(id) {
    previewIframe.src =
      API_BASE + "/admin/preview.html?client=" + encodeURIComponent(id);
  }

  /* ============================
     STATS
  ============================ */

  async function loadStats(id) {
    statsContent.innerHTML = "Ładowanie...";
    try {
      const d = await api(`/admin/stats/${id}`);
      statsContent.innerHTML = `
        <div class="stat-card"><h3>Rozmowy</h3><p>${d.conversations || 0}</p></div>
        <div class="stat-card"><h3>Użytkownik</h3><p>${d.messages_user || 0}</p></div>
        <div class="stat-card"><h3>Asystent</h3><p>${d.messages_assistant || 0}</p></div>
      `;
    } catch {
      statsContent.innerHTML = "Błąd statystyk.";
    }
  }

  /* ============================
     LOGS
  ============================ */

  async function loadLogs(id) {
    logsContent.innerHTML = "Ładowanie...";
    try {
      const logs = await api(`/admin/logs/${id}`);
      if (!logs.length) {
        logsContent.innerHTML = "<p>Brak logów.</p>";
        return;
      }

      logsContent.innerHTML = logs.map(l => `
        <div class="log-entry ${l.role}">
          <div class="log-meta">
            <span>${l.role}</span>
            <small>${l.createdAt}</small>
          </div>
          <div class="log-content">${l.content}</div>
        </div>
      `).join("");
    } catch {
      logsContent.innerHTML = "Błąd logów.";
    }
  }

  /* ============================
     FORM
  ============================ */

  function fillClientForm(id) {
    const c = clients[id];
    if (!c) return;

    clientIdLabel.textContent = id;
    document.getElementById("company-name").value = c.company?.name || "";
    document.getElementById("client-status").value = c.status || "active";
    document.getElementById("client-status-message").value = c.statusMessage || "";
    document.getElementById("model").value = c.model || "";
    document.getElementById("temperature").value = c.temperature ?? 0.4;
    document.getElementById("max-tokens").value = c.maxTokens ?? 300;
    document.getElementById("system-prompt").value = c.system_prompt || "";
    document.getElementById("knowledge").value = c.knowledge || "";
    document.getElementById("rules").value = c.rules || "";
  }

  function getClientFormData() {
    return {
      status: document.getElementById("client-status").value,
      statusMessage: document.getElementById("client-status-message").value,
      model: document.getElementById("model").value,
      temperature: parseFloat(document.getElementById("temperature").value),
      maxTokens: parseInt(document.getElementById("max-tokens").value, 10),
      system_prompt: document.getElementById("system-prompt").value,
      knowledge: document.getElementById("knowledge").value,
      rules: document.getElementById("rules").value
    };
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!currentClientId) return;

    saveStatus.textContent = "Zapisywanie...";
    try {
      const res = await api(`/admin/clients/${currentClientId}`, {
        method: "PUT",
        body: getClientFormData()
      });
      clients[currentClientId] = res.client;
      saveStatus.textContent = "Zapisano.";
    } catch {
      saveStatus.textContent = "Błąd zapisu.";
    }
  }

  /* ============================
     EVENTS
  ============================ */

  loginBtn.addEventListener("click", handleLogin);
  passwordInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLogin();
  });

  logoutBtn.addEventListener("click", handleLogout);
  clientForm.addEventListener("submit", handleSave);

  document.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.querySelector(`.tab-content[data-tab="${tab}"]`)?.classList.add("active");
    });
  });

  /* ============================
     INIT
  ============================ */

  if (getToken()) {
    loadClients().then(() => setView(true)).catch(() => setView(false));
  } else {
    setView(false);
  }

});

