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
            ${this.renderMenuItem('backup', '💾', 'Backup do Sistema')}
            ${this.renderMenuItem('feature_flags', '🚀', 'Feature Flags')}
            ${this.renderMenuItem('notificacoes', '🔔', 'Notificações Push')}
            ${this.renderMenuItem('lgpd', '🔒', 'Privacidade (LGPD)')}
            ${this.renderMenuItem('tour', '🗺️', 'Tour Guiado')}
            ${this.renderMenuItem('atualizacoes', '🆕', 'Atualizações')}
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
            ${this.currentSection === 'backup'         ? this.renderBackup() : ''}
            ${this.currentSection === 'feature_flags'  ? '<div id="featureFlagsSection"><div class="loading-spinner">Carregando…</div></div>' : ''}
            ${this.currentSection === 'notificacoes'   ? this.renderNotificacoesPush() : ''}
            ${this.currentSection === 'lgpd'           ? this.renderLgpd() : ''}
            ${this.currentSection === 'tour'           ? this.renderTour() : ''}
            ${this.currentSection === 'atualizacoes'   ? this.renderAtualizacoes() : ''}
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
    if (this.currentSection === 'feature_flags') this.attachFeatureFlagsListeners();
    if (this.currentSection === 'notificacoes') this.attachPushListeners();
    if (this.currentSection === 'atualizacoes') this.loadAtualizacoes();

    const btnLgpd = document.getElementById('btnLgpdDelete');
    if (btnLgpd) {
      btnLgpd.addEventListener('click', async () => {
        if (!confirm('Tem certeza? Esta ação anonimiza seus dados e encerra sua sessão.')) return;
        try {
          const r = await fetch('/api/lgpd/delete-account', { method: 'POST', credentials: 'same-origin' });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          window.showToast(d.message, 'success');
          setTimeout(() => { window.location.href = '/'; }, 2000);
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    }

    const btnTour = document.getElementById('btnRestarTour');
    if (btnTour) {
      btnTour.addEventListener('click', () => {
        if (window.RhinoTour) RhinoTour.start(true);
        else window.showToast('Tour não disponível', 'warn');
      });
    }
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

    // Padrão rigoroso (metadata JSONB) — usado pela IA pra validar uploads
    const meta = t?.metadata || {};
    const secoesIniciais  = Array.isArray(meta.secoes) ? meta.secoes : [];
    const camposIniciais  = Array.isArray(meta.campos) ? meta.campos : [];
    const visuaisIniciais = Array.isArray(meta.elementos_visuais) ? meta.elementos_visuais : [];
    const instrIniciais   = meta.instrucoes_extras || '';

    const renderSecoes = (arr) => arr.map((s, i) => `
      <div class="secao-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <span style="width:30px;font-weight:700;color:var(--color-text-muted);">${i+1}.</span>
        <input class="form-control" data-f="nome" style="flex:1;" placeholder="Ex: Cabeçalho com logo" value="${escapeHtml(s.nome || '')}">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap;"><input type="checkbox" data-f="obrigatorio" ${s.obrigatorio !== false ? 'checked' : ''}>Obrig.</label>
        <button type="button" class="btn btn-sm btn-ghost rm-secao" style="color:#DC2626;">✕</button>
      </div>
    `).join('');

    const renderCampos = (arr) => arr.map((c, i) => `
      <div class="campo-row" data-i="${i}" style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:6px;align-items:center;margin-bottom:6px;">
        <input class="form-control" data-f="nome" placeholder="Ex: CPF" value="${escapeHtml(c.nome || '')}">
        <input class="form-control" data-f="regex" placeholder="Regex (opcional) ex: \\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}" value="${escapeHtml(c.regex || '')}" style="font-family:monospace;font-size:12px;">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap;"><input type="checkbox" data-f="obrigatorio" ${c.obrigatorio !== false ? 'checked' : ''}>Obrig.</label>
        <button type="button" class="btn btn-sm btn-ghost rm-campo" style="color:#DC2626;">✕</button>
      </div>
    `).join('');

    const renderVisuais = (arr) => arr.map((v, i) => `
      <div class="visual-row" data-i="${i}" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <input class="form-control" data-f="descricao" style="flex:1;" placeholder="Ex: Assinatura do médico, Carimbo, Foto 3x4" value="${escapeHtml(v.descricao || '')}">
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap;"><input type="checkbox" data-f="obrigatorio" ${v.obrigatorio !== false ? 'checked' : ''}>Obrig.</label>
        <button type="button" class="btn btn-sm btn-ghost rm-visual" style="color:#DC2626;">✕</button>
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

            <details class="form-group" style="border:1px solid var(--color-border);border-radius:8px;padding:var(--sp-md);margin-top:var(--sp-md);" ${(secoesIniciais.length || camposIniciais.length || visuaisIniciais.length) ? 'open' : ''}>
              <summary style="cursor:pointer;font-weight:700;font-size:15px;color:#7C3AED;">🤖 Padrão rigoroso de validação (IA verifica os uploads)</summary>
              <div style="margin-top:var(--sp-md);font-size:13px;color:var(--color-text-muted);">
                Quando o colaborador subir um arquivo com este template selecionado, o sistema usa Claude Vision pra checar automaticamente se o documento atende aos itens abaixo. Deixe vazio se quiser apenas o checklist manual.
              </div>

              <div style="margin-top:var(--sp-md);">
                <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Seções esperadas (em ordem)</span>
                  <button type="button" class="btn btn-sm btn-ghost" id="btnAddSecao">+ Adicionar seção</button>
                </label>
                <div id="secoesContainer">${renderSecoes(secoesIniciais)}</div>
              </div>

              <div style="margin-top:var(--sp-md);">
                <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Campos a extrair (com regex opcional)</span>
                  <button type="button" class="btn btn-sm btn-ghost" id="btnAddCampo">+ Adicionar campo</button>
                </label>
                <div id="camposContainer">${renderCampos(camposIniciais)}</div>
              </div>

              <div style="margin-top:var(--sp-md);">
                <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                  <span>Elementos visuais (assinatura, carimbo, foto…)</span>
                  <button type="button" class="btn btn-sm btn-ghost" id="btnAddVisual">+ Adicionar elemento</button>
                </label>
                <div id="visuaisContainer">${renderVisuais(visuaisIniciais)}</div>
              </div>

              <div style="margin-top:var(--sp-md);">
                <label class="form-label">Instruções extras pra IA</label>
                <textarea class="form-control" name="instrucoesExtras" rows="2" placeholder="Ex: 'Verificar se atende NR-7. Recusar se vencido há mais de 1 mês.'">${escapeHtml(instrIniciais)}</textarea>
              </div>
            </details>

            <div class="form-group" style="border-top:1px solid var(--color-border);padding-top:var(--sp-md);margin-top:var(--sp-sm);">
              <label class="form-label" style="display:flex;justify-content:space-between;">
                <span>📋 Corpo do Documento (para Gerar PDF por contrato)</span>
                <span style="font-size:12px;color:var(--color-text-muted);">Variáveis: {{cliente}}, {{contrato}}, {{valor}}, {{inicio}}, {{fim}}, {{data}}</span>
              </label>
              <textarea class="form-control" name="body" rows="8" style="font-family:monospace;font-size:13px;" placeholder="CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nCliente: {{cliente}}\nContrato: {{contrato}}\nValor: {{valor}}\n...">${this._escHtml(t?.body || '')}</textarea>
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

    // Padrão rigoroso (metadata) — listas mutáveis
    let secoesArr  = [...secoesIniciais];
    let camposArr  = [...camposIniciais];
    let visuaisArr = [...visuaisIniciais];

    const refreshSecoes = () => {
      const c = document.getElementById('secoesContainer');
      c.innerHTML = renderSecoes(secoesArr);
      c.querySelectorAll('.rm-secao').forEach(b => b.addEventListener('click', e => {
        const i = +e.target.closest('.secao-row').dataset.i;
        secoesArr.splice(i, 1); refreshSecoes();
      }));
    };
    const refreshCampos = () => {
      const c = document.getElementById('camposContainer');
      c.innerHTML = renderCampos(camposArr);
      c.querySelectorAll('.rm-campo').forEach(b => b.addEventListener('click', e => {
        const i = +e.target.closest('.campo-row').dataset.i;
        camposArr.splice(i, 1); refreshCampos();
      }));
    };
    const refreshVisuais = () => {
      const c = document.getElementById('visuaisContainer');
      c.innerHTML = renderVisuais(visuaisArr);
      c.querySelectorAll('.rm-visual').forEach(b => b.addEventListener('click', e => {
        const i = +e.target.closest('.visual-row').dataset.i;
        visuaisArr.splice(i, 1); refreshVisuais();
      }));
    };
    refreshSecoes(); refreshCampos(); refreshVisuais();
    document.getElementById('btnAddSecao').addEventListener('click', () => { secoesArr.push({ nome: '', obrigatorio: true }); refreshSecoes(); });
    document.getElementById('btnAddCampo').addEventListener('click', () => { camposArr.push({ nome: '', regex: '', obrigatorio: true }); refreshCampos(); });
    document.getElementById('btnAddVisual').addEventListener('click', () => { visuaisArr.push({ descricao: '', obrigatorio: true }); refreshVisuais(); });

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

      // Coleta padrão rigoroso atual do DOM (após edições)
      const secoesAtual = [];
      document.querySelectorAll('#secoesContainer .secao-row').forEach((r, i) => {
        const nome = r.querySelector('[data-f="nome"]').value.trim();
        const obrig = r.querySelector('[data-f="obrigatorio"]').checked;
        if (nome) secoesAtual.push({ ordem: i + 1, nome, obrigatorio: obrig });
      });
      const camposAtual = [];
      document.querySelectorAll('#camposContainer .campo-row').forEach(r => {
        const nome  = r.querySelector('[data-f="nome"]').value.trim();
        const regex = r.querySelector('[data-f="regex"]').value.trim();
        const obrig = r.querySelector('[data-f="obrigatorio"]').checked;
        if (nome) camposAtual.push({ nome, regex: regex || null, obrigatorio: obrig });
      });
      const visuaisAtual = [];
      document.querySelectorAll('#visuaisContainer .visual-row').forEach(r => {
        const desc  = r.querySelector('[data-f="descricao"]').value.trim();
        const obrig = r.querySelector('[data-f="obrigatorio"]').checked;
        if (desc) visuaisAtual.push({ descricao: desc, obrigatorio: obrig });
      });
      const metadata = {
        secoes: secoesAtual,
        campos: camposAtual,
        elementos_visuais: visuaisAtual,
        instrucoes_extras: (fd.get('instrucoesExtras') || '').trim(),
      };

      const payload = {
        nome:               fd.get('nome'),
        tipoDocumento:      fd.get('tipoDocumento'),
        empresaId:          fd.get('empresaId') || null,
        periodicidadeMeses: parseInt(fd.get('periodicidadeMeses')) || 12,
        checklist:          checklistAtual,
        metadata,
        body:               fd.get('body') || null,
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

  renderBackup() {
    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">💾 Backup do Sistema</h2>
          <p class="page-subtitle" style="margin:4px 0 0 0;">Baixe um snapshot completo dos dados</p>
        </div>
      </div>

      <div class="card" style="padding:var(--sp-xl);max-width:720px;">
        <div style="display:flex;align-items:start;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
          <div style="font-size:48px;line-height:1;">💾</div>
          <div style="flex:1;">
            <h3 style="margin:0 0 8px 0;font-size:17px;">Backup completo (JSON)</h3>
            <p style="margin:0;color:var(--color-text-muted);font-size:14px;line-height:1.6;">
              Inclui contratos, RDOs, organograma, saídas, caixa, contas a pagar/receber,
              recursos (sem senhas), clientes, fornecedores, BASE, sócios, aportes e configurações.
              <strong>Não inclui</strong> arquivos anexados (PDFs/imagens) — esses são armazenados separados no banco.
            </p>
          </div>
        </div>

        <div style="padding:var(--sp-md);background:rgba(245,158,11,.08);border-left:3px solid #F59E0B;border-radius:6px;margin-bottom:var(--sp-lg);font-size:13px;line-height:1.6;">
          <strong style="color:#92400E;">⚠️ Atenção:</strong> O arquivo contém dados sensíveis (CPFs, salários, valores).
          Guarde em local seguro e não compartilhe externamente. Recomendado: 1 backup/semana.
        </div>

        <a href="/api/backup/download" class="btn btn-primary" download style="text-decoration:none;display:inline-flex;align-items:center;gap:8px;">
          <span>⬇️</span> Baixar backup agora
        </a>

        <div style="margin-top:var(--sp-xl);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
          <h4 style="margin:0 0 8px 0;font-size:14px;">Como restaurar?</h4>
          <p style="margin:0;color:var(--color-text-muted);font-size:13px;line-height:1.6;">
            Use <code style="background:var(--color-surface-2);padding:1px 6px;border-radius:3px;">scripts/migrate-json-to-pg.js</code>
            apontando para o JSON baixado. O Postgres do Railway também faz snapshot automático
            (Database → Settings → Backups).
          </p>
        </div>
      </div>
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
  },

  // ── F18: Feature Flags ──
  async attachFeatureFlagsListeners() {
    const section = document.getElementById('featureFlagsSection');
    if (!section) return;
    try {
      const r = await fetch('/api/feature-flags', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const { flags } = await r.json();
      section.innerHTML = `
        <div class="page-header" style="margin-bottom:var(--sp-lg);">
          <div><h2 style="font-size:20px;font-weight:700;">🚀 Feature Flags</h2>
          <p class="page-subtitle">Ative ou desative funcionalidades sem deploy</p></div>
        </div>
        <div class="card">
          ${flags.map(f => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-md) 0;border-bottom:1px solid var(--color-border);">
              <div>
                <div style="font-weight:600;">${this._escHtml(f.key)}</div>
                <div style="font-size:14px;color:var(--color-text-muted);">${this._escHtml(f.description || '')}</div>
              </div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <div class="rh-toggle ${f.enabled ? 'rh-toggle--on' : ''}" data-flag="${this._escHtml(f.key)}" style="
                  width:44px;height:24px;border-radius:12px;
                  background:${f.enabled ? 'var(--color-primary)' : 'var(--color-border)'};
                  position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;
                ">
                  <div style="
                    position:absolute;top:2px;left:${f.enabled ? '22px' : '2px'};
                    width:20px;height:20px;border-radius:50%;background:#fff;
                    transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3);
                  "></div>
                </div>
                <span style="font-weight:600;color:${f.enabled ? 'var(--color-success)' : 'var(--color-text-muted)'};">${f.enabled ? 'Ativo' : 'Inativo'}</span>
              </label>
            </div>
          `).join('')}
        </div>
      `;

      section.querySelectorAll('.rh-toggle').forEach(toggle => {
        toggle.addEventListener('click', async () => {
          const key = toggle.dataset.flag;
          const isOn = toggle.classList.contains('rh-toggle--on');
          try {
            const r = await fetch(`/api/feature-flags/${encodeURIComponent(key)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: !isOn }),
              credentials: 'same-origin',
            });
            if (!r.ok) throw new Error(await r.text());
            window.showToast(`${key}: ${!isOn ? 'ativado' : 'desativado'}`, 'success');
            await this.attachFeatureFlagsListeners();
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });
    } catch (e) {
      section.innerHTML = `<div class="card"><p class="text-danger">Erro: ${this._escHtml(e.message)}</p></div>`;
    }
  },

  // ── F13: LGPD ──
  renderLgpd() {
    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div><h2 style="font-size:20px;font-weight:700;">🔒 Privacidade (LGPD)</h2>
        <p class="page-subtitle">Seus direitos sobre os dados pessoais</p></div>
      </div>
      <div class="card" style="margin-bottom:var(--sp-md);">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">Exportar meus dados</h3>
        <p style="color:var(--color-text-muted);font-size:15px;margin-bottom:12px;">Baixe um arquivo JSON com todos os seus dados pessoais armazenados no sistema.</p>
        <a href="/api/lgpd/export" class="btn btn-secondary" download>⬇️ Exportar dados (JSON)</a>
      </div>
      <div class="card" style="border:1px solid #FECACA;">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;color:#991B1B;">Excluir minha conta</h3>
        <p style="color:var(--color-text-muted);font-size:15px;margin-bottom:12px;">
          Anonimiza seus dados pessoais e encerra sua sessão. <strong>Esta ação é irreversível.</strong>
          Dados financeiros e contratos associados são preservados para fins legais.
        </p>
        <button class="btn btn-danger" id="btnLgpdDelete">🗑️ Solicitar exclusão de dados</button>
      </div>
    `;
  },

  // ── Tour Guiado ──
  renderTour() {
    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div><h2 style="font-size:20px;font-weight:700;">🗺️ Tour Guiado</h2>
        <p class="page-subtitle">Revisitar o tour de boas-vindas</p></div>
      </div>
      <div class="card">
        <p style="color:var(--color-text-muted);font-size:15px;margin-bottom:16px;">
          Relembre as principais funcionalidades do Rhino com o tour interativo de boas-vindas.
        </p>
        <button class="btn btn-primary" id="btnRestarTour">🚀 Iniciar Tour</button>
      </div>
    `;
  },

  // ── Atualizações (changelog em linguagem leiga) ───────────────────────────
  renderAtualizacoes() {
    const versaoAtual = (window.__APP_VERSION__ || '');
    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">🆕 Atualizações</h2>
          <p class="page-subtitle">O que mudou em cada versão do sistema</p>
        </div>
        <div style="font-size:13px;color:var(--color-text-muted);">
          Versão atual: <strong style="color:var(--color-primary);">${escapeHtml(versaoAtual || '—')}</strong>
        </div>
      </div>
      <div id="changelogContent" class="card">
        <div class="loading-spinner">Carregando histórico…</div>
      </div>
    `;
  },

  async loadAtualizacoes() {
    const box = document.getElementById('changelogContent');
    if (!box) return;
    try {
      const res = await fetch('/changelog.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const entries = (data.entries || []);
      if (!entries.length) {
        box.innerHTML = '<p style="color:var(--color-text-muted);">Nenhuma atualização registrada ainda.</p>';
        return;
      }
      const versaoAtual = (window.__APP_VERSION__ || '').replace(/^v/, '');
      box.innerHTML = entries.map(e => {
        const isAtual = e.version === versaoAtual;
        const dataFmt = e.date ? this._fmtDataChangelog(e.date) : '';
        return `
          <div style="padding:14px 0;border-bottom:1px solid var(--color-border);">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
              <strong style="font-size:17px;color:var(--color-primary);">v${escapeHtml(e.version)}</strong>
              ${isAtual ? '<span style="background:var(--color-success);color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;">ATUAL</span>' : ''}
              ${dataFmt ? `<span style="color:var(--color-text-muted);font-size:13px;">${escapeHtml(dataFmt)}</span>` : ''}
            </div>
            ${e.summary ? `<div style="font-weight:600;margin-bottom:8px;font-size:15px;">${escapeHtml(e.summary)}</div>` : ''}
            <ul style="margin:0;padding-left:20px;color:var(--color-text);font-size:14px;line-height:1.6;">
              ${(e.changes || []).map(c => `<li style="margin-bottom:4px;">${escapeHtml(c)}</li>`).join('')}
            </ul>
          </div>
        `;
      }).join('');
      // Remove a borda do último item
      const last = box.querySelector('div:last-child');
      if (last) last.style.borderBottom = 'none';
    } catch (e) {
      box.innerHTML = `<p style="color:var(--color-danger);">Não foi possível carregar o histórico de atualizações.</p>`;
    }
  },

  _fmtDataChangelog(d) {
    try {
      const dt = new Date(d + 'T12:00:00');
      return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return d; }
  },

  // ── Notificações Push ──────────────────────────────────────────────────────
  renderNotificacoesPush() {
    return `
      <div class="page-header" style="margin-bottom:var(--sp-lg);">
        <div>
          <h2 style="font-size:20px;font-weight:700;margin:0;">🔔 Notificações Push</h2>
          <p class="page-subtitle">Alertas proativos mesmo com o app fechado</p>
        </div>
      </div>

      <div class="card mb-2xl" style="background:rgba(49,130,206,.05);border-left:4px solid var(--color-info);">
        <div style="font-size:15px;">
          <strong>ℹ️ O que você recebe:</strong> Alertas sobre contratos vencendo nos próximos 7 dias
          e contas a pagar com vencimento em até 3 dias. As notificações são enviadas a cada hora.
        </div>
      </div>

      <div class="card" style="max-width:560px;">
        <div class="card-header">
          <h3 class="card-title">Status das notificações</h3>
        </div>
        <p style="color:var(--color-text-muted);margin-bottom:var(--sp-md);font-size:14px;">
          Receba alertas no dispositivo sobre contratos vencendo, RDOs ausentes e contas a pagar.
        </p>
        <div id="push-status-area" style="display:flex;align-items:center;gap:12px;">
          <span id="push-status-label" style="font-size:14px;color:var(--color-text-muted);">Verificando…</span>
          <button id="btnTogglePush" class="btn btn-secondary" disabled>…</button>
        </div>
      </div>
    `;
  },

  attachPushListeners() {
    const statusEl = document.getElementById('push-status-label');
    const toggleBtn = document.getElementById('btnTogglePush');
    if (!statusEl || !toggleBtn) return;

    if (!window.RhinoPush) {
      statusEl.textContent = 'Módulo de push não carregado';
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Indisponível';
      return;
    }

    window.RhinoPush.getState().then((state) => {
      if (state === 'unsupported') {
        statusEl.textContent = 'Não suportado neste navegador';
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Indisponível';
      } else if (state === 'denied') {
        statusEl.textContent = 'Permissão bloqueada no navegador';
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Bloqueado';
      } else if (state === 'subscribed') {
        statusEl.textContent = 'Notificações ativas';
        statusEl.style.color = 'var(--color-success)';
        toggleBtn.textContent = 'Desativar';
        toggleBtn.disabled = false;
        toggleBtn.onclick = async () => {
          await window.RhinoPush.unsubscribe();
          this.render();
        };
      } else {
        statusEl.textContent = 'Desativadas';
        toggleBtn.textContent = 'Ativar notificações';
        toggleBtn.className = 'btn btn-primary';
        toggleBtn.disabled = false;
        toggleBtn.onclick = async () => {
          await window.RhinoPush.subscribe();
          this.render();
        };
      }
    });
  },

  _escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
