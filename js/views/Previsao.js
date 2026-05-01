/* Rhino · F4 — Forecast de Fluxo de Caixa
   Visualização dedicada da projeção 30/60/90/180 dias com gráfico + tabela.
*/
window.Previsao = {
  _days: 60,
  _chartInstance: null,

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando previsão…</div>';

    try {
      const res = await fetch(`/api/dashboard?projDays=${this._days}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this._renderPage(app, data);
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${e.message}</p></div>`;
    }
  },

  _renderPage(app, data) {
    const { saldoProjetado = [], projecaoFutura = [], caixaBalance = 0, contasPagarStatus = {}, ocorrenciasVirtuais = [] } = data;
    const fmt = (v) => Store.formatBRL ? Store.formatBRL(v) : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const saldoFinal = saldoProjetado.length ? saldoProjetado[saldoProjetado.length - 1].saldo : caixaBalance;
    const minimoSaldo = saldoProjetado.length ? Math.min(...saldoProjetado.map(p => p.saldo)) : 0;
    const temNegativo = minimoSaldo < 0;

    app.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">📈 Previsão de Caixa</h1>
          <p class="page-subtitle">Saldo projetado considerando NFs emitidas, contas a pagar e recorrências</p>
        </div>
        <div style="display:flex;gap:8px;">
          ${[30,60,90,180].map(d => `
            <button class="btn ${this._days === d ? 'btn-primary' : 'btn-secondary'} btn-sm rh-proj-days" data-days="${d}">
              ${d}d
            </button>
          `).join('')}
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid-4" style="margin-bottom:var(--sp-lg);">
        <div class="card" style="text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin-bottom:4px;">Saldo Atual</div>
          <div style="font-size:22px;font-weight:800;color:${caixaBalance >= 0 ? 'var(--color-success)' : '#E53E3E'};">${fmt(caixaBalance)}</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin-bottom:4px;">Saldo Projetado (${this._days}d)</div>
          <div style="font-size:22px;font-weight:800;color:${saldoFinal >= 0 ? 'var(--color-success)' : '#E53E3E'};">${fmt(saldoFinal)}</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin-bottom:4px;">Mínimo Projetado</div>
          <div style="font-size:22px;font-weight:800;color:${minimoSaldo >= 0 ? 'var(--color-success)' : '#E53E3E'};">${fmt(minimoSaldo)}</div>
          ${temNegativo ? '<div style="font-size:12px;color:#E53E3E;margin-top:2px;">⚠️ Saldo negativo previsto</div>' : ''}
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin-bottom:4px;">CP Pendentes</div>
          <div style="font-size:22px;font-weight:800;color:#E53E3E;">${fmt(contasPagarStatus.totalPendente || 0)}</div>
          <div style="font-size:12px;color:var(--color-text-muted);">${contasPagarStatus.pendentes || 0} contas</div>
        </div>
      </div>

      ${temNegativo ? `
      <div style="background:#FEE2E2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:var(--sp-lg);display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">⚠️</span>
        <span style="color:#991B1B;font-weight:600;">Saldo negativo previsto nos próximos ${this._days} dias (mín: ${fmt(minimoSaldo)}). Revise suas contas a pagar e NFs emitidas.</span>
      </div>` : ''}

      <!-- Gráfico -->
      <div class="card" style="margin-bottom:var(--sp-lg);">
        <div style="font-weight:700;margin-bottom:var(--sp-md);">Evolução do Saldo Projetado</div>
        <canvas id="previsao-chart" style="max-height:280px;"></canvas>
      </div>

      <!-- Tabela de entradas previstas -->
      ${projecaoFutura.length ? `
      <div class="card" style="margin-bottom:var(--sp-lg);">
        <div style="font-weight:700;margin-bottom:var(--sp-md);">Entradas Previstas (NFs emitidas)</div>
        <table class="table">
          <thead><tr><th>Data</th><th>NF</th><th>Valor</th></tr></thead>
          <tbody>
            ${projecaoFutura.flatMap(d => d.entradas.map(e => `
              <tr>
                <td>${new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${e.numero || '—'}</td>
                <td style="font-weight:700;color:var(--color-success);">${fmt(e.valor)}</td>
              </tr>
            `)).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <!-- Recorrências virtuais -->
      ${ocorrenciasVirtuais.length ? `
      <div class="card">
        <div style="font-weight:700;margin-bottom:var(--sp-md);">Saídas Recorrentes Previstas</div>
        <table class="table">
          <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead>
          <tbody>
            ${ocorrenciasVirtuais.map(o => `
              <tr>
                <td>${new Date(o.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>${o.descricao || '—'}</td>
                <td style="font-weight:700;color:#E53E3E;">${fmt(o.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `;

    // Days filter
    document.querySelectorAll('.rh-proj-days').forEach(btn => {
      btn.addEventListener('click', () => {
        this._days = parseInt(btn.dataset.days);
        this.render();
      });
    });

    // Chart
    this._renderChart(saldoProjetado, caixaBalance);
  },

  _renderChart(points, saldoAtual) {
    if (!window.Chart) return;
    const canvas = document.getElementById('previsao-chart');
    if (!canvas) return;
    if (this._chartInstance) { this._chartInstance.destroy(); this._chartInstance = null; }

    const labels = [{ data: 'Hoje', saldo: saldoAtual }, ...points].map(p => {
      if (p.data === 'Hoje') return 'Hoje';
      return new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    });
    const values = [saldoAtual, ...points.map(p => p.saldo)];
    const colors = values.map(v => v >= 0 ? 'rgba(56,161,105,0.15)' : 'rgba(229,62,62,0.15)');
    const borderColors = values.map(v => v >= 0 ? '#38A169' : '#E53E3E');

    this._chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo Projetado',
          data: values,
          borderColor: '#55588B',
          backgroundColor: 'rgba(85,88,139,0.08)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: borderColors,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            ticks: {
              callback: (v) => 'R$ ' + (v / 1000).toFixed(0) + 'k',
            },
            grid: { color: 'rgba(0,0,0,.06)' },
          },
          x: { ticks: { maxRotation: 45 } },
        },
      },
    });
  },
};
