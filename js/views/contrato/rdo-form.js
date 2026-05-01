/* Rhino · ContratoDetail · rdo-form
   Extraído de js/views/ContratoDetail.js (linhas 3524-4256)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/rdo-form] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  _renderRdoModal(contractId, rdoOriginal) {
    // Remove modal antigo se houver
    const existing = document.getElementById('modalRdoOverlay');
    if (existing) existing.remove();

    const contract = Store.getContractById(contractId) || { name: '' };
    const isNew = !rdoOriginal;
    const d = this._rdoData;
    const tab = this._rdoTab;

    const tabs = [
      { k:'cabecalho',    l:'Cabeçalho' },
      { k:'tempo',        l:'Tempo' },
      { k:'mo',           l:'Mão de Obra' },
      { k:'equipamentos', l:'Equipamentos' },
      { k:'atividades',   l:'Atividades' },
      { k:'seguranca',    l:'Segurança' },
      { k:'fiscalizacao', l:'Fiscalização' },
      { k:'fotos',        l:`Fotos${rdoOriginal ? ' (' + ((rdoOriginal.fotos || []).length) + ')' : ''}` }
    ];

    const html = `
      <div class="modal-overlay" id="modalRdoOverlay">
        <div class="modal" style="width:90vw;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <div>
              <h2 class="modal-title">${isNew ? 'Novo RDO' : `RDO #${rdoOriginal.numero} — ${rdoOriginal.data}`}</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${escapeHtml(contract.name || '')}</p>
            </div>
            <button class="modal-close" id="btnCloseRdo">✕</button>
          </div>

          <!-- Tabs internas -->
          <div style="display:flex;gap:2px;padding:0 var(--sp-lg);border-bottom:1px solid var(--color-border);flex-shrink:0;overflow-x:auto;">
            ${tabs.map(t => `
              <button type="button" class="rdo-tab" data-rdo-tab="${t.k}" style="padding:10px 14px;background:transparent;border:none;border-bottom:3px solid ${tab===t.k?'var(--color-primary)':'transparent'};color:${tab===t.k?'var(--color-primary)':'var(--color-text-muted)'};font-size:15px;font-weight:${tab===t.k?'600':'500'};cursor:pointer;white-space:nowrap;margin-bottom:-1px;">${t.l}</button>
            `).join('')}
          </div>

          <div id="rdoFormContent" style="flex:1;overflow-y:auto;padding:var(--sp-lg);">
            ${this._renderRdoTab(tab, rdoOriginal)}
          </div>

          <div class="modal-footer" style="flex-shrink:0;">
            <button type="button" class="btn btn-secondary" id="btnCancelRdo">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btnSaveRdo">${isNew ? 'Criar RDO' : 'Salvar Alterações'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this._attachRdoModalListeners(contractId, rdoOriginal);
  },

  _renderRdoTab(tab, rdoOriginal) {
    const d = this._rdoData;
    const contract = Store.getContractById(rdoOriginal?.contractId || (this._rdoData._contractId));
    switch (tab) {
      case 'cabecalho':    return this._rdoTabCabecalho(d);
      case 'tempo':        return this._rdoTabTempo(d);
      case 'mo':           return this._rdoTabMo(d);
      case 'equipamentos': return this._rdoTabEquipamentos(d);
      case 'atividades':   return this._rdoTabAtividades(d);
      case 'seguranca':    return this._rdoTabSeguranca(d);
      case 'fiscalizacao': return this._rdoTabFiscalizacao(d);
      case 'fotos':        return this._rdoTabFotos(d, rdoOriginal);
      default: return '';
    }
  },

  _rdoTabCabecalho(d) {
    const fmt = (s) => { if (!s) return '—'; const [y,m,dy] = s.split('-'); return `${dy}/${m}/${y}`; };
    const infoBox = (label, value) => `
      <div style="padding:10px 14px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;">
        <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:2px;">${label}</div>
        <div style="font-size:15px;color:var(--color-text);font-weight:600;">${value || '—'}</div>
      </div>
    `;

    return `
      <!-- Informações do contrato (read-only — puxadas automaticamente) -->
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(85,88,139,.06),rgba(85,88,139,.02));border:1px solid rgba(85,88,139,.2);border-radius:8px;margin-bottom:var(--sp-lg);">
        <div style="font-size:13px;color:#55588B;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">📋 Dados do Contrato (preenchidos automaticamente)</div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
          ${infoBox('Projeto', escapeHtml(d.projeto || ''))}
          ${infoBox('Ordem de Compra', escapeHtml(d.ordemCompra || ''))}
        </div>
      </div>

      <!-- Dados editáveis do dia -->
      <div class="form-row form-row-3" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input class="form-control" type="date" data-rdo-field="data" value="${d.data || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dia da Semana</label>
          <input class="form-control" data-rdo-field="diaSemana" value="${d.diaSemana || ''}" readonly style="background:var(--color-bg) !important;color:var(--color-text) !important;cursor:not-allowed;">
        </div>
        <div class="form-group">
          <label class="form-label">Nº Ordem de Serviço</label>
          <input class="form-control" data-rdo-field="osNumero" value="${escapeHtml(d.osNumero || '')}" placeholder="Ex: OS-2026-042">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Período de Trabalho</label>
          <select class="form-control" data-rdo-field="periodoTrabalho">
            <option ${d.periodoTrabalho === '7:00 às 15:00' ? 'selected' : ''}>7:00 às 15:00</option>
            <option ${d.periodoTrabalho === '7:00 às 17:00' ? 'selected' : ''}>7:00 às 17:00</option>
            <option ${d.periodoTrabalho === '23:00 às 7:00' ? 'selected' : ''}>23:00 às 7:00</option>
            <option ${d.periodoTrabalho === 'Outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:28px;">
          <input type="checkbox" id="rdoHoraExtra" data-rdo-field="horaExtra" ${d.horaExtra ? 'checked' : ''} style="width:18px;height:18px;">
          <label for="rdoHoraExtra" style="font-size:15px;font-weight:500;cursor:pointer;">Hora Extra</label>
        </div>
      </div>

      <!-- Prazo (tudo calculado automaticamente do contrato + data do RDO) -->
      <h4 style="margin-top:var(--sp-lg);margin-bottom:var(--sp-md);font-size:16px;font-weight:700;color:var(--color-text);">⏱ Prazo do Contrato</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        ${infoBox('Data Inicial',  fmt(d.prazo?.dataInicial))}
        ${infoBox('Data Final (Contratual)', fmt(d.prazo?.dataFinal))}
        ${(() => {
          const td = d.prazo?.dataTendencia;
          const atraso = d.prazo?.atraso || 0;
          if (!td) return infoBox('Data de Tendência', '—');
          const cor = atraso > 0 ? '#DC2626' : '#047857';
          return `
            <div style="padding:10px 14px;background:${atraso > 0 ? '#FEF2F2' : '#ECFDF5'};border:1px solid ${atraso > 0 ? '#FECACA' : '#A7F3D0'};border-radius:6px;">
              <div style="font-size:13px;color:${cor};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:2px;">Data de Tendência</div>
              <div style="font-size:15px;color:#1F2937;font-weight:700;">${fmt(td)}</div>
              ${atraso > 0 ? `<div style="font-size:13px;color:${cor};font-weight:700;margin-top:2px;">⚠ Atraso de ${atraso} dia(s)</div>` : '<div style="font-size:13px;color:#047857;font-weight:600;margin-top:2px;">✓ No prazo</div>'}
            </div>
          `;
        })()}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${infoBox('Contratual',    (d.prazo?.contratual || 0) + ' dias')}
        ${infoBox('Decorrido',     (d.prazo?.decorrido || 0) + ' dias')}
        ${(() => {
          const falt = d.prazo?.faltante || 0;
          const atraso = d.prazo?.atraso || 0;
          const label = atraso > 0 ? 'Atraso' : 'Faltante';
          const valor = atraso > 0 ? `${atraso} dia(s)` : `${falt} dia(s)`;
          const bg = atraso > 0 ? '#FEF2F2' : '#F3F4F6';
          const brd = atraso > 0 ? '#FECACA' : '#E5E7EB';
          const cor = atraso > 0 ? '#DC2626' : '#6B7280';
          return `
            <div style="padding:10px 14px;background:${bg};border:1px solid ${brd};border-radius:6px;">
              <div style="font-size:13px;color:${cor};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:2px;">${label}</div>
              <div style="font-size:15px;color:#1F2937;font-weight:700;">${valor}</div>
            </div>
          `;
        })()}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;">
        <div style="padding:10px 14px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;grid-column:span 3;">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:2px;">% Concluída</div>
          <input class="form-control" type="number" step="0.1" data-rdo-field="prazo.pctConcluida" value="${d.prazo?.pctConcluida || 0}" style="padding:4px 8px;font-weight:700;border:none;background:transparent !important;max-width:120px;">
        </div>
      </div>
      <div style="font-size:13px;color:var(--color-text-muted);margin-top:8px;">💡 As datas e dias são calculados automaticamente. Edite apenas a <strong>% concluída</strong> conforme o avanço.</div>
    `;
  },

  _rdoTabTempo(d) {
    const periodos = [
      { k: 'manha',    l: 'Manhã' },
      { k: 'tarde',    l: 'Tarde' },
      { k: 'noiteAnt', l: 'Noite Ant.' }
    ];
    return `
      <p style="font-size:15px;color:var(--color-text-muted);margin-bottom:var(--sp-lg);">Condição do tempo e da área por período do dia.</p>

      ${periodos.map(p => `
        <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
          <div style="font-weight:700;margin-bottom:var(--sp-sm);font-size:16px;">${p.l}</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Tempo</label>
              <select class="form-control" data-rdo-field="tempo.${p.k}.tempo">
                ${RDO_TEMPO_OPCOES.map(o => `<option value="${o.v}" ${d.tempo?.[p.k]?.tempo === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Condições da Área</label>
              <select class="form-control" data-rdo-field="tempo.${p.k}.condicoes">
                ${RDO_COND_OPCOES.map(o => `<option value="${o.v}" ${d.tempo?.[p.k]?.condicoes === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="form-group">
        <label class="form-label">Precipitação (mm)</label>
        <input class="form-control" type="number" step="0.1" data-rdo-field="tempo.precipitacao" value="${d.tempo?.precipitacao || 0}" style="max-width:200px;">
      </div>
    `;
  },

  _rdoMoRow(cat, entry, idx, opcoesCargo) {
    const options = opcoesCargo.map(c => `<option ${entry.cargo === c ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <tr data-rdo-mo-row="${cat}-${idx}">
        <td>
          <input class="form-control" list="rdo-${cat}-list" data-rdo-mo="${cat}.${idx}.cargo" value="${escapeHtml(entry.cargo || '')}" placeholder="Cargo">
        </td>
        <td style="width:100px;">
          <input class="form-control" type="number" data-rdo-mo="${cat}.${idx}.qtd" value="${entry.qtd || 0}" min="0">
        </td>
        <td style="width:100px;">
          <input class="form-control" type="number" step="0.5" data-rdo-mo="${cat}.${idx}.horas" value="${entry.horas || 0}" min="0">
        </td>
        <td style="text-align:right;font-weight:600;" class="rdo-mo-total">${((entry.qtd || 0) * (entry.horas || 0)).toFixed(1)}</td>
        <td style="width:40px;">
          <button type="button" class="action-link danger" data-rdo-mo-remove="${cat}-${idx}">✕</button>
        </td>
      </tr>
    `;
  },

  _rdoTabMo(d) {
    const secoes = [
      { k: 'moi',  l: 'Mão de Obra Indireta (MOI)', opcoes: RDO_MOI_CARGOS },
      { k: 'mod',  l: 'Mão de Obra Direta (MOD)',  opcoes: RDO_MOD_CARGOS }
    ];
    return `
      <p style="font-size:15px;color:var(--color-text-muted);margin-bottom:var(--sp-lg);">As entradas foram pré-preenchidas com base no organograma. Ajuste quantidades e horas trabalhadas.</p>

      <datalist id="rdo-moi-list">${RDO_MOI_CARGOS.map(c => `<option value="${c}">`).join('')}</datalist>
      <datalist id="rdo-mod-list">${RDO_MOD_CARGOS.map(c => `<option value="${c}">`).join('')}</datalist>

      ${secoes.map(sec => `
        <div style="margin-bottom:var(--sp-xl);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
            <h4 style="font-size:16px;font-weight:700;margin:0;">${sec.l}</h4>
            <button type="button" class="btn btn-sm btn-primary" data-rdo-mo-add="${sec.k}">+ Adicionar</button>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--color-surface-2);">
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Cargo</th>
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
                <th style="text-align:right;padding:8px;font-size:15px;font-weight:600;color:var(--color-text-muted);">H×H</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-rdo-mo-body="${sec.k}">
              ${(d[sec.k] || []).map((e, i) => this._rdoMoRow(sec.k, e, i, sec.opcoes)).join('')}
              ${(d[sec.k] || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum item — clique em "+ Adicionar"</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `).join('')}

      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
          <h4 style="font-size:16px;font-weight:700;margin:0;">Terceirizados</h4>
          <button type="button" class="btn btn-sm btn-primary" data-rdo-terc-add>+ Adicionar</button>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--color-surface-2);">
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Empresa</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Cargo</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-rdo-terc-body>
            ${(d.terc || []).map((e, i) => `
              <tr data-rdo-terc-row="${i}">
                <td><input class="form-control" data-rdo-terc="${i}.empresa" value="${escapeHtml(e.empresa || '')}"></td>
                <td><input class="form-control" data-rdo-terc="${i}.cargo" value="${escapeHtml(e.cargo || '')}"></td>
                <td style="width:100px;"><input class="form-control" type="number" data-rdo-terc="${i}.qtd" value="${e.qtd || 0}"></td>
                <td style="width:100px;"><input class="form-control" type="number" step="0.5" data-rdo-terc="${i}.horas" value="${e.horas || 0}"></td>
                <td style="width:40px;"><button type="button" class="action-link danger" data-rdo-terc-remove="${i}">✕</button></td>
              </tr>
            `).join('')}
            ${(d.terc || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum terceirizado</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  },

  _rdoTabEquipamentos(d) {
    return `
      <datalist id="rdo-eqp-list">${RDO_EQP_TIPOS.map(t => `<option value="${t}">`).join('')}</datalist>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Equipamentos</h4>
        <button type="button" class="btn btn-sm btn-primary" data-rdo-eqp-add>+ Adicionar</button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--color-surface-2);">
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Equipamento</th>
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
            <th style="text-align:right;padding:8px;font-size:15px;font-weight:600;color:var(--color-text-muted);">Eqp×H</th>
            <th></th>
          </tr>
        </thead>
        <tbody data-rdo-eqp-body>
          ${(d.equipamentos || []).map((e, i) => `
            <tr data-rdo-eqp-row="${i}">
              <td><input class="form-control" list="rdo-eqp-list" data-rdo-eqp="${i}.tipo" value="${escapeHtml(e.tipo || '')}"></td>
              <td style="width:100px;"><input class="form-control" type="number" data-rdo-eqp="${i}.qtd" value="${e.qtd || 0}"></td>
              <td style="width:100px;"><input class="form-control" type="number" step="0.5" data-rdo-eqp="${i}.horas" value="${e.horas || 0}"></td>
              <td style="text-align:right;font-weight:600;">${((e.qtd || 0) * (e.horas || 0)).toFixed(1)}</td>
              <td style="width:40px;"><button type="button" class="action-link danger" data-rdo-eqp-remove="${i}">✕</button></td>
            </tr>
          `).join('')}
          ${(d.equipamentos || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum equipamento — clique em "+ Adicionar"</td></tr>` : ''}
        </tbody>
      </table>
    `;
  },

  _rdoTabAtividades(d) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-md);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Atividades do Dia</h4>
        <button type="button" class="btn btn-sm btn-primary" data-rdo-atv-add>+ Nova Atividade</button>
      </div>
      <div data-rdo-atv-body style="display:flex;flex-direction:column;gap:var(--sp-md);">
        ${(d.atividades || []).map((a, i) => `
          <div data-rdo-atv-row="${i}" style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
            <div class="form-row form-row-3" style="grid-template-columns:1fr 3fr 120px auto;gap:var(--sp-md);align-items:flex-end;">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Área</label>
                <input class="form-control" data-rdo-atv="${i}.area" value="${escapeHtml(a.area || '')}">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Descrição</label>
                <input class="form-control" data-rdo-atv="${i}.descricao" value="${escapeHtml(a.descricao || '')}">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">% Concluída</label>
                <input class="form-control" type="number" step="0.1" data-rdo-atv="${i}.pctConcluida" value="${a.pctConcluida || 0}">
              </div>
              <button type="button" class="action-link danger" data-rdo-atv-remove="${i}" style="margin-bottom:8px;">✕</button>
            </div>
            <div class="form-group" style="margin-top:var(--sp-sm);margin-bottom:0;">
              <label class="form-label">Ocorrências / Alertas</label>
              <textarea class="form-control" data-rdo-atv="${i}.ocorrencias" rows="2">${escapeHtml(a.ocorrencias || '')}</textarea>
            </div>
          </div>
        `).join('')}
        ${(d.atividades || []).length === 0 ? `<div style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);font-size:15px;">Nenhuma atividade — clique em "+ Nova Atividade"</div>` : ''}
      </div>
    `;
  },

  _rdoTabSeguranca(d) {
    return `
      <h4 style="font-size:16px;font-weight:700;margin-bottom:var(--sp-md);">Segurança do Trabalho</h4>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">🛡️ Tema do DDS (Diálogo Diário de Segurança)</label>
          <input class="form-control" data-rdo-field="seguranca.temaDds" value="${escapeHtml(d.seguranca?.temaDds || '')}" placeholder="Ex: Uso correto de EPI em área úmida">
        </div>
        <div class="form-group">
          <label class="form-label">🌱 Tema de Meio Ambiente</label>
          <input class="form-control" data-rdo-field="seguranca.temaMeioAmbiente" value="${escapeHtml(d.seguranca?.temaMeioAmbiente || '')}" placeholder="Ex: Descarte correto de resíduos">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Houve Acidente?</label>
        <div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;">
          ${[
            { v: 'nao_houve',       l: 'Não Houve'      },
            { v: 'sem_afastamento', l: 'Sem Afastamento' },
            { v: 'com_afastamento', l: 'Com Afastamento' }
          ].map(o => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:15px;padding:8px 14px;background:${d.seguranca?.acidente === o.v ? 'rgba(85,88,139,.08)' : 'transparent'};border:1px solid ${d.seguranca?.acidente === o.v ? '#55588B' : '#D1D5DB'};border-radius:6px;">
              <input type="radio" name="rdoAcidente" value="${o.v}" data-rdo-field="seguranca.acidente" ${d.seguranca?.acidente === o.v ? 'checked' : ''}>
              ${o.l}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Diagnóstico (se houve acidente)</label>
        <textarea class="form-control" data-rdo-field="seguranca.diagnostico" rows="2">${escapeHtml(d.seguranca?.diagnostico || '')}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Admissões</label>
          <input class="form-control" type="number" data-rdo-field="seguranca.admissoes" value="${d.seguranca?.admissoes || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Demissões</label>
          <input class="form-control" type="number" data-rdo-field="seguranca.demissoes" value="${d.seguranca?.demissoes || 0}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Comentários da Segurança</label>
        <textarea class="form-control" data-rdo-field="seguranca.comentarios" rows="4" placeholder="Observações gerais, ocorrências de segurança, ações tomadas">${escapeHtml(d.seguranca?.comentarios || '')}</textarea>
      </div>
    `;
  },

  _rdoTabFiscalizacao(d) {
    return `
      <div class="form-group">
        <label class="form-label">Comentários da Fiscalização</label>
        <textarea class="form-control" data-rdo-field="fiscalizacaoComentarios" rows="10" placeholder="Observações do fiscal sobre a execução da obra no dia">${escapeHtml(d.fiscalizacaoComentarios || '')}</textarea>
      </div>
    `;
  },

  _rdoTabFotos(d, rdoOriginal) {
    if (!rdoOriginal) {
      return `
        <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
          <div style="font-size:38px;margin-bottom:var(--sp-sm);opacity:.5;">📷</div>
          <div style="font-size:15px;">Salve o RDO primeiro para adicionar fotos.</div>
        </div>
      `;
    }
    const fotos = rdoOriginal.fotos || [];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-md);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Fotos do dia (${fotos.length})</h4>
        <div style="display:flex;gap:var(--sp-sm);align-items:center;">
          <input type="text" class="form-control" id="rdoFotoLegenda" placeholder="Legenda (opcional)" style="max-width:280px;font-size:15px;">
          <input type="file" id="rdoFotoInput" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">
          <button type="button" class="btn btn-sm btn-primary" id="rdoFotoBtn">📷 Adicionar Fotos</button>
        </div>
      </div>

      <div id="rdoFotosGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:var(--sp-md);">
        ${fotos.length === 0 ? `<div style="grid-column:1/-1;text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);font-size:15px;">Nenhuma foto ainda</div>` : ''}
        ${fotos.map(f => `
          <div style="position:relative;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;background:#FFFFFF;">
            <img src="${f.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;">
            ${f.legenda ? `<div style="padding:6px 10px;font-size:15px;color:var(--color-text);background:var(--color-surface-2);border-top:1px solid var(--color-border);">${escapeHtml(f.legenda)}</div>` : ''}
            <button type="button" class="btn-rdo-foto-del" data-id="${f.id}" title="Remover foto" style="position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:16px;">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  },

  _attachRdoModalListeners(contractId, rdoOriginal) {
    const overlay = document.getElementById('modalRdoOverlay');
    if (!overlay) return;

    const rerender = () => {
      const content = document.getElementById('rdoFormContent');
      content.innerHTML = this._renderRdoTab(this._rdoTab, rdoOriginal);
      this._bindRdoInputs(contractId, rdoOriginal);
    };

    document.getElementById('btnCloseRdo').addEventListener('click', () => overlay.remove());
    document.getElementById('btnCancelRdo').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('[data-rdo-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoTab = btn.dataset.rdoTab;
        // re-render tabs visuais
        overlay.querySelectorAll('[data-rdo-tab]').forEach(b => {
          const active = b.dataset.rdoTab === this._rdoTab;
          b.style.borderBottomColor = active ? 'var(--color-primary)' : 'transparent';
          b.style.color = active ? 'var(--color-primary)' : 'var(--color-text-muted)';
          b.style.fontWeight = active ? '600' : '500';
        });
        rerender();
      });
    });

    this._bindRdoInputs(contractId, rdoOriginal);

    document.getElementById('btnSaveRdo').addEventListener('click', async () => {
      try {
        if (!this._rdoData.data) { showToast('Data é obrigatória', 'warning'); return; }
        this._rdoData.diaSemana = this._diaSemanaFromDate(this._rdoData.data);
        // Auto-calculado: totais
        const t = this._rdoData.totais = {
          moi:  (this._rdoData.moi || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          mod:  (this._rdoData.mod || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          terc: (this._rdoData.terc || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          eqp:  (this._rdoData.equipamentos || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          homensHora: 0, horasParadas: 0, equipamentoHora: 0
        };
        t.homensHora = ['moi','mod','terc'].reduce((s, k) =>
          s + (this._rdoData[k] || []).reduce((acc, x) => acc + (+x.qtd || 0) * (+x.horas || 0), 0), 0);
        t.equipamentoHora = (this._rdoData.equipamentos || []).reduce((acc, x) => acc + (+x.qtd || 0) * (+x.horas || 0), 0);

        if (rdoOriginal) {
          await Store.updateRdo(contractId, rdoOriginal.id, this._rdoData);
          showToast('RDO atualizado.', 'success');
        } else {
          await Store.createRdo(contractId, this._rdoData);
          showToast('RDO criado.', 'success');
        }
        overlay.remove();
        this.render({ id: contractId });
      } catch (err) {
        showToast(err.message || 'Erro ao salvar', 'error');
      }
    });
  },

  _setByPath(obj, pathStr, value) {
    const parts = pathStr.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  },

  _bindRdoInputs(contractId, rdoOriginal) {
    const overlay = document.getElementById('modalRdoOverlay');
    if (!overlay) return;
    const rerender = () => {
      const content = document.getElementById('rdoFormContent');
      content.innerHTML = this._renderRdoTab(this._rdoTab, rdoOriginal);
      this._bindRdoInputs(contractId, rdoOriginal);
    };

    const contract = Store.getContractById(contractId);
    // Campos simples (data-rdo-field="path.to.key")
    overlay.querySelectorAll('[data-rdo-field]').forEach(el => {
      const path = el.dataset.rdoField;
      const handler = () => {
        let val;
        if (el.type === 'checkbox') val = el.checked;
        else if (el.type === 'radio') val = el.value;
        else if (el.type === 'number') val = parseFloat(el.value) || 0;
        else val = el.value;
        this._setByPath(this._rdoData, path, val);
        if (path === 'data') {
          // atualiza diaSemana
          this._rdoData.diaSemana = this._diaSemanaFromDate(val);
          // recalcula prazo com base no contrato + nova data (considerando tendência)
          if (contract) {
            const contratual = this._calcDiasPrazo(contract.startDate, contract.endDate);
            const decorrido  = this._calcDiasDecorridos(contract.startDate, val);
            const tendencia  = contract.tendencyDate || contract.endDate || '';
            const faltanteDias = tendencia
              ? Math.max(0, Math.round((new Date(tendencia) - new Date(val)) / 86400000))
              : Math.max(0, contratual - decorrido);
            const atrasoDias = (contract.tendencyDate && contract.endDate)
              ? Math.max(0, Math.round((new Date(contract.tendencyDate) - new Date(contract.endDate)) / 86400000))
              : 0;
            this._rdoData.prazo = {
              ...(this._rdoData.prazo || {}),
              dataInicial: contract.startDate || '',
              dataFinal:   contract.endDate   || '',
              dataTendencia: contract.tendencyDate || '',
              contratual,
              decorrido,
              faltante: faltanteDias,
              atraso:   atrasoDias
            };
          }
          // Re-render pra refletir prazo + dia-semana
          if (this._rdoTab === 'cabecalho') rerender();
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // MOI/MOD
    ['moi','mod'].forEach(cat => {
      overlay.querySelectorAll(`[data-rdo-mo^="${cat}."]`).forEach(el => {
        el.addEventListener('input', () => {
          const [, idxStr, key] = el.dataset.rdoMo.split('.');
          const idx = parseInt(idxStr);
          const arr = this._rdoData[cat] || (this._rdoData[cat] = []);
          if (!arr[idx]) arr[idx] = { cargo: '', qtd: 0, horas: 9 };
          arr[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
          // Atualiza total da linha
          const row = overlay.querySelector(`[data-rdo-mo-row="${cat}-${idx}"] .rdo-mo-total`);
          if (row) row.textContent = ((arr[idx].qtd || 0) * (arr[idx].horas || 0)).toFixed(1);
        });
      });
    });
    overlay.querySelectorAll('[data-rdo-mo-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.rdoMoAdd;
        if (!this._rdoData[cat]) this._rdoData[cat] = [];
        this._rdoData[cat].push({ cargo: '', qtd: 1, horas: 9 });
        rerender();
      });
    });
    overlay.querySelectorAll('[data-rdo-mo-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [cat, idxStr] = btn.dataset.rdoMoRemove.split('-');
        this._rdoData[cat].splice(parseInt(idxStr), 1);
        rerender();
      });
    });

    // Terceirizados
    overlay.querySelectorAll('[data-rdo-terc]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoTerc.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.terc) this._rdoData.terc = [];
        if (!this._rdoData.terc[idx]) this._rdoData.terc[idx] = { empresa: '', cargo: '', qtd: 0, horas: 9 };
        this._rdoData.terc[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-terc-add]')?.addEventListener('click', () => {
      if (!this._rdoData.terc) this._rdoData.terc = [];
      this._rdoData.terc.push({ empresa: '', cargo: '', qtd: 1, horas: 9 });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-terc-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.terc.splice(parseInt(btn.dataset.rdoTercRemove), 1);
        rerender();
      });
    });

    // Equipamentos
    overlay.querySelectorAll('[data-rdo-eqp]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoEqp.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.equipamentos) this._rdoData.equipamentos = [];
        if (!this._rdoData.equipamentos[idx]) this._rdoData.equipamentos[idx] = { tipo: '', qtd: 0, horas: 9 };
        this._rdoData.equipamentos[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-eqp-add]')?.addEventListener('click', () => {
      if (!this._rdoData.equipamentos) this._rdoData.equipamentos = [];
      this._rdoData.equipamentos.push({ tipo: '', qtd: 1, horas: 9 });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-eqp-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.equipamentos.splice(parseInt(btn.dataset.rdoEqpRemove), 1);
        rerender();
      });
    });

    // Atividades
    overlay.querySelectorAll('[data-rdo-atv]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoAtv.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.atividades) this._rdoData.atividades = [];
        if (!this._rdoData.atividades[idx]) this._rdoData.atividades[idx] = { area: '', descricao: '', pctConcluida: 0, ocorrencias: '' };
        this._rdoData.atividades[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-atv-add]')?.addEventListener('click', () => {
      if (!this._rdoData.atividades) this._rdoData.atividades = [];
      this._rdoData.atividades.push({ area: '', descricao: '', pctConcluida: 0, ocorrencias: '' });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-atv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.atividades.splice(parseInt(btn.dataset.rdoAtvRemove), 1);
        rerender();
      });
    });

    // Fotos — upload e remover
    const fotoInput = document.getElementById('rdoFotoInput');
    const fotoBtn = document.getElementById('rdoFotoBtn');
    if (fotoBtn && fotoInput) {
      fotoBtn.addEventListener('click', () => fotoInput.click());
      fotoInput.addEventListener('change', async () => {
        if (!fotoInput.files || fotoInput.files.length === 0) return;
        const legenda = document.getElementById('rdoFotoLegenda')?.value || '';
        try {
          showToast(`Enviando ${fotoInput.files.length} foto(s)...`, 'info');
          await Store.uploadRdoFoto(contractId, rdoOriginal.id, fotoInput.files, legenda);
          // atualiza rdoOriginal local
          const freshContract = Store.getContractById(contractId);
          const freshRdo = (freshContract.rdos || []).find(r => r.id === rdoOriginal.id);
          Object.assign(rdoOriginal, freshRdo);
          rerender();
          showToast('Fotos enviadas!', 'success');
        } catch (err) {
          showToast(err.message || 'Erro no upload', 'error');
        } finally {
          fotoInput.value = '';
        }
      });
    }
    overlay.querySelectorAll('.btn-rdo-foto-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover esta foto?')) return;
        try {
          await Store.deleteRdoFoto(contractId, rdoOriginal.id, btn.dataset.id);
          const freshContract = Store.getContractById(contractId);
          const freshRdo = (freshContract.rdos || []).find(r => r.id === rdoOriginal.id);
          Object.assign(rdoOriginal, freshRdo);
          rerender();
          showToast('Foto removida.', 'success');
        } catch (err) {
          showToast(err.message || 'Erro ao remover', 'error');
        }
      });
    });
  },

  async deleteRdo(contractId, rdoId) {
    const contract = Store.getContractById(contractId);
    const rdo = (contract.rdos || []).find(r => r.id === rdoId);
    if (!rdo) return;
    if (!confirm(`Excluir RDO #${rdo.numero} de ${rdo.data}? Todas as fotos também serão removidas.`)) return;
    try {
      await Store.deleteRdo(contractId, rdoId);
      showToast('RDO excluído.', 'success');
      this.render({ id: contractId });
    } catch (err) {
      showToast(err.message || 'Erro ao excluir', 'error');
    }
  },
  });
})();
