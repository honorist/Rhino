/**
 * Aba: Cronograma — 4 fases padrão (Engenharia, Aquisições, Instalação, Comissionamento).
 * Editável: nome da fase, início, fim, duração em dias.
 * Inclui mini Gantt visual (barras horizontais alinhadas em escala).
 */
(function() {
  function uid() { return 'fase_' + Math.random().toString(36).slice(2, 9); }

  function diasEntre(a, b) {
    if (!a || !b) return 0;
    try {
      const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
      return Math.max(0, Math.round((d2 - d1) / 86400000) + 1);
    } catch { return 0; }
  }

  function render(container, p, onChange) {
    const fases = Array.isArray(p.cronograma) && p.cronograma.length > 0
      ? p.cronograma
      : [
        { id: uid(), fase: 'Engenharia',     inicio: null, fim: null, duracaoDias: 0, ordem: 0 },
        { id: uid(), fase: 'Aquisições',     inicio: null, fim: null, duracaoDias: 0, ordem: 1 },
        { id: uid(), fase: 'Instalação',     inicio: null, fim: null, duracaoDias: 0, ordem: 2 },
        { id: uid(), fase: 'Comissionamento', inicio: null, fim: null, duracaoDias: 0, ordem: 3 },
      ];

    // Calcula range geral para o Gantt
    const datas = fases.flatMap(f => [f.inicio, f.fim]).filter(Boolean).sort();
    const dataMin = datas[0] || null;
    const dataMax = datas[datas.length - 1] || null;
    const totalDias = dataMin && dataMax ? diasEntre(dataMin, dataMax) : 0;

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin:0;color:#1F497D;">Cronograma</h3>
            <p class="text-muted" style="margin:4px 0 0;font-size:13px;">Fases padrão pré-carregadas. Edite, adicione ou remova conforme o escopo.</p>
          </div>
          <button class="btn btn-secondary" id="btnAddFase">+ Adicionar Fase</button>
        </div>

        <div class="table-wrap" style="margin-bottom:24px;">
          <table>
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Fase</th>
                <th style="width:160px;">Início</th>
                <th style="width:160px;">Fim</th>
                <th style="width:110px;">Duração (dias)</th>
                <th style="width:80px;">Ações</th>
              </tr>
            </thead>
            <tbody id="listaCronograma">
              ${fases.map((f, idx) => renderRow(f, idx)).join('')}
            </tbody>
          </table>
        </div>

        ${dataMin && dataMax ? renderGantt(fases, dataMin, dataMax, totalDias) : `
          <div style="text-align:center;padding:24px;color:#94a3b8;border:2px dashed #e2e8f0;border-radius:6px;font-size:13px;">
            Preencha as datas para visualizar o gráfico de Gantt.
          </div>
        `}

        <div class="form-group" style="margin-top:24px;">
          <label class="form-label">Prazo total / observações de execução</label>
          <textarea class="form-control" id="pPrazoExecucao" rows="3" placeholder="Ex: Prazo total de execução: 45 dias úteis a partir da emissão da Ordem de Serviço.">${escapeHtml(p.prazoExecucao || '')}</textarea>
        </div>
      </div>
    `;

    function renderRow(f, idx) {
      return `
        <tr data-idx="${idx}">
          <td style="font-weight:600;color:#64748b;">${idx + 1}</td>
          <td><input type="text" class="form-control fase-nome" data-idx="${idx}" value="${escapeHtml(f.fase || '')}"></td>
          <td><input type="date" class="form-control fase-inicio" data-idx="${idx}" value="${f.inicio || ''}"></td>
          <td><input type="date" class="form-control fase-fim"    data-idx="${idx}" value="${f.fim || ''}"></td>
          <td><input type="number" class="form-control fase-dur" data-idx="${idx}" value="${f.duracaoDias || 0}" min="0"></td>
          <td>
            <button class="btn-fase-del" data-idx="${idx}" title="Remover" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:18px;">×</button>
          </td>
        </tr>
      `;
    }

    function renderGantt(fases, dataMin, dataMax, totalDias) {
      const cores = ['#1F497D', '#4F81BD', '#9BBB59', '#F79646', '#8064A2', '#4BACC6'];
      return `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;background:#f8fafc;">
          <h4 style="margin:0 0 12px;color:#1F497D;font-size:14px;">Visualização do Gantt</h4>
          <div style="font-size:11px;color:#64748b;margin-bottom:8px;display:flex;justify-content:space-between;">
            <span>${escapeHtml(dataMin)}</span>
            <span>${totalDias} dias</span>
            <span>${escapeHtml(dataMax)}</span>
          </div>
          ${fases.map((f, i) => {
            if (!f.inicio || !f.fim) return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:#94a3b8;">
                <div style="width:160px;flex-shrink:0;">${escapeHtml(f.fase)}</div>
                <div style="flex:1;height:24px;background:#e2e8f0;border-radius:4px;position:relative;opacity:.4;">
                  <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:11px;">sem datas</span>
                </div>
              </div>
            `;
            const offset = diasEntre(dataMin, f.inicio) - 1;
            const dur = diasEntre(f.inicio, f.fim);
            const left = totalDias > 0 ? (offset / totalDias * 100) : 0;
            const width = totalDias > 0 ? Math.max((dur / totalDias) * 100, 2) : 100;
            return `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;">
                <div style="width:160px;flex-shrink:0;color:#0f172a;">${escapeHtml(f.fase)}</div>
                <div style="flex:1;height:28px;background:#e2e8f0;border-radius:4px;position:relative;">
                  <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${cores[i % cores.length]};border-radius:4px;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;">
                    ${dur}d
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    const commit = (novos) => onChange({ cronograma: novos });

    container.querySelector('#btnAddFase')?.addEventListener('click', () => {
      const novos = [...fases, { id: uid(), fase: 'Nova fase', inicio: null, fim: null, duracaoDias: 0, ordem: fases.length }];
      commit(novos);
      render(container, { ...p, cronograma: novos }, onChange);
    });

    const updateField = (idx, key, value) => {
      const novos = fases.map((f, i) => {
        if (i !== idx) return f;
        const atualizado = { ...f, [key]: value };
        // Re-calcula duração quando início/fim mudam
        if (key === 'inicio' || key === 'fim') {
          if (atualizado.inicio && atualizado.fim) {
            atualizado.duracaoDias = diasEntre(atualizado.inicio, atualizado.fim);
          }
        }
        return atualizado;
      });
      commit(novos);
      render(container, { ...p, cronograma: novos }, onChange);
    };

    container.querySelectorAll('.fase-nome').forEach(el => {
      let timer;
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => updateField(parseInt(el.dataset.idx, 10), 'fase', el.value), 300);
      });
    });
    container.querySelectorAll('.fase-inicio').forEach(el => {
      el.addEventListener('change', () => updateField(parseInt(el.dataset.idx, 10), 'inicio', el.value || null));
    });
    container.querySelectorAll('.fase-fim').forEach(el => {
      el.addEventListener('change', () => updateField(parseInt(el.dataset.idx, 10), 'fim', el.value || null));
    });
    container.querySelectorAll('.fase-dur').forEach(el => {
      el.addEventListener('change', () => updateField(parseInt(el.dataset.idx, 10), 'duracaoDias', parseInt(el.value, 10) || 0));
    });
    container.querySelectorAll('.btn-fase-del').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx, 10);
        const novos = fases.filter((_, i) => i !== idx).map((f, i) => ({ ...f, ordem: i }));
        commit(novos);
        render(container, { ...p, cronograma: novos }, onChange);
      });
    });

    const prazoEl = container.querySelector('#pPrazoExecucao');
    if (prazoEl) {
      let timer;
      prazoEl.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => onChange({ prazoExecucao: prazoEl.value }), 400);
      });
    }
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'cronograma',
      label: 'Cronograma',
      icon: '📅',
      render,
    });
  }
})();
