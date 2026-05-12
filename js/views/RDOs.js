// Tela global de RDOs — listagem flat + dashboard de aderência.
const RDOs = {
  _cache: null,
  _filters: { contractId: '', mes: '' },
  _page: 0,
  _pageSize: 50,

  async render() {
    const root = document.getElementById('app');
    root.innerHTML = `<div style="padding:var(--sp-xl);color:var(--color-text-muted);">Carregando RDOs...</div>`;

    try {
      const r = await fetch('/api/rdos');
      if (!r.ok) throw new Error(await r.text());
      this._cache = await r.json();
    } catch (e) {
      root.innerHTML = `<div style="padding:var(--sp-xl);color:#c33;">Erro ao carregar: ${escapeHtml(e.message)}</div>`;
      return;
    }

    this.draw();
  },

  async draw() {
    const root = document.getElementById('app');
    const { rdos, stats } = this._cache;

    // Filtros aplicados
    const filtered = rdos.filter(r => {
      if (this._filters.contractId && r.contractId !== this._filters.contractId) return false;
      if (this._filters.mes && !String(r.data || '').startsWith(this._filters.mes)) return false;
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / this._pageSize));
    if (this._page >= totalPages) this._page = 0;
    const slice = filtered.slice(this._page * this._pageSize, (this._page + 1) * this._pageSize);

    const contratos = [...new Set(rdos.map(r => `${r.contractId}|${r.contractName}|${r.contractClient || ''}`))]
      .map(s => { const [id, name, client] = s.split('|'); return { id, name, client }; })
      .sort((a, b) => a.name.localeCompare(b.name));

    const fmtData = (d) => {
      if (!d) return '—';
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
    };

    const fmtUltimoRdo = (d) => d ? fmtData(d) : '<strong>nunca</strong>';

    root.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">RDOs — Todos os Contratos</h1>
        <button class="btn btn-primary" id="btnNovoRdoGlobal">+ Novo RDO</button>
      </div>

      ${stats.ehFimDeSemana ? `
        <div style="background:#dbeafe;color:#1e3a8a;padding:var(--sp-md) var(--sp-lg);border-radius:8px;margin-bottom:var(--sp-lg);border:1px solid #93c5fd;display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">📅</span>
          <div>
            <div style="font-weight:700;font-size:14px;">Hoje é fim de semana — RDO é ocasional, não obrigatório.</div>
            <div style="font-size:13px;opacity:0.85;">Os alertas abaixo se referem ao último dia útil (${fmtData(stats.ultimoDiaUtil)}).</div>
          </div>
        </div>
      ` : ''}

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:var(--sp-md);margin-bottom:var(--sp-lg);">
        ${kpiCard('Obras ativas', stats.obrasAtivas, '#3b82f6')}
        ${kpiCard('Sem RDO ontem', stats.obrasSemRdoOntem.length, stats.obrasSemRdoOntem.length > 0 ? '#dc2626' : '#10b981')}
        ${kpiCard('Atrasadas (>2 dias úteis)', stats.obrasAtrasadas.length, stats.obrasAtrasadas.length > 0 ? '#f59e0b' : '#10b981')}
        ${kpiCard(`Aderência ${stats.diasUteisAvaliados} dias úteis`, `${stats.aderencia7d}%`, stats.aderencia7d >= 80 ? '#10b981' : stats.aderencia7d >= 50 ? '#f59e0b' : '#dc2626')}
      </div>

      <!-- Gráfico de aderência diária -->
      ${stats.aderenciaDiaria && stats.aderenciaDiaria.length > 0 ? `
        <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:var(--sp-md);margin-bottom:var(--sp-lg);">
          <div style="font-weight:700;font-size:14px;margin-bottom:var(--sp-sm);color:var(--color-text);">Aderência diária — últimos ${stats.diasUteisAvaliados} dias úteis</div>
          <div style="height:180px;"><canvas id="chartAderencia"></canvas></div>
        </div>
      ` : ''}

      ${stats.obrasSemRdoOntem.length > 0 ? `
        <div style="background:#dc2626;color:#fff;padding:var(--sp-md) var(--sp-lg);border-radius:8px;margin-bottom:var(--sp-lg);box-shadow:0 2px 8px rgba(220,38,38,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:15px;">⚠ Obras sem RDO no último dia útil (${fmtData(stats.ultimoDiaUtil)}):</div>
            <button class="btn" id="btnExportSemRdo" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);font-size:13px;padding:4px 12px;">⬇ Exportar CSV</button>
          </div>
          <ul style="margin:0;padding-left:22px;line-height:1.7;">
            ${stats.obrasSemRdoOntem.map(o => `
              <li>
                <a href="#/contratos/${o.contractId}" style="color:#fff;font-weight:700;text-decoration:underline;">${escapeHtml(o.name)}</a>
                — ${escapeHtml(o.client || '')}
                <span style="color:rgba(255,255,255,0.85);font-size:13px;">(último RDO: ${fmtUltimoRdo(o.ultimoRdo)})</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      ${stats.obrasAtrasadas.length > 0 ? `
        <div style="background:#f59e0b;color:#1f1300;padding:var(--sp-md) var(--sp-lg);border-radius:8px;margin-bottom:var(--sp-lg);box-shadow:0 2px 8px rgba(245,158,11,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:15px;">📋 Obras com mais de 2 dias úteis sem RDO:</div>
            <button class="btn" id="btnExportAtrasadas" style="background:rgba(0,0,0,0.15);color:#1f1300;border:1px solid rgba(0,0,0,0.3);font-size:13px;padding:4px 12px;">⬇ Exportar CSV</button>
          </div>
          <ul style="margin:0;padding-left:22px;line-height:1.7;">
            ${stats.obrasAtrasadas.map(o => `
              <li>
                <a href="#/contratos/${o.contractId}" style="color:#1f1300;font-weight:700;text-decoration:underline;">${escapeHtml(o.name)}</a>
                — <strong>${o.nuncaFezRdo ? 'nunca fez RDO' : o.diasUteisSemRdo + ' dias úteis sem RDO'}</strong>
                ${o.ultimoRdo ? `<span style="color:rgba(31,19,0,0.7);font-size:13px;">(último: ${fmtUltimoRdo(o.ultimoRdo)})</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Filtros -->
      <div style="display:flex;gap:var(--sp-md);align-items:end;margin-bottom:var(--sp-md);flex-wrap:wrap;">
        <div class="form-group" style="margin:0;min-width:240px;">
          <label class="form-label">Contrato</label>
          <select class="form-control" id="fltContract">
            <option value="">— Todos —</option>
            ${contratos.map(c => `<option value="${c.id}" ${this._filters.contractId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}${c.client ? ' (' + escapeHtml(c.client) + ')' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Mês</label>
          <input class="form-control" id="fltMes" type="month" value="${this._filters.mes}">
        </div>
        <button class="btn btn-secondary" id="btnLimparFiltros">Limpar</button>
        <div style="margin-left:auto;color:var(--color-text-muted);font-size:14px;">
          ${filtered.length} RDOs encontrados
        </div>
      </div>

      <!-- Tabela -->
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:120px;">Data</th>
            <th style="width:90px;">Nº</th>
            <th>Contrato</th>
            <th>Cliente</th>
            <th style="width:120px;">OS</th>
            <th style="width:140px;">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          ${slice.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum RDO</td></tr>` : ''}
          ${slice.map(r => `
            <tr style="cursor:pointer;" class="row-rdo-global" data-rdo-id="${r.id}" data-contract-id="${r.contractId}">
              <td>${fmtData(r.data)}</td>
              <td>${escapeHtml(String(r.numero || ''))}</td>
              <td>${escapeHtml(r.contractName || '')}</td>
              <td>${escapeHtml(r.contractClient || '')}</td>
              <td>${escapeHtml(r.osNumero || '')}</td>
              <td style="color:var(--color-text-muted);font-size:13px;">${r.updatedAt ? new Date(r.updatedAt).toLocaleString('pt-BR') : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:var(--sp-sm);margin-top:var(--sp-md);">
          <button class="btn btn-secondary" id="btnPrev" ${this._page === 0 ? 'disabled' : ''}>← Anterior</button>
          <span style="display:flex;align-items:center;color:var(--color-text-muted);">Página ${this._page + 1} de ${totalPages}</span>
          <button class="btn btn-secondary" id="btnNext" ${this._page >= totalPages - 1 ? 'disabled' : ''}>Próxima →</button>
        </div>
      ` : ''}
    `;

    document.getElementById('btnNovoRdoGlobal').addEventListener('click', () => this.showPickerContrato());
    document.getElementById('fltContract').addEventListener('change', (e) => {
      this._filters.contractId = e.target.value;
      this._page = 0;
      this.draw();
    });
    document.getElementById('fltMes').addEventListener('change', (e) => {
      this._filters.mes = e.target.value;
      this._page = 0;
      this.draw();
    });
    document.getElementById('btnLimparFiltros').addEventListener('click', () => {
      this._filters = { contractId: '', mes: '' };
      this._page = 0;
      this.draw();
    });
    document.querySelectorAll('tbody tr.row-rdo-global').forEach(tr => {
      tr.addEventListener('click', async () => {
        const rdoId = tr.dataset.rdoId;
        const contractId = tr.dataset.contractId;
        // Busca o RDO completo via API do contrato (que traz os RDOs aninhados)
        try {
          const r = await fetch('/api/contracts').then(res => res.json());
          const c = (r.contracts || []).find(x => x.id === contractId);
          const rdo = c ? (c.rdos || []).find(x => x.id === rdoId) : null;
          if (rdo && c && window.ContratoDetail?.showRdoDetail) {
            window.ContratoDetail.showRdoDetail(rdo, c);
          } else {
            location.hash = '#/contratos/' + contractId;
          }
        } catch (e) {
          location.hash = '#/contratos/' + contractId;
        }
      });
    });
    const prev = document.getElementById('btnPrev');
    const next = document.getElementById('btnNext');
    if (prev) prev.addEventListener('click', () => { this._page--; this.draw(); });
    if (next) next.addEventListener('click', () => { this._page++; this.draw(); });

    // Exportar CSV — obras sem RDO ontem
    const btnExpSem = document.getElementById('btnExportSemRdo');
    if (btnExpSem) btnExpSem.addEventListener('click', () => {
      const rows = [['Contrato', 'Cliente', 'Último RDO']];
      stats.obrasSemRdoOntem.forEach(o => rows.push([o.name || '', o.client || '', o.ultimoRdo || 'nunca']));
      this._downloadCsv(`obras-sem-rdo-${stats.ultimoDiaUtil}.csv`, rows);
    });

    // Exportar CSV — obras atrasadas
    const btnExpAtr = document.getElementById('btnExportAtrasadas');
    if (btnExpAtr) btnExpAtr.addEventListener('click', () => {
      const rows = [['Contrato', 'Cliente', 'Dias úteis sem RDO', 'Último RDO']];
      stats.obrasAtrasadas.forEach(o => rows.push([
        o.name || '',
        o.client || '',
        o.nuncaFezRdo ? 'nunca fez' : String(o.diasUteisSemRdo),
        o.ultimoRdo || '—',
      ]));
      this._downloadCsv(`obras-atrasadas-${stats.hoje}.csv`, rows);
    });

    // Gráfico de aderência diária — carrega Chart.js sob demanda.
    if (stats.aderenciaDiaria && stats.aderenciaDiaria.length > 0) {
      const canvas = document.getElementById('chartAderencia');
      if (canvas) {
        if (typeof window.Chart === 'undefined' && window.RhinoLazy) {
          await window.RhinoLazy.ensure('chart');
        }
        if (typeof window.Chart === 'undefined') return; // falha de rede silenciada
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const txt = isDark ? '#e5e7eb' : '#374151';
        const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        const labels = stats.aderenciaDiaria.map(d => fmtData(d.data).slice(0,5));
        const data = stats.aderenciaDiaria.map(d => d.pct);
        const colors = data.map(p => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#dc2626');
        if (this._chart) this._chart.destroy();
        this._chart = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Aderência (%)',
              data,
              backgroundColor: colors,
              borderRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const d = stats.aderenciaDiaria[ctx.dataIndex];
                    return `${d.feitos}/${d.esperados} obras (${d.pct}%)`;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 100,
                ticks: { color: txt, callback: (v) => v + '%' },
                grid: { color: grid },
              },
              x: { ticks: { color: txt }, grid: { display: false } }
            }
          }
        });
      }
    }
  },

  _downloadCsv(filename, rows) {
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell ?? '');
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\r\n');
    // BOM para Excel reconhecer UTF-8
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

RDOs.showPickerContrato = function () {
  // Carrega contratos ativos
  const ativos = (Store.state.contracts || [])
    .filter(c => c.status === 'ativo')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (ativos.length === 0) {
    if (window.showToast) window.showToast('Nenhum contrato ativo encontrado.', 'warning');
    return;
  }

  const html = `
    <div class="modal-overlay" id="modalRdoPicker">
      <div class="modal" style="width:520px;max-width:95vw;">
        <div class="modal-header">
          <h2 class="modal-title">+ Novo RDO</h2>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-content">
          <p style="margin:0 0 var(--sp-md);font-size:14px;color:var(--color-text-muted);">
            Escolha o contrato para o qual você quer lançar um RDO. Você poderá preencher os dados (MOI, MOD, equipamentos, atividades, etc.) na próxima tela.
          </p>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Contrato *</label>
            <select class="form-control" id="pickerContractId" required>
              <option value="">— selecione —</option>
              ${ativos.map(c => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.client || '')}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btnPickerCancel">Cancelar</button>
          <button class="btn btn-primary" id="btnPickerOk">Continuar →</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const overlay = document.getElementById('modalRdoPicker');
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  document.getElementById('btnPickerCancel').addEventListener('click', close);
  document.getElementById('btnPickerOk').addEventListener('click', () => {
    const id = document.getElementById('pickerContractId').value;
    if (!id) {
      if (window.showToast) window.showToast('Selecione um contrato.', 'error');
      return;
    }
    close();
    if (window.ContratoDetail?.showModalRdo) {
      // Reusa o modal completo de criação de RDO
      window.ContratoDetail.showModalRdo(id);
    } else {
      // Fallback: navega pra tela do contrato com aba RDO
      window.ContratoDetail._tab = 'rdo';
      location.hash = '#/contratos/' + id;
    }
  });
};

function kpiCard(label, value, color) {
  return `
    <div style="padding:var(--sp-md);background:var(--color-surface);border-radius:8px;border:1px solid var(--color-border);">
      <div style="color:var(--color-text-muted);font-size:13px;margin-bottom:6px;">${label}</div>
      <div style="font-size:28px;font-weight:700;color:${color};">${value}</div>
    </div>
  `;
}

window.RDOs = RDOs;
