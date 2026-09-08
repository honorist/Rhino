/* Rhino · ContratoDetail · Qualidade & Segurança (visão unificada)
   Estende o objeto window.ContratoDetail já definido.

   Punch List, SSMA e Ocorrências eram três abas separadas registrando a mesma
   família de coisa — `punch.js` e `ssma.js` chegavam a ser clones estruturais
   linha a linha, e um acidente cabia em três lugares diferentes (mais o bloco
   de segurança do RDO). Quem ia lançar não sabia onde.

   Aqui a LEITURA é unificada (GET /api/contracts/:id/qualidade, que junta as
   três origens em lib/ocorrencias-obra.js). A ESCRITA continua em cada origem:
   as três tabelas seguem existindo, com vocabulários e ciclos de status
   próprios, e `ssma_ocorrencias` carrega os campos legais (com_afastamento,
   dias_perdidos) que alimentam TF/TG. Fundir as tabelas colocaria em risco
   justamente o indicador de obrigação legal — por isso não fundimos.

   Os indicadores de segurança (TF/TG) ficam SEMPRE visíveis, independentemente
   do filtro: são indicadores da obra, não da lista que está na tela. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/qualidade] requires ContratoDetail core'); return; }

  const ORIGEM_LABEL = { punch: 'Punch list', ssma: 'SSMA', geral: 'Ocorrência' };
  const ORIGEM_COR = { punch: '#8B5CF6', ssma: '#DC2626', geral: '#3B82F6' };
  const SEV_COR = {
    critica: { bg: '#FEE2E2', fg: '#7F1D1D' },
    alta:    { bg: '#FEE2E2', fg: '#991B1B' },
    media:   { bg: '#FEF3C7', fg: '#92400E' },
    baixa:   { bg: '#E0F2FE', fg: '#075985' },
  };
  const GRUPO_LABEL = { aberto: 'Aberto', em_andamento: 'Em andamento', encerrado: 'Encerrado' };

  Object.assign(window.ContratoDetail, {
    renderQualidadeSection() {
      return `
        <div id="qualidadeConteudo">
          <div class="text-muted" style="text-align:center;padding:var(--sp-lg);">Carregando qualidade e segurança…</div>
        </div>`;
    },

    async _loadQualidade(contract) {
      const box = document.getElementById('qualidadeConteudo');
      if (!box) return;
      try {
        const origem = this._qualidadeFiltroOrigem || 'todos';
        const r = await fetch(`/api/contracts/${contract.id}/qualidade?origem=${encodeURIComponent(origem)}`);
        if (!r.ok) throw new Error(await r.text());
        const dados = await r.json();
        this._qualidadeCache = dados;
        box.innerHTML = this._renderQualidade(dados);
        this._attachQualidadeListeners(contract);
      } catch (e) {
        box.innerHTML = `<p class="text-danger">Erro ao carregar: ${escapeHtml(e.message)}</p>`;
      }
    },

    _renderQualidade(dados) {
      const itens = dados.itens || [];
      const resumo = dados.resumo || {};
      // O filtro de status é local (a lista já veio); o de origem vai ao
      // servidor, porque muda quais fontes são consultadas.
      const fStatus = this._qualidadeFiltroStatus || 'todos';
      const visiveis = fStatus === 'todos' ? itens : itens.filter((i) => i.statusGrupo === fStatus);

      return `
        ${this._renderIndicadoresSeguranca(resumo)}
        ${this._renderFiltrosQualidade(resumo)}
        ${visiveis.length === 0 ? this._renderQualidadeVazio(itens.length) : this._renderTabelaQualidade(visiveis)}
      `;
    },

    /** TF/TG e afastamentos — sempre na tela, mesmo com filtro aplicado. */
    _renderIndicadoresSeguranca(resumo) {
      const seg = resumo.seguranca || {};
      const qua = resumo.qualidade || {};
      const num = (v) => (v === null || v === undefined ? '—' : v);
      const card = (rotulo, valor, cor, nota) => `
        <div style="padding:12px 14px;background:var(--color-surface-2);border-radius:6px;border-left:3px solid ${cor};">
          <div class="text-muted font-sm">${rotulo}</div>
          <div style="font-size:18px;font-weight:800;color:${cor};">${valor}</div>
          ${nota ? `<div class="text-muted font-sm">${nota}</div>` : ''}
        </div>`;

      return `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:var(--sp-md);">
          ${card('Com afastamento', num(seg.comAfastamento), seg.comAfastamento > 0 ? 'var(--color-danger)' : 'var(--color-success)', `${num(seg.diasPerdidos)} dia(s) perdido(s)`)}
          ${card('TF — frequência', num(seg.tf), '#8B5CF6', 'acidentes por milhão de HH')}
          ${card('TG — gravidade', num(seg.tg), '#8B5CF6', 'dias perdidos por milhão de HH')}
          ${card('Punch vencidos', num(qua.vencidos), qua.vencidos > 0 ? 'var(--color-danger)' : 'var(--color-success)', `${num(qua.aVencer7d)} vence(m) em 7 dias`)}
        </div>`;
    },

    _renderFiltrosQualidade(resumo) {
      const porOrigem = resumo.porOrigem || {};
      const fOrigem = this._qualidadeFiltroOrigem || 'todos';
      const fStatus = this._qualidadeFiltroStatus || 'todos';
      const chip = (attr, val, atual, rotulo, contagem) => `
        <button class="rh-chip ${val === atual ? 'is-active' : ''}" data-${attr}="${val}"
                style="padding:5px 12px;border-radius:99px;border:1px solid var(--color-border);
                       background:${val === atual ? 'var(--color-surface-2)' : 'transparent'};
                       font-weight:${val === atual ? '700' : '500'};cursor:pointer;font-size:13px;font-family:inherit;">
          ${rotulo}${contagem !== undefined ? ` (${contagem})` : ''}
        </button>`;

      return `
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:var(--sp-md);">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span class="text-muted font-sm">Origem:</span>
            ${chip('qorigem', 'todos', fOrigem, 'Todas', resumo.total)}
            ${chip('qorigem', 'punch', fOrigem, 'Punch list', porOrigem.punch)}
            ${chip('qorigem', 'ssma', fOrigem, 'SSMA', porOrigem.ssma)}
            ${chip('qorigem', 'geral', fOrigem, 'Ocorrências', porOrigem.geral)}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span class="text-muted font-sm">Situação:</span>
            ${chip('qstatus', 'todos', fStatus, 'Todas')}
            ${chip('qstatus', 'aberto', fStatus, 'Abertas')}
            ${chip('qstatus', 'em_andamento', fStatus, 'Em andamento')}
            ${chip('qstatus', 'encerrado', fStatus, 'Encerradas')}
          </div>
        </div>`;
    },

    _renderQualidadeVazio(totalSemFiltro) {
      // Dois vazios diferentes: "não há nada" e "o filtro não achou nada" —
      // tratar os dois igual manda o usuário procurar defeito onde não há.
      return totalSemFiltro === 0
        ? `<div style="text-align:center;padding:var(--sp-2xl) var(--sp-lg);color:var(--color-text-muted);">
             <div style="font-size:38px;margin-bottom:var(--sp-md);opacity:.5;">✅</div>
             <div style="font-size:17px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhum registro de qualidade ou segurança</div>
             <div style="font-size:14px;">Pendências, RNCs, inspeções, desvios e acidentes desta obra aparecem aqui.</div>
           </div>`
        : `<div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
             Nenhum registro com esse filtro. <button class="btn btn-secondary btn-sm" data-qstatus="todos" data-qorigem="todos" style="margin-left:8px;">Limpar filtros</button>
           </div>`;
    },

    _renderTabelaQualidade(itens) {
      const dt = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—');
      return `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th scope="col">Origem</th>
              <th scope="col">Registro</th>
              <th scope="col">Severidade</th>
              <th scope="col">Situação</th>
              <th scope="col">Data</th>
              <th scope="col">Prazo</th>
            </tr></thead>
            <tbody>
              ${itens.map((i) => {
                const sev = SEV_COR[i.severidade] || SEV_COR.media;
                const cor = ORIGEM_COR[i.origem] || '#6B7280';
                return `
                <tr>
                  <td><span class="badge" style="background:${cor}1A;color:${cor};font-weight:700;">${escapeHtml(ORIGEM_LABEL[i.origem] || i.origem)}</span></td>
                  <td>
                    <strong>${escapeHtml(i.titulo || i.descricao || '—')}</strong>
                    ${i.tipo ? `<div class="text-muted font-sm">${escapeHtml(String(i.tipo).replace(/_/g, ' '))}</div>` : ''}
                    ${i.meta && i.meta.comAfastamento ? `<div style="color:var(--color-danger);font-weight:700;font-size:13px;">⚠ com afastamento · ${i.meta.diasPerdidos || 0} dia(s)</div>` : ''}
                  </td>
                  <td><span class="badge" style="background:${sev.bg};color:${sev.fg};">${escapeHtml(i.severidade || '—')}</span></td>
                  <td>${escapeHtml(GRUPO_LABEL[i.statusGrupo] || i.status || '—')}</td>
                  <td>${dt(i.data)}</td>
                  <td>${i.prazo ? `<span style="${i.vencido ? 'color:var(--color-danger);font-weight:700;' : ''}">${dt(i.prazo)}${i.vencido ? ' ⚠' : ''}</span>` : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    },

    _attachQualidadeListeners(contract) {
      document.querySelectorAll('[data-qorigem]').forEach((b) => {
        b.addEventListener('click', () => {
          this._qualidadeFiltroOrigem = b.dataset.qorigem;
          if (b.dataset.qstatus) this._qualidadeFiltroStatus = b.dataset.qstatus;
          this._loadQualidade(contract); // origem muda as fontes → refaz o fetch
        });
      });
      document.querySelectorAll('[data-qstatus]').forEach((b) => {
        b.addEventListener('click', () => {
          this._qualidadeFiltroStatus = b.dataset.qstatus;
          // Status é filtro local: só re-renderiza, sem ir ao servidor.
          const box = document.getElementById('qualidadeConteudo');
          if (box && this._qualidadeCache) {
            box.innerHTML = this._renderQualidade(this._qualidadeCache);
            this._attachQualidadeListeners(contract);
          }
        });
      });
    },
  });
})();
