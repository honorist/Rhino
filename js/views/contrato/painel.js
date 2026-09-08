/* Rhino · ContratoDetail · Painel da obra
   Estende o objeto window.ContratoDetail já definido.

   A aba de aterrissagem respondia "qual é o extrato financeiro deste contrato"
   — 4 KPIs de dinheiro, barra de orçamento e composição do gasto ocupavam toda
   a dobra. Quem abre a obra de manhã pra tocar o dia não via RDO atrasado,
   punch vencido, acidente, marco estourado nem atraso de cronograma: cada um
   desses estava dentro da sua própria aba, e metade das abas ficava atrás de
   scroll horizontal.

   O Painel responde duas perguntas, nesta ordem:
     1. "O que precisa de mim agora?"  → a faixa de ações
     2. "Como está a obra hoje?"       → avanço físico · prazo · margem

   Nenhum dos sinais é calculado aqui: todos já eram calculados no servidor
   (lib/punch, lib/ssma, lib/evm, lib/data-book, lib/avanco-fisico, lib/dre) e
   agora chegam agregados por GET /api/contracts/:id/painel. A view só formata
   (steering/engineering.md §6). */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/painel] requires ContratoDetail core'); return; }

  // As chaves são as que lib/contrato-painel.js emite (masculino: critico/alto/
  // medio/baixo). test/contrato-detail-view-smoke.test.js amarra os dois lados —
  // antes o mapa usava o feminino e TODAS as ações caíam na cor default, então
  // acidente com afastamento ficava igual a documento vencendo.
  const SEV_COR = {
    critico: { fundo: 'rgba(220,38,38,.10)', borda: '#B91C1C', texto: '#7F1D1D' },
    alto:    { fundo: 'rgba(220,38,38,.06)', borda: '#DC2626', texto: '#991B1B' },
    medio:   { fundo: 'rgba(245,158,11,.08)', borda: '#F59E0B', texto: '#92400E' },
    baixo:   { fundo: 'rgba(59,130,246,.07)', borda: '#3B82F6', texto: '#1E3A8A' },
  };

  Object.assign(window.ContratoDetail, {
    /** Placeholder do Painel; `_loadPainel` preenche depois do fetch. */
    renderPainelBanda() {
      return `
        <div id="painelObraBox" style="margin-bottom:var(--sp-lg);">
          <div class="text-muted" style="padding:var(--sp-md) 0;">Avaliando a obra…</div>
        </div>`;
    },

    async _loadPainel(contract) {
      const box = document.getElementById('painelObraBox');
      if (!box) return;
      try {
        const r = await fetch(`/api/contracts/${contract.id}/painel`);
        if (!r.ok) throw new Error(await r.text());
        const { painel } = await r.json();
        this._painelCache = painel;
        box.innerHTML = this._renderPainel(painel || {});
        this._attachPainelListeners();
      } catch (e) {
        // Falha aqui não pode derrubar a tela: o resto da aba (equipe, BMs,
        // RDO de hoje) continua útil sem o painel.
        box.innerHTML = `<div class="text-muted font-sm" style="padding:8px 0;">Não foi possível carregar o painel da obra: ${escapeHtml(e.message)}</div>`;
      }
    },

    _renderPainel(painel) {
      return `
        ${this._renderAcoes(painel.acoes || [])}
        ${this._renderKpisObra(painel.obra || {})}
      `;
    },

    /** "O que precisa de mim agora" — vazio aqui é sucesso, não tela vazia. */
    _renderAcoes(acoes) {
      if (!acoes.length) {
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;
                      background:rgba(16,185,129,.08);border-left:3px solid #10B981;margin-bottom:var(--sp-md);">
            <span style="font-size:18px;" aria-hidden="true">✓</span>
            <span style="font-weight:600;color:#065F46;">Nada pendente nesta obra agora.</span>
          </div>`;
      }
      return `
        <div style="margin-bottom:var(--sp-md);">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
                      color:var(--color-text-muted);margin-bottom:8px;">
            Precisa da sua atenção
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${acoes.map((a) => {
              const c = SEV_COR[a.severidade] || SEV_COR.medio;
              return `
              <a class="painel-acao" href="${escapeHtml(a.href || '#')}"
                 style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:8px;
                        text-decoration:none;background:${c.fundo};border-left:3px solid ${c.borda};">
                <span style="flex:1;min-width:0;">
                  <span style="font-weight:700;color:${c.texto};">${escapeHtml(a.titulo || '')}</span>
                  ${a.detalhe ? `<span style="color:var(--color-text-muted);font-size:13px;"> — ${escapeHtml(a.detalhe)}</span>` : ''}
                </span>
                <span style="color:${c.borda};font-weight:700;font-size:13px;white-space:nowrap;">ver →</span>
              </a>`;
            }).join('')}
          </div>
        </div>`;
    },

    /** "Como está a obra hoje": avanço físico · prazo · margem. */
    _renderKpisObra(obra) {
      const av = obra.avancoFisico || {};
      const pz = obra.prazo || {};
      const mg = obra.margem;

      // pct null = "não medido", que é diferente de 0%. Cronograma sem etapas
      // cadastradas não pode aparecer como obra parada em 0%.
      const avTxt = av.pct === null || av.pct === undefined
        ? '—'
        : `${Number(av.pct).toFixed(1)}%`;
      const avNota = av.pct === null || av.pct === undefined
        ? 'cronograma não cadastrado'
        : (av.base === 'media' ? 'média simples — etapas sem peso' : 'ponderado pelo peso das etapas');

      const atraso = Number(pz.atrasoDias || 0);
      const pzTxt = atraso > 0
        ? `${atraso} dia${atraso !== 1 ? 's' : ''} de atraso`
        : (pz.diasRestantes !== undefined && pz.diasRestantes !== null
            ? `${pz.diasRestantes} dia${pz.diasRestantes !== 1 ? 's' : ''} restantes`
            : '—');
      const pzCor = atraso > 0 ? 'var(--color-danger)' : 'var(--color-text)';

      // A margem só vem no payload pra quem tem permissão financeira.
      const cardMargem = !mg ? '' : (() => {
        const st = mg.status;
        const cor = st === 'prejuizo' ? 'var(--color-danger)'
          : st === 'abaixo_meta' ? 'var(--color-warning)'
          : st === 'ok' ? 'var(--color-success)' : 'var(--color-text-muted)';
        // "sem_movimento" existe pra que contrato recém-criado (zero faturado,
        // zero custo) não abra com alarme de meta não atingida.
        const nota = st === 'sem_movimento' ? 'ainda sem movimento'
          : st === 'prejuizo' ? 'prejuízo'
          : st === 'abaixo_meta' ? `faltam ${Number(mg.faltamPp || 0).toFixed(1)}pp para a meta`
          : 'acima da meta';
        const valor = mg.valor === null || mg.valor === undefined
          ? '—'
          : Store.formatBRL(mg.valor);
        return `
          <div style="padding:14px 16px;border-top:3px solid ${cor};background:var(--color-surface);">
            <div class="text-muted font-sm">Margem realizada</div>
            <div style="font-size:20px;font-weight:800;color:${cor};">${valor}</div>
            <div class="text-muted font-sm">${nota}</div>
          </div>`;
      })();

      return `
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="painel-kpis" style="display:grid;grid-template-columns:repeat(${cardMargem ? 3 : 2},1fr);">
            <div style="padding:14px 16px;border-top:3px solid var(--color-primary);border-right:1px solid var(--color-border);">
              <div class="text-muted font-sm">Avanço físico</div>
              <div style="font-size:20px;font-weight:800;">${avTxt}</div>
              <div class="text-muted font-sm">${avNota}</div>
            </div>
            <div style="padding:14px 16px;border-top:3px solid ${pzCor};${cardMargem ? 'border-right:1px solid var(--color-border);' : ''}">
              <div class="text-muted font-sm">Prazo</div>
              <div style="font-size:20px;font-weight:800;color:${pzCor};">${pzTxt}</div>
              <div class="text-muted font-sm">${pz.fim ? 'término ' + new Date(pz.fim + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
            </div>
            ${cardMargem}
          </div>
        </div>`;
    },

    _attachPainelListeners() {
      // Cada ação leva à aba certa JÁ filtrada. Como o href é um hash da mesma
      // rota, o router não re-renderiza sozinho — trocamos a aba na mão.
      document.querySelectorAll('.painel-acao').forEach((a) => {
        a.addEventListener('click', (e) => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/[?&]tab=([^&]+)/);
          if (!m) return;
          e.preventDefault();
          const f = href.match(/[?&]f=([^&]+)/);
          if (f) this._filtroAba = decodeURIComponent(f[1]);
          const contractId = (href.match(/#\/contratos\/([^?]+)/) || [])[1];
          const contract = contractId ? Store.getContractById(contractId) : null;
          if (contract) this._irParaTab(decodeURIComponent(m[1]), contract, contractId);
        });
      });
    },
  });
})();
