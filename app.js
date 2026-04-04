/* ============================================================
   SOCIAL REPORTS — OneSun
   Complete SPA with hash routing, cloud + localStorage persistence
   ============================================================ */

// ===== CONSTANTS =====
const ADMIN_PASS = 'On3Sun2024';
const STORE_KEY = 'onesun_reports_v1';

// ===== STORAGE =====
const DB = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { clients: {}, globalMetrics: [] }; }
    catch { return { clients: {}, globalMetrics: [] }; }
  },
  save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); },
  getClients() { return this.load().clients || {}; },
  getClient(slug) { return this.load().clients[slug] || null; },
  saveClient(client) {
    const data = this.load();
    if (!data.clients) data.clients = {};
    data.clients[client.slug] = client;
    this.save(data);
  },
  deleteClient(slug) {
    const data = this.load();
    delete data.clients[slug];
    this.save(data);
  },
  getGlobalMetrics() { return this.load().globalMetrics || []; },
  saveGlobalMetrics(metrics) {
    const data = this.load();
    data.globalMetrics = metrics;
    this.save(data);
  }
};

// ===== CLOUD SYNC =====
const CloudSync = {
  REPO: 'onesuncreative/reports',
  FILE: 'data.json',
  BRANCH: 'main',
  _token: null,
  _sha: null,
  _saving: false,
  _autoSaveTimer: null,

  getToken() {
    if (this._token) return this._token;
    this._token = localStorage.getItem('onesun_gh_token') || null;
    return this._token;
  },

  setToken(token) {
    this._token = token;
    localStorage.setItem('onesun_gh_token', token);
  },

  isConfigured() {
    return !!this.getToken();
  },

  async loadFromCloud() {
    if (!this.isConfigured()) return false;
    try {
      const resp = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?ref=${this.BRANCH}`, {
        headers: { 'Authorization': `token ${this.getToken()}`, 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!resp.ok) return false;
      const meta = await resp.json();
      this._sha = meta.sha;
      const content = atob(meta.content.replace(/\n/g, ''));
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(content, c => c.charCodeAt(0))));
      DB.save(data);
      return true;
    } catch (err) {
      console.error('CloudSync load error:', err);
      return false;
    }
  },

  async saveToCloud() {
    if (!this.isConfigured() || this._saving) return false;
    this._saving = true;
    try {
      const data = DB.load();
      const raw = JSON.stringify(data, null, 2);
      const encoded = btoa(unescape(encodeURIComponent(raw)));

      // Get current SHA if we don't have it
      if (!this._sha) {
        try {
          const resp = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?ref=${this.BRANCH}`, {
            headers: { 'Authorization': `token ${this.getToken()}`, 'Accept': 'application/vnd.github.v3+json' }
          });
          if (resp.ok) {
            const meta = await resp.json();
            this._sha = meta.sha;
          }
        } catch {}
      }

      const body = {
        message: `sync: ${new Date().toLocaleString('es-MX')}`,
        content: encoded,
        branch: this.BRANCH
      };
      if (this._sha) body.sha = this._sha;

      const resp = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.getToken()}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.message || 'Save failed');
      }
      const result = await resp.json();
      this._sha = result.content.sha;
      this._saving = false;
      return true;
    } catch (err) {
      console.error('CloudSync save error:', err);
      this._saving = false;
      return false;
    }
  },

  // Auto-save every 15 minutes
  startAutoSave() {
    this.stopAutoSave();
    if (!this.isConfigured()) return;
    this._autoSaveTimer = setInterval(async () => {
      const ok = await this.saveToCloud();
      if (ok) {
        const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        Toast.show(`Guardado automático completado — ${now}`, 'success', 4000);
      } else {
        Toast.show('Error al guardar automáticamente', 'error', 4000);
      }
    }, 15 * 60 * 1000); // 15 minutes
  },

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  },

  // Manual save with feedback
  async manualSave() {
    if (!this.isConfigured()) {
      this.showTokenModal();
      return;
    }
    Toast.show('Guardando en la nube...', 'info', 2000);
    const ok = await this.saveToCloud();
    if (ok) {
      const now = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      Toast.show(`Guardado exitosamente — ${now}`, 'success', 4000);
    } else {
      Toast.show('Error al guardar. Verifica tu token de GitHub.', 'error', 5000);
    }
  },

  showTokenModal() {
    const current = this.getToken() || '';
    const modal = createModal('Configurar sincronización en la nube', `
      <div style="margin-bottom:14px;font-size:0.85rem;color:var(--text-muted);line-height:1.6;">
        Para que los cambios sean visibles en todos los dispositivos, conecta tu repositorio de GitHub con un <strong>Personal Access Token</strong>.
      </div>
      <div class="form-group">
        <label>GitHub Token</label>
        <input type="password" id="m-gh-token" value="${current}" placeholder="ghp_xxxxxxxxxxxx" style="font-family:monospace;">
        <div class="password-hint">Token con permiso <code>repo</code>. Se guarda solo en este navegador.</div>
      </div>
    `, () => {
      const token = document.getElementById('m-gh-token')?.value?.trim();
      if (!token) { Toast.show('Ingresa un token', 'error'); return false; }
      this.setToken(token);
      this.startAutoSave();
      Toast.show('Token guardado. Sincronización activada.', 'success');
    });
    document.getElementById('app').appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
  }
};

// ===== UTILS =====
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { month:'short', day:'numeric', year:'numeric' }) : '';
const fmtNum = n => {
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  if (num >= 1e6) return (num/1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num/1e3).toFixed(1) + 'K';
  return num.toLocaleString('es-MX');
};

// ===== TOAST =====
const Toast = {
  show(msg, type = 'success', duration = 3000) {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]}</span><span>${esc(msg)}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
      el.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
};

// ===== LIGHTBOX =====
const Lightbox = {
  open(src) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = src;
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },
  close() {
    document.getElementById('lightbox').classList.add('hidden');
    document.getElementById('lightbox-img').src = '';
    document.body.style.overflow = '';
  }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') Lightbox.close(); });

// ===== AUTH STATE =====
const Auth = {
  _adminUnlocked: false,
  _clientsUnlocked: {},
  isAdminUnlocked() { return this._adminUnlocked; },
  unlockAdmin() { this._adminUnlocked = true; },
  lockAdmin() { this._adminUnlocked = false; },
  isClientUnlocked(slug) { return !!this._clientsUnlocked[slug]; },
  unlockClient(slug) { this._clientsUnlocked[slug] = true; },
};

// ===== ROUTER =====
const Router = {
  current: null,
  listen() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },
  navigate(hash) {
    window.location.hash = hash;
  },
  route() {
    const hash = window.location.hash.replace('#', '') || '/';
    const parts = hash.split('/').filter(Boolean);
    const view = parts[0] || 'admin';

    if (view === 'admin' || hash === '/') {
      App.showAdmin();
    } else if (view === 'client' && parts[1]) {
      const slug = parts[1];
      const mode = parts[2]; // 'editor' or undefined
      App.showClient(slug, mode === 'editor');
    } else {
      App.showAdmin();
    }
  }
};

// ===== CHART COLORS =====
const CHART_COLORS = [
  '#0000ff', '#00DDFF', '#E5FF16', '#16FFC3', '#ff6b6b', '#ffa500', '#9b59b6', '#2ecc71'
];

// ===== CHARTS =====
const Charts = {
  instances: {},
  destroy(id) {
    if (this.instances[id]) { this.instances[id].destroy(); delete this.instances[id]; }
  },
  render(id, type, labels, datasets, options = {}) {
    this.destroy(id);
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const isDark = document.body.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#a0aabf' : '#6b7280';
    this.instances[id] = new Chart(canvas, {
      type,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        plugins: {
          legend: { labels: { color: textColor, padding: 16, font: { size: 12, weight: '600' } } },
          tooltip: {
            backgroundColor: isDark ? '#373d46' : '#fff',
            titleColor: isDark ? '#f0f4ff' : '#1a1d24',
            bodyColor: isDark ? '#a0aabf' : '#6b7280',
            borderColor: isDark ? '#4a5060' : '#d1d9e6',
            borderWidth: 1,
            padding: 12,
          }
        },
        scales: type !== 'pie' && type !== 'doughnut' ? {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        } : {},
        ...options
      }
    });
  }
};

// ===== DEFAULT CLIENT TEMPLATE =====
function newClient(name, slug, password) {
  return {
    id: uid(), slug, name, password,
    logo: '',
    theme: 'dark',
    reportTitle: `Reporte de Resultados`,
    reportSubtitle: 'Campañas Digitales',
    viewStart: '',
    viewEnd: '',
    campaigns: [],
    socialChannels: [],
    preloadedMetrics: []
  };
}

function newCampaign(name = 'Nueva Campaña') {
  return {
    id: uid(), name, channel: 'Google Ads',
    startDate: '', endDate: '',
    metrics: [], evidences: [], bestContent: [],
    observations: ''
  };
}

function newSocialChannel(name = 'Instagram') {
  return {
    id: uid(), name, icon: '📱',
    startDate: '', endDate: '',
    metrics: [], evidences: [], bestContent: [],
    observations: ''
  };
}

function newMetric(n = '', v = '', u = '') { return { id: uid(), name: n, value: v, unit: u }; }
function newEvidence(type = 'image', src = '', name = 'Evidencia') { return { id: uid(), type, src, name }; }
function newContent() { return { id: uid(), image: '', imageType: 'url', metrics: [] }; }

// ===== APP =====
const App = {
  // ---- SHOW ADMIN ----
  showAdmin() {
    if (!Auth.isAdminUnlocked()) {
      this.renderAdminLogin();
    } else {
      this.renderAdminDashboard();
    }
  },

  renderAdminLogin() {
    document.getElementById('app').innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="logo-big">OS</div>
          <h2>Panel de Administración</h2>
          <p>Ingresa la contraseña para acceder al panel de clientes</p>
          <div class="login-error" id="admin-login-error">Contraseña incorrecta</div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="admin-pass-input" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="App.tryAdminLogin()">
            Acceder
          </button>
          <div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px; font-size:0.82rem; color:var(--text-muted);">
            ¿Eres cliente? <a onclick="App.goToClientLogin()" style="color:var(--secondary1);cursor:pointer;">Accede aquí</a>
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      const inp = document.getElementById('admin-pass-input');
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') App.tryAdminLogin(); });
    }, 50);
  },

  tryAdminLogin() {
    const val = document.getElementById('admin-pass-input')?.value;
    if (val === ADMIN_PASS) {
      Auth.unlockAdmin();
      this.renderAdminDashboard();
    } else {
      const err = document.getElementById('admin-login-error');
      if (err) err.classList.add('show');
    }
  },

  goToClientLogin() {
    const slug = prompt('Ingresa el identificador de tu reporte (ej: mi-empresa):');
    if (slug) Router.navigate(`/client/${slug.trim().toLowerCase()}`);
  },

  renderAdminDashboard() {
    const clients = DB.getClients();
    const clientCards = Object.values(clients).map(c => `
      <div class="client-card">
        <div class="client-card-header">
          <div class="client-avatar">
            ${c.logo ? `<img src="${esc(c.logo)}" alt="${esc(c.name)}">` : esc(c.name[0].toUpperCase())}
          </div>
          <div class="client-card-info">
            <h3>${esc(c.name)}</h3>
            <span>/${esc(c.slug)}</span>
          </div>
        </div>
        <div class="client-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="App.openClientEditor('${esc(c.slug)}')">✏️ Editor</button>
          <button class="btn btn-ghost btn-sm" onclick="window.open('#/client/${esc(c.slug)}','_blank')">👁 Ver</button>
          <button class="btn btn-icon btn-sm" style="background:rgba(255,69,96,0.12);color:var(--danger);" onclick="App.deleteClient('${esc(c.slug)}')">🗑</button>
        </div>
      </div>`).join('');

    document.getElementById('app').innerHTML = `
      <div class="accent-bar"></div>
      <header class="app-header">
        <div class="logo"><span class="logo-badge">OS</span> OneSun Reports</div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="CloudSync.manualSave()" style="gap:6px;">💾 Guardar</button>
          <button class="btn btn-ghost btn-sm" onclick="CloudSync.showTokenModal()" title="Configurar sincronización">☁️ Sync</button>
          <button class="theme-toggle" onclick="App.toggleTheme()">
            <span id="theme-icon">${document.body.classList.contains('dark') ? '☀️' : '🌙'}</span>
            <span id="theme-label">${document.body.classList.contains('dark') ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="Auth.lockAdmin(); App.showAdmin();">Cerrar sesión</button>
        </div>
      </header>
      <div class="admin-page">
        <div class="page-header">
          <div>
            <h1>Clientes</h1>
            <p>${Object.keys(clients).length} cliente${Object.keys(clients).length !== 1 ? 's' : ''} registrado${Object.keys(clients).length !== 1 ? 's' : ''}</p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="App.showGlobalMetricsModal()">📋 Métricas globales</button>
            <button class="btn btn-ghost btn-sm" onclick="BulkCSV.open()">📂 Importar campañas</button>
            <button class="btn btn-accent" onclick="App.showAddClientModal()">+ Nuevo cliente</button>
          </div>
        </div>
        <div class="client-grid">
          ${clientCards}
          <div class="add-client-card" onclick="App.showAddClientModal()">
            <span class="icon">+</span>
            <span>Agregar cliente</span>
          </div>
        </div>
      </div>`;
  },

  showAddClientModal(existingSlug = null) {
    const c = existingSlug ? DB.getClient(existingSlug) : null;
    const isEdit = !!c;

    const modal = createModal(isEdit ? 'Editar cliente' : 'Nuevo cliente', `
      <div class="form-group">
        <label>Nombre del cliente</label>
        <input type="text" id="m-client-name" placeholder="Ej: Empresa XYZ" value="${c ? esc(c.name) : ''}">
      </div>
      <div class="form-group">
        <label>Identificador (URL)</label>
        <input type="text" id="m-client-slug" placeholder="empresa-xyz" value="${c ? esc(c.slug) : ''}" ${isEdit ? 'disabled' : ''}>
        <div class="password-hint">Solo letras minúsculas, números y guiones. Ej: empresa-xyz</div>
      </div>
      <div class="form-group">
        <label>Contraseña del cliente</label>
        <input type="text" id="m-client-pass" placeholder="Contraseña para acceso del cliente" value="${c ? esc(c.password) : ''}">
      </div>
      <div class="form-group">
        <label>Logo (URL o dejar vacío)</label>
        <input type="text" id="m-client-logo" placeholder="https://..." value="${c ? esc(c.logo || '') : ''}">
      </div>
    `, () => {
      const name = document.getElementById('m-client-name').value.trim();
      const slug = isEdit ? existingSlug : document.getElementById('m-client-slug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
      const pass = document.getElementById('m-client-pass').value.trim();
      const logo = document.getElementById('m-client-logo').value.trim();

      if (!name || !slug || !pass) { Toast.show('Completa todos los campos', 'error'); return false; }
      if (!isEdit && DB.getClient(slug)) { Toast.show('Ya existe un cliente con ese identificador', 'error'); return false; }

      if (isEdit) {
        const existing = DB.getClient(slug);
        existing.name = name; existing.password = pass; existing.logo = logo;
        DB.saveClient(existing);
        Toast.show('Cliente actualizado');
      } else {
        const client = newClient(name, slug, pass);
        client.logo = logo;
        DB.saveClient(client);
        Toast.show('Cliente creado');
      }
      this.renderAdminDashboard();
    });
    document.getElementById('app').appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
  },

  deleteClient(slug) {
    if (!confirm(`¿Eliminar al cliente "${slug}"? Esta acción no se puede deshacer.`)) return;
    DB.deleteClient(slug);
    Toast.show('Cliente eliminado', 'info');
    this.renderAdminDashboard();
  },

  openClientEditor(slug) {
    Router.navigate(`/client/${slug}/editor`);
  },

  // ---- CLIENT VIEW ----
  showClient(slug, isEditorMode = false) {
    const client = DB.getClient(slug);
    if (!client) {
      document.getElementById('app').innerHTML = `
        <div class="login-screen">
          <div class="login-card">
            <div class="logo-big">?</div>
            <h2>Reporte no encontrado</h2>
            <p>El reporte que buscas no existe.</p>
          </div>
        </div>`;
      return;
    }

    if (isEditorMode) {
      if (!Auth.isAdminUnlocked()) {
        this.renderEditorLogin(slug, client);
      } else {
        this.renderEditor(slug, client);
      }
    } else {
      if (!Auth.isClientUnlocked(slug)) {
        this.renderClientLogin(slug, client);
      } else {
        this.renderClientView(slug, client);
      }
    }
  },

  renderClientLogin(slug, client) {
    document.getElementById('app').innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="logo-big">${client.logo ? `<img src="${esc(client.logo)}" style="width:100%;height:100%;object-fit:cover;border-radius:14px;">` : esc(client.name[0])}</div>
          <h2>${esc(client.name)}</h2>
          <p>Ingresa la contraseña para ver tus reportes</p>
          <div class="login-error" id="client-login-error">Contraseña incorrecta</div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="client-pass-input" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="App.tryClientLogin('${esc(slug)}')">
            Ver mis reportes
          </button>
        </div>
      </div>`;
    setTimeout(() => {
      const inp = document.getElementById('client-pass-input');
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') App.tryClientLogin(slug); });
    }, 50);
  },

  tryClientLogin(slug) {
    const client = DB.getClient(slug);
    const val = document.getElementById('client-pass-input')?.value;
    if (client && (val === client.password || val === ADMIN_PASS)) {
      Auth.unlockClient(slug);
      this.renderClientView(slug, DB.getClient(slug));
    } else {
      document.getElementById('client-login-error')?.classList.add('show');
    }
  },

  renderClientView(slug, client) {
    const isAdmin = Auth.isAdminUnlocked();
    document.getElementById('app').innerHTML = `
      <div class="accent-bar"></div>
      ${isAdmin ? `<div class="editor-banner">
        ✏️ Modo administrador — <a onclick="Router.navigate('/client/${esc(slug)}/editor')">Ir al editor</a> &nbsp;|&nbsp; <a onclick="Router.navigate('/admin')">Panel de clientes</a>
      </div>` : ''}
      <header class="app-header">
        <div class="logo">
          ${client.logo ? `<img src="${esc(client.logo)}" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">` : `<span class="logo-badge">${esc(client.name[0])}</span>`}
          <span>${esc(client.name)}</span>
        </div>
        <div class="header-actions">
          <button class="theme-toggle" onclick="App.toggleTheme()">
            <span>${document.body.classList.contains('dark') ? '☀️' : '🌙'}</span>
            <span>${document.body.classList.contains('dark') ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="Auth._clientsUnlocked['${esc(slug)}']=false; App.renderClientLogin('${esc(slug)}', DB.getClient('${esc(slug)}'));">Salir</button>
        </div>
      </header>
      <div class="client-hero">
        <div class="client-hero-content">
          <div class="client-logo">${client.logo ? `<img src="${esc(client.logo)}" alt="${esc(client.name)}">` : esc(client.name[0])}</div>
          <h1>${esc(client.reportTitle || client.name)}</h1>
          <p class="subtitle">${esc(client.reportSubtitle || 'Reporte de Resultados Digitales')}</p>
          ${(client.viewStart || client.viewEnd) ? `<div class="date-range-badge">📅 ${fmtDate(client.viewStart)} – ${fmtDate(client.viewEnd)}</div>` : ''}
        </div>
      </div>
      <div class="tabs-bar" id="main-tabs">
        <button class="tab-btn active" data-tab="campaigns" onclick="App.switchTab('campaigns')">📊 Campañas</button>
        <button class="tab-btn" data-tab="social" onclick="App.switchTab('social')">📱 Redes Sociales</button>
        <button class="tab-btn" data-tab="comparison" onclick="App.switchTab('comparison')">📈 Comparativas</button>
      </div>
      <div id="tab-content" data-slug="${esc(slug)}"></div>`;

    this._currentSlug = slug;
    this._currentTab = 'campaigns';
    this.switchTab('campaigns');
  },

  switchTab(tab) {
    this._currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const slug = this._currentSlug;
    const client = DB.getClient(slug);
    const container = document.getElementById('tab-content');
    if (!container) return;

    if (tab === 'campaigns') container.innerHTML = this.renderCampaignsTab(client);
    else if (tab === 'social') container.innerHTML = this.renderSocialTab(client);
    else if (tab === 'comparison') {
      container.innerHTML = this.renderComparisonTab(client);
      this.initComparisonCharts(client);
    }
  },

  renderCampaignsTab(client) {
    if (!client.campaigns || client.campaigns.length === 0) {
      return `<div class="section-content"><div class="empty-state"><div class="empty-icon">📊</div><h3>Sin campañas</h3><p>Aún no hay campañas registradas para este reporte.</p></div></div>`;
    }
    return `<div class="section-content">
      <div class="section-header"><h2>Campañas Digitales</h2><span class="badge">${client.campaigns.length} campaña${client.campaigns.length !== 1 ? 's' : ''}</span></div>
      <div class="campaign-list">
        ${client.campaigns.map(c => this.renderCampaignCard(c)).join('')}
      </div>
    </div>`;
  },

  renderSocialTab(client) {
    if (!client.socialChannels || client.socialChannels.length === 0) {
      return `<div class="section-content"><div class="empty-state"><div class="empty-icon">📱</div><h3>Sin canales</h3><p>Aún no hay canales de redes sociales registrados.</p></div></div>`;
    }
    return `<div class="section-content">
      <div class="section-header"><h2>Redes Sociales</h2><span class="badge">${client.socialChannels.length} canal${client.socialChannels.length !== 1 ? 'es' : ''}</span></div>
      <div class="campaign-list">
        ${client.socialChannels.map(c => this.renderCampaignCard(c, true)).join('')}
      </div>
    </div>`;
  },

  renderCampaignCard(c, isSocial = false) {
    const metrics = (c.metrics || []).map(m => `
      <div class="metric-card">
        <div class="metric-name">${esc(m.name)}</div>
        <div class="metric-value">${fmtNum(m.value)}</div>
        ${m.unit ? `<div class="metric-unit">${esc(m.unit)}</div>` : ''}
      </div>`).join('');

    const evidences = (c.evidences || []).map(e => {
      if (e.type === 'link' || (e.src && e.src.startsWith('http'))) {
        return `<a href="${esc(e.src)}" target="_blank" class="evidence-btn">🔗 ${esc(e.name)}</a>`;
      }
      return `<button class="evidence-btn" onclick="Lightbox.open('${esc(e.src)}')">🖼 ${esc(e.name)}</button>`;
    }).join('');

    const bestContent = (c.bestContent || []).slice(0, 3).map(bc => `
      <div class="content-card">
        <div class="content-card-img" ${bc.image ? `onclick="${bc.imageType === 'link' ? `window.open('${esc(bc.image)}','_blank')` : `Lightbox.open('${esc(bc.image)}')`}"` : ''}>
          ${bc.image ? `<img src="${esc(bc.image)}" alt="Contenido" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:2rem;color:var(--text-muted)">🖼</span>'}
        </div>
        <div class="content-card-body">
          <div class="content-metrics">
            ${(bc.metrics || []).map(m => `<span class="content-metric">${esc(m.name)}: <span>${fmtNum(m.value)}${m.unit ? ' ' + esc(m.unit) : ''}</span></span>`).join('')}
          </div>
        </div>
      </div>`).join('');

    return `
      <div class="campaign-card" id="cc-${esc(c.id)}">
        <div class="campaign-card-header" onclick="App.toggleCampaignCard('${esc(c.id)}')">
          <div class="campaign-card-title">
            ${isSocial ? `<span style="font-size:1.2rem;">${esc(c.icon || '📱')}</span>` : ''}
            <div>
              <div style="font-weight:700;">${esc(c.name)}</div>
              ${!isSocial ? `<span class="campaign-channel-badge">${esc(c.channel)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            ${(c.startDate || c.endDate) ? `<div class="campaign-date-range">📅 ${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}</div>` : ''}
            <span class="expand-icon">▼</span>
          </div>
        </div>
        <div class="campaign-card-body">
          ${metrics ? `<div class="metrics-grid" style="margin-bottom:20px;">${metrics}</div>` : ''}
          ${evidences ? `<div><div class="section-label">Evidencias</div><div class="evidence-grid">${evidences}</div></div>` : ''}
          ${bestContent ? `<div class="divider"></div><div class="section-label">${isSocial ? 'Mejores contenidos' : 'Mejores anuncios'}</div><div class="best-content-grid">${bestContent}</div>` : ''}
          ${c.observations ? `<div class="divider"></div><div class="section-label">Observaciones</div><div class="observation-box">${esc(c.observations)}</div>` : ''}
        </div>
      </div>`;
  },

  toggleCampaignCard(id) {
    document.getElementById(`cc-${id}`)?.classList.toggle('expanded');
  },

  renderComparisonTab(client) {
    const allItems = [
      ...(client.campaigns || []).map(c => ({ ...c, _type: 'campaign' })),
      ...(client.socialChannels || []).map(c => ({ ...c, _type: 'social' }))
    ];

    if (allItems.length === 0) {
      return `<div class="section-content"><div class="empty-state"><div class="empty-icon">📈</div><h3>Sin datos</h3><p>Agrega campañas o canales para ver comparativas.</p></div></div>`;
    }

    const allMetricNames = [...new Set(allItems.flatMap(i => (i.metrics || []).map(m => m.name)))];

    const itemChips = allItems.map((c, i) => `<button class="chip ${i < 5 ? 'active' : ''}" data-id="${esc(c.id)}" onclick="App.toggleCompChip(this)">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('');
    const metricChips = allMetricNames.map((m, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-metric="${esc(m)}" onclick="App.toggleCompMetricChip(this)">${esc(m)}</button>`).join('');

    return `<div class="section-content" id="comparison-root">
      <div class="section-header"><h2>Comparativas</h2></div>
      <div class="comparison-controls">
        <div>
          <div class="section-label" style="margin-bottom:8px;">Campañas / Canales</div>
          <div class="chip-group" id="comp-items">${itemChips}</div>
        </div>
        <div style="margin-top:12px;">
          <div class="section-label" style="margin-bottom:8px;">Métrica</div>
          <div class="chip-group" id="comp-metrics">${metricChips}</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
        <button class="chip active" data-charttype="bar" onclick="App.setChartType('bar',this)">📊 Barras</button>
        <button class="chip" data-charttype="line" onclick="App.setChartType('line',this)">📈 Líneas</button>
        <button class="chip" data-charttype="table" onclick="App.setChartType('table',this)">📋 Tabla</button>
      </div>
      <div id="comp-chart-area">
        <div class="chart-container"><canvas id="comp-chart"></canvas></div>
      </div>
      <div id="comp-table-area" style="display:none;">
        <div class="data-table-wrapper" id="comp-table-content"></div>
      </div>
      <input type="hidden" id="comp-chart-type" value="bar">
    </div>`;
  },

  _compChartType: 'bar',
  setChartType(type, btn) {
    this._compChartType = type;
    document.querySelectorAll('[data-charttype]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const chartArea = document.getElementById('comp-chart-area');
    const tableArea = document.getElementById('comp-table-area');
    if (type === 'table') {
      if (chartArea) chartArea.style.display = 'none';
      if (tableArea) tableArea.style.display = 'block';
      this.renderCompTable();
    } else {
      if (chartArea) chartArea.style.display = 'block';
      if (tableArea) tableArea.style.display = 'none';
      this.initComparisonCharts(DB.getClient(this._currentSlug));
    }
  },

  toggleCompChip(btn) {
    btn.classList.toggle('active');
    this.initComparisonCharts(DB.getClient(this._currentSlug));
  },

  toggleCompMetricChip(btn) {
    document.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    this.initComparisonCharts(DB.getClient(this._currentSlug));
  },

  initComparisonCharts(client) {
    const activeItems = [...document.querySelectorAll('#comp-items .chip.active')].map(b => b.dataset.id);
    const activeMetric = document.querySelector('#comp-metrics .chip.active')?.dataset?.metric;
    if (!activeMetric || activeItems.length === 0) return;

    const allItems = [
      ...(client.campaigns || []).map(c => ({ ...c, _type: 'campaign' })),
      ...(client.socialChannels || []).map(c => ({ ...c, _type: 'social' }))
    ];

    const selected = allItems.filter(i => activeItems.includes(i.id));
    const labels = selected.map(i => i.name);
    const values = selected.map(i => {
      const m = (i.metrics || []).find(m => m.name === activeMetric);
      return m ? parseFloat(m.value) || 0 : 0;
    });

    const type = this._compChartType === 'table' ? 'bar' : this._compChartType;

    if (this._compChartType !== 'table') {
      Charts.render('comp-chart', type, labels, [{
        label: activeMetric,
        data: values,
        backgroundColor: type === 'line' ? 'rgba(0,0,255,0.08)' : CHART_COLORS.map(c => c + 'cc'),
        borderColor: type === 'line' ? '#0000ff' : CHART_COLORS,
        borderWidth: 2,
        fill: type === 'line',
        tension: 0.4,
        borderRadius: type === 'bar' ? 6 : 0,
        pointBackgroundColor: '#0000ff',
      }]);
    } else {
      this.renderCompTable();
    }
  },

  renderCompTable() {
    const client = DB.getClient(this._currentSlug);
    const activeItems = [...document.querySelectorAll('#comp-items .chip.active')].map(b => b.dataset.id);
    const allItems = [
      ...(client.campaigns || []).map(c => ({ ...c, _type: 'campaign' })),
      ...(client.socialChannels || []).map(c => ({ ...c, _type: 'social' }))
    ];
    const selected = allItems.filter(i => activeItems.includes(i.id));
    const allMetricNames = [...new Set(selected.flatMap(i => (i.metrics || []).map(m => m.name)))];

    const tableEl = document.getElementById('comp-table-content');
    if (!tableEl) return;

    tableEl.innerHTML = `<table class="data-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Tipo</th>
          ${allMetricNames.map(m => `<th>${esc(m)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${selected.map(i => `<tr>
          <td>${esc(i.icon || '')} ${esc(i.name)}</td>
          <td>${i._type === 'campaign' ? 'Campaña' : 'Red Social'}</td>
          ${allMetricNames.map(mn => {
            const m = (i.metrics || []).find(m => m.name === mn);
            return `<td>${m ? fmtNum(m.value) + (m.unit ? ' ' + esc(m.unit) : '') : '—'}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;
  },

  // ---- EDITOR LOGIN ----
  renderEditorLogin(slug, client) {
    document.getElementById('app').innerHTML = `
      <div class="login-screen">
        <div class="login-card">
          <div class="logo-big">✏️</div>
          <h2>Editor — ${esc(client.name)}</h2>
          <p>Ingresa la contraseña de administrador para editar este reporte</p>
          <div class="login-error" id="editor-login-error">Contraseña incorrecta</div>
          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" id="editor-pass-input" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="App.tryEditorLogin('${esc(slug)}')">
            Acceder al editor
          </button>
          <div style="margin-top:16px;">
            <button class="btn btn-ghost btn-sm" style="width:100%;" onclick="Router.navigate('/client/${esc(slug)}')">← Ver reporte del cliente</button>
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      const inp = document.getElementById('editor-pass-input');
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') App.tryEditorLogin(slug); });
    }, 50);
  },

  tryEditorLogin(slug) {
    const val = document.getElementById('editor-pass-input')?.value;
    if (val === ADMIN_PASS) {
      Auth.unlockAdmin();
      this.renderEditor(slug, DB.getClient(slug));
    } else {
      document.getElementById('editor-login-error')?.classList.add('show');
    }
  },

  // ---- EDITOR ----
  _editorSection: 'settings',
  _editorItemId: null,
  _editorItemType: null,

  renderEditor(slug, client) {
    this._currentSlug = slug;

    document.getElementById('app').innerHTML = `
      <div class="accent-bar"></div>
      <header class="app-header">
        <div class="logo"><span class="logo-badge">✏️</span> Editor — ${esc(client.name)}</div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="CloudSync.manualSave()" style="gap:6px;">💾 Guardar</button>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/client/${esc(slug)}')">👁 Ver reporte</button>
          <button class="theme-toggle" onclick="App.toggleTheme()">
            <span>${document.body.classList.contains('dark') ? '☀️' : '🌙'}</span>
            <span>${document.body.classList.contains('dark') ? 'Claro' : 'Oscuro'}</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/admin')">← Clientes</button>
        </div>
      </header>
      <div class="editor-layout">
        <aside class="editor-sidebar" id="editor-sidebar"></aside>
        <main class="editor-main" id="editor-main"></main>
      </div>`;

    this.renderEditorSidebar(client);
    this.renderEditorSection(this._editorSection);
  },

  renderEditorSidebar(client) {
    const sidebar = document.getElementById('editor-sidebar');
    if (!sidebar) return;
    const campaigns = client.campaigns || [];
    const socials = client.socialChannels || [];

    sidebar.innerHTML = `
      <div class="sidebar-section">
        <div class="sidebar-section-title">General</div>
        <div class="sidebar-item ${this._editorSection === 'settings' ? 'active' : ''}" onclick="App.switchEditorSection('settings')">⚙️ Configuración</div>
        <div class="sidebar-item ${this._editorSection === 'preloaded' ? 'active' : ''}" onclick="App.switchEditorSection('preloaded')">📋 Métricas precargadas</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          Campañas
          <button class="collapse-btn" onclick="App.addCampaign()">+ Agregar</button>
        </div>
        ${campaigns.map(c => `
          <div class="sidebar-item ${this._editorSection === 'campaign' && this._editorItemId === c.id ? 'active' : ''}" onclick="App.switchEditorSection('campaign', '${esc(c.id)}')">
            📊 ${esc(c.name)}
            <span class="item-actions">
              <button class="btn-icon" style="width:22px;height:22px;font-size:0.7rem;background:rgba(0,221,255,0.15);" onclick="event.stopPropagation(); App.duplicateCampaign('${esc(c.id)}')">⧉</button>
              <button class="btn-icon" style="width:22px;height:22px;font-size:0.7rem;background:rgba(255,69,96,0.15);color:var(--danger);" onclick="event.stopPropagation(); App.deleteCampaignItem('${esc(c.id)}', 'campaign')">✕</button>
            </span>
          </div>`).join('')}
        ${campaigns.length === 0 ? '<div class="sidebar-item" style="opacity:0.5;font-style:italic;cursor:default;">Sin campañas</div>' : ''}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-section-title">
          Redes Sociales
          <button class="collapse-btn" onclick="App.addSocialChannel()">+ Agregar</button>
        </div>
        ${socials.map(c => `
          <div class="sidebar-item ${this._editorSection === 'social' && this._editorItemId === c.id ? 'active' : ''}" onclick="App.switchEditorSection('social', '${esc(c.id)}')">
            ${esc(c.icon || '📱')} ${esc(c.name)}
            <span class="item-actions">
              <button class="btn-icon" style="width:22px;height:22px;font-size:0.7rem;background:rgba(0,221,255,0.15);" onclick="event.stopPropagation(); App.duplicateCampaign('${esc(c.id)}', true)">⧉</button>
              <button class="btn-icon" style="width:22px;height:22px;font-size:0.7rem;background:rgba(255,69,96,0.15);color:var(--danger);" onclick="event.stopPropagation(); App.deleteCampaignItem('${esc(c.id)}', 'social')">✕</button>
            </span>
          </div>`).join('')}
        ${socials.length === 0 ? '<div class="sidebar-item" style="opacity:0.5;font-style:italic;cursor:default;">Sin canales</div>' : ''}
      </div>`;
  },

  switchEditorSection(section, itemId = null) {
    this._editorSection = section;
    this._editorItemId = itemId;
    const client = DB.getClient(this._currentSlug);
    this.renderEditorSidebar(client);
    this.renderEditorSection(section, itemId);
  },

  renderEditorSection(section, itemId = null) {
    const client = DB.getClient(this._currentSlug);
    const main = document.getElementById('editor-main');
    if (!main) return;

    if (section === 'settings') {
      main.innerHTML = this.renderSettingsEditor(client);
    } else if (section === 'preloaded') {
      main.innerHTML = this.renderPreloadedMetricsEditor(client);
    } else if (section === 'campaign') {
      const item = client.campaigns.find(c => c.id === itemId);
      if (item) main.innerHTML = this.renderCampaignEditor(item, client, false);
    } else if (section === 'social') {
      const item = client.socialChannels.find(c => c.id === itemId);
      if (item) main.innerHTML = this.renderCampaignEditor(item, client, true);
    }
  },

  renderSettingsEditor(client) {
    return `<div>
      <div class="editor-card">
        <div class="editor-card-header"><h3>⚙️ Configuración del reporte</h3></div>
        <div class="form-row">
          <div class="form-group"><label>Nombre del cliente</label>
            <input type="text" id="s-name" value="${esc(client.name)}" oninput="App.autoSaveSettings()">
          </div>
          <div class="form-group"><label>Contraseña del cliente</label>
            <input type="text" id="s-pass" value="${esc(client.password)}" oninput="App.autoSaveSettings()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Título del reporte</label>
            <input type="text" id="s-title" value="${esc(client.reportTitle || '')}" placeholder="Reporte de Resultados" oninput="App.autoSaveSettings()">
          </div>
          <div class="form-group"><label>Subtítulo</label>
            <input type="text" id="s-subtitle" value="${esc(client.reportSubtitle || '')}" placeholder="Campañas Digitales" oninput="App.autoSaveSettings()">
          </div>
        </div>
        <div class="form-group"><label>Logo (URL)</label>
          <input type="text" id="s-logo" value="${esc(client.logo || '')}" placeholder="https://..." oninput="App.autoSaveSettings()">
        </div>
        <div class="form-row">
          <div class="form-group"><label>Fecha inicio de vista</label>
            <input type="date" id="s-vstart" value="${esc(client.viewStart || '')}" oninput="App.autoSaveSettings()">
          </div>
          <div class="form-group"><label>Fecha fin de vista</label>
            <input type="date" id="s-vend" value="${esc(client.viewEnd || '')}" oninput="App.autoSaveSettings()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tema del reporte</label>
            <select id="s-theme" onchange="App.autoSaveSettings()">
              <option value="dark" ${client.theme === 'dark' ? 'selected' : ''}>Oscuro</option>
              <option value="light" ${client.theme === 'light' ? 'selected' : ''}>Claro</option>
            </select>
          </div>
        </div>
        <div style="margin-top:8px; color:var(--text-muted); font-size:0.8rem;">💾 Los cambios se guardan automáticamente</div>
      </div>
    </div>`;
  },

  autoSaveSettings() {
    const client = DB.getClient(this._currentSlug);
    client.name = document.getElementById('s-name')?.value?.trim() || client.name;
    client.password = document.getElementById('s-pass')?.value?.trim() || client.password;
    client.reportTitle = document.getElementById('s-title')?.value?.trim() || '';
    client.reportSubtitle = document.getElementById('s-subtitle')?.value?.trim() || '';
    client.logo = document.getElementById('s-logo')?.value?.trim() || '';
    client.viewStart = document.getElementById('s-vstart')?.value || '';
    client.viewEnd = document.getElementById('s-vend')?.value || '';
    client.theme = document.getElementById('s-theme')?.value || 'dark';
    DB.saveClient(client);
  },

  renderPreloadedMetricsEditor(client) {
    const pms = client.preloadedMetrics || [];
    const globalMs = DB.getGlobalMetrics();
    return `<div>
      <div class="editor-card">
        <div class="editor-card-header">
          <h3>📋 Métricas precargadas de este cliente</h3>
          <button class="btn btn-sm btn-primary" onclick="App.addPreloadedMetric()">+ Agregar</button>
        </div>
        <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">
          Estas métricas aparecerán como opciones rápidas al agregar métricas a campañas y canales.
        </p>
        <div id="preloaded-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">
          ${pms.map(m => `
            <span class="template-chip">
              ${esc(m.name)} ${m.unit ? `(${esc(m.unit)})` : ''}
              <span class="remove-chip" onclick="App.removePreloadedMetric('${esc(m.id)}')">✕</span>
            </span>`).join('')}
          ${pms.length === 0 ? '<span style="color:var(--text-muted);font-size:0.85rem;">Sin métricas precargadas</span>' : ''}
        </div>
        <div id="add-preloaded-form" style="display:none; background:var(--surface2); border-radius:var(--radius-sm); padding:16px; margin-bottom:12px;">
          <div class="form-row">
            <div class="form-group"><label>Nombre de la métrica</label>
              <input type="text" id="pm-name" placeholder="Ej: Impresiones">
            </div>
            <div class="form-group"><label>Unidad</label>
              <input type="text" id="pm-unit" placeholder="Ej: %, USD">
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-primary" onclick="App.savePreloadedMetric()">Guardar</button>
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('add-preloaded-form').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>
      <div class="editor-card">
        <div class="editor-card-header">
          <h3>🌐 Métricas globales (todos los clientes)</h3>
          <button class="btn btn-sm btn-ghost" onclick="App.showGlobalMetricsModal()">Administrar</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${globalMs.map(m => `
            <span class="template-chip" style="background:rgba(22,255,195,0.1);border-color:rgba(22,255,195,0.3);color:var(--secondary2);">
              ${esc(m.name)} ${m.unit ? `(${esc(m.unit)})` : ''}
            </span>`).join('')}
          ${globalMs.length === 0 ? '<span style="color:var(--text-muted);font-size:0.85rem;">Sin métricas globales</span>' : ''}
        </div>
      </div>
    </div>`;
  },

  addPreloadedMetric() {
    document.getElementById('add-preloaded-form').style.display = 'block';
    document.getElementById('pm-name')?.focus();
  },

  savePreloadedMetric() {
    const name = document.getElementById('pm-name')?.value.trim();
    const unit = document.getElementById('pm-unit')?.value.trim();
    if (!name) { Toast.show('Ingresa un nombre', 'error'); return; }
    const client = DB.getClient(this._currentSlug);
    if (!client.preloadedMetrics) client.preloadedMetrics = [];
    client.preloadedMetrics.push({ id: uid(), name, unit });
    DB.saveClient(client);
    Toast.show('Métrica guardada');
    this.renderEditorSection('preloaded');
  },

  removePreloadedMetric(id) {
    const client = DB.getClient(this._currentSlug);
    client.preloadedMetrics = (client.preloadedMetrics || []).filter(m => m.id !== id);
    DB.saveClient(client);
    this.renderEditorSection('preloaded');
  },

  showGlobalMetricsModal() {
    const globalMs = DB.getGlobalMetrics();
    const modal = createModal('Métricas globales', `
      <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">
        Estas métricas están disponibles para todos los clientes como opciones rápidas.
      </p>
      <div id="global-metrics-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
        ${globalMs.map(m => `
          <span class="template-chip" style="background:rgba(22,255,195,0.1);border-color:rgba(22,255,195,0.3);color:var(--secondary2);">
            ${esc(m.name)} ${m.unit ? `(${esc(m.unit)})` : ''}
            <span class="remove-chip" onclick="App.removeGlobalMetric('${esc(m.id)}')">✕</span>
          </span>`).join('')}
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px;">
        <div class="form-row" style="margin-bottom:10px;">
          <div class="form-group" style="margin:0;"><label>Nombre</label><input type="text" id="gm-name" placeholder="Impresiones"></div>
          <div class="form-group" style="margin:0;"><label>Unidad</label><input type="text" id="gm-unit" placeholder="%"></div>
        </div>
        <button class="btn btn-sm btn-primary" onclick="App.addGlobalMetric()">+ Agregar</button>
      </div>
    `, null, { hideConfirm: true, closeLabel: 'Cerrar' });
    document.getElementById('app').appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
  },

  addGlobalMetric() {
    const name = document.getElementById('gm-name')?.value.trim();
    const unit = document.getElementById('gm-unit')?.value.trim();
    if (!name) { Toast.show('Ingresa un nombre', 'error'); return; }
    const ms = DB.getGlobalMetrics();
    ms.push({ id: uid(), name, unit });
    DB.saveGlobalMetrics(ms);
    document.getElementById('gm-name').value = '';
    document.getElementById('gm-unit').value = '';
    // refresh list
    const list = document.getElementById('global-metrics-list');
    if (list) {
      list.innerHTML = ms.map(m => `
        <span class="template-chip" style="background:rgba(22,255,195,0.1);border-color:rgba(22,255,195,0.3);color:var(--secondary2);">
          ${esc(m.name)} ${m.unit ? `(${esc(m.unit)})` : ''}
          <span class="remove-chip" onclick="App.removeGlobalMetric('${esc(m.id)}')">✕</span>
        </span>`).join('');
    }
    Toast.show('Métrica global agregada');
  },

  removeGlobalMetric(id) {
    const ms = DB.getGlobalMetrics().filter(m => m.id !== id);
    DB.saveGlobalMetrics(ms);
    const list = document.getElementById('global-metrics-list');
    if (list) {
      list.innerHTML = ms.map(m => `
        <span class="template-chip" style="background:rgba(22,255,195,0.1);border-color:rgba(22,255,195,0.3);color:var(--secondary2);">
          ${esc(m.name)} ${m.unit ? `(${esc(m.unit)})` : ''}
          <span class="remove-chip" onclick="App.removeGlobalMetric('${esc(m.id)}')">✕</span>
        </span>`).join('');
    }
  },

  // ---- CAMPAIGN EDITOR ----
  addCampaign() {
    const client = DB.getClient(this._currentSlug);
    const c = newCampaign();
    client.campaigns.push(c);
    DB.saveClient(client);
    this.switchEditorSection('campaign', c.id);
    Toast.show('Campaña creada');
  },

  addSocialChannel() {
    const client = DB.getClient(this._currentSlug);
    const c = newSocialChannel();
    client.socialChannels.push(c);
    DB.saveClient(client);
    this.switchEditorSection('social', c.id);
    Toast.show('Canal creado');
  },

  duplicateCampaign(id, isSocial = false) {
    const client = DB.getClient(this._currentSlug);
    const arr = isSocial ? client.socialChannels : client.campaigns;
    const orig = arr.find(c => c.id === id);
    if (!orig) return;
    const copy = JSON.parse(JSON.stringify(orig));
    copy.id = uid();
    copy.name = copy.name + ' (copia)';
    // new ids for sub-items
    copy.metrics = copy.metrics.map(m => ({ ...m, id: uid() }));
    copy.evidences = copy.evidences.map(e => ({ ...e, id: uid() }));
    copy.bestContent = copy.bestContent.map(bc => ({ ...bc, id: uid(), metrics: bc.metrics.map(m => ({ ...m, id: uid() })) }));
    arr.push(copy);
    if (isSocial) client.socialChannels = arr; else client.campaigns = arr;
    DB.saveClient(client);
    this.switchEditorSection(isSocial ? 'social' : 'campaign', copy.id);
    Toast.show('Duplicado con éxito');
  },

  deleteCampaignItem(id, type) {
    if (!confirm('¿Eliminar este elemento?')) return;
    const client = DB.getClient(this._currentSlug);
    if (type === 'campaign') client.campaigns = client.campaigns.filter(c => c.id !== id);
    else client.socialChannels = client.socialChannels.filter(c => c.id !== id);
    DB.saveClient(client);
    this._editorSection = 'settings';
    this._editorItemId = null;
    this.renderEditorSidebar(client);
    this.renderEditorSection('settings');
    Toast.show('Eliminado', 'info');
  },

  renderCampaignEditor(item, client, isSocial) {
    const preloaded = [
      ...(client.preloadedMetrics || []),
      ...DB.getGlobalMetrics()
    ];
    const preloadedOptions = preloaded.map(m => `<option value="${esc(m.name)}|${esc(m.unit || '')}">${esc(m.name)}${m.unit ? ' (' + esc(m.unit) + ')' : ''}</option>`).join('');

    const metricsHtml = (item.metrics || []).map(m => this.renderMetricRow(m)).join('');
    const evidencesHtml = (item.evidences || []).map(e => this.renderEvidenceRow(e)).join('');
    const bestContentHtml = (item.bestContent || []).slice(0, 3).map(bc => this.renderContentEditor(bc)).join('');

    return `<div>
      <div class="editor-card">
        <div class="editor-card-header">
          <h3>${isSocial ? '📱' : '📊'} ${esc(item.name)}</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-ghost" onclick="CSVImporter.openForItem('${esc(item.id)}', ${isSocial})" style="border-color:var(--secondary2);color:var(--secondary2);">📂 Importar CSV</button>
            <button class="btn btn-sm btn-ghost" onclick="App.duplicateCampaign('${esc(item.id)}', ${isSocial})">⧉ Duplicar</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteCampaignItem('${esc(item.id)}', '${isSocial ? 'social' : 'campaign'}')">🗑 Eliminar</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>${isSocial ? 'Nombre del canal' : 'Nombre de la campaña'}</label>
            <input type="text" id="ci-name" value="${esc(item.name)}" oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})">
          </div>
          ${isSocial ? `
            <div class="form-group"><label>Icono (emoji)</label>
              <input type="text" id="ci-icon" value="${esc(item.icon || '📱')}" oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})" placeholder="📱">
            </div>` : `
            <div class="form-group"><label>Canal / Plataforma</label>
              <input type="text" id="ci-channel" value="${esc(item.channel || '')}" list="channel-list" oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})" placeholder="Google Ads, Meta, etc.">
              <datalist id="channel-list">
                <option>Google Ads</option><option>Meta Ads</option><option>TikTok Ads</option>
                <option>LinkedIn Ads</option><option>YouTube Ads</option><option>Programmatic</option>
              </datalist>
            </div>`}
        </div>
        <div class="form-row">
          <div class="form-group"><label>Fecha de inicio</label>
            <input type="date" id="ci-start" value="${esc(item.startDate || '')}" oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})">
          </div>
          <div class="form-group"><label>Fecha de fin</label>
            <input type="date" id="ci-end" value="${esc(item.endDate || '')}" oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})">
          </div>
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-header">
          <h3>📊 Métricas</h3>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            ${preloaded.length > 0 ? `<select id="preloaded-select" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 8px;color:var(--text);font-size:0.8rem;">
              <option value="">Métricas precargadas...</option>
              ${preloadedOptions}
            </select>
            <button class="btn btn-sm btn-ghost" onclick="App.addPreloadedToItem('${esc(item.id)}', ${isSocial})">+ Usar</button>` : ''}
            <button class="btn btn-sm btn-primary" onclick="App.addMetricToItem('${esc(item.id)}', ${isSocial})">+ Agregar</button>
          </div>
        </div>
        <div class="metrics-editor" id="metrics-editor-${esc(item.id)}">
          ${metricsHtml}
          ${!metricsHtml ? '<div style="color:var(--text-muted);font-size:0.85rem;">Sin métricas. Agrega una.</div>' : ''}
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-header">
          <h3>🖼 Evidencias</h3>
          <button class="btn btn-sm btn-primary" onclick="App.addEvidenceToItem('${esc(item.id)}', ${isSocial})">+ Agregar</button>
        </div>
        <div class="evidence-editor" id="evidence-editor-${esc(item.id)}">
          ${evidencesHtml}
          ${!evidencesHtml ? '<div style="color:var(--text-muted);font-size:0.85rem;">Sin evidencias.</div>' : ''}
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-header">
          <h3>⭐ ${isSocial ? 'Mejores contenidos' : 'Mejores anuncios'} (máx. 3)</h3>
          ${(item.bestContent || []).length < 3 ? `<button class="btn btn-sm btn-primary" onclick="App.addContentToItem('${esc(item.id)}', ${isSocial})">+ Agregar</button>` : ''}
        </div>
        <div class="content-editor-grid" id="content-editor-${esc(item.id)}">
          ${bestContentHtml}
          ${!bestContentHtml ? '<div style="color:var(--text-muted);font-size:0.85rem);">Sin contenidos.</div>' : ''}
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-header"><h3>💬 Observaciones / Comentarios</h3></div>
        <div class="form-group" style="margin:0;">
          <textarea id="ci-obs" rows="4" placeholder="Escribe observaciones o comentarios sobre esta campaña..." oninput="App.autoSaveCampaign('${esc(item.id)}', ${isSocial})">${esc(item.observations || '')}</textarea>
        </div>
      </div>
    </div>`;
  },

  renderMetricRow(m) {
    return `<div class="metric-row" id="mr-${esc(m.id)}">
      <input type="text" value="${esc(m.name)}" placeholder="Nombre" onchange="App.updateMetricField('${esc(m.id)}', 'name', this.value)">
      <input type="text" value="${esc(m.value)}" placeholder="Valor" onchange="App.updateMetricField('${esc(m.id)}', 'value', this.value)">
      <input type="text" value="${esc(m.unit)}" placeholder="Unidad" onchange="App.updateMetricField('${esc(m.id)}', 'unit', this.value)">
      <button class="btn-icon-sm" onclick="App.removeMetricFromItem('${esc(m.id)}')">✕</button>
    </div>`;
  },

  renderEvidenceRow(e) {
    return `<div class="evidence-row" id="er-${esc(e.id)}">
      <select onchange="App.updateEvidenceField('${esc(e.id)}', 'type', this.value)">
        <option value="image" ${e.type === 'image' ? 'selected' : ''}>Imagen</option>
        <option value="link" ${e.type === 'link' ? 'selected' : ''}>Link</option>
      </select>
      <input type="text" value="${esc(e.src)}" placeholder="URL de imagen o link Drive" onchange="App.updateEvidenceField('${esc(e.id)}', 'src', this.value)">
      <input type="text" value="${esc(e.name)}" placeholder="Nombre" onchange="App.updateEvidenceField('${esc(e.id)}', 'name', this.value)" style="min-width:100px;">
      <button class="btn-icon-sm" onclick="App.removeEvidenceFromItem('${esc(e.id)}')">✕</button>
    </div>`;
  },

  renderContentEditor(bc) {
    const metricsHtml = (bc.metrics || []).map(m => `
      <div class="metric-row" id="mr-${esc(m.id)}" style="grid-template-columns:1fr 80px 28px;">
        <input type="text" value="${esc(m.name)}" placeholder="Métrica" onchange="App.updateContentMetricField('${esc(bc.id)}', '${esc(m.id)}', 'name', this.value)" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.78rem;width:100%;outline:none;">
        <input type="text" value="${esc(m.value)}" placeholder="Valor" onchange="App.updateContentMetricField('${esc(bc.id)}', '${esc(m.id)}', 'value', this.value)" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.78rem;width:100%;outline:none;">
        <button class="btn-icon-sm" style="width:24px;height:24px;" onclick="App.removeContentMetric('${esc(bc.id)}', '${esc(m.id)}')">✕</button>
      </div>`).join('');

    return `<div class="content-editor-card" id="bce-${esc(bc.id)}">
      <div class="form-group">
        <label>Imagen (URL o base64)</label>
        <input type="text" value="${esc(bc.image || '')}" placeholder="https://..." onchange="App.updateContentField('${esc(bc.id)}', 'image', this.value)" style="font-size:0.82rem;">
        ${bc.image ? `<img src="${esc(bc.image)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-top:6px;cursor:pointer;" onclick="Lightbox.open('${esc(bc.image)}')">` : ''}
      </div>
      <div class="section-label" style="margin-bottom:6px;">Métricas del contenido</div>
      <div id="cm-${esc(bc.id)}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">${metricsHtml}</div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-ghost" style="font-size:0.75rem;padding:4px 8px;" onclick="App.addContentMetric('${esc(bc.id)}')">+ Métrica</button>
        <button class="btn btn-sm btn-danger" style="font-size:0.75rem;padding:4px 8px;" onclick="App.removeContent('${esc(bc.id)}')">Eliminar</button>
      </div>
    </div>`;
  },

  // helpers to find item
  _findItem(itemId) {
    const client = DB.getClient(this._currentSlug);
    let item = client.campaigns.find(c => c.id === itemId);
    let isSocial = false;
    if (!item) { item = client.socialChannels.find(c => c.id === itemId); isSocial = true; }
    return { client, item, isSocial };
  },

  autoSaveCampaign(itemId, isSocial) {
    const client = DB.getClient(this._currentSlug);
    const arr = isSocial ? client.socialChannels : client.campaigns;
    const item = arr.find(c => c.id === itemId);
    if (!item) return;
    item.name = document.getElementById('ci-name')?.value || item.name;
    if (isSocial) item.icon = document.getElementById('ci-icon')?.value || item.icon;
    else item.channel = document.getElementById('ci-channel')?.value || item.channel;
    item.startDate = document.getElementById('ci-start')?.value || '';
    item.endDate = document.getElementById('ci-end')?.value || '';
    item.observations = document.getElementById('ci-obs')?.value || '';
    DB.saveClient(client);
    this.renderEditorSidebar(client);
  },

  addMetricToItem(itemId, isSocial) {
    const { client, item } = this._findItem(itemId);
    if (!item) return;
    const m = newMetric();
    item.metrics.push(m);
    DB.saveClient(client);
    const container = document.getElementById(`metrics-editor-${itemId}`);
    if (container) {
      const placeholder = container.querySelector('div[style]');
      if (placeholder) placeholder.remove();
      container.insertAdjacentHTML('beforeend', this.renderMetricRow(m));
    }
  },

  addPreloadedToItem(itemId, isSocial) {
    const sel = document.getElementById('preloaded-select');
    if (!sel || !sel.value) return;
    const [name, unit] = sel.value.split('|');
    const { client, item } = this._findItem(itemId);
    if (!item) return;
    const m = newMetric(name, '', unit);
    item.metrics.push(m);
    DB.saveClient(client);
    const container = document.getElementById(`metrics-editor-${itemId}`);
    if (container) {
      const placeholder = container.querySelector('div[style]');
      if (placeholder) placeholder.remove();
      container.insertAdjacentHTML('beforeend', this.renderMetricRow(m));
    }
    sel.value = '';
  },

  updateMetricField(metricId, field, value) {
    const data = DB.load();
    const clients = Object.values(data.clients);
    for (const c of clients) {
      const found = [...(c.campaigns || []), ...(c.socialChannels || [])].flatMap(item => item.metrics || []).find(m => m.id === metricId);
      if (found) { found[field] = value; DB.save(data); return; }
    }
  },

  removeMetricFromItem(metricId) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const idx = (item.metrics || []).findIndex(m => m.id === metricId);
        if (idx !== -1) { item.metrics.splice(idx, 1); DB.save(data); break; }
      }
    }
    document.getElementById(`mr-${metricId}`)?.remove();
  },

  addEvidenceToItem(itemId, isSocial) {
    const { client, item } = this._findItem(itemId);
    if (!item) return;
    const e = newEvidence();
    item.evidences.push(e);
    DB.saveClient(client);
    const container = document.getElementById(`evidence-editor-${itemId}`);
    if (container) {
      const placeholder = container.querySelector('div[style]');
      if (placeholder) placeholder.remove();
      container.insertAdjacentHTML('beforeend', this.renderEvidenceRow(e));
    }
  },

  updateEvidenceField(evidenceId, field, value) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const found = (item.evidences || []).find(e => e.id === evidenceId);
        if (found) { found[field] = value; DB.save(data); return; }
      }
    }
  },

  removeEvidenceFromItem(evidenceId) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const idx = (item.evidences || []).findIndex(e => e.id === evidenceId);
        if (idx !== -1) { item.evidences.splice(idx, 1); DB.save(data); break; }
      }
    }
    document.getElementById(`er-${evidenceId}`)?.remove();
  },

  addContentToItem(itemId, isSocial) {
    const { client, item } = this._findItem(itemId);
    if (!item) return;
    if ((item.bestContent || []).length >= 3) { Toast.show('Máximo 3 contenidos', 'error'); return; }
    if (!item.bestContent) item.bestContent = [];
    const bc = newContent();
    item.bestContent.push(bc);
    DB.saveClient(client);
    const container = document.getElementById(`content-editor-${itemId}`);
    if (container) {
      const placeholder = container.querySelector('div[style]');
      if (placeholder) placeholder.remove();
      container.insertAdjacentHTML('beforeend', this.renderContentEditor(bc));
    }
  },

  removeContent(contentId) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const idx = (item.bestContent || []).findIndex(bc => bc.id === contentId);
        if (idx !== -1) { item.bestContent.splice(idx, 1); DB.save(data); break; }
      }
    }
    document.getElementById(`bce-${contentId}`)?.remove();
  },

  updateContentField(contentId, field, value) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const found = (item.bestContent || []).find(bc => bc.id === contentId);
        if (found) { found[field] = value; DB.save(data); return; }
      }
    }
  },

  addContentMetric(contentId) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const found = (item.bestContent || []).find(bc => bc.id === contentId);
        if (found) {
          if (!found.metrics) found.metrics = [];
          const m = newMetric();
          found.metrics.push(m);
          DB.save(data);
          const container = document.getElementById(`cm-${contentId}`);
          if (container) container.insertAdjacentHTML('beforeend', `
            <div class="metric-row" id="mr-${esc(m.id)}" style="grid-template-columns:1fr 80px 28px;">
              <input type="text" value="" placeholder="Métrica" onchange="App.updateContentMetricField('${esc(contentId)}', '${esc(m.id)}', 'name', this.value)" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.78rem;width:100%;outline:none;">
              <input type="text" value="" placeholder="Valor" onchange="App.updateContentMetricField('${esc(contentId)}', '${esc(m.id)}', 'value', this.value)" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.78rem;width:100%;outline:none;">
              <button class="btn-icon-sm" style="width:24px;height:24px;" onclick="App.removeContentMetric('${esc(contentId)}', '${esc(m.id)}')">✕</button>
            </div>`);
          return;
        }
      }
    }
  },

  updateContentMetricField(contentId, metricId, field, value) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const found = (item.bestContent || []).find(bc => bc.id === contentId);
        if (found) {
          const m = (found.metrics || []).find(m => m.id === metricId);
          if (m) { m[field] = value; DB.save(data); return; }
        }
      }
    }
  },

  removeContentMetric(contentId, metricId) {
    const data = DB.load();
    for (const c of Object.values(data.clients)) {
      for (const item of [...(c.campaigns || []), ...(c.socialChannels || [])]) {
        const found = (item.bestContent || []).find(bc => bc.id === contentId);
        if (found) {
          found.metrics = (found.metrics || []).filter(m => m.id !== metricId);
          DB.save(data);
          break;
        }
      }
    }
    document.getElementById(`mr-${metricId}`)?.remove();
  },

  // ---- THEME ----
  toggleTheme() {
    const isDark = document.body.classList.contains('dark');
    document.body.classList.toggle('dark', !isDark);
    document.body.classList.toggle('light', isDark);
    localStorage.setItem('onesun_theme', isDark ? 'light' : 'dark');
    // re-render theme toggle
    const icon = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon) icon.textContent = isDark ? '🌙' : '☀️';
    if (label) label.textContent = isDark ? 'Oscuro' : 'Claro';
    // destroy and re-render charts
    Object.keys(Charts.instances).forEach(id => Charts.destroy(id));
    if (this._currentTab === 'comparison') {
      this.initComparisonCharts(DB.getClient(this._currentSlug));
    }
  },

  // ---- INIT ----
  async init() {
    // restore theme
    const savedTheme = localStorage.getItem('onesun_theme') || 'dark';
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(savedTheme);

    // Load from cloud if token configured (admin devices)
    if (CloudSync.isConfigured()) {
      await CloudSync.loadFromCloud();
      CloudSync.startAutoSave();
    } else {
      // No token — try loading public data.json (client devices)
      const local = DB.load();
      const hasData = local.clients && Object.keys(local.clients).length > 0;
      if (!hasData) {
        try {
          const resp = await fetch('data.json?_=' + Date.now());
          if (resp.ok) {
            const data = await resp.json();
            if (data.clients && Object.keys(data.clients).length > 0) {
              DB.save(data);
            }
          }
        } catch (e) { console.warn('Could not load public data.json:', e); }
      }
    }

    Router.listen();
  }
};

// ===== MODAL HELPER =====
function createModal(title, bodyHtml, onConfirm, options = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${esc(title)}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">${options.closeLabel || 'Cancelar'}</button>
        ${!options.hideConfirm ? `<button class="btn btn-primary" id="modal-confirm-btn">Guardar</button>` : ''}
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  if (onConfirm) {
    setTimeout(() => {
      const btn = overlay.querySelector('#modal-confirm-btn');
      if (btn) btn.addEventListener('click', () => {
        const result = onConfirm();
        if (result !== false) overlay.remove();
      });
    }, 0);
  }
  return overlay;
}

// ===== BULK CSV CAMPAIGN IMPORTER =====
const BulkCSV = {
  _parsed: null,
  _step: 1,
  _targetSlug: null,

  open() {
    this._step = 1;
    this._parsed = null;
    this._targetSlug = null;
    this._renderModal();
  },

  _renderModal() {
    document.getElementById('bulk-csv-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'bulk-csv-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:800px;">
        <div class="modal-header">
          <h3>📂 Importar campañas desde CSV</h3>
          <button class="modal-close" onclick="document.getElementById('bulk-csv-overlay').remove()">&times;</button>
        </div>
        <div id="bulk-csv-body">${this._renderStep()}</div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('app').appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);
    if (this._step === 1) setTimeout(() => this._bindDropzone(), 50);
  },

  _renderStep() {
    if (this._step === 1) return this._renderStep1();
    if (this._step === 2) return this._renderStep2();
    if (this._step === 3) return this._renderStep3();
  },

  _renderStep1() {
    const clients = DB.getClients();
    const options = Object.values(clients).map(c =>
      `<option value="${esc(c.slug)}">${esc(c.name)}</option>`
    ).join('');

    return `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        <span style="background:var(--primary);color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">1</span>
        <span style="font-weight:600;">Cargar CSV</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">2 Revisar</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">3 Confirmar</span>
      </div>
      <div class="form-group" style="margin-bottom:16px;">
        <label>Cliente destino</label>
        <select id="bulk-csv-client" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;color:var(--text);font-size:0.85rem;width:100%;">
          <option value="">— Seleccionar cliente —</option>
          ${options}
        </select>
      </div>
      <div id="bulk-csv-dropzone" style="
        border: 2px dashed var(--border);
        border-radius: var(--radius);
        padding: 48px 24px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 16px;
      ">
        <div style="font-size:2.5rem;margin-bottom:12px;">📄</div>
        <div style="font-weight:700;margin-bottom:6px;">Arrastra tu CSV aquí</div>
        <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">o haz clic para seleccionar el archivo</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('bulk-csv-file').click()">Seleccionar archivo</button>
        <input type="file" id="bulk-csv-file" accept=".csv,.tsv,.txt" style="display:none;">
      </div>
      <div style="color:var(--text-muted);font-size:0.78rem;line-height:1.6;">
        <strong>Formato esperado:</strong> La primera columna debe ser <code>Nombre Campaña</code>, seguida opcionalmente de <code>Fecha Inicio</code> y <code>Fecha de término</code>. Las columnas restantes son métricas (cada columna = una métrica, cada fila = una campaña).
      </div>`;
  },

  _renderStep2() {
    const { campaigns, metricHeaders } = this._parsed;

    const rows = campaigns.map((c, i) => {
      const metricsPreview = metricHeaders.slice(0, 5).map(h => {
        const val = c.metrics.find(m => m.csvCol === h);
        return val ? `<span style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-size:0.75rem;">${esc(val.name)}: <strong>${val.displayValue}</strong></span>` : '';
      }).join(' ');
      const extra = metricHeaders.length > 5 ? `<span style="color:var(--text-muted);font-size:0.75rem;">+${metricHeaders.length - 5} más</span>` : '';

      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" checked data-bulk-idx="${i}" style="width:14px;height:14px;accent-color:var(--primary);">
              <strong>${esc(c.name)}</strong>
            </label>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:0.82rem;color:var(--text-muted);">${c.startDate ? fmtDate(c.startDate) : '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:0.82rem;color:var(--text-muted);">${c.endDate ? fmtDate(c.endDate) : '—'}</td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <div style="display:flex;gap:4px;flex-wrap:wrap;">${metricsPreview} ${extra}</div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        <span style="background:var(--surface2);color:var(--text-muted);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">1</span>
        <span style="opacity:0.4;">Archivo</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="background:var(--primary);color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">2</span>
        <span style="font-weight:600;">Revisar campañas</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">3 Confirmar</span>
      </div>
      <div style="background:rgba(0,221,255,0.08);border:1px solid rgba(0,221,255,0.25);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:0.82rem;">
        📊 <strong>${campaigns.length} campaña${campaigns.length !== 1 ? 's' : ''}</strong> detectada${campaigns.length !== 1 ? 's' : ''} con <strong>${metricHeaders.length}</strong> métricas cada una.
      </div>
      <div style="overflow-x:auto;margin-bottom:16px;max-height:400px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
          <thead>
            <tr style="background:var(--surface2);position:sticky;top:0;">
              <th style="padding:8px 10px;text-align:left;">Campaña</th>
              <th style="padding:8px 10px;text-align:left;">Inicio</th>
              <th style="padding:8px 10px;text-align:left;">Fin</th>
              <th style="padding:8px 10px;text-align:left;">Métricas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm" onclick="BulkCSV._step=1; BulkCSV._renderModal();">← Regresar</button>
        <button class="btn btn-primary" onclick="BulkCSV._doImport()">Importar ${campaigns.length} campañas →</button>
      </div>`;
  },

  _renderStep3() {
    return `
      <div style="text-align:center;padding:32px 0;">
        <div style="font-size:3.5rem;margin-bottom:16px;">✅</div>
        <h3 style="font-size:1.3rem;margin-bottom:8px;">¡Importación exitosa!</h3>
        <p style="color:var(--text-muted);margin-bottom:24px;">
          Se importaron <strong style="color:var(--secondary2);">${this._importedCount} campaña${this._importedCount !== 1 ? 's' : ''}</strong> al cliente.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-ghost" onclick="document.getElementById('bulk-csv-overlay').remove()">Cerrar</button>
          <button class="btn btn-primary" onclick="document.getElementById('bulk-csv-overlay').remove(); App.openClientEditor('${esc(this._targetSlug)}');">Ir al editor</button>
        </div>
      </div>`;
  },

  _bindDropzone() {
    const dz = document.getElementById('bulk-csv-dropzone');
    const input = document.getElementById('bulk-csv-file');
    if (!dz || !input) return;

    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'rgba(0,0,255,0.04)'; });
    dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = ''; });
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.borderColor = ''; dz.style.background = '';
      if (e.dataTransfer.files[0]) this._readFile(e.dataTransfer.files[0]);
    });
    dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') input.click(); });
    input.addEventListener('change', () => { if (input.files[0]) this._readFile(input.files[0]); });
  },

  _readFile(file) {
    const slug = document.getElementById('bulk-csv-client')?.value;
    if (!slug) { Toast.show('Selecciona un cliente primero', 'error'); return; }
    this._targetSlug = slug;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = this._parseCSV(e.target.result);
        if (!parsed.campaigns.length) { Toast.show('No se detectaron campañas válidas', 'error'); return; }
        this._parsed = parsed;
        this._step = 2;
        const body = document.getElementById('bulk-csv-body');
        if (body) body.innerHTML = this._renderStep2();
      } catch (err) {
        Toast.show('Error al leer el CSV', 'error');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  _parseCSV(text) {
    const { headers, rows } = CSVImporter.parse(text);
    if (!headers.length || !rows.length) return { campaigns: [], metricHeaders: [] };

    // Find special columns by normalized name
    const normalize = s => String(s).toLowerCase().trim().replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ');
    const nameAliases = ['nombre campaña', 'nombre de campaña', 'campaign name', 'campaña', 'nombre', 'campaign'];
    const startAliases = ['fecha inicio', 'fecha de inicio', 'start date', 'inicio', 'start'];
    const endAliases = ['fecha de término', 'fecha termino', 'fecha de termino', 'fecha fin', 'end date', 'fin', 'end', 'fecha de fin'];

    const findCol = (aliases) => headers.find(h => aliases.includes(normalize(h)));
    const nameCol = findCol(nameAliases) || headers[0]; // fallback to first column
    const startCol = findCol(startAliases);
    const endCol = findCol(endAliases);

    // Metric columns = everything that's not name/start/end
    const specialCols = new Set([nameCol, startCol, endCol].filter(Boolean));
    const metricHeaders = headers.filter(h => !specialCols.has(h));

    // Parse date: handle dd/mm/yy, dd/mm/yyyy, yyyy-mm-dd
    const parseDate = (val) => {
      if (!val) return '';
      const s = String(val).trim();
      // dd/mm/yy or dd/mm/yyyy
      const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (slashMatch) {
        let [, day, month, year] = slashMatch;
        if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // already ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      return '';
    };

    const campaigns = rows
      .filter(row => row[nameCol] && String(row[nameCol]).trim())
      .map(row => {
        const metrics = metricHeaders
          .filter(h => row[h] !== undefined && String(row[h]).trim() !== '')
          .map(h => {
            const raw = String(row[h]).trim();
            const cleaned = raw.replace(/[$,%\s]/g, '');
            const num = parseFloat(cleaned);
            const match = CSVImporter.matchColumn(h);
            const name = match ? match.name : h;
            const unit = match ? match.unit : (raw.includes('%') ? '%' : raw.startsWith('$') ? '$' : '');
            return {
              csvCol: h,
              name,
              value: isNaN(num) ? raw : num,
              displayValue: isNaN(num) ? raw : num.toLocaleString('es-MX'),
              unit
            };
          });
        return {
          name: String(row[nameCol]).trim(),
          startDate: parseDate(row[startCol]),
          endDate: parseDate(row[endCol]),
          metrics
        };
      });

    return { campaigns, metricHeaders };
  },

  _doImport() {
    const client = DB.getClient(this._targetSlug);
    if (!client) { Toast.show('Cliente no encontrado', 'error'); return; }

    // Get selected campaigns
    const checkboxes = document.querySelectorAll('[data-bulk-idx]');
    const selectedIdxs = new Set();
    checkboxes.forEach(cb => { if (cb.checked) selectedIdxs.add(parseInt(cb.dataset.bulkIdx)); });

    const toImport = this._parsed.campaigns.filter((_, i) => selectedIdxs.has(i));
    if (!toImport.length) { Toast.show('Selecciona al menos una campaña', 'error'); return; }

    for (const c of toImport) {
      const campaign = newCampaign();
      campaign.name = c.name;
      campaign.startDate = c.startDate;
      campaign.endDate = c.endDate;
      campaign.metrics = c.metrics.map(m => ({
        id: uid(),
        name: m.name,
        value: m.value,
        unit: m.unit
      }));
      client.campaigns.push(campaign);
    }

    DB.saveClient(client);
    this._importedCount = toImport.length;
    this._step = 3;
    const body = document.getElementById('bulk-csv-body');
    if (body) body.innerHTML = this._renderStep3();
    Toast.show(`${toImport.length} campaña${toImport.length !== 1 ? 's' : ''} importada${toImport.length !== 1 ? 's' : ''}`, 'success');
  }
};

// ===== CSV IMPORTER =====
const CSVImporter = {

  // Dictionary: normalized key → display name + default unit
  METRIC_DICT: {
    // English
    impressions:        { name: 'Impresiones',      unit: '' },
    impr:               { name: 'Impresiones',      unit: '' },
    clicks:             { name: 'Clics',             unit: '' },
    click:              { name: 'Clics',             unit: '' },
    ctr:                { name: 'CTR',               unit: '%' },
    'click-through rate': { name: 'CTR',             unit: '%' },
    cpc:                { name: 'CPC',               unit: '' },
    'cost per click':   { name: 'CPC',               unit: '' },
    cpm:                { name: 'CPM',               unit: '' },
    cost:               { name: 'Costo / Inversión', unit: '' },
    spend:              { name: 'Costo / Inversión', unit: '' },
    'amount spent':     { name: 'Costo / Inversión', unit: '' },
    budget:             { name: 'Presupuesto',       unit: '' },
    conversions:        { name: 'Conversiones',      unit: '' },
    conversion:         { name: 'Conversiones',      unit: '' },
    results:            { name: 'Resultados',        unit: '' },
    cpa:                { name: 'CPA',               unit: '' },
    'cost per result':  { name: 'CPA',               unit: '' },
    'cost per conversion': { name: 'CPA',            unit: '' },
    roas:               { name: 'ROAS',              unit: 'x' },
    'return on ad spend': { name: 'ROAS',            unit: 'x' },
    reach:              { name: 'Alcance',           unit: '' },
    frequency:          { name: 'Frecuencia',        unit: '' },
    views:              { name: 'Vistas / Reproducciones', unit: '' },
    'video views':      { name: 'Vistas / Reproducciones', unit: '' },
    'thruplay':         { name: 'ThruPlay',          unit: '' },
    likes:              { name: 'Likes',             unit: '' },
    reactions:          { name: 'Reacciones',        unit: '' },
    comments:           { name: 'Comentarios',       unit: '' },
    shares:             { name: 'Compartidos',       unit: '' },
    saves:              { name: 'Guardados',         unit: '' },
    followers:          { name: 'Seguidores nuevos', unit: '' },
    'new followers':    { name: 'Seguidores nuevos', unit: '' },
    engagement:         { name: 'Engagement',        unit: '' },
    'engagement rate':  { name: 'Tasa de Engagement', unit: '%' },
    revenue:            { name: 'Ingresos',          unit: '' },
    revenue:            { name: 'Ingresos',          unit: '' },
    'link clicks':      { name: 'Clics en enlace',  unit: '' },
    'landing page views': { name: 'Vistas de página', unit: '' },
    quality:            { name: 'Puntuación de calidad', unit: '' },
    'quality score':    { name: 'Puntuación de calidad', unit: '' },
    score:              { name: 'Puntuación',        unit: '' },
    // Spanish
    impresiones:        { name: 'Impresiones',      unit: '' },
    clics:              { name: 'Clics',             unit: '' },
    alcance:            { name: 'Alcance',           unit: '' },
    frecuencia:         { name: 'Frecuencia',        unit: '' },
    reproducciones:     { name: 'Vistas / Reproducciones', unit: '' },
    vistas:             { name: 'Vistas / Reproducciones', unit: '' },
    conversiones:       { name: 'Conversiones',      unit: '' },
    resultados:         { name: 'Resultados',        unit: '' },
    seguidores:         { name: 'Seguidores nuevos', unit: '' },
    compartidos:        { name: 'Compartidos',       unit: '' },
    guardados:          { name: 'Guardados',         unit: '' },
    comentarios:        { name: 'Comentarios',       unit: '' },
    ingresos:           { name: 'Ingresos',          unit: '' },
    presupuesto:        { name: 'Presupuesto',       unit: '' },
    costo:              { name: 'Costo / Inversión', unit: '' },
    inversion:          { name: 'Costo / Inversión', unit: '' },
    inversión:          { name: 'Costo / Inversión', unit: '' },
    'importe gastado':  { name: 'Costo / Inversión', unit: '' },
    interacciones:      { name: 'Interacciones',    unit: '' },
    reacciones:         { name: 'Reacciones',        unit: '' },
    'conversaciones iniciadas': { name: 'Conversaciones Iniciadas', unit: '' },
    'costo por conversación iniciada': { name: 'Costo por Conversación', unit: '' },
    'costo por conversacion iniciada': { name: 'Costo por Conversación', unit: '' },
    'costo por resultado': { name: 'CPA', unit: '' },
    'clics en enlace':  { name: 'Clics en enlace',  unit: '' },
    'messaging conversations started': { name: 'Conversaciones Iniciadas', unit: '' },
    'cost per messaging conversation started': { name: 'Costo por Conversación', unit: '' },
  },

  // Parse CSV text → array of row objects
  parse(text) {
    // Detect delimiter
    const delimiters = [',', ';', '\t', '|'];
    const firstLine = text.split('\n')[0];
    const delimiter = delimiters.reduce((best, d) => {
      const count = (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length;
      return count > (best.count || 0) ? { d, count } : best;
    }, { d: ',', count: 0 }).d;

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [], delimiter };

    // Helper to check if a parsed row is entirely empty
    const isEmptyRow = cells => cells.every(c => c.trim() === '');

    const parseRow = line => {
      const cells = [];
      let cur = '', inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === delimiter && !inQuote) { cells.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      cells.push(cur.trim());
      return cells;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1)
      .map(l => parseRow(l))
      .filter(cells => !isEmptyRow(cells))
      .map(cells => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
        return obj;
      });
    return { headers, rows, delimiter };
  },

  // Normalize a string for matching
  normalize(s) {
    return String(s).toLowerCase().trim()
      .replace(/[_\-\.]/g, ' ')
      .replace(/\s+/g, ' ');
  },

  // Find best match in dictionary
  matchColumn(header) {
    const norm = this.normalize(header);
    if (this.METRIC_DICT[norm]) return { ...this.METRIC_DICT[norm], confidence: 'high' };
    // partial match
    for (const [key, val] of Object.entries(this.METRIC_DICT)) {
      if (norm.includes(key) || key.includes(norm)) return { ...val, confidence: 'medium' };
    }
    return null;
  },

  // Detect if a column has numeric data
  isNumeric(rows, header) {
    const vals = rows.slice(0, 5).map(r => r[header]).filter(v => v !== undefined && v !== '');
    if (!vals.length) return false;
    return vals.filter(v => !isNaN(parseFloat(String(v).replace(/[$%,\s]/g, '')))).length / vals.length > 0.6;
  },

  // Clean a numeric string
  cleanNumber(s) {
    const cleaned = String(s).replace(/[$,%\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? s : n;
  },

  // Aggregate multiple rows: sum numerics, keep last for strings
  aggregate(rows, headers) {
    if (rows.length === 0) return {};
    if (rows.length === 1) return rows[0];
    const result = {};
    for (const h of headers) {
      const vals = rows.map(r => r[h]).filter(v => v !== undefined && v !== '');
      const nums = vals.map(v => parseFloat(String(v).replace(/[$%,\s]/g, ''))).filter(n => !isNaN(n));
      if (nums.length === vals.length && nums.length > 0) {
        // Detect if it's a rate/percentage (avg) vs a count (sum)
        const norm = this.normalize(h);
        const isRate = ['ctr','cpc','cpm','cpa','roas','rate','frecuencia','frequency','score','quality','tasa'].some(k => norm.includes(k));
        result[h] = isRate
          ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
          : nums.reduce((a, b) => a + b, 0);
      } else {
        result[h] = vals[vals.length - 1] ?? '';
      }
    }
    return result;
  },

  // Main entry: open modal for a campaign
  openForItem(itemId, isSocial) {
    this._itemId = itemId;
    this._isSocial = isSocial;
    this._step = 1;
    this._parsed = null;
    this._mapping = [];
    this._aggregated = null;
    this._renderModal();
  },

  _renderModal() {
    document.getElementById('csv-importer-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'csv-importer-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <div class="modal-header">
          <h3>📂 Importar datos desde CSV</h3>
          <button class="modal-close" onclick="document.getElementById('csv-importer-overlay').remove()">&times;</button>
        </div>
        <div id="csv-modal-body">${this._renderStep()}</div>
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('app').appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 10);

    if (this._step === 1) {
      this._bindDropzone();
    }
  },

  _renderStep() {
    if (this._step === 1) return this._renderStep1();
    if (this._step === 2) return this._renderStep2();
    if (this._step === 3) return this._renderStep3();
  },

  _renderStep1() {
    return `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        <span style="background:var(--primary);color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">1</span>
        <span style="font-weight:600;">Carga tu archivo CSV</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">2 Mapear columnas</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">3 Confirmar</span>
      </div>
      <div id="csv-dropzone" style="
        border: 2px dashed var(--border);
        border-radius: var(--radius);
        padding: 48px 24px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 16px;
      ">
        <div style="font-size:2.5rem;margin-bottom:12px;">📄</div>
        <div style="font-weight:700;margin-bottom:6px;">Arrastra tu CSV aquí</div>
        <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px;">o haz clic para seleccionar el archivo</div>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('csv-file-input').click()">Seleccionar archivo</button>
        <input type="file" id="csv-file-input" accept=".csv,.tsv,.txt" style="display:none;">
      </div>
      <div style="color:var(--text-muted);font-size:0.78rem;line-height:1.6;">
        <strong>Formatos soportados:</strong> CSV exportado de Google Ads, Meta Ads Manager, TikTok Ads, LinkedIn Campaign Manager, entre otros.<br>
        Los delimitadores soportados son: coma, punto y coma, tabulador o pipe.
      </div>`;
  },

  _renderStep2() {
    const { headers, rows } = this._parsed;
    const agg = this._aggregated;
    const rowCount = rows.length;

    // Build auto-mapping
    this._mapping = headers.map(h => {
      const isNum = this.isNumeric(rows, h);
      const match = this.matchColumn(h);
      return {
        csvCol: h,
        isNumeric: isNum,
        autoName: match ? match.name : (isNum ? h : null),
        autoUnit: match ? match.unit : '',
        confidence: match ? match.confidence : (isNum ? 'low' : 'skip'),
        include: !!(match || isNum),
        mappedName: match ? match.name : (isNum ? h : ''),
        mappedUnit: match ? match.unit : '',
        value: agg[h] ?? ''
      };
    });

    const previewRows = rows.slice(0, 3);

    const mappingRows = this._mapping.map((m, i) => {
      const confColor = m.confidence === 'high' ? 'var(--secondary2)' : m.confidence === 'medium' ? 'var(--accent)' : 'var(--text-muted)';
      const confLabel = m.confidence === 'high' ? '✓ Alta' : m.confidence === 'medium' ? '~ Media' : m.isNumeric ? '? Numérica' : '— Texto';
      const displayVal = this.cleanNumber(m.value);
      return `
        <tr id="csv-map-row-${i}" style="${!m.isNumeric && !m.autoName ? 'opacity:0.5;' : ''}">
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" ${m.include ? 'checked' : ''} onchange="CSVImporter._toggleMapping(${i}, this.checked)" style="width:14px;height:14px;accent-color:var(--primary);">
              <code style="font-size:0.78rem;background:var(--surface2);padding:2px 6px;border-radius:4px;">${esc(m.csvCol)}</code>
            </label>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <span style="font-size:0.75rem;color:${confColor};font-weight:700;">${confLabel}</span>
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <input type="text" value="${esc(m.mappedName)}" placeholder="Nombre de métrica"
              onchange="CSVImporter._updateMappingName(${i}, this.value)"
              style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.82rem;width:100%;outline:none;">
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);">
            <input type="text" value="${esc(m.mappedUnit)}" placeholder="%"
              onchange="CSVImporter._updateMappingUnit(${i}, this.value)"
              style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.82rem;width:60px;outline:none;">
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:700;color:var(--secondary1);">
            ${typeof displayVal === 'number' ? displayVal.toLocaleString('es-MX') : esc(String(displayVal))}
          </td>
        </tr>`;
    }).join('');

    const included = this._mapping.filter(m => m.include && m.mappedName).length;

    return `
      <div style="margin-bottom:16px; display:flex; gap:8px; align-items:center;">
        <span style="background:var(--surface2);color:var(--text-muted);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">1</span>
        <span style="opacity:0.4;">Archivo</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="background:var(--primary);color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">2</span>
        <span style="font-weight:600;">Mapear columnas</span>
        <span style="color:var(--text-muted);">→</span>
        <span style="opacity:0.4;">3 Confirmar</span>
      </div>
      <div style="background:rgba(0,221,255,0.08);border:1px solid rgba(0,221,255,0.25);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:0.82rem;">
        📊 <strong>${rowCount} fila${rowCount !== 1 ? 's' : ''}</strong> detectada${rowCount !== 1 ? 's' : ''}.
        ${rowCount > 1 ? 'Los valores numéricos se <strong>agregarán</strong> (sumas) y los promedios (CTR, CPC, etc.) se calcularán automáticamente.' : ''}
        &nbsp;·&nbsp; <strong>${headers.length}</strong> columnas
      </div>
      <div style="overflow-x:auto;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
          <thead>
            <tr style="background:var(--surface2);">
              <th style="padding:8px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Columna CSV</th>
              <th style="padding:8px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Detección</th>
              <th style="padding:8px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Nombre de métrica</th>
              <th style="padding:8px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Unidad</th>
              <th style="padding:8px 10px;text-align:left;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Valor</th>
            </tr>
          </thead>
          <tbody>${mappingRows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <div style="flex:1;font-size:0.82rem;color:var(--text-muted);">
          <strong style="color:var(--secondary2);">${included}</strong> métrica${included !== 1 ? 's' : ''} seleccionada${included !== 1 ? 's' : ''}
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">
            <span style="color:var(--text-muted);">Si ya hay métricas:</span>
            <select id="csv-import-mode" style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:0.8rem;">
              <option value="append">Agregar (mantener existentes)</option>
              <option value="replace">Reemplazar todo</option>
              <option value="update">Actualizar valores existentes</option>
            </select>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="CSVImporter._step=1; CSVImporter._renderModal();">← Regresar</button>
          <button class="btn btn-primary" onclick="CSVImporter._doImport()">Importar métricas →</button>
        </div>
      </div>`;
  },

  _renderStep3() {
    const count = this._importedCount || 0;
    return `
      <div style="text-align:center;padding:32px 0;">
        <div style="font-size:3.5rem;margin-bottom:16px;">✅</div>
        <h3 style="font-size:1.3rem;margin-bottom:8px;">¡Importación exitosa!</h3>
        <p style="color:var(--text-muted);margin-bottom:24px;">
          Se importaron <strong style="color:var(--secondary2);">${count} métrica${count !== 1 ? 's' : ''}</strong> a la campaña.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button class="btn btn-ghost" onclick="document.getElementById('csv-importer-overlay').remove()">Cerrar</button>
          <button class="btn btn-primary" onclick="document.getElementById('csv-importer-overlay').remove(); App.switchEditorSection(CSVImporter._isSocial ? 'social' : 'campaign', CSVImporter._itemId);">Ver métricas</button>
        </div>
      </div>`;
  },

  _bindDropzone() {
    setTimeout(() => {
      const dz = document.getElementById('csv-dropzone');
      const input = document.getElementById('csv-file-input');
      if (!dz || !input) return;

      dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--primary)'; dz.style.background = 'rgba(0,0,255,0.04)'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = ''; });
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.style.borderColor = ''; dz.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) this._readFile(file);
      });
      dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') input.click(); });
      input.addEventListener('change', () => { if (input.files[0]) this._readFile(input.files[0]); });
    }, 50);
  },

  _readFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = this.parse(e.target.result);
        if (!result.headers.length || !result.rows.length) {
          Toast.show('El archivo no tiene datos válidos', 'error'); return;
        }
        this._parsed = result;
        this._aggregated = this.aggregate(result.rows, result.headers);
        this._step = 2;
        const body = document.getElementById('csv-modal-body');
        if (body) body.innerHTML = this._renderStep2();
      } catch (err) {
        Toast.show('Error al leer el archivo CSV', 'error');
        console.error(err);
      }
    };
    reader.readAsText(file, 'UTF-8');
  },

  _toggleMapping(index, checked) {
    if (this._mapping[index]) this._mapping[index].include = checked;
    const included = this._mapping.filter(m => m.include && m.mappedName).length;
    document.querySelector('[data-included-count]')?.textContent;
  },

  _updateMappingName(index, value) {
    if (this._mapping[index]) this._mapping[index].mappedName = value;
  },

  _updateMappingUnit(index, value) {
    if (this._mapping[index]) this._mapping[index].mappedUnit = value;
  },

  _doImport() {
    const toImport = this._mapping.filter(m => m.include && m.mappedName.trim());
    if (!toImport.length) { Toast.show('Selecciona al menos una métrica', 'error'); return; }

    const mode = document.getElementById('csv-import-mode')?.value || 'append';
    const { client, item } = App._findItem(this._itemId);
    if (!item) { Toast.show('Campaña no encontrada', 'error'); return; }

    const newMetrics = toImport.map(m => ({
      id: uid(),
      name: m.mappedName.trim(),
      value: this.cleanNumber(m.value),
      unit: m.mappedUnit || ''
    }));

    if (mode === 'replace') {
      item.metrics = newMetrics;
    } else if (mode === 'update') {
      if (!item.metrics) item.metrics = [];
      for (const nm of newMetrics) {
        const existing = item.metrics.find(m => m.name.toLowerCase() === nm.name.toLowerCase());
        if (existing) existing.value = nm.value;
        else item.metrics.push(nm);
      }
    } else { // append
      if (!item.metrics) item.metrics = [];
      item.metrics.push(...newMetrics);
    }

    DB.saveClient(client);
    this._importedCount = newMetrics.length;
    this._step = 3;
    const body = document.getElementById('csv-modal-body');
    if (body) body.innerHTML = this._renderStep3();
    Toast.show(`${newMetrics.length} métrica${newMetrics.length !== 1 ? 's' : ''} importada${newMetrics.length !== 1 ? 's' : ''}`, 'success');
  }
};

// ===== START =====
App.init();
