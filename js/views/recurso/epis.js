/* Rhino · RecursoEpis · Controle de EPIs (item 9)
   Modal autocontido por colaborador. Consome /api/recursos/:id/epis — ficha de
   entrega de EPIs (CA, quantidade, vida útil, troca prevista, devolução).
   Só apresentação; a fonte de verdade (status, resumo, troca prevista) mora no
   servidor. Wiring: um botão "EPIs" na linha do colaborador (Recursos.js) chama
   window.RecursoEpis.showEpis(recursoId). */
window.RecursoEpis = {
  _recursoId: null,
  _entregas: [],
  _resumo: {},

  // Rótulo/cor por status calculado no servidor.
  _statusBadge(status) {
    const map = {
      ativo: ['Ativo', '#D1FAE5', '#065F46'],
      trocar: ['Trocar', '#FEE2E2', '#991B1B'],
      devolvido: ['Devolvido', '#E5E7EB', '#374151'],
    };
    const [lbl, bg, fg] = map[status] || [status || '—', '#F3F4F6', '#6B7280'];
    return `<span class="badge" style="background:${bg};color:${fg};font-size:15px;">${escapeHtml(lbl)}</span>`;
  },

  _fmtDate(s) {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  },

  async showEpis(recursoId) {
    this._recursoId = recursoId;
    const recurso = (window.Store?.state?.recursos || []).find((x) => x.id === recursoId);
    const nome = recurso ? recurso.nome : '';

    const html = `
      <div class="modal-overlay" id="modalEpis">
        <div class="modal" style="width:820px;max-width:96vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon ? window.rhIcon('shield', 18) : ''}EPIs — ${escapeHtml(nome || '')}</span></h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" id="episConteudo">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando…</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" id="btnNovoEpi">+ Registrar entrega</button>
            <button class="btn btn-secondary" id="btnFecharEpis">Fechar</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalEpis');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharEpis').addEventListener('click', close);
    document.getElementById('btnNovoEpi').addEventListener('click', () => this._showForm(null));

    await this._load();
  },

  async _load() {
    const box = document.getElementById('episConteudo');
    if (!box) return;
    try {
      const r = await fetch(`/api/recursos/${this._recursoId}/epis`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      this._entregas = data.entregas || [];
      this._resumo = data.resumo || {};
      box.innerHTML = this._renderTabela();
      this._attach();
    } catch (e) {
      box.innerHTML = `<p class="text-danger">Erro ao carregar EPIs: ${escapeHtml(e.message)}</p>`;
    }
  },

  _renderTabela() {
    const r = this._resumo || {};
    const counters = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Total</div><div style="font-size:18px;font-weight:700;">${r.total || 0}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #10b981;">
          <div class="text-muted font-sm">Ativos</div><div style="font-size:18px;font-weight:700;">${r.ativos || 0}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
          <div class="text-muted font-sm">A trocar</div><div style="font-size:18px;font-weight:700;color:${(r.aTrocar || 0) > 0 ? 'var(--color-danger)' : 'inherit'};">${r.aTrocar || 0}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #6b7280;">
          <div class="text-muted font-sm">Devolvidos</div><div style="font-size:18px;font-weight:700;">${r.devolvidos || 0}</div>
        </div>
      </div>`;

    if (this._entregas.length === 0) {
      return `${counters}
        <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
          <div style="font-size:44px;margin-bottom:8px;opacity:.6;">🦺</div>
          <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum EPI registrado</div>
          <div style="font-size:13px;">Registre a entrega de equipamentos de proteção deste colaborador.</div>
        </div>`;
    }

    const linhas = this._entregas.map((e) => `
      <tr>
        <td>
          <strong>${escapeHtml(e.epi || '—')}</strong>
          ${e.ca ? `<div class="text-muted font-sm">CA ${escapeHtml(e.ca)}</div>` : ''}
          ${e.observacoes ? `<div class="text-muted font-sm">${escapeHtml(e.observacoes)}</div>` : ''}
        </td>
        <td style="text-align:center;">${e.quantidade != null ? e.quantidade : 1}</td>
        <td style="white-space:nowrap;">${this._fmtDate(e.dataEntrega)}</td>
        <td style="white-space:nowrap;">${this._fmtDate(e.dataTrocaPrevista)}</td>
        <td>${this._statusBadge(e.status)}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button class="btn btn-sm btn-secondary" data-epi-edit="${escapeHtml(e.id)}" title="Editar">${window.rhIcon ? window.rhIcon('edit', 15) : 'Editar'}</button>
          <button class="btn btn-sm btn-danger" data-epi-del="${escapeHtml(e.id)}" title="Excluir">${window.rhIcon ? window.rhIcon('trash-2', 15) : 'Excluir'}</button>
        </td>
      </tr>`).join('');

    return `${counters}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">EPI</th>
              <th scope="col" style="text-align:center;">Qtd</th>
              <th scope="col">Entrega</th>
              <th scope="col">Troca prevista</th>
              <th scope="col">Status</th>
              <th scope="col" style="text-align:center;">Ações</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  },

  _attach() {
    document.querySelectorAll('[data-epi-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const e = this._entregas.find((x) => x.id === b.getAttribute('data-epi-edit'));
        if (e) this._showForm(e);
      });
    });
    document.querySelectorAll('[data-epi-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-epi-del');
        if (!confirm('Excluir este registro de EPI?')) return;
        try {
          const r = await fetch(`/api/recursos/${this._recursoId}/epis/${id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('EPI excluído', 'success');
          this._load();
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    });
  },

  _showForm(entrega) {
    const editing = !!(entrega && entrega.id);
    const e = entrega || {};
    const html = `
      <div class="modal-overlay" id="modalEpiForm" style="z-index:1100;">
        <div class="modal" style="width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Nova'} entrega de EPI</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEpi" class="modal-content">
            <div class="form-group">
              <label class="form-label">EPI *</label>
              <input class="form-control" name="epi" required value="${escapeHtml(e.epi || '')}" placeholder="Ex: Capacete classe B, Luva de vaqueta">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">CA (Certificado de Aprovação)</label>
                <input class="form-control" name="ca" value="${escapeHtml(e.ca || '')}" placeholder="Ex: 31469">
              </div>
              <div class="form-group" style="max-width:140px;">
                <label class="form-label">Quantidade</label>
                <input class="form-control" name="quantidade" type="number" min="1" value="${e.quantidade != null ? e.quantidade : 1}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data de entrega</label>
                <input class="form-control" name="dataEntrega" type="date" value="${escapeHtml(e.dataEntrega || '')}">
              </div>
              <div class="form-group" style="max-width:180px;">
                <label class="form-label">Vida útil (meses)</label>
                <input class="form-control" name="vidaUtilMeses" type="number" min="1" value="${e.vidaUtilMeses != null ? e.vidaUtilMeses : ''}" placeholder="Ex: 12">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Troca prevista</label>
              <input class="form-control" name="dataTrocaPrevista" type="date" value="${escapeHtml(e.dataTrocaPrevista || '')}">
              <div class="form-helper">Deixe em branco para calcular automaticamente (entrega + vida útil).</div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" name="devolvido" ${e.devolvido ? 'checked' : ''}> Devolvido
                </label>
              </div>
              <div class="form-group">
                <label class="form-label">Data de devolução</label>
                <input class="form-control" name="dataDevolucao" type="date" value="${escapeHtml(e.dataDevolucao || '')}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2">${escapeHtml(e.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelEpi">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveEpi">${editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalEpiForm');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelEpi').addEventListener('click', close);

    document.getElementById('btnSaveEpi').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formEpi'));
      const f = Object.fromEntries(fd);
      if (!f.epi || !f.epi.trim()) { window.showToast('EPI é obrigatório', 'error'); return; }
      const body = {
        epi: f.epi.trim(),
        ca: (f.ca || '').trim(),
        quantidade: parseInt(f.quantidade, 10) || 1,
        dataEntrega: f.dataEntrega || null,
        vidaUtilMeses: f.vidaUtilMeses ? parseInt(f.vidaUtilMeses, 10) : null,
        dataTrocaPrevista: f.dataTrocaPrevista || null,
        devolvido: !!f.devolvido,
        dataDevolucao: f.dataDevolucao || null,
        observacoes: (f.observacoes || '').trim(),
      };
      try {
        const url = editing
          ? `/api/recursos/${this._recursoId}/epis/${entrega.id}`
          : `/api/recursos/${this._recursoId}/epis`;
        const r = await fetch(url, {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(editing ? 'EPI atualizado' : 'EPI registrado', 'success');
        close();
        this._load();
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },
};
