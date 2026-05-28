'use strict';
// Histórico de preços de fornecedores — responde "para este item, quem cotou e a que preço?"
window.CotacoesHistorico = {
  _store: (window.UIKit?.persistFilter?.('cotacoes', { filtroItem: '', filtroFornecedor: '' })) || null,
  get _filtroItem()       { return this._store?.get('filtroItem')       ?? ''; },
  set _filtroItem(v)      { this._store?.set('filtroItem', v); },
  get _filtroFornecedor() { return this._store?.get('filtroFornecedor') ?? ''; },
  set _filtroFornecedor(v){ this._store?.set('filtroFornecedor', v); },

  _allCotacoes: [],

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando histórico…</div>';
    try {
      const url = '/api/cotacoes-historico' + (this._filtroItem ? `?item=${encodeURIComponent(this._filtroItem)}` : '');
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { cotacoes } = await res.json();
      this._allCotacoes = cotacoes || [];
      this._draw();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card"><p class="text-danger">Erro ao carregar: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    let lista = this._allCotacoes;

    if (this._filtroItem) lista = lista.filter(c => (c.itemDescricao || '').toLowerCase().includes(this._filtroItem.toLowerCase()));
    if (this._filtroFornecedor) lista = lista.filter(c => c.fornecedor === this._filtroFornecedor);

    // KPIs
    const totalCotacoes   = lista.length;
    const fornecedoresSet = new Set(lista.map(c => c.fornecedor).filter(Boolean));
    const itensSet        = new Set(lista.map(c => c.itemDescricao).filter(Boolean));
    const vencedoras      = lista.filter(c => c.venceu).length;

    // Fornecedores distintos para o select
    const todosFornecedores = [...new Set(this._allCotacoes.map(c => c.fornecedor).filter(Boolean))].sort();

    const headerHtml = window.UIKit?.pageHeader ? window.UIKit.pageHeader({
      title: 'Histórico de Cotações',
      subtitle: 'Evolução de preços por item e fornecedor',
    }) : '<h2>Histórico de Cotações</h2>';

    const kpisHtml = window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
      { label: 'Cotações',          value: totalCotacoes,           color: 'var(--color-primary)' },
      { label: 'Fornecedores',      value: fornecedoresSet.size,    color: 'var(--color-info)' },
      { label: 'Itens distintos',   value: itensSet.size,           color: 'var(--color-success)' },
      { label: '✅ Vencedoras',     value: vencedoras,              color: 'var(--color-warning)' },
    ]) : '';

    const toolbarHtml = `
      <div class="card" style="padding:var(--sp-md);">
        <div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:2;min-width:200px;margin:0;">
            <label class="form-label">Buscar por item</label>
            <input class="form-control" type="text" id="filtroItemInput" placeholder="Ex.: Cimento, Cabo, …"
              value="${escapeHtml(this._filtroItem)}">
          </div>
          <div class="form-group" style="flex:1;min-width:160px;margin:0;">
            <label class="form-label">Fornecedor</label>
            <select class="form-control" id="filtroFornecedorSelect">
              <option value="">Todos</option>
              ${todosFornecedores.map(f => `<option value="${escapeHtml(f)}" ${this._filtroFornecedor === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
            </select>
          </div>
          <div style="padding-bottom:1px;">
            <button class="btn btn-secondary" id="btnBuscarCotacoes">🔍 Buscar</button>
            ${(this._filtroItem || this._filtroFornecedor) ? `<button class="btn btn-ghost" id="btnLimparCotacoes" style="margin-left:6px;">✕ Limpar</button>` : ''}
          </div>
        </div>
      </div>`;

    // Sparkline SVG quando um item específico está filtrado
    let sparklineHtml = '';
    if (this._filtroItem && lista.length > 0) {
      // Agrupa por fornecedor, ordena por data, pega vencedoras
      const vencedorasPorItem = lista.filter(c => c.venceu).sort((a, b) => a.createdAt?.localeCompare(b.createdAt || '') || 0);
      if (vencedorasPorItem.length >= 2) {
        sparklineHtml = `
          <div class="card" style="padding:var(--sp-md);">
            <div style="font-size:13px;font-weight:600;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">
              📈 Evolução de preço (itens vencedores) — ${escapeHtml(this._filtroItem)}
            </div>
            ${this._renderSparkline(vencedorasPorItem)}
          </div>`;
      }
    }

    const fmtBRL = v => v != null ? 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const fmtDt  = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';

    const tableHtml = `
      <div class="card" style="padding:0;">
        ${lista.length === 0 ? `
          <p class="text-muted" style="padding:var(--sp-xl);text-align:center;">
            Nenhuma cotação encontrada${this._filtroItem || this._filtroFornecedor ? ' com este filtro' : '. Crie e avalie uma Solicitação de Compra para ver cotações aqui.'}.
          </p>
        ` : `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data SC</th><th>Item</th><th>Fornecedor</th>
                  <th style="text-align:right;">Valor unit.</th>
                  <th>Contrato</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${lista.map(c => `
                  <tr>
                    <td>${fmtDt(c.createdAt)}</td>
                    <td><strong>${escapeHtml(c.itemDescricao || '—')}</strong><div class="rh-meta">SC #${escapeHtml(c.scNumero || '—')}</div></td>
                    <td>${escapeHtml(c.fornecedor || '—')}</td>
                    <td style="text-align:right;font-weight:${c.venceu ? '700' : '400'};color:${c.venceu ? 'var(--color-success)' : 'inherit'};">
                      ${fmtBRL(c.valor)}
                    </td>
                    <td>${escapeHtml(c.contractName || '—')}</td>
                    <td>${c.venceu
                      ? '<span class="badge" style="background:#D1FAE5;color:#065F46;">✅ Venceu</span>'
                      : '<span class="badge" style="background:#F3F4F6;color:#6B7280;">Não escolhida</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>`;

    app.innerHTML = `${headerHtml}${kpisHtml}${toolbarHtml}${sparklineHtml}${tableHtml}`;

    document.getElementById('filtroFornecedorSelect')?.addEventListener('change', e => {
      this._filtroFornecedor = e.target.value; this._draw();
    });
    document.getElementById('btnBuscarCotacoes')?.addEventListener('click', () => {
      const v = (document.getElementById('filtroItemInput')?.value || '').trim();
      if (v !== this._filtroItem) { this._filtroItem = v; this.render(); }
      else { this._draw(); }
    });
    document.getElementById('filtroItemInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnBuscarCotacoes')?.click();
    });
    document.getElementById('btnLimparCotacoes')?.addEventListener('click', () => {
      this._filtroItem = ''; this._filtroFornecedor = ''; this.render();
    });
  },

  _renderSparkline(pontos) {
    if (pontos.length < 2) return '';
    const W = 460, H = 60, padX = 10, padY = 8;
    const vals = pontos.map(p => parseFloat(p.valor) || 0);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const rangeV = maxV - minV || 1;
    const scaleX = (i) => padX + (i / (pontos.length - 1)) * (W - 2 * padX);
    const scaleY = (v) => H - padY - ((v - minV) / rangeV) * (H - 2 * padY);
    const pts = pontos.map((p, i) => `${scaleX(i).toFixed(1)},${scaleY(parseFloat(p.valor)||0).toFixed(1)}`).join(' ');
    const fmtBRL = v => 'R$' + parseFloat(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    return `
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible;">
        <polyline points="${pts}" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linejoin="round"/>
        ${pontos.map((p, i) => `
          <circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(parseFloat(p.valor)||0).toFixed(1)}" r="3" fill="var(--color-primary)"/>
          ${i === 0 || i === pontos.length - 1 ? `
            <text x="${scaleX(i).toFixed(1)}" y="${(scaleY(parseFloat(p.valor)||0) - 5).toFixed(1)}"
              text-anchor="${i === 0 ? 'start' : 'end'}" font-size="10" fill="var(--color-text-muted)">
              ${fmtBRL(p.valor)}
            </text>` : ''}
        `).join('')}
      </svg>`;
  },
};
