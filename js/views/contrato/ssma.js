/* Rhino · ContratoDetail · SSMA — Desvios e incidentes de segurança (item 7)
   Estende window.ContratoDetail. Consome /api/contracts/:id/ssma — desvios,
   quase-acidentes, incidentes e acidentes da obra, com gravidade, causa, ação
   corretiva, responsável, prazo e os indicadores TF/TG.
   Só apresentação; a fonte de verdade (resumo, taxas) mora no servidor. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/ssma] requires ContratoDetail core'); return; }

  const SSMA_TIPOS = [['desvio', 'Desvio'], ['quase_acidente', 'Quase-acidente'], ['incidente', 'Incidente'], ['acidente', 'Acidente']];
  const SSMA_GRAVS = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['critica', 'Crítica']];
  const SSMA_STATUSES = [['aberto', 'Aberto'], ['em_investigacao', 'Em investigação'], ['encerrado', 'Encerrado']];

  const _ssmaDate = (s) => {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  };
  const _pill = (label, bg, fg) =>
    `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${bg};color:${fg};">${escapeHtml(label)}</span>`;
  const _opts = (arr, val) => arr.map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');

  Object.assign(window.ContratoDetail, {

    // ═══════════ SSMA / Segurança ═══════════
    _ssmaCache: null,
    _ssmaResumo: null,
    _ssmaFiltro: 'todos',

    renderSsmaSection(contract) {
      return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('shield', 18)}SSMA — Segurança</span></h3>
              <span class="text-muted font-sm">Desvios, quase-acidentes, incidentes e acidentes — com TF/TG da obra</span>
            </div>
          </div>
          <div id="ssmaConteudo" style="padding:var(--sp-md);">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando…</div>
          </div>
        </div>
      `;
    },

    async _loadSsma(contract) {
      const box = document.getElementById('ssmaConteudo');
      if (!box) return;
      try {
        const r = await fetch(`/api/contracts/${contract.id}/ssma`);
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        box.innerHTML = this._renderSsma(contract, data.ocorrencias || [], data.resumo || {});
        this._attachSsmaListeners(contract);
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao carregar SSMA: ${escapeHtml(e.message)}</p>`;
      }
    },

    _ssmaTipoBadge(tipo) {
      const map = {
        desvio: ['Desvio', '#dbeafe', '#1e40af'],
        quase_acidente: ['Quase-acidente', '#fef3c7', '#b45309'],
        incidente: ['Incidente', '#ffedd5', '#c2410c'],
        acidente: ['Acidente', '#fee2e2', '#b91c1c'],
      };
      const [lbl, bg, fg] = map[tipo] || [tipo || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
      return _pill(lbl, bg, fg);
    },

    _ssmaGravBadge(g) {
      const map = {
        baixa: ['Baixa', '#d1fae5', '#047857'],
        media: ['Média', '#fef3c7', '#b45309'],
        alta: ['Alta', '#ffedd5', '#c2410c'],
        critica: ['Crítica', '#fee2e2', '#b91c1c'],
      };
      const [lbl, bg, fg] = map[g] || [g || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
      return _pill(lbl, bg, fg);
    },

    _ssmaStatusBadge(st) {
      const map = {
        aberto: ['Aberto', '#fee2e2', '#b91c1c'],
        em_investigacao: ['Em investigação', '#fef3c7', '#b45309'],
        encerrado: ['Encerrado', '#d1fae5', '#047857'],
      };
      const [lbl, bg, fg] = map[st] || [st || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
      return _pill(lbl, bg, fg);
    },

    _renderSsma(contract, ocorrencias, resumo) {
      this._ssmaCache = ocorrencias || [];
      this._ssmaResumo = resumo || {};
      if (!this._ssmaFiltro) this._ssmaFiltro = 'todos';
      const filtro = this._ssmaFiltro;
      const podeEditar = this._podeEditar();
      const recursos = Store.state.recursos || [];

      const total = resumo.total || 0;
      const comAfast = resumo.comAfastamento || 0;
      const dias = resumo.diasPerdidos || 0;
      const tf = resumo.tf != null ? resumo.tf : 0;
      const tg = resumo.tg != null ? resumo.tg : 0;

      const kpis = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:var(--sp-md);">
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
            <div class="text-muted font-sm">Ocorrências</div>
            <div style="font-size:18px;font-weight:700;">${total}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
            <div class="text-muted font-sm">Com afastamento</div>
            <div style="font-size:18px;font-weight:700;color:${comAfast > 0 ? 'var(--color-danger)' : 'inherit'};">${comAfast}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
            <div class="text-muted font-sm">Dias perdidos</div>
            <div style="font-size:18px;font-weight:700;">${dias}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8b5cf6;">
            <div class="text-muted font-sm" title="Taxa de Frequência — acidentes com afastamento por milhão de HHT">TF (frequência)</div>
            <div style="font-size:18px;font-weight:700;">${tf}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #0ea5e9;">
            <div class="text-muted font-sm" title="Taxa de Gravidade — dias perdidos por milhão de HHT">TG (gravidade)</div>
            <div style="font-size:18px;font-weight:700;">${tg}</div>
          </div>
        </div>
      `;

      const controls = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:var(--sp-md);">
          <div class="form-group" style="margin:0;">
            <select id="ssmaFiltroStatus" class="form-control" style="max-width:220px;">
              <option value="todos" ${filtro === 'todos' ? 'selected' : ''}>Todos os status</option>
              ${SSMA_STATUSES.map(([v, l]) => `<option value="${v}" ${filtro === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
            </select>
          </div>
          ${podeEditar ? `<button class="btn btn-primary btn-sm" id="btnNovoSsma">+ Nova ocorrência</button>` : ''}
        </div>
      `;

      if (this._ssmaCache.length === 0) {
        return `
          ${kpis}
          ${controls}
          <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
            <div style="font-size:44px;margin-bottom:8px;opacity:.6;">🦺</div>
            <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhuma ocorrência de segurança</div>
            <div style="font-size:13px;">Registre desvios, quase-acidentes, incidentes e acidentes desta obra.</div>
          </div>
        `;
      }

      const lista = filtro === 'todos' ? this._ssmaCache : this._ssmaCache.filter((o) => o.status === filtro);

      const linhas = lista.map((o) => {
        const resp = recursos.find((rr) => rr.id === o.responsavelId);
        return `
          <tr>
            <td>
              <div class="rh-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                ${this._ssmaTipoBadge(o.tipo)}
                ${this._ssmaGravBadge(o.gravidade)}
                ${o.comAfastamento ? _pill('⚠ afastamento', '#fee2e2', '#b91c1c') : ''}
              </div>
              <div style="margin-top:4px;">${escapeHtml(o.descricao || '—')}</div>
              ${o.acaoCorretiva ? `<div class="text-muted font-sm" style="margin-top:2px;">Ação: ${escapeHtml(o.acaoCorretiva)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;">${_ssmaDate(o.data)}</td>
            <td>${escapeHtml(resp?.nome || '—')}</td>
            <td style="white-space:nowrap;">
              ${_ssmaDate(o.prazo)}
            </td>
            <td>
              <select class="form-control" data-ssma-status="${escapeHtml(o.id)}" style="min-width:160px;padding:4px 8px;" ${podeEditar ? '' : 'disabled'}>
                ${_opts(SSMA_STATUSES, o.status)}
              </select>
            </td>
            ${podeEditar ? `
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn-sm btn-secondary" data-ssma-edit="${escapeHtml(o.id)}" title="Editar"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('edit', 15)}</span></button>
              <button class="btn btn-sm btn-danger" data-ssma-del="${escapeHtml(o.id)}" title="Excluir"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('trash-2', 15)}</span></button>
            </td>` : ''}
          </tr>
        `;
      }).join('');

      const colspan = podeEditar ? 6 : 5;
      const corpo = lista.length === 0
        ? `<tr><td colspan="${colspan}" class="text-muted" style="text-align:center;padding:var(--sp-md);">Nenhuma ocorrência com o status selecionado.</td></tr>`
        : linhas;

      return `
        ${kpis}
        ${controls}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Ocorrência</th>
                <th scope="col">Data</th>
                <th scope="col">Responsável</th>
                <th scope="col">Prazo</th>
                <th scope="col">Status</th>
                ${podeEditar ? '<th scope="col" style="text-align:center;">Ações</th>' : ''}
              </tr>
            </thead>
            <tbody>${corpo}</tbody>
          </table>
        </div>
      `;
    },

    _attachSsmaListeners(contract) {
      const filtroSel = document.getElementById('ssmaFiltroStatus');
      if (filtroSel) {
        filtroSel.value = this._ssmaFiltro || 'todos';
        filtroSel.addEventListener('change', () => {
          this._ssmaFiltro = filtroSel.value;
          const box = document.getElementById('ssmaConteudo');
          if (!box) return;
          box.innerHTML = this._renderSsma(contract, this._ssmaCache || [], this._ssmaResumo || {});
          this._attachSsmaListeners(contract);
        });
      }

      const btnNovo = document.getElementById('btnNovoSsma');
      if (btnNovo) btnNovo.addEventListener('click', () => this._showModalSsma(contract, null));

      document.querySelectorAll('[data-ssma-edit]').forEach((b) => {
        b.addEventListener('click', () => {
          const o = (this._ssmaCache || []).find((x) => x.id === b.getAttribute('data-ssma-edit'));
          if (o) this._showModalSsma(contract, o);
        });
      });

      document.querySelectorAll('[data-ssma-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-ssma-del');
          if (!confirm('Excluir esta ocorrência de SSMA?')) return;
          try {
            const r = await fetch(`/api/contracts/${contract.id}/ssma/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());
            window.showToast('Ocorrência excluída', 'success');
            this._loadSsma(contract);
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });

      // Troca de status direto na tabela → PUT rápido.
      document.querySelectorAll('[data-ssma-status]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-ssma-status');
          try {
            const r = await fetch(`/api/contracts/${contract.id}/ssma/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: sel.value }),
            });
            if (!r.ok) throw new Error(await r.text());
            window.showToast('Status atualizado', 'success');
            this._loadSsma(contract);
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });
    },

    _showModalSsma(contract, item) {
      const editing = !!(item && item.id);
      const recursos = Store.state.recursos || [];

      // Colaboradores da obra: organograma → recursos (por recursoId), sem repetir.
      // Fallback: todos os recursos com status 'funcionario'.
      const mapa = new Map();
      (contract.organograma || []).forEach((m) => {
        const r = recursos.find((x) => x.id === m.recursoId);
        if (r && !mapa.has(r.id)) mapa.set(r.id, r);
      });
      let colaboradores = Array.from(mapa.values());
      if (colaboradores.length === 0) colaboradores = recursos.filter((r) => r.status === 'funcionario');

      const respOpts = ['<option value="">— sem responsável —</option>']
        .concat(colaboradores.map((r) => `<option value="${escapeHtml(r.id)}" ${item && item.responsavelId === r.id ? 'selected' : ''}>${escapeHtml(r.nome || r.id)}</option>`))
        .join('');

      const html = `
        <div class="modal-overlay" id="modalSsma" style="z-index:1100;">
          <div class="modal" style="width:640px;max-width:95vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Nova'} ocorrência — SSMA</h2>
              <button class="modal-close">✕</button>
            </div>
            <div class="modal-content">
              <form id="formSsma">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select class="form-control" name="tipo">${_opts(SSMA_TIPOS, item?.tipo || 'desvio')}</select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Gravidade</label>
                    <select class="form-control" name="gravidade">${_opts(SSMA_GRAVS, item?.gravidade || 'media')}</select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Descrição *</label>
                  <textarea class="form-control" name="descricao" rows="2" required placeholder="Ex: Colaborador em altura sem cinto de segurança no eixo 4">${escapeHtml(item?.descricao || '')}</textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Data</label>
                    <input class="form-control" type="date" name="data" value="${escapeHtml(item?.data ? String(item.data).slice(0, 10) : '')}">
                  </div>
                  <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-control" name="status">${_opts(SSMA_STATUSES, item?.status || 'aberto')}</select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Responsável</label>
                    <select class="form-control" name="responsavelId">${respOpts}</select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Prazo (ação)</label>
                    <input class="form-control" type="date" name="prazo" value="${escapeHtml(item?.prazo ? String(item.prazo).slice(0, 10) : '')}">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Causa</label>
                  <textarea class="form-control" name="causa" rows="2" placeholder="Análise da causa raiz">${escapeHtml(item?.causa || '')}</textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Ação corretiva</label>
                  <textarea class="form-control" name="acaoCorretiva" rows="2" placeholder="O que foi ou será feito para tratar">${escapeHtml(item?.acaoCorretiva || '')}</textarea>
                </div>
                <div class="form-row">
                  <div class="form-group" style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="ssmaComAfastamento" name="comAfastamento" ${item?.comAfastamento ? 'checked' : ''} style="width:auto;">
                    <label class="form-label" for="ssmaComAfastamento" style="margin:0;">Gerou afastamento</label>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Dias perdidos</label>
                    <input class="form-control" type="number" min="0" step="1" name="diasPerdidos" value="${escapeHtml(String(item?.diasPerdidos != null ? item.diasPerdidos : 0))}">
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnCancelSsma">Cancelar</button>
              <button class="btn btn-primary" id="btnSaveSsma">${editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalSsma');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelSsma').addEventListener('click', close);

      document.getElementById('btnSaveSsma').addEventListener('click', async () => {
        const form = document.getElementById('formSsma');
        const fd = new FormData(form);
        const f = Object.fromEntries(fd);
        if (!f.descricao || !f.descricao.trim()) { window.showToast('Descrição é obrigatória', 'error'); return; }
        const body = {
          tipo: f.tipo,
          gravidade: f.gravidade,
          status: f.status,
          descricao: f.descricao.trim(),
          data: f.data || null,
          prazo: f.prazo || null,
          responsavelId: f.responsavelId || null,
          causa: (f.causa || '').trim(),
          acaoCorretiva: (f.acaoCorretiva || '').trim(),
          comAfastamento: !!form.querySelector('#ssmaComAfastamento')?.checked,
          diasPerdidos: parseInt(f.diasPerdidos, 10) || 0,
        };
        try {
          const url = editing
            ? `/api/contracts/${contract.id}/ssma/${item.id}`
            : `/api/contracts/${contract.id}/ssma`;
          const method = editing ? 'PUT' : 'POST';
          const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!r.ok) throw new Error(await r.text());
          window.showToast(editing ? 'Ocorrência atualizada' : 'Ocorrência criada', 'success');
          close();
          this._loadSsma(contract);
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    },

  });
})();
