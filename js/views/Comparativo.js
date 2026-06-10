// Comparativo de Contratos — ranking ordenável por métricas-chave.
// Calcula tudo no client a partir do Store (sem novo endpoint).
window.Comparativo = {
  _sortBy: 'margemReais',
  _sortDir: 'desc',
  _filtroStatus: 'ativos',  // ativos | todos | concluidos

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      await Store.loadAll();
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  // Calcula métricas comparáveis para um contrato
  _calcMetrics(c) {
    const id = c.id;
    const valor = parseFloat(c.value) || 0;
    const saidas = (Store.state.saidas || []).filter(s => s.contractId === id);
    const totalSaidas = saidas.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
    const baseAlocs = (Store.state.base || []).filter(b => (b.contracts || []).some(a => a.contractId === id));
    const totalBase = baseAlocs.reduce((s, b) => s + ((b.contracts || []).find(a => a.contractId === id)?.value || 0), 0);
    const compras = (Store.state.caixa || []).filter(e => e.contractId === id && e.type === 'saida' && e.category !== 'passagem');
    const totalCompras = compras.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
    const passagens = (Store.state.caixa || []).filter(e => e.contractId === id && e.category === 'passagem' && e.type === 'saida');
    const totalPassagens = passagens.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
    const totalCusto = totalSaidas + totalBase + totalCompras + totalPassagens;

    const nfs = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === id);
    const totalMedido = nfs.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    const totalEmitido = nfs.filter(nf => nf.emitida).reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);

    const margemReais = totalMedido - totalCusto;
    const pctMargem = valor > 0 ? (margemReais / valor) * 100 : 0;
    const pctMedido = valor > 0 ? (totalMedido / valor) * 100 : 0;
    const pctEmitido = valor > 0 ? (totalEmitido / valor) * 100 : 0;
    const orcado = (c.budget || []).reduce((s, b) => s + (parseFloat(b.value) || 0), 0);
    const desvioOrcado = orcado > 0 ? ((totalCusto - orcado) / orcado) * 100 : 0;

    // Atraso: tendencyDate vs endDate
    let atrasoDias = 0;
    if (c.tendencyDate && c.endDate) {
      const t = new Date(c.tendencyDate + 'T12:00:00');
      const e = new Date(c.endDate + 'T12:00:00');
      atrasoDias = Math.round((t - e) / 86400000);
    }

    // Equipe alocada agora
    const equipeAtual = (Store.state.recursos || [])
      .filter(r => r.status === 'funcionario' && r.alocacaoAtual?.contractId === id).length;

    // RDOs nos últimos 30 dias
    const rdos = c.rdos || [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje); limite.setDate(limite.getDate() - 30);
    const rdosUltimos30 = rdos.filter(r => r.data && new Date(r.data + 'T12:00:00') >= limite).length;

    return {
      id, nome: c.name, cliente: c.client, status: c.status,
      valor, totalCusto, totalMedido, totalEmitido,
      margemReais, pctMargem, pctMedido, pctEmitido,
      orcado, desvioOrcado, atrasoDias, equipeAtual, rdosUltimos30,
      contractNumber: c.contractNumber || '',
      startDate: c.startDate, endDate: c.endDate, tendencyDate: c.tendencyDate,
    };
  },

  _draw() {
    const app = document.getElementById('app');
    let contratos = Store.state.contracts || [];
    if (this._filtroStatus === 'ativos') contratos = contratos.filter(c => c.status === 'ativo');
    else if (this._filtroStatus === 'concluidos') contratos = contratos.filter(c => c.status === 'concluido');

    const metrics = contratos.map(c => this._calcMetrics(c));
    metrics.sort((a, b) => {
      const va = a[this._sortBy], vb = b[this._sortBy];
      const dir = this._sortDir === 'asc' ? 1 : -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return ((va || 0) - (vb || 0)) * dir;
    });

    // Resumo agregado
    const totalValor = metrics.reduce((s, m) => s + m.valor, 0);
    const totalCusto = metrics.reduce((s, m) => s + m.totalCusto, 0);
    const totalMedido = metrics.reduce((s, m) => s + m.totalMedido, 0);
    const totalMargem = totalMedido - totalCusto;
    const pctMargemAgregado = totalValor > 0 ? (totalMargem / totalValor) * 100 : 0;

    const fmt = (v) => Store.formatBRL(v);
    const corPct = (p, ref) => p >= ref ? 'var(--color-success)' : (p >= 0 ? '#F59E0B' : 'var(--color-danger)');

    const arrow = (col) => this._sortBy === col
      ? (this._sortDir === 'asc' ? ' ↑' : ' ↓')
      : ' <span style="opacity:.3;">↕</span>';

    const th = (col, label, align = 'left') =>
      `<th scope="col" data-sort="${col}" class="${align === 'right' ? 'num' : ''}" style="cursor:pointer;user-select:none;">${label}${arrow(col)}</th>`;

    // Padrão B (UIKit) — mesma moldura das demais telas financeiras.
    app.innerHTML = `
      ${window.UIKit?.pageHeader ? window.UIKit.pageHeader({
        title: '📊 Comparativo de Contratos',
        subtitle: 'Ranking por margem, atraso, execução e mais — clique nas colunas para ordenar',
        actions: '<a href="#/contratos" class="btn btn-secondary">← Voltar para Contratos</a>',
      }) : ''}

      ${window.UIKit?.kpiGrid ? window.UIKit.kpiGrid([
        { label: 'Total em contratos', value: fmt(totalValor), color: 'var(--color-primary)', hint: `${metrics.length} contrato${metrics.length !== 1 ? 's' : ''}` },
        { label: 'Total medido (BMs)', value: fmt(totalMedido), color: 'var(--color-success)' },
        { label: 'Total custo', value: fmt(totalCusto), color: 'var(--color-warning)' },
        { label: 'Margem agregada', value: fmt(totalMargem), color: corPct(pctMargemAgregado, 20), hint: `${pctMargemAgregado.toFixed(1)}% (meta ≥20%)` },
      ]) : ''}

      ${window.UIKit?.chips ? window.UIKit.chips([
        { value: 'ativos', label: 'Ativos', active: this._filtroStatus === 'ativos' },
        { value: 'concluidos', label: 'Concluídos', active: this._filtroStatus === 'concluidos' },
        { value: 'todos', label: 'Todos', active: this._filtroStatus === 'todos' },
      ], { name: 'comp-status' }) : ''}

      <div class="card" style="padding:0;overflow:hidden;">
        <div style="overflow-x:auto;">
          <table class="table" style="margin:0;">
            <thead>
              <tr>
                ${th('nome', 'Contrato')}
                ${th('cliente', 'Cliente')}
                ${th('valor', 'Valor', 'right')}
                ${th('pctMedido', '% Medido', 'right')}
                ${th('pctMargem', '% Margem', 'right')}
                ${th('margemReais', 'Margem R$', 'right')}
                ${th('desvioOrcado', 'Desvio Orç.', 'right')}
                ${th('atrasoDias', 'Atraso', 'right')}
                ${th('equipeAtual', 'Equipe', 'right')}
                ${th('rdosUltimos30', 'RDOs 30d', 'right')}
              </tr>
            </thead>
            <tbody>
              ${metrics.length === 0 ? `<tr><td colspan="10" style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum contrato no filtro selecionado</td></tr>` : ''}
              ${metrics.map(m => `
                <tr style="cursor:pointer;" data-id="${m.id}" class="row-comp">
                  <td>
                    <strong>${escapeHtml(m.nome)}</strong>
                    ${m.contractNumber ? `<div class="text-muted font-sm">#${escapeHtml(m.contractNumber)}</div>` : ''}
                  </td>
                  <td>${escapeHtml(m.cliente || '—')}</td>
                  <td class="num">${fmt(m.valor)}</td>
                  <td class="num" style="color:${corPct(m.pctMedido, 100)};">${m.pctMedido.toFixed(1)}%</td>
                  <td class="num" style="color:${corPct(m.pctMargem, 20)};font-weight:700;">${m.pctMargem.toFixed(1)}%</td>
                  <td class="num" style="color:${m.margemReais >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${fmt(m.margemReais)}</td>
                  <td class="num" style="color:${m.desvioOrcado <= 5 ? 'var(--color-success)' : (m.desvioOrcado <= 15 ? '#F59E0B' : 'var(--color-danger)')};">
                    ${m.orcado > 0 ? (m.desvioOrcado >= 0 ? '+' : '') + m.desvioOrcado.toFixed(1) + '%' : '<span class="text-muted">—</span>'}
                  </td>
                  <td class="num" style="color:${m.atrasoDias > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${m.atrasoDias === 0 ? '—' : (m.atrasoDias > 0 ? `+${m.atrasoDias}d` : `${m.atrasoDias}d`)}
                  </td>
                  <td class="num">${m.equipeAtual}</td>
                  <td class="num">${m.rdosUltimos30}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="text-muted font-sm" style="margin-top:var(--sp-md);padding:var(--sp-md);background:var(--color-surface-2);border-radius:6px;">
        <strong>Legenda:</strong>
        <span style="color:var(--color-success);">●</span> Bom ·
        <span style="color:#F59E0B;">●</span> Atenção ·
        <span style="color:var(--color-danger);">●</span> Crítico ·
        Margem alvo ≥20% · Desvio Orçado ideal ≤5%
      </div>
    `;

    // Listeners
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this._sortBy === col) this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
        else { this._sortBy = col; this._sortDir = 'desc'; }
        this._draw();
      });
    });
    document.querySelectorAll('[data-chips="comp-status"] .rh-chip').forEach(b => {
      b.addEventListener('click', () => { this._filtroStatus = b.dataset.value; this._draw(); });
    });
    document.querySelectorAll('button[data-filtro]').forEach(b => {
      b.addEventListener('click', () => { this._filtroStatus = b.dataset.filtro; this._draw(); });
    });
    document.querySelectorAll('.row-comp').forEach(tr => {
      tr.addEventListener('click', () => { location.hash = `#/contratos/${tr.dataset.id}`; });
    });
  },
};
