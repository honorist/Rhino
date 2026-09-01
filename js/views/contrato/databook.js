/* Rhino · ContratoDetail · Data book / Prontidão de comissionamento (item 12)
   Estende window.ContratoDetail. Consome GET /api/contracts/:id/data-book — diz
   se a obra está PRONTA para a entrega (punch list verificada + avanço físico
   100%). Só apresentação; a regra (prontidao) mora no servidor lib/data-book.js.
   Geração do PDF do data book (capa, índice, evidências): FASE 2. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/databook] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {

    renderDatabookSection(contract) {
      return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title"><span style="display:inline-flex;align-items:center;gap:8px;">${window.rhIcon('check-square', 18)}Data book / Prontidão de comissionamento</span></h3>
              <span class="text-muted font-sm">A obra está pronta para a entrega? Punch list verificada e avanço físico concluído.</span>
            </div>
            <a class="btn btn-secondary btn-sm" id="btnBaixarDatabookPdf" href="/api/contracts/${escapeHtml(contract.id)}/data-book/pdf" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('download', 15)}Baixar PDF</a>
          </div>
          <div id="databookConteudo" style="padding:var(--sp-md);">
            <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Avaliando prontidão…</div>
          </div>
        </div>
      `;
    },

    async _loadDatabook(contract) {
      const box = document.getElementById('databookConteudo');
      if (!box) return;
      try {
        const r = await fetch(`/api/contracts/${contract.id}/data-book`);
        if (!r.ok) throw new Error(await r.text());
        const { prontidao } = await r.json();
        box.innerHTML = this._renderDatabook(prontidao || {});
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao avaliar prontidão: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderDatabook(p) {
      const punch = p.punch || { total: 0, abertos: 0, verificados: 0, pctVerificado: 0 };
      const fisico = p.fisico || { execMedio: 0 };
      const pendencias = Array.isArray(p.pendencias) ? p.pendencias : [];
      const pronto = !!p.pronto;
      const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

      // Selo pronto/pendente.
      const selo = pronto
        ? `<span class="badge" style="background:#d1fae5;color:#047857;font-size:14px;padding:6px 14px;font-weight:700;"><span style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('check-circle', 16)}PRONTO PARA ENTREGA</span></span>`
        : `<span class="badge" style="background:#fee2e2;color:#b91c1c;font-size:14px;padding:6px 14px;font-weight:700;"><span style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('alert-triangle', 16)}PENDENTE</span></span>`;

      // Checklist de dois critérios (o servidor é a fonte de verdade do `pronto`).
      const checkPunch = punch.abertos === 0;
      const checkFisico = Number(fisico.execMedio || 0) >= 100;
      const linha = (ok, titulo, detalhe) => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border);">
          <span style="font-size:18px;line-height:1.2;">${ok ? '✅' : '⬜'}</span>
          <div>
            <div style="font-weight:600;">${escapeHtml(titulo)}</div>
            <div class="text-muted font-sm">${escapeHtml(detalhe)}</div>
          </div>
        </div>
      `;

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:var(--sp-md);">
          <div style="font-weight:700;font-size:15px;">Situação da obra</div>
          ${selo}
        </div>

        <div style="border:1px solid var(--color-border);border-radius:8px;padding:0 var(--sp-md);margin-bottom:var(--sp-md);">
          ${linha(checkPunch, 'Punch list verificada',
            `${punch.verificados} de ${punch.total} verificados — ${punch.abertos} em aberto (${pct(punch.pctVerificado)})`)}
          ${linha(checkFisico, 'Avanço físico concluído',
            `Execução média do cronograma: ${pct(fisico.execMedio)} (meta 100%)`)}
        </div>

        ${pendencias.length === 0
          ? `<p class="text-muted font-sm"><span style="display:inline-flex;align-items:center;gap:6px;">${window.rhIcon('info', 13)}Nenhuma pendência para a entrega.</span></p>`
          : `<div class="card" style="background:var(--color-bg-subtle);padding:var(--sp-md);">
              <div style="font-weight:600;margin-bottom:6px;">Pendências para entrega</div>
              <ul style="margin:0;padding-left:18px;">
                ${pendencias.map((t) => `<li class="font-sm" style="margin:2px 0;">${escapeHtml(t)}</li>`).join('')}
              </ul>
            </div>`}
      `;
    },

  });
})();
