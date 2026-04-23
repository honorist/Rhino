// Route definitions
const routes = {
  '#/dashboard':    { view: window.Dashboard,     label: 'Dashboard',    icon: '▦' },
  '#/proposta':     { view: null,                 label: 'Proposta',     icon: '◧', soon: true },
  '#/contratos':    { view: window.Contratos,      label: 'Contratos',    icon: '≣' },
  '#/contratos/:id':{ view: window.ContratoDetail, label: null,           icon: null },
  '#/obras':        { view: window.Obras,          label: 'Mapa de Obras',icon: '⊚' },
  '#/clientes':     { view: window.Clientes,       label: 'Clientes',     icon: '◎' },
  '#/fornecedores': { view: window.Fornecedores,   label: 'Fornecedores', icon: '⬡' },
  '#/caixa':        { view: window.Caixa,          label: 'Caixa',        icon: '◇',  group: 'financeiro' },
  '#/contas-pagar': { view: window.ContasPagar,    label: 'Contas a Pagar', icon: '⊖', group: 'financeiro' },
  '#/notas-fiscais':{ view: window.NotasFiscais,   label: 'Contas a Receber',icon: '☐',  group: 'financeiro' },
  '#/socios':       { view: window.Socios,         label: 'Sócios',       icon: '⊕',  group: 'financeiro' },
  '#/investimentos':{ view: window.Investimentos,  label: 'Aportes',      icon: '△',  group: 'financeiro' },
  '#/base':         { view: window.Base,           label: 'BASE',         icon: '⊟' },
  '#/configuracao': { view: window.Configuracao,   label: 'Configuração', icon: '⊙' }
};

// Sidebar group open/close state (persisted)
const sidebarGroups = {
  get(key) {
    try {
      const v = localStorage.getItem('rino-group-' + key);
      return v === null ? true : JSON.parse(v);
    } catch { localStorage.removeItem('rino-group-' + key); return true; }
  },
  set(key, val) {
    localStorage.setItem('rino-group-' + key, JSON.stringify(val));
  },
  toggle(key) {
    this.set(key, !this.get(key));
  }
};

// ─── Perfil de Acesso ───
const perfil = {
  _niveis: [],

  async load() {
    try {
      const r = await fetch('/api/niveis-acesso').then(res => res.json());
      this._niveis = r.niveis || [];
    } catch { this._niveis = []; }
  },

  get() {
    try { return JSON.parse(sessionStorage.getItem('rino-perfil') || 'null'); } catch { return null; }
  },

  set(nivelObj) {
    sessionStorage.setItem('rino-perfil', JSON.stringify(nivelObj));
  },

  clear() {
    sessionStorage.removeItem('rino-perfil');
  },

  // Retorna as abas permitidas do perfil atual (null = sem restrição)
  abas() {
    const p = this.get();
    return p ? (p.abas || []) : null;
  },

  // Verifica se uma rota é permitida
  podeAcessar(route) {
    const abas = this.abas();
    if (!abas) return true;
    // Rotas de detalhe (ex: #/contratos/123) seguem a permissão da rota pai
    const base = route.replace(/(#\/[^/]+).*/, '$1');
    return abas.includes(base);
  },

  // Primeira aba acessível (para redirecionar após seleção)
  primeiraAba() {
    const abas = this.abas();
    if (!abas || abas.length === 0) return '#/dashboard';
    return abas[0];
  },

  niveis() { return this._niveis; }
};

// ─── Seletor de perfil ───
async function showProfilePicker() {
  await perfil.load();
  const niveis = perfil.niveis();

  const isDark = getTheme() === 'dark';

  const overlay = document.createElement('div');
  overlay.id = 'profilePicker';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    display:flex;align-items:center;justify-content:center;
    background:var(--color-bg);
  `;

  overlay.innerHTML = `
    <div style="width:100%;max-width:680px;padding:var(--sp-xl);">
      <div style="text-align:center;margin-bottom:var(--sp-xl);">
        <img src="/assets/logo.png" alt="Rhino" style="height:56px;margin-bottom:var(--sp-lg);opacity:.9;">
        <h1 style="font-size:22px;font-weight:700;margin:0 0 var(--sp-sm);">Selecione seu perfil</h1>
        <p style="color:var(--color-text-muted);font-size:14px;margin:0;">Escolha o nível de acesso para continuar</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-md);">
        ${niveis.map(n => `
          <button class="perfil-card" data-id="${n.id}" style="
            display:flex;align-items:center;gap:var(--sp-md);
            padding:var(--sp-lg);border-radius:10px;
            background:var(--color-surface);
            border:2px solid var(--color-border);
            cursor:pointer;text-align:left;transition:all .15s;
          "
          onmouseenter="this.style.borderColor='${n.cor}';this.style.background='${n.cor}18';"
          onmouseleave="this.style.borderColor='var(--color-border)';this.style.background='var(--color-surface)';">
            <span style="font-size:36px;line-height:1;">${n.icon}</span>
            <div>
              <div style="font-size:16px;font-weight:700;color:${n.cor};">${n.label}</div>
            </div>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelectorAll('.perfil-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const nivel = niveis.find(n => n.id === id);
      if (!nivel) return;
      perfil.set(nivel);
      overlay.remove();
      iniciarApp();
    });
  });
}

function iniciarApp() {
  renderSidebar();
  updateSidebarActiveState(location.hash);

  const hash = location.hash || '';
  const primeira = perfil.primeiraAba();

  if (!hash || !perfil.podeAcessar(hash)) {
    location.hash = primeira;
  } else {
    navigate();
  }
}

// ─── Theme ───
function getTheme() {
  return localStorage.getItem('rino-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('rino-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.title = theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function matchRoute(hash) {
  for (const [pattern, config] of Object.entries(routes)) {
    if (pattern.includes(':id')) {
      const regex = pattern.replace(':id', '([^/]+)');
      const match = hash.match(new RegExp(`^${regex}$`));
      if (match) {
        return { view: config.view, params: { id: match[1] } };
      }
    } else {
      if (hash === pattern) {
        return { view: config.view, params: {} };
      }
    }
  }
  return null;
}

function getNFAlertCount() {
  try {
    const em7 = new Date();
    em7.setDate(em7.getDate() + 7);
    const em7str = em7.toISOString().split('T')[0];
    return (Store.state.notas_fiscais || []).filter(nf =>
      !nf.emitida && nf.dataLimite <= em7str
    ).length;
  } catch { return 0; }
}

function getContasPagarAlertCount() {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    return (Store.state.contas_pagar || []).filter(c =>
      c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hoje
    ).length;
  } catch { return 0; }
}

function renderNavItem(link, nfAlerts, cpAlerts) {
  if (link.soon) {
    return `
      <li class="nav-item">
        <span class="nav-link nav-link-soon">
          <span class="nav-icon">${link.icon}</span>
          <span>${link.label}</span>
          <span class="nav-badge-soon">em breve</span>
        </span>
      </li>`;
  }

  let badge = '';
  if (link.href === '#/notas-fiscais' && nfAlerts > 0) {
    badge = `<span class="nav-badge-alert">${nfAlerts}</span>`;
  } else if (link.href === '#/contas-pagar' && cpAlerts > 0) {
    badge = `<span class="nav-badge-alert">${cpAlerts}</span>`;
  }

  return `
    <li class="nav-item">
      <a href="${link.href}" class="nav-link">
        <span class="nav-icon">${link.icon}</span>
        <span>${link.label}</span>
        ${badge}
      </a>
    </li>`;
}

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  const nfAlerts = getNFAlertCount();
  const cpAlerts = getContasPagarAlertCount();
  const isDark = getTheme() === 'dark';
  const finOpen = sidebarGroups.get('financeiro');
  const currentHash = location.hash || '#/dashboard';
  const perfilAtual = perfil.get();

  // Separate top-level links from grouped ones, filtradas pelo perfil
  const topLinks = [];
  const finLinks = [];

  for (const [pattern, config] of Object.entries(routes)) {
    if (!config.label || pattern.includes(':id')) continue;
    if (!perfil.podeAcessar(pattern)) continue;
    const item = { href: pattern, label: config.label, icon: config.icon, soon: config.soon || false };
    if (config.group === 'financeiro') {
      finLinks.push(item);
    } else {
      topLinks.push(item);
    }
  }

  // Check if any financial route is currently active
  const finActive = finLinks.some(l => currentHash.startsWith(l.href));
  const finOpenEffective = finOpen || finActive;
  const finAlerts = nfAlerts + cpAlerts;

  // Índice onde o grupo financeiro aparece (entre topLinks[3] e topLinks[4])
  const topBefore = topLinks.filter((_, i) => i < 4);
  const topAfter  = topLinks.filter((_, i) => i >= 4);

  const finBlock = finLinks.length > 0 ? `
    <li class="nav-group-item">
      <button class="nav-group-header" id="btnFinanceiro">
        <span class="nav-icon">◈</span>
        <span class="nav-group-label">Financeiro</span>
        ${!finOpenEffective && finAlerts > 0 ? `<span class="nav-badge-alert">${finAlerts}</span>` : ''}
        <span class="nav-group-arrow ${finOpenEffective ? 'open' : ''}">›</span>
      </button>
      <ul class="nav-group-children ${finOpenEffective ? 'open' : ''}">
        ${finLinks.map(l => renderNavItem(l, nfAlerts, cpAlerts)).join('')}
      </ul>
    </li>` : '';

  const html = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <img src="/assets/logo.png" alt="Rhino Manutenções" class="sidebar-logo-img">
      </div>
    </div>
    <ul class="nav-links">
      ${topBefore.map(l => renderNavItem(l, nfAlerts, cpAlerts)).join('')}
      ${finBlock}
      ${topAfter.map(l => renderNavItem(l, nfAlerts, cpAlerts)).join('')}
    </ul>
    <div class="sidebar-footer">
      ${perfilAtual ? `
        <button id="btn-trocar-perfil" class="theme-toggle-btn" title="Trocar perfil" style="margin-bottom:4px;">
          <span style="font-size:15px;">${perfilAtual.icon}</span>
          <span style="color:${perfilAtual.cor};font-weight:600;">${perfilAtual.label}</span>
          <span style="margin-left:auto;font-size:10px;color:var(--color-text-muted);">trocar</span>
        </button>
      ` : ''}
      <button id="theme-toggle" class="theme-toggle-btn" title="${isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}">
        <span class="theme-toggle-icon">${isDark ? '☀' : '☾'}</span>
        <span>${isDark ? 'Tema Claro' : 'Tema Escuro'}</span>
      </button>
      <div class="sidebar-version">v1.0.0</div>
    </div>
  `;

  sidebar.innerHTML = html;

  // Nav link clicks
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = link.getAttribute('href');
    });
  });

  // Group toggle
  const btnFin = document.getElementById('btnFinanceiro');
  if (btnFin) {
    btnFin.addEventListener('click', () => {
      const children = document.querySelector('.nav-group-children');
      const arrow = document.querySelector('.nav-group-arrow');
      if (!children || !arrow) return;
      const isOpen = children.classList.contains('open');
      const currentlyActive = finLinks.some(l => (location.hash || '').startsWith(l.href));
      if (currentlyActive && isOpen) return;
      if (isOpen) {
        children.classList.remove('open');
        arrow.classList.remove('open');
        sidebarGroups.set('financeiro', false);
      } else {
        children.classList.add('open');
        arrow.classList.add('open');
        sidebarGroups.set('financeiro', true);
      }
    });
  }

  // Trocar perfil
  const btnTrocar = document.getElementById('btn-trocar-perfil');
  if (btnTrocar) {
    btnTrocar.addEventListener('click', () => {
      perfil.clear();
      showProfilePicker();
    });
  }

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    toggleTheme();
    renderSidebar();
    updateSidebarActiveState(location.hash || '#/dashboard');
  });
}

function updateSidebarActiveState(hash) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && hash.startsWith(href)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Highlight group header if a child is active
  const finLinks = Object.entries(routes)
    .filter(([, c]) => c.group === 'financeiro' && c.label)
    .map(([p]) => p);
  const finActive = finLinks.some(p => hash.startsWith(p));
  const groupHeader = document.getElementById('btnFinanceiro');
  if (groupHeader) {
    groupHeader.classList.toggle('active', finActive);
  }
}

async function navigate() {
  const hash = location.hash || '#/dashboard';

  // Bloquear rota não permitida para o perfil atual
  if (!perfil.podeAcessar(hash)) {
    location.hash = perfil.primeiraAba();
    return;
  }

  const match = matchRoute(hash);

  if (!match || !match.view) {
    location.hash = perfil.primeiraAba();
    return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

  try {
    await match.view.render(match.params);
  } catch (e) {
    console.error('Navigation error:', e);
    app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar página: ${e.message}</p></div>`;
  }

  renderSidebar();
  updateSidebarActiveState(hash);
}

// Initialize app
window.addEventListener('hashchange', navigate);
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getTheme());

  await Store.loadAll();

  if (perfil.get()) {
    // Perfil já selecionado nesta sessão
    iniciarApp();
  } else {
    // Mostrar seletor de perfil
    renderSidebar(); // renderiza sidebar vazia enquanto carrega
    showProfilePicker();
  }
});
