/**
 * Aba: Investimento — tabelas dinâmicas conforme p.tipo (hh / material / ambos).
 * HH:        Cargo / Qtd / Horas / R$/h / Total
 * Material:  Item / Qtd / Unid / R$ unit / Total
 * Ambos:     duas tabelas + subtotais + total
 * Recalcula valor_total automaticamente; sincroniza no contrato vinculado via PUT.
 */
(function() {
  function uid() { return 'inv_' + Math.random().toString(36).slice(2, 9); }
  const fmtBRL = (v) => (window.Store && Store.formatBRL ? Store.formatBRL(v) : 'R$ ' + (v||0).toFixed(2));

  function calcTotalHH(linha) {
    return (parseFloat(linha.qtd) || 0) * (parseFloat(linha.horas) || 0) * (parseFloat(linha.valorHora) || 0);
  }
  function calcTotalMat(linha) {
    return (parseFloat(linha.qtd) || 0) * (parseFloat(linha.valorUnit) || 0);
  }

  function render(container, p, onChange) {
    const tipo = p.tipo || 'ambos';
    const hh  = Array.isArray(p.investimentoHh)  ? p.investimentoHh  : [];
    const mat = Array.isArray(p.investimentoMat) ? p.investimentoMat : [];

    const subtotalHH  = hh.reduce((s, l) => s + calcTotalHH(l), 0);
    const subtotalMat = mat.reduce((s, l) => s + calcTotalMat(l), 0);

    let total;
    if (tipo === 'hh')       total = subtotalHH;
    else if (tipo === 'material') total = subtotalMat;
    else                          total = subtotalHH + subtotalMat;

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin:0;color:#1F497D;">Investimento</h3>
            <p class="text-muted" style="margin:4px 0 0;font-size:13px;">
              Tipo selecionado: <strong>${tipoLabel(tipo)}</strong> · altere em "Dados Gerais" → Tipo se necessário.
            </p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:#64748b;">VALOR TOTAL</div>
            <div style="font-size:24px;font-weight:700;color:#1F497D;">${fmtBRL(total)}</div>
          </div>
        </div>

        ${(tipo === 'hh' || tipo === 'ambos') ? renderTabelaHH(hh, subtotalHH) : ''}
        ${(tipo === 'ambos') ? '<div style="height:24px;"></div>' : ''}
        ${(tipo === 'material' || tipo === 'ambos') ? renderTabelaMat(mat, subtotalMat) : ''}

        <div class="form-group" style="margin-top:24px;">
          <label class="form-label">Condições de Pagamento</label>
          <textarea class="form-control" id="pCondicoesPagto" rows="4">${escapeHtml(p.condicoesPagamento || '')}</textarea>
          <small class="form-hint">Padrão: 20% mobilização / 65% medições / 15% final. Edite conforme negociado.</small>
        </div>
      </div>
    `;

    function tipoLabel(t) { return { hh: 'Mão de Obra (HH)', material: 'Material', ambos: 'HH + Material' }[t] || t; }

    function renderTabelaHH(linhas, subtotal) {
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h4 style="margin:0;color:#1F497D;">Mão de Obra (HH)</h4>
            <button class="btn btn-secondary" id="btnAddHH">+ Adicionar linha</button>
          </div>
          <p class="text-muted" style="margin:0 0 12px;font-size:12px;">
            <strong>HE 50% / 100%</strong> são calculadas automaticamente sobre o valor-hora (50% e 100% de acréscimo) — exibidas para referência mas <strong>NÃO somam no total da proposta</strong>. Hora extra será cobrada via aditivo de contrato.
          </p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cargo / Função</th>
                  <th scope="col" style="width:80px;">Qtd</th>
                  <th scope="col" style="width:90px;">Horas</th>
                  <th scope="col" style="width:120px;">R$ / Hora</th>
                  <th scope="col" style="width:120px;" title="Valor-hora com acréscimo de 50% (referência)">HE 50%</th>
                  <th scope="col" style="width:120px;" title="Valor-hora com acréscimo de 100% (referência)">HE 100%</th>
                  <th scope="col" style="width:140px;">Total (normal)</th>
                  <th scope="col" style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                ${linhas.length === 0 ? `
                  <tr><td colspan="8" style="text-align:center;padding:16px;color:#94a3b8;">Nenhuma linha. Clique em "+ Adicionar linha".</td></tr>
                ` : linhas.map((l, idx) => {
                  const vh = parseFloat(l.valorHora) || 0;
                  const he50 = vh * 1.5;
                  const he100 = vh * 2.0;
                  return `
                  <tr data-idx="${idx}">
                    <td><input type="text" class="form-control hh-cargo" data-idx="${idx}" value="${escapeHtml(l.cargo || '')}" placeholder="Ex: Soldador, Caldeireiro, Ajudante"></td>
                    <td><input type="text" inputmode="numeric" class="form-control prop-input-num hh-qtd" data-idx="${idx}" value="${l.qtd || 0}"></td>
                    <td><input type="text" inputmode="decimal" class="form-control prop-input-num hh-horas" data-idx="${idx}" value="${l.horas || 0}"></td>
                    <td><input type="text" class="form-control prop-input-num brl-input hh-vh" data-idx="${idx}" value="${window.BRLInput.toDisplay(l.valorHora)}" inputmode="decimal"></td>
                    <td style="text-align:right;font-weight:500;color:#f59e0b;background:#fffbeb;" title="Valor-hora + 50% (calculado)">${fmtBRL(he50)}</td>
                    <td style="text-align:right;font-weight:500;color:#dc2626;background:#fef2f2;" title="Valor-hora + 100% (calculado)">${fmtBRL(he100)}</td>
                    <td style="font-weight:600;text-align:right;">${fmtBRL(calcTotalHH(l))}</td>
                    <td><button class="btn-hh-del" data-idx="${idx}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px;">×</button></td>
                  </tr>
                `;}).join('')}
              </tbody>
              ${linhas.length > 0 ? `
                <tfoot>
                  <tr style="background:#f1f5f9;">
                    <td colspan="6" style="text-align:right;font-weight:600;">Subtotal HH (horas normais):</td>
                    <td style="font-weight:700;color:#1F497D;text-align:right;">${fmtBRL(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>
        </div>
      `;
    }

    function renderTabelaMat(linhas, subtotal) {
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;color:#1F497D;">Materiais</h4>
            <button class="btn btn-secondary" id="btnAddMat">+ Adicionar linha</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Item / Descrição</th>
                  <th scope="col" style="width:100px;">Qtd</th>
                  <th scope="col" style="width:80px;">Unid.</th>
                  <th scope="col" style="width:140px;">R$ Unit</th>
                  <th scope="col" style="width:160px;">Total</th>
                  <th scope="col" style="width:50px;"></th>
                </tr>
              </thead>
              <tbody>
                ${linhas.length === 0 ? `
                  <tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8;">Nenhuma linha. Clique em "+ Adicionar linha".</td></tr>
                ` : linhas.map((l, idx) => `
                  <tr data-idx="${idx}">
                    <td><input type="text" class="form-control mat-item" data-idx="${idx}" value="${escapeHtml(l.item || '')}" placeholder="Ex: Tubo AC SCH40 4&quot;"></td>
                    <td><input type="text" inputmode="decimal" class="form-control prop-input-num mat-qtd" data-idx="${idx}" value="${l.qtd || 0}"></td>
                    <td><input type="text" class="form-control mat-unid" data-idx="${idx}" value="${escapeHtml(l.unid || 'un')}" placeholder="un, kg, m"></td>
                    <td><input type="text" class="form-control prop-input-num brl-input mat-vu" data-idx="${idx}" value="${window.BRLInput.toDisplay(l.valorUnit)}" inputmode="decimal"></td>
                    <td style="font-weight:600;text-align:right;">${fmtBRL(calcTotalMat(l))}</td>
                    <td><button class="btn-mat-del" data-idx="${idx}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px;">×</button></td>
                  </tr>
                `).join('')}
              </tbody>
              ${linhas.length > 0 ? `
                <tfoot>
                  <tr style="background:#f1f5f9;">
                    <td colspan="4" style="text-align:right;font-weight:600;">Subtotal Materiais:</td>
                    <td style="font-weight:700;color:#1F497D;text-align:right;">${fmtBRL(subtotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              ` : ''}
            </table>
          </div>
        </div>
      `;
    }

    // ── Eventos ──
    container.querySelector('#btnAddHH')?.addEventListener('click', () => {
      const novos = [...hh, { id: uid(), cargo: '', qtd: 1, horas: 0, valorHora: 0 }];
      onChange({ investimentoHh: novos, valorTotal: recalcTotal(novos, mat) });
      render(container, { ...p, investimentoHh: novos }, onChange);
    });
    container.querySelector('#btnAddMat')?.addEventListener('click', () => {
      const novos = [...mat, { id: uid(), item: '', qtd: 1, unid: 'un', valorUnit: 0 }];
      onChange({ investimentoMat: novos, valorTotal: recalcTotal(hh, novos) });
      render(container, { ...p, investimentoMat: novos }, onChange);
    });

    const bindHH = (cls, key, parse) => {
      container.querySelectorAll(cls).forEach(el => {
        const handler = () => {
          const idx = parseInt(el.dataset.idx, 10);
          const v = parse ? parse(el.value) : el.value;
          const novos = hh.map((l, i) => i === idx ? { ...l, [key]: v } : l);
          onChange({ investimentoHh: novos, valorTotal: recalcTotal(novos, mat) });
          render(container, { ...p, investimentoHh: novos }, onChange);
        };
        if (cls.includes('brl')) {
          el.addEventListener('input', () => { el.value = window.BRLInput.toDisplay(window.BRLInput.parse(el.value)); });
          el.addEventListener('blur', handler);
        } else {
          let timer;
          el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(handler, 400); });
          el.addEventListener('blur', () => { clearTimeout(timer); handler(); });
        }
      });
    };
    const bindMat = (cls, key, parse) => {
      container.querySelectorAll(cls).forEach(el => {
        const handler = () => {
          const idx = parseInt(el.dataset.idx, 10);
          const v = parse ? parse(el.value) : el.value;
          const novos = mat.map((l, i) => i === idx ? { ...l, [key]: v } : l);
          onChange({ investimentoMat: novos, valorTotal: recalcTotal(hh, novos) });
          render(container, { ...p, investimentoMat: novos }, onChange);
        };
        if (cls.includes('brl')) {
          el.addEventListener('input', () => { el.value = window.BRLInput.toDisplay(window.BRLInput.parse(el.value)); });
          el.addEventListener('blur', handler);
        } else {
          let timer;
          el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(handler, 400); });
          el.addEventListener('blur', () => { clearTimeout(timer); handler(); });
        }
      });
    };

    bindHH('.hh-cargo', 'cargo', null);
    bindHH('.hh-qtd',   'qtd',   v => parseFloat(v) || 0);
    bindHH('.hh-horas', 'horas', v => parseFloat(v) || 0);
    bindHH('.hh-vh',    'valorHora', v => window.BRLInput.parse(v));

    bindMat('.mat-item', 'item', null);
    bindMat('.mat-qtd',  'qtd',  v => parseFloat(v) || 0);
    bindMat('.mat-unid', 'unid', null);
    bindMat('.mat-vu',   'valorUnit', v => window.BRLInput.parse(v));

    container.querySelectorAll('.btn-hh-del').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const novos = hh.filter((_, i) => i !== idx);
        onChange({ investimentoHh: novos, valorTotal: recalcTotal(novos, mat) });
        render(container, { ...p, investimentoHh: novos }, onChange);
      });
    });
    container.querySelectorAll('.btn-mat-del').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const novos = mat.filter((_, i) => i !== idx);
        onChange({ investimentoMat: novos, valorTotal: recalcTotal(hh, novos) });
        render(container, { ...p, investimentoMat: novos }, onChange);
      });
    });

    const cpEl = container.querySelector('#pCondicoesPagto');
    if (cpEl) {
      let timer;
      cpEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onChange({ condicoesPagamento: cpEl.value }), 400); });
    }

    function recalcTotal(listaHH, listaMat) {
      const t = (p.tipo === 'hh' ? listaHH.reduce((s,l) => s + calcTotalHH(l), 0)
              : p.tipo === 'material' ? listaMat.reduce((s,l) => s + calcTotalMat(l), 0)
              : listaHH.reduce((s,l) => s + calcTotalHH(l), 0) + listaMat.reduce((s,l) => s + calcTotalMat(l), 0));
      return Math.round(t * 100) / 100;
    }
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'investimento',
      label: 'Investimento',
      icon: '💰',
      render,
    });
  }
})();
