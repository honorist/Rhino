window.Configuracao = {
  currentSection: 'tipos_custo',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();
      await Store.loadNiveisAcesso();
      await Store.loadDocTemplates();

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">⚙️ Configurações</h1>
            <p class="page-subtitle">Personalize seu sistema</p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:240px 1fr;gap:var(--sp-lg);align-items:start;">
          <!-- Menu lateral de seções -->
          <nav class="card" style="padding:var(--sp-sm);position:sticky;top:var(--sp-md);">
            ${this.renderMenuItem('tipos_custo', '🏷️', 'Tipos de Custo')}
            ${this.renderMenuItem('niveis_acesso', '🔐', 'Níveis de Acesso')}
            ${this.renderMenuItem('doc_templates', '📋', 'Templates de Docs')}
            ${this.renderMenuItem('arquivos', '📁', 'Arquivos do Sistema')}
            <a href="#/usuarios" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;text-decoration:none;color:var(--color-text);margin-top:4px;border-top:1px solid var(--color-border);padding-top:14px;">
              <span style="display:inline-flex;align-items:center;color:var(--rh-ink-500);">${window.rhIcon ? window.rhIcon('user-plus', 16) : ''}</span><span>Usuários e Logins</span>
            </a>
            <a href="#/auditoria" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;text-decoration:none;color:var(--color-text);">
              <span style="display:inline-flex;align-items:center;color:var(--rh-ink-500);">${window.rhIcon ? window.rhIcon('eye', 16) : ''}</span><span>Auditoria</span>
            </a>
          </nav>

          <!-- Conteúdo da seção -->
          <div id="configContent">
            ${this.currentSection === 'tipos_custo'    ? this.renderTiposCusto() : ''}
            ${this.currentSection === 'niveis_acesso'  ? this.renderNiveisAcesso() : ''}
            ${this.currentSection === 'doc_templates'  ? this.renderDocTemplates() : ''}
            ${this.currentSection === 'arquivos'       ? this.renderArquivos() : ''}
          </div>
        </div>
      `;

      app.innerHTML = html;

      document.querySelectorAll('.config-menu-item').forEach(btn => {
        btn.addEventListener('click', e => {
          this.currentSection = e.currentTarget.dataset.section;
          this.render();
        });
      });

      this.attachListeners();
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar configurações. Tente novamente.</p></div>';
    }
  },

  renderMenuItem(key, icon, label) {
    const active = this.currentSection === key;
    return `
      <button class="config-menu-item" data-section="${key}" style="display:flex;align-items:center;gap:var(--sp-sm);width:100%;padding:var(--sp-sm) var(--sp-md);border:none;background:${active ? 'var(--color-primary)' : 'transparent'};color:${active ? '#fff' : 'var(--color-text)'};border-radius:6px;cursor:pointer;font-size:15px;font-weight:${active ? '600' : '500'};text-align:left;">
        <span style="font-size:16px;">${icon}</span>
        <span>${label}</span>
      </button>
    `;
  },

  renderTiposCusto() {
    const tipos = Store.state.tipos_base || [];
    const usoContagem = {};
    (Store.state.base || []).forEach(i => {
      usoContagem[i.type] = (usoContagem[i.type] || 0) + 1;
    });

    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">🏷️ Tipos de Custo</h2>
          <p class="page-subtitle">Classificação de custos usados em BASE e Aportes</p>
        </div>
        <button class="btn btn-primary" id="btnNovoTipo">+ Novo Tipo</button>
      </div>

      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);">
        <div style="font-size:15px;">
          <strong>ℹ️ Sobre tipos de custo:</strong> Use esta área para cadastrar as categorias de custos que seu negócio utiliza.
          Elas aparecem nos formulários de <strong>BASE</strong> e <strong>Aportes</strong>.
          Tipos do <strong>sistema</strong> não podem ser excluídos. Customizados só podem ser excluídos se não estiverem em uso.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Tipos Cadastrados</h3>
          <span style="font-size:15px;color:var(--color-text-muted);">${tipos.length} tipo${tipos.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ícone</th>
                <th>Nome</th>
                <th>Chave</th>
                <th>Cor</th>
                <th>Origem</th>
                <th style="text-align:right;">Em uso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${tipos.map(t => {
                const uso = usoContagem[t.key] || 0;
                return `
                  <tr>
                    <td style="font-size:22px;">${t.icon}</td>
                    <td><strong>${t.label}</strong></td>
                    <td><code style="font-size:15px;background:var(--color-bg);padding:2px 6px;border-radius:3px;">${t.key}</code></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:var(--sp-sm);">
                        <div style="width:22px;height:22px;border-radius:4px;background:${t.cor};border:1px solid var(--color-border);"></div>
                        <span style="font-size:15px;color:var(--color-text-muted);font-family:monospace;">${t.cor}</span>
                      </div>
                    </td>
                    <td>
                      ${t.sistema
                        ? `<span class="badge" style="background:rgba(113,128,150,.15);color:#718096;">🔒 Sistema</span>`
                        : `<span class="badge" style="background:rgba(56,161,105,.15);color:#38A169;">✨ Customizado</span>`}
                    </td>
                    <td style="text-align:right;font-weight:${uso > 0 ? '700' : '400'};color:${uso > 0 ? 'var(--color-info)' : 'var(--color-text-muted)'};">
                      ${uso} ${uso !== 1 ? 'itens' : 'item'}
                    </td>
                    <td>
                      <div class="actions-cell">
                        <a class="action-link btn-editar-tipo" data-id="${t.id}">Editar</a>
                        ${!t.sistema ? `<a class="action-link danger btn-excluir-tipo" data-id="${t.id}">Excluir</a>` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  renderNiveisAcesso() {
    const niveis = Store.state.niveis_acesso || [];
    const ic = (n) => window.rhIcon ? window.rhIcon(n, 14) : '';
    // Estrutura: páginas com sub-itens internos aninhados (children).
    // Os children têm prefixo 'contrato-tab:' e ficam indentados sob a página pai.
    const todasAbas = [
      { route: '#/dashboard',     label: 'Dashboard',       icon: ic('home'),            grupo: 'Principal' },
      { route: '#/contratos',     label: 'Contratos',       icon: ic('briefcase'),       grupo: 'Principal',
        children: [
          { route: 'contrato-tab:visao',      label: 'Aba Visão Geral',  icon: ic('eye') },
          { route: 'contrato-tab:financeiro', label: 'Aba Financeiro',   icon: ic('dollar-sign') },
          { route: 'contrato-tab:equipe',     label: 'Aba Equipe',       icon: ic('users') },
          { route: 'contrato-tab:rdo',        label: 'Aba RDO',          icon: ic('clipboard-check') },
          { route: 'contrato-tab:pendencias', label: 'Aba Pendências',   icon: ic('alert-triangle') },
        ] },
      { route: '#/rdos',          label: 'RDOs (todos)',    icon: ic('clipboard-check'), grupo: 'Obras' },
      { route: '#/obras',         label: 'Mapa de Obras',   icon: ic('map-pin'),         grupo: 'Obras' },
      { route: '#/base',          label: 'BASE',            icon: ic('database'),        grupo: 'Financeiro' },
      { route: '#/clientes',      label: 'Clientes',        icon: ic('users'),           grupo: 'RH' },
      { route: '#/fornecedores',  label: 'Fornecedores',    icon: ic('truck'),           grupo: 'RH' },
      { route: '#/recursos',      label: 'Recursos',        icon: ic('user-plus'),       grupo: 'RH' },
      { route: '#/documentos',    label: 'Documentação',    icon: ic('file-text'),       grupo: 'RH' },
      { route: '#/caixa',         label: 'Caixa',           icon: ic('wallet'),          grupo: 'Financeiro' },
      { route: '#/contas-pagar',  label: 'Contas a Pagar',  icon: ic('minus-circle'),    grupo: 'Financeiro' },
      { route: '#/notas-fiscais', label: 'Notas Fiscais',   icon: ic('receipt'),         grupo: 'Financeiro' },
      { route: '#/socios',        label: 'Sócios',          icon: ic('users'),           grupo: 'Financeiro' },
      { route: '#/investimentos', label: 'Aportes',         icon: ic('plus-circle'),     grupo: 'Financeiro' },
      { route: '#/configuracao',  label: 'Configuração',    icon: ic('settings'),        grupo: 'Sistema' },
      { route: '#/usuarios',      label: 'Usuários',        icon: ic('user-plus'),       grupo: 'Sistema' },
      { route: '#/auditoria',     label: 'Auditoria',       icon: ic('eye'),             grupo: 'Sistema' },
      { route: 'special:nao-ver-valores', label: 'Ocultar valores monetários (R$)', icon: ic('eye-off'), grupo: 'Restrições especiais' },
    ];

    const grupos = ['Principal', 'Obras', 'RH', 'Financeiro', 'Sistema', 'Restrições especiais'];

    const renderRow = (nivel, aba, indented) => {
      const verRoute = aba.route;
      const editRoute = 'edit:' + aba.route;
      const verChecked  = (nivel.abas || []).includes(verRoute);
      const editChecked = (nivel.abas || []).includes(editRoute);
      const isSpecial = aba.route.startsWith('special:') || aba.route.startsWith('contrato-tab:');
      // Itens especiais (special:/contrato-tab:) são apenas flags binárias — não têm coluna Editar
      return `
        <div style="display:grid;grid-template-columns:1fr 60px 60px;gap:8px;align-items:center;padding:6px var(--sp-sm);${indented ? 'padding-left:32px;' : ''}border-radius:5px;transition:background .12s;"
             onmouseenter="this.style.background='var(--color-bg)'"
             onmouseleave="this.style.background='transparent'">
          <div style="display:flex;align-items:center;gap:var(--sp-sm);min-width:0;">
            <span style="display:inline-flex;align-items:center;color:var(--rh-ink-500);min-width:20px;">${aba.icon}</span>
            <span style="font-size:14px;font-weight:${verChecked ? '600' : '400'};color:${verChecked ? 'var(--color-text)' : 'var(--color-text-muted)'};">${aba.label}</span>
          </div>
          <label style="display:flex;justify-content:center;cursor:pointer;" title="Pode ver ${aba.label}">
            <input type="checkbox" class="nivel-checkbox"
                   data-nivel="${nivel.id}" data-route="${verRoute}"
                   ${verChecked ? 'checked' : ''}
                   style="width:15px;height:15px;accent-color:${nivel.cor};cursor:pointer;">
          </label>
          ${isSpecial ? '<span></span>' : `
            <label style="display:flex;justify-content:center;cursor:${verChecked ? 'pointer' : 'not-allowed'};opacity:${verChecked ? '1' : '0.3'};" title="Pode editar / criar / excluir em ${aba.label}">
              <input type="checkbox" class="nivel-checkbox"
                     data-nivel="${nivel.id}" data-route="${editRoute}"
                     ${editChecked ? 'checked' : ''}
                     ${verChecked ? '' : 'disabled'}
                     style="width:15px;height:15px;accent-color:${nivel.cor};cursor:${verChecked ? 'pointer' : 'not-allowed'};">
            </label>
          `}
        </div>
      `;
    };

    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">🔐 Níveis de Acesso</h2>
          <p class="page-subtitle">Configure quais abas cada perfil pode visualizar</p>
        </div>
      </div>

      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);">
        <div style="font-size:15px;">
          <strong>ℹ️ Como funciona:</strong> Marque as abas que cada nível pode acessar. Salve cada perfil separadamente.
          Esta configuração define o menu lateral visível para cada tipo de usuário.
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--sp-lg);">
        ${niveis.map(nivel => `
          <div class="card" style="border-top:3px solid ${nivel.cor};">
            <div class="card-header" style="padding-bottom:var(--sp-md);">
              <div style="display:flex;align-items:center;gap:var(--sp-sm);">
                <span style="font-size:24px;">${nivel.icon}</span>
                <div>
                  <h3 style="margin:0;font-size:16px;font-weight:700;color:${nivel.cor};">${nivel.label}</h3>
                  <div style="font-size:15px;color:var(--color-text-muted);">
                    ${(nivel.abas || []).length} aba${(nivel.abas || []).length !== 1 ? 's' : ''} habilitada${(nivel.abas || []).length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:var(--sp-xs);" id="nivel-${nivel.id}">
              <!-- Cabeçalho das colunas -->
              <div style="display:grid;grid-template-columns:1fr 60px 60px;gap:8px;padding:0 var(--sp-sm) 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--rh-ink-500);border-bottom:1px solid var(--color-border);margin-bottom:6px;">
                <span></span>
                <span style="text-align:center;" title="Pode visualizar a aba">Ver</span>
                <span style="text-align:center;" title="Pode criar / editar / excluir">Editar</span>
              </div>
              ${grupos.map(grupo => {
                const abasGrupo = todasAbas.filter(a => a.grupo === grupo);
                return `
                  <div style="margin-bottom:var(--sp-sm);">
                    <div class="rh-label" style="padding:var(--sp-xs) 0;border-bottom:1px solid var(--color-border);margin-bottom:var(--sp-xs);">${grupo}</div>
                    ${abasGrupo.map(aba => `
                      ${renderRow(nivel, aba, false)}
                      ${(aba.children || []).map(child => renderRow(nivel, child, true)).join('')}
                    `).join('')}
                  </div>
                `;
              }).join('')}
            </div>

            <div style="padding-top:var(--sp-md);border-top:1px solid var(--color-border);margin-top:var(--sp-sm);">
              <button class="btn btn-primary btn-salvar-nivel" data-nivel="${nivel.id}" style="width:100%;background:${nivel.cor};border-color:${nivel.cor};">
                Salvar ${nivel.label}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  attachListeners() {
    // Níveis de acesso — atualizar label do checkbox ao marcar/desmarcar
    document.querySelectorAll('.nivel-checkbox').forEach(cb => {
      cb.addEventListener('change', e => {
        const label = e.target.closest('label');
        const span = label?.querySelectorAll('span')[1];
        if (span) {
          span.style.fontWeight = e.target.checked ? '600' : '400';
          span.style.color = e.target.checked ? 'var(--color-text)' : 'var(--color-text-muted)';
        }
      });
    });

    // Salvar nível de acesso
    document.querySelectorAll('.btn-salvar-nivel').forEach(btn => {
      btn.addEventListener('click', async e => {
        const nivelId = e.target.dataset.nivel;
        const checkboxes = document.querySelectorAll(`.nivel-checkbox[data-nivel="${nivelId}"]`);
        const abas = [...checkboxes].filter(c => c.checked).map(c => c.dataset.route);
        try {
          await Store.updateNivelAcesso(nivelId, abas);
          window.showToast('Nível de acesso salvo', 'success');
        } catch (err) { window.showToast(err.message, 'error'); }
      });
    });

    const btnNovo = document.getElementById('btnNovoTipo');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalTipo());

    document.querySelectorAll('.btn-editar-tipo').forEach(btn => {
      btn.addEventListener('click', e => this.showModalTipo(e.target.dataset.id));
    });
    document.querySelectorAll('.btn-excluir-tipo').forEach(btn => {
      btn.addEventListener('click', e => this.deleteTipo(e.target.dataset.id));
    });

    if (this.currentSection === 'doc_templates') this.attachDocTemplateListeners();
    if (this.currentSection === 'arquivos') this.attachArquivosListeners();
  },

  showModalTipo(tipoId) {
    const tipo = tipoId ? Store.state.tipos_base.find(t => t.id === tipoId) : null;
    const title = tipo ? 'Editar Tipo de Custo' : 'Novo Tipo de Custo';

    const cores = ['#7C3AED', '#D97706', '#059669', '#3182CE', '#D69E2E', '#E53E3E', '#0891B2', '#DB2777', '#2E7D52', '#718096', '#F59E0B', '#10B981'];
    const icones = ['👷', '📦', '🚗', '📌', '📊', '🔹', '💻', '🏢', '📱', '⚡', '🔧', '💰', '🏭', '📑', '🎨', '🔌', '🛠️', '📞', '☕', '🧾', '🚚', '✈️'];

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:580px;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formTipo" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome do Tipo *</label>
              <input class="form-control" name="label" value="${tipo?.label || ''}" placeholder="Ex: Software, Licença, Consultoria..." required>
              ${tipo?.sistema ? '<div class="form-helper">🔒 Tipo do sistema — a chave não pode ser alterada</div>' : ''}
            </div>

            <div class="form-group">
              <label class="form-label">Ícone</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;padding:var(--sp-sm);border:1px solid var(--color-border);border-radius:6px;max-height:120px;overflow-y:auto;">
                ${icones.map(ic => `
                  <button type="button" class="btn-icone" data-icone="${ic}" style="width:36px;height:36px;font-size:18px;border:2px solid ${tipo?.icon === ic ? 'var(--color-primary)' : 'transparent'};background:${tipo?.icon === ic ? 'rgba(46,125,82,.1)' : 'transparent'};border-radius:6px;cursor:pointer;">${ic}</button>
                `).join('')}
              </div>
              <input type="hidden" name="icon" value="${tipo?.icon || '🔹'}">
            </div>

            <div class="form-group">
              <label class="form-label">Cor</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${cores.map(c => `
                  <button type="button" class="btn-cor" data-cor="${c}" style="width:32px;height:32px;border-radius:50%;background:${c};border:${tipo?.cor === c ? '3px solid var(--color-text)' : '2px solid var(--color-border)'};cursor:pointer;"></button>
                `).join('')}
              </div>
              <input type="hidden" name="cor" value="${tipo?.cor || '#718096'}">
            </div>

            <div style="margin-top:var(--sp-lg);padding:var(--sp-md);background:var(--color-bg);border-radius:6px;">
              <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;margin-bottom:var(--sp-sm);">Preview</div>
              <div style="display:flex;align-items:center;gap:var(--sp-sm);">
                <span id="prevIcon" style="font-size:24px;">${tipo?.icon || '🔹'}</span>
                <span id="prevBadge" class="badge" style="background:${tipo?.cor || '#718096'}22;color:${tipo?.cor || '#718096'};">
                  <span id="prevLabel">${tipo?.label || 'Novo Tipo'}</span>
                </span>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarTipo">${tipo ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const inputLabel = document.querySelector('[name=label]');
    const inputIcon  = document.querySelector('[name=icon]');
    const inputCor   = document.querySelector('[name=cor]');
    const prevIcon   = document.getElementById('prevIcon');
    const prevLabel  = document.getElementById('prevLabel');
    const prevBadge  = document.getElementById('prevBadge');

    const atualizarPreview = () => {
      prevIcon.textContent = inputIcon.value;
      prevLabel.textContent = inputLabel.value || 'Novo Tipo';
      prevBadge.style.background = inputCor.value + '22';
      prevBadge.style.color = inputCor.value;
    };
    inputLabel.addEventListener('input', atualizarPreview);

    document.querySelectorAll('.btn-icone').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.btn-icone').forEach(b => { b.style.border = '2px solid transparent'; b.style.background = 'transparent'; });
        e.currentTarget.style.border = '2px solid var(--color-primary)';
        e.currentTarget.style.background = 'rgba(46,125,82,.1)';
        inputIcon.value = e.currentTarget.dataset.icone;
        atualizarPreview();
      });
    });

    document.querySelectorAll('.btn-cor').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.btn-cor').forEach(b => { b.style.border = '2px solid var(--color-border)'; });
        e.currentTarget.style.border = '3px solid var(--color-text)';
        inputCor.value = e.currentTarget.dataset.cor;
        atualizarPreview();
      });
    });

    document.getElementById('btnSalvarTipo').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formTipo'));
      const data = { label: fd.get('label'), icon: fd.get('icon'), cor: fd.get('cor') };
      if (!data.label || !data.label.trim()) { window.showToast('Informe o nome do tipo', 'error'); return; }
      try {
        if (tipo) await Store.updateTipoBase(tipoId, data);
        else await Store.createTipoBase(data);
        window.showToast(tipo ? 'Tipo atualizado' : 'Tipo criado', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async deleteTipo(id) {
    if (!confirm('Excluir este tipo de custo?')) return;
    try {
      await Store.deleteTipoBase(id);
      window.showToast('Tipo excluído', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  // ── TEMPLATES DE DOCUMENTAÇÃO ──────────────────────────────────────────────
  TIPOS_DOC_TPL: [
    { key: 'ASO',     label: 'ASO — Atestado de Saúde Ocupacional' },
    { key: 'PGR',     label: 'PGR — Prog. Gerenciamento de Riscos' },
    { key: 'PCMSO',   label: 'PCMSO — Prog. Controle Médico de Saúde' },
    { key: 'NR10',    label: 'NR-10 — Segurança em Eletricidade' },
    { key: 'NR12',    label: 'NR-12 — Segurança em Máquinas' },
    { key: 'NR18',    label: 'NR-18 — Construção Civil' },
    { key: 'NR20',    label: 'NR-20 — Líquidos Combustíveis' },
    { key: 'NR33',    label: 'NR-33 — Espaço Confinado' },
    { key: 'NR35',    label: 'NR-35 — Trabalho em Altura' },
    { key: 'CIPA',    label: 'CIPA — Comissão Interna de Prevenção' },
    { key: 'BRIGADA', label: 'Brigada de Incêndio' },
    { key: 'CNH',     label: 'CNH — Habilitação' },
    { key: 'OUTRO',   label: 'Outro' },
  ],

  renderDocTemplates() {
    const templates = Store.state.doc_templates || [];
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo');

    const rows = templates.length === 0
      ? `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--sp-xl);">Nenhum template cadastrado</td></tr>`
      : templates.map(t => {
          const contrato = contratos.find(c => c.id === t.empresaId);
          const tipoLabel = this.TIPOS_DOC_TPL.find(x => x.key === t.tipoDocumento)?.label || t.tipoDocumento || '—';
          return `<tr>
            <td><strong>${escapeHtml(t.nome)}</strong></td>
            <td style="font-size:15px;">${escapeHtml(tipoLabel)}</td>
            <td style="font-size:15px;">${contrato ? escapeHtml(contrato.name) : '<span style="color:var(--color-text-muted);">Todos</span>'}</td>
            <td style="font-size:15px;">${t.periodicidadeMeses || 12} meses</td>
            <td>
              <div class="actions-cell">
                <a class="action-link btn-edit-tpl" data-id="${t.id}">Editar</a>
                <a class="action-link danger btn-del-tpl" data-id="${t.id}">Excluir</a>
              </div>
            </td>
          </tr>`;
        }).join('');

    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">📋 Templates de Documentação</h2>
          <p class="page-subtitle">Checklists de validação por tipo de documento e empresa</p>
        </div>
        <button class="btn btn-primary" id="btnNovoTemplate">+ Novo Template</button>
      </div>

      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);">
        <div style="font-size:15px;">
          <strong>ℹ️ Sobre templates:</strong> Templates definem quais campos são obrigatórios em cada tipo de documento para uma empresa específica.
          Quando a validação com IA estiver ativa, esses checklists serão usados para verificar a conformidade automaticamente.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Templates Cadastrados</h3>
          <span style="font-size:15px;color:var(--color-text-muted);">${templates.length} template${templates.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo de Documento</th>
                <th>Empresa / Contrato</th>
                <th>Periodicidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  attachDocTemplateListeners() {
    const btnNovo = document.getElementById('btnNovoTemplate');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalTemplate(null));
    document.querySelectorAll('.btn-edit-tpl').forEach(b =>
      b.addEventListener('click', e => this.showModalTemplate(e.target.dataset.id)));
    document.querySelectorAll('.btn-del-tpl').forEach(b =>
      b.addEventListener('click', e => this.deleteTemplate(e.target.dataset.id)));
  },

  showModalTemplate(templateId) {
    const t = templateId ? (Store.state.doc_templates || []).find(x => x.id === templateId) : null;
    const contratos = (Store.state.contracts || []).filter(c => c.status === 'ativo');
    const checklist = t ? (t.checklist || []) : [];

    const tiposOptions = this.TIPOS_DOC_TPL.map(x =>
      `<option value="${x.key}" ${t?.tipoDocumento === x.key ? 'selected' : ''}>${x.label}</option>`
    ).join('');
    const contratosOptions = contratos.map(c =>
      `<option value="${c.id}" ${t?.empresaId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('');

    const renderChecklist = (items) => items.map((item, i) => `
      <div class="checklist-item" data-index="${i}" style="display:flex;gap:var(--sp-sm);align-items:center;margin-bottom:var(--sp-sm);">
        <input class="form-control" style="flex:1;" value="${escapeHtml(item.campo || '')}" placeholder="Campo obrigatório..." data-field="campo">
        <label style="display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:15px;cursor:pointer;">
          <input type="checkbox" ${item.obrigatorio ? 'checked' : ''} data-field="obrigatorio"> Obrigatório
        </label>
        <button type="button" class="btn btn-sm btn-ghost btn-rm-item" data-index="${i}" style="padding:2px 8px;color:#DC2626;">✕</button>
      </div>
    `).join('');

    const html = `
      <div class="modal-overlay" id="modalTplOverlay">
        <div class="modal" style="width:600px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${t ? 'Editar Template' : 'Novo Template'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formTemplate" class="modal-content">

            <div class="form-group">
              <label class="form-label">Nome do Template *</label>
              <input class="form-control" name="nome" value="${escapeHtml(t?.nome || '')}" placeholder="Ex: ASO Padrão CMPC" required>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo de Documento *</label>
                <select class="form-control" name="tipoDocumento" required>
                  <option value="">— Selecione —</option>
                  ${tiposOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Periodicidade (meses)</label>
                <input class="form-control" name="periodicidadeMeses" type="number" min="1" max="120" value="${t?.periodicidadeMeses || 12}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Empresa / Contrato (opcional)</label>
              <select class="form-control" name="empresaId">
                <option value="">Todos os contratos</option>
                ${contratosOptions}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                <span>Checklist de Campos Obrigatórios</span>
                <button type="button" class="btn btn-sm btn-ghost" id="btnAddItem">+ Adicionar Campo</button>
              </label>
              <div id="checklistContainer">
                ${renderChecklist(checklist)}
              </div>
              ${checklist.length === 0 ? `<p style="font-size:15px;color:var(--color-text-muted);">Nenhum campo adicionado. Clique em "+ Adicionar Campo" para inserir itens do checklist.</p>` : ''}
            </div>

            <div style="display:flex;gap:var(--sp-sm);justify-content:flex-end;margin-top:var(--sp-lg);">
              <button type="button" class="btn btn-ghost" id="btnCancelarTpl">Cancelar</button>
              <button type="submit" class="btn btn-primary">${t ? 'Salvar Alterações' : 'Criar Template'}</button>
            </div>
          </form>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalTplOverlay');
    const container = document.getElementById('checklistContainer');
    let items = [...checklist];

    const refreshChecklist = () => {
      container.innerHTML = renderChecklist(items);
      container.querySelectorAll('.btn-rm-item').forEach(b =>
        b.addEventListener('click', e => {
          items.splice(parseInt(e.target.dataset.index), 1);
          refreshChecklist();
        }));
    };

    refreshChecklist();

    document.getElementById('btnAddItem').addEventListener('click', () => {
      items.push({ campo: '', obrigatorio: true });
      refreshChecklist();
    });

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarTpl').addEventListener('click', close);

    document.getElementById('formTemplate').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);

      const checklistAtual = [];
      container.querySelectorAll('.checklist-item').forEach(row => {
        const campo = row.querySelector('[data-field="campo"]').value.trim();
        const obrigatorio = row.querySelector('[data-field="obrigatorio"]').checked;
        if (campo) checklistAtual.push({ campo, obrigatorio });
      });

      const payload = {
        nome:               fd.get('nome'),
        tipoDocumento:      fd.get('tipoDocumento'),
        empresaId:          fd.get('empresaId') || null,
        periodicidadeMeses: parseInt(fd.get('periodicidadeMeses')) || 12,
        checklist:          checklistAtual,
      };

      try {
        if (t) await Store.updateDocTemplate(templateId, payload);
        else await Store.createDocTemplate(payload);
        window.showToast(t ? 'Template atualizado' : 'Template criado', 'success');
        close();
        this.render();
      } catch (err) { window.showToast(err.message, 'error'); }
    });
  },

  async deleteTemplate(id) {
    if (!confirm('Excluir este template?')) return;
    try {
      await Store.deleteDocTemplate(id);
      window.showToast('Template excluído', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  // ─── Arquivos do Sistema ───
  _arquivosData: { arquivos: [], totalBytes: 0, count: 0 },
  _arquivosFiltro: '',

  _formatBytes(b) {
    const n = Number(b) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  },

  renderArquivos() {
    return `
      <div id="arquivosLoading" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
        Carregando arquivos do sistema...
      </div>
      <div id="arquivosContent" style="display:none;"></div>
    `;
  },

  async attachArquivosListeners() {
    try {
      const r = await fetch('/api/admin/arquivos');
      if (!r.ok) throw new Error(await r.text());
      this._arquivosData = await r.json();
    } catch (e) {
      const div = document.getElementById('arquivosContent');
      if (div) div.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar arquivos: ${escapeHtml(e.message)}</p></div>`;
      const ld = document.getElementById('arquivosLoading'); if (ld) ld.style.display = 'none';
      const ct = document.getElementById('arquivosContent'); if (ct) ct.style.display = 'block';
      return;
    }
    this._desenharArquivos();
  },

  _desenharArquivos() {
    const ld = document.getElementById('arquivosLoading');
    const ct = document.getElementById('arquivosContent');
    if (!ct) return;
    if (ld) ld.style.display = 'none';
    ct.style.display = 'block';

    const { arquivos, totalBytes, count } = this._arquivosData;
    const filtro = (this._arquivosFiltro || '').toLowerCase().trim();
    const filtrados = filtro
      ? arquivos.filter(a =>
          (a.filename || '').toLowerCase().includes(filtro) ||
          (a.recursoNome || '').toLowerCase().includes(filtro) ||
          (a.tipoDoc || '').toLowerCase().includes(filtro))
      : arquivos;

    const fmtData = (s) => s ? new Date(s).toLocaleString('pt-BR') : '—';

    ct.innerHTML = `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">📁 Arquivos do Sistema</h2>
          <p class="page-subtitle" style="margin:4px 0 0 0;">
            ${count} arquivo${count !== 1 ? 's' : ''} · Total: <strong>${this._formatBytes(totalBytes)}</strong>
          </p>
        </div>
      </div>

      <div class="card" style="padding:var(--sp-lg);margin-bottom:var(--sp-md);">
        <input class="form-control" id="inputBuscaArquivos"
          placeholder="🔎 Buscar por nome do arquivo, pessoa ou tipo..."
          value="${escapeHtml(this._arquivosFiltro)}">
      </div>

      ${filtrados.length === 0 ? `
        <div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
          ${arquivos.length === 0
            ? 'Nenhum arquivo anexado ainda. Anexe documentos via Recursos → Documentação.'
            : 'Nenhum arquivo encontrado para o filtro.'}
        </div>
      ` : `
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="overflow-x:auto;">
            <table class="table" style="margin:0;">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Pessoa</th>
                  <th>Tipo</th>
                  <th style="text-align:right;">Tamanho</th>
                  <th>Enviado em</th>
                  <th style="text-align:center;width:200px;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtrados.map(a => `
                  <tr>
                    <td style="word-break:break-all;max-width:300px;">
                      <span style="font-size:18px;margin-right:6px;">${(a.mimeType || '').includes('pdf') ? '📄' : '🖼️'}</span>
                      <span style="font-family:monospace;font-size:13px;">${escapeHtml(a.filename)}</span>
                    </td>
                    <td>${escapeHtml(a.recursoNome || '—')}</td>
                    <td><span class="badge" style="background:var(--color-surface-2);">${escapeHtml(a.tipoDoc || '—')}</span></td>
                    <td style="text-align:right;font-family:monospace;">${this._formatBytes(a.sizeBytes)}</td>
                    <td style="font-size:13px;color:var(--color-text-muted);">${fmtData(a.createdAt)}</td>
                    <td style="text-align:center;">
                      <a href="/api/recursos/${a.recursoId}/documentos/${a.docId}/arquivo"
                         target="_blank"
                         class="btn btn-sm btn-secondary"
                         style="text-decoration:none;margin-right:4px;">⬇️ Baixar</a>
                      <button class="btn btn-sm btn-danger btn-excluir-arq"
                        data-rid="${a.recursoId}" data-did="${a.docId}" data-fn="${escapeHtml(a.filename)}">🗑️</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    `;

    const inp = document.getElementById('inputBuscaArquivos');
    if (inp) {
      inp.addEventListener('input', (e) => {
        this._arquivosFiltro = e.target.value;
        this._desenharArquivos();
        const inp2 = document.getElementById('inputBuscaArquivos');
        if (inp2) { inp2.focus(); inp2.setSelectionRange(inp2.value.length, inp2.value.length); }
      });
    }
    document.querySelectorAll('.btn-excluir-arq').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fn = btn.dataset.fn;
        if (!confirm(`Excluir o arquivo "${fn}"? O registro do documento permanece, apenas o anexo é removido.`)) return;
        try {
          const r = await fetch(`/api/recursos/${btn.dataset.rid}/documentos/${btn.dataset.did}/arquivo`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('Arquivo excluído', 'success');
          await this.attachArquivosListeners();
        } catch (e) {
          window.showToast('Erro ao excluir: ' + e.message, 'error');
        }
      });
    });
  }
};
