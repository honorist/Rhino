/* Rhino · Recursos · Matriz de treinamentos NR por colaborador (feature 8).
   window.RecursoTreinamentos.render(recurso) abre um modal com a matriz de
   treinamentos (NR-10, NR-35, …) do colaborador + CRUD. Consome
   /api/recursos/:id/treinamentos — o servidor é a fonte de verdade do
   statusValidade (vigente / vencendo / vencido / sem_validade). */
(function () {
  const NR_COMUNS = [
    'NR-05', 'NR-06', 'NR-10', 'NR-11', 'NR-12', 'NR-13',
    'NR-18', 'NR-20', 'NR-33', 'NR-34', 'NR-35',
  ];

  const STATUS_CFG = {
    vigente: { bg: '#D1FAE5', color: '#065F46', label: 'Vigente' },
    vencendo: { bg: '#FEF3C7', color: '#92400E', label: 'Vence em breve' },
    vencido: { bg: '#FEE2E2', color: '#991B1B', label: 'Vencido' },
    sem_validade: { bg: '#F3F4F6', color: '#6B7280', label: 'Sem validade' },
  };

  const _fmtDate = (d) => {
    if (!d) return '—';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : escapeHtml(String(d));
  };

  function _badge(status) {
    const c = STATUS_CFG[status] || STATUS_CFG.sem_validade;
    return `<span class="badge" style="background:${c.bg};color:${c.color};font-size:13px;">${c.label}</span>`;
  }

  // data_validade estimada no cliente (UX): data_realizacao + meses. Só sugestão;
  // o servidor recalcula na gravação (lib/treinamento).
  function _estimaValidade(dataRealizacao, meses) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRealizacao || '')) return '';
    const m = parseInt(meses, 10);
    if (!Number.isFinite(m) || m <= 0) return '';
    const [y, mo, d] = dataRealizacao.split('-').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + m);
    return dt.toISOString().slice(0, 10);
  }

  window.RecursoTreinamentos = {
    _cache: [],

    // ── Modal principal: matriz do colaborador ────────────────────────────────
    render(recurso) {
      if (!recurso || !recurso.id) return;
      const html = `
        <div class="modal-overlay" id="modalTreinos">
          <div class="modal" style="width:min(960px,96vw);max-height:92vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="flex-shrink:0;">
              <div>
                <h2 class="modal-title">Treinamentos NR — ${escapeHtml(recurso.nome || '')}</h2>
                <p style="font-size:14px;color:var(--color-text-muted);margin:0;">${escapeHtml(recurso.profissao || '')}</p>
              </div>
              <button class="modal-close">✕</button>
            </div>
            <div class="modal-content" style="overflow-y:auto;flex:1;" id="treinosBody">
              <div class="text-muted" style="text-align:center;padding:var(--sp-xl);">Carregando…</div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalTreinos');
      overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
      this._load(recurso);
    },

    async _load(recurso) {
      const body = document.getElementById('treinosBody');
      if (!body) return;
      try {
        const r = await fetch(`/api/recursos/${encodeURIComponent(recurso.id)}/treinamentos`, {
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        this._cache = data.treinamentos || [];
        body.innerHTML = this._renderMatriz();
        this._wire(recurso);
      } catch (e) {
        body.innerHTML = `<p class="text-danger">Erro ao carregar treinamentos: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderMatriz() {
      const lista = this._cache || [];
      const cont = { vigente: 0, vencendo: 0, vencido: 0, sem_validade: 0 };
      lista.forEach((t) => {
        cont[t.statusValidade] = (cont[t.statusValidade] || 0) + 1;
      });

      const counters = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:var(--sp-md);">
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #059669;">
            <div class="text-muted font-sm">Vigentes</div>
            <div style="font-size:18px;font-weight:700;">${cont.vigente}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #d97706;">
            <div class="text-muted font-sm">Vencendo (30d)</div>
            <div style="font-size:18px;font-weight:700;color:${cont.vencendo > 0 ? '#b45309' : 'inherit'};">${cont.vencendo}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
            <div class="text-muted font-sm">Vencidos</div>
            <div style="font-size:18px;font-weight:700;color:${cont.vencido > 0 ? 'var(--color-danger)' : 'inherit'};">${cont.vencido}</div>
          </div>
          <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #6b7280;">
            <div class="text-muted font-sm">Total</div>
            <div style="font-size:18px;font-weight:700;">${lista.length}</div>
          </div>
        </div>`;

      const controls = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-md);">
          <button class="btn btn-primary" id="btnNovoTreino">+ Novo treinamento</button>
        </div>`;

      if (lista.length === 0) {
        return `
          ${counters}
          ${controls}
          <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
            <div style="font-size:40px;margin-bottom:8px;opacity:.6;">🎓</div>
            <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum treinamento cadastrado</div>
            <div style="font-size:13px;">Registre os cursos de NR deste colaborador para controlar a validade.</div>
          </div>`;
      }

      const rows = lista.map((t) => `
        <tr>
          <td><strong>${escapeHtml(t.nr || '—')}</strong>${t.descricao ? `<div class="text-muted font-sm">${escapeHtml(t.descricao)}</div>` : ''}</td>
          <td style="white-space:nowrap;">${_fmtDate(t.dataRealizacao)}</td>
          <td style="white-space:nowrap;">${_fmtDate(t.dataValidade)}</td>
          <td>${_badge(t.statusValidade)}</td>
          <td>${escapeHtml(t.instituicao || '—')}</td>
          <td style="text-align:center;white-space:nowrap;">
            ${t.certificadoUrl ? `<a href="${escapeHtml(t.certificadoUrl)}" target="_blank" rel="noopener" class="action-link" title="Abrir certificado">Certificado</a>` : ''}
            <button type="button" class="action-link btn-edit-treino" data-id="${escapeHtml(t.id)}">Editar</button>
            <button type="button" class="action-link danger btn-del-treino" data-id="${escapeHtml(t.id)}">Excluir</button>
          </td>
        </tr>`).join('');

      return `
        ${counters}
        ${controls}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">NR</th>
                <th scope="col">Realização</th>
                <th scope="col">Validade</th>
                <th scope="col">Status</th>
                <th scope="col">Instituição</th>
                <th scope="col" style="text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    },

    _wire(recurso) {
      const btnNovo = document.getElementById('btnNovoTreino');
      if (btnNovo) btnNovo.addEventListener('click', () => this._showForm(recurso, null));

      document.querySelectorAll('.btn-edit-treino').forEach((b) =>
        b.addEventListener('click', () => {
          const t = (this._cache || []).find((x) => x.id === b.dataset.id);
          if (t) this._showForm(recurso, t);
        })
      );
      document.querySelectorAll('.btn-del-treino').forEach((b) =>
        b.addEventListener('click', async () => {
          if (!confirm('Excluir este treinamento?')) return;
          try {
            const r = await fetch(
              `/api/recursos/${encodeURIComponent(recurso.id)}/treinamentos/${encodeURIComponent(b.dataset.id)}`,
              { method: 'DELETE', credentials: 'same-origin' }
            );
            if (!r.ok) throw new Error(await r.text());
            window.showToast && window.showToast('Treinamento excluído', 'success');
            this._load(recurso);
          } catch (e) {
            window.showToast && window.showToast(e.message, 'error');
          }
        })
      );
    },

    // ── Modal de formulário (criar / editar) ──────────────────────────────────
    _showForm(recurso, treino) {
      const editing = !!(treino && treino.id);
      const datalist = NR_COMUNS.map((n) => `<option value="${n}">`).join('');
      const html = `
        <div class="modal-overlay" id="modalTreinoForm" style="z-index:1100;">
          <div class="modal" style="width:560px;max-width:95vw;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <h2 class="modal-title">${editing ? 'Editar' : 'Novo'} treinamento — ${escapeHtml(recurso.nome || '')}</h2>
              <button class="modal-close">✕</button>
            </div>
            <form id="formTreino" class="modal-content">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">NR / Curso *</label>
                  <input class="form-control" name="nr" list="nrComuns" required value="${escapeHtml(treino?.nr || '')}" placeholder="Ex: NR-35">
                  <datalist id="nrComuns">${datalist}</datalist>
                </div>
                <div class="form-group">
                  <label class="form-label">Instituição</label>
                  <input class="form-control" name="instituicao" value="${escapeHtml(treino?.instituicao || '')}" placeholder="Ex: SENAI">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Descrição</label>
                <input class="form-control" name="descricao" value="${escapeHtml(treino?.descricao || '')}" placeholder="Ex: Trabalho em altura — reciclagem">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Data de realização</label>
                  <input class="form-control" type="date" name="dataRealizacao" id="treinoDataReal" value="${escapeHtml(treino?.dataRealizacao || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Validade (meses)</label>
                  <input class="form-control" type="number" min="0" name="validadeMeses" id="treinoMeses" value="${treino?.validadeMeses ?? 12}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Data de validade</label>
                <input class="form-control" type="date" name="dataValidade" id="treinoDataVal" value="${escapeHtml(treino?.dataValidade || '')}">
                <span class="form-helper" style="font-size:13px;color:var(--color-text-muted);">Calculada automaticamente pela realização + validade (você pode ajustar).</span>
              </div>
              <div class="form-group">
                <label class="form-label">URL do certificado</label>
                <input class="form-control" name="certificadoUrl" value="${escapeHtml(treino?.certificadoUrl || '')}" placeholder="https://…">
              </div>
            </form>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="btnCancelTreino">Cancelar</button>
              <button class="btn btn-primary" id="btnSaveTreino">${editing ? 'Salvar' : 'Criar'}</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      const overlay = document.getElementById('modalTreinoForm');
      const close = () => overlay.remove();
      overlay.querySelector('.modal-close').addEventListener('click', close);
      document.getElementById('btnCancelTreino').addEventListener('click', close);

      // Auto-preenche a validade ao mexer em realização/meses (só se o usuário
      // ainda não digitou uma validade manual).
      const inReal = document.getElementById('treinoDataReal');
      const inMeses = document.getElementById('treinoMeses');
      const inVal = document.getElementById('treinoDataVal');
      let valTocada = !!(treino && treino.dataValidade);
      inVal.addEventListener('input', () => { valTocada = true; });
      const recalc = () => {
        if (valTocada) return;
        const est = _estimaValidade(inReal.value, inMeses.value);
        if (est) inVal.value = est;
      };
      inReal.addEventListener('change', recalc);
      inMeses.addEventListener('change', recalc);

      document.getElementById('btnSaveTreino').addEventListener('click', async () => {
        const fd = new FormData(document.getElementById('formTreino'));
        const f = Object.fromEntries(fd);
        if (!f.nr || !f.nr.trim()) {
          window.showToast && window.showToast('NR é obrigatória', 'error');
          return;
        }
        const payload = {
          nr: f.nr.trim(),
          descricao: (f.descricao || '').trim(),
          instituicao: (f.instituicao || '').trim(),
          certificadoUrl: (f.certificadoUrl || '').trim(),
          dataRealizacao: f.dataRealizacao || null,
          validadeMeses: f.validadeMeses === '' ? 12 : parseInt(f.validadeMeses, 10),
          dataValidade: f.dataValidade || null,
        };
        try {
          const base = `/api/recursos/${encodeURIComponent(recurso.id)}/treinamentos`;
          const url = editing ? `${base}/${encodeURIComponent(treino.id)}` : base;
          const r = await fetch(url, {
            method: editing ? 'PUT' : 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error(await r.text());
          window.showToast && window.showToast(editing ? 'Treinamento atualizado' : 'Treinamento criado', 'success');
          close();
          this._load(recurso);
        } catch (e) {
          window.showToast && window.showToast(e.message, 'error');
        }
      });
    },
  };
})();
