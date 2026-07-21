/* Rhino · ContratoDetail · Punch List / Qualidade (item 11)
   Estende window.ContratoDetail. Consome /api/contracts/:id/punch — pendências,
   RNCs e inspeções de qualidade da obra, com fotos e controle de prazo.
   Só apresentação; a fonte de verdade (resumo, vencido) mora no servidor. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/punch] requires ContratoDetail core'); return; }

  // Rótulos e cores (spans com estilo inline — sem depender de classes novas).
  const PUNCH_TIPOS = [['pendencia', 'Pendência'], ['rnc', 'RNC'], ['inspecao', 'Inspeção']];
  const PUNCH_SEVS = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['critica', 'Crítica']];
  const PUNCH_STATUSES = [['aberto', 'Aberto'], ['em_andamento', 'Em andamento'], ['resolvido', 'Resolvido'], ['verificado', 'Verificado']];

  const _punchDate = (s) => {
    if (!s) return '—';
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(s));
  };
  const _pill = (label, bg, fg) =>
    `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${bg};color:${fg};">${escapeHtml(label)}</span>`;
  const _opts = (arr, val) => arr.map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');

  Object.assign(window.ContratoDetail, {

    // ═══════════ Punch List / Qualidade ═══════════
    _punchCache: null,
    _punchResumo: null,
    _punchFiltro: 'todos',

    renderPunchSection(contract) {
      return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('alert-triangle', 18)}Punch List / Qualidade</span></h3>
              <span class="text-muted font-sm">Pendências, RNCs e inspeções — com responsável, prazo e fotos</span>
            </div>
          </div>
          <div id="punchConteudo" style="padding:var(--sp-md);">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando…</div>
          </div>
        </div>
      `;
    },

    async _loadPunch(contract) {
      const box = document.getElementById('punchConteudo');
      if (!box) return;
      try {
        const r = await fetch(`/api/contracts/${contract.id}/punch`);
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        box.innerHTML = this._renderPunch(contract, data.itens || [], data.resumo || {});
        this._attachPunchListeners(contract);
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao carregar a punch list: ${escapeHtml(e.message)}</p>`;
      }
    },

    _punchTipoBadge(tipo) {
      const map = {
        pendencia: ['Pendência', '#dbeafe', '#1e40af'],
        rnc: ['RNC', '#fee2e2', '#b91c1c'],
        inspecao: ['Inspeção', '#ede9fe', '#6d28d9'],
      };
      const [lbl, bg, fg] = map[tipo] || [tipo || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
      return _pill(lbl, bg, fg);
    },

    _punchSevBadge(sev) {
      const map = {
        baixa: ['Baixa', '#d1fae5', '#047857'],
        media: ['Média', '#fef3c7', '#b45309'],
        alta: ['Alta', '#ffedd5', '#c2410c'],
        critica: ['Crítica', '#fee2e2', '#b91c1c'],
      };
      const [lbl, bg, fg] = map[sev] || [sev || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
      return _pill(lbl, bg, fg);
    },

    _renderPunch(contract, itens, resumo) {
      this._punchCache = itens || [];
      this._punchResumo = resumo || {};
      if (!this._punchFiltro) this._punchFiltro = 'todos';
      const filtro = this._punchFiltro;
      const podeEditar = this._podeEditar();
      const recursos = Store.state.recursos || [];

      const total = resumo.total || 0;
      const abertos = resumo.abertos || 0;
      const vencidos = resumo.vencidos || 0;
      const aVencer = resumo.aVencer7d || 0;

      const counters = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:var(--sp-md);">
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
            <div class="text-muted font-sm">Total de itens</div>
            <div style="font-size:18px;font-weight:700;">${total}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
            <div class="text-muted font-sm">Abertos</div>
            <div style="font-size:18px;font-weight:700;">${abertos}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
            <div class="text-muted font-sm">Vencidos</div>
            <div style="font-size:18px;font-weight:700;color:${vencidos > 0 ? 'var(--color-danger)' : 'inherit'};">${vencidos}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8b5cf6;">
            <div class="text-muted font-sm">A vencer (7 dias)</div>
            <div style="font-size:18px;font-weight:700;">${aVencer}</div>
          </div>
        </div>
      `;

      const controls = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:var(--sp-md);">
          <div class="form-group" style="margin:0;">
            <select id="punchFiltroStatus" class="form-control" style="max-width:220px;">
              <option value="todos" ${filtro === 'todos' ? 'selected' : ''}>Todos os status</option>
              ${PUNCH_STATUSES.map(([v, l]) => `<option value="${v}" ${filtro === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
            </select>
          </div>
          ${podeEditar ? `<button class="btn btn-primary btn-sm" id="btnNovoPunch">+ Novo item</button>` : ''}
        </div>
      `;

      // Sem nenhum item cadastrado → empty-state completo.
      if (this._punchCache.length === 0) {
        return `
          ${counters}
          ${controls}
          <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
            <div style="font-size:44px;margin-bottom:8px;opacity:.6;">✅</div>
            <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum item na punch list</div>
            <div style="font-size:13px;">Registre pendências, RNCs e inspeções de qualidade desta obra.</div>
          </div>
        `;
      }

      const lista = filtro === 'todos' ? this._punchCache : this._punchCache.filter((it) => it.status === filtro);

      const linhas = lista.map((it) => {
        const resp = recursos.find((rr) => rr.id === it.responsavelId);
        return `
          <tr>
            <td>
              <strong>${escapeHtml(it.titulo || '—')}</strong>
              <div class="rh-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;">
                ${this._punchTipoBadge(it.tipo)}
                ${this._punchSevBadge(it.severidade)}
                ${it.localizacao ? `<span class="text-muted font-sm">📍 ${escapeHtml(it.localizacao)}</span>` : ''}
              </div>
              ${it.descricao ? `<div class="text-muted font-sm" style="margin-top:2px;">${escapeHtml(it.descricao)}</div>` : ''}
            </td>
            <td>${escapeHtml(resp?.nome || '—')}</td>
            <td style="white-space:nowrap;">
              ${_punchDate(it.prazo)}
              ${it.vencido ? ` ${_pill('⚠ vencido', '#fee2e2', '#b91c1c')}` : ''}
            </td>
            <td>
              <select class="form-control" data-punch-status="${escapeHtml(it.id)}" style="min-width:150px;padding:4px 8px;" ${podeEditar ? '' : 'disabled'}>
                ${_opts(PUNCH_STATUSES, it.status)}
              </select>
            </td>
            ${podeEditar ? `
            <td style="text-align:center;white-space:nowrap;">
              <button class="btn btn-sm btn-secondary" data-punch-edit="${escapeHtml(it.id)}" title="Editar"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('edit', 15)}</span></button>
              <button class="btn btn-sm btn-danger" data-punch-del="${escapeHtml(it.id)}" title="Excluir"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('trash-2', 15)}</span></button>
            </td>` : ''}
          </tr>
        `;
      }).join('');

      const colspan = podeEditar ? 5 : 4;
      const corpo = lista.length === 0
        ? `<tr><td colspan="${colspan}" class="text-muted" style="text-align:center;padding:var(--sp-md);">Nenhum item com o status selecionado.</td></tr>`
        : linhas;

      return `
        ${counters}
        ${controls}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
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

    _attachPunchListeners(contract) {
      const filtroSel = document.getElementById('punchFiltroStatus');
      if (filtroSel) {
        filtroSel.value = this._punchFiltro || 'todos';
        filtroSel.addEventListener('change', () => {
          this._punchFiltro = filtroSel.value;
          const box = document.getElementById('punchConteudo');
          if (!box) return;
          box.innerHTML = this._renderPunch(contract, this._punchCache || [], this._punchResumo || {});
          this._attachPunchListeners(contract);
        });
      }

      const btnNovo = document.getElementById('btnNovoPunch');
      if (btnNovo) btnNovo.addEventListener('click', () => this._showModalPunch(contract, null));

      document.querySelectorAll('[data-punch-edit]').forEach((b) => {
        b.addEventListener('click', () => {
          const it = (this._punchCache || []).find((x) => x.id === b.getAttribute('data-punch-edit'));
          if (it) this._showModalPunch(contract, it);
        });
      });

      document.querySelectorAll('[data-punch-del]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.getAttribute('data-punch-del');
          if (!confirm('Excluir este item da punch list?')) return;
          try {
            const r = await fetch(`/api/contracts/${contract.id}/punch/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());
            window.showToast('Item excluído', 'success');
            this._loadPunch(contract);
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });

      // Troca de status direto na tabela → PUT rápido.
      document.querySelectorAll('[data-punch-status]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-punch-status');
          try {
            const r = await fetch(`/api/contracts/${contract.id}/punch/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: sel.value }),
            });
            if (!r.ok) throw new Error(await r.text());
            window.showToast('Status atualizado', 'success');
            this._loadPunch(contract);
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });
    },

    _showModalPunch(contract, item) {
      const editing = !!(item && item.id);
      const podeEditar = this._podeEditar();
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
        <div class="modal-overlay" id="modalPunch" style="z-index:1100;">
          <div class="modal" style="width:600px;max-width:95vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Novo'} item — Punch List</h2>
              <button class="modal-close">✕</button>
            </div>
            <div class="modal-content">
              <form id="formPunch">
                <div class="form-group">
                  <label class="form-label">Título *</label>
                  <input class="form-control" name="titulo" required value="${escapeHtml(item?.titulo || '')}" placeholder="Ex: Solda com trinca no pilar P3">
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select class="form-control" name="tipo">${_opts(PUNCH_TIPOS, item?.tipo || 'pendencia')}</select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Severidade</label>
                    <select class="form-control" name="severidade">${_opts(PUNCH_SEVS, item?.severidade || 'media')}</select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-control" name="status">${_opts(PUNCH_STATUSES, item?.status || 'aberto')}</select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Prazo</label>
                    <input class="form-control" type="date" name="prazo" value="${escapeHtml(item?.prazo || '')}">
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Responsável</label>
                  <select class="form-control" name="responsavelId">${respOpts}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">Localização</label>
                  <input class="form-control" name="localizacao" value="${escapeHtml(item?.localizacao || '')}" placeholder="Ex: Eixo 4, nível +12m">
                </div>
                <div class="form-group">
                  <label class="form-label">Descrição</label>
                  <textarea class="form-control" name="descricao" rows="3">${escapeHtml(item?.descricao || '')}</textarea>
                </div>
              </form>
              ${editing ? `
                <div style="margin-top:var(--sp-md);border-top:1px solid var(--color-border);padding-top:var(--sp-md);">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:700;font-size:14px;">Fotos</div>
                    ${podeEditar ? `<div>
                      <input type="file" id="punchFotoInput" accept="image/*" multiple style="display:none;">
                      <button type="button" class="btn btn-sm btn-secondary" id="btnPunchFoto"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('image', 15)}Adicionar fotos</span></button>
                    </div>` : ''}
                  </div>
                  <div id="punchFotosGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;"></div>
                </div>
              ` : `
                <div class="text-muted font-sm" style="margin-top:var(--sp-md);border-top:1px solid var(--color-border);padding-top:var(--sp-md);">${window.rhIcon('info', 13)} Salve o item para anexar fotos.</div>
              `}
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnCancelPunch">Cancelar</button>
              <button class="btn btn-primary" id="btnSavePunch">${editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalPunch');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelPunch').addEventListener('click', close);

      // ── Fotos (só em item já salvo) ──────────────────────────────────────────
      const renderFotos = () => {
        const grid = document.getElementById('punchFotosGrid');
        if (!grid) return;
        const fotos = (item && item.fotos) || [];
        if (fotos.length === 0) {
          grid.innerHTML = `<div class="text-muted font-sm" style="grid-column:1/-1;">Nenhuma foto anexada.</div>`;
          return;
        }
        grid.innerHTML = fotos.map((f) => `
          <div style="position:relative;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;background:#fff;">
            <img src="/data/punch-fotos/${encodeURIComponent(item.id)}/${encodeURIComponent(f.id)}.${escapeHtml(f.ext)}" alt="Foto do item" loading="lazy" decoding="async" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;">
            ${podeEditar ? `<button type="button" class="btn-punch-foto-del" data-fid="${escapeHtml(f.id)}" title="Remover foto" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:14px;line-height:1;">✕</button>` : ''}
          </div>
        `).join('');
        grid.querySelectorAll('.btn-punch-foto-del').forEach((b) => {
          b.addEventListener('click', async () => {
            if (!confirm('Remover esta foto?')) return;
            try {
              const data = await Store.deletePunchFoto(contract.id, item.id, b.dataset.fid);
              const fresh = data && data.itens ? data.itens.find((x) => x.id === item.id) : null;
              item.fotos = fresh ? fresh.fotos : (item.fotos || []).filter((x) => x.id !== b.dataset.fid);
              if (data && data.itens) { this._punchCache = data.itens; if (data.resumo) this._punchResumo = data.resumo; }
              renderFotos();
            } catch (e) { window.showToast(e.message, 'error'); }
          });
        });
      };

      if (editing) {
        renderFotos();
        const fotoInput = document.getElementById('punchFotoInput');
        const fotoBtn = document.getElementById('btnPunchFoto');
        if (fotoBtn && fotoInput) {
          fotoBtn.addEventListener('click', () => fotoInput.click());
          fotoInput.addEventListener('change', async () => {
            if (!fotoInput.files || fotoInput.files.length === 0) return;
            try {
              window.showToast(`Enviando ${fotoInput.files.length} foto(s)…`, 'info');
              const data = await Store.uploadPunchFoto(contract.id, item.id, fotoInput.files);
              const fresh = data && data.itens ? data.itens.find((x) => x.id === item.id) : null;
              if (fresh) item.fotos = fresh.fotos;
              if (data && data.itens) { this._punchCache = data.itens; if (data.resumo) this._punchResumo = data.resumo; }
              renderFotos();
              window.showToast('Fotos enviadas!', 'success');
            } catch (e) {
              window.showToast(e.message || 'Erro no upload', 'error');
            } finally {
              fotoInput.value = '';
            }
          });
        }
      }

      // ── Salvar (POST novo / PUT edição) ──────────────────────────────────────
      document.getElementById('btnSavePunch').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('formPunch'));
        const f = Object.fromEntries(fd);
        if (!f.titulo || !f.titulo.trim()) { window.showToast('Título é obrigatório', 'error'); return; }
        const body = {
          titulo: f.titulo.trim(),
          tipo: f.tipo,
          severidade: f.severidade,
          status: f.status,
          descricao: (f.descricao || '').trim(),
          localizacao: (f.localizacao || '').trim(),
          responsavelId: f.responsavelId || null,
          prazo: f.prazo || null,
        };
        try {
          const url = editing
            ? `/api/contracts/${contract.id}/punch/${item.id}`
            : `/api/contracts/${contract.id}/punch`;
          const method = editing ? 'PUT' : 'POST';
          const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!r.ok) throw new Error(await r.text());
          window.showToast(editing ? 'Item atualizado' : 'Item criado', 'success');
          close();
          this._loadPunch(contract);
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    },

  });
})();
