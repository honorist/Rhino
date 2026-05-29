/* Rhino · ContratoDetail · cronograma
   Extraído de js/views/ContratoDetail.js (linhas 5050-5375)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/cronograma] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  // ═══════════ Cronograma físico-financeiro ═══════════
  _atividadesCache: null,

  renderCronogramaSection(contract) {
    return `
      <div class="card mb-2xl">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 class="card-title">📅 Cronograma físico-financeiro</h3>
            <span class="text-muted font-sm">Etapas com peso, datas planejadas e % executado</span>
          </div>
          <div style="display:flex;gap:8px;">
            ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovaAtividade">+ Nova etapa</button>` : ''}
          </div>
        </div>
        <div id="cronogramaConteudo" style="padding:var(--sp-md);">
          <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando atividades...</div>
        </div>
      </div>
    `;
  },

  // Carrega atividades e desenha lista + Gantt
  async _loadAtividades(contract) {
    try {
      const r = await fetch(`/api/contracts/${contract.id}/atividades`);
      if (!r.ok) throw new Error(await r.text());
      const { atividades } = await r.json();
      this._atividadesCache = atividades || [];
      this._renderAtividades(contract);
    } catch (e) {
      const div = document.getElementById('cronogramaConteudo');
      if (div) div.innerHTML = `<p class="text-danger">Erro: ${escapeHtml(e.message)}</p>`;
    }
  },

  _renderAtividades(contract) {
    const div = document.getElementById('cronogramaConteudo');
    if (!div) return;
    const atvs = this._atividadesCache || [];

    if (atvs.length === 0) {
      div.innerHTML = `
        <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
          <div style="font-size:48px;margin-bottom:8px;">📅</div>
          <div style="font-weight:600;font-size:16px;margin-bottom:4px;">Nenhuma etapa cadastrada</div>
          <div style="font-size:13px;">Crie etapas para acompanhar avanço físico × financeiro</div>
        </div>`;
      return;
    }

    const fmtDt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const totalPeso = atvs.reduce((s, a) => s + (parseFloat(a.pesoPct) || 0), 0);
    const totalCusto = atvs.reduce((s, a) => s + (parseFloat(a.custoPlan) || 0), 0);
    const execGeral = totalPeso > 0
      ? atvs.reduce((s, a) => s + ((parseFloat(a.pesoPct) || 0) * (parseFloat(a.execPct) || 0) / 100), 0) / totalPeso * 100
      : 0;

    const corExec = (p) => p >= 100 ? 'var(--color-success)' : (p >= 50 ? '#3b82f6' : (p > 0 ? '#F59E0B' : 'var(--color-text-muted)'));

    div.innerHTML = `
      <!-- Resumo -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:var(--sp-md);">
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #3b82f6;">
          <div class="text-muted font-sm">Total etapas</div>
          <div style="font-size:18px;font-weight:700;">${atvs.length}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #10b981;">
          <div class="text-muted font-sm">Soma de pesos</div>
          <div style="font-size:18px;font-weight:700;color:${Math.abs(totalPeso - 100) < 0.01 ? 'var(--color-success)' : '#F59E0B'};">${totalPeso.toFixed(1)}%</div>
          <div class="text-muted font-sm">${Math.abs(totalPeso - 100) < 0.01 ? '✓ ok' : 'meta: 100%'}</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid ${corExec(execGeral)};">
          <div class="text-muted font-sm">Avanço físico</div>
          <div style="font-size:18px;font-weight:700;color:${corExec(execGeral)};">${execGeral.toFixed(1)}%</div>
        </div>
        <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid #8b5cf6;">
          <div class="text-muted font-sm">Custo planejado</div>
          <div style="font-size:18px;font-weight:700;">${Store.formatBRL(totalCusto)}</div>
        </div>
      </div>

      <!-- Gantt SVG -->
      ${this._renderGanttSvg(atvs)}

      <!-- Lista detalhada -->
      <table class="data-table" style="margin-top:var(--sp-lg);">
        <thead>
          <tr>
            <th scope="col">Etapa</th>
            <th scope="col" style="text-align:right;">Peso %</th>
            <th scope="col">Início plan.</th>
            <th scope="col">Fim plan.</th>
            <th scope="col" style="text-align:right;">Custo plan.</th>
            <th scope="col" style="text-align:right;">% Real</th>
            <th scope="col">Progresso</th>
            ${this._podeEditar() ? '<th scope="col" style="text-align:center;">Ações</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${atvs.map(a => {
            const exec = parseFloat(a.execPct) || 0;
            return `
              <tr>
                <td><strong>${escapeHtml(a.nome)}</strong>${a.notas ? `<div class="text-muted font-sm">${escapeHtml(a.notas)}</div>` : ''}</td>
                <td style="text-align:right;font-weight:600;">${(parseFloat(a.pesoPct) || 0).toFixed(1)}%</td>
                <td>${fmtDt(a.dataInicioPlan)}</td>
                <td>${fmtDt(a.dataFimPlan)}</td>
                <td style="text-align:right;">${Store.formatBRL(parseFloat(a.custoPlan) || 0)}</td>
                <td style="text-align:right;color:${corExec(exec)};font-weight:700;">${exec.toFixed(0)}%</td>
                <td style="min-width:120px;">
                  <div style="background:var(--color-surface-2);border-radius:4px;height:8px;overflow:hidden;">
                    <div style="background:${corExec(exec)};width:${Math.min(100, exec)}%;height:100%;transition:width .3s;"></div>
                  </div>
                </td>
                ${this._podeEditar() ? `
                <td style="text-align:center;white-space:nowrap;">
                  <button class="btn btn-sm btn-secondary btn-edit-ativ" data-id="${a.id}" title="Editar">✏️</button>
                  <button class="btn btn-sm btn-danger btn-del-ativ" data-id="${a.id}" data-nome="${escapeHtml(a.nome)}" title="Excluir">🗑️</button>
                </td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // Listeners
    document.querySelectorAll('.btn-edit-ativ').forEach(b => {
      b.addEventListener('click', () => {
        const a = atvs.find(x => x.id === b.dataset.id);
        if (a) this._showModalAtividade(contract, a);
      });
    });
    document.querySelectorAll('.btn-del-ativ').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm(`Excluir a etapa "${b.dataset.nome}"?`)) return;
        try {
          const r = await fetch(`/api/contracts/${contract.id}/atividades/${b.dataset.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error(await r.text());
          window.showToast('Etapa excluída', 'success');
          this._loadAtividades(contract);
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    });

    // Wire Gantt interactivity after DOM settles
    setTimeout(() => this._initGanttInteractivity(contract, atvs), 50);
  },

  // Gantt como SVG simples (sem deps externas) — barra planejada e barra real sobreposta
  _renderGanttSvg(atvs) {
    const ativs = atvs.filter(a => a.dataInicioPlan && a.dataFimPlan);
    if (ativs.length === 0) {
      return `<div class="text-muted" style="padding:var(--sp-md);text-align:center;font-size:13px;">Adicione datas planejadas para ver o Gantt</div>`;
    }
    const inicios = ativs.map(a => new Date(a.dataInicioPlan + 'T12:00:00').getTime());
    const finsP = ativs.map(a => new Date(a.dataFimPlan + 'T12:00:00').getTime());
    const finsR = ativs.map(a => a.dataFimReal ? new Date(a.dataFimReal + 'T12:00:00').getTime() : 0).filter(x => x > 0);
    const min = Math.min(...inicios);
    const max = Math.max(...finsP, ...finsR);
    const range = max - min || 86400000;
    const hoje = Date.now();

    const W = 800; // largura do gráfico
    const H_LIN = 32; // altura por linha
    const PAD_L = 200; // espaço à esquerda pro nome
    const PAD_T = 40;
    const totalW = PAD_L + W + 20;
    const totalH = PAD_T + ativs.length * H_LIN + 20;

    const x = (t) => PAD_L + ((t - min) / range) * W;

    // Eixo de meses
    const eixos = [];
    const cursor = new Date(min);
    cursor.setDate(1);
    while (cursor.getTime() < max) {
      const xx = x(cursor.getTime());
      if (xx >= PAD_L && xx <= PAD_L + W) {
        eixos.push(`<line x1="${xx}" y1="${PAD_T - 8}" x2="${xx}" y2="${totalH - 10}" stroke="#475569" stroke-width="0.5" stroke-dasharray="2 3"/>
                    <text x="${xx + 2}" y="${PAD_T - 12}" font-size="10" fill="#94a3b8">${cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.','')}</text>`);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Linha do "hoje"
    let linhaHoje = '';
    if (hoje >= min && hoje <= max) {
      const xh = x(hoje);
      linhaHoje = `<line x1="${xh}" y1="${PAD_T - 5}" x2="${xh}" y2="${totalH - 10}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="3 3"/>
                   <text x="${xh + 4}" y="${PAD_T - 8}" font-size="10" fill="#dc2626" font-weight="700">hoje</text>`;
    }

    // Barras
    const barras = ativs.map((a, i) => {
      const y = PAD_T + i * H_LIN + 6;
      const x1p = x(new Date(a.dataInicioPlan + 'T12:00:00').getTime());
      const x2p = x(new Date(a.dataFimPlan + 'T12:00:00').getTime());
      const wp = Math.max(2, x2p - x1p);
      const exec = parseFloat(a.execPct) || 0;
      const corExec = exec >= 100 ? '#10b981' : (exec >= 50 ? '#3b82f6' : (exec > 0 ? '#f59e0b' : '#94a3b8'));
      const wExec = wp * Math.min(100, exec) / 100;

      return `
        <text x="${PAD_L - 8}" y="${y + 14}" text-anchor="end" font-size="11" fill="#cbd5e1" font-weight="600">${escapeHtml((a.nome || '').slice(0, 28))}</text>
        <rect class="gantt-bar" data-id="${a.id}" x="${x1p}" y="${y}" width="${wp}" height="20" fill="#1e293b" stroke="#475569" stroke-width="1" rx="3" style="cursor:pointer;"/>
        <rect x="${x1p}" y="${y}" width="${wExec}" height="20" fill="${corExec}" rx="3" style="pointer-events:none;"/>
        <text x="${x1p + wp/2}" y="${y + 14}" text-anchor="middle" font-size="10" fill="#fff" font-weight="700" style="pointer-events:none;">${exec.toFixed(0)}%</text>
      `;
    }).join('');

    return `
      <div style="overflow-x:auto;background:#0f172a;border-radius:8px;padding:10px;">
        <svg width="${totalW}" height="${totalH}" style="display:block;font-family:Nunito,sans-serif;">
          <rect x="${PAD_L}" y="${PAD_T - 5}" width="${W}" height="${ativs.length * H_LIN + 5}" fill="#1e293b" rx="4"/>
          ${eixos.join('')}
          ${linhaHoje}
          ${barras}
        </svg>
      </div>
    `;
  },

  _initGanttInteractivity(contract, atvs) {
    const bars = document.querySelectorAll('.gantt-bar');
    if (!bars.length) return;

    // ── Tooltip ──────────────────────────────────────────────────────────────
    let tooltip = document.getElementById('ganttTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'ganttTooltip';
      tooltip.style.cssText = 'position:fixed;background:#1e293b;color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.6;box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;z-index:9000;white-space:nowrap;border:1px solid #475569;display:none;';
      document.body.appendChild(tooltip);
    }

    const fmtDt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    const showTooltip = (e, a) => {
      const exec = parseFloat(a.execPct) || 0;
      tooltip.innerHTML =
        `🔷 <strong>${escapeHtml(a.nome)}</strong><br>` +
        `📅 ${fmtDt(a.dataInicioPlan)} → ${fmtDt(a.dataFimPlan)}<br>` +
        `⚡ ${exec.toFixed(0)}% executado<br>` +
        `💰 Custo plan.: ${Store.formatBRL(parseFloat(a.custoPlan) || 0)}`;
      tooltip.style.display = 'block';
      positionTooltip(e);
    };

    const positionTooltip = (e) => {
      const TW = tooltip.offsetWidth;
      const TH = tooltip.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = e.clientX + 14;
      let top  = e.clientY + 14;
      if (left + TW > vw - 8) left = e.clientX - TW - 14;
      if (top  + TH > vh - 8) top  = e.clientY - TH - 14;
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
    };

    const hideTooltip = () => { tooltip.style.display = 'none'; };

    // ── Popover ──────────────────────────────────────────────────────────────
    let activePopover = null;

    const closePopover = () => {
      if (activePopover) { activePopover.remove(); activePopover = null; }
    };

    const showPopover = (e, a) => {
      closePopover();
      hideTooltip();

      const exec = parseFloat(a.execPct) || 0;
      const pop = document.createElement('div');
      pop.id = 'ganttPopover';
      pop.style.cssText = 'position:fixed;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:9100;width:220px;font-size:14px;';

      pop.innerHTML = `
        <div style="font-weight:700;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(a.nome)}">${escapeHtml(a.nome)}</div>
        <div style="margin-bottom:8px;">
          <input id="ganttRangeInput" type="range" min="0" max="100" step="5" value="${exec}" style="width:100%;accent-color:#3b82f6;">
        </div>
        <div id="ganttRangeLabel" style="text-align:center;font-weight:700;font-size:16px;margin-bottom:12px;">${exec.toFixed(0)}%</div>
        <div style="display:flex;gap:8px;">
          <button id="ganttPopSave"  class="btn btn-primary btn-sm"   style="flex:1;">Salvar</button>
          <button id="ganttPopCancel" class="btn btn-secondary btn-sm" style="flex:1;">Cancelar</button>
        </div>
      `;

      // Position near cursor, keep inside viewport
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const PW = 220;
      const PH = 140; // approximate
      let left = e.clientX + 10;
      let top  = e.clientY + 10;
      if (left + PW > vw - 8) left = e.clientX - PW - 10;
      if (top  + PH > vh - 8) top  = e.clientY - PH - 10;
      pop.style.left = left + 'px';
      pop.style.top  = top  + 'px';

      document.body.appendChild(pop);
      activePopover = pop;

      const rangeInput = pop.querySelector('#ganttRangeInput');
      const rangeLabel = pop.querySelector('#ganttRangeLabel');

      rangeInput.addEventListener('input', () => {
        rangeLabel.textContent = rangeInput.value + '%';
      });

      pop.querySelector('#ganttPopCancel').addEventListener('click', closePopover);

      pop.querySelector('#ganttPopSave').addEventListener('click', async () => {
        const newValue = parseInt(rangeInput.value, 10);
        try {
          const r = await fetch(`/api/contracts/${contract.id}/atividades/${a.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ execPct: newValue, nome: a.nome }),
          });
          if (!r.ok) throw new Error(await r.text());
          closePopover();
          window.showToast('Progresso atualizado', 'success');
          this._loadAtividades(contract);
        } catch (err) { window.showToast(err.message, 'error'); }
      });
    };

    // ── Wire events ──────────────────────────────────────────────────────────
    bars.forEach(bar => {
      const a = atvs.find(x => x.id === bar.dataset.id);
      if (!a) return;

      bar.addEventListener('mouseenter', (e) => showTooltip(e, a));
      bar.addEventListener('mousemove',  (e) => positionTooltip(e));
      bar.addEventListener('mouseleave', () => hideTooltip());
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        showPopover(e, a);
      });
    });

    // Close popover on outside click or ESC
    const onOutsideClick = (e) => {
      if (activePopover && !activePopover.contains(e.target)) closePopover();
    };
    const onEsc = (e) => { if (e.key === 'Escape') closePopover(); };

    // Remove stale listeners before adding fresh ones (re-render scenario)
    document.removeEventListener('click', this._ganttOutsideClick);
    document.removeEventListener('keydown', this._ganttEscHandler);
    this._ganttOutsideClick = onOutsideClick;
    this._ganttEscHandler   = onEsc;
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEsc);
  },

  _showModalAtividade(contract, ativ) {
    const editing = !!ativ;

    // Auto-preenche a data de início ao criar nova etapa:
    //   - 1ª etapa (sem nenhuma anterior) → data de início do contrato
    //   - 2ª+ etapa → dia seguinte ao fim da última etapa cadastrada
    let inicioDefault = '';
    let inicioHint = '';
    if (!editing) {
      const atvs = (this._atividadesCache || []).slice();
      if (atvs.length === 0) {
        inicioDefault = contract.startDate || '';
        if (inicioDefault) inicioHint = '📅 Sugerido: data de início do contrato';
      } else {
        const comFim = atvs.filter(a => a.dataFimPlan);
        if (comFim.length > 0) {
          comFim.sort((a, b) => a.dataFimPlan.localeCompare(b.dataFimPlan));
          const ultimaFim = comFim[comFim.length - 1];
          const d = new Date(ultimaFim.dataFimPlan + 'T12:00:00');
          d.setDate(d.getDate() + 1);
          inicioDefault = d.toISOString().split('T')[0];
          inicioHint = `📅 Sugerido: dia seguinte ao fim de "${ultimaFim.nome}"`;
        } else {
          inicioDefault = contract.startDate || '';
          if (inicioDefault) inicioHint = '📅 Sugerido: data de início do contrato (etapas anteriores sem data fim)';
        }
      }
    }

    const html = `
      <div class="modal-overlay" id="modalAtividade" style="z-index:1100;">
        <div class="modal" style="width:560px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">${editing ? '✏️ Editar' : '+ Nova'} etapa do cronograma</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formAtividade" class="modal-content">
            <div class="form-group">
              <label class="form-label">Nome da etapa *</label>
              <input class="form-control" name="nome" required value="${escapeHtml(ativ?.nome || '')}" placeholder="Ex: Engenharia, Aquisições, Montagem...">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Início planejado</label>
                <input class="form-control" type="date" name="dataInicioPlan" value="${ativ?.dataInicioPlan || inicioDefault}">
                ${inicioHint ? `<span style="font-size:12px;color:var(--color-text-muted);">${inicioHint}</span>` : ''}
              </div>
              <div class="form-group">
                <label class="form-label">Fim planejado</label>
                <input class="form-control" type="date" name="dataFimPlan" value="${ativ?.dataFimPlan || ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Peso (%) — soma das etapas = 100%</label>
                <input class="form-control" type="number" name="pesoPct" step="0.1" min="0" max="100" value="${ativ?.pesoPct ?? 0}">
              </div>
              <div class="form-group">
                <label class="form-label">% Realizado (0-100)</label>
                <input class="form-control" type="number" name="execPct" step="1" min="0" max="100" value="${ativ?.execPct ?? 0}">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Custo planejado (BRL)</label>
              <input class="form-control" type="number" name="custoPlan" step="0.01" min="0" value="${ativ?.custoPlan ?? 0}">
            </div>
            <div class="form-group">
              <label class="form-label">Notas</label>
              <textarea class="form-control" name="notas" rows="2">${escapeHtml(ativ?.notas || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelAtv">Cancelar</button>
            <button class="btn btn-primary" id="btnSaveAtv">${editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalAtividade');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelAtv').addEventListener('click', close);

    document.getElementById('btnSaveAtv').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formAtividade'));
      const data = Object.fromEntries(fd);
      if (!data.nome?.trim()) { window.showToast('Nome obrigatório', 'error'); return; }
      try {
        const url = editing
          ? `/api/contracts/${contract.id}/atividades/${ativ.id}`
          : `/api/contracts/${contract.id}/atividades`;
        const method = editing ? 'PUT' : 'POST';
        const r = await fetch(url, {
          method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error(await r.text());
        window.showToast(editing ? 'Etapa atualizada' : 'Etapa criada', 'success');
        close();
        this._loadAtividades(contract);
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  // Gera one-pager PDF executivo do contrato (jsPDF + autotable lazy-loaded via lazy.js)
  });
})();
