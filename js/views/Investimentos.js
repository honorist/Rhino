window.Investimentos = {
  filtroOrigem: 'todos',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const num = v => parseFloat(v) || 0;
      const todosAportes = Store.state.investimentos || [];

      // Aportes por origem
      const aportesDosSocios = todosAportes.filter(a => (a.origem || 'socio') === 'socio');
      const aportesDoCaixa   = todosAportes.filter(a => a.origem === 'caixa_empresa');

      const totalSocios = aportesDosSocios.reduce((s, i) => s + num(i.value), 0);
      const totalCaixa  = aportesDoCaixa.reduce((s, i) => s + num(i.value), 0);
      const totalGeral  = totalSocios + totalCaixa;

      // Filtrar por origem selecionada
      const aportesFiltrados = this.filtroOrigem === 'todos'
        ? todosAportes
        : todosAportes.filter(a => (a.origem || 'socio') === this.filtroOrigem);

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Aportes dos Sócios</h1>
            <p class="page-subtitle">Aportes de capital por sócio ou via caixa da empresa</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoAporte">+ Novo Aporte</button>
        </div>

        <!-- KPIs -->
        <div class="grid-3 mb-2xl">
          <div class="card stat-card" style="border-left:4px solid var(--color-primary);">
            <div class="stat-value">${Store.formatBRL(totalGeral)}</div>
            <div class="stat-label">Capital Total Aportado</div>
          </div>
          <div class="card stat-card" style="border-left:4px solid var(--color-info);">
            <div class="stat-value" style="color:var(--color-info);">${Store.formatBRL(totalSocios)}</div>
            <div class="stat-label">👥 Aportes dos Sócios</div>
          </div>
          <div class="card stat-card" style="border-left:4px solid var(--color-warning);">
            <div class="stat-value" style="color:var(--color-warning);">${Store.formatBRL(totalCaixa)}</div>
            <div class="stat-label">💰 Via Caixa da Empresa</div>
          </div>
        </div>

        <!-- Resumo por Sócio (apenas aportes de sócios) -->
        ${Store.state.socios.length > 0 && aportesDosSocios.length > 0 ? `
          <div class="card mb-2xl">
            <div class="card-header">
              <h3 class="card-title">Aportes por Sócio</h3>
              <span style="font-size:15px;color:var(--color-text-muted);">Comparando com participação societária</span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sócio</th>
                    <th>Participação</th>
                    <th style="text-align:right;">Aporte Realizado</th>
                    <th style="text-align:right;">Contribuição Esperada</th>
                    <th style="text-align:right;">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  ${Store.state.socios.map(socio => {
                    const aportesDoSocio = aportesDosSocios.filter(a => a.socioId === socio.id);
                    const aportado = aportesDoSocio.reduce((s, a) => s + num(a.value), 0);
                    const esperado = totalSocios > 0 ? (totalSocios * num(socio.participacao) / 100) : 0;
                    const diff = aportado - esperado;
                    return `
                      <tr>
                        <td><strong>${escapeHtml(socio.name)}</strong></td>
                        <td>${num(socio.participacao).toFixed(2)}%</td>
                        <td style="text-align:right;font-weight:600;">${Store.formatBRL(aportado)}</td>
                        <td style="text-align:right;color:var(--color-text-muted);">${Store.formatBRL(esperado)}</td>
                        <td style="text-align:right;font-weight:700;color:${diff >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
                          ${diff >= 0 ? '+' : ''}${Store.formatBRL(diff)}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td>TOTAL</td>
                    <td>100,00%</td>
                    <td style="text-align:right;">${Store.formatBRL(totalSocios)}</td>
                    <td style="text-align:right;">${Store.formatBRL(totalSocios)}</td>
                    <td style="text-align:right;">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Filtro de origem -->
        <div style="display:flex;gap:var(--sp-sm);margin-bottom:var(--sp-lg);align-items:center;">
          <span style="font-size:15px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;margin-right:4px;">Filtrar:</span>
          <button class="btn btn-sm btn-filtro-origem" data-origem="todos" style="${this.filtroOrigem === 'todos' ? 'background:var(--color-primary);color:#fff;' : 'background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);'}">Todos</button>
          <button class="btn btn-sm btn-filtro-origem" data-origem="socio" style="${this.filtroOrigem === 'socio' ? 'background:var(--color-info);color:#fff;' : 'background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);'}">👥 Sócios</button>
          <button class="btn btn-sm btn-filtro-origem" data-origem="caixa_empresa" style="${this.filtroOrigem === 'caixa_empresa' ? 'background:var(--color-warning);color:#fff;' : 'background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);'}">💰 Caixa Empresa</button>
        </div>

        <!-- Lista de Aportes -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Histórico de Aportes</h3>
            <span style="font-size:15px;color:var(--color-text-muted);">${aportesFiltrados.length} aporte${aportesFiltrados.length !== 1 ? 's' : ''}</span>
          </div>
          ${aportesFiltrados.length === 0 ? `
            <p class="text-muted" style="padding:var(--sp-lg);">Nenhum aporte registrado</p>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Origem</th>
                    <th>Sócio / Descrição</th>
                    <th>Tipo de Custo</th>
                    <th>Destino</th>
                    <th style="text-align:right;">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${[...aportesFiltrados].sort((a, b) => new Date(b.date) - new Date(a.date)).map(ap => {
                    const origem  = ap.origem  || 'socio';
                    const destino = ap.destino || (ap.contractId ? 'contrato' : 'base');
                    const socio = ap.socioId ? Store.getSocioById(ap.socioId) : null;
                    const contract = ap.contractId ? Store.getContractById(ap.contractId) : null;
                    const tipoInfo = Store.getTipoBaseByKey(ap.baseType);

                    const origemBadge = origem === 'caixa_empresa'
                      ? `<span class="badge" style="background:rgba(214,158,46,.15);color:#D69E2E;">💰 Caixa</span>`
                      : `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">👥 Sócio</span>`;

                    const tipoBadge = `<span class="badge" style="background:${tipoInfo.cor}22;color:${tipoInfo.cor};">${tipoInfo.icon} ${tipoInfo.label}</span>`;

                    const destinoBadge = destino === 'base'
                      ? `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">⚙️ BASE</span>`
                      : contract
                        ? `<a href="#/contratos/${contract.id}" style="text-decoration:none;"><span class="badge" style="background:rgba(46,125,82,.15);color:#2E7D52;cursor:pointer;">📋 ${escapeHtml(contract.name)}</span></a>`
                        : `<span class="badge" style="background:rgba(113,128,150,.15);color:#718096;">📋 Contrato removido</span>`;

                    return `
                      <tr class="row-aporte" data-id="${ap.id}" style="cursor:pointer;">
                        <td>${new Date(ap.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td>${origemBadge}</td>
                        <td>
                          ${socio
                            ? `<strong>${escapeHtml(socio.name)}</strong>${ap.description ? `<div style="font-size:15px;color:var(--color-text-muted);">${escapeHtml(ap.description)}</div>` : ''}`
                            : `<strong>${escapeHtml(ap.description || 'Aporte via caixa')}</strong>`
                          }
                        </td>
                        <td>${tipoBadge}</td>
                        <td>${destinoBadge}</td>
                        <td style="text-align:right;font-weight:700;">${Store.formatBRL(num(ap.value))}</td>
                        <td>
                          <div class="actions-cell">
                            <a class="action-link danger btn-excluir-aporte" data-id="${ap.id}">Excluir</a>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td colspan="5" style="padding:var(--sp-md);">Total filtrado</td>
                    <td style="text-align:right;padding:var(--sp-md);">${Store.formatBRL(aportesFiltrados.reduce((s, a) => s + num(a.value), 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `}
        </div>
      `;

      app.innerHTML = html;

      document.getElementById('btnNovoAporte').addEventListener('click', () => this.showModal());
      document.querySelectorAll('.btn-filtro-origem').forEach(btn => {
        btn.addEventListener('click', e => {
          this.filtroOrigem = e.currentTarget.dataset.origem;
          this.render();
        });
      });
      document.querySelectorAll('.btn-excluir-aporte').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this.deleteAporte(e.target.dataset.id); });
      });
      document.querySelectorAll('.row-aporte').forEach(tr => {
        tr.addEventListener('click', e => {
          if (e.target.closest('.actions-cell')) return;
          this.showDetail(tr.dataset.id);
        });
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar investimentos. Tente novamente.</p></div>';
    }
  },

  showDetail(id) {
    const ap = (Store.state.investimentos || []).find(x => x.id === id);
    if (!ap) return;
    const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const socio = ap.socioId ? (Store.state.socios || []).find(s => s.id === ap.socioId) : null;
    const contract = ap.contractId ? Store.getContractById(ap.contractId) : null;
    const baseItem = ap.baseItemId ? (Store.state.base || []).find(b => b.id === ap.baseItemId) : null;
    const caixaEntry = ap.caixaEntryId ? (Store.state.caixa || []).find(e => e.id === ap.caixaEntryId) : null;

    const row = (lbl, val) => val ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span style="color:var(--color-text-muted);">${lbl}</span><span style="font-weight:500;text-align:right;">${val}</span></div>` : '';

    const origemLabel = ap.origem === 'socio' ? '👤 Sócio' : ap.origem === 'caixa_empresa' ? '💼 Caixa da empresa' : escapeHtml(ap.origem || '—');
    const destinoLabel = ap.destino === 'base' ? '⚙️ BASE' : ap.destino === 'contrato' ? '📋 Contrato' : escapeHtml(ap.destino || '—');

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:600px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(ap.description || 'Aporte')}</h2>
              <div style="margin-top:6px;">
                <span style="font-size:22px;font-weight:700;color:var(--color-info);">${Store.formatBRL(parseFloat(ap.value) || 0)}</span>
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            ${row('Data',          fmtD(ap.date))}
            ${row('Origem',        origemLabel)}
            ${row('Sócio',         socio ? `<strong>${escapeHtml(socio.name)}</strong>${socio.participacao ? ` <span style="color:var(--color-text-muted);">(${socio.participacao}%)</span>` : ''}` : null)}
            ${row('Destino',       destinoLabel)}
            ${row('Contrato',      contract ? `<a href="#/contratos/${contract.id}" style="color:var(--color-primary);">${escapeHtml(contract.name)}</a>` : null)}
            ${row('Item BASE',     baseItem ? `${escapeHtml(baseItem.description)} <span style="color:var(--color-text-muted);font-size:13px;">(${escapeHtml(baseItem.type || '')})</span>` : null)}
            ${row('Tipo BASE',     ap.baseType && !baseItem ? escapeHtml(ap.baseType) : null)}
            ${row('Entrada no caixa', caixaEntry ? `${escapeHtml(caixaEntry.description)} em ${fmtD(caixaEntry.date)}` : null)}
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:var(--sp-md);font-family:monospace;">ID: ${escapeHtml(ap.id)}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnDetClose">Fechar</button>
            <button class="btn danger" id="btnDetDel" style="color:var(--color-danger);">Excluir</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnDetClose').addEventListener('click', close);
    document.getElementById('btnDetDel').addEventListener('click', () => { close(); this.deleteAporte(id); });
  },

  showModal() {
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:680px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">Novo Aporte</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formAporte" class="modal-content">

            <!-- 1. Origem -->
            <div class="form-group">
              <label class="form-label">1. Origem do Aporte *</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
                <label style="display:flex;align-items:center;gap:var(--sp-sm);padding:var(--sp-md);border:2px solid var(--color-border);border-radius:8px;cursor:pointer;" id="labelSocio">
                  <input type="radio" name="origem" value="socio" checked style="margin:0;">
                  <div>
                    <div style="font-weight:600;">👥 Sócio</div>
                    <div style="font-size:15px;color:var(--color-text-muted);">Aporte de um sócio</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:var(--sp-sm);padding:var(--sp-md);border:2px solid var(--color-border);border-radius:8px;cursor:pointer;" id="labelCaixa">
                  <input type="radio" name="origem" value="caixa_empresa" style="margin:0;">
                  <div>
                    <div style="font-weight:600;">💰 Caixa da Empresa</div>
                    <div style="font-size:15px;color:var(--color-text-muted);">Aquisição via caixa (gera saída)</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Campo Sócio -->
            <div class="form-group" id="grupoSocio">
              <label class="form-label">Sócio *</label>
              <select class="form-control" name="socioId">
                <option value="">Selecionar...</option>
                ${Store.state.socios.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>

            <!-- 2. Destino -->
            <div class="form-group" style="margin-top:var(--sp-lg);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
              <label class="form-label">2. Destino do Aporte *</label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
                <label style="display:flex;align-items:center;gap:var(--sp-sm);padding:var(--sp-md);border:2px solid var(--color-border);border-radius:8px;cursor:pointer;" id="labelDestContrato">
                  <input type="radio" name="destino" value="contrato" checked style="margin:0;">
                  <div>
                    <div style="font-weight:600;">📋 Contrato</div>
                    <div style="font-size:15px;color:var(--color-text-muted);">Aporte para um contrato específico</div>
                  </div>
                </label>
                <label style="display:flex;align-items:center;gap:var(--sp-sm);padding:var(--sp-md);border:2px solid var(--color-border);border-radius:8px;cursor:pointer;" id="labelDestBase">
                  <input type="radio" name="destino" value="base" style="margin:0;">
                  <div>
                    <div style="font-weight:600;">⚙️ BASE</div>
                    <div style="font-size:15px;color:var(--color-text-muted);">Custo administrativo geral</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Campo Contrato (se destino=contrato) -->
            <div class="form-group" id="grupoContrato">
              <label class="form-label">Contrato *</label>
              <select class="form-control" name="contractId">
                <option value="">Selecionar contrato...</option>
                ${Store.state.contracts.map(c => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.client)}</option>`).join('')}
              </select>
            </div>

            <!-- Tipo de custo (sempre visível) -->
            <div class="form-group" id="grupoBaseType">
              <label class="form-label">Tipo de Custo *</label>
              <select class="form-control" name="baseType">
                ${(Store.state.tipos_base || []).map(t =>
                  `<option value="${t.key}" ${t.key === 'outros' ? 'selected' : ''}>${t.icon} ${t.label}</option>`
                ).join('')}
              </select>
              <div class="form-helper">Classifica a natureza do custo (ex: Material, Veículo, Software). Gerencie em <a href="#/configuracao" style="color:var(--color-primary);">Configuração → Tipos de Custo</a>.</div>
            </div>

            <!-- 3. Detalhes -->
            <div style="margin-top:var(--sp-lg);padding-top:var(--sp-lg);border-top:1px solid var(--color-border);">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Valor (BRL) *</label>
                  <input class="form-control" name="value" type="text" data-currency inputmode="numeric" placeholder="0,00" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Data *</label>
                  <input class="form-control" name="date" type="date" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Descrição</label>
                <textarea class="form-control" name="description" placeholder="Ex: Compra de notebook, maquinário, capital de giro..." style="min-height:60px;"></textarea>
              </div>
            </div>

            <!-- Avisos -->
            <div id="avisoCaixa" style="display:none;padding:var(--sp-md);background:rgba(214,158,46,.1);border-left:4px solid var(--color-warning);border-radius:6px;font-size:15px;margin-top:var(--sp-md);">
              ⚠️ Este aporte gerará uma <strong>saída contábil automática</strong> no caixa da empresa.
            </div>
            <div id="avisoBase" style="display:none;padding:var(--sp-md);background:rgba(49,130,206,.1);border-left:4px solid var(--color-info);border-radius:6px;font-size:15px;margin-top:var(--sp-md);">
              ℹ️ Um item será criado na <strong>BASE</strong> para este aporte, pronto para ser alocado em contratos.
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">Registrar Aporte</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Alternar visual da origem
    const radiosOrigem  = document.querySelectorAll('[name=origem]');
    const radiosDestino = document.querySelectorAll('[name=destino]');
    const grupoSocio     = document.getElementById('grupoSocio');
    const grupoContrato  = document.getElementById('grupoContrato');
    const grupoBaseType  = document.getElementById('grupoBaseType');
    const avisoCaixa     = document.getElementById('avisoCaixa');
    const avisoBase      = document.getElementById('avisoBase');
    const labelSocio     = document.getElementById('labelSocio');
    const labelCaixa     = document.getElementById('labelCaixa');
    const labelDestContrato = document.getElementById('labelDestContrato');
    const labelDestBase     = document.getElementById('labelDestBase');

    const atualizarOrigem = () => {
      const val = document.querySelector('[name=origem]:checked').value;
      if (val === 'socio') {
        grupoSocio.style.display = '';
        avisoCaixa.style.display = 'none';
        labelSocio.style.borderColor = 'var(--color-info)';
        labelSocio.style.background = 'rgba(49,130,206,.05)';
        labelCaixa.style.borderColor = 'var(--color-border)';
        labelCaixa.style.background = '';
      } else {
        grupoSocio.style.display = 'none';
        avisoCaixa.style.display = 'block';
        labelCaixa.style.borderColor = 'var(--color-warning)';
        labelCaixa.style.background = 'rgba(214,158,46,.05)';
        labelSocio.style.borderColor = 'var(--color-border)';
        labelSocio.style.background = '';
      }
    };

    const atualizarDestino = () => {
      const val = document.querySelector('[name=destino]:checked').value;
      if (val === 'contrato') {
        grupoContrato.style.display = '';
        avisoBase.style.display = 'none';
        labelDestContrato.style.borderColor = 'var(--color-primary)';
        labelDestContrato.style.background = 'rgba(46,125,82,.05)';
        labelDestBase.style.borderColor = 'var(--color-border)';
        labelDestBase.style.background = '';
      } else {
        grupoContrato.style.display = 'none';
        avisoBase.style.display = 'block';
        labelDestBase.style.borderColor = 'var(--color-info)';
        labelDestBase.style.background = 'rgba(49,130,206,.05)';
        labelDestContrato.style.borderColor = 'var(--color-border)';
        labelDestContrato.style.background = '';
      }
    };

    radiosOrigem.forEach(r => r.addEventListener('change', atualizarOrigem));
    radiosDestino.forEach(r => r.addEventListener('change', atualizarDestino));
    atualizarOrigem();
    atualizarDestino();

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAporte'));
      const data = Object.fromEntries(fd);
      data.value = window.BRLInput.parse(data.value);

      if (!data.value || data.value <= 0) { window.showToast('Informe um valor válido', 'error'); return; }
      if (data.origem === 'socio' && !data.socioId) { window.showToast('Selecione o sócio', 'error'); return; }
      if (data.destino === 'contrato' && !data.contractId) { window.showToast('Selecione o contrato de destino', 'error'); return; }

      if (data.origem === 'caixa_empresa') data.socioId = null;
      if (data.destino === 'base') data.contractId = null;

      try {
        await Store.createInvestimento(data);
        const msgs = [];
        if (data.origem === 'caixa_empresa') msgs.push('saída lançada no caixa');
        if (data.destino === 'base') msgs.push('item criado na BASE');
        const extra = msgs.length > 0 ? ` (${msgs.join(' e ')})` : '';
        window.showToast(`Aporte registrado${extra}`, 'success');
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });
  },

  showModalInvestimentos(socio) {
    const num = v => parseFloat(v) || 0;
    const aportes = Store.state.investimentos.filter(a => a.socioId === socio.id);
    const total = aportes.reduce((s, a) => s + num(a.value), 0);

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:700px;">
          <div class="modal-header">
            <h2 class="modal-title">Aportes de ${escapeHtml(socio.name)}</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
              <div>
                <div class="text-muted font-sm">Participação</div>
                <div class="font-xl font-bold">${num(socio.participacao).toFixed(2)}%</div>
              </div>
              <div>
                <div class="text-muted font-sm">Total Aportado</div>
                <div class="font-xl font-bold">${Store.formatBRL(total)}</div>
              </div>
            </div>
            ${aportes.length === 0 ? `<p class="text-muted">Nenhum aporte registrado para este sócio</p>` : `
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th style="text-align:right;">Valor</th></tr></thead>
                  <tbody>
                    ${aportes.map(a => `
                      <tr>
                        <td>${new Date(a.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td><span class="badge ${a.type === 'inicial' ? 'badge-entrada' : 'badge-warning'}">${a.type === 'inicial' ? 'Inicial' : a.type === 'aquisicao' ? 'Aquisição' : 'Adicional'}</span></td>
                        <td>${escapeHtml(a.description) || '—'}</td>
                        <td style="text-align:right;font-weight:700;">${Store.formatBRL(num(a.value))}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" id="btnFechar">Fechar</button></div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    document.getElementById('btnFechar').addEventListener('click', close);
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  },

  async deleteAporte(id) {
    const aporte = Store.state.investimentos.find(a => a.id === id);
    const msg = aporte?.origem === 'caixa_empresa'
      ? 'Excluir este aporte? A saída no caixa também será removida.'
      : 'Excluir este aporte?';
    if (!confirm(msg)) return;
    try {
      await Store.deleteInvestimento(id);
      window.showToast('Aporte removido', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
