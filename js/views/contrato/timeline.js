/* Rhino · ContratoDetail · Linha do tempo da obra
   Estende o objeto window.ContratoDetail já definido.

   Extraído do core (ContratoDetail.js) na Fase 5 do plano cozy-churning-fog:
   movimento puro, sem mudança de comportamento — o teste
   test/contrato-detail-view-smoke.test.js garante que a seção continua
   existindo e renderizando (inclusive os RDOs, que esta aba deixava de fora
   por ler o campo errado). */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/timeline] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  renderTimelineSection(contract, contractId) {
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : null;
    const events = [];

    // Início e fim do contrato
    if (contract.startDate) events.push({ date: contract.startDate, tipo: 'contrato', icon: 'clipboard',    label: 'Início do contrato', desc: contract.name });
    if (contract.endDate)   events.push({ date: contract.endDate,   tipo: 'contrato', icon: 'check-circle', label: 'Fim do contrato',   desc: contract.name });

    // Aditivos
    (contract.aditivos || []).forEach(a => {
      if (a.data) events.push({ date: a.data, tipo: 'aditivo', icon: 'plus-circle', label: `Aditivo${a.numero ? ' #' + a.numero : ''}: ${a.tipo === 'valor' ? 'Valor' : a.tipo === 'prazo' ? 'Prazo' : 'Valor+Prazo'}`, desc: a.descricao });
    });

    // Marcos
    (contract.marcos || []).forEach(m => {
      if (m.prazo) events.push({ date: m.prazo, tipo: 'marco', icon: m.concluido ? 'check-circle' : 'circle', label: `Marco: ${m.titulo}`, desc: m.concluido ? `Concluído${m.concluidoEm ? ' em ' + fmtDate(m.concluidoEm) : ''}` : 'Pendente' });
    });

    // Ocorrências
    (contract.ocorrencias || []).forEach(o => {
      if (o.data) {
        const sevCor = o.severidade === 'alta' ? '#DC2626' : o.severidade === 'media' ? '#D97706' : '#059669';
        events.push({ date: o.data, tipo: 'ocorrencia', icon: 'alert-triangle', iconColor: sevCor, label: `Ocorrência${o.encerrada ? ' (encerrada)' : ''}`, desc: o.descricao });
      }
    });

    // RDOs — o campo é `data` (não `date`), e não existe `condition`: o clima
    // mora em `tempo.manha.tempo` e o identificador útil é `numero`.
    (contract.rdos || []).forEach(r => {
      if (r.data) events.push({ date: r.data, tipo: 'rdo', icon: 'file-text', label: `RDO #${r.numero ?? '—'}`, desc: null });
    });

    // Medições (notas fiscais vinculadas)
    const nfsContrato = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === contractId);
    nfsContrato.forEach(nf => {
      const d = nf.dataEmissao || nf.dataPrevista || nf.createdAt;
      if (d) {
        const dateStr = d.length > 10 ? d.slice(0, 10) : d;
        const val = parseFloat(nf.valor) || 0;
        events.push({ date: dateStr, tipo: 'medicao', icon: 'dollar-sign', label: `Medição${nf.numero ? ' #' + nf.numero : ''}${nf.emitida ? ' ✓' : ''}`, desc: val ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null });
      }
    });

    if (!events.length) {
      return `<div class="card"><p class="text-muted" style="text-align:center;padding:32px;">Nenhum evento registrado neste contrato.</p></div>`;
    }

    // Ordena por data
    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const TIPO_COLOR = {
      contrato:   'var(--color-primary)',
      aditivo:    '#8B5CF6',
      marco:      '#059669',
      ocorrencia: '#DC2626',
      rdo:        '#6B7280',
      medicao:    '#D97706',
    };

    const today = new Date().toISOString().slice(0, 10);

    return `
      <div class="card" style="padding: var(--sp-xl);">
        <h3 style="margin:0 0 var(--sp-xl);font-size:16px;font-weight:700;color:var(--color-text);">Timeline do Contrato</h3>
        <div style="position:relative;padding-left:32px;">
          <div style="position:absolute;left:11px;top:0;bottom:0;width:2px;background:var(--color-border);border-radius:2px;"></div>
          ${events.map((ev, i) => {
            const isPast = ev.date <= today;
            const color = TIPO_COLOR[ev.tipo] || 'var(--color-text-muted)';
            return `
              <div style="position:relative;margin-bottom:28px;${i === events.length - 1 ? 'margin-bottom:0;' : ''}">
                <div style="position:absolute;left:-26px;top:2px;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid var(--color-bg);box-shadow:0 0 0 2px ${color}44;display:flex;align-items:center;justify-content:center;font-size:8px;opacity:${isPast ? 1 : 0.5};"></div>
                <div style="opacity:${isPast ? 1 : 0.65};">
                  <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px;">
                    <span style="font-size:11px;font-weight:600;color:${color};letter-spacing:.5px;text-transform:uppercase;">${ev.tipo}</span>
                    <span style="font-size:12px;color:var(--color-text-muted);">${fmtDate(ev.date) || ev.date}</span>
                    ${!isPast ? `<span style="font-size:10px;background:var(--color-surface-2);color:var(--color-text-muted);padding:1px 6px;border-radius:8px;">futuro</span>` : ''}
                  </div>
                  <!-- label/desc vêm de dados editáveis → escapeHtml (anti-XSS).
                       ev.icon é NOME de ícone (SVG via window.rhIcon), colorido
                       por ev.iconColor (severidade) ou pela cor do tipo. -->
                  <div style="font-size:14px;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:6px;">
                    <span style="color:${ev.iconColor || color};display:inline-flex;flex:0 0 auto;">${window.rhIcon ? window.rhIcon(ev.icon, 15) : ''}</span>
                    <span>${escapeHtml(ev.label)}</span>
                  </div>
                  ${ev.desc ? `<div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">${escapeHtml(ev.desc)}</div>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  },
  });
})();
