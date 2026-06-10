// Cobrança Mensal — visível apenas para admin (filtro via niveis_acesso.abas)
// Calcula valor a cobrar do app por mês com base em contratos que ficaram
// ativos por >=2 dias. Tabela de preços + taxa fixa.
window.CobrancaMensal = {
  _meses: [],
  _projecao: null,
  _aiUsage: null,

  TAXA_FIXA: 500,
  FAIXAS: [
    { ate: 10, valor: 100, label: '1-10' },
    { ate: 15, valor: 80, label: '11-15' },
    { ate: Infinity, valor: 60, label: '16+' },
  ],

  _faixaInfo(n) {
    return this.FAIXAS.find((f) => n <= f.ate) || this.FAIXAS[this.FAIXAS.length - 1];
  },

  _mesNome(mes) {
    return (
      ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][
        mes - 1
      ] || mes
    );
  },

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner">Carregando cobrança...</div>';
    try {
      const [hist, proj, aiStats] = await Promise.all([
        fetch('/api/cobranca-mensal/historico').then((r) => (r.ok ? r.json() : { meses: [] })),
        fetch('/api/cobranca-mensal/projecao-atual').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/ai-usage/stats')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      this._meses = hist.meses || [];
      this._projecao = proj;
      this._aiUsage = aiStats;
      this._draw();
    } catch (e) {
      app.innerHTML = `<div class="card"><p class="text-danger">Erro: ${escapeHtml(e.message)}</p></div>`;
    }
  },

  _draw() {
    const app = document.getElementById('app');
    const ultimoFechado = this._meses[0];
    const proj = this._projecao;

    const totalAnual = this._meses.reduce((s, m) => s + (m.total || 0), 0);

    // Padrão B (UIKit) — mesma moldura das demais telas financeiras.
    const html = `
      ${
        window.UIKit?.pageHeader
          ? window.UIKit.pageHeader({
              title: 'Cobrança do app',
              subtitle: 'Valor a pagar mensalmente — apenas administradores enxergam esta tela',
            })
          : ''
      }

      ${
        window.UIKit?.kpiGrid
          ? window.UIKit.kpiGrid([
              {
                label: `Projeção · ${proj ? this._mesNome(proj.mes) + '/' + proj.ano : '—'}`,
                value: proj ? Store.formatBRL(proj.total) : '—',
                color: 'var(--color-violet)',
                hint: proj
                  ? `${proj.contratosAtivos} contrato${proj.contratosAtivos !== 1 ? 's' : ''} · faixa ${proj.faixa} · parcial até o fim do mês`
                  : 'Indisponível',
                title: proj
                  ? `${Store.formatBRL(proj.valorPorContrato)}/contrato + ${Store.formatBRL(proj.taxaFixa)} de taxa fixa`
                  : '',
              },
              {
                label: 'Último mês fechado',
                value: ultimoFechado ? Store.formatBRL(ultimoFechado.total) : '—',
                color: 'var(--color-primary)',
                hint: ultimoFechado
                  ? `${this._mesNome(ultimoFechado.mes)}/${ultimoFechado.ano} · ${ultimoFechado.contratosAtivos} contratos`
                  : 'Sem histórico ainda',
              },
              {
                label: 'Acumulado 12 meses',
                value: Store.formatBRL(totalAnual),
                color: 'var(--color-info)',
                hint: 'soma dos últimos meses',
              },
            ])
          : ''
      }

      ${this._renderAiUsage()}

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:var(--sp-md);">
        <!-- Histórico -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Histórico mensal</h3>
            <button class="btn btn-sm btn-secondary" id="btnExportar">Exportar CSV</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  <th scope="col" class="num">Contratos ativos</th>
                  <th scope="col" class="num">Valor unitário</th>
                  <th scope="col" class="num">Subtotal contratos</th>
                  <th scope="col" class="num">Taxa fixa</th>
                  <th scope="col" class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                ${
                  this._meses.length === 0
                    ? `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-xl);">Sem histórico ainda</td></tr>`
                    : this._meses
                        .map(
                          (m) => `
                    <tr class="row-mes" data-ano="${m.ano}" data-mes="${m.mes}" style="cursor:pointer;" title="Click para ver detalhes">
                      <td><strong>${this._mesNome(m.mes)}/${m.ano}</strong></td>
                      <td class="num">${m.contratosAtivos}</td>
                      <td class="num">${Store.formatBRL(m.valorPorContrato)}</td>
                      <td class="num">${Store.formatBRL(m.valorContratos)}</td>
                      <td class="num">${Store.formatBRL(m.taxaFixa)}</td>
                      <td class="num" style="color:var(--color-success);">${Store.formatBRL(m.total)}</td>
                    </tr>
                  `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tabela de preços -->
        <div class="card" style="padding:var(--sp-md);">
          <h3 style="margin:0 0 var(--sp-sm);font-size:15px;"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('bar-chart', 18)}Tabela de preços</span></h3>
          <div style="font-size:14px;line-height:1.6;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border);">
              <span>Taxa fixa mensal</span>
              <strong>${Store.formatBRL(this.TAXA_FIXA)}</strong>
            </div>
            ${this.FAIXAS.map(
              (f) => `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border);">
                <span>${f.label} contratos</span>
                <strong>${Store.formatBRL(f.valor)}/contrato</strong>
              </div>
            `
            ).join('')}
          </div>
          <div style="margin-top:var(--sp-md);padding:8px 10px;background:var(--color-surface-2);border-radius:6px;font-size:12px;color:var(--color-text-muted);">
            <strong>Como contar:</strong> Conta cada contrato que ficou com status "ativo" por <strong>2 dias ou mais</strong> dentro do mês.
          </div>
        </div>
      </div>
    `;

    app.innerHTML = html;

    document.querySelectorAll('.row-mes').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        const ano = +tr.dataset.ano,
          mes = +tr.dataset.mes;
        this.showDetalhe(ano, mes);
      })
    );
    document.getElementById('btnExportar').addEventListener('click', () => this.exportarCSV());
  },

  _renderAiUsage() {
    const ai = this._aiUsage;
    if (!ai) return '';
    const m = ai.monthly || {};
    const t = ai.allTime || {};
    const fmtUSD = (v) => '$' + (Number(v) || 0).toFixed(4);
    const fmtTok = (v) => Number(v || 0).toLocaleString('pt-BR');
    return `
      <div class="card" style="padding:var(--sp-md);margin-bottom:var(--sp-md);border-left:4px solid #7C3AED;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--sp-sm);">
          <span style="font-size:15px;font-weight:700;color:#5B21B6;">IA — Uso Claude API</span>
          <span style="font-size:12px;color:var(--color-text-muted);font-style:italic;">Haiku · validação de documentos</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-sm);font-size:13px;">
          <div style="background:var(--color-surface-2);border-radius:8px;padding:10px 12px;">
            <div style="color:var(--color-text-muted);font-size:11px;text-transform:uppercase;font-weight:700;">Chamadas este mês</div>
            <div style="font-size:22px;font-weight:800;color:#5B21B6;">${fmtTok(m.calls)}</div>
          </div>
          <div style="background:var(--color-surface-2);border-radius:8px;padding:10px 12px;">
            <div style="color:var(--color-text-muted);font-size:11px;text-transform:uppercase;font-weight:700;">Tokens este mês</div>
            <div style="font-size:22px;font-weight:800;">${fmtTok((m.input_tokens || 0) + (m.output_tokens || 0))}</div>
            <div style="font-size:11px;color:var(--color-text-muted);">${fmtTok(m.input_tokens)} in · ${fmtTok(m.output_tokens)} out</div>
          </div>
          <div style="background:var(--color-surface-2);border-radius:8px;padding:10px 12px;">
            <div style="color:var(--color-text-muted);font-size:11px;text-transform:uppercase;font-weight:700;">Custo este mês</div>
            <div style="font-size:22px;font-weight:800;color:#065F46;">${fmtUSD(m.cost_usd)}</div>
          </div>
          <div style="background:var(--color-surface-2);border-radius:8px;padding:10px 12px;">
            <div style="color:var(--color-text-muted);font-size:11px;text-transform:uppercase;font-weight:700;">Custo total acumulado</div>
            <div style="font-size:22px;font-weight:800;">${fmtUSD(t.cost_usd)}</div>
            <div style="font-size:11px;color:var(--color-text-muted);">${fmtTok(t.calls)} chamadas totais</div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--color-text-muted);">
          Preço Haiku: $0,80/M tokens de entrada · $4,00/M tokens de saída
        </div>
      </div>
    `;
  },

  showDetalhe(ano, mes) {
    const dados = this._meses.find((m) => m.ano === ano && m.mes === mes) || this._projecao;
    if (!dados) return;
    const det = dados.detalhes || [];

    const html = `
      <div class="modal-overlay" id="modalDetCob">
        <div class="modal" style="width:680px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">Detalhe · ${this._mesNome(mes)}/${ano}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);">${dados.contratosAtivos} contratos cobrados · Total: <strong>${Store.formatBRL(dados.total)}</strong></div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:var(--sp-md);font-size:13px;">
              <div><strong>Faixa:</strong><br>${dados.faixa}</div>
              <div><strong>Unitário:</strong><br>${Store.formatBRL(dados.valorPorContrato)}</div>
              <div><strong>Subtotal:</strong><br>${Store.formatBRL(dados.valorContratos)}</div>
              <div><strong>Taxa fixa:</strong><br>${Store.formatBRL(dados.taxaFixa)}</div>
            </div>

            <h3 style="margin:0 0 var(--sp-sm);font-size:14px;">Contratos cobrados (${det.length})</h3>
            ${
              det.length === 0
                ? '<p class="text-muted">Nenhum contrato com 2+ dias ativos neste mês.</p>'
                : `
              <table style="width:100%;font-size:13px;">
                <thead><tr style="background:var(--color-surface-2);">
                  <th scope="col" style="padding:6px;text-align:left;">Contrato</th>
                  <th scope="col" style="padding:6px;text-align:right;">Dias ativos no mês</th>
                  <th scope="col" style="padding:6px;text-align:left;">Status atual</th>
                </tr></thead>
                <tbody>
                  ${det
                    .map(
                      (d) => `
                    <tr>
                      <td style="padding:6px;"><strong>${escapeHtml(d.name)}</strong></td>
                      <td style="padding:6px;text-align:right;">${d.diasAtivos}</td>
                      <td style="padding:6px;color:var(--color-text-muted);">${escapeHtml(d.statusAtual || '—')}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            `
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharCob">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDetCob');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharCob').addEventListener('click', close);
  },

  exportarCSV() {
    const linhas = [
      [
        'Mes',
        'Ano',
        'Contratos ativos',
        'Valor unitario',
        'Subtotal contratos',
        'Taxa fixa',
        'Total',
      ],
    ];
    this._meses.forEach((m) => {
      linhas.push([
        m.mes,
        m.ano,
        m.contratosAtivos,
        m.valorPorContrato,
        m.valorContratos,
        m.taxaFixa,
        m.total,
      ]);
    });
    const csv = linhas.map((l) => l.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobranca_rhino_${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
