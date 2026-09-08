/* Rhino · ContratoDetail · Aditivos e Marcos
   Estende o objeto window.ContratoDetail já definido.

   Extraído do core na Fase 5 do plano cozy-churning-fog: movimento puro, sem
   mudança de comportamento. Aditivos e Marcos moram juntos porque compartilham
   o mesmo formato (lista + modal simples de CRUD sobre um sub-recurso do
   contrato) e as mesmas rotas /api/contracts/:id/<recurso>. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/extras] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  renderAditivosSection(contract, contractId) {
    const aditivos = contract.aditivos || [];
    const fmt = Store.formatBRL;
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const tipoLabel = { valor: 'Valor', prazo: 'Prazo', escopo: 'Escopo' };
    const totalValorDelta = aditivos.reduce((s, a) => s + (parseFloat(a.valorDelta) || 0), 0);
    const totalDiasDelta = aditivos.reduce((s, a) => s + (parseInt(a.diasDelta) || 0), 0);
    return `
    <div class="card mb-2xl">
      <div class="card-header">
        <h3 class="card-title">Aditivos de Contrato</h3>
        ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovoAditivo">+ Novo Aditivo</button>` : ''}
      </div>
      ${totalValorDelta !== 0 || totalDiasDelta !== 0 ? `
      <div style="display:flex;gap:var(--sp-lg);padding:var(--sp-md) var(--sp-lg);background:var(--color-surface-2);border-bottom:1px solid var(--color-border);">
        <span class="text-muted font-sm">Total aditado: <strong style="color:${totalValorDelta >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${totalValorDelta >= 0 ? '+' : ''}${fmt(totalValorDelta)}</strong></span>
        ${totalDiasDelta !== 0 ? `<span class="text-muted font-sm">Prorrogação: <strong>${totalDiasDelta > 0 ? '+' : ''}${totalDiasDelta} dias</strong></span>` : ''}
      </div>` : ''}
      ${aditivos.length === 0 ? `
      <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
        <div style="font-size:44px;margin-bottom:8px;opacity:.6;">📝</div>
        <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum aditivo cadastrado</div>
        <div style="font-size:13px;">Registre alterações de escopo, prazo ou valor deste contrato.</div>
      </div>` : `
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Nº</th><th scope="col">Tipo</th><th scope="col">Descrição</th><th scope="col">Valor Δ</th><th scope="col">Prazo Δ</th><th scope="col">Data</th><th scope="col">Status</th>${this._podeEditar() ? '<th scope="col"></th>' : ''}</tr></thead>
          <tbody>
            ${aditivos.map(a => `
            <tr>
              <td>${escapeHtml(a.numero || '—')}</td>
              <td><span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:var(--color-surface-2);">${tipoLabel[a.tipo] || a.tipo}</span></td>
              <td>${escapeHtml(a.descricao)}</td>
              <td style="font-weight:700;color:${parseFloat(a.valorDelta) >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${parseFloat(a.valorDelta) >= 0 ? '+' : ''}${fmt(a.valorDelta)}</td>
              <td>${parseInt(a.diasDelta) ? `${parseInt(a.diasDelta) > 0 ? '+' : ''}${a.diasDelta}d` : '—'}</td>
              <td>${fmtDate(a.data)}</td>
              <td><span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${a.aprovado ? '#D1FAE5' : '#FEF3C7'};color:${a.aprovado ? '#065F46' : '#92400E'};">${a.aprovado ? 'Aprovado' : 'Pendente'}</span></td>
              ${this._podeEditar() ? `<td><button class="btn btn-sm btn-secondary btn-edit-aditivo" data-id="${a.id}" style="margin-right:4px;">Editar</button><button class="btn btn-sm btn-danger btn-del-aditivo" data-id="${a.id}">✕</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
  },

  _attachAditivosListeners(contractId) {
    document.getElementById('btnNovoAditivo')?.addEventListener('click', () => this._showModalAditivo(contractId, null));
    document.querySelectorAll('.btn-edit-aditivo').forEach(b => b.addEventListener('click', () => {
      const contract = Store.getContractById(contractId);
      const item = (contract?.aditivos || []).find(a => a.id === b.dataset.id);
      this._showModalAditivo(contractId, item);
    }));
    document.querySelectorAll('.btn-del-aditivo').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Excluir este aditivo?')) return;
      await fetch(`/api/contracts/${contractId}/aditivos/${b.dataset.id}`, { method: 'DELETE' });
      await Store.loadContract(contractId, { force: true }); this.render({ id: contractId });
    }));
  },

  _showModalAditivo(contractId, item) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header"><h2 class="modal-title">${item ? 'Editar Aditivo' : 'Novo Aditivo'}</h2></div>
        <div class="modal-body">
          <form id="formAditivo" style="display:flex;flex-direction:column;gap:var(--sp-md);">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
              <div class="form-group" style="margin:0;"><label class="form-label">Número</label><input class="form-control" name="numero" value="${escapeHtml(item?.numero || '')}"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Tipo</label><select class="form-control" name="tipo"><option value="valor" ${(!item || item.tipo === 'valor') ? 'selected' : ''}>Valor</option><option value="prazo" ${item?.tipo === 'prazo' ? 'selected' : ''}>Prazo</option><option value="escopo" ${item?.tipo === 'escopo' ? 'selected' : ''}>Escopo</option></select></div>
            </div>
            <div class="form-group" style="margin:0;"><label class="form-label">Descrição *</label><textarea class="form-control" name="descricao" style="min-height:60px;">${escapeHtml(item?.descricao || '')}</textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-md);">
              <div class="form-group" style="margin:0;"><label class="form-label">Valor Δ (R$)</label><input class="form-control" name="valorDelta" type="number" step="0.01" value="${item?.valorDelta || 0}"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Prazo Δ (dias)</label><input class="form-control" name="diasDelta" type="number" value="${item?.diasDelta || 0}"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Data</label><input class="form-control" name="data" type="date" value="${item?.data || ''}"></div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;"><input type="checkbox" name="aprovado" ${item?.aprovado ? 'checked' : ''}> Aprovado</label>
          </form>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" id="btnCancelarAditivo">Cancelar</button><button class="btn btn-primary" id="btnSalvarAditivo">${item ? 'Atualizar' : 'Criar'}</button></div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
      firstInput?.focus();
    }, 50);
    document.getElementById('btnCancelarAditivo').addEventListener('click', () => modal.remove());
    document.getElementById('btnSalvarAditivo').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAditivo'));
      const data = Object.fromEntries(fd);
      data.aprovado = document.querySelector('[name=aprovado]').checked;
      if (!data.descricao?.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      const url = item ? `/api/contracts/${contractId}/aditivos/${item.id}` : `/api/contracts/${contractId}/aditivos`;
      await fetch(url, { method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      await Store.loadContract(contractId, { force: true }); modal.remove(); this.render({ id: contractId });
    });
  },

  // ── Marcos ────────────────────────────────────────────────────────────────

  renderMarcosSection(contract, contractId) {
    const marcos = contract.marcos || [];
    const total = marcos.length;
    const done = marcos.filter(m => m.concluido).length;
    const pct = total > 0 ? (done / total * 100) : 0;
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    return `
    <div class="card mb-2xl">
      <div class="card-header">
        <div>
          <h3 class="card-title">Checklist de Marcos</h3>
          <div class="rh-meta-xs">${done}/${total} concluídos · ${pct.toFixed(0)}%</div>
        </div>
        ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovoMarco">+ Novo Marco</button>` : ''}
      </div>
      ${total > 0 ? `<div style="padding:0 var(--sp-lg) var(--sp-md);"><div style="height:6px;background:var(--color-surface-2);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--color-success);transition:width .4s;border-radius:3px;"></div></div></div>` : ''}
      ${marcos.length === 0 ? `
      <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
        <div style="font-size:44px;margin-bottom:8px;opacity:.6;">🚩</div>
        <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum marco cadastrado</div>
        <div style="font-size:13px;">Marque datas importantes do cronograma deste contrato.</div>
      </div>` :
        marcos.map(m => {
          const vencido = !m.concluido && m.prazo && new Date(m.prazo + 'T12:00:00') < hoje;
          const proximo = !m.concluido && m.prazo && !vencido && Math.ceil((new Date(m.prazo + 'T12:00:00') - hoje) / 86400000) <= 7;
          return `
          <div style="display:flex;align-items:flex-start;gap:var(--sp-md);padding:var(--sp-md) var(--sp-lg);border-bottom:1px solid var(--color-border);">
            <button class="btn-toggle-marco" data-id="${m.id}" data-concluido="${m.concluido}" style="flex-shrink:0;width:22px;height:22px;border-radius:4px;border:2px solid ${m.concluido ? 'var(--color-success)' : 'var(--color-border)'};background:${m.concluido ? 'var(--color-success)' : 'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">${m.concluido ? '✓' : ''}</button>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:14px;${m.concluido ? 'text-decoration:line-through;color:var(--color-text-muted);' : ''}">${escapeHtml(m.titulo)}</div>
              ${m.descricao ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">${escapeHtml(m.descricao)}</div>` : ''}
              ${m.prazo ? `<div style="font-size:12px;margin-top:4px;color:${vencido ? 'var(--color-danger)' : proximo ? 'var(--color-warning)' : 'var(--color-text-muted)'};">${vencido ? '⚠ Vencido: ' : ''}Prazo: ${fmtDate(m.prazo)}${m.concluido && m.concluidoEm ? ` · Concluído: ${fmtDate(m.concluidoEm)}` : ''}</div>` : ''}
            </div>
            ${this._podeEditar() ? `<div style="display:flex;gap:4px;flex-shrink:0;"><button class="btn btn-sm btn-secondary btn-edit-marco" data-id="${m.id}">Editar</button><button class="btn btn-sm btn-danger btn-del-marco" data-id="${m.id}">✕</button></div>` : ''}
          </div>`}).join('')}
    </div>`;
  },

  _attachMarcosListeners(contractId) {
    document.getElementById('btnNovoMarco')?.addEventListener('click', () => this._showModalMarco(contractId, null));
    document.querySelectorAll('.btn-toggle-marco').forEach(b => b.addEventListener('click', async () => {
      const nowDone = b.dataset.concluido === 'true';
      await fetch(`/api/contracts/${contractId}/marcos/${b.dataset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concluido: !nowDone }) });
      await Store.loadContract(contractId, { force: true }); this.render({ id: contractId });
    }));
    document.querySelectorAll('.btn-edit-marco').forEach(b => b.addEventListener('click', () => {
      const contract = Store.getContractById(contractId);
      const item = (contract?.marcos || []).find(m => m.id === b.dataset.id);
      this._showModalMarco(contractId, item);
    }));
    document.querySelectorAll('.btn-del-marco').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Excluir este marco?')) return;
      await fetch(`/api/contracts/${contractId}/marcos/${b.dataset.id}`, { method: 'DELETE' });
      await Store.loadContract(contractId, { force: true }); this.render({ id: contractId });
    }));
  },

  _showModalMarco(contractId, item) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px;">
        <div class="modal-header"><h2 class="modal-title">${item ? 'Editar Marco' : 'Novo Marco'}</h2></div>
        <div class="modal-body">
          <form id="formMarco" style="display:flex;flex-direction:column;gap:var(--sp-md);">
            <div class="form-group" style="margin:0;"><label class="form-label">Título *</label><input class="form-control" name="titulo" value="${escapeHtml(item?.titulo || '')}"></div>
            <div class="form-group" style="margin:0;"><label class="form-label">Descrição</label><textarea class="form-control" name="descricao" style="min-height:60px;">${escapeHtml(item?.descricao || '')}</textarea></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);">
              <div class="form-group" style="margin:0;"><label class="form-label">Prazo</label><input class="form-control" name="prazo" type="date" value="${item?.prazo || ''}"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Ordem</label><input class="form-control" name="ordem" type="number" value="${item?.ordem || 0}"></div>
            </div>
          </form>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" id="btnCancelarMarco">Cancelar</button><button class="btn btn-primary" id="btnSalvarMarco">${item ? 'Atualizar' : 'Criar'}</button></div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
      firstInput?.focus();
    }, 50);
    document.getElementById('btnCancelarMarco').addEventListener('click', () => modal.remove());
    document.getElementById('btnSalvarMarco').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formMarco'));
      const data = Object.fromEntries(fd);
      if (!data.titulo?.trim()) { window.showToast('Título obrigatório', 'error'); return; }
      const url = item ? `/api/contracts/${contractId}/marcos/${item.id}` : `/api/contracts/${contractId}/marcos`;
      await fetch(url, { method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      await Store.loadContract(contractId, { force: true }); modal.remove(); this.render({ id: contractId });
    });
  },
  });
})();
