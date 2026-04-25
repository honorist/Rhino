window.ContasPagar = {
  filtroStatus: 'pendente',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const contas = Store.state.contas_pagar || [];
      const hojeStr = new Date().toISOString().split('T')[0];
      const em7 = new Date(); em7.setDate(em7.getDate() + 7);
      const em7Str = em7.toISOString().split('T')[0];

      const pendentes = contas.filter(c => c.status === 'pendente');
      const pagas = contas.filter(c => c.status === 'pago');
      const noPrazo = pendentes.filter(c => c.dataVencimento && c.dataVencimento > em7Str);
      const vencidas = pendentes.filter(c => c.dataVencimento && c.dataVencimento < hojeStr);
      const proximasVencer = pendentes.filter(c => c.dataVencimento && c.dataVencimento >= hojeStr && c.dataVencimento <= em7Str);
      const totalPendente = pendentes.reduce((s, c) => s + c.valor, 0);
      const totalPago = pagas.reduce((s, c) => s + (c.valorPago || c.valor), 0);

      const total = contas.length;
      const pctOk = total > 0 ? Math.round(((pagas.length + noPrazo.length) / total) * 100) : 100;
      const statusGeral = vencidas.length > 0
        ? { cor: '#E53E3E', bg: 'rgba(229,62,62,.07)', texto: 'Atenção urgente', icone: '🔴' }
        : proximasVencer.length > 0
          ? { cor: '#D69E2E', bg: 'rgba(214,158,46,.07)', texto: 'Requer atenção', icone: '⚠️' }
          : { cor: '#38A169', bg: 'rgba(56,161,105,.07)', texto: 'Tudo em dia', icone: '✅' };

      // Próximas a vencer (timeline)
      const proximasTimeline = pendentes
        .filter(c => {
          const diff = c.dataVencimento ? Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000) : null;
          return diff !== null && diff >= -30 && diff <= 30;
        })
        .sort((a, b) => (a.dataVencimento || '').localeCompare(b.dataVencimento || ''))
        .slice(0, 5);

      const filtradas = this.filtroStatus === 'pendente' ? pendentes
        : this.filtroStatus === 'pago' ? pagas : contas;

      const html = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Contas a Pagar</h1>
            <p class="page-subtitle">${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''} · Total ${Store.formatBRL(totalPendente)}</p>
          </div>
          <button class="btn btn-primary btn-lg" id="btnNovaConta">+ Nova Conta</button>
        </div>

        <!-- Painel de status (faixa compacta) -->
        <div style="background:${statusGeral.bg};border:1px solid ${statusGeral.cor}30;border-radius:8px;padding:var(--sp-sm) var(--sp-md);margin-bottom:var(--sp-lg);display:flex;align-items:center;gap:var(--sp-lg);flex-wrap:wrap;">

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;">🔴</span>
            <span style="font-size:18px;font-weight:800;color:#E53E3E;line-height:1;">${vencidas.length}</span>
            <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Vencidas</span>
          </div>

          <div style="width:1px;height:20px;background:${statusGeral.cor}25;"></div>

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;">⚠️</span>
            <span style="font-size:18px;font-weight:800;color:#D69E2E;line-height:1;">${proximasVencer.length}</span>
            <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Próx. 7d</span>
          </div>

          <div style="width:1px;height:20px;background:${statusGeral.cor}25;"></div>

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;">✅</span>
            <span style="font-size:18px;font-weight:800;color:#38A169;line-height:1;">${noPrazo.length}</span>
            <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">No prazo</span>
          </div>

          <div style="width:1px;height:20px;background:${statusGeral.cor}25;"></div>

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;">💸</span>
            <span style="font-size:18px;font-weight:800;color:#3182CE;line-height:1;">${pagas.length}</span>
            <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Pagas</span>
          </div>

          <div style="width:1px;height:20px;background:${statusGeral.cor}25;"></div>

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;">💰</span>
            <span style="font-size:15px;font-weight:800;color:var(--color-danger);line-height:1;">${Store.formatBRL(totalPendente)}</span>
            <span style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">A pagar</span>
          </div>

          <div style="flex:1;"></div>

          <div style="display:flex;align-items:center;gap:var(--sp-sm);">
            <span style="font-size:15px;font-weight:700;color:${statusGeral.cor};">${statusGeral.icone} ${statusGeral.texto}</span>
            <div style="width:80px;height:6px;background:rgba(0,0,0,.08);border-radius:99px;overflow:hidden;">
              <div style="height:100%;width:${pctOk}%;background:${statusGeral.cor};border-radius:99px;transition:width .5s;"></div>
            </div>
            <span style="font-size:15px;font-weight:800;color:${statusGeral.cor};">${pctOk}%</span>
          </div>
        </div>

        <!-- Timeline de próximos vencimentos -->
        ${proximasTimeline.length > 0 ? `
          <div class="card" style="margin-bottom:var(--sp-xl);">
            <div class="card-header">
              <h3 class="card-title">Próximos Vencimentos</h3>
            </div>
            <div style="display:flex;flex-direction:column;gap:0;">
              ${proximasTimeline.map((c, idx) => {
                const fornecedor = (Store.state.fornecedores || []).find(f => f.id === c.fornecedorId);
                const dias = Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000);
                const cor = dias < 0 ? '#E53E3E' : dias <= 7 ? '#D69E2E' : '#38A169';
                const diasTxt = dias < 0 ? `${Math.abs(dias)}d atrás` : dias === 0 ? 'HOJE' : `em ${dias}d`;
                return `
                  <div style="display:flex;align-items:center;gap:var(--sp-lg);padding:var(--sp-md) 0;${idx < proximasTimeline.length - 1 ? 'border-bottom:1px solid var(--color-border);' : ''}">
                    <div style="text-align:center;min-width:52px;">
                      <div style="font-size:20px;font-weight:900;color:${cor};line-height:1;">${new Date(c.dataVencimento + 'T12:00:00').getDate()}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;">${new Date(c.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR', {month:'short'})}</div>
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.descricao)}</div>
                      <div style="font-size:15px;color:var(--color-text-muted);">${fornecedor ? escapeHtml(fornecedor.nome) : '—'}${c.numeroNF ? ` · NF ${escapeHtml(c.numeroNF)}` : ''}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-weight:700;color:var(--color-danger);font-size:15px;">${Store.formatBRL(c.valor)}</div>
                      <div style="font-size:15px;font-weight:700;color:${cor};">${diasTxt}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Filtros de status -->
        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);display:flex;gap:var(--sp-sm);">
          ${[
            { s:'pendente', cor:'var(--color-warning)', label:'⏳ Pendentes' },
            { s:'pago',     cor:'var(--color-success)', label:'✅ Pagas' },
            { s:'todos',    cor:'var(--color-primary)', label:'📋 Todas' }
          ].map(f => `
            <button class="btn btn-sm btn-filtro-status" data-status="${f.s}" style="font-size:15px;font-weight:600;${this.filtroStatus === f.s ? `background:${f.cor};color:#fff;border:1px solid ${f.cor};` : 'background:transparent;color:var(--color-text);border:1px solid var(--color-border);'}">
              ${f.label}
            </button>
          `).join('')}
        </div>

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Descrição / NF</th>
                  <th>Fornecedor</th>
                  <th>Emissão</th>
                  <th>Vencimento</th>
                  <th style="text-align:right;">Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${filtradas.length === 0 ? `
                  <tr><td colspan="7" class="text-center text-muted" style="padding:var(--sp-xl);">
                    Nenhuma conta ${this.filtroStatus === 'pendente' ? 'pendente' : this.filtroStatus === 'pago' ? 'paga' : ''} cadastrada
                  </td></tr>
                ` : filtradas.sort((a, b) => {
                  if (a.status === 'pendente' && b.status !== 'pendente') return -1;
                  if (a.status !== 'pendente' && b.status === 'pendente') return 1;
                  return (a.dataVencimento || '') < (b.dataVencimento || '') ? -1 : 1;
                }).map(c => {
                  const fornecedor = (Store.state.fornecedores || []).find(f => f.id === c.fornecedorId);
                  const vencida = c.status === 'pendente' && c.dataVencimento && c.dataVencimento < hojeStr;
                  const proxima = c.status === 'pendente' && c.dataVencimento && c.dataVencimento >= hojeStr && c.dataVencimento <= em7Str;
                  const vencCor = vencida ? 'var(--color-danger)' : proxima ? 'var(--color-warning)' : 'var(--color-text)';
                  const diasLabel = c.dataVencimento && c.status === 'pendente'
                    ? (() => {
                        const dias = Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000);
                        return dias < 0 ? `<div style="font-size:15px;color:var(--color-danger);font-weight:700;">${Math.abs(dias)}d vencida</div>`
                          : dias === 0 ? `<div style="font-size:15px;color:var(--color-warning);font-weight:700;">vence hoje</div>`
                          : `<div style="font-size:15px;color:var(--color-text-muted);">em ${dias}d</div>`;
                      })()
                    : '';
                  return `
                    <tr class="row-cp" data-id="${c.id}" style="cursor:pointer;">
                      <td>
                        <strong>${escapeHtml(c.descricao) || '—'}</strong>
                        ${c.numeroNF ? `<div style="font-size:15px;color:var(--color-text-muted);">NF ${escapeHtml(c.numeroNF)}</div>` : ''}
                      </td>
                      <td>${fornecedor ? escapeHtml(fornecedor.nome) || '—' : '<span style="color:var(--color-text-muted);">—</span>'}</td>
                      <td style="font-size:15px;">${c.dataEmissao ? new Date(c.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <span style="color:${vencCor};font-weight:${vencida || proxima ? '700' : '400'}">
                          ${c.dataVencimento ? new Date(c.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </span>
                        ${diasLabel}
                      </td>
                      <td style="text-align:right;font-weight:700;font-size:15px;color:var(--color-danger);">
                        ${Store.formatBRL(c.valor)}
                      </td>
                      <td>
                        ${c.status === 'pago'
                          ? `<span class="badge badge-entrada">Pago</span>
                             ${c.dataPagamento ? `<div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">${new Date(c.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}${c.formaPagamento ? ` · ${c.formaPagamento}` : ''}</div>` : ''}`
                          : vencida
                            ? `<span class="badge" style="background:rgba(229,62,62,.15);color:var(--color-danger);">Vencida</span>`
                            : `<span class="badge" style="background:rgba(214,158,46,.12);color:var(--color-warning);">Pendente</span>`
                        }
                      </td>
                      <td>
                        <div class="actions-cell">
                          ${c.status === 'pendente'
                            ? `<a class="action-link btn-pagar" data-id="${c.id}" style="color:var(--color-success);">Pagar</a>`
                            : `<a class="action-link btn-estornar" data-id="${c.id}" style="color:var(--color-text-muted);">Estornar</a>`
                          }
                          <a class="action-link btn-editar-cp" data-id="${c.id}">Editar</a>
                          <a class="action-link danger btn-excluir-cp" data-id="${c.id}">Excluir</a>
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

      app.innerHTML = html;

      document.getElementById('btnNovaConta').addEventListener('click', () => this.showModal());
      document.querySelectorAll('.btn-filtro-status').forEach(b => b.addEventListener('click', e => {
        this.filtroStatus = e.target.dataset.status;
        this.render();
      }));
      document.querySelectorAll('.btn-pagar').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.showModalPagar(e.target.dataset.id); }));
      document.querySelectorAll('.btn-estornar').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.estornar(e.target.dataset.id); }));
      document.querySelectorAll('.btn-editar-cp').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const conta = (Store.state.contas_pagar || []).find(c => c.id === e.target.dataset.id);
        this.showModal(conta);
      }));
      document.querySelectorAll('.btn-excluir-cp').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.excluir(e.target.dataset.id); }));

      document.querySelectorAll('.row-cp').forEach(tr => {
        tr.addEventListener('click', e => {
          if (e.target.closest('.actions-cell')) return;
          this.showDetail(tr.dataset.id);
        });
      });

    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar contas a pagar. Tente novamente.</p></div>';
    }
  },

  showDetail(id) {
    const c = (Store.state.contas_pagar || []).find(x => x.id === id);
    if (!c) return;
    const fmtD = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const fornecedor = c.fornecedorId ? (Store.state.fornecedores || []).find(f => f.id === c.fornecedorId) : null;
    const contract = c.contractId ? Store.getContractById(c.contractId) : null;
    const dias = c.dataVencimento ? Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000) : null;
    const vencida = c.status === 'pendente' && dias !== null && dias < 0;

    const row = (lbl, val) => val ? `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span style="color:var(--color-text-muted);">${lbl}</span><span style="font-weight:500;text-align:right;">${val}</span></div>` : '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:620px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(c.descricao) || '—'}</h2>
              <div style="margin-top:6px;">
                <span class="badge" style="background:${c.status === 'pago' ? 'rgba(56,161,105,.15)' : vencida ? 'rgba(229,62,62,.15)' : 'rgba(214,158,46,.12)'};color:${c.status === 'pago' ? 'var(--color-success)' : vencida ? 'var(--color-danger)' : 'var(--color-warning)'};">${c.status === 'pago' ? 'Pago' : vencida ? 'Vencida' : 'Pendente'}</span>
                <span style="font-size:22px;font-weight:700;color:var(--color-danger);margin-left:12px;">${Store.formatBRL(c.valor)}</span>
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            ${row('Fornecedor',      fornecedor ? escapeHtml(fornecedor.nome) : null)}
            ${row('Nº NF',           c.numeroNF ? escapeHtml(c.numeroNF) : null)}
            ${row('Data de Emissão', fmtD(c.dataEmissao))}
            ${row('Vencimento',      c.dataVencimento ? `${fmtD(c.dataVencimento)} ${dias !== null ? `<span style="color:var(--color-text-muted);font-size:13px;">(${dias < 0 ? Math.abs(dias) + ' dias vencida' : dias === 0 ? 'hoje' : 'em ' + dias + ' dias'})</span>` : ''}` : null)}
            ${row('Categoria',       c.category ? escapeHtml(c.category) : null)}
            ${row('Contrato',        contract ? `<a href="#/contratos/${contract.id}" style="color:var(--color-primary);">${escapeHtml(contract.name)}</a>` : null)}
            ${c.status === 'pago' ? `
              ${row('Data do Pagto.',  fmtD(c.dataPagamento))}
              ${row('Valor Pago',      c.valorPago != null ? Store.formatBRL(c.valorPago) : null)}
              ${row('Forma de Pagto.', c.formaPagamento ? escapeHtml(c.formaPagamento) : null)}
            ` : ''}
            ${row('Observações',     c.observacoes ? escapeHtml(c.observacoes) : null)}
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:var(--sp-md);font-family:monospace;">ID: ${escapeHtml(c.id)}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnDetClose">Fechar</button>
            ${c.status === 'pendente'
              ? `<button class="btn btn-primary" id="btnDetPagar" style="background:var(--color-success);border-color:var(--color-success);">Marcar como pago</button>`
              : `<button class="btn btn-secondary" id="btnDetEstornar">Estornar</button>`}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnDetClose').addEventListener('click', close);
    const bPagar = document.getElementById('btnDetPagar');
    if (bPagar) bPagar.addEventListener('click', () => { close(); this.showModalPagar(id); });
    const bEst = document.getElementById('btnDetEstornar');
    if (bEst) bEst.addEventListener('click', () => { close(); this.estornar(id); });
  },

  showModal(conta) {
    const fornecedores = Store.state.fornecedores || [];
    const contratos = Store.state.contracts || [];
    const title = conta ? 'Editar Conta' : 'Nova Conta a Pagar';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:580px;">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formConta" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="descricao" value="${conta?.descricao || ''}" required placeholder="Ex: Material elétrico, Serviço de transporte...">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número da NF</label>
                <input class="form-control" name="numeroNF" value="${conta?.numeroNF || ''}" placeholder="Ex: 001234">
              </div>
              <div class="form-group">
                <label class="form-label">Categoria</label>
                <select class="form-control" name="category">
                  <option value="fornecedor" ${(conta?.category||'fornecedor')==='fornecedor'?'selected':''}>Fornecedor</option>
                  <option value="mao_de_obra" ${conta?.category==='mao_de_obra'?'selected':''}>Mão de Obra</option>
                  <option value="material" ${conta?.category==='material'?'selected':''}>Material</option>
                  <option value="hospedagem" ${conta?.category==='hospedagem'?'selected':''}>Hospedagem</option>
                  <option value="transporte" ${conta?.category==='transporte'?'selected':''}>Transporte</option>
                  <option value="servico" ${conta?.category==='servico'?'selected':''}>Serviço</option>
                  <option value="outros" ${conta?.category==='outros'?'selected':''}>Outros</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fornecedor</label>
                <select class="form-control" name="fornecedorId">
                  <option value="">— Selecionar —</option>
                  ${fornecedores.map(f => `<option value="${f.id}" ${conta?.fornecedorId === f.id ? 'selected' : ''}>${escapeHtml(f.nome)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Contrato (opcional)</label>
                <select class="form-control" name="contractId">
                  <option value="">— Nenhum —</option>
                  ${contratos.map(c => `<option value="${c.id}" ${conta?.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Valor *</label>
                <input class="form-control" name="valor" data-currency value="${conta?.valor ? window.BRLInput.toDisplay(conta.valor) : ''}" required placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label">Data de Emissão</label>
                <input class="form-control" name="dataEmissao" type="date" value="${conta?.dataEmissao || new Date().toISOString().split('T')[0]}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Data de Vencimento *</label>
              <input class="form-control" name="dataVencimento" type="date" value="${conta?.dataVencimento || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" style="min-height:56px;">${conta?.observacoes || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${conta ? 'Atualizar' : 'Criar'}</button>
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

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formConta'));
      const data = Object.fromEntries(fd);
      if (!data.descricao?.trim()) { window.showToast('Descrição é obrigatória', 'error'); return; }
      if (!data.dataVencimento) { window.showToast('Data de vencimento é obrigatória', 'error'); return; }
      data.valor = window.BRLInput.parse(data.valor);
      if (!data.valor) { window.showToast('Valor inválido', 'error'); return; }
      if (!data.fornecedorId) delete data.fornecedorId;
      if (!data.contractId) delete data.contractId;

      try {
        if (conta) await Store.updateContaPagar(conta.id, data);
        else await Store.createContaPagar(data);
        window.showToast(conta ? 'Conta atualizada' : 'Conta criada', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  showModalPagar(id) {
    const conta = (Store.state.contas_pagar || []).find(c => c.id === id);
    if (!conta) return;

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:420px;">
          <div class="modal-header">
            <h2 class="modal-title">Registrar Pagamento</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <p style="margin-bottom:var(--sp-md);color:var(--color-text-muted);">
              <strong style="color:var(--color-text);">${escapeHtml(conta.descricao)}</strong>
              ${conta.numeroNF ? ` — NF ${escapeHtml(conta.numeroNF)}` : ''}
            </p>
            <div class="form-group">
              <label class="form-label">Forma de Pagamento</label>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;" id="formasPagamento">
                ${['PIX','Boleto','Cartão','Transferência','Dinheiro','Cheque'].map(f => `
                  <button type="button" class="btn-forma-pag" data-forma="${f}" style="padding:8px 4px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text-muted);font-size:15px;font-weight:500;cursor:pointer;transition:all .15s;">
                    ${f === 'PIX' ? '⚡' : f === 'Boleto' ? '📄' : f === 'Cartão' ? '💳' : f === 'Transferência' ? '🏦' : f === 'Dinheiro' ? '💵' : '📝'} ${f}
                  </button>`).join('')}
              </div>
              <input type="hidden" id="formaPagamento" value="PIX">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data do Pagamento</label>
                <input class="form-control" id="dataPagamento" type="date" value="${new Date().toISOString().split('T')[0]}">
              </div>
              <div class="form-group">
                <label class="form-label">Valor Pago</label>
                <input class="form-control" id="valorPago" data-currency value="${window.BRLInput.toDisplay(conta.valor)}" placeholder="0,00">
              </div>
            </div>
            <p style="font-size:15px;color:var(--color-text-muted);margin-top:var(--sp-sm);">
              Uma saída de <strong>${Store.formatBRL(conta.valor)}</strong> será criada automaticamente no Caixa.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnConfirmarPagamento" style="background:var(--color-success);border-color:var(--color-success);">✓ Confirmar Pagamento</button>
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

    // Payment method button selection
    const formaInput = document.getElementById('formaPagamento');
    const formaBtns = document.querySelectorAll('.btn-forma-pag');
    const selectForma = (forma) => {
      formaInput.value = forma;
      formaBtns.forEach(b => {
        const active = b.dataset.forma === forma;
        b.style.background = active ? 'var(--color-primary)' : 'var(--color-surface)';
        b.style.color = active ? '#fff' : 'var(--color-text-muted)';
        b.style.borderColor = active ? 'var(--color-primary)' : 'var(--color-border)';
        b.style.fontWeight = active ? '700' : '500';
      });
    };
    formaBtns.forEach(b => b.addEventListener('click', () => selectForma(b.dataset.forma)));
    selectForma('PIX'); // default

    document.getElementById('btnConfirmarPagamento').addEventListener('click', async () => {
      const dataPagamento = document.getElementById('dataPagamento').value;
      const valorPago = window.BRLInput.parse(document.getElementById('valorPago').value);
      const formaPagamento = formaInput.value;
      if (!dataPagamento) { window.showToast('Informe a data do pagamento', 'error'); return; }
      try {
        await Store.pagarConta(id, { dataPagamento, valorPago, formaPagamento });
        window.showToast('Pagamento registrado — saída lançada no Caixa', 'success');
        close();
        this.render();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async estornar(id) {
    if (!confirm('Estornar este pagamento? A saída no caixa será removida.')) return;
    try {
      await Store.estornarConta(id);
      window.showToast('Pagamento estornado', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async excluir(id) {
    if (!confirm('Excluir esta conta? Se estiver paga, a saída no caixa também será removida.')) return;
    try {
      await Store.deleteContaPagar(id);
      window.showToast('Conta removida', 'success');
      this.render();
    } catch (e) { window.showToast(e.message, 'error'); }
  }
};
