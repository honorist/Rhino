/**
 * Aba: Custo Interno (privado) — análise de margem.
 * Categorias: mao_obra, material, equipamento, frete, impostos, bdi, lucro, outros.
 * NUNCA exportado em DOCX/PDF/Preview do cliente.
 */
(function() {
  const CATEGORIAS = [
    { v: 'mao_obra',    l: 'Mão de Obra',  cor: '#3b82f6' },
    { v: 'material',    l: 'Material',     cor: '#10b981' },
    { v: 'equipamento', l: 'Equipamento',  cor: '#f59e0b' },
    { v: 'frete',       l: 'Frete',        cor: '#8b5cf6' },
    { v: 'impostos',    l: 'Impostos',     cor: '#dc2626' },
    { v: 'bdi',         l: 'BDI',          cor: '#06b6d4' },
    { v: 'lucro',       l: 'Lucro',        cor: '#84cc16' },
    { v: 'outros',      l: 'Outros',       cor: '#64748b' },
  ];

  const fmtBRL = (v) => Store.formatBRL(v);

  function render(container, p, onChange) {
    const custos = Array.isArray(p.custos) ? p.custos : [];
    const totalCusto = custos.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const valorTotal = parseFloat(p.valorTotal) || 0;
    const margem = valorTotal - totalCusto;
    const margemPct = valorTotal > 0 ? (margem / valorTotal * 100) : 0;

    const porCategoria = {};
    custos.forEach(c => {
      porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + (parseFloat(c.valor) || 0);
    });

    container.innerHTML = `
      <div class="card" style="padding:24px;">
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;gap:10px;align-items:center;">
          <span style="font-size:24px;">🔒</span>
          <div style="flex:1;font-size:13px;color:#78350f;">
            <strong>Dados confidenciais.</strong> Esta aba é PRIVADA — não aparece no DOCX/PDF/Preview enviado ao cliente nem no Portal do Cliente.
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
          <div class="card" style="padding:16px;background:#f8fafc;">
            <div style="font-size:12px;color:#64748b;">VALOR DA PROPOSTA</div>
            <div style="font-size:22px;font-weight:700;color:#1F497D;margin-top:4px;">${fmtBRL(valorTotal)}</div>
          </div>
          <div class="card" style="padding:16px;background:#f8fafc;">
            <div style="font-size:12px;color:#64748b;">CUSTO TOTAL</div>
            <div style="font-size:22px;font-weight:700;color:#dc2626;margin-top:4px;">${fmtBRL(totalCusto)}</div>
          </div>
          <div class="card" style="padding:16px;background:${margem >= 0 ? '#f0fdf4' : '#fef2f2'};">
            <div style="font-size:12px;color:#64748b;">MARGEM</div>
            <div style="font-size:22px;font-weight:700;color:${margem >= 0 ? '#10b981' : '#dc2626'};margin-top:4px;">${fmtBRL(margem)}</div>
            <div style="font-size:13px;color:${margem >= 0 ? '#059669' : '#b91c1c'};">${margemPct.toFixed(2)}%</div>
          </div>
        </div>

        ${Object.keys(porCategoria).length > 0 ? `
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;background:#f8fafc;">
            <h4 style="margin:0 0 12px;color:#1F497D;font-size:14px;">Composição por Categoria</h4>
            ${Object.entries(porCategoria).map(([cat, val]) => {
              const meta = CATEGORIAS.find(c => c.v === cat) || { l: cat, cor: '#64748b' };
              const pct = totalCusto > 0 ? (val / totalCusto * 100) : 0;
              return `
                <div style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
                    <span>${meta.l}</span>
                    <span><strong>${fmtBRL(val)}</strong> (${pct.toFixed(1)}%)</span>
                  </div>
                  <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${meta.cor};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;color:#1F497D;">Itens de Custo</h3>
          <button class="btn btn-secondary" id="btnAddCusto">+ Adicionar Item</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col">Descrição</th>
                <th scope="col" style="width:160px;">Valor (R$)</th>
                <th scope="col" style="width:120px;">Percentual</th>
                <th scope="col" style="width:60px;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${custos.length === 0 ? `
                <tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8;">
                  Nenhum item de custo. Adicione para calcular margem.
                </td></tr>
              ` : custos.map(c => `
                <tr data-id="${c.id}">
                  <td>
                    <select class="form-control cu-cat" data-id="${c.id}">
                      ${CATEGORIAS.map(opt => `<option value="${opt.v}" ${c.categoria === opt.v ? 'selected' : ''}>${opt.l}</option>`).join('')}
                    </select>
                  </td>
                  <td><input type="text" class="form-control cu-desc" data-id="${c.id}" value="${escapeHtml(c.descricao || '')}"></td>
                  <td><input type="text" class="form-control prop-input-num brl-input cu-val" data-id="${c.id}" value="${window.BRLInput.toDisplay(c.valor)}" inputmode="decimal"></td>
                  <td><input type="text" inputmode="decimal" class="form-control prop-input-num cu-pct" data-id="${c.id}" value="${c.percentual ?? ''}" placeholder="opcional"></td>
                  <td><button class="btn-cu-del" data-id="${c.id}" style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:18px;">×</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Eventos
    container.querySelector('#btnAddCusto')?.addEventListener('click', async () => {
      try {
        const proposta = await Store.criarPropostaCusto(p.id, {
          categoria: 'mao_obra',
          descricao: '',
          valor: 0,
        });
        // Atualiza p.custos local + onChange para re-renderizar
        if (proposta) { p.custos = proposta.custos || []; }
        render(container, p, onChange);
      } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
    });

    container.querySelectorAll('.cu-cat').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        try {
          const proposta = await Store.atualizarPropostaCusto(p.id, id, { categoria: sel.value });
          if (proposta) p.custos = proposta.custos || [];
          render(container, p, onChange);
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
    container.querySelectorAll('.cu-desc').forEach(inp => {
      let timer;
      inp.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const proposta = await Store.atualizarPropostaCusto(p.id, inp.dataset.id, { descricao: inp.value });
            if (proposta) p.custos = proposta.custos || [];
          } catch {}
        }, 500);
      });
    });
    container.querySelectorAll('.cu-val').forEach(inp => {
      inp.addEventListener('input', () => { inp.value = window.BRLInput.toDisplay(window.BRLInput.parse(inp.value)); });
      inp.addEventListener('blur', async () => {
        try {
          const proposta = await Store.atualizarPropostaCusto(p.id, inp.dataset.id, { valor: window.BRLInput.parse(inp.value) });
          if (proposta) p.custos = proposta.custos || [];
          render(container, p, onChange);
        } catch {}
      });
    });
    container.querySelectorAll('.cu-pct').forEach(inp => {
      inp.addEventListener('change', async () => {
        try {
          const v = inp.value === '' ? null : parseFloat(inp.value);
          const proposta = await Store.atualizarPropostaCusto(p.id, inp.dataset.id, { percentual: v });
          if (proposta) p.custos = proposta.custos || [];
        } catch {}
      });
    });
    container.querySelectorAll('.btn-cu-del').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Remover este item de custo?')) return;
        try {
          const proposta = await Store.deletarPropostaCusto(p.id, b.dataset.id);
          if (proposta) p.custos = proposta.custos || [];
          render(container, p, onChange);
        } catch (e) { if (window.showToast) showToast('Erro: ' + e.message, 'error'); }
      });
    });
  }

  if (window.PropostaDetail) {
    window.PropostaDetail.registerTab({
      id: 'custo-interno',
      label: '🔒 Custo Interno',
      icon: '',
      render,
    });
  }
})();
