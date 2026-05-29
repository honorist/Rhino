window.ContasPagar = {
  filtroStatus: 'pendente',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadFor(['contas_pagar','fornecedores','contracts_lite']);
      // Dispara processamento de recorrências em background (F7) — idempotente.
      // Fire-and-forget é OK, mas o erro deve ser logado pra facilitar diagnóstico.
      fetch('/api/contas-pagar/processar-recorrencias', { method: 'POST' })
        .catch(e => console.warn('[ContasPagar] processar-recorrencias falhou:', e?.message || e));

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

      const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
        title: 'Contas a Pagar',
        subtitle: `${pendentes.length} pendente${pendentes.length !== 1 ? 's' : ''} · ${statusGeral.icone} ${statusGeral.texto} (${pctOk}% em dia)`,
        actions: '<button class="btn btn-primary btn-lg" id="btnNovaConta">+ Nova Conta</button>',
      }) : '';

      const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
        { label: 'A pagar',     value: Store.formatBRL(totalPendente), color: 'var(--color-danger)',
          hint: `${pendentes.length} conta${pendentes.length !== 1 ? 's' : ''}` },
        { label: 'Vencidas',    value: vencidas.length,        color: 'var(--color-danger)',  hint: '🔴 ação urgente' },
        { label: 'Próximos 7d', value: proximasVencer.length,  color: 'var(--color-warning)', hint: '⚠️ atenção' },
        { label: 'Pagas',       value: pagas.length,           color: 'var(--color-success)', hint: '💸 quitadas' },
      ]) : '';

      const html = `
        ${headerHtml}
        ${kpisHtml}

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

        ${window.UIKit?.chips ? `<div style="margin-bottom:var(--sp-md);">${window.UIKit.chips([
          { value: 'pendente', label: '⏳ Pendentes', count: pendentes.length, active: this.filtroStatus === 'pendente' },
          { value: 'pago',     label: '✅ Pagas',     count: pagas.length,     active: this.filtroStatus === 'pago' },
          { value: 'todos',    label: '📋 Todas',     count: contas.length,    active: this.filtroStatus === 'todos' },
        ], { name: 'cp-status' })}</div>` : ''}

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Descrição / NF</th>
                  <th scope="col">Fornecedor</th>
                  <th scope="col">Emissão</th>
                  <th scope="col">Vencimento</th>
                  <th scope="col" style="text-align:right;">Valor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ações</th>
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
                          ? `${window.UIKit?.statusPill ? window.UIKit.statusPill('pago') : '<span class="badge badge-entrada">Pago</span>'}
                             ${c.dataPagamento ? `<div style="font-size:15px;color:var(--color-text-muted);margin-top:2px;">${new Date(c.dataPagamento + 'T12:00:00').toLocaleDateString('pt-BR')}${c.formaPagamento ? ` · ${c.formaPagamento}` : ''}</div>` : ''}`
                          : vencida
                            ? (window.UIKit?.statusPill ? window.UIKit.statusPill('atrasado', 'Vencida') : '<span class="badge" style="background:rgba(229,62,62,.15);color:var(--color-danger);">Vencida</span>')
                            : (window.UIKit?.statusPill ? window.UIKit.statusPill('pendente') : '<span class="badge" style="background:rgba(214,158,46,.12);color:var(--color-warning);">Pendente</span>')
                        }
                      </td>
                      <td>
                        <div class="actions-cell">
                          ${c.status === 'pendente'
                            ? `<button type="button" class="action-link btn-pagar" data-id="${c.id}" style="color:var(--color-success);">Pagar</button>`
                            : `<button type="button" class="action-link btn-estornar" data-id="${c.id}" style="color:var(--color-text-muted);">Estornar</button>`
                          }
                          <button type="button" class="action-link btn-editar-cp" data-id="${c.id}">Editar</button>
                          <button type="button" class="action-link danger btn-excluir-cp" data-id="${c.id}">Excluir</button>
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
      document.querySelectorAll('[data-chips="cp-status"] .rh-chip').forEach(b => b.addEventListener('click', () => {
        this.filtroStatus = b.dataset.value || 'todos';
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
              <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
                <span>Descrição *</span>
                ${!conta ? `<button type="button" class="btn btn-sm btn-ghost" id="btnAiClassify" title="Classificar com IA">🤖 Classificar com IA</button>` : ''}
              </label>
              <input class="form-control" name="descricao" id="inputDescricao" value="${conta?.descricao || ''}" required placeholder="Ex: Material elétrico, Serviço de transporte...">
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
              <textarea class="form-control" name="observacoes" style="min-height:56px;">${window.escapeHtml(conta?.observacoes || '')}</textarea>
            </div>
            <div class="form-group" style="border-top:1px solid var(--color-border);padding-top:var(--sp-sm);margin-top:var(--sp-sm);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" name="recorrente" id="chkRecorrente" ${conta?.recorrente ? 'checked' : ''}>
                <span class="form-label" style="margin:0;">🔄 Conta recorrente (lançamento automático)</span>
              </label>
            </div>
            <div class="form-group" id="grpPeriodicidade" style="${conta?.recorrente ? '' : 'display:none;'}">
              <label class="form-label">Periodicidade</label>
              <select class="form-control" name="periodicidade">
                <option value="mensal"    ${(conta?.periodicidade||'mensal')==='mensal'    ?'selected':''}>Mensal</option>
                <option value="semanal"   ${conta?.periodicidade==='semanal'   ?'selected':''}>Semanal</option>
                <option value="quinzenal" ${conta?.periodicidade==='quinzenal' ?'selected':''}>Quinzenal</option>
                <option value="trimestral"${conta?.periodicidade==='trimestral'?'selected':''}>Trimestral</option>
                <option value="semestral" ${conta?.periodicidade==='semestral' ?'selected':''}>Semestral</option>
                <option value="anual"     ${conta?.periodicidade==='anual'     ?'selected':''}>Anual</option>
              </select>
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

    // Toggle periodicidade
    const chkRec = document.getElementById('chkRecorrente');
    const grpPer = document.getElementById('grpPeriodicidade');
    if (chkRec && grpPer) {
      chkRec.addEventListener('change', () => { grpPer.style.display = chkRec.checked ? '' : 'none'; });
    }

    // F16: AI auto-classify
    const btnAiCls = document.getElementById('btnAiClassify');
    if (btnAiCls) {
      btnAiCls.addEventListener('click', async () => {
        const descEl = document.getElementById('inputDescricao');
        const desc = (descEl?.value || '').trim();
        if (!desc) { window.showToast('Preencha a descrição primeiro', 'warn'); return; }
        const valorEl = document.querySelector('#formConta [name="valor"]');
        const forncEl = document.querySelector('#formConta [name="fornecedorId"]');
        const fornecNome = forncEl?.options[forncEl.selectedIndex]?.text || '';
        btnAiCls.disabled = true; btnAiCls.textContent = '⏳ Classificando…';
        try {
          const r = await fetch('/api/ai/classify-expense', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descricao: desc, valor: window.BRLInput?.parse(valorEl?.value) || 0, fornecedor: fornecNome }),
            credentials: 'same-origin',
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          if (data.category) {
            const catEl = document.querySelector('#formConta [name="category"]');
            if (catEl) catEl.value = data.category;
          }
          if (data.contractId) {
            const ctrEl = document.querySelector('#formConta [name="contractId"]');
            if (ctrEl) ctrEl.value = data.contractId;
          }
          const conf = data.confidence ? ` (${Math.round(data.confidence * 100)}% confiança)` : '';
          window.showToast(`IA sugeriu: ${data.category}${conf}`, 'success');
        } catch (e) {
          window.showToast('IA não disponível: ' + e.message, 'warn');
        } finally {
          btnAiCls.disabled = false; btnAiCls.textContent = '🤖 Classificar com IA';
        }
      });
    }

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formConta'));
      const data = Object.fromEntries(fd);
      if (!data.descricao?.trim()) { window.showToast('Descrição é obrigatória', 'error'); return; }
      if (!data.dataVencimento) { window.showToast('Data de vencimento é obrigatória', 'error'); return; }
      data.valor = window.BRLInput.parse(data.valor);
      if (!data.valor) { window.showToast('Valor inválido', 'error'); return; }
      if (!data.fornecedorId) delete data.fornecedorId;
      if (!data.contractId) delete data.contractId;
      data.recorrente = !!data.recorrente;
      if (!data.recorrente) delete data.periodicidade;

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
