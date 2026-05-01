// Route definitions — icons via rhIcon() (Lucide-style SVG)
const _ic = (n) => (window.rhIcon ? window.rhIcon(n, 18) : '');
const routes = {
  '#/dashboard':    { view: window.Dashboard,      label: 'Dashboard',       icon: _ic('home') },
  '#/proposta':     { view: null,                  label: 'Proposta',        icon: _ic('file-text'), soon: true },
  '#/contratos':    { view: window.Contratos,      label: 'Contratos',       icon: _ic('briefcase') },
  '#/contratos/:id':{ view: window.ContratoDetail, label: null,              icon: null },
  '#/comparativo':  { view: window.Comparativo,   label: null,              icon: null },
  '#/rdos':         { view: window.RDOs,           label: 'RDOs',            icon: _ic('clipboard-check'), group: 'obras' },
  '#/obras':        { view: window.Obras,          label: 'Mapa de Obras',   icon: _ic('map-pin'),         group: 'obras' },
  '#/clientes':     { view: window.Clientes,       label: 'Clientes',        icon: _ic('users'),       group: 'rh' },
  '#/recursos':     { view: window.Recursos,       label: 'Recursos',        icon: _ic('user-plus'),   group: 'rh' },
  '#/documentos':   { view: window.Documentos,     label: 'Documentação',    icon: _ic('file-text'),   group: 'rh' },
  '#/fornecedores': { view: window.Fornecedores,   label: 'Fornecedores',    icon: _ic('truck'),       group: 'rh' },
  '#/caixa':        { view: window.Caixa,          label: 'Caixa',           icon: _ic('wallet'),      group: 'financeiro' },
  '#/contas-pagar': { view: window.ContasPagar,    label: 'Contas a Pagar',  icon: _ic('minus-circle'),group: 'financeiro' },
  '#/notas-fiscais':{ view: window.NotasFiscais,   label: 'Contas a Receber',icon: _ic('receipt'),     group: 'financeiro' },
  '#/socios':       { view: window.Socios,         label: 'Sócios',          icon: _ic('users'),       group: 'financeiro' },
  '#/investimentos':{ view: window.Investimentos,  label: 'Aportes',         icon: _ic('plus-circle'), group: 'financeiro' },
  '#/base':         { view: window.Base,           label: 'BASE',            icon: _ic('database'),    group: 'financeiro' },
  '#/estoque':      { view: window.Estoque,        label: 'Almoxarifado',    icon: _ic('package'),     group: 'obras' },
  '#/previsao':     { view: window.Previsao,        label: 'Previsão',        icon: _ic('trending-up'),  group: 'financeiro' },
  '#/ai-chat':      { view: window.AiChat,         label: 'Assistente IA',   icon: _ic('message-square'), group: 'financeiro' },
  '#/configuracao': { view: window.Configuracao,   label: 'Configuração',    icon: _ic('settings') },
  '#/usuarios':     { view: window.Usuarios,       label: null,              icon: null },  // acessível via Configuração
  '#/auditoria':    { view: window.Auditoria,      label: null,              icon: null },  // acessível via Configuração
  '#/manual':       { view: window.Manual,         label: null,              icon: null }
};

// Sidebar group open/close state (persisted)
const sidebarGroups = {
  get(key) {
    try {
      const v = localStorage.getItem('rhino-group-' + key);
      return v === null ? true : JSON.parse(v);
    } catch { localStorage.removeItem('rhino-group-' + key); return true; }
  },
  set(key, val) {
    localStorage.setItem('rhino-group-' + key, JSON.stringify(val));
  },
  toggle(key) {
    this.set(key, !this.get(key));
  }
};

// ─── Perfil de Acesso ───
// ─── Autenticação ───
const auth = {
  _user: null,
  user() { return this._user; },
  async loadMe() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) { this._user = null; return null; }
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
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10000;
      display:flex;align-items:center;justify-content:center;
      background:var(--color-bg);
    `;
    let mode = 'login'; // login | forgot
    const draw = () => {
      overlay.innerHTML = mode === 'forgot' ? `
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
      ` : `
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
        const pwdBtn   = document.getElementById('togglePwd');
        if (pwdInput && pwdBtn) {
          pwdBtn.addEventListener('click', () => {
            const showing = pwdInput.type === 'text';
            pwdInput.type = showing ? 'password' : 'text';
            pwdBtn.innerHTML = window.rhIcon ? window.rhIcon(showing ? 'eye' : 'eye-off', 18) : (showing ? '👁' : '🙈');
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
        document.getElementById('goForgot').addEventListener('click', (e) => { e.preventDefault(); mode = 'forgot'; draw(); });
      }
      if (forgotForm) {
        const msg = document.getElementById('forgotMsg');
        forgotForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(forgotForm);
          try {
            const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fd.get('email') }) });
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
        document.getElementById('backToLogin').addEventListener('click', (e) => { e.preventDefault(); mode = 'login'; draw(); });
      }
    };
    document.body.appendChild(overlay);
    draw();
  });
}

// Tela de redefinição de senha — abre quando URL tem ?action=reset-password&token=XXX
async function showResetPasswordModal(token) {
  return new Promise(resolve => {
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
        const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: p1 }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Erro ao redefinir');
        msg.style.display = 'block';
        msg.style.background = 'rgba(16,185,129,.1)';
        msg.style.color = '#065f46';
        msg.textContent = 'Senha redefinida! Você já pode fazer login com a nova senha.';
        // Limpa query string
        history.replaceState({}, '', location.pathname);
        setTimeout(() => { overlay.remove(); resolve(); }, 1500);
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
  return new Promise(resolve => {
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
      const r = await fetch('/api/niveis-acesso').then(res => res.json());
      this._niveis = r.niveis || [];
    } catch { this._niveis = []; }
  },

  get() {
    try { return JSON.parse(sessionStorage.getItem('rhino-perfil') || 'null'); } catch { return null; }
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
    return p ? (p.abas || []) : null;
  },

  // Verifica se uma rota é permitida
  podeAcessar(route) {
    const abas = this.abas();
    if (!abas) return true;
    // Rotas de detalhe (ex: #/contratos/123) seguem a permissão da rota pai
    const base = route.replace(/(#\/[^/]+).*/, '$1');
    // Rotas universais — qualquer perfil autenticado pode abrir
    // (controle fino fica em cada tela, ex: ver/editar)
    const universais = ['#/manual', '#/usuarios', '#/rdos', '#/auditoria', '#/estoque', '#/comparativo'];
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
    // Detalhe (#/contratos/123) usa permissão da rota pai
    const base = route.replace(/(#\/[^/]+).*/, '$1');
    return abas.includes('edit:' + base);
  },

  // Verifica se uma sub-aba dentro do contrato está liberada para este perfil.
  // Convenção: abas com prefixo "contrato-tab:" no array niveis.abas.
  // Se o perfil não tem NENHUMA contrato-tab configurada, libera todas (compat).
  podeContractTab(tabKey) {
    const abas = this.abas();
    if (!abas) return true; // sem perfil → tudo liberado
    // Sub-abas universais (adicionadas depois do cadastro inicial dos perfis):
    if (['cronograma'].includes(tabKey)) return true;
    const contractTabs = abas.filter(a => typeof a === 'string' && a.startsWith('contrato-tab:'));
    if (contractTabs.length === 0) return true; // nada configurado → tudo liberado (legado)
    return contractTabs.includes('contrato-tab:' + tabKey);
  },

  // Primeira sub-aba do contrato liberada
  primeiraContractTab() {
    const ordem = ['visao', 'financeiro', 'cronograma', 'equipe', 'rdo', 'pendencias'];
    return ordem.find(k => this.podeContractTab(k)) || 'visao';
  },

  // Primeira aba acessível (para redirecionar após seleção)
  primeiraAba() {
    const abas = this.abas();
    if (!abas || abas.length === 0) return '#/dashboard';
    return abas[0];
  },

  niveis() { return this._niveis; }
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

// ─── Sidebar collapse ───
const SB_COLLAPSE_KEY = 'rhino-sb-collapsed';

function getSbCollapsed() {
  try { return localStorage.getItem(SB_COLLAPSE_KEY) === '1'; } catch { return false; }
}
function setSbCollapsed(v) {
  try { localStorage.setItem(SB_COLLAPSE_KEY, v ? '1' : '0'); } catch {}
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
  return localStorage.getItem('rhino-theme') || 'light';
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

function zoomIn()  { applyZoom(getZoom() + ZOOM_STEP); }
function zoomOut() { applyZoom(getZoom() - ZOOM_STEP); }
function zoomReset() { applyZoom(1); }

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

function getRecursosAlertCount() {
  try {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diasAviso = 10; // alerta se folga em ≤ 10 dias e passagem não comprada
    return (Store.state.recursos || []).filter(r => {
      if (r.status !== 'funcionario' || !r.alocacaoAtual?.dataInicio) return false;
      const ciclo   = parseInt(r.alocacaoAtual.cicloTrabalho) || 21;
      const folgas  = (r.folgas || []).sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
      const base    = folgas[0]?.dataFim ? new Date(folgas[0].dataFim + 'T12:00:00') : new Date(r.alocacaoAtual.dataInicio + 'T12:00:00');
      const proxima = new Date(base); proxima.setDate(proxima.getDate() + ciclo);
      const dias    = Math.ceil((proxima - hoje) / 86400000);
      if (dias > diasAviso) return false;
      // Verifica se passagem ida ainda não foi comprada
      const ultimaFolga = folgas[0];
      const passagemComprada = ultimaFolga && ultimaFolga.passagemIda?.comprada;
      return !passagemComprada;
    }).length;
  } catch { return 0; }
}

// Conta colaboradores ativos com problema documental:
// vencidos (já passou) — alerta vermelho
// vencendo (até 30 dias) — alerta amarelo
function getDocumentosAlertCount() {
  try {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let vencidos = 0, vencendo = 0;
    (Store.state.recursos || []).filter(r => r.status === 'funcionario').forEach(r => {
      let temVencido = false, temVencendo = false;
      for (const doc of (r.documentos || [])) {
        if (!doc.dataVencimento) continue;
        const dias = Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000);
        if (dias < 0) temVencido = true;
        else if (dias <= 30) temVencendo = true;
      }
      if (temVencido) vencidos++;
      else if (temVencendo) vencendo++; // só conta como "vencendo" se ainda não tem nenhum vencido
    });
    return vencidos + vencendo; // total — usado em groupAlertCount
  } catch { return 0; }
}

// Detalhe (vencidos vs vencendo) — usado na badge da Documentação para escolher cor
function getDocumentosAlertDetail() {
  try {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let vencidos = 0, vencendo = 0;
    (Store.state.recursos || []).filter(r => r.status === 'funcionario').forEach(r => {
      let temVencido = false, temVencendo = false;
      for (const doc of (r.documentos || [])) {
        if (!doc.dataVencimento) continue;
        const dias = Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000);
        if (dias < 0) temVencido = true;
        else if (dias <= 30) temVencendo = true;
      }
      if (temVencido) vencidos++;
      else if (temVencendo) vencendo++;
    });
    return { vencidos, vencendo, total: vencidos + vencendo };
  } catch { return { vencidos: 0, vencendo: 0, total: 0 }; }
}

function getContasPagarAlertCount() {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    return (Store.state.contas_pagar || []).filter(c =>
      c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hoje
    ).length;
  } catch { return 0; }
}

function renderNavItem(link, nfAlerts, cpAlerts, recAlerts) {
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
  } else if (link.href === '#/recursos' && recAlerts > 0) {
    badge = `<span class="nav-badge-alert">${recAlerts}</span>`;
  } else if (link.href === '#/documentos' && link.docAlerts > 0) {
    // Cor diferente: vermelho se há vencidos, amarelo se só vencendo
    const det = link.docAlertDetail || { vencidos: 0, vencendo: 0 };
    const cor = det.vencidos > 0 ? 'var(--color-danger)' : '#F59E0B';
    const titulo = det.vencidos > 0
      ? `${det.vencidos} colaborador${det.vencidos !== 1 ? 'es' : ''} com docs vencidos${det.vencendo ? ` (+${det.vencendo} vencendo)` : ''}`
      : `${det.vencendo} colaborador${det.vencendo !== 1 ? 'es' : ''} com docs vencendo nos próximos 30 dias`;
    badge = `<span class="nav-badge-alert" style="background:${cor};" title="${titulo}">${link.docAlerts}</span>`;
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

function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  const nfAlerts  = getNFAlertCount();
  const cpAlerts  = getContasPagarAlertCount();
  const recAlerts = getRecursosAlertCount();
  const docAlerts = getDocumentosAlertCount();
  const docAlertDetail = getDocumentosAlertDetail();
  const currentHash = location.hash || '#/dashboard';
  const perfilAtual = perfil.get();

  // Definição de grupos da sidebar (RH e Financeiro). Cada grupo é dropdown.
  const groups = [
    { key: 'obras',      label: 'Obras',      icon: _ic('map-pin'),     alertCount: 0,                     btnId: 'btnObras' },
    { key: 'rh',         label: 'RH',         icon: _ic('users'),       alertCount: recAlerts + docAlerts, btnId: 'btnRH' },
    { key: 'financeiro', label: 'Financeiro', icon: _ic('dollar-sign'), alertCount: nfAlerts + cpAlerts,   btnId: 'btnFinanceiro' },
  ];
  const groupLinks = Object.fromEntries(groups.map(g => [g.key, []]));
  const topLinks = [];
  let configLink = null; // Configuração é renderizada SEMPRE por último, não pela ordem

  for (const [pattern, config] of Object.entries(routes)) {
    if (!config.label || pattern.includes(':id')) continue;
    if (!perfil.podeAcessar(pattern)) continue;
    const item = { href: pattern, label: config.label, icon: config.icon, soon: config.soon || false, docAlerts: pattern === '#/documentos' ? docAlerts : 0, docAlertDetail: pattern === '#/documentos' ? docAlertDetail : null };
    if (pattern === '#/configuracao') {
      configLink = item;
    } else if (config.group && groupLinks[config.group]) {
      groupLinks[config.group].push(item);
    } else {
      topLinks.push(item);
    }
  }

  function renderGroup(g) {
    const links = groupLinks[g.key];
    if (!links.length) return '';
    // Respeita estritamente a preferência do usuário (default: aberto).
    // Antes forçava aberto quando havia rota ativa, ignorando o toggle.
    const isOpen = sidebarGroups.get(g.key);
    const isActive = links.some(l => currentHash.startsWith(l.href));
    const open = isOpen;
    return `
      <li class="nav-group-item">
        <button class="nav-group-header" id="${g.btnId}" data-group="${g.key}" data-tooltip="${g.label}">
          <span class="nav-icon">${g.icon}</span>
          <span class="nav-group-label">${g.label}</span>
          ${!open && g.alertCount > 0 ? `<span class="nav-badge-alert">${g.alertCount}</span>` : ''}
          <span class="nav-group-arrow ${open ? 'open' : ''}">›</span>
        </button>
        <ul class="nav-group-children ${open ? 'open' : ''}">
          ${links.map(l => renderNavItem(l, nfAlerts, cpAlerts, recAlerts)).join('')}
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
      ${topLinks.map(l => renderNavItem(l, nfAlerts, cpAlerts, recAlerts)).join('')}
      ${groupsHtml}
      ${configLink ? renderNavItem(configLink, nfAlerts, cpAlerts, recAlerts) : ''}
    </ul>
    <div class="sidebar-footer">
      ${auth.user() ? `
        <button id="btn-logout" class="theme-toggle-btn" title="Sair (${auth.user().email})" data-tooltip="Sair" style="margin-bottom:4px;" aria-label="Sair">
          <span class="theme-toggle-icon">${_ic('log-out')}</span>
          <span style="font-weight:600;">${auth.user().name || auth.user().email}</span>
          <span style="margin-left:auto;font-size:13px;color:var(--color-text-muted);">sair</span>
        </button>
      ` : ''}
      ${perfilAtual ? (
        // Se o usuário logado tem nivelAcessoId fixo, mostra o nível mas SEM botão de trocar.
        auth.user() && auth.user().nivelAcessoId ? `
          <div class="theme-toggle-btn" title="Seu nível de acesso" style="margin-bottom:4px;cursor:default;">
            <span style="font-size:15px;">${perfilAtual.icon}</span>
            <span style="color:${perfilAtual.cor};font-weight:600;">${perfilAtual.label}</span>
          </div>
        ` : `
          <button id="btn-trocar-perfil" class="theme-toggle-btn" title="Trocar perfil" data-tooltip="${perfilAtual.label}" style="margin-bottom:4px;">
            <span style="font-size:15px;">${perfilAtual.icon}</span>
            <span style="color:${perfilAtual.cor};font-weight:600;">${perfilAtual.label}</span>
            <span style="margin-left:auto;font-size:15px;color:var(--color-text-muted);">trocar</span>
          </button>
        `
      ) : ''}

      <a href="#/manual" id="btn-manual" class="theme-toggle-btn" title="Abrir Manual do Usuário" data-tooltip="Manual" style="text-decoration:none;">
        <span class="theme-toggle-icon">${_ic('book')}</span>
        <span>Manual</span>
      </a>
      <div class="zoom-control" title="Ajustar tamanho da interface">
        <button id="zoom-out" class="zoom-btn" title="Diminuir (menor)">−</button>
        <button id="zoom-label" class="zoom-label" title="Clique para restaurar 100%">${Math.round(getZoom()*100)}%</button>
        <button id="zoom-in" class="zoom-btn" title="Aumentar (maior)">+</button>
      </div>
      <div class="sidebar-version">v1.0.0</div>
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
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = link.getAttribute('href');
    });
  });

  // Group toggles (genérico — funciona para Obras, RH, Financeiro e novos grupos)
  // Sempre permite toggle, mesmo se há rota ativa dentro do grupo (consistente com Financeiro).
  document.querySelectorAll('.nav-group-header[data-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupKey = btn.dataset.group;
      const item = btn.closest('.nav-group-item');
      const children = item?.querySelector('.nav-group-children');
      const arrow = item?.querySelector('.nav-group-arrow');
      if (!children || !arrow) return;
      const isOpen = children.classList.contains('open');
      if (isOpen) {
        children.classList.remove('open');
        arrow.classList.remove('open');
        sidebarGroups.set(groupKey, false);
      } else {
        children.classList.add('open');
        arrow.classList.add('open');
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


  // Zoom controls
  const zIn  = document.getElementById('zoom-in');
  const zOut = document.getElementById('zoom-out');
  const zLbl = document.getElementById('zoom-label');
  if (zIn)  zIn.addEventListener('click', zoomIn);
  if (zOut) zOut.addEventListener('click', zoomOut);
  if (zLbl) zLbl.addEventListener('click', zoomReset);
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

  // Highlight cada group header se algum filho está ativo
  document.querySelectorAll('.nav-group-header[data-group]').forEach(btn => {
    const groupKey = btn.dataset.group;
    const links = Object.entries(routes)
      .filter(([, c]) => c.group === groupKey && c.label)
      .map(([p]) => p);
    const isActive = links.some(p => hash.startsWith(p));
    btn.classList.toggle('active', isActive);
  });
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
    app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar página. Tente novamente.</p></div>';
  }

  renderSidebar();
  updateSidebarActiveState(hash);
}

// Initialize app
window.addEventListener('hashchange', navigate);
// Expõe pra polish.js (command palette, etc.)
window.routes = routes;
window.toggleTheme = toggleTheme;

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
    await showLoginModal();
    user = await auth.loadMe();
  }

  // 1.5) LGPD — exige aceite de termos no primeiro login
  if (user && !user.acceptedTermsAt) {
    await showTermosModal();
    user = await auth.loadMe(); // recarrega
  }

  // 2) Carrega níveis e dados (já autenticado)
  await perfil.load();
  await Store.loadAll();

  // 3) Perfil de acesso:
  //    - Se o usuário tem nivel_acesso_id atrelado, aplica direto (sem picker).
  //    - Sem nivel (ex: admin) → permite escolher.
  if (user && user.nivelAcessoId) {
    const nivel = perfil.niveis().find(n => n.id === user.nivelAcessoId);
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
