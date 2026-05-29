/* Rhino · ContratoDetail · visao-geral
   Extraído de js/views/ContratoDetail.js (linhas 1304-1619)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/visao-geral] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  // ═══════════ EQUIPE ALOCADA (tabela compacta para Visão Geral) ═══════════
  _renderEquipeAlocadaTable(contract) {
    const membros = contract.organograma || [];
    const recursosMap = Object.fromEntries((Store.state.recursos || []).map(r => [r.id, r]));

    // Conta MOI / MOD / Terceiro
    const counts = { MOI: 0, MOD: 0, Terc: 0 };
    membros.forEach(m => {
      const r = m.recursoId ? recursosMap[m.recursoId] : null;
      const cat = r?.rdoCategoria || 'MOD';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const hojeStr = new Date().toISOString().split('T')[0];

    const docStatus = (r) => {
      if (!r) return { label: '—', tone: 'neutral' };
      const docs = r.documentos || [];
      const hoje = new Date(hojeStr + 'T12:00:00');
      let temVencido = false, temVencendo = false, nomeAlerta = '';
      docs.forEach(d => {
        if (!d.dataVencimento) return;
        const dv = new Date(d.dataVencimento + 'T12:00:00');
        const dias = Math.ceil((dv - hoje) / 86400000);
        if (dias < 0) { temVencido = true; nomeAlerta = d.nome || d.tipo || 'Doc'; }
        else if (dias <= 30 && !temVencido) { temVencendo = true; nomeAlerta = `${d.nome || d.tipo || 'Doc'} vence`; }
      });
      if (temVencido) return { label: nomeAlerta + ' venceu', tone: 'neg' };
      if (temVencendo) return { label: nomeAlerta, tone: 'warn' };
      return { label: 'OK', tone: 'pos' };
    };

    const proximaFolga = (r) => {
      if (!r || !r.alocacaoAtual) return '—';
      const fim = r.alocacaoAtual.dataFim;
      if (!fim) return '—';
      return new Date(fim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    const cicloDias = (r) => {
      if (!r || !r.alocacaoAtual) return '—';
      const ini = r.alocacaoAtual.dataInicio;
      const fim = r.alocacaoAtual.dataFim;
      if (!ini || !fim) return '—';
      const d = Math.ceil((new Date(fim) - new Date(ini)) / 86400000);
      return d > 0 ? `${d}d` : '—';
    };

    const statusOps = (r) => {
      if (!r) return { label: '—', tone: 'neutral' };
      const folgas = (r.folgas || []).filter(f => {
        return f.dataInicio <= hojeStr && (!f.dataFim || f.dataFim >= hojeStr);
      });
      if (folgas.length > 0) return { label: 'Em folga', tone: 'neutral' };
      return { label: 'Em campo', tone: 'pos' };
    };

    const linhasPreview = membros.slice(0, 8);

    return `
      <div class="card" style="margin-bottom:0;">
        <div class="card-header" style="margin-bottom:8px;">
          <div>
            <h3 class="rh-h3" style="margin:0;">Equipe alocada · ${membros.length} pessoas</h3>
            <div class="rh-meta-xs">${counts.MOI || 0} MOI · ${counts.MOD || 0} MOD${counts.Terc ? ' · ' + counts.Terc + ' Terceiros' : ''}</div>
          </div>
          <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='equipe';window.ContratoDetail.render('${contract.id}');event.preventDefault();" class="btn btn-secondary btn-sm">Ver todos</a>
        </div>
        ${membros.length === 0 ? `<p class="rh-meta" style="padding:var(--sp-md) 0;">Nenhum membro alocado</p>` : `
          <div class="table-wrap">
            <table style="font-size:13px;">
              <thead>
                <tr>
                  <th scope="col">Pessoa</th>
                  <th scope="col">Função</th>
                  <th scope="col">Cat.</th>
                  <th scope="col">Ciclo</th>
                  <th scope="col">Próx. folga</th>
                  <th scope="col">Doc.</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                ${linhasPreview.map(m => {
                  const r = m.recursoId ? recursosMap[m.recursoId] : null;
                  const nome = r?.nome || m.nome || '—';
                  const iniciais = nome.split(' ').filter(Boolean).slice(0,2).map(s => s[0]).join('').toUpperCase();
                  const cargo = r?.profissao || m.cargo || '—';
                  const cat = r?.rdoCategoria || 'MOD';
                  const doc = docStatus(r);
                  const sta = statusOps(r);
                  return `
                    <tr class="row-equipe-visao" data-recurso-id="${r?.id || ''}" style="${r?.id ? 'cursor:pointer;' : ''}" title="${r?.id ? 'Clique para ver detalhes' : 'Recurso não cadastrado'}">
                      <td>
                        <div class="rh-row-sm">
                          <span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--rh-ink-100);font-size:10px;font-weight:700;color:var(--rh-ink-700);">${iniciais}</span>
                          <strong>${escapeHtml(nome)}</strong>
                        </div>
                      </td>
                      <td><span class="rh-meta">${escapeHtml(cargo)}</span></td>
                      <td><span class="rh-pill ${cat === 'MOI' ? 'rh-pill-info' : cat === 'Terc' ? 'rh-pill-warn' : 'rh-pill-neutral'}">${cat}</span></td>
                      <td>${cicloDias(r)}</td>
                      <td>${proximaFolga(r)}</td>
                      <td>${doc.tone === 'pos' ? '<span class="rh-pill rh-pill-pos">OK</span>' : `<span class="rh-pill rh-pill-${doc.tone === 'warn' ? 'warn' : 'neg'}">${escapeHtml(doc.label)}</span>`}</td>
                      <td><span class="rh-pill rh-pill-${sta.tone === 'pos' ? 'pos' : 'neutral'}"><span class="rh-pill-dot"></span>${escapeHtml(sta.label)}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            ${membros.length > 8 ? `<div class="rh-meta-xs" style="padding:8px;text-align:center;">+ ${membros.length - 8} membro(s)</div>` : ''}
          </div>
        `}
      </div>
    `;
  },

  // ═══════════ SIDEBAR DA VISÃO GERAL (vertical: BMs / Pendências / RDO) ═══════════
  _renderSidebarVisao(contract, nfsContrato, passagensPendentes) {
    const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const hojeStr = new Date().toISOString().split('T')[0];
    const rdoHoje = rdos.find(r => r.data === hojeStr) || null;
    const totaisHoje = rdoHoje?.totais || {};
    const hhDia = parseFloat(totaisHoje.hh_dia || totaisHoje.hhDia || 0);
    const pessoasHoje = (rdoHoje?.moi?.length || 0) + (rdoHoje?.mod?.length || 0) + (rdoHoje?.terc?.length || 0);
    const avancoHoje = parseFloat(totaisHoje.avanco || totaisHoje.avanco_pct || 0);
    const bmsRecentes = nfsContrato.slice().sort((a, b) => (b.dataLimite || '').localeCompare(a.dataLimite || '')).slice(0, 5);
    const docCount = (passagensPendentes || []).length;

    return `
      <div style="display:flex;flex-direction:column;gap:var(--sp-md);">
        <!-- Saídas / BMs -->
        <div class="card" style="margin-bottom:0;padding:var(--sp-md);">
          <div class="card-header" style="margin-bottom:8px;">
            <h3 class="rh-h3" style="margin:0;">Saídas / BMs</h3>
            <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='financeiro';window.ContratoDetail.render('${contract.id}');event.preventDefault();" style="font-size:12px;color:var(--rh-accent-500);text-decoration:none;">Ver todas</a>
          </div>
          ${bmsRecentes.length === 0 ? `<p class="rh-meta-xs" style="padding:8px 0;">Nenhum BM</p>` : `
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${bmsRecentes.map(nf => {
                const recebida = !!(nf.caixaEntryId || nf.caixa_entry_id);
                const emitida = !!nf.emitida;
                const status = recebida ? 'Recebida' : emitida ? 'NF emitida' : 'Rascunho';
                const tone = recebida ? 'pos' : emitida ? 'warn' : 'neutral';
                return `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--rh-ink-200);">
                    <div>
                      <div style="font-weight:700;font-size:12px;font-family:monospace;">BM-${escapeHtml(nf.numero || '—')}</div>
                      <div class="rh-meta-xs">${nf.dataLimite ? new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-weight:700;font-size:12px;">${Store.formatBRL(parseFloat(nf.valor) || 0)}</div>
                      <span class="rh-pill rh-pill-${tone}" style="font-size:10px;">${status}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Pendências -->
        <div class="card" style="margin-bottom:0;padding:var(--sp-md);">
          <div class="card-header" style="margin-bottom:8px;">
            <h3 class="rh-h3" style="margin:0;">Pendências</h3>
            ${docCount > 0 ? `<span class="rh-pill rh-pill-warn" style="font-size:11px;">${docCount} aberta${docCount !== 1 ? 's' : ''}</span>` : ''}
          </div>
          ${docCount === 0 ? `<p class="rh-meta-xs" style="padding:8px 0;">Nenhuma pendência</p>` : `
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${(passagensPendentes || []).slice(0, 5).map(p => {
                const dias = p.dataVencimento ? Math.floor((new Date() - new Date(p.dataVencimento)) / 86400000) : 0;
                return `
                  <div style="display:flex;align-items:flex-start;gap:8px;">
                    <span class="rh-pill-dot" style="background:var(--rh-warn-strong);margin-top:6px;"></span>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;font-size:13px;">${escapeHtml(p.descricao || 'Pendência')}</div>
                      <div class="rh-meta-xs">${dias > 0 ? `atrasada ${dias}d` : 'agendada'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- RDO de hoje -->
        <div class="card" style="margin-bottom:0;padding:var(--sp-md);">
          <div class="card-header" style="margin-bottom:8px;">
            <h3 class="rh-h3" style="margin:0;">RDO de hoje</h3>
            <span class="rh-pill rh-pill-${rdoHoje ? 'pos' : 'warn'}" style="font-size:11px;"><span class="rh-pill-dot"></span>${rdoHoje ? 'Lançado' : 'Pendente'}</span>
          </div>
          ${rdoHoje ? `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
              <div>
                <div class="rh-meta-xs">HH dia</div>
                <div style="font-weight:800;font-size:18px;">${hhDia ? hhDia.toFixed(0) + 'h' : '—'}</div>
              </div>
              <div>
                <div class="rh-meta-xs">Pessoas</div>
                <div style="font-weight:800;font-size:18px;">${pessoasHoje || '—'}</div>
              </div>
              <div>
                <div class="rh-meta-xs">Avanço</div>
                <div style="font-weight:800;font-size:18px;color:${avancoHoje > 0 ? 'var(--rh-pos-strong)' : 'var(--rh-ink-900)'};">${avancoHoje ? '+' + avancoHoje.toFixed(1) + 'pp' : '—'}</div>
              </div>
            </div>
          ` : `
            <p class="rh-meta-xs" style="padding:6px 0 8px;">Não lançado para ${new Date().toLocaleDateString('pt-BR')}</p>
            <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='rdo';window.ContratoDetail.render('${contract.id}');event.preventDefault();" class="btn btn-primary btn-sm" style="width:100%;">+ Novo RDO</a>
          `}
        </div>
      </div>
    `;
  },

  // ═══════════ RESUMO OPERACIONAL (legacy — mantido para outras telas) ═══════════
  _renderOperationalSummary(contract, nfsContrato, passagensPendentes) {
    const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const hojeStr = new Date().toISOString().split('T')[0];
    const rdoHoje = rdos.find(r => r.data === hojeStr) || null;
    const totaisHoje = rdoHoje?.totais || {};
    const hhDia = parseFloat(totaisHoje.hh_dia || totaisHoje.hhDia || 0);
    const pessoasHoje = (rdoHoje?.moi?.length || 0) + (rdoHoje?.mod?.length || 0) + (rdoHoje?.terc?.length || 0);
    const avancoHoje = parseFloat(totaisHoje.avanco || totaisHoje.avanco_pct || 0);

    const bmsRecentes = nfsContrato.slice().sort((a, b) => (b.dataLimite || '').localeCompare(a.dataLimite || '')).slice(0, 5);

    const docCount = (passagensPendentes || []).length;

    return `
    <div class="grid-3 mb-2xl">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Saídas / BMs</h3>
          <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='financeiro';window.ContratoDetail.render('${contract.id}');event.preventDefault();" style="font-size:13px;color:var(--color-primary);text-decoration:none;">Ver todas →</a>
        </div>
        ${bmsRecentes.length === 0 ? `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">Nenhum BM emitido</p>
        ` : `
          <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
            ${bmsRecentes.map(nf => {
              const recebida = !!(nf.caixaEntryId || nf.caixa_entry_id);
              const emitida = !!nf.emitida;
              const status = recebida ? 'Recebida' : emitida ? 'NF emitida' : 'Rascunho';
              const cor = recebida ? 'var(--color-success)' : emitida ? 'var(--color-info)' : 'var(--color-text-muted)';
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);">
                  <div>
                    <div style="font-weight:600;font-size:14px;">BM ${escapeHtml(nf.numero || '—')}</div>
                    <div style="font-size:12px;color:var(--color-text-muted);">${nf.dataLimite ? new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <div class="rh-text-right">
                    <div style="font-weight:700;font-size:14px;">${Store.formatBRL(parseFloat(nf.valor) || 0)}</div>
                    <div style="font-size:11px;color:${cor};font-weight:600;">${status}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Pendências</h3>
          ${docCount > 0 ? `<span class="badge" style="background:rgba(229,62,62,.12);color:var(--color-danger);">${docCount} aberta${docCount !== 1 ? 's' : ''}</span>` : ''}
        </div>
        ${docCount === 0 ? `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">Nenhuma pendência</p>
        ` : `
          <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
            ${passagensPendentes.slice(0, 5).map(p => {
              const dias = p.dataVencimento ? Math.floor((new Date() - new Date(p.dataVencimento)) / 86400000) : 0;
              return `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--color-danger);margin-top:6px;"></span>
                  <div style="flex:1;">
                    <div style="font-weight:600;font-size:14px;">${escapeHtml(p.descricao || 'Conta a pagar')}</div>
                    <div style="font-size:12px;color:var(--color-text-muted);">${Store.formatBRL(parseFloat(p.valor) || 0)} · ${dias > 0 ? `atrasada ${dias}d` : 'agendada'}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">RDO de hoje</h3>
          <span class="badge" style="background:${rdoHoje ? 'rgba(56,161,105,.12)' : 'rgba(214,158,46,.12)'};color:${rdoHoje ? 'var(--color-success)' : 'var(--color-warning)'};">${rdoHoje ? '● Lançado' : '○ Pendente'}</span>
        </div>
        ${rdoHoje ? `
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-md);">
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">HH dia</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;">${hhDia ? hhDia.toFixed(0) + 'h' : '—'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Pessoas</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;">${pessoasHoje || '—'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Avanço</div>
              <div style="font-size:20px;font-weight:800;color:${avancoHoje > 0 ? 'var(--color-success)' : 'var(--color-text)'};margin-top:4px;">${avancoHoje ? '+' + avancoHoje.toFixed(1) + 'pp' : '—'}</div>
            </div>
          </div>
        ` : `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">RDO ainda não lançado para ${new Date().toLocaleDateString('pt-BR')}</p>
          <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='rdo';window.ContratoDetail.render('${contract.id}');event.preventDefault();" class="btn btn-primary btn-sm">+ Novo RDO</a>
        `}
      </div>
    </div>
    `;
  },

  });
})();
