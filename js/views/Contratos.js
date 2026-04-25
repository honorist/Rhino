window.Contratos = {
  currentFilter: 'todos',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      let filtered = Store.state.contracts;
      if (this.currentFilter !== 'todos') {
        filtered = filtered.filter(c => c.status === this.currentFilter);
      }

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Contratos</h1>
            <p class="page-subtitle">Gerenciar contratos de serviços</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovoContrato">+ Novo Contrato</button>
        </div>

        <div class="filters-bar">
          <div class="filter-group">
            <label class="filter-label">Status</label>
            <select class="form-control filter-control" id="filterStatus">
              <option value="todos">Todos</option>
              <option value="prospeccao">Prospecção</option>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Período</th>
                  <th style="text-align:center;">Equipe</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="7" class="text-center text-muted" style="padding: var(--sp-xl);">Nenhum contrato encontrado</td>
                  </tr>
                ` : filtered.map(c => {
                  const nOrg = (c.organograma || []).length;
                  const nRec = (Store.state.recursos || []).filter(r => r.status === 'funcionario' && r.alocacaoAtual?.contractId === c.id).length;
                  const total = Math.max(nOrg, nRec);
                  const bg = total === 0 ? '#9CA3AF' : '#55588B';
                  return `
                  <tr class="row-contrato" data-id="${c.id}" style="cursor:pointer;">
                    <td><strong>${escapeHtml(c.name)}</strong></td>
                    <td>${escapeHtml(c.client)}</td>
                    <td>${Store.formatBRL(c.value)}</td>
                    <td>${new Date(c.startDate).toLocaleDateString('pt-BR')} até ${new Date(c.endDate).toLocaleDateString('pt-BR')}</td>
                    <td style="text-align:center;">
                      <div title="${nOrg} no organograma · ${nRec} recurso(s) alocado(s)" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:${bg};border-radius:99px;font-weight:700;color:#FFFFFF;box-shadow:0 1px 3px rgba(85,88,139,.2);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        ${total}
                      </div>
                    </td>
                    <td><span class="badge badge-${c.status}">${c.status}</span></td>
                    <td>
                      <div class="actions-cell">
                        <a class="action-link btn-editar" data-id="${c.id}">Editar</a>
                        <a class="action-link danger btn-excluir" data-id="${c.id}">Excluir</a>
                      </div>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      app.innerHTML = html;

      // Event listeners
      document.getElementById('btnNovoContrato').addEventListener('click', () => this.showModal());
      document.getElementById('filterStatus').addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.render();
      });

      // Click na linha → abre overview (não dispara se clicou em botão de ação)
      document.querySelectorAll('.row-contrato').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.actions-cell')) return;
          this.showOverview(tr.dataset.id);
        });
      });

      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.showModal(e.target.dataset.id); });
      });

      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteContract(e.target.dataset.id); });
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar contratos. Tente novamente.</p></div>';
    }
  },

  // Visão geral rápida do contrato (modal)
  showOverview(contractId) {
    const c = Store.getContractById(contractId);
    if (!c) return;

    const fmt = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const fim = c.endDate ? new Date(c.endDate) : null;
    const diasRestantes = fim ? Math.ceil((fim - hoje) / 86400000) : null;

    const saidas = (Store.state.saidas || []).filter(s => s.contractId === c.id);
    const totalMedido = saidas.reduce((acc, s) => acc + (parseFloat(s.value) || 0), 0);
    const margem = parseFloat(c.value || 0) - totalMedido;
    const marginPct = c.value > 0 ? (margem / c.value * 100) : 0;

    const orgCount = (c.organograma || []).length;
    const recCount = (Store.state.recursos || []).filter(r => r.status === 'funcionario' && r.alocacaoAtual?.contractId === c.id).length;
    const rdoCount = (c.rdos || []).length;
    const budget = c.budget || [];
    const totalBudget = budget.reduce((acc, b) => acc + (parseFloat(b.value) || 0), 0);

    const nfs = (Store.state.notas_fiscais || []).filter(n => n.contractId === c.id);
    const nfsEmitidas = nfs.filter(n => n.emitida).length;

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(c.name)}</h2>
              <div style="font-size:14px;color:var(--color-text-muted);margin-top:4px;">
                ${escapeHtml(c.client)} ${c.contractNumber ? `· <span style="font-family:monospace;">#${escapeHtml(c.contractNumber)}</span>` : ''}
                <span class="badge badge-${c.status}" style="margin-left:8px;">${c.status}</span>
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>

          <div class="modal-content">
            <!-- KPIs -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:var(--sp-md);margin-bottom:var(--sp-lg);">
              <div style="padding:var(--sp-md);background:var(--color-surface);border-radius:8px;border:1px solid var(--color-border);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Valor do contrato</div>
                <div style="font-size:20px;font-weight:700;color:#3b82f6;margin-top:4px;">${Store.formatBRL(c.value)}</div>
              </div>
              <div style="padding:var(--sp-md);background:var(--color-surface);border-radius:8px;border:1px solid var(--color-border);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Medido</div>
                <div style="font-size:20px;font-weight:700;color:#10b981;margin-top:4px;">${Store.formatBRL(totalMedido)}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">${saidas.length} medições</div>
              </div>
              <div style="padding:var(--sp-md);background:var(--color-surface);border-radius:8px;border:1px solid var(--color-border);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Margem</div>
                <div style="font-size:20px;font-weight:700;color:${margem >= 0 ? '#10b981' : '#dc2626'};margin-top:4px;">${Store.formatBRL(margem)}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">${marginPct.toFixed(1)}%</div>
              </div>
              <div style="padding:var(--sp-md);background:var(--color-surface);border-radius:8px;border:1px solid var(--color-border);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Prazo</div>
                <div style="font-size:20px;font-weight:700;color:${diasRestantes === null ? '#999' : diasRestantes < 0 ? '#dc2626' : diasRestantes <= 30 ? '#f59e0b' : '#10b981'};margin-top:4px;">
                  ${diasRestantes === null ? '—' : diasRestantes < 0 ? `vencido há ${Math.abs(diasRestantes)}d` : `${diasRestantes} dias`}
                </div>
                <div style="font-size:12px;color:var(--color-text-muted);">até ${fmt(c.endDate)}</div>
              </div>
            </div>

            <!-- Dados do cliente / contrato -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
              <div>
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Período</div>
                <div style="font-size:14px;line-height:1.8;">
                  <div><strong>Início:</strong> ${fmt(c.startDate)}</div>
                  <div><strong>Término:</strong> ${fmt(c.endDate)}</div>
                  ${c.tendencyDate ? `<div><strong>Tendência:</strong> ${fmt(c.tendencyDate)}</div>` : ''}
                </div>
              </div>
              <div>
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Cliente</div>
                <div style="font-size:14px;line-height:1.8;">
                  ${c.clientEmail ? `<div>${escapeHtml(c.clientEmail)}</div>` : ''}
                  ${c.clientPhone ? `<div>${escapeHtml(c.clientPhone)}</div>` : ''}
                  ${c.clientDocument ? `<div style="font-family:monospace;">${escapeHtml(c.clientDocument)}</div>` : ''}
                </div>
              </div>
            </div>

            <!-- Local -->
            ${c.endereco ? `
              <div style="margin-bottom:var(--sp-lg);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Local da obra</div>
                <div style="font-size:14px;">${escapeHtml(c.endereco)}</div>
              </div>
            ` : ''}

            <!-- Resumo operacional -->
            <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:var(--sp-md);padding:var(--sp-md);background:var(--color-bg);border-radius:8px;margin-bottom:var(--sp-lg);">
              <div style="text-align:center;">
                <div style="font-size:22px;font-weight:700;">${orgCount}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">Organograma</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:22px;font-weight:700;">${recCount}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">Alocados</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:22px;font-weight:700;">${rdoCount}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">RDOs</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:22px;font-weight:700;">${nfsEmitidas}/${nfs.length}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">NFs emitidas</div>
              </div>
            </div>

            <!-- Orçamento resumido -->
            ${budget.length > 0 ? `
              <div style="margin-bottom:var(--sp-lg);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:8px;">Orçamento (${budget.length} itens · total ${Store.formatBRL(totalBudget)})</div>
                <div style="font-size:14px;">
                  ${budget.slice(0, 5).map(b => `
                    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border);">
                      <span>${escapeHtml(b.description || '—')} <span style="color:var(--color-text-muted);">(${escapeHtml(b.type || '')})</span></span>
                      <span style="font-weight:600;">${Store.formatBRL(b.value)}</span>
                    </div>
                  `).join('')}
                  ${budget.length > 5 ? `<div style="text-align:center;color:var(--color-text-muted);margin-top:6px;">+ ${budget.length - 5} itens</div>` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Notas -->
            ${c.notes ? `
              <div style="margin-bottom:var(--sp-md);">
                <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:6px;">Observações</div>
                <div style="font-size:14px;white-space:pre-wrap;">${escapeHtml(c.notes)}</div>
              </div>
            ` : ''}
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnOvClose">Fechar</button>
            <button class="btn btn-primary" id="btnOvVerDetalhes">Ver detalhes completos →</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnOvClose').addEventListener('click', close);
    document.getElementById('btnOvVerDetalhes').addEventListener('click', () => {
      close();
      location.hash = `#/contratos/${contractId}`;
    });
  },

  showModal(contractId) {
    const contract = contractId ? Store.getContractById(contractId) : null;
    const title = contract ? 'Editar Contrato' : 'Novo Contrato';
    const clientes = Store.state.clientes || [];

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formContrato" class="modal-content" style="max-height:70vh;overflow-y:auto;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número do Contrato</label>
                <input class="form-control" name="contractNumber" value="${escapeHtml(contract?.contractNumber || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-control" name="status" required>
                  <option value="prospeccao" ${contract?.status === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
                  <option value="ativo" ${(!contract || contract.status === 'ativo') ? 'selected' : ''}>Ativo</option>
                  <option value="pausado" ${contract?.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                  <option value="concluido" ${contract?.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                  <option value="cancelado" ${contract?.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome do Contrato *</label>
              <input class="form-control" name="name" value="${escapeHtml(contract?.name || '')}" required>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Cliente</h3>
              <div class="form-group">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                  <label class="form-label" style="margin:0;">Cliente *</label>
                  ${clientes.length === 0 ? `<a href="#/clientes" id="linkCadastrarCliente" style="font-size:15px;color:var(--color-primary);text-decoration:none;">+ Cadastrar cliente →</a>` : `<a href="#/clientes" id="linkCadastrarCliente" style="font-size:15px;color:var(--color-primary);text-decoration:none;">Gerenciar clientes →</a>`}
                </div>
                ${clientes.length > 0 ? `
                  <select class="form-control" name="clientId" id="selectCliente" required>
                    <option value="">— Selecionar cliente —</option>
                    ${clientes.map(c => {
                      const label = c.nome + (c.empresa ? ` · ${c.empresa}` : '');
                      const selected = contract?.clientId === c.id ||
                        (!contract?.clientId && (contract?.client === c.nome || contract?.client === c.nome + (c.empresa ? ` (${c.empresa})` : '') || contract?.client === c.nome + (c.empresa ? ` · ${c.empresa}` : '')));
                      return `<option value="${c.id}" ${selected ? 'selected' : ''}>${label}</option>`;
                    }).join('')}
                    <option value="__outro__">✏️ Digitar manualmente...</option>
                  </select>
                  <input class="form-control" name="clientManual" id="inputClienteManual" placeholder="Nome do cliente" style="margin-top:6px;display:none;" value="${!contract?.clientId && !clientes.some(c => contract?.client === c.nome) ? contract?.client || '' : ''}">
                ` : `
                  <input class="form-control" name="clientManual" id="inputClienteManual" value="${contract?.client || ''}" required placeholder="Nome do cliente ou empresa">
                `}
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CPF/CNPJ</label>
                  <input class="form-control" name="clientDocument" value="${escapeHtml(contract?.clientDocument || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input class="form-control" name="clientEmail" type="email" value="${escapeHtml(contract?.clientEmail || '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input class="form-control" name="clientPhone" data-phone inputmode="numeric" maxlength="16" value="${contract?.clientPhone ? window.formatPhoneBR(contract.clientPhone) : ''}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Endereço / Local da Obra</label>
                <div style="position:relative;" id="enderecoWrap">
                  <input class="form-control" id="enderecoInput" name="endereco"
                    value="${escapeHtml(contract?.endereco || '')}"
                    placeholder="Buscar endereço no mapa..."
                    autocomplete="off"
                    style="padding-right:36px;">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                  <div id="nominatimDropdown" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
                </div>
                <input type="hidden" id="enderecoLat" name="lat" value="${contract?.lat || ''}">
                <input type="hidden" id="enderecoLng" name="lng" value="${contract?.lng || ''}">
                <div id="miniMapa" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${contract?.lat ? '' : 'display:none;'}"></div>
              </div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Contrato</h3>
              <div class="form-group">
                <label class="form-label">Valor Total (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${contract?.value ? window.BRLInput.toDisplay(contract.value) : ''}" placeholder="0,00" required>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-lg);align-items:start;">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data Início</label>
                  <input class="form-control" name="startDate" type="date" value="${contract?.startDate || ''}">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data Fim</label>
                  <input class="form-control" name="endDate" type="date" value="${contract?.endDate || ''}">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Data de Tendência</label>
                  <input class="form-control" name="tendencyDate" type="date" value="${contract?.tendencyDate || ''}">
                </div>
              </div>
              <div class="form-helper" style="margin-top:6px;">💡 <strong>Tendência</strong> é a previsão atualizada do fim da obra.</div>
            </div>

            <div style="border-top:1px solid var(--color-border);padding-top:var(--sp-lg);margin-top:var(--sp-lg);">
              <div class="form-group">
                <label class="form-label">Notas/Observações</label>
                <textarea class="form-control" name="notes" style="min-height:80px;">${contract?.notes || ''}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${contract ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => {
      if (window.Contratos._miniMap) { window.Contratos._miniMap.remove(); window.Contratos._miniMap = null; }
      overlay.remove();
    };

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Link to clientes navigates away and closes modal
    const linkClientes = document.getElementById('linkCadastrarCliente');
    if (linkClientes) {
      linkClientes.addEventListener('click', () => closeModal());
    }

    // Toggle manual input when "Digitar manualmente..." selected
    const selectCliente = document.getElementById('selectCliente');
    const inputManual = document.getElementById('inputClienteManual');
    if (selectCliente && inputManual) {
      // Se ao abrir o modal não há clientId mas há texto manual, mostrar o campo
      if (!contract?.clientId && contract?.client && !clientes.some(c => c.id === contract?.clientId)) {
        const matchPorNome = clientes.find(c =>
          contract.client === c.nome ||
          contract.client === c.nome + (c.empresa ? ` · ${c.empresa}` : '') ||
          contract.client === c.nome + (c.empresa ? ` (${c.empresa})` : '')
        );
        if (!matchPorNome && contract.client) {
          inputManual.style.display = 'block';
          selectCliente.value = '__outro__';
        }
      }
      selectCliente.addEventListener('change', () => {
        if (selectCliente.value === '__outro__') {
          inputManual.style.display = 'block';
          inputManual.required = true;
          selectCliente.required = false;
        } else {
          inputManual.style.display = 'none';
          inputManual.required = false;
          selectCliente.required = true;

          // Preencher dados do cliente selecionado (só se campos estiverem vazios)
          const clienteSel = clientes.find(c => c.id === selectCliente.value);
          if (clienteSel) {
            const setIfEmpty = (name, val) => {
              const el = document.querySelector(`#formContrato [name="${name}"]`);
              if (el && !el.value && val) el.value = val;
            };
            setIfEmpty('clientDocument', clienteSel.documento || clienteSel.cnpj || clienteSel.cpf);
            setIfEmpty('clientEmail',    clienteSel.email);
            if (clienteSel.telefone) {
              const telEl = document.querySelector('#formContrato [name="clientPhone"]');
              if (telEl && !telEl.value) telEl.value = window.formatPhoneBR(clienteSel.telefone);
            }
          }
          const endInput = document.getElementById('enderecoInput');
          const latInput = document.getElementById('enderecoLat');
          const lngInput = document.getElementById('enderecoLng');
          if (clienteSel?.endereco && endInput && !endInput.value) {
            endInput.value = clienteSel.endereco;
            if (clienteSel.lat) latInput.value = clienteSel.lat;
            if (clienteSel.lng) lngInput.value = clienteSel.lng;
            if (clienteSel.lat && clienteSel.lng) {
              // Reutiliza o mini-mapa já inicializado
              const mapaDiv = document.getElementById('miniMapa');
              if (mapaDiv) {
                mapaDiv.style.display = 'block';
                if (window.Contratos._miniMap) {
                  window.Contratos._miniMap.remove();
                  window.Contratos._miniMap = null;
                }
                setTimeout(() => {
                  window.Contratos._miniMap = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
                    .setView([parseFloat(clienteSel.lat), parseFloat(clienteSel.lng)], 15);
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(window.Contratos._miniMap);
                  L.marker([parseFloat(clienteSel.lat), parseFloat(clienteSel.lng)])
                    .addTo(window.Contratos._miniMap)
                    .bindPopup(clienteSel.endereco).openPopup();
                }, 50);
              }
            }
          }
        }
      });
    }

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formContrato'));
      const data = Object.fromEntries(formData);

      // Resolve client: por ID do select ou manual
      let clienteManualCriado = false;
      if (selectCliente) {
        if (selectCliente.value === '__outro__') {
          data.client = data.clientManual?.trim() || '';
          data.clientId = null;
          clienteManualCriado = !!data.client;
        } else {
          const clienteSelecionado = clientes.find(c => c.id === selectCliente.value);
          data.clientId = clienteSelecionado?.id || null;
          data.client = clienteSelecionado
            ? clienteSelecionado.nome + (clienteSelecionado.empresa ? ` · ${clienteSelecionado.empresa}` : '')
            : '';
        }
      } else {
        // Sem clientes cadastrados: campo manual
        data.client = data.clientManual?.trim() || '';
        data.clientId = null;
        clienteManualCriado = !!data.client;
      }
      delete data.clientManual;

      if (!data.client?.trim()) { window.showToast('Selecione ou informe o cliente', 'error'); return; }

      data.value = window.BRLInput.parse(data.value);

      try {
        // Se digitou manualmente, cadastra o cliente automaticamente
        if (clienteManualCriado) {
          const jaExiste = (Store.state.clientes || []).some(c =>
            (c.nome || '').toLowerCase() === data.client.toLowerCase()
          );
          if (!jaExiste) {
            await Store.createCliente({ nome: data.client });
            window.showToast(`Cliente "${data.client}" cadastrado automaticamente`, 'info');
          }
        }

        if (contract) {
          await Store.updateContract(contractId, data);
          window.showToast('Contrato atualizado com sucesso', 'success');
        } else {
          await Store.createContract(data);
          window.showToast('Contrato criado com sucesso', 'success');
        }
        closeModal();
        this.render();
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // ─── Busca de endereço (Nominatim / OpenStreetMap) ───
    this._initEnderecoSearch(contract);
  },

  _miniMap: null,
  _miniMarker: null,

  _initEnderecoSearch(contract) {
    const input    = document.getElementById('enderecoInput');
    const dropdown = document.getElementById('nominatimDropdown');
    const latInput = document.getElementById('enderecoLat');
    const lngInput = document.getElementById('enderecoLng');
    const mapaDiv  = document.getElementById('miniMapa');
    if (!input) return;

    let debounce = null;

    const mostrarMiniMapa = (lat, lng, label) => {
      mapaDiv.style.display = 'block';
      setTimeout(() => {
        if (this._miniMap) { this._miniMap.remove(); this._miniMap = null; }
        this._miniMap = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
          .setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap'
        }).addTo(this._miniMap);
        this._miniMarker = L.marker([lat, lng]).addTo(this._miniMap)
          .bindPopup(label).openPopup();
      }, 50);
    };

    // Se já tem coordenadas salvas, mostrar mini mapa
    if (contract?.lat && contract?.lng) {
      mostrarMiniMapa(parseFloat(contract.lat), parseFloat(contract.lng), contract.endereco || 'Local');
    }

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) { dropdown.style.display = 'none'; return; }

      debounce = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
          const results = await res.json();

          if (!results.length) { dropdown.style.display = 'none'; return; }

          dropdown.innerHTML = results.map((r, i) => {
            const name = r.display_name.split(',').slice(0, 3).join(',');
            const detail = r.display_name.split(',').slice(3).join(',').trim();
            return `<div class="nominatim-item" data-i="${i}" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name.replace(/"/g, '&quot;')}">
              <strong>${name}</strong>
              <span>${detail}</span>
            </div>`;
          }).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.nominatim-item').forEach(el => {
            el.addEventListener('click', () => {
              const lat = parseFloat(el.dataset.lat);
              const lng = parseFloat(el.dataset.lng);
              const nome = el.dataset.name;
              input.value = nome;
              latInput.value = lat;
              lngInput.value = lng;
              dropdown.style.display = 'none';
              mostrarMiniMapa(lat, lng, nome);
            });
          });
        } catch { dropdown.style.display = 'none'; }
      }, 450);
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', e => {
      if (!document.getElementById('enderecoWrap')?.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    }, { once: false });
  },

  async deleteContract(id) {
    if (!confirm('Tem certeza que deseja excluir este contrato?')) return;

    try {
      await Store.deleteContract(id);
      window.showToast('Contrato excluído com sucesso', 'success');
      this.render();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  }
};
