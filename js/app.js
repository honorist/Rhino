// Route definitions — icons via rhIcon() (Lucide-style SVG)
const _ic = (n) => (window.rhIcon ? window.rhIcon(n, 18) : '');

// Lazy-loaded scripts: removidos do index.html eager, carregam só quando a rota é acessada.
// Cada chave bate com matchRoute → carrega e re-resolve view antes do render.
const _lazyManifest = {
  '#/contratos/:id': {
    viewName: 'ContratoDetail',
    scripts: [
      './js/views/ContratoDetail.js',
      './js/views/contrato/charts.js',
      './js/views/contrato/visao-geral.js',
      './js/views/contrato/organograma.js',
      './js/views/contrato/rdos.js',
      './js/views/contrato/rdo-form.js',
      './js/views/contrato/rdo-pdf.js',
      './js/views/contrato/rdos-pdf-batch.js',
      './js/views/contrato/modais.js',
      './js/views/contrato/cronograma.js',
      './js/views/contrato/dre.js',
      './js/views/contrato/evm.js',
      './js/views/contrato/punch.js',
      './js/views/contrato/ssma.js',
      './js/views/contrato/databook.js',
      './js/views/contrato/medicao.js',
      './js/views/contrato/medicao-bms.js',
      './js/views/contrato/export-pdf.js',
      './js/views/contrato/modais-extra.js',
    ],
  },
  '#/manual': { viewName: 'Manual', scripts: ['./js/views/Manual.js'] },
  '#/notificacao-preferencias': { viewName: 'NotificacaoPreferencias', scripts: ['./js/views/NotificacaoPreferencias.js'] },
  '#/ai-chat': { viewName: 'AiChat', scripts: ['./js/views/AiChat.js'] },
  '#/previsao': { viewName: 'Previsao', scripts: ['./js/views/Previsao.js'] },
  '#/auditoria': { viewName: 'Auditoria', scripts: ['./js/views/Auditoria.js'] },
  '#/comparativo': { viewName: 'Comparativo', scripts: ['./js/views/Comparativo.js'] },
  // Views adicionais movidas para lazy (Tier 3 — confirmadas sem cross-referência).
  // Cada uma só é baixada quando o usuário visita a rota correspondente.
  '#/portal': { viewName: 'Portal', scripts: ['./js/views/Portal.js'] },
  '#/relatorios': { viewName: 'Relatorio', scripts: ['./js/views/Relatorio.js'] },
  '#/cobranca': { viewName: 'CobrancaMensal', scripts: ['./js/views/CobrancaMensal.js'] },
  '#/conciliacao': { viewName: 'Conciliacao', scripts: ['./js/views/Conciliacao.js'] },
  '#/usuarios': { viewName: 'Usuarios', scripts: ['./js/views/Usuarios.js'] },
  '#/solicitacoes-compra': {
    viewName: 'SolicitacoesCompra',
    scripts: ['./js/views/SolicitacoesCompra.js'],
  },
  '#/cotacoes-historico': {
    viewName: 'CotacoesHistorico',
    scripts: ['./js/views/CotacoesHistorico.js'],
  },
  '#/manutencao': { viewName: 'Manutencao', scripts: ['./js/views/Manutencao.js', './js/views/manutencao-romaneio.js'] },
  '#/frota': { viewName: 'Frota', scripts: ['./js/views/Frota.js'] },
  '#/estoque': { viewName: 'Estoque', scripts: ['./js/views/Estoque.js'] },
  '#/proposta': { viewName: 'Propostas', scripts: ['./js/views/Propostas.js'] },
  '#/proposta/:id': {
    viewName: 'PropostaDetail',
    scripts: [
      './js/views/PropostaDetail.js',
      './js/views/proposta/dados-gerais.js',
      './js/views/proposta/escopo.js',
      './js/views/proposta/obrigacoes.js',
      './js/views/proposta/cronograma.js',
      './js/views/proposta/investimento.js',
      './js/views/proposta/custo-interno.js',
      './js/views/proposta/anexos.js',
      './js/views/proposta/preview.js',
      './js/views/proposta/acoes.js',
    ],
  },
  '#/clausulas': { viewName: 'Clausulas', scripts: ['./js/views/Clausulas.js'] },
  '#/composicoes': { viewName: 'Composicoes', scripts: ['./js/views/Composicoes.js'] },
  '#/mapa-cotacoes': { viewName: 'MapaCotacoes', scripts: ['./js/views/MapaCotacoes.js'] },
  '#/subcontratados': { viewName: 'Subcontratados', scripts: ['./js/views/Subcontratados.js'] },
  '#/ferramentaria': { viewName: 'Ferramentaria', scripts: ['./js/views/Ferramentaria.js'] },
  '#/equipamentos': { viewName: 'Equipamentos', scripts: ['./js/views/Equipamentos.js'] },
  '#/apresentacao': { viewName: 'Apresentacao', scripts: ['./js/views/Apresentacao.js'] },
  '#/folha-pagamento': { viewName: 'FolhaPagamento', scripts: ['./js/views/FolhaPagamento.js'] },
};

const _lazyLoaded = new Set();
const _lazyInflight = new Map();
function _injectScript(src) {
  if (_lazyLoaded.has(src)) return Promise.resolve();
  if (_lazyInflight.has(src)) return _lazyInflight.get(src);
  // Cache-busting: anexa ?v=APP_VERSION pra forçar download de JS novo
  // quando uma nova versão é deployada. O sw.js faz cache-first em JS,
  // então sem isso o usuário ficava preso ao JS antigo cacheado.
  const v = window.__APP_VERSION__ || 'dev';
  const sep = src.includes('?') ? '&' : '?';
  const finalSrc = src + sep + 'v=' + encodeURIComponent(v);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = finalSrc;
    s.async = false; // preserva ordem entre scripts injetados
    s.onload = () => {
      _lazyLoaded.add(src);
      resolve();
    };
    s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
  _lazyInflight.set(src, p);
  return p;
}
async function _loadLazyForPattern(pattern) {
  const m = _lazyManifest[pattern];
  if (!m) return;
  // Carrega em ordem (script principal primeiro, depois sub-módulos)
  for (const src of m.scripts) {
    await _injectScript(src);
  }
  if (routes[pattern]) routes[pattern].view = window[m.viewName] || routes[pattern].view;
}

const routes = {
  '#/dashboard': { view: window.Dashboard, label: 'Dashboard', icon: _ic('home') },
  '#/proposta': { view: null, label: 'Propostas', icon: _ic('file-text'), group: 'comercial' },
  '#/proposta/:id': { view: null, label: null, icon: null },
  '#/clausulas': { view: null, label: null, icon: null },
  '#/composicoes': { view: null, label: 'Composições', icon: _ic('layers'), group: 'comercial' },
  '#/apresentacao': { view: null, label: null, icon: null },
  // Portal do Cliente: rota navegável (matchRoute) — view resolve via
  // _lazyManifest. Sem esta entrada, #/portal não casava e o router
  // devolvia para primeiraAba() (bug do "Ver portal como cliente").
  '#/portal': { view: null, label: null, icon: null },
  '#/contratos': {
    view: window.Contratos,
    label: 'Contratos',
    icon: _ic('briefcase'),
    group: 'comercial',
  },
  '#/contratos/:id': { view: window.ContratoDetail, label: null, icon: null },
  '#/comparativo': { view: window.Comparativo, label: null, icon: null },
  '#/cronograma-geral': {
    view: window.CronogramaGeral,
    label: 'Cronograma Geral',
    icon: _ic('activity'),
  },
  '#/clientes': {
    view: window.Clientes,
    label: 'Clientes',
    icon: _ic('users'),
    group: 'comercial',
  },
  '#/rdos': { view: window.RDOs, label: 'RDOs', icon: _ic('clipboard-check'), group: 'obras' },
  '#/obras': { view: window.Obras, label: 'Mapa de Obras', icon: _ic('map-pin'), group: 'obras' },
  '#/estoque': {
    view: window.Estoque,
    label: 'Almoxarifado',
    icon: _ic('package'),
    group: 'obras',
  },
  '#/solicitacoes-compra': {
    view: window.SolicitacoesCompra,
    label: 'Solicitações de Compra',
    icon: _ic('shopping-cart'),
    group: 'obras',
  },
  '#/cotacoes-historico': {
    view: window.CotacoesHistorico,
    label: 'Histórico de Cotações',
    icon: _ic('bar-chart-2'),
    group: 'obras',
  },
  '#/manutencao': {
    view: window.Manutencao,
    label: 'Manutenção',
    icon: _ic('wrench'),
    group: 'obras',
  },
  '#/frota': { view: window.Frota, label: 'Frota', icon: _ic('truck'), group: 'obras' },
  '#/mapa-cotacoes': { view: null, label: 'Mapa de Cotações', icon: _ic('arrow-left-right'), group: 'obras' },
  '#/subcontratados': { view: null, label: 'Subcontratados', icon: _ic('users'), group: 'obras' },
  '#/ferramentaria': { view: null, label: 'Ferramentaria', icon: _ic('settings'), group: 'obras' },
  '#/equipamentos': { view: null, label: 'Equipamentos', icon: _ic('zap'), group: 'obras' },
  '#/recursos': { view: window.Recursos, label: 'Recursos', icon: _ic('user-plus'), group: 'rh' },
  '#/recrutamento': {
    view: window.Recrutamento,
    label: 'Recrutamento',
    icon: _ic('briefcase'),
    group: 'rh',
  },
  '#/folha-pagamento': {
    view: null,
    label: 'Folha de Pagamento',
    icon: _ic('credit-card'),
    group: 'rh',
  },
  '#/documentos': {
    view: window.Documentos,
    label: 'Documentação',
    icon: _ic('file-text'),
    group: 'rh',
  },
  '#/caixa': { view: window.Caixa, label: 'Caixa', icon: _ic('wallet'), group: 'financeiro' },
  '#/contas-pagar': {
    view: window.ContasPagar,
    label: 'Contas a Pagar',
    icon: _ic('minus-circle'),
    group: 'financeiro',
  },
  '#/notas-fiscais': {
    view: window.NotasFiscais,
    label: 'Contas a Receber',
    icon: _ic('receipt'),
    group: 'financeiro',
  },
  '#/conciliacao': {
    view: window.Conciliacao,
    label: 'Conciliação',
    icon: _ic('arrow-left-right'),
    group: 'financeiro',
  },
  '#/investimentos': {
    view: window.Investimentos,
    label: 'Aportes',
    icon: _ic('plus-circle'),
    group: 'financeiro',
  },
  '#/socios': { view: window.Socios, label: 'Sócios', icon: _ic('users'), group: 'financeiro' },
  '#/previsao': {
    view: window.Previsao,
    label: 'Previsão',
    icon: _ic('trending-up'),
    group: 'financeiro',
  },
  '#/fornecedores': {
    view: window.Fornecedores,
    label: 'Fornecedores',
    icon: _ic('truck'),
    group: 'financeiro',
  },
  '#/base': { view: window.Base, label: 'BASE', icon: _ic('database'), group: 'financeiro' },
  '#/ai-chat': { view: window.AiChat, label: 'Assistente IA', icon: _ic('message-square') },
  '#/sugestoes': { view: window.Sugestoes, label: 'Sugestões', icon: _ic('zap') },
  '#/configuracao': { view: window.Configuracao, label: 'Configuração', icon: _ic('settings') },
  '#/cobranca': { view: window.CobrancaMensal, label: null, icon: null }, // acessível via Configuração
  '#/usuarios': { view: window.Usuarios, label: null, icon: null }, // acessível via Configuração
  '#/auditoria': { view: window.Auditoria, label: null, icon: null }, // acessível via Configuração
  '#/manual': { view: window.Manual, label: null, icon: null },
  '#/notificacao-preferencias': { view: window.NotificacaoPreferencias, label: null, icon: null }, // acessível via o sino
};

// Sidebar group open/close state (persisted)
const sidebarGroups = {
  get(key) {
    try {
      const v = localStorage.getItem('rhino-group-' + key);
      return v === null ? false : JSON.parse(v);
    } catch {
      localStorage.removeItem('rhino-group-' + key);
      return false;
    }
  },
  set(key, val) {
    localStorage.setItem('rhino-group-' + key, JSON.stringify(val));
  },
  toggle(key) {
    this.set(key, !this.get(key));
  },
};

// ─── Perfil de Acesso ───
// ─── Autenticação ───
const auth = {
  _user: null,
  user() {
    return this._user;
  },
  async loadMe() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) {
        this._user = null;
        return null;
      }
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      this._user = j.user;
      return this._user;
    } catch (e) {
      this._user = null;
      return null;
    }
  },
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'Falha no login');
    }
    const j = await res.json();
    this._user = j.user;
    return this._user;
  },
  async logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    this._user = null;
    sessionStorage.removeItem('rhino-perfil');
    location.reload();
  },
};

window.auth = auth;
// (perfil é exposto após sua definição abaixo)

async function showLoginModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10000;
      display:flex;align-items:center;justify-content:center;
      background:var(--color-bg);
    `;
    let mode = 'login'; // login | forgot
    const draw = () => {
      overlay.innerHTML =
        mode === 'forgot'
          ? `
        <form id="forgotForm" style="width:100%;max-width:380px;padding:var(--sp-xl);">
          <div style="text-align:center;margin-bottom:var(--sp-xl);">
            <img src="assets/logo.png" alt="Rhino" style="height:56px;margin-bottom:var(--sp-lg);opacity:.9;">
            <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;">Esqueci minha senha</h1>
            <p style="margin:0;color:var(--color-text-muted);font-size:14px;">Informe seu email pra receber o link de recuperação</p>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" autocomplete="username" required>
          </div>
          <div id="forgotMsg" style="display:none;font-size:13px;margin-bottom:var(--sp-md);padding:8px 12px;border-radius:6px;"></div>
          <button class="btn btn-primary" type="submit" style="width:100%;">Enviar link</button>
          <div style="text-align:center;margin-top:var(--sp-md);">
            <a href="#" id="backToLogin" style="font-size:13px;color:var(--color-primary);">← voltar ao login</a>
          </div>
        </form>
      `
          : `
        <form id="loginForm" style="width:100%;max-width:380px;padding:var(--sp-xl);">
          <div style="text-align:center;margin-bottom:var(--sp-xl);">
            <img src="assets/logo.png" alt="Rhino" style="height:56px;margin-bottom:var(--sp-lg);opacity:.9;">
            <h1 style="font-size:22px;font-weight:700;margin:0;">Acessar o Rhino</h1>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <div style="position:relative;">
              <input class="form-control" name="password" id="loginPwd" type="password" autocomplete="current-password" required style="padding-right:40px;">
              <button type="button" id="togglePwd" aria-label="Mostrar senha" title="Mostrar senha"
                      style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:none;cursor:pointer;padding:6px;display:inline-flex;align-items:center;color:var(--rh-ink-500, #64748B);">
                ${window.rhIcon ? window.rhIcon('eye', 18) : '👁'}
              </button>
            </div>
          </div>
          <div id="loginError" style="display:none;color:#c33;font-size:13px;margin-bottom:var(--sp-md);"></div>
          <button class="btn btn-primary" type="submit" style="width:100%;">Entrar</button>
          <div style="text-align:center;margin-top:var(--sp-md);">
            <a href="#" id="goForgot" style="font-size:13px;color:var(--color-primary);">Esqueci minha senha</a>
          </div>
          <div style="margin-top:var(--sp-lg);border-top:1px solid var(--color-border);padding-top:var(--sp-lg);text-align:center;">
            <a href="#" id="goPortal" style="font-size:13px;color:var(--color-text-muted);">Área do Cliente →</a>
          </div>
        </form>
      `;
      attach();
    };
    const attach = () => {
      const form = document.getElementById('loginForm');
      const forgotForm = document.getElementById('forgotForm');
      if (form) {
        const err = document.getElementById('loginError');
        // Toggle mostrar/ocultar senha
        const pwdInput = document.getElementById('loginPwd');
        const pwdBtn = document.getElementById('togglePwd');
        if (pwdInput && pwdBtn) {
          pwdBtn.addEventListener('click', () => {
            const showing = pwdInput.type === 'text';
            pwdInput.type = showing ? 'password' : 'text';
            pwdBtn.innerHTML = window.rhIcon
              ? window.rhIcon(showing ? 'eye' : 'eye-off', 18)
              : showing
                ? '👁'
                : '🙈';
            pwdBtn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
            pwdBtn.title = showing ? 'Mostrar senha' : 'Ocultar senha';
            pwdInput.focus();
          });
        }
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          err.style.display = 'none';
          const fd = new FormData(form);
          try {
            await auth.login(fd.get('email'), fd.get('password'));
            overlay.remove();
            resolve();
          } catch (ex) {
            err.textContent = ex.message;
            err.style.display = 'block';
          }
        });
        document.getElementById('goForgot').addEventListener('click', (e) => {
          e.preventDefault();
          mode = 'forgot';
          draw();
        });
        document.getElementById('goPortal')?.addEventListener('click', async (e) => {
          e.preventDefault();
          // Portal.js é lazy — precisa carregar ANTES de chamar init.
          // Bug histórico (db4361e): chamava window.Portal?.init() direto, mas
          // Portal era undefined e o click silenciosamente não fazia nada.
          try {
            await _loadLazyForPattern('#/portal');
          } catch (err) {
            console.error('[goPortal] falha ao carregar Portal:', err);
            return;
          }
          overlay.remove();
          window.Portal?.init();
          resolve('portal');
        });
      }
      if (forgotForm) {
        const msg = document.getElementById('forgotMsg');
        forgotForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(forgotForm);
          try {
            const res = await fetch('/api/auth/forgot-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: fd.get('email') }),
            });
            const j = await res.json();
            msg.style.display = 'block';
            msg.style.background = 'rgba(16,185,129,.1)';
            msg.style.color = '#065f46';
            msg.textContent = j.message || 'Se o email existir, enviamos as instruções.';
          } catch (ex) {
            msg.style.display = 'block';
            msg.style.background = 'rgba(220,38,38,.1)';
            msg.style.color = '#7f1d1d';
            msg.textContent = ex.message;
          }
        });
        document.getElementById('backToLogin').addEventListener('click', (e) => {
          e.preventDefault();
          mode = 'login';
          draw();
        });
      }
    };
    document.body.appendChild(overlay);
    draw();
  });
}

// Tela de redefinição de senha — abre quando URL tem ?action=reset-password&token=XXX
async function showResetPasswordModal(token) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'resetOverlay';
    overlay.style.cssText = `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:var(--color-bg);`;
    overlay.innerHTML = `
      <form id="resetForm" style="width:100%;max-width:400px;padding:var(--sp-xl);">
        <div style="text-align:center;margin-bottom:var(--sp-xl);">
          <img src="assets/logo.png" alt="Rhino" style="height:56px;margin-bottom:var(--sp-lg);opacity:.9;">
          <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;">Redefinir senha</h1>
          <p style="margin:0;color:var(--color-text-muted);font-size:14px;">Defina sua nova senha (mínimo 6 caracteres)</p>
        </div>
        <div class="form-group">
          <label class="form-label">Nova senha</label>
          <input class="form-control" name="password" type="password" autocomplete="new-password" minlength="6" required>
        </div>
        <div class="form-group">
          <label class="form-label">Confirmar senha</label>
          <input class="form-control" name="password2" type="password" minlength="6" required>
        </div>
        <div id="resetMsg" style="display:none;font-size:13px;margin-bottom:var(--sp-md);padding:8px 12px;border-radius:6px;"></div>
        <button class="btn btn-primary" type="submit" style="width:100%;">Redefinir e entrar</button>
      </form>
    `;
    document.body.appendChild(overlay);
    const form = document.getElementById('resetForm');
    const msg = document.getElementById('resetMsg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const p1 = fd.get('password');
      const p2 = fd.get('password2');
      if (p1 !== p2) {
        msg.style.display = 'block';
        msg.style.background = 'rgba(220,38,38,.1)';
        msg.style.color = '#7f1d1d';
        msg.textContent = 'As senhas não coincidem.';
        return;
      }
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password: p1 }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Erro ao redefinir');
        msg.style.display = 'block';
        msg.style.background = 'rgba(16,185,129,.1)';
        msg.style.color = '#065f46';
        msg.textContent = 'Senha redefinida! Você já pode fazer login com a nova senha.';
        // Limpa query string
        history.replaceState({}, '', location.pathname);
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 1500);
      } catch (ex) {
        msg.style.display = 'block';
        msg.style.background = 'rgba(220,38,38,.1)';
        msg.style.color = '#7f1d1d';
        msg.textContent = ex.message;
      }
    });
  });
}

// Modal de aceite de termos — bloqueia o app até aceitar
async function showTermosModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'termosOverlay';
    overlay.style.cssText = `position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);`;
    overlay.innerHTML = `
      <div style="background:var(--color-surface);width:100%;max-width:680px;max-height:85vh;border-radius:10px;display:flex;flex-direction:column;border:1px solid var(--color-border);">
        <div style="padding:var(--sp-lg);border-bottom:1px solid var(--color-border);">
          <h2 style="margin:0;font-size:20px;font-weight:800;">Termos de Uso e Política de Privacidade</h2>
          <p style="margin:6px 0 0;color:var(--color-text-muted);font-size:14px;">Para continuar usando o Rhino, leia e aceite os termos abaixo.</p>
        </div>
        <div style="overflow-y:auto;padding:var(--sp-lg);font-size:14px;line-height:1.7;color:var(--color-text);">
          <h3 style="margin:0 0 10px;font-size:16px;">1. Sobre o Rhino</h3>
          <p style="margin:0 0 12px;">O Rhino é um sistema interno de gestão de contratos, equipe e financeiro. O acesso é restrito a usuários autorizados pela administração.</p>

          <h3 style="margin:14px 0 10px;font-size:16px;">2. Dados pessoais que tratamos (LGPD)</h3>
          <p style="margin:0 0 8px;">O sistema armazena os seguintes dados:</p>
          <ul style="margin:0 0 12px 22px;">
            <li><strong>Usuários do sistema:</strong> nome, email, senha (criptografada com bcrypt), nível de acesso, registro de último login.</li>
            <li><strong>Colaboradores cadastrados:</strong> nome, CPF, RG, PIS, CNH, data de nascimento, gênero, telefone, email, endereço, salário, profissão, datas de admissão/desligamento, documentos digitalizados (ASO, NRs, etc.) e folgas.</li>
            <li><strong>Clientes e fornecedores:</strong> nome/razão social, CNPJ/CPF, contato, endereço, dados bancários (apenas fornecedores).</li>
            <li><strong>Sócios:</strong> nome, documento, email, telefone, percentual de participação.</li>
          </ul>

          <h3 style="margin:14px 0 10px;font-size:16px;">3. Finalidade do tratamento</h3>
          <p style="margin:0 0 12px;">Os dados são tratados exclusivamente para gestão administrativa, financeira e operacional da empresa: emissão de medições, controle de folgas, pagamentos, conformidade trabalhista e fiscal.</p>

          <h3 style="margin:14px 0 10px;font-size:16px;">4. Base legal</h3>
          <p style="margin:0 0 12px;">Tratamento baseado em: (i) execução de contrato de trabalho/prestação de serviços, (ii) cumprimento de obrigação legal ou regulatória, (iii) interesse legítimo e (iv) consentimento explícito do titular ao aceitar este termo.</p>

          <h3 style="margin:14px 0 10px;font-size:16px;">5. Direitos do titular</h3>
          <p style="margin:0 0 8px;">Você (ou o titular cujos dados você cadastra) tem direito a:</p>
          <ul style="margin:0 0 12px 22px;">
            <li>Confirmar a existência de tratamento dos seus dados</li>
            <li>Acessar os dados</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
            <li>Solicitar anonimização, bloqueio ou eliminação de dados desnecessários</li>
            <li>Solicitar portabilidade ou eliminação dos dados após o término do tratamento</li>
            <li>Revogar o consentimento</li>
          </ul>
          <p style="margin:0 0 12px;">Para exercer estes direitos, contate o administrador do sistema.</p>

          <h3 style="margin:14px 0 10px;font-size:16px;">6. Segurança</h3>
          <ul style="margin:0 0 12px 22px;">
            <li>Senhas armazenadas com hash bcrypt (irreversível)</li>
            <li>Sessões em cookies httpOnly + SameSite=Lax (proteção contra XSS/CSRF)</li>
            <li>Tráfego em produção via HTTPS (TLS)</li>
            <li>Acesso restrito por nível de acesso configurável</li>
            <li>Logs estruturados para auditoria</li>
            <li>Rate limiting em login (5 tentativas / 15 min)</li>
          </ul>

          <h3 style="margin:14px 0 10px;font-size:16px;">7. Retenção</h3>
          <p style="margin:0 0 12px;">Os dados são retidos enquanto durar a relação com a empresa e pelos prazos exigidos por lei (CLT: 30 anos para FGTS; fiscal: 5 anos; outros conforme legislação aplicável).</p>

          <h3 style="margin:14px 0 10px;font-size:16px;">8. Aceite</h3>
          <p style="margin:0 0 12px;">Ao clicar em <strong>"Aceito"</strong>, você confirma que leu, compreendeu e concorda com estes termos. O aceite é registrado no sistema com data/hora.</p>

          <p style="margin:0;color:var(--color-text-muted);font-size:13px;">Versão 1.0 · ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
        <div style="padding:var(--sp-lg);border-top:1px solid var(--color-border);display:flex;gap:var(--sp-md);justify-content:flex-end;">
          <button class="btn btn-secondary" id="btnRejeitar">Não aceito (sair)</button>
          <button class="btn btn-primary" id="btnAceitar">Aceito</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('btnAceitar').addEventListener('click', async () => {
      try {
        const res = await fetch('/api/auth/accept-terms', { method: 'POST' });
        if (!res.ok) throw new Error('Erro ao aceitar');
        overlay.remove();
        resolve(true);
      } catch (e) {
        alert(e.message);
      }
    });
    document.getElementById('btnRejeitar').addEventListener('click', async () => {
      await auth.logout(); // já recarrega
    });
  });
}

const perfil = {
  _niveis: [],

  async load() {
    try {
      const res = await fetch('/api/niveis-acesso');
      if (!res.ok) {
        this._niveis = this._niveis || [];
        return;
      } // sessão não pronta/expirada — não tenta parsear erro
      const r = await res.json();
      this._niveis = r.niveis || [];
      // Re-sincroniza o perfil ativo. O snapshot em sessionStorage é tirado
      // quando o usuário escolhe o perfil e fica desatualizado quando as
      // permissões mudam (matriz de Níveis de Acesso ou migração). Sem isto,
      // mudanças de acesso só apareciam após re-selecionar o perfil / re-login.
      const ativo = this.get();
      if (ativo && ativo.id) {
        const fresco = this._niveis.find((n) => n.id === ativo.id);
        if (fresco) this.set(fresco);
      }
    } catch (e) {
      console.warn(
        '[perfil] /api/niveis-acesso falhou — permissões resolverão como vazias:',
        e?.message || e
      );
      this._niveis = [];
    }
  },

  get() {
    try {
      return JSON.parse(sessionStorage.getItem('rhino-perfil') || 'null');
    } catch {
      return null;
    }
  },

  set(nivelObj) {
    sessionStorage.setItem('rhino-perfil', JSON.stringify(nivelObj));
  },

  clear() {
    sessionStorage.removeItem('rhino-perfil');
  },

  // Retorna as abas permitidas do perfil atual (null = sem restrição)
  abas() {
    const p = this.get();
    return p ? p.abas || [] : null;
  },

  // Verifica se uma rota é permitida
  podeAcessar(route) {
    const abas = this.abas();
    if (!abas) return true;
    // Rotas de detalhe (ex: #/contratos/123) seguem a permissão da rota pai.
    // baseHashPath já descarta querystring (js/lib/hash-route.js) — sem isso
    // uma rota como "#/recursos?docs=vencidos" caía sempre em "acesso negado".
    const base = window.baseHashPath(route);
    // Rotas universais — qualquer perfil autenticado pode abrir
    // (controle fino fica em cada tela, ex: ver/editar).
    // #/usuarios e #/auditoria NÃO são universais: exigem a permissão nas abas
    // — senão abririam vazias (dados barrados no servidor) para quem não tem acesso.
    // #/portal é universal: é a entrada do Portal do Cliente (tela própria,
    // dados exigem cookie rhino_portal) e o "Ver portal como cliente" do
    // super admin navega até ela via hash — sem isso o guard devolvia ao dashboard.
    const universais = [
      '#/manual',
      '#/rdos',
      '#/estoque',
      '#/comparativo',
      '#/solicitacoes-compra',
      '#/cotacoes-historico',
      '#/manutencao',
      '#/frota',
      '#/proposta',
      '#/clausulas',
      '#/apresentacao',
      '#/cronograma-geral',
      '#/sugestoes',
      '#/portal',
      '#/notificacao-preferencias',
    ];
    if (universais.includes(base)) return true;
    return abas.includes(base);
  },

  // Pode ver valores monetários? Se o perfil tem 'special:nao-ver-valores'
  // nas abas, todos os valores R$ são mascarados como R$ ●●●●●.
  // Se NÃO houver perfil ativo (admin sem perfil escolhido), libera por padrão.
  podeVerValores() {
    const abas = this.abas();
    if (!abas) return true;
    return !abas.includes('special:nao-ver-valores');
  },

  // Pode editar/criar/excluir nesta rota?
  // Convenção: para autorizar edição, o perfil deve ter 'edit:#/contratos' (etc) nas abas.
  // Se sem perfil ativo (admin), libera por padrão.
  podeEditar(route) {
    const abas = this.abas();
    if (!abas) return true;
    if (!route) return false;
    // Detalhe (#/contratos/123) usa permissão da rota pai (mesmo helper de
    // podeAcessar acima).
    const base = window.baseHashPath(route);
    return abas.includes('edit:' + base);
  },

  // Verifica se uma sub-aba dentro do contrato está liberada para este perfil.
  // Convenção: abas com prefixo "contrato-tab:" no array niveis.abas.
  // Se o perfil não tem NENHUMA contrato-tab configurada, libera todas (compat).
  podeContractTab(tabKey) {
    const abas = this.abas();
    if (!abas) return true; // sem perfil → tudo liberado
    // Sub-abas universais (adicionadas depois do cadastro inicial dos perfis):
    if (['cronograma', 'timeline', 'medicao'].includes(tabKey)) return true;
    const contractTabs = abas.filter((a) => typeof a === 'string' && a.startsWith('contrato-tab:'));
    if (contractTabs.length === 0) return true; // nada configurado → tudo liberado (legado)
    return contractTabs.includes('contrato-tab:' + tabKey);
  },

  // Primeira sub-aba do contrato liberada
  primeiraContractTab() {
    const ordem = ['visao', 'financeiro', 'medicao', 'cronograma', 'equipe', 'rdo', 'pendencias'];
    return ordem.find((k) => this.podeContractTab(k)) || 'visao';
  },

  // Primeira aba acessível (para redirecionar após seleção)
  primeiraAba() {
    const abas = this.abas();
    if (!abas || abas.length === 0) return '#/dashboard';
    return abas[0];
  },

  niveis() {
    return this._niveis;
  },
};

window.perfil = perfil;

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
        <img src="assets/logo.png" alt="Rhino" style="height:56px;margin-bottom:var(--sp-lg);opacity:.9;">
        <h1 style="font-size:22px;font-weight:700;margin:0 0 var(--sp-sm);">Selecione seu perfil</h1>
        <p style="color:var(--color-text-muted);font-size:15px;margin:0;">Escolha o nível de acesso para continuar</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-md);">
        ${niveis
          .map((n) => {
            // Dados do nível de acesso são editáveis e este seletor de perfil
            // aparece ANTES do login → sanitizar. `cor` entra em CSS e num handler
            // JS inline (onmouseenter): restringir a hex puro impede injeção de
            // aspas/JS. icon/label/id via escapeHtml previnem XSS no HTML.
            const cor = /^#[0-9a-fA-F]{6}$/.test(n.cor || '') ? n.cor : null;
            const id = window.escapeHtml(n.id);
            const icon = window.rhIconOrText(n.icon, 36, window.escapeHtml);
            const label = window.escapeHtml(n.label || '');
            return `
          <button class="perfil-card" data-id="${id}" style="
            display:flex;align-items:center;gap:var(--sp-md);
            padding:var(--sp-lg);border-radius:10px;
            background:var(--color-surface);
            border:2px solid var(--color-border);
            cursor:pointer;text-align:left;transition:all .15s;
          "
          ${
            cor
              ? `onmouseenter="this.style.borderColor='${cor}';this.style.background='${cor}18';"
          onmouseleave="this.style.borderColor='var(--color-border)';this.style.background='var(--color-surface)';"`
              : ''
          }>
            <span style="font-size:36px;line-height:1;">${icon}</span>
            <div>
              <div style="font-size:16px;font-weight:700;${cor ? `color:${cor};` : ''}">${label}</div>
            </div>
          </button>
        `;
          })
          .join('')}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelectorAll('.perfil-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const nivel = niveis.find((n) => n.id === id);
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

  // Sinaliza pra quem espera o app realmente utilizável (ex.: tour de
  // boas-vindas) — dispara sempre depois do gate de perfil ser resolvido,
  // nunca em cima do seletor de perfil ainda aberto.
  window.dispatchEvent(new CustomEvent('rh:app-ready'));

  // FAB global de sugestões (qualquer tela). Idempotente.
  if (window.Sugestoes?.mountFab) window.Sugestoes.mountFab();
}

// ─── Sidebar collapse ───
const SB_COLLAPSE_KEY = 'rhino-sb-collapsed';

function getSbCollapsed() {
  try {
    return localStorage.getItem(SB_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function setSbCollapsed(v) {
  try {
    localStorage.setItem(SB_COLLAPSE_KEY, v ? '1' : '0');
  } catch {}
}
function applySbCollapsed(collapsed) {
  document.body.classList.toggle('sb-collapsed', collapsed);
  const btn = document.getElementById('btn-sb-collapse');
  if (btn) {
    btn.title = collapsed ? 'Expandir sidebar' : 'Recolher sidebar';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = _ic(collapsed ? 'chevrons-right' : 'chevrons-left');
  }
}

// ─── Theme ───
function getTheme() {
  const saved = localStorage.getItem('rhino-theme');
  if (saved) return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme) {
  // Light = usa tokens padrão do :root (sem override). Dark = aplica override via data-theme.
  if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('rhino-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.title = theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// ─── Zoom (UI scale) ───
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

function getZoom() {
  const v = parseFloat(localStorage.getItem('rhino-zoom'));
  return isNaN(v) ? 1 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
}

function applyZoom(z) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  localStorage.setItem('rhino-zoom', String(clamped));
  document.documentElement.style.zoom = '';
  document.documentElement.style.setProperty('--fs-mult', String(clamped));
  const lbl = document.getElementById('zoom-label');
  if (lbl) lbl.textContent = Math.round(clamped * 100) + '%';
}

function zoomIn() {
  applyZoom(getZoom() + ZOOM_STEP);
}
function zoomOut() {
  applyZoom(getZoom() - ZOOM_STEP);
}
function zoomReset() {
  applyZoom(1);
}

function matchRoute(hash) {
  // js/lib/hash-route.js — router só sabia casar hash exato, então um link
  // com querystring (ex.: drill-down do Dashboard) nunca batia e caía sempre
  // em primeiraAba().
  const { path, query } = window.splitHashQuery(hash);
  for (const [pattern, config] of Object.entries(routes)) {
    if (pattern.includes(':id')) {
      const regex = pattern.replace(':id', '([^/]+)');
      const match = path.match(new RegExp(`^${regex}$`));
      if (match) {
        return { view: config.view, params: { id: match[1], query }, pattern, config };
      }
    } else {
      if (path === pattern) {
        return { view: config.view, params: { query }, pattern, config };
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
    return (Store.state.notas_fiscais || []).filter((nf) => !nf.emitida && nf.dataLimite <= em7str)
      .length;
  } catch {
    return 0;
  }
}

function getRecursosAlertCount() {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diasAviso = 10; // alerta se folga em ≤ 10 dias e passagem não comprada
    return (Store.state.recursos || []).filter((r) => {
      if (r.status !== 'funcionario' || !r.alocacaoAtual?.dataInicio) return false;
      const ciclo = parseInt(r.alocacaoAtual.cicloTrabalho) || 21;
      const folgas = (r.folgas || []).sort(
        (a, b) => new Date(b.dataInicio) - new Date(a.dataInicio)
      );
      const base = folgas[0]?.dataFim
        ? new Date(folgas[0].dataFim + 'T12:00:00')
        : new Date(r.alocacaoAtual.dataInicio + 'T12:00:00');
      const proxima = new Date(base);
      proxima.setDate(proxima.getDate() + ciclo);
      const dias = Math.ceil((proxima - hoje) / 86400000);
      if (dias > diasAviso) return false;
      // Verifica se passagem ida ainda não foi comprada
      const ultimaFolga = folgas[0];
      const passagemComprada = ultimaFolga && ultimaFolga.passagemIda?.comprada;
      return !passagemComprada;
    }).length;
  } catch {
    return 0;
  }
}

// Conta colaboradores ativos com problema documental:
// vencidos (já passou) — alerta vermelho
// vencendo (até 30 dias) — alerta amarelo
function getDocumentosAlertCount() {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let vencidos = 0,
      vencendo = 0;
    (Store.state.recursos || [])
      .filter((r) => r.status === 'funcionario')
      .forEach((r) => {
        let temVencido = false,
          temVencendo = false;
        for (const doc of r.documentos || []) {
          if (!doc.dataVencimento) continue;
          const dias = Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000);
          if (dias < 0) temVencido = true;
          else if (dias <= 30) temVencendo = true;
        }
        if (temVencido) vencidos++;
        else if (temVencendo) vencendo++; // só conta como "vencendo" se ainda não tem nenhum vencido
      });
    return vencidos + vencendo; // total — usado em groupAlertCount
  } catch {
    return 0;
  }
}

// Detalhe (vencidos vs vencendo) — usado na badge da Documentação para escolher cor
function getDocumentosAlertDetail() {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let vencidos = 0,
      vencendo = 0;
    (Store.state.recursos || [])
      .filter((r) => r.status === 'funcionario')
      .forEach((r) => {
        let temVencido = false,
          temVencendo = false;
        for (const doc of r.documentos || []) {
          if (!doc.dataVencimento) continue;
          const dias = Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000);
          if (dias < 0) temVencido = true;
          else if (dias <= 30) temVencendo = true;
        }
        if (temVencido) vencidos++;
        else if (temVencendo) vencendo++;
      });
    return { vencidos, vencendo, total: vencidos + vencendo };
  } catch {
    return { vencidos: 0, vencendo: 0, total: 0 };
  }
}

function getContasPagarAlertCount() {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    return (Store.state.contas_pagar || []).filter(
      (c) => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hoje
    ).length;
  } catch {
    return 0;
  }
}

// ── Alertas de Compras, Manutenção e Frota (dados já no Store) ─────────────
function getComprasAlertCount() {
  try {
    const abertas = new Set(['pendente_avaliacao', 'pendente_aprovacao', 'aprovada', 'comprada']);
    return (Store.state.solicitacoes_compra || []).filter((s) => abertas.has(s.status)).length;
  } catch {
    return 0;
  }
}

function getManutencaoAlertCount() {
  try {
    const abertas = new Set(['solicitada', 'pendente_aprovacao', 'aprovada', 'em_manutencao']);
    return (Store.state.manutencoes || []).filter((m) => abertas.has(m.status)).length;
  } catch {
    return 0;
  }
}

// Veículos ativos com algum plano de manutenção vencido (por km, por data, ou nunca feito).
function getFrotaAlertCount() {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return (Store.state.veiculos || []).filter((v) => {
      if (v.status === 'inativo') return false;
      const km = parseInt(v.kmAtual) || 0;
      return (v.planos || []).some((p) => {
        if (p.ativo === false) return false;
        if (p.intervaloKm && p.ultimoKm != null && km - p.ultimoKm >= p.intervaloKm) return true;
        if (p.intervaloMeses && p.ultimaData) {
          const d = new Date(String(p.ultimaData).slice(0, 10) + 'T12:00:00');
          d.setMonth(d.getMonth() + parseInt(p.intervaloMeses));
          if (d < hoje) return true;
        }
        if (p.ultimoKm == null && !p.ultimaData) return true; // plano nunca executado
        return false;
      });
    }).length;
  } catch {
    return 0;
  }
}

// RDO: "obras sem RDO no último dia útil" vem de /api/rdos (não está no Store).
// Busca assíncrona com cache — atualizada no boot e a cada 10 min.
let _rdoAlertCount = 0;
function getRdosAlertCount() {
  return _rdoAlertCount;
}
async function refreshRdoAlertCount() {
  // Não busca antes do login: o setTimeout/setInterval de módulo dispara no boot mesmo
  // deslogado, e /api/rdos sem sessão gera 401 no console. Só roda autenticado.
  if (!auth.user()) return;
  try {
    const r = await fetch('/api/rdos');
    if (!r.ok) return;
    const j = await r.json();
    // RDO é diário: cada (obra × dia útil) sem RDO conta como 1 atraso.
    // Soma os faltantes nos últimos dias úteis avaliados (esperados − feitos).
    const dias = (j.stats && j.stats.aderenciaDiaria) || [];
    const n = dias.reduce((s, d) => s + Math.max(0, (d.esperados || 0) - (d.feitos || 0)), 0);
    if (n !== _rdoAlertCount) {
      _rdoAlertCount = n;
      try {
        renderSidebar({ force: true });
      } catch (e) {
        /* sidebar ainda não montada */
      }
    }
  } catch (e) {
    /* silencioso — alerta de RDO é best-effort */
  }
}

function renderNavItem(link) {
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

  // Badge de alerta — "pill suave": vermelho (urgente) ou âmbar (atenção).
  // Mostra "9+" acima de 9; a contagem exata fica no tooltip (title).
  let badge = '';
  const a = link.alerta;
  if (a && a.n > 0) {
    const txt = a.n > 9 ? '9+' : String(a.n);
    badge = `<span class="nav-badge-alert${a.vencendo ? ' is-vencendo' : ''}" title="${a.titulo}">${txt}</span>`;
  }

  return `
    <li class="nav-item">
      <a href="${link.href}" class="nav-link" data-tooltip="${link.label}">
        <span class="nav-icon">${link.icon}</span>
        <span class="nav-label">${link.label}</span>
        ${badge}
      </a>
    </li>`;
}

let _sidebarSig = null;
function _sidebarSignature(alertasSig, perfilAtual) {
  const u = auth.user();
  // hash inclui alertas, perfil, usuário e estado dos grupos (que não dependem da rota)
  const groupsState = ['comercial', 'obras', 'rh', 'financeiro']
    .map((k) => (sidebarGroups.get(k) ? '1' : '0'))
    .join('');
  return [
    alertasSig,
    perfilAtual ? perfilAtual.id : '',
    u ? u.id || u.email : '',
    u && u.nivelAcessoId ? '1' : '0',
    groupsState,
  ].join('|');
}

function renderSidebar(opts) {
  const force = opts && opts.force;
  const sidebar = document.getElementById('sidebar');
  const nfAlerts = getNFAlertCount();
  const cpAlerts = getContasPagarAlertCount();
  const recAlerts = getRecursosAlertCount();
  const docAlerts = getDocumentosAlertCount();
  const docAlertDetail = getDocumentosAlertDetail();
  const rdoAlerts = getRdosAlertCount();
  const comprasAlerts = getComprasAlertCount();
  const manutAlerts = getManutencaoAlertCount();
  const frotaAlerts = getFrotaAlertCount();
  const currentHash = location.hash || '#/dashboard';
  const perfilAtual = perfil.get();

  // Mapa de alertas por rota. vencendo=true → âmbar (atenção); false → vermelho (urgente).
  const _plur = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const alertas = {};
  if (nfAlerts > 0)
    alertas['#/notas-fiscais'] = {
      n: nfAlerts,
      vencendo: false,
      titulo: `${_plur(nfAlerts, 'nota fiscal precisando', 'notas fiscais precisando')} de atenção`,
    };
  if (cpAlerts > 0)
    alertas['#/contas-pagar'] = {
      n: cpAlerts,
      vencendo: false,
      titulo: _plur(cpAlerts, 'conta a pagar vencida', 'contas a pagar vencidas'),
    };
  if (recAlerts > 0)
    alertas['#/recursos'] = {
      n: recAlerts,
      vencendo: false,
      titulo: `${_plur(recAlerts, 'recurso precisando', 'recursos precisando')} de atenção`,
    };
  if (docAlerts > 0)
    alertas['#/documentos'] = {
      n: docAlerts,
      vencendo: !(docAlertDetail.vencidos > 0),
      titulo:
        docAlertDetail.vencidos > 0
          ? `${docAlertDetail.vencidos} com documentos vencidos${docAlertDetail.vencendo ? ` (+${docAlertDetail.vencendo} vencendo)` : ''}`
          : `${docAlertDetail.vencendo} com documentos vencendo em 30 dias`,
    };
  if (rdoAlerts > 0)
    alertas['#/rdos'] = {
      n: rdoAlerts,
      vencendo: false,
      titulo: `${_plur(rdoAlerts, 'RDO atrasado', 'RDOs atrasados')} (dias úteis sem lançamento)`,
    };
  if (comprasAlerts > 0)
    alertas['#/solicitacoes-compra'] = {
      n: comprasAlerts,
      vencendo: true,
      titulo: `${_plur(comprasAlerts, 'solicitação de compra', 'solicitações de compra')} em aberto`,
    };
  if (manutAlerts > 0)
    alertas['#/manutencao'] = {
      n: manutAlerts,
      vencendo: true,
      titulo: `${_plur(manutAlerts, 'manutenção', 'manutenções')} em aberto`,
    };
  if (frotaAlerts > 0)
    alertas['#/frota'] = {
      n: frotaAlerts,
      vencendo: false,
      titulo: `${_plur(frotaAlerts, 'veículo', 'veículos')} com manutenção pendente`,
    };

  // Memo: re-renderiza só quando algo muda (alertas, perfil, usuário, grupos).
  const alertasSig = Object.keys(alertas)
    .sort()
    .map((k) => `${k}:${alertas[k].n}:${alertas[k].vencendo ? 'a' : 'r'}`)
    .join(',');
  const sig = _sidebarSignature(alertasSig, perfilAtual);
  if (!force && sidebar && sidebar.innerHTML && sig === _sidebarSig) {
    return;
  }
  _sidebarSig = sig;

  // Grupos da sidebar. alertCount é somado depois, a partir dos links de cada grupo.
  const groups = [
    {
      key: 'comercial',
      label: 'Comercial',
      icon: _ic('briefcase'),
      alertCount: 0,
      btnId: 'btnComercial',
    },
    { key: 'obras', label: 'Obras', icon: _ic('map-pin'), alertCount: 0, btnId: 'btnObras' },
    { key: 'rh', label: 'RH', icon: _ic('users'), alertCount: 0, btnId: 'btnRH' },
    {
      key: 'financeiro',
      label: 'Financeiro',
      icon: _ic('dollar-sign'),
      alertCount: 0,
      btnId: 'btnFinanceiro',
    },
  ];
  const groupLinks = Object.fromEntries(groups.map((g) => [g.key, []]));
  const topLinks = [];
  let configLink = null; // Configuração é renderizada SEMPRE por último, não pela ordem
  let sugestoesLink = null; // Sugestões vai logo acima de Configuração (após os grupos)

  for (const [pattern, config] of Object.entries(routes)) {
    if (!config.label || pattern.includes(':id')) continue;
    if (!perfil.podeAcessar(pattern)) continue;
    const item = {
      href: pattern,
      label: config.label,
      icon: config.icon,
      soon: config.soon || false,
      alerta: alertas[pattern] || null,
    };
    if (pattern === '#/configuracao') {
      configLink = item;
    } else if (pattern === '#/sugestoes') {
      sugestoesLink = item;
    } else if (config.group && groupLinks[config.group]) {
      groupLinks[config.group].push(item);
    } else {
      topLinks.push(item);
    }
  }

  // Soma os alertas de cada grupo — vira o badge no cabeçalho do grupo recolhido.
  groups.forEach((g) => {
    g.alertCount = groupLinks[g.key].reduce((s, l) => s + (l.alerta ? l.alerta.n : 0), 0);
  });

  // Accordion: no máximo um grupo expandido por vez. Prioriza o grupo da
  // rota atual; senão, o primeiro que estiver marcado como aberto.
  const grupoAbertoKey =
    (groups.find((g) => groupLinks[g.key].some((l) => currentHash.startsWith(l.href))) || {}).key ||
    (groups.find((g) => groupLinks[g.key].length && sidebarGroups.get(g.key)) || {}).key ||
    null;

  function renderGroup(g) {
    const links = groupLinks[g.key];
    if (!links.length) return '';
    const open = g.key === grupoAbertoKey;
    return `
      <li class="nav-group-item">
        <button class="nav-group-header" id="${g.btnId}" data-group="${g.key}" data-tooltip="${g.label}" aria-expanded="${open}">
          <span class="nav-icon">${g.icon}</span>
          <span class="nav-group-label">${g.label}</span>
          ${!open && g.alertCount > 0 ? `<span class="nav-badge-alert" title="${g.alertCount} alerta(s) neste grupo">${g.alertCount > 9 ? '9+' : g.alertCount}</span>` : ''}
          <span class="nav-group-arrow ${open ? 'open' : ''}">›</span>
        </button>
        <ul class="nav-group-children ${open ? 'open' : ''}">
          ${links.map((l) => renderNavItem(l)).join('')}
        </ul>
      </li>`;
  }

  // Layout: top-links (Dashboard, Proposta, Contratos…) → grupos (Obras/RH/Financeiro) → Configuração SEMPRE por último.
  const groupsHtml = groups.map(renderGroup).join('');

  const html = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <img src="assets/logo.png" alt="Rhino Manutenções" class="sidebar-logo-img">
      </div>
      <button id="btn-sb-collapse" class="sb-collapse-btn"
              title="Recolher sidebar" aria-label="Recolher sidebar">
        ${_ic('chevrons-left')}
      </button>
    </div>
    <ul class="nav-links">
      ${topLinks.map((l) => renderNavItem(l)).join('')}
      ${groupsHtml}
      ${sugestoesLink ? renderNavItem(sugestoesLink) : ''}
      ${configLink ? renderNavItem(configLink) : ''}
    </ul>
    <div class="sidebar-footer">
      ${
        auth.user()
          ? `
        <button id="btn-logout" class="theme-toggle-btn" title="Sair (${auth.user().email})" data-tooltip="Sair" style="margin-bottom:4px;" aria-label="Sair">
          <span class="theme-toggle-icon">${_ic('log-out')}</span>
          <span style="font-weight:600;">${auth.user().name || auth.user().email}</span>
          <span style="margin-left:auto;font-size:13px;color:var(--color-text-muted);">sair</span>
        </button>
      `
          : ''
      }
      ${
        perfilAtual
          ? // Se o usuário logado tem nivelAcessoId fixo, mostra o nível mas SEM botão de trocar.
            auth.user() && auth.user().nivelAcessoId
            ? `
          <div class="theme-toggle-btn" title="Seu nível de acesso" data-tooltip="${perfilAtual.label}" style="margin-bottom:4px;cursor:default;">
            <span class="theme-toggle-icon" style="font-size:18px;">${window.rhIconOrText(perfilAtual.icon, 18, window.escapeHtml)}</span>
            <span style="color:${perfilAtual.cor};font-weight:600;">${perfilAtual.label}</span>
          </div>
        `
            : `
          <button id="btn-trocar-perfil" class="theme-toggle-btn" title="Trocar perfil" data-tooltip="${perfilAtual.label}" style="margin-bottom:4px;">
            <span class="theme-toggle-icon" style="font-size:18px;">${window.rhIconOrText(perfilAtual.icon, 18, window.escapeHtml)}</span>
            <span style="color:${perfilAtual.cor};font-weight:600;">${perfilAtual.label}</span>
            <span style="margin-left:auto;font-size:15px;color:var(--color-text-muted);">trocar</span>
          </button>
        `
          : ''
      }

      <div class="footer-utils">
        <button id="btn-density" class="theme-toggle-btn" title="Alternar densidade (compacto / padrão / amplo)" data-tooltip="Densidade">
          <span class="theme-toggle-icon" id="btn-density-icon">▥</span>
          <span id="btn-density-label">Padrão</span>
        </button>
        <a href="#/manual" id="btn-manual" class="theme-toggle-btn" title="Abrir Manual do Usuário" data-tooltip="Manual" style="text-decoration:none;">
          <span class="theme-toggle-icon">${_ic('book')}</span>
          <span>Manual</span>
        </a>
      </div>
      <div class="zoom-control" title="Ajustar tamanho da interface">
        <button id="zoom-out" class="zoom-btn" title="Diminuir (menor)">−</button>
        <button id="zoom-label" class="zoom-label" title="Clique para restaurar 100%">${Math.round(getZoom() * 100)}%</button>
        <button id="zoom-in" class="zoom-btn" title="Aumentar (maior)">+</button>
      </div>
      <div class="sidebar-version">v${window.__APP_VERSION__ || '—'}</div>
    </div>
  `;

  sidebar.innerHTML = html;

  // Aplica estado colapsado após re-render (innerHTML limpa listeners)
  applySbCollapsed(getSbCollapsed());
  document.getElementById('btn-sb-collapse')?.addEventListener('click', () => {
    const next = !getSbCollapsed();
    setSbCollapsed(next);
    applySbCollapsed(next);
  });

  // Nav link clicks
  sidebar.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = link.getAttribute('href');
    });
  });

  // Group toggles (genérico — funciona para Obras, RH, Financeiro e novos grupos)
  // Sempre permite toggle, mesmo se há rota ativa dentro do grupo (consistente com Financeiro).
  document.querySelectorAll('.nav-group-header[data-group]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const groupKey = btn.dataset.group;
      const item = btn.closest('.nav-group-item');
      const children = item?.querySelector('.nav-group-children');
      const arrow = item?.querySelector('.nav-group-arrow');
      if (!children || !arrow) return;
      const isOpen = children.classList.contains('open');
      // Accordion: fecha todos os grupos antes de (re)abrir o clicado.
      document.querySelectorAll('.nav-group-item').forEach((it) => {
        it.querySelector('.nav-group-children')?.classList.remove('open');
        it.querySelector('.nav-group-arrow')?.classList.remove('open');
        const hdr = it.querySelector('.nav-group-header[data-group]');
        hdr?.setAttribute('aria-expanded', 'false'); // a11y: estado do acordeão
        const k = hdr?.dataset.group;
        if (k) sidebarGroups.set(k, false);
      });
      if (!isOpen) {
        children.classList.add('open');
        arrow.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        sidebarGroups.set(groupKey, true);
      }
    });
  });

  // Logout
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      if (confirm('Deseja sair?')) await auth.logout();
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

  // (Botão "Tema" removido da sidebar — mudança visível baixa não justificava
  //  ocupar slot do rodapé. A customização ainda existe via FAB oculto se
  //  necessário no futuro.)

  // Densidade da interface — cicla compact / cozy / comfortable
  const btnDensity = document.getElementById('btn-density');
  if (btnDensity && window.UIKit?.density) {
    // Labels curtos pra não estourar a largura do botão na sidebar.
    const _updateDensityLabel = () => {
      const cur = window.UIKit.density.get();
      const icon = cur === 'compact' ? '▤' : cur === 'comfortable' ? '▦' : '▥';
      const label = cur === 'compact' ? 'Compacto' : cur === 'comfortable' ? 'Amplo' : 'Padrão';
      const iconEl = document.getElementById('btn-density-icon');
      const lblEl = document.getElementById('btn-density-label');
      if (iconEl) iconEl.textContent = icon;
      if (lblEl) lblEl.textContent = label;
    };
    _updateDensityLabel();
    btnDensity.addEventListener('click', () => {
      window.UIKit.density.cycle();
      _updateDensityLabel();
    });
  }

  // Zoom controls
  const zIn = document.getElementById('zoom-in');
  const zOut = document.getElementById('zoom-out');
  const zLbl = document.getElementById('zoom-label');
  if (zIn) zIn.addEventListener('click', zoomIn);
  if (zOut) zOut.addEventListener('click', zoomOut);
  if (zLbl) zLbl.addEventListener('click', zoomReset);
}

function updateSidebarActiveState(hash) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && hash.startsWith(href)) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page'); // a11y: marca a página atual
    } else {
      link.classList.remove('active');
      link.removeAttribute('aria-current');
    }
  });

  // Highlight cada group header se algum filho está ativo
  document.querySelectorAll('.nav-group-header[data-group]').forEach((btn) => {
    const groupKey = btn.dataset.group;
    const links = Object.entries(routes)
      .filter(([, c]) => c.group === groupKey && c.label)
      .map(([p]) => p);
    const isActive = links.some((p) => hash.startsWith(p));
    btn.classList.toggle('active', isActive);
  });
}

// ─── View lifecycle: registry de cleanups por view ───
// Views que adicionam listeners ao document/window devem registrar via window.viewLifecycle.onCleanup(fn).
// Tudo é chamado quando a próxima navegação ocorre — evita leak de handlers entre telas.
window.viewLifecycle = (function () {
  let cleanups = [];
  return {
    onCleanup(fn) {
      if (typeof fn === 'function') cleanups.push(fn);
    },
    flush() {
      const arr = cleanups;
      cleanups = [];
      for (const fn of arr) {
        try {
          fn();
        } catch (e) {
          console.warn('viewLifecycle cleanup error:', e);
        }
      }
    },
  };
})();

let _navToken = 0;
async function navigate() {
  // Token incrementa a cada chamada. Operações async checam se ainda são a última.
  const myToken = ++_navToken;
  // Limpa listeners da view anterior antes de montar a próxima
  window.viewLifecycle.flush();
  const hash = location.hash || '#/dashboard';

  // Bloquear rota não permitida para o perfil atual
  if (!perfil.podeAcessar(hash)) {
    if (window.showToast) window.showToast('Seu perfil não tem acesso a essa tela.', 'warn');
    location.hash = perfil.primeiraAba();
    return;
  }

  const match = matchRoute(hash);

  if (!match) {
    location.hash = perfil.primeiraAba();
    return;
  }

  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-spinner" role="status">Carregando…</div>';

  // Lazy: carrega scripts da rota se ainda não tiver view resolvida
  if (!match.view && _lazyManifest[match.pattern]) {
    try {
      await _loadLazyForPattern(match.pattern);
      if (myToken !== _navToken) return; // navegação superada por outra
      match.view = routes[match.pattern].view;
    } catch (e) {
      if (myToken !== _navToken) return;
      console.error('Falha ao carregar módulo da rota', match.pattern, e);
      app.innerHTML =
        '<div class="card"><p class="text-danger">Erro ao carregar módulo. Tente recarregar a página.</p></div>';
      return;
    }
  }

  if (!match.view) {
    location.hash = perfil.primeiraAba();
    return;
  }

  try {
    await match.view.render(match.params);
    if (myToken !== _navToken) return;
  } catch (e) {
    if (myToken !== _navToken) return;
    console.error('Navigation error:', e);
    app.innerHTML =
      '<div class="card"><p class="text-danger">Erro ao carregar página. Tente novamente.</p></div>';
  }

  renderSidebar();
  updateSidebarActiveState(hash);
  // Update document title
  const _titleLabel = match?.config?.label || match?.config?.title;
  document.title = _titleLabel ? `${_titleLabel} | Rhino` : 'Rhino — Gestão Empresarial';
  // Page fade-in
  const _appEl = document.getElementById('app');
  if (_appEl) {
    _appEl.classList.remove('rh-navigating');
    _appEl.offsetWidth; // reflow
    _appEl.classList.add('rh-navigating');
    window.rhAssociateLabels?.(_appEl); // a11y: associa labels↔campos da página
    // a11y: navegação SPA não move o foco nem anuncia a página. Movemos o foco
    // para o início do conteúdo (se a view não focou nada) e anunciamos o título
    // na região aria-live existente — leitores de tela passam a "ver" a troca.
    if (!_appEl.contains(document.activeElement)) {
      _appEl.setAttribute('tabindex', '-1');
      _appEl.focus({ preventScroll: true });
    }
    if (_titleLabel) {
      const _live = document.getElementById('rh-aria-live');
      if (_live) {
        _live.textContent = '';
        setTimeout(() => {
          _live.textContent = _titleLabel;
        }, 60);
      }
    }
  }
}

// ─── Custom confirm modal (replaces native confirm()) ───────────────────────
window.RhinoConfirm = function (
  {
    message,
    title = 'Confirmar',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false,
  } = {},
  onConfirm,
  onCancel
) {
  document.getElementById('rh-confirm-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'rh-confirm-overlay';
  const btnClass = danger ? 'btn btn-danger' : 'btn btn-primary';
  overlay.innerHTML = `
    <div class="modal-overlay" style="z-index:10002;">
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <h2 class="modal-title" style="font-size:17px;">${escapeHtml(title)}</h2>
        </div>
        <div class="modal-content" style="padding:var(--sp-lg) var(--sp-xl);">
          <p style="margin:0;font-size:15px;line-height:1.5;">${escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="rh-confirm-cancel">${escapeHtml(cancelText)}</button>
          <button class="${btnClass}" id="rh-confirm-ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = (confirmed) => {
    overlay.remove();
    confirmed ? onConfirm?.() : onCancel?.();
  };
  overlay.querySelector('#rh-confirm-cancel').addEventListener('click', () => close(false));
  overlay.querySelector('#rh-confirm-ok').addEventListener('click', () => close(true));
  // Focus the confirm button for keyboard accessibility
  setTimeout(() => overlay.querySelector('#rh-confirm-ok')?.focus(), 50);
};

// ─── Global keyboard shortcuts ───────────────────────────────────────────────
let _gPressed = false;
let _gTimer = null;

document.addEventListener('keydown', (e) => {
  // Ctrl+Enter always submits active modal form (even inside inputs)
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const btn = document.querySelector(
      '#btnSalvar:not(:disabled), .modal-footer .btn-primary:not(:disabled)'
    );
    if (btn) {
      e.preventDefault();
      btn.click();
    }
    return;
  }

  // Skip if user is typing in a field (except for Ctrl+Enter above)
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  // Skip if a modal is open (except our custom confirm)
  if (
    document.querySelector('.modal-overlay:not(#rh-confirm-overlay .modal-overlay), .cmdk-overlay')
  )
    return;

  const hash = location.hash;

  // g + key → navigate (g then d=dashboard, c=contratos, f=caixa, r=rdos, q=config, e=estoque)
  if (_gPressed) {
    clearTimeout(_gTimer);
    _gPressed = false;
    const navMap = {
      d: '#/dashboard',
      c: '#/contratos',
      f: '#/caixa',
      r: '#/rdos',
      q: '#/configuracao',
      e: '#/estoque',
      o: '#/obras',
    };
    const dest = navMap[e.key.toLowerCase()];
    if (dest) {
      e.preventDefault();
      location.hash = dest;
    }
    return;
  }

  if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    _gPressed = true;
    _gTimer = setTimeout(() => {
      _gPressed = false;
    }, 900);
    return;
  }

  // ? → shortcuts panel
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    window.RhinoShortcuts?.show?.();
    return;
  }

  // t → toggle theme (already in command palette, also available as shortcut)
  if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    window.toggleTheme?.();
    return;
  }

  // p → modo apresentação
  if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    window.RhinoApresentacao?.toggle?.();
    return;
  }

  // 'n' → Novo Contrato (on contratos list page)
  if (e.key === 'n' && hash === '#/contratos' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    window.Contratos?.showModal?.();
  }
});

// ─── Online / offline banner ─────────────────────────────────────────────────
(function () {
  function showOfflineBar() {
    if (document.getElementById('rh-offline-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'rh-offline-bar';
    bar.className = 'rh-offline-bar';
    bar.textContent = '⚡ Sem conexão — dados podem estar desatualizados';
    document.body.prepend(bar);
  }
  function hideOfflineBar() {
    document.getElementById('rh-offline-bar')?.remove();
  }
  window.addEventListener('online', hideOfflineBar);
  window.addEventListener('offline', showOfflineBar);
  if (!navigator.onLine) showOfflineBar();
})();

// ─── Modo Apresentação (oculta valores monetários) ───────────────────────────
window.RhinoApresentacao = {
  _active: false,
  get active() {
    return this._active;
  },
  toggle() {
    this._active = !this._active;
    document.documentElement.classList.toggle('modo-apresentacao', this._active);
    window.showToast(
      this._active ? 'Modo apresentação ativado — valores ocultos' : 'Modo apresentação desativado',
      'info'
    );
  },
};

// ─── Focus trap utility ──────────────────────────────────────────────────────
window.RhinoFocusTrap = function (container) {
  const sel =
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
  const trap = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...container.querySelectorAll(sel)].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || document.activeElement === container) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  container.addEventListener('keydown', trap);
  return () => container.removeEventListener('keydown', trap);
};

// ─── Shortcuts panel ─────────────────────────────────────────────────────────
window.RhinoShortcuts = {
  show() {
    document.getElementById('rh-shortcuts-overlay')?.remove();
    const sections = [
      {
        title: 'Navegação',
        items: [
          { label: 'Busca global', keys: ['Ctrl', 'K'] },
          { label: 'Dashboard', keys: ['g', 'd'] },
          { label: 'Contratos', keys: ['g', 'c'] },
          { label: 'Caixa', keys: ['g', 'f'] },
          { label: 'RDOs', keys: ['g', 'r'] },
          { label: 'Configurações', keys: ['g', 'q'] },
          { label: 'Obras (mapa)', keys: ['g', 'o'] },
        ],
      },
      {
        title: 'Ações',
        items: [
          { label: 'Novo Contrato (na lista)', keys: ['n'] },
          { label: 'Salvar formulário', keys: ['Ctrl', '↵'] },
          { label: 'Fechar modal', keys: ['Esc'] },
        ],
      },
      {
        title: 'Interface',
        items: [
          { label: 'Alternar tema claro/escuro', keys: ['t'] },
          { label: 'Modo apresentação', keys: ['p'] },
          { label: 'Esta tela de atalhos', keys: ['?'] },
        ],
      },
    ];

    const rowsHtml = (items) =>
      items
        .map(
          (it) => `
      <div class="rh-sc-row">
        <span class="rh-sc-label">${escapeHtml(it.label)}</span>
        <span class="rh-sc-keys">${it.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</span>
      </div>`
        )
        .join('');

    const body = sections
      .map(
        (s) => `
      <div class="rh-sc-section">
        <div class="rh-sc-section-title">${escapeHtml(s.title)}</div>
        ${rowsHtml(s.items)}
      </div>`
      )
      .join('');

    const overlay = document.createElement('div');
    overlay.id = 'rh-shortcuts-overlay';
    overlay.innerHTML = `
      <div class="modal-overlay" style="z-index:10003;">
        <div class="modal" style="max-width:500px;">
          <div class="modal-header">
            <h2 class="modal-title">Atalhos de teclado</h2>
            <button class="modal-close" id="rh-sc-close">✕</button>
          </div>
          <div class="modal-content rh-shortcuts-panel">${body}</div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="rh-sc-close2">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#rh-sc-close').addEventListener('click', close);
    overlay.querySelector('#rh-sc-close2').addEventListener('click', close);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    window.RhinoFocusTrap?.(overlay.querySelector('.modal'));
    setTimeout(() => overlay.querySelector('#rh-sc-close2')?.focus(), 50);
  },
};

// Initialize app
window.addEventListener('hashchange', navigate);
// Expõe pra polish.js (command palette, etc.)
window.routes = routes;
window.toggleTheme = toggleTheme;

// Alerta de RDO no menu: busca /api/rdos no boot e a cada 1 hora (cache).
setTimeout(refreshRdoAlertCount, 2500);
setInterval(refreshRdoAlertCount, 60 * 60 * 1000);

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getTheme());
  applyZoom(getZoom());
  applySbCollapsed(getSbCollapsed());
  // Esconde boot loader assim que o app começa a inicializar
  if (window.RhinoBoot) window.RhinoBoot.done();

  // 0) Reset de senha via URL (?action=reset-password&token=XXX)
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'reset-password' && params.get('token')) {
    await showResetPasswordModal(params.get('token'));
    // Após reset, volta pro fluxo normal de login
  }

  // 1) Autenticação obrigatória
  let user = await auth.loadMe();
  if (!user) {
    const loginResult = await showLoginModal();
    if (loginResult === 'portal') return;
    user = await auth.loadMe();
  }

  // 1.5) LGPD — exige aceite de termos no primeiro login
  if (user && !user.acceptedTermsAt) {
    await showTermosModal();
    user = await auth.loadMe(); // recarrega
  }

  // 2) Carrega níveis e dados (já autenticado)
  await perfil.load();
  await Store.loadAll().catch((err) => console.error('[boot] Store.loadAll falhou', err));

  // 3) Perfil de acesso:
  //    - Se o usuário tem nivel_acesso_id atrelado, aplica direto (sem picker).
  //    - Sem nivel (ex: admin) → permite escolher.
  if (user && user.nivelAcessoId) {
    const nivel = perfil.niveis().find((n) => n.id === user.nivelAcessoId);
    if (nivel) {
      perfil.set(nivel);
      iniciarApp();
      return;
    }
  }
  if (perfil.get()) {
    iniciarApp();
  } else {
    renderSidebar();
    showProfilePicker();
  }
});
