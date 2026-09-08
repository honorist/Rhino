/* Rhino · ContratoDetail · Ocorrências da obra
   Estende o objeto window.ContratoDetail já definido.

   Extraído do core na Fase 5 do plano cozy-churning-fog (movimento puro).
   Fica junto de Punch e SSMA no grupo "Qualidade & Segurança" — as três
   registram a mesma família de coisa e agora são lidas de forma unificada
   por GET /api/contracts/:id/qualidade; a ESCRITA continua em cada origem. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/ocorrencias] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  renderOcorrenciasSection(contract, contractId) {
    const ocorrencias = contract.ocorrencias || [];
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const sevCor = { baixa: '#6B7280', media: '#D97706', alta: '#DC2626', critica: '#7C3AED' };
    const sevBg  = { baixa: '#F3F4F6', media: '#FEF3C7', alta: '#FEE2E2', critica: '#EDE9FE' };
    const tipoLabel = { geral: 'Geral', seguranca: 'Segurança', qualidade: 'Qualidade', prazo: 'Prazo', financeiro: 'Financeiro' };
    const abertas = ocorrencias.filter(o => !o.encerrada).length;
    return `
    <div class="card mb-2xl">
      <div class="card-header">
        <div>
          <h3 class="card-title">Ocorrências</h3>
          ${abertas > 0 ? `<div class="rh-meta-xs" style="color:var(--color-danger);">${abertas} aberta${abertas !== 1 ? 's' : ''}</div>` : '<div class="rh-meta-xs" style="color:var(--color-success);">Nenhuma aberta</div>'}
        </div>
        ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovaOcorrencia">+ Nova Ocorrência</button>` : ''}
      </div>
      ${ocorrencias.length === 0 ? `
      <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
        <div style="font-size:44px;margin-bottom:8px;opacity:.6;">📌</div>
        <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhuma ocorrência registrada</div>
        <div style="font-size:13px;">Registre eventos relevantes do andamento da obra: segurança, qualidade, prazo ou financeiro.</div>
      </div>` : `
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col">Data</th><th scope="col">Tipo</th><th scope="col">Severidade</th><th scope="col">Descrição</th><th scope="col">Status</th>${this._podeEditar() ? '<th scope="col"></th>' : ''}</tr></thead>
          <tbody>
            ${ocorrencias.map(o => `
            <tr style="${o.encerrada ? 'opacity:.6;' : ''}">
              <td style="white-space:nowrap;">${fmtDate(o.data)}</td>
              <td>${tipoLabel[o.tipo] || o.tipo}</td>
              <td><span style="padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;background:${sevBg[o.severidade] || '#F3F4F6'};color:${sevCor[o.severidade] || '#6B7280'};">${(o.severidade || 'media').toUpperCase()}</span></td>
              <td>${escapeHtml(o.descricao)}</td>
              <td>${o.encerrada ? `<span style="color:var(--color-success);font-weight:600;">Encerrada</span>` : `<span style="color:var(--color-danger);font-weight:600;">Aberta</span>`}</td>
              ${this._podeEditar() ? `<td style="white-space:nowrap;"><button class="btn btn-sm btn-secondary btn-edit-ocr" data-id="${o.id}" style="margin-right:4px;">Editar</button><button class="btn btn-sm btn-danger btn-del-ocr" data-id="${o.id}">✕</button></td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
  },

  _attachOcorrenciasListeners(contractId) {
    document.getElementById('btnNovaOcorrencia')?.addEventListener('click', () => this._showModalOcorrencia(contractId, null));
    document.querySelectorAll('.btn-edit-ocr').forEach(b => b.addEventListener('click', () => {
      const contract = Store.getContractById(contractId);
      const item = (contract?.ocorrencias || []).find(o => o.id === b.dataset.id);
      this._showModalOcorrencia(contractId, item);
    }));
    document.querySelectorAll('.btn-del-ocr').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Excluir esta ocorrência?')) return;
      await fetch(`/api/contracts/${contractId}/ocorrencias/${b.dataset.id}`, { method: 'DELETE' });
      await Store.loadContract(contractId, { force: true }); this.render({ id: contractId });
    }));
  },

  _showModalOcorrencia(contractId, item) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header"><h2 class="modal-title">${item ? 'Editar Ocorrência' : 'Nova Ocorrência'}</h2></div>
        <div class="modal-body">
          <form id="formOcorrencia" style="display:flex;flex-direction:column;gap:var(--sp-md);">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-md);">
              <div class="form-group" style="margin:0;"><label class="form-label">Data</label><input class="form-control" name="data" type="date" value="${item?.data || new Date().toISOString().split('T')[0]}"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Tipo</label><select class="form-control" name="tipo"><option value="geral" ${(!item || item.tipo === 'geral') ? 'selected' : ''}>Geral</option><option value="seguranca" ${item?.tipo === 'seguranca' ? 'selected' : ''}>Segurança</option><option value="qualidade" ${item?.tipo === 'qualidade' ? 'selected' : ''}>Qualidade</option><option value="prazo" ${item?.tipo === 'prazo' ? 'selected' : ''}>Prazo</option><option value="financeiro" ${item?.tipo === 'financeiro' ? 'selected' : ''}>Financeiro</option></select></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Severidade</label><select class="form-control" name="severidade"><option value="baixa" ${item?.severidade === 'baixa' ? 'selected' : ''}>Baixa</option><option value="media" ${(!item || item.severidade === 'media') ? 'selected' : ''}>Média</option><option value="alta" ${item?.severidade === 'alta' ? 'selected' : ''}>Alta</option><option value="critica" ${item?.severidade === 'critica' ? 'selected' : ''}>Crítica</option></select></div>
            </div>
            <div class="form-group" style="margin:0;"><label class="form-label">Descrição *</label><textarea class="form-control" name="descricao" style="min-height:80px;">${escapeHtml(item?.descricao || '')}</textarea></div>
            ${item ? `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;"><input type="checkbox" name="encerrada" ${item?.encerrada ? 'checked' : ''}> Encerrada</label>` : ''}
          </form>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" id="btnCancelarOcr">Cancelar</button><button class="btn btn-primary" id="btnSalvarOcr">${item ? 'Atualizar' : 'Registrar'}</button></div>
      </div>`;
    document.body.appendChild(modal);
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea');
      firstInput?.focus();
    }, 50);
    document.getElementById('btnCancelarOcr').addEventListener('click', () => modal.remove());
    document.getElementById('btnSalvarOcr').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formOcorrencia'));
      const data = Object.fromEntries(fd);
      if (item) data.encerrada = document.querySelector('[name=encerrada]')?.checked || false;
      if (!data.descricao?.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      const url = item ? `/api/contracts/${contractId}/ocorrencias/${item.id}` : `/api/contracts/${contractId}/ocorrencias`;
      await fetch(url, { method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      await Store.loadContract(contractId, { force: true }); modal.remove(); this.render({ id: contractId });
    });
  },
  });
})();
