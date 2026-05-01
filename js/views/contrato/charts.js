/* Rhino · ContratoDetail · charts
   Extraído de js/views/ContratoDetail.js (linhas 912-1303)
   Estende o objeto window.ContratoDetail já definido. */
(function () {
  if (!window.ContratoDetail) { console.error('[contrato/charts] requires ContratoDetail core'); return; }
  Object.assign(window.ContratoDetail, {
  renderPizza(dados) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    const canvas = document.getElementById('chartPizzaContrato');
    if (!canvas || typeof Chart === 'undefined') return;

    const _pvv = !window.perfil || typeof window.perfil.podeVerValores !== 'function' || window.perfil.podeVerValores();
    const fmt = v => _pvv ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : 'R$ ●●●●●';

    // Categorias dinâmicas (vêm de realizadoPorTipo que inclui qualquer category lançada)
    const segments = [];
    const cats = dados.categorias || {};
    Object.entries(cats).forEach(([key, value]) => {
      if (value > 0) {
        segments.push({
          label: dados.labelMap ? dados.labelMap[key] : key,
          value: value,
          color: dados.colorMap ? dados.colorMap[key] : '#9CA3AF',
        });
      }
    });
    // Saldo restante = parte do contrato ainda não consumida
    if (dados.saldo > 0) {
      segments.push({ label: 'Saldo Restante', value: dados.saldo, color: '#2E7D52' });
    }

    if (segments.length === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum dado para exibir</p>';
      return;
    }

    const total = segments.reduce((s, seg) => s + seg.value, 0);

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 12
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 14,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 13 },
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            displayColors: true,
            boxWidth: 12,
            boxHeight: 12,
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return `  ${fmt(ctx.parsed)}  (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  renderBarrasOrcado(tipos, orcadoPorTipo, realizadoPorTipo) {
    if (this.chartBarras) { this.chartBarras.destroy(); this.chartBarras = null; }
    const canvas = document.getElementById('chartBarrasOrcado');
    if (!canvas || typeof Chart === 'undefined' || tipos.length === 0) return;

    const TIPOS_LABEL = { mao_de_obra: 'Mão de Obra', material: 'Material', hospedagem: 'Hospedagem', transporte: 'Transporte', base: 'BASE', outros: 'Outros' };

    const labels = tipos.map(t => TIPOS_LABEL[t] || t);
    const orcado = tipos.map(t => orcadoPorTipo[t] || 0);
    const real   = tipos.map(t => realizadoPorTipo[t] || 0);

    const _pvv = !window.perfil || typeof window.perfil.podeVerValores !== 'function' || window.perfil.podeVerValores();
    const fmt = v => _pvv ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : 'R$ ●●●●●';

    this.chartBarras = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Orçado',    data: orcado, backgroundColor: '#6366F1', borderRadius: 4 },
          { label: 'Realizado', data: real,   backgroundColor: '#F59E0B', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 12,
            titleColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#FFFFFF', font: { size: 13 } },
            grid: {
              color: 'rgba(255,255,255,.15)',
              drawOnChartArea: true,
              drawTicks: true,
              offset: true,
              lineWidth: 1
            }
          },
          y: {
            ticks: { callback: v => fmt(v), color: '#FFFFFF', font: { size: 12 } },
            grid: { color: 'rgba(255,255,255,.08)' }
          }
        }
      }
    });
  },

  // Curva S: planejado (linear OU baseado nas etapas do Cronograma) × medido (BMs por mês) × custo realizado
  async renderCurvaS(contract, nfsContrato, saidas, totalBase, totalPassagens, totalCompras) {
    if (this.chartCurvaS) { this.chartCurvaS.destroy(); this.chartCurvaS = null; }
    const canvas = document.getElementById('canvasCurvaS');
    if (!canvas || typeof Chart === 'undefined') return;
    if (!contract.startDate || !contract.endDate || !(contract.value > 0)) return;

    const start = new Date(contract.startDate + 'T12:00:00');
    const end   = new Date(contract.endDate + 'T12:00:00');
    if (isNaN(start) || isNaN(end) || end <= start) return;

    // Busca atividades do contrato — se houver, usa pra montar curva não-linear
    let atividades = [];
    try {
      const r = await fetch(`/api/contracts/${contract.id}/atividades`);
      if (r.ok) atividades = (await r.json()).atividades || [];
    } catch {}
    const usaEtapas = atividades.length > 0
      && atividades.some(a => a.dataInicioPlan && a.dataFimPlan && parseFloat(a.pesoPct) > 0);

    // Gera array de meses: [{ ym: "AAAA-MM", label: "abr/26", date: Date(1ºdia) }]
    const meses = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const fim = new Date(end.getFullYear(), end.getMonth(), 1);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    while (cursor <= fim) {
      const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
      meses.push({ ym, label, date: new Date(cursor) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (meses.length === 0) return;

    const valor = parseFloat(contract.value) || 0;
    const totalMeses = meses.length;

    // Planejado: monta curva acumulada
    let planejadoAcum;
    let fontePlan;
    if (usaEtapas) {
      // ── Curva S real baseada nas etapas do Cronograma ──
      // Para cada etapa, distribui seu peso linearmente entre data_inicio_plan e data_fim_plan.
      // Soma todos os pesos parciais por mês e converte em valor acumulado.
      const pesoPorMes = new Map();
      for (const a of atividades) {
        if (!a.dataInicioPlan || !a.dataFimPlan) continue;
        const peso = parseFloat(a.pesoPct) || 0;
        if (peso <= 0) continue;
        const aIni = new Date(a.dataInicioPlan + 'T12:00:00');
        const aFim = new Date(a.dataFimPlan + 'T12:00:00');
        const durMeses = Math.max(1, ((aFim.getFullYear() - aIni.getFullYear()) * 12) + (aFim.getMonth() - aIni.getMonth()) + 1);
        const pesoPorMesEtapa = peso / durMeses;
        // Distribui entre os meses cobertos
        const c = new Date(aIni.getFullYear(), aIni.getMonth(), 1);
        const f = new Date(aFim.getFullYear(), aFim.getMonth(), 1);
        while (c <= f) {
          const ym = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`;
          pesoPorMes.set(ym, (pesoPorMes.get(ym) || 0) + pesoPorMesEtapa);
          c.setMonth(c.getMonth() + 1);
        }
      }
      // Acumula por mês na ordem dos meses do contrato
      let acum = 0;
      planejadoAcum = meses.map(m => {
        acum += (pesoPorMes.get(m.ym) || 0);
        // Converte % → valor R$
        return valor * Math.min(100, acum) / 100;
      });
      fontePlan = `Curva S real (${atividades.length} etapas do Cronograma)`;
    } else {
      // ── Fallback: distribuição linear ──
      planejadoAcum = meses.map((_, i) => valor * ((i + 1) / totalMeses));
      fontePlan = 'Linear (sem etapas no Cronograma)';
    }

    // Medido: NFs por mês (dataLimite)
    const medidoPorMes = new Map();
    for (const nf of (nfsContrato || [])) {
      if (!nf.dataLimite) continue;
      const d = new Date(nf.dataLimite + 'T12:00:00');
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      medidoPorMes.set(ym, (medidoPorMes.get(ym) || 0) + (parseFloat(nf.valor) || 0));
    }
    let acumMedido = 0;
    const medidoAcum = meses.map(m => {
      acumMedido += medidoPorMes.get(m.ym) || 0;
      // Só desenha até o mês atual (deixa null nos futuros pra linha cortar)
      if (m.date > hoje) return null;
      return acumMedido;
    });

    // Custo realizado por mês: agrega saidas + base proporcional + compras + passagens
    const custoPorMes = new Map();
    for (const s of (saidas || [])) {
      if (!s.date) continue;
      const d = new Date(s.date + 'T12:00:00');
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      custoPorMes.set(ym, (custoPorMes.get(ym) || 0) + (parseFloat(s.value) || 0));
    }
    // Caixa (compras + passagens vinculadas ao contrato)
    const caixaContrato = (Store.state.caixa || []).filter(e => e.contractId === contract.id && e.type === 'saida');
    for (const e of caixaContrato) {
      if (!e.date) continue;
      const d = new Date(e.date + 'T12:00:00');
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      custoPorMes.set(ym, (custoPorMes.get(ym) || 0) + (parseFloat(e.value) || 0));
    }
    let acumCusto = 0;
    const custoAcum = meses.map(m => {
      acumCusto += custoPorMes.get(m.ym) || 0;
      if (m.date > hoje) return null;
      return acumCusto;
    });

    const fmt = (v) => Store.formatBRLk ? Store.formatBRLk(v) : `R$ ${(v / 1000).toFixed(0)}k`;

    this.chartCurvaS = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: meses.map(m => m.label),
        datasets: [
          {
            label: usaEtapas ? 'Planejado (etapas)' : 'Planejado (linear)',
            data: planejadoAcum,
            borderColor: usaEtapas ? '#3b82f6' : '#9CA3AF',
            borderDash: usaEtapas ? [4, 2] : [6, 4],
            backgroundColor: 'transparent',
            tension: usaEtapas ? 0.25 : 0,
            pointRadius: usaEtapas ? 3 : 2,
            borderWidth: 2,
          },
          {
            label: 'Medido (BMs)',
            data: medidoAcum,
            borderColor: '#1D6B3F',
            backgroundColor: 'rgba(29,107,63,.08)',
            tension: 0.25,
            pointRadius: 3,
            borderWidth: 3,
            fill: true,
            spanGaps: false,
          },
          {
            label: 'Custo realizado',
            data: custoAcum,
            borderColor: '#DC2626',
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.parsed.y === null) return null;
                const pct = valor > 0 ? ((ctx.parsed.y / valor) * 100).toFixed(1) : '0';
                return `${ctx.dataset.label}: ${Store.formatBRL(ctx.parsed.y)} (${pct}%)`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => fmt(v) },
            grid: { color: 'rgba(0,0,0,.06)' },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });

    // Atualiza textos da legenda com a fonte usada
    const elFonte = document.getElementById('curvaSFonte');
    const elLeg = document.getElementById('curvaSLegenda');
    if (elFonte) elFonte.textContent = `Acumulado mês a mês — Planejado: ${fontePlan}`;
    if (elLeg) {
      elLeg.innerHTML = usaEtapas
        ? `<strong>Planejado:</strong> curva S real baseada nas etapas do Cronograma (peso × duração) ·
           <strong>Medido:</strong> acumulado dos BMs ·
           <strong>Custo:</strong> saídas + base + compras + passagens
           <div style="margin-top:6px;color:var(--color-success);"><strong>✓ Usando suas etapas do Cronograma.</strong> Edite as etapas pra ajustar a curva.</div>`
        : `<strong>Planejado:</strong> distribuição linear do valor entre início e término ·
           <strong>Medido:</strong> acumulado dos BMs ·
           <strong>Custo:</strong> saídas + base + compras + passagens
           <div style="margin-top:6px;color:#F59E0B;"><strong>💡 Dica:</strong> cadastre etapas na aba <a href="#" onclick="event.preventDefault();window.ContratoDetail._tab='cronograma';window.ContratoDetail.render({id:'${contract.id}'});return false;" style="color:var(--color-primary);font-weight:700;">Cronograma</a> com peso e datas — a curva ficará realista (não-linear).</div>`;
    }
  },

  renderPizzaOrcamento(orcadoPorTipo, totalOrcado) {
    if (this.chartOrcamento) { this.chartOrcamento.destroy(); this.chartOrcamento = null; }
    const canvas = document.getElementById('chartPizzaOrcamento');
    if (!canvas || typeof Chart === 'undefined') return;

    const TIPOS_LABEL = { mao_de_obra: 'Mão de Obra', material: 'Material', hospedagem: 'Hospedagem', transporte: 'Transporte', base: 'BASE', outros: 'Outros' };
    const TIPOS_COLOR = { mao_de_obra: '#7C3AED', material: '#D97706', hospedagem: '#0891B2', transporte: '#059669', base: '#3182CE', outros: '#9CA3AF' };

    const segments = Object.entries(orcadoPorTipo)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, valor]) => ({
        label: TIPOS_LABEL[tipo] || tipo,
        value: valor,
        color: TIPOS_COLOR[tipo] || '#9CA3AF'
      }));

    if (segments.length === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--sp-lg);">Sem itens no orçamento</p>';
      return;
    }

    const _pvv = !window.perfil || typeof window.perfil.podeVerValores !== 'function' || window.perfil.podeVerValores();
    const fmt = v => _pvv ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : 'R$ ●●●●●';

    this.chartOrcamento = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 12,
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const pct = totalOrcado > 0 ? ((ctx.parsed / totalOrcado) * 100).toFixed(1) : 0;
                return `  ${fmt(ctx.parsed)}  (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  });
})();
