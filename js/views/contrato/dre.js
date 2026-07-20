/* Rhino · ContratoDetail · DRE / Margem por obra (realizado, base caixa)
   Estende window.ContratoDetail. Consome GET /api/contracts/:id/dre — a conta
   mora no servidor (lib/dre.js), fonte única; aqui é só apresentação. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/dre] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {

    renderDreSection(contract) {
      return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('trending-up', 18)}DRE / Margem por obra</span></h3>
              <span class="text-muted font-sm">Resultado realizado — o que de fato entrou e saiu do caixa desta obra</span>
            </div>
          </div>
          <div id="dreConteudo" style="padding:var(--sp-md);">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Calculando DRE...</div>
          </div>
        </div>
      `;
    },

    async _loadDre(contract) {
      const box = document.getElementById('dreConteudo');
      if (!box) return;
      try {
        const r = await fetch(`/api/contracts/${contract.id}/dre`);
        if (!r.ok) throw new Error(await r.text());
        const { dre } = await r.json();
        box.innerHTML = this._renderDre(dre);
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao calcular DRE: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderDre(dre) {
      const fmt = (v) => Store.formatBRL(v);
      const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      const margem = dre.margem || { valor: 0, pct: 0 };
      const saldo = dre.saldoAMedir || { valor: 0, pct: 0 };
      const receita = dre.receita || { recebida: 0, medida: 0 };
      const custos = Array.isArray(dre.custos) ? dre.custos.filter((c) => c.total !== 0) : [];
      const margemCor = margem.valor < 0 ? 'var(--color-danger)' : margem.pct < 20 ? 'var(--color-warning)' : 'var(--color-success)';

      // Barra de custo relativa ao maior bucket (leitura rápida de onde vai o dinheiro).
      const maxCusto = custos.reduce((m, c) => Math.max(m, c.total), 0) || 1;

      return `
        <!-- Cabeçalho: contratado / medido / recebido -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">
          ${this._dreKpi('Valor contratado', fmt(dre.contractValue), 'Valor total fechado com o cliente')}
          ${this._dreKpi('Medido (faturado)', fmt(receita.medida), 'Boletins de medição emitidos até agora')}
          ${this._dreKpi('Recebido (caixa)', fmt(receita.recebida), 'Notas fiscais efetivamente recebidas')}
        </div>

        <!-- Demonstração -->
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Categoria</th><th scope="col" style="text-align:right;">Valor</th><th scope="col" style="width:40%;">&nbsp;</th></tr></thead>
            <tbody>
              <tr>
                <td style="font-weight:600;color:var(--color-success);">Receita recebida</td>
                <td style="text-align:right;font-weight:600;">${fmt(receita.recebida)}</td>
                <td></td>
              </tr>
              ${custos.length === 0
                ? `<tr><td colspan="3" class="text-muted" style="text-align:center;padding:var(--sp-md);">Nenhum custo lançado no caixa desta obra ainda.</td></tr>`
                : custos.map((c) => `
                <tr>
                  <td>(−) ${escapeHtml(c.label)}</td>
                  <td style="text-align:right;">${fmt(c.total)}</td>
                  <td>
                    <div class="progress-bar-wrap" style="width:100%;">
                      <div class="progress-bar" style="width:${Math.min(100, (c.total / maxCusto) * 100)}%;"></div>
                    </div>
                  </td>
                </tr>
              `).join('')}
              <tr style="border-top:2px solid var(--color-border);">
                <td style="font-weight:600;">(=) Custo total</td>
                <td style="text-align:right;font-weight:600;">${fmt(dre.custoTotal)}</td>
                <td></td>
              </tr>
              <tr style="background:var(--color-bg-subtle);">
                <td style="font-weight:700;font-size:1.05em;">Margem realizada</td>
                <td style="text-align:right;font-weight:700;font-size:1.05em;color:${margemCor};">${fmt(margem.valor)}</td>
                <td><span style="font-weight:700;color:${margemCor};">${pct(margem.pct)}</span> <span class="text-muted font-sm">da receita recebida</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        ${dre.aportes ? `<p class="text-muted font-sm" style="margin-top:8px;">${window.rhIcon('info', 13)} Há ${fmt(dre.aportes)} em aportes/outras entradas — financiamento, não entram na margem.</p>` : ''}

        <!-- Saldo a medir: distinto da margem, para não confundir -->
        <div class="card" style="margin-top:16px;background:var(--color-bg-subtle);">
          <div style="padding:var(--sp-md);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;">Saldo a medir</div>
              <div class="text-muted font-sm">Quanto do contrato ainda não foi medido (valor contratado − medido). Não é margem.</div>
            </div>
            <div style="font-weight:700;font-size:1.1em;">${fmt(saldo.valor)} <span class="text-muted font-sm">(${pct(saldo.pct)})</span></div>
          </div>
        </div>
      `;
    },

    _dreKpi(label, value, hint) {
      return `
        <div class="card" style="padding:var(--sp-md);">
          <div class="text-muted font-sm" title="${escapeHtml(hint || '')}">${escapeHtml(label)}</div>
          <div style="font-weight:700;font-size:1.15em;margin-top:2px;">${value}</div>
        </div>
      `;
    },

  });
})();
