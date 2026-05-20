/* Rhino · ContratoDetail · rdos
   Extraído de js/views/ContratoDetail.js (linhas 2903-3522)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/rdos] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  // ═══════════ RDO — Relatório Diário de Obra ═══════════
  renderRdoSection(contract) {
    const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    // Compliance: calcula último dia útil e dias úteis sem RDO (cliente-side)
    const isWeekend = (d) => { const x = d.getDay(); return x === 0 || x === 6; };
    const toIso = (d) => d.toISOString().split('T')[0];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const todayDow = today.getDay();
    const ehFimDeSemana = isWeekend(today);
    const ultDiaUtil = new Date(today);
    ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
    while (isWeekend(ultDiaUtil)) ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
    const ultDiaUtilIso = toIso(ultDiaUtil);
    const ultimoRdo = rdos.length > 0 ? rdos[0].data : null;
    let diasUteisSem = 0;
    if (ultimoRdo) {
      const cur = new Date(ultimoRdo + 'T12:00:00');
      cur.setDate(cur.getDate() + 1);
      while (toIso(cur) <= toIso(today)) {
        if (!isWeekend(cur)) diasUteisSem++;
        cur.setDate(cur.getDate() + 1);
      }
    }
    const fmtBr = (iso) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

    let alertaHtml = '';
    if (contract.status === 'ativo' && !ehFimDeSemana) {
      if (!ultimoRdo) {
        alertaHtml = `<div style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">⚠ <strong>Esta obra ainda não tem nenhum RDO registrado.</strong> Clique em "+ Novo RDO" para começar.</div>`;
      } else if (ultimoRdo < ultDiaUtilIso) {
        alertaHtml = `<div style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">🔴 <strong>Sem RDO no último dia útil (${fmtBr(ultDiaUtilIso)}).</strong> Último RDO: ${fmtBr(ultimoRdo)} — ${diasUteisSem} dia(s) útil(eis) sem registrar.</div>`;
      } else if (diasUteisSem > 2) {
        alertaHtml = `<div style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">⏰ <strong>${diasUteisSem} dias úteis sem RDO.</strong> Último: ${fmtBr(ultimoRdo)}.</div>`;
      }
    } else if (ehFimDeSemana && contract.status === 'ativo') {
      alertaHtml = `<div style="background:#dbeafe;color:#1e3a8a;border:1px solid #93c5fd;padding:8px 12px;border-radius:8px;margin-bottom:var(--sp-md);font-size:13px;">📅 Hoje é fim de semana — RDO é ocasional, não obrigatório.</div>`;
    }

    const body = rdos.length === 0 ? `
      <div style="text-align:center;padding:var(--sp-2xl) var(--sp-lg);color:var(--color-text-muted);">
        <div style="font-size:38px;margin-bottom:var(--sp-md);opacity:.5;">📋</div>
        <div style="font-size:17px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhum RDO registrado</div>
        <div style="font-size:14px;">Clique em "+ Novo RDO" para começar.</div>
      </div>
    ` : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:60px;">Nº</th>
              <th>Data</th>
              <th>Clima</th>
              <th class="rh-text-center">MO Total</th>
              <th class="rh-text-center">Equip.</th>
              <th class="rh-text-center">Atividades</th>
              <th class="rh-text-center">Fotos</th>
              <th>Segurança</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rdos.map(r => {
              const fmt = (d) => {
                if (!d) return '—';
                const [y, m, day] = d.split('-');
                return `${day}/${m}/${y}`;
              };
              const moTotal = ((r.moi || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0))
                            + ((r.mod || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0))
                            + ((r.terc || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0));
              const eqpTotal = (r.equipamentos || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0);
              const atvCount = (r.atividades || []).length;
              const fotoCount = (r.fotos || []).length;
              const climaManha = r.tempo?.manha?.tempo || '—';
              const climaIcone = { bom: '☀️', chuva: '🌧️', nao_houve: '—' }[climaManha] || '—';
              const acidente = r.seguranca?.acidente || 'nao_houve';
              const segBadge = acidente === 'nao_houve'
                ? '<span class="badge" style="background:#D1FAE5;color:#047857;">OK</span>'
                : acidente === 'sem_afastamento'
                ? '<span class="badge" style="background:#FEF3C7;color:#B45309;">S/ Afast.</span>'
                : '<span class="badge" style="background:#FEE2E2;color:#B91C1C;">C/ Afast.</span>';

              return `
                <tr class="row-rdo" data-id="${r.id}" style="cursor:pointer;">
                  <td><strong style="color:var(--color-primary);">#${r.numero}</strong></td>
                  <td><strong>${fmt(r.data)}</strong>${r.diaSemana ? `<div class="rh-meta">${r.diaSemana}</div>` : ''}</td>
                  <td style="font-size:18px;">${climaIcone}</td>
                  <td style="text-align:center;font-weight:700;">${moTotal}</td>
                  <td class="rh-text-center">${eqpTotal}</td>
                  <td class="rh-text-center">${atvCount}</td>
                  <td class="rh-text-center">${fotoCount > 0 ? `📷 ${fotoCount}` : '—'}</td>
                  <td>${segBadge}</td>
                  <td>
                    <div class="actions-cell">
                      <a class="action-link btn-editar-rdo" data-id="${r.id}">Editar</a>
                      <a class="action-link btn-pdf-rdo" data-id="${r.id}" style="color:var(--color-info);">📄 PDF</a>
                      <a class="action-link danger btn-excluir-rdo" data-id="${r.id}">Excluir</a>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    setTimeout(() => this._attachRdoListeners(contract), 0);

    return `
      ${alertaHtml}
      <div class="card mb-2xl">
        <div class="card-header">
          <h3 class="card-title">Relatórios Diários de Obra (RDO)</h3>
          <button class="btn btn-primary btn-sm" id="btnNovoRdo">+ Novo RDO</button>
        </div>
        ${body}
      </div>
    `;
  },

  _attachRdoListeners(contract) {
    const btnNovo = document.getElementById('btnNovoRdo');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalRdo(contract.id));
    document.querySelectorAll('.btn-editar-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rdo = (contract.rdos || []).find(r => r.id === e.currentTarget.dataset.id);
        this.showModalRdo(contract.id, rdo);
      });
    });
    document.querySelectorAll('.btn-excluir-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteRdo(contract.id, e.currentTarget.dataset.id); });
    });
    document.querySelectorAll('.btn-pdf-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rdo = (contract.rdos || []).find(r => r.id === e.currentTarget.dataset.id);
        if (rdo) this.exportarRdoPdf(rdo, contract);
      });
    });
    // Click na linha → abre resumo do RDO
    document.querySelectorAll('.row-rdo').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.actions-cell')) return;
        const rdo = (contract.rdos || []).find(r => r.id === tr.dataset.id);
        if (rdo) this.showRdoDetail(rdo, contract);
      });
    });
  },

  // ─── Modal de resumo de RDO (reusado pelo Contratos e pela tela RDOs) ───
  showRdoDetail(rdo, contract) {
    const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const list = (arr) => Array.isArray(arr) ? arr : [];

    const moi  = list(rdo.moi);
    const mod_ = list(rdo.mod);
    const terc = list(rdo.terc);
    const eqp  = list(rdo.equipamentos);
    const atv  = list(rdo.atividades);
    const fotos = list(rdo.fotos);

    const totMoi  = moi.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totMod  = mod_.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totTerc = terc.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totEqp  = eqp.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);

    const seg = rdo.seguranca || {};
    const acidente = seg.acidente || 'nao_houve';
    const acidenteLbl = { nao_houve: 'Sem acidentes', sem_afastamento: 'Acidente sem afastamento', com_afastamento: 'Acidente com afastamento' }[acidente] || acidente;
    const acidenteCor = acidente === 'nao_houve' ? '#10b981' : acidente === 'sem_afastamento' ? '#f59e0b' : '#dc2626';

    const tempoLbl = (t) => {
      if (!t || t === 'nao_houve' || t === 'sem_expediente') return '—';
      return ({ bom: '☀️ Bom', nublado: '⛅ Nublado', chuva: '🌧 Chuva' })[t] || t;
    };
    const tempo = rdo.tempo || {};

    const renderTabela = (titulo, arr, cols) => {
      if (arr.length === 0) return '';
      return `
        <div style="margin-bottom:var(--sp-md);">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:6px;">${titulo}</div>
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--color-border);">
              ${cols.map(c => `<th style="text-align:${c.align || 'left'};padding:6px 8px;color:var(--color-text-muted);font-weight:600;">${c.label}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${arr.map(r => `<tr style="border-bottom:1px solid var(--color-border);">
                ${cols.map(c => `<td style="text-align:${c.align || 'left'};padding:6px 8px;">${escapeHtml(String(r[c.key] ?? '—'))}</td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };

    const html = `
      <div class="modal-overlay" id="modalRdoDetail">
        <div class="modal" style="width:760px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div style="flex:1;min-width:0;">
              <h2 class="modal-title" style="margin:0;">RDO #${escapeHtml(String(rdo.numero || ''))} — ${fmt(rdo.data)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">
                ${escapeHtml(contract?.name || '')} ${contract?.client ? '· ' + escapeHtml(contract.client) : ''}
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- Cabeçalho do dia -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--sp-sm);margin-bottom:var(--sp-md);">
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Dia da semana</div>
                <div style="font-weight:600;">${escapeHtml(rdo.diaSemana || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">OS</div>
                <div style="font-weight:600;">${escapeHtml(rdo.osNumero || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Ordem de compra</div>
                <div style="font-weight:600;">${escapeHtml(rdo.ordemCompra || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Período</div>
                <div style="font-weight:600;">${escapeHtml(rdo.periodoTrabalho || '—')}</div>
              </div>
            </div>

            <!-- Tempo + Prazo -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);margin-bottom:var(--sp-md);">
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Tempo</div>
                <div style="font-size:13px;line-height:1.7;">
                  <div><strong>Manhã:</strong> ${tempoLbl(tempo.manha?.tempo)} ${tempo.manha?.condicoes ? `· ${tempo.manha.condicoes}` : ''}</div>
                  <div><strong>Tarde:</strong> ${tempoLbl(tempo.tarde?.tempo)} ${tempo.tarde?.condicoes ? `· ${tempo.tarde.condicoes}` : ''}</div>
                  <div><strong>Noite ant.:</strong> ${tempoLbl(tempo.noiteAnt?.tempo)} ${tempo.noiteAnt?.condicoes ? `· ${tempo.noiteAnt.condicoes}` : ''}</div>
                  <div><strong>Precipitação:</strong> ${tempo.precipitacao || 0} mm</div>
                </div>
              </div>
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Prazo</div>
                <div style="font-size:13px;line-height:1.7;">
                  <div><strong>Início:</strong> ${fmt(rdo.prazo?.dataInicial)}</div>
                  <div><strong>Contratual:</strong> ${rdo.prazo?.contratual || 0} dias</div>
                  <div><strong>Decorrido:</strong> ${rdo.prazo?.decorrido || 0} dias</div>
                  <div><strong>Faltante:</strong> ${rdo.prazo?.faltante || 0} dias</div>
                  <div><strong>% Concluído:</strong> ${rdo.prazo?.pctConcluida || 0}%</div>
                </div>
              </div>
            </div>

            <!-- Mão de obra -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-md);margin-bottom:var(--sp-md);">
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">MOI</div>
                <div style="font-size:22px;font-weight:700;color:#3b82f6;">${totMoi}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${moi.length} cargo(s)</div>
              </div>
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">MOD</div>
                <div style="font-size:22px;font-weight:700;color:#10b981;">${totMod}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${mod_.length} cargo(s)</div>
              </div>
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">Terceiros</div>
                <div style="font-size:22px;font-weight:700;color:#f59e0b;">${totTerc}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${terc.length} cargo(s)</div>
              </div>
            </div>

            ${renderTabela('Mão de Obra Indireta (MOI)', moi.map(m => ({ cargo: m.cargo, qtd: m.qtd ?? m.quantidade ?? 0, horas: m.horas || 8 })), [
              { key: 'cargo',  label: 'Cargo' },
              { key: 'qtd',    label: 'Qtd',   align: 'center' },
              { key: 'horas',  label: 'Horas', align: 'center' },
            ])}
            ${renderTabela('Mão de Obra Direta (MOD)', mod_.map(m => ({ cargo: m.cargo, qtd: m.qtd ?? m.quantidade ?? 0, horas: m.horas || 8 })), [
              { key: 'cargo',  label: 'Cargo' },
              { key: 'qtd',    label: 'Qtd',   align: 'center' },
              { key: 'horas',  label: 'Horas', align: 'center' },
            ])}
            ${renderTabela('Terceiros', terc.map(m => ({ empresa: m.empresa || m.cargo, qtd: m.qtd ?? m.quantidade ?? 0 })), [
              { key: 'empresa', label: 'Empresa/Cargo' },
              { key: 'qtd',     label: 'Qtd', align: 'center' },
            ])}
            ${renderTabela('Equipamentos', eqp.map(e => ({
              nome: e.nome,
              qtd: e.qtd ?? e.quantidade ?? 0,
              horas: e.horasOperando ?? e.horas ?? 0,
            })), [
              { key: 'nome',  label: 'Equipamento' },
              { key: 'qtd',   label: 'Qtd',          align: 'center' },
              { key: 'horas', label: 'Horas oper.', align: 'center' },
            ])}
            ${renderTabela('Atividades do dia', atv.map(a => ({ descricao: a.descricao, pct: (a.pctExecutado ?? a.pct ?? 0) + '%' })), [
              { key: 'descricao', label: 'Descrição' },
              { key: 'pct',       label: 'Executado', align: 'center' },
            ])}

            <!-- Segurança -->
            <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;border-left:3px solid ${acidenteCor};margin-bottom:var(--sp-md);">
              <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Segurança</div>
              <div style="font-size:13px;line-height:1.7;">
                <div><strong>Status:</strong> <span style="color:${acidenteCor};font-weight:700;">${acidenteLbl}</span></div>
                ${seg.diagnostico ? `<div><strong>Diagnóstico:</strong> ${escapeHtml(seg.diagnostico)}</div>` : ''}
                ${seg.comentarios ? `<div><strong>Observações:</strong> ${escapeHtml(seg.comentarios)}</div>` : ''}
              </div>
            </div>

            ${rdo.fiscalizacaoComentarios ? `
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:6px;">Fiscalização</div>
                <div style="font-size:13px;white-space:pre-wrap;">${escapeHtml(rdo.fiscalizacaoComentarios)}</div>
              </div>
            ` : ''}

            ${fotos.length > 0 ? `
              <div style="margin-bottom:var(--sp-md);">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Fotos (${fotos.length})</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
                  ${fotos.slice(0, 12).map(f => `
                    <div style="position:relative;aspect-ratio:1;background:var(--color-surface-2);border-radius:6px;overflow:hidden;">
                      ${f.url ? `<img src="${f.url}" alt="${escapeHtml(f.legenda || '')}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:11px;">📷</div>`}
                    </div>
                  `).join('')}
                </div>
                ${fotos.length > 12 ? `<div style="text-align:center;margin-top:6px;color:var(--color-text-muted);font-size:13px;">+ ${fotos.length - 12} foto(s)</div>` : ''}
              </div>
            ` : ''}

            <!-- Assinaturas Digitais -->
            <div style="margin-bottom:var(--sp-md);" id="rdoAssinaturasSecao">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);">✍️ Assinaturas</div>
                ${contract && this._podeEditar() ? `<button class="btn btn-sm btn-primary" id="btnAddAssinatura">+ Adicionar assinatura</button>` : ''}
              </div>
              <div id="rdoAssinaturasLista" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-sm);">
                <div style="color:var(--color-text-muted);font-size:13px;padding:var(--sp-md);text-align:center;background:var(--color-surface-2);border-radius:6px;grid-column:1/-1;">Carregando...</div>
              </div>
            </div>

            <div style="font-size:11px;color:var(--color-text-muted);font-family:monospace;text-align:right;">ID: ${escapeHtml(rdo.id)}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnRdoClose">Fechar</button>
            ${contract ? `<button class="btn btn-secondary" id="btnRdoEdit">Editar</button>` : ''}
            ${contract ? `<button class="btn btn-secondary" id="btnRdoWhats" title="Enviar resumo via WhatsApp">💬 WhatsApp</button>` : ''}
            ${contract ? `<button class="btn btn-primary" id="btnRdoPdf">📄 Exportar PDF</button>` : ''}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalRdoDetail');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnRdoClose').addEventListener('click', close);
    const bEdit = document.getElementById('btnRdoEdit');
    if (bEdit) bEdit.addEventListener('click', () => { close(); this.showModalRdo(contract.id, rdo); });
    const bPdf = document.getElementById('btnRdoPdf');
    if (bPdf) bPdf.addEventListener('click', () => { close(); this.exportarRdoPdf(rdo, contract); });
    const bWhats = document.getElementById('btnRdoWhats');
    if (bWhats) bWhats.addEventListener('click', () => {
      const atividades = (rdo.atividades || []).map(a => `• ${a.descricao || a.nome || ''}`).join('\n');
      const moi = (rdo.moi || []).reduce((s, m) => s + (parseInt(m.quantidade) || 0), 0);
      const text = [
        `*RDO ${rdo.numero || ''} — ${rdo.data || ''}*`,
        `Obra: ${contract.name || ''}`,
        rdo.os_numero ? `OS: ${rdo.os_numero}` : '',
        `Clima: ${rdo.tempo || '—'}`,
        moi > 0 ? `MOI: ${moi} pessoas` : '',
        atividades ? `\nAtividades:\n${atividades}` : '',
        rdo.fiscalizacaoComentarios ? `\nObservações: ${rdo.fiscalizacaoComentarios}` : '',
      ].filter(Boolean).join('\n');
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
    });

    // Assinaturas: carrega e habilita botão de adicionar
    this._loadRdoAssinaturas(rdo.id, contract);
    const bAddAss = document.getElementById('btnAddAssinatura');
    if (bAddAss) bAddAss.addEventListener('click', () => this._showModalAddAssinatura(rdo.id, contract));
  },

  // Carrega lista de assinaturas do RDO via API
  async _loadRdoAssinaturas(rdoId, contract) {
    const lista = document.getElementById('rdoAssinaturasLista');
    if (!lista) return;
    try {
      const r = await fetch(`/api/contracts/${contract?.id || '_'}/rdos/${rdoId}/assinaturas`);
      if (!r.ok) throw new Error(await r.text());
      const { assinaturas = [] } = await r.json();
      if (assinaturas.length === 0) {
        lista.innerHTML = `<div style="color:var(--color-text-muted);font-size:13px;padding:var(--sp-md);text-align:center;background:var(--color-surface-2);border-radius:6px;grid-column:1/-1;">Nenhuma assinatura registrada</div>`;
        return;
      }
      const papelLbl = { encarregado: '👷 Encarregado', cliente: '🤝 Cliente', fiscal: '🛂 Fiscal', engenheiro: '👷‍♀️ Engenheiro', outro: '✍️ Outro' };
      lista.innerHTML = assinaturas.map(a => `
        <div style="background:var(--color-surface-2);border-radius:6px;padding:8px;border:1px solid var(--color-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <div style="font-size:12px;font-weight:700;color:var(--color-text);">${papelLbl[a.papel] || a.papel}</div>
            ${this._podeEditar() ? `<button class="btn-link-rdo-ass-del" data-aid="${a.id}" data-rid="${rdoId}" data-cid="${contract?.id || ''}" style="background:none;border:none;cursor:pointer;color:var(--color-danger);font-size:14px;" title="Remover">🗑️</button>` : ''}
          </div>
          <div style="background:#fff;border-radius:4px;padding:4px;margin-bottom:4px;">
            <img src="/api/contracts/${contract?.id || '_'}/rdos/${rdoId}/assinaturas/${a.id}" style="width:100%;height:80px;object-fit:contain;display:block;" alt="Assinatura">
          </div>
          <div style="font-size:13px;font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</div>
          <div style="font-size:11px;color:var(--color-text-muted);">${new Date(a.createdAt).toLocaleString('pt-BR')}</div>
        </div>
      `).join('');

      // Listener de remoção
      lista.querySelectorAll('.btn-link-rdo-ass-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Remover esta assinatura?')) return;
          try {
            const res = await fetch(`/api/contracts/${btn.dataset.cid}/rdos/${btn.dataset.rid}/assinaturas/${btn.dataset.aid}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            this._loadRdoAssinaturas(rdoId, contract);
          } catch (e) {
            window.showToast('Erro ao remover: ' + e.message, 'error');
          }
        });
      });
    } catch (e) {
      lista.innerHTML = `<div style="color:var(--color-danger);font-size:13px;padding:var(--sp-md);grid-column:1/-1;">Erro: ${escapeHtml(e.message)}</div>`;
    }
  },

  // Abre modal para desenhar assinatura no canvas
  async _showModalAddAssinatura(rdoId, contract) {
    if (!window.SignaturePad) {
      try { await window.RhinoLazy.ensure('signature_pad'); }
      catch { window.showToast('Falha ao carregar a biblioteca de assinatura', 'error'); return; }
    }

    const html = `
      <div class="modal-overlay" id="modalAssinatura" style="z-index:1100;">
        <div class="modal" style="width:520px;max-width:95vw;">
          <div class="modal-header">
            <h2 class="modal-title">✍️ Adicionar Assinatura</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Papel *</label>
                <select class="form-control" id="assPapel" required>
                  <option value="encarregado">Encarregado</option>
                  <option value="cliente">Cliente</option>
                  <option value="fiscal">Fiscal</option>
                  <option value="engenheiro">Engenheiro</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Nome *</label>
                <input class="form-control" id="assNome" placeholder="Nome de quem está assinando" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Assine no quadro abaixo:</label>
              <div style="background:#fff;border:2px dashed var(--color-border);border-radius:8px;padding:8px;">
                <canvas id="assCanvas" style="width:100%;height:200px;background:#fff;display:block;touch-action:none;cursor:crosshair;"></canvas>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                <span style="font-size:12px;color:var(--color-text-muted);">Use o mouse ou o dedo (touchscreen)</span>
                <button type="button" class="btn btn-sm btn-secondary" id="assLimpar">🗑️ Limpar</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="assCancelar">Cancelar</button>
            <button class="btn btn-primary" id="assSalvar">💾 Salvar assinatura</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalAssinatura');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('assCancelar').addEventListener('click', close);

    // Inicializa Signature Pad — precisa configurar canvas com tamanho real
    const canvas = document.getElementById('assCanvas');
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
    };
    resizeCanvas();
    const sigPad = new window.SignaturePad(canvas, {
      backgroundColor: 'rgba(255,255,255,0)',
      penColor: '#0f172a',
      minWidth: 1.5,
      maxWidth: 3,
    });

    document.getElementById('assLimpar').addEventListener('click', () => sigPad.clear());

    document.getElementById('assSalvar').addEventListener('click', async () => {
      if (sigPad.isEmpty()) { window.showToast('Assine antes de salvar', 'error'); return; }
      const papel = document.getElementById('assPapel').value;
      const nome = document.getElementById('assNome').value.trim();
      if (!nome) { window.showToast('Informe o nome de quem está assinando', 'error'); return; }

      const btnSalvar = document.getElementById('assSalvar');
      btnSalvar.disabled = true; btnSalvar.textContent = 'Enviando...';
      try {
        // Converte canvas em PNG blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const fd = new FormData();
        fd.append('file', blob, 'assinatura.png');
        fd.append('papel', papel);
        fd.append('nome', nome);
        const res = await fetch(`/api/contracts/${contract?.id || '_'}/rdos/${rdoId}/assinaturas`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(await res.text());
        window.showToast('Assinatura salva!', 'success');
        close();
        this._loadRdoAssinaturas(rdoId, contract);
      } catch (e) {
        window.showToast('Erro ao salvar: ' + e.message, 'error');
        btnSalvar.disabled = false; btnSalvar.textContent = '💾 Salvar assinatura';
      }
    });
  },

  _autoMoFromOrganograma(contract) {
    const membros = contract.organograma || [];
    const recursos = Store.state.recursos || [];
    const moi = new Map(), mod = new Map();
    membros.forEach(m => {
      const r = recursos.find(x => x.id === m.recursoId);
      const cargo = (r?.profissao || m.cargo || '').trim();
      if (!cargo) return;
      // Prioridade: rdoCategoria explícita no recurso → nível do organograma → fallback por nome do cargo
      let categoria = r?.rdoCategoria;
      if (!categoria) {
        if (m.nivel === 'encarregado' || m.nivel === 'lider_area') categoria = 'moi';
        else if (m.nivel === 'profissional') categoria = 'mod';
      }
      if (!categoria) categoria = RDO_CARGO_CATEGORIA_MOI.has(cargo) ? 'moi' : 'mod';
      const bucket = categoria === 'moi' ? moi : mod;
      const cur = bucket.get(cargo) || { cargo, qtd: 0, horas: 9 };
      cur.qtd += 1;
      bucket.set(cargo, cur);
    });
    return {
      moi: Array.from(moi.values()),
      mod: Array.from(mod.values())
    };
  },

  _diaSemanaFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  },

  showModalRdo(contractId, rdo) {
    const contract = Store.getContractById(contractId);
    const isNew = !rdo;
    const hoje = new Date().toISOString().split('T')[0];

    // valores iniciais
    const iniciais = rdo || {
      data: hoje,
      diaSemana: this._diaSemanaFromDate(hoje),
      osNumero: '',
      ordemCompra: contract.contractNumber || '',
      projeto: contract.name || '',
      prazo: {
        dataInicial: contract.startDate || '',
        contratual: this._calcDiasPrazo(contract.startDate, contract.endDate),
        decorrido: this._calcDiasDecorridos(contract.startDate, hoje),
        faltante: 0,
        pctConcluida: 0
      },
      tempo: {
        manha:    { tempo: 'bom',            condicoes: 'operavel'   },
        tarde:    { tempo: 'bom',            condicoes: 'operavel'   },
        noiteAnt: { tempo: 'sem_expediente', condicoes: 'inoperavel' },
        precipitacao: 0
      },
      periodoTrabalho: '7:00 às 17:00',
      horaExtra: false,
      ...this._autoMoFromOrganograma(contract),
      terc: [],
      equipamentos: [],
      atividades: [{ area: '', descricao: '', pctConcluida: 0, ocorrencias: '' }],
      seguranca: { acidente: 'nao_houve', diagnostico: '', comentarios: '' },
      fiscalizacaoComentarios: ''
    };
    // Recalcula prazo sempre (novo ou edição) com base no contrato + data do RDO.
    // Faltante considera a data de tendência (previsão atualizada).
    // Se tendência > endDate contratual → mostra "Atraso de X dias".
    const refData = iniciais.data || hoje;
    const contratual = this._calcDiasPrazo(contract.startDate, contract.endDate);
    const decorrido  = this._calcDiasDecorridos(contract.startDate, refData);
    const tendencia  = contract.tendencyDate || contract.endDate || '';
    const faltanteDias = tendencia
      ? Math.max(0, Math.round((new Date(tendencia) - new Date(refData)) / 86400000))
      : Math.max(0, contratual - decorrido);
    const atrasoDias = (contract.tendencyDate && contract.endDate)
      ? Math.max(0, Math.round((new Date(contract.tendencyDate) - new Date(contract.endDate)) / 86400000))
      : 0;

    iniciais.prazo = {
      dataInicial: contract.startDate || '',
      dataFinal:   contract.endDate   || '',
      dataTendencia: contract.tendencyDate || '',
      contratual,
      decorrido,
      faltante: faltanteDias,
      atraso:   atrasoDias,
      pctConcluida: iniciais.prazo?.pctConcluida || 0
    };

    this._rdoData = JSON.parse(JSON.stringify(iniciais));
    this._rdoTab = 'cabecalho';
    this._renderRdoModal(contractId, rdo);
  },

  _calcDiasPrazo(start, end) {
    if (!start || !end) return 0;
    return Math.round((new Date(end) - new Date(start)) / 86400000);
  },
  _calcDiasDecorridos(start, hoje) {
    if (!start) return 0;
    return Math.max(0, Math.round((new Date(hoje) - new Date(start)) / 86400000));
  },
  });
})();
