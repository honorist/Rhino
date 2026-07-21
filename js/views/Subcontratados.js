/**
 * View: Subcontratados / empreiteiros (#/subcontratados)
 *
 * Cadastro GLOBAL (não por obra) de empreiteiros/terceiros. A lista mostra os
 * totais medido/pago/saldo de cada um (o backend já devolve o `resumo` embutido).
 * Abrir um subcontratado abre o boletim de medições — competência a competência,
 * do previsto ao pago — com totais e ações de criar/editar/excluir medição.
 *
 * A fonte de verdade dos totais mora no servidor (lib/subcontratado.js); esta view
 * só apresenta. Busca dados via fetch (não depende do Store) para ser autocontida.
 */
window.Subcontratados = {
  busca: '',
  _lista: [],
  _contratos: null, // cache lazy p/ o select opcional de obra na medição

  MED_STATUS: [
    { v: 'prevista', l: 'Prevista' },
    { v: 'medida', l: 'Medida' },
    { v: 'paga', l: 'Paga' },
  ],

  _fmtBRL(n) {
    return 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  },

  _fmtComp(c) {
    const m = String(c || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${m[2]}/${m[1]}` : (c ? escapeHtml(String(c)) : '—');
  },

  _statusPill(st) {
    const map = {
      prevista: ['Prevista', '#dbeafe', '#1e40af'],
      medida: ['Medida', '#fef3c7', '#b45309'],
      paga: ['Paga', '#d1fae5', '#047857'],
    };
    const [lbl, bg, fg] = map[st] || [st || '—', 'var(--color-surface-2)', 'var(--color-text-muted)'];
    return `<span class="badge" style="background:${bg};color:${fg};font-size:11px;">${escapeHtml(lbl)}</span>`;
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando subcontratados...</div>';
    try {
      const res = await fetch('/api/subcontratados');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this._lista = await res.json();

      const termo = (this.busca || '').toLowerCase().trim();
      let lista = this._lista;
      if (termo) {
        lista = lista.filter(
          (s) =>
            (s.nome || '').toLowerCase().includes(termo) ||
            (s.especialidade || '').toLowerCase().includes(termo) ||
            (s.cnpj || '').toLowerCase().includes(termo)
        );
      }
      const total = this._lista.length;

      app.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Subcontratados</h1>
            <p class="page-subtitle">${total} empreiteiro${total !== 1 ? 's' : ''} · medições do previsto ao pago</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-primary btn-lg" id="btnNovoSub">+ Novo Subcontratado</button>
          </div>
        </div>

        <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <input class="form-control" id="inputBuscaSub" placeholder="🔍 Buscar por nome, especialidade ou CNPJ..." value="${escapeHtml(this.busca)}">
        </div>

        ${
          lista.length === 0
            ? `<div class="card" style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
                 <div style="font-size:44px;margin-bottom:8px;opacity:.6;">👷</div>
                 <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhum subcontratado</div>
                 <div style="font-size:13px;">Cadastre empreiteiros e registre as medições de cada um.</div>
               </div>`
            : `<div class="card" style="padding:0;">
                 <div class="table-wrap">
                   <table>
                     <thead>
                       <tr>
                         <th scope="col">Nome</th>
                         <th scope="col">Especialidade</th>
                         <th scope="col" style="width:150px;">CNPJ</th>
                         <th scope="col" style="width:80px;text-align:center;">Status</th>
                         <th scope="col" style="width:130px;text-align:right;">Medido</th>
                         <th scope="col" style="width:130px;text-align:right;">Pago</th>
                         <th scope="col" style="width:130px;text-align:right;">Saldo</th>
                         <th scope="col" style="width:200px;">Ações</th>
                       </tr>
                     </thead>
                     <tbody>${lista.map((s) => this._renderRow(s)).join('')}</tbody>
                   </table>
                 </div>
               </div>`
        }
      `;
      this._attachEvents();
    } catch (e) {
      console.error('[Subcontratados] erro:', e);
      app.innerHTML = `<div class="error-banner">Erro ao carregar subcontratados: ${escapeHtml(e.message)}</div>`;
    }
  },

  _renderRow(s) {
    const r = s.resumo || {};
    const saldo = r.saldo != null ? r.saldo : 0;
    return `
      <tr style="${s.status === 'inativo' ? 'opacity:.55;' : ''}">
        <td><strong>${escapeHtml(s.nome || '—')}</strong></td>
        <td>${escapeHtml(s.especialidade || '—')}</td>
        <td>${escapeHtml(s.cnpj || '—')}</td>
        <td style="text-align:center;">
          ${
            s.status === 'inativo'
              ? '<span class="badge" style="background:#fee;color:#900;font-size:11px;">inativo</span>'
              : '<span class="badge" style="background:rgba(16,185,129,.15);color:#10b981;font-size:11px;">ativo</span>'
          }
        </td>
        <td style="text-align:right;">${this._fmtBRL(r.totalMedido)}</td>
        <td style="text-align:right;">${this._fmtBRL(r.totalPago)}</td>
        <td style="text-align:right;font-weight:600;color:${saldo > 0 ? 'var(--color-danger, #dc2626)' : 'inherit'};">${this._fmtBRL(saldo)}</td>
        <td>
          <div class="actions-cell">
            <button type="button" class="action-link btn-abrir-sub" data-id="${s.id}">Abrir</button>
            <button type="button" class="action-link btn-editar-sub" data-id="${s.id}">Editar</button>
            <button type="button" class="action-link danger btn-excluir-sub" data-id="${s.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  },

  _attachEvents() {
    const btnNovo = document.getElementById('btnNovoSub');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModal(null));

    const inputBusca = document.getElementById('inputBuscaSub');
    if (inputBusca) {
      let timer;
      inputBusca.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.busca = inputBusca.value;
          this.render();
        }, 250);
      });
    }

    document.querySelectorAll('.btn-abrir-sub').forEach((b) => {
      b.addEventListener('click', () => {
        const s = this._lista.find((x) => x.id === b.dataset.id);
        if (s) this.showDetail(s);
      });
    });
    document.querySelectorAll('.btn-editar-sub').forEach((b) => {
      b.addEventListener('click', () => {
        const s = this._lista.find((x) => x.id === b.dataset.id);
        if (s) this.showModal(s);
      });
    });
    document.querySelectorAll('.btn-excluir-sub').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir este subcontratado e todas as suas medições?')) return;
        try {
          const res = await fetch('/api/subcontratados/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Subcontratado excluído', 'success');
          this.render();
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });
  },

  // ─────────────────────────── Modal: subcontratado ─────────────────────────

  showModal(sub) {
    const isEdit = !!sub;
    const s = sub || { nome: '', cnpj: '', especialidade: '', contato: '', telefone: '', status: 'ativo', observacoes: '' };

    const html = `
      <div class="modal-overlay" id="modalOverlaySub">
        <div class="modal" style="width:620px;max-width:96vw;">
          <div class="modal-header">
            <h2 class="modal-title">${isEdit ? 'Editar Subcontratado' : 'Novo Subcontratado'}</h2>
            <button class="modal-close" id="btnFecharSub">✕</button>
          </div>
          <form id="formSub" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome *</label>
              <input type="text" class="form-control" name="nome" required value="${escapeHtml(s.nome || '')}" placeholder="Ex: Elétrica Andrade Ltda">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">CNPJ</label>
                <input type="text" class="form-control" name="cnpj" value="${escapeHtml(s.cnpj || '')}" placeholder="00.000.000/0000-00">
              </div>
              <div class="form-group">
                <label class="form-label">Especialidade</label>
                <input type="text" class="form-control" name="especialidade" value="${escapeHtml(s.especialidade || '')}" placeholder="Ex: Montagem elétrica">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 130px;gap:12px;">
              <div class="form-group">
                <label class="form-label">Contato</label>
                <input type="text" class="form-control" name="contato" value="${escapeHtml(s.contato || '')}" placeholder="Nome do responsável">
              </div>
              <div class="form-group">
                <label class="form-label">Telefone</label>
                <input type="text" class="form-control" name="telefone" value="${escapeHtml(s.telefone || '')}" placeholder="(00) 00000-0000">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">
                  <option value="ativo" ${s.status !== 'inativo' ? 'selected' : ''}>Ativo</option>
                  <option value="inativo" ${s.status === 'inativo' ? 'selected' : ''}>Inativo</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="observacoes" rows="2" placeholder="Notas gerais sobre o subcontratado">${escapeHtml(s.observacoes || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarSub">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarSub">${isEdit ? 'Salvar Alterações' : 'Criar Subcontratado'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const close = () => document.getElementById('modalOverlaySub')?.remove();
    document.getElementById('btnFecharSub').addEventListener('click', close);
    document.getElementById('btnCancelarSub').addEventListener('click', close);

    document.getElementById('btnSalvarSub').addEventListener('click', async () => {
      const form = document.getElementById('formSub');
      const nome = form.nome.value.trim();
      if (!nome) {
        if (window.showToast) showToast('Nome é obrigatório', 'warning');
        return;
      }
      const data = {
        nome,
        cnpj: form.cnpj.value.trim(),
        especialidade: form.especialidade.value.trim(),
        contato: form.contato.value.trim(),
        telefone: form.telefone.value.trim(),
        status: form.status.value,
        observacoes: form.observacoes.value.trim(),
      };
      try {
        const url = isEdit ? '/api/subcontratados/' + sub.id : '/api/subcontratados';
        const res = await fetch(url, {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'HTTP ' + res.status);
        }
        close();
        this.render();
        if (window.showToast) showToast(isEdit ? 'Subcontratado atualizado' : 'Subcontratado criado', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },

  // ─────────────────────── Detalhe: boletim de medições ─────────────────────

  showDetail(sub) {
    const s = sub || {};
    const html = `
      <div class="modal-overlay" id="modalOverlayDet">
        <div class="modal" style="width:860px;max-width:96vw;max-height:92vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(s.nome || 'Subcontratado')}</h2>
              <div class="text-muted font-sm">${escapeHtml(s.especialidade || '—')}${s.cnpj ? ' · ' + escapeHtml(s.cnpj) : ''}</div>
            </div>
            <button class="modal-close" id="btnFecharDet">✕</button>
          </div>
          <div class="modal-content" id="detConteudo">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando medições…</div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('btnFecharDet').addEventListener('click', () => {
      document.getElementById('modalOverlayDet')?.remove();
      // ao fechar o detalhe, atualiza a lista (totais podem ter mudado)
      this.render();
    });
    this._loadMedicoes(s);
  },

  async _loadMedicoes(sub) {
    const box = document.getElementById('detConteudo');
    if (!box) return;
    try {
      const res = await fetch('/api/subcontratados/' + sub.id + '/medicoes');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      box.innerHTML = this._renderDetailBody(sub, data.medicoes || [], data.resumo || {});
      this._attachDetailEvents(sub);
    } catch (e) {
      box.innerHTML = `<p class="text-danger">Erro ao carregar medições: ${escapeHtml(e.message)}</p>`;
    }
  },

  _renderDetailBody(sub, medicoes, resumo) {
    const kpis = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Previsto</div>
          <div style="font-size:16px;font-weight:700;">${this._fmtBRL(resumo.totalPrevisto)}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #f59e0b;">
          <div class="text-muted font-sm">Medido</div>
          <div style="font-size:16px;font-weight:700;">${this._fmtBRL(resumo.totalMedido)}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #10b981;">
          <div class="text-muted font-sm">Pago</div>
          <div style="font-size:16px;font-weight:700;">${this._fmtBRL(resumo.totalPago)}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #dc2626;">
          <div class="text-muted font-sm">Saldo a pagar</div>
          <div style="font-size:16px;font-weight:700;color:${(resumo.saldo || 0) > 0 ? 'var(--color-danger, #dc2626)' : 'inherit'};">${this._fmtBRL(resumo.saldo)}</div>
        </div>
      </div>
    `;

    const controls = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
        <strong>Medições</strong>
        <button class="btn btn-primary btn-sm" id="btnNovaMed">+ Nova medição</button>
      </div>
    `;

    let corpo;
    if (!medicoes.length) {
      corpo = `<div style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);">Nenhuma medição registrada.</div>`;
    } else {
      const linhas = medicoes
        .map(
          (m) => `
        <tr>
          <td style="white-space:nowrap;">${this._fmtComp(m.competencia)}</td>
          <td>${escapeHtml(m.descricao || '—')}</td>
          <td style="text-align:right;">${(Number(m.percentual) || 0).toFixed(0)}%</td>
          <td style="text-align:right;font-weight:600;">${this._fmtBRL(m.valor)}</td>
          <td style="text-align:center;">${this._statusPill(m.status)}</td>
          <td>
            <div class="actions-cell">
              <button type="button" class="action-link btn-editar-med" data-id="${m.id}">Editar</button>
              <button type="button" class="action-link danger btn-excluir-med" data-id="${m.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `
        )
        .join('');
      corpo = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" style="width:100px;">Competência</th>
                <th scope="col">Descrição</th>
                <th scope="col" style="width:70px;text-align:right;">%</th>
                <th scope="col" style="width:130px;text-align:right;">Valor</th>
                <th scope="col" style="width:90px;text-align:center;">Status</th>
                <th scope="col" style="width:150px;">Ações</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      `;
    }

    return kpis + controls + corpo;
  },

  _attachDetailEvents(sub) {
    const btnNova = document.getElementById('btnNovaMed');
    if (btnNova) btnNova.addEventListener('click', () => this._showModalMedicao(sub, null));

    document.querySelectorAll('.btn-editar-med').forEach((b) => {
      b.addEventListener('click', async () => {
        // Busca a medição atual do envelope já carregado no DOM não é trivial;
        // recarrega e abre pelo id (fonte de verdade no servidor).
        try {
          const res = await fetch('/api/subcontratados/' + sub.id + '/medicoes');
          const data = await res.json();
          const m = (data.medicoes || []).find((x) => x.id === b.dataset.id);
          if (m) this._showModalMedicao(sub, m);
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });

    document.querySelectorAll('.btn-excluir-med').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Excluir esta medição?')) return;
        try {
          const res = await fetch('/api/subcontratados/' + sub.id + '/medicoes/' + b.dataset.id, { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (window.showToast) showToast('Medição excluída', 'success');
          this._loadMedicoes(sub);
        } catch (e) {
          if (window.showToast) showToast('Erro: ' + e.message, 'error');
        }
      });
    });
  },

  // ──────────────────────────── Modal: medição ──────────────────────────────

  async _contratosOptions(selectedId) {
    if (this._contratos == null) {
      try {
        const res = await fetch('/api/contracts?lite=1');
        this._contratos = res.ok ? await res.json() : [];
      } catch {
        this._contratos = [];
      }
    }
    const arr = Array.isArray(this._contratos) ? this._contratos : [];
    return ['<option value="">— sem obra —</option>']
      .concat(
        arr.map(
          (c) =>
            `<option value="${escapeHtml(c.id)}" ${selectedId === c.id ? 'selected' : ''}>${escapeHtml(c.name || c.client || c.id)}</option>`
        )
      )
      .join('');
  },

  async _showModalMedicao(sub, med) {
    const editing = !!(med && med.id);
    const m = med || { competencia: '', descricao: '', valor: '', percentual: '', status: 'prevista', data: '', contractId: '' };
    const contratoOpts = await this._contratosOptions(m.contractId || '');

    const html = `
      <div class="modal-overlay" id="modalOverlayMed" style="z-index:1120;">
        <div class="modal" style="width:600px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${editing ? 'Editar Medição' : 'Nova Medição'}</h2>
            <button class="modal-close" id="btnFecharMed">✕</button>
          </div>
          <form id="formMed" class="modal-content">
            <div style="display:grid;grid-template-columns:150px 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">Competência *</label>
                <input type="month" class="form-control" name="competencia" required value="${escapeHtml(String(m.competencia || '').slice(0, 7))}">
              </div>
              <div class="form-group">
                <label class="form-label">Descrição</label>
                <input type="text" class="form-control" name="descricao" value="${escapeHtml(m.descricao || '')}" placeholder="Ex: Medição 03 — eixos 1 a 4">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 110px 130px;gap:12px;">
              <div class="form-group">
                <label class="form-label">Valor (R$)</label>
                <input type="text" inputmode="decimal" class="form-control" name="valor" value="${escapeHtml(String(m.valor == null ? '' : m.valor))}" placeholder="0,00">
              </div>
              <div class="form-group">
                <label class="form-label">% avanço</label>
                <input type="number" min="0" max="100" step="1" class="form-control" name="percentual" value="${escapeHtml(String(m.percentual == null ? '' : m.percentual))}">
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" name="status">
                  ${this.MED_STATUS.map((o) => `<option value="${o.v}" ${m.status === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:150px 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">Data</label>
                <input type="date" class="form-control" name="data" value="${escapeHtml(m.data ? String(m.data).slice(0, 10) : '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Obra (opcional)</label>
                <select class="form-control" name="contractId">${contratoOpts}</select>
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelarMed">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarMed">${editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const close = () => document.getElementById('modalOverlayMed')?.remove();
    document.getElementById('btnFecharMed').addEventListener('click', close);
    document.getElementById('btnCancelarMed').addEventListener('click', close);

    document.getElementById('btnSalvarMed').addEventListener('click', async () => {
      const form = document.getElementById('formMed');
      const competencia = form.competencia.value.trim();
      if (!competencia) {
        if (window.showToast) showToast('Competência é obrigatória', 'warning');
        return;
      }
      const body = {
        competencia,
        descricao: form.descricao.value.trim(),
        valor: form.valor.value,
        percentual: form.percentual.value,
        status: form.status.value,
        data: form.data.value || null,
        contractId: form.contractId.value || null,
      };
      try {
        const url = editing
          ? '/api/subcontratados/' + sub.id + '/medicoes/' + med.id
          : '/api/subcontratados/' + sub.id + '/medicoes';
        const res = await fetch(url, {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'HTTP ' + res.status);
        }
        close();
        this._loadMedicoes(sub);
        if (window.showToast) showToast(editing ? 'Medição atualizada' : 'Medição criada', 'success');
      } catch (e) {
        if (window.showToast) showToast('Erro: ' + e.message, 'error');
      }
    });
  },
};
