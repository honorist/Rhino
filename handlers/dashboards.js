'use strict';
/**
 * @file Dashboards — o painel financeiro (handleDashboard: saldo de caixa,
 * projeção de fluxo, margem por contrato, NFs e contas a pagar) e o painel
 * operacional (handleDashboardOperacional: KPIs de frota/combustível, compras,
 * recrutamento, folha, estoque, com comparativo mês atual × anterior). Inclui os
 * layouts de dashboard por usuário (preferências). Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * handleDashboard responde via res.writeHead/res.end cru (mantido como estava);
 * o resto usa sendJson/sendError. Cada query do operacional tem fallback via
 * safe() — a ausência de uma tabela nunca derruba o painel inteiro.
 */
const db = require('../db');
const repos = require('../db/repos');
const money = require('../lib/money');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

// KPIs operacionais (frota/combustível, compras, recrutamento, folha, estoque)
// com comparação mês atual × mês anterior. Endpoint leve e dedicado — o Dashboard
// carrega em paralelo (não infla o handleDashboard financeiro). Auth via /api/*.
async function handleDashboardOperacional(res) {
  const db = require('../db');
  const safe = async (fn, fallback) => {
    try {
      return (await fn()) || fallback;
    } catch (e) {
      console.error('[dash-op]', e.message);
      return fallback;
    }
  };
  const MES_ATUAL = `data >= date_trunc('month', CURRENT_DATE)`;
  const MES_ANT = `data >= date_trunc('month', CURRENT_DATE - interval '1 month') AND data < date_trunc('month', CURRENT_DATE)`;

  const [
    comb,
    topCombustivel,
    manut,
    compras,
    vagas,
    candidatos,
    folha,
    estoqueValor,
    estoqueMin,
    manutEquip,
    docsKpi,
    propostasKpi,
    candidatosParados,
    revisoes,
    folgasKpi,
    comprasParadas,
  ] = await Promise.all([
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(valor_total) FILTER (WHERE ${MES_ATUAL}),0)::float AS mes_atual,
               COALESCE(SUM(valor_total) FILTER (WHERE ${MES_ANT}),0)::float AS mes_anterior,
               COALESCE(SUM(litros) FILTER (WHERE ${MES_ATUAL}),0)::float AS litros_atual,
               COALESCE(SUM(litros) FILTER (WHERE ${MES_ANT}),0)::float AS litros_anterior
        FROM veiculo_abastecimentos`),
      { mesAtual: 0, mesAnterior: 0, litrosAtual: 0, litrosAnterior: 0 }
    ),
    safe(
      () =>
        db.getMany(`
        SELECT v.placa, v.modelo, COALESCE(SUM(a.valor_total),0)::float AS total, COALESCE(SUM(a.litros),0)::float AS litros
        FROM veiculo_abastecimentos a JOIN veiculos v ON v.id = a.veiculo_id
        WHERE a.data >= date_trunc('month', CURRENT_DATE)
        GROUP BY v.id, v.placa, v.modelo ORDER BY total DESC LIMIT 5`),
      []
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(custo) FILTER (WHERE ${MES_ATUAL}),0)::float AS mes_atual,
               COALESCE(SUM(custo) FILTER (WHERE ${MES_ANT}),0)::float AS mes_anterior
        FROM veiculo_manutencoes`),
      { mesAtual: 0, mesAnterior: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (WHERE status IN ('pendente_avaliacao','pendente_aprovacao'))::int AS abertas,
               COALESCE(SUM(valor_total) FILTER (WHERE status IN ('pendente_avaliacao','pendente_aprovacao')),0)::float AS valor_aberto,
               COALESCE(SUM(valor_total) FILTER (WHERE status='aprovada' AND aprovado_em >= date_trunc('month', CURRENT_DATE)),0)::float AS comprado_atual,
               COALESCE(SUM(valor_total) FILTER (WHERE status='aprovada' AND aprovado_em >= date_trunc('month', CURRENT_DATE - interval '1 month') AND aprovado_em < date_trunc('month', CURRENT_DATE)),0)::float AS comprado_anterior
        FROM solicitacoes_compra`),
      { abertas: 0, valorAberto: 0, compradoAtual: 0, compradoAnterior: 0 }
    ),
    safe(
      () =>
        db.getOne(
          `SELECT COALESCE(SUM(GREATEST(qtd_total - qtd_preenchida,0)),0)::int AS abertas FROM vagas`
        ),
      { abertas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (WHERE status IN ('contatado','interessado'))::int AS em_andamento,
               COUNT(*) FILTER (WHERE status='aprovado')::int AS aprovados FROM candidatos`),
      { emAndamento: 0, aprovados: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(valor_vale + valor_saldo) FILTER (WHERE competencia = to_char(CURRENT_DATE,'YYYY-MM')),0)::float AS custo_atual,
               COALESCE(SUM(valor_vale + valor_saldo) FILTER (WHERE competencia = to_char(CURRENT_DATE - interval '1 month','YYYY-MM')),0)::float AS custo_anterior,
               COALESCE(SUM((CASE WHEN NOT vale_pago THEN valor_vale ELSE 0 END) + (CASE WHEN NOT saldo_pago THEN valor_saldo ELSE 0 END)) FILTER (WHERE competencia = to_char(CURRENT_DATE,'YYYY-MM')),0)::float AS pendente_atual
        FROM folha_pagamento`),
      { custoAtual: 0, custoAnterior: 0, pendenteAtual: 0 }
    ),
    safe(
      () =>
        db.getOne(
          `SELECT COALESCE(SUM(s.quantidade * i.custo_medio),0)::float AS valor FROM estoque_saldo s JOIN itens_estoque i ON i.id = s.item_id`
        ),
      { valor: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*)::int AS abaixo FROM (
          SELECT i.id FROM itens_estoque i LEFT JOIN estoque_saldo s ON s.item_id = i.id
          WHERE i.ativo = TRUE AND i.estoque_minimo > 0
          GROUP BY i.id, i.estoque_minimo HAVING COALESCE(SUM(s.quantidade),0) < i.estoque_minimo) t`),
      { abaixo: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('solicitada','pendente_aprovacao','aprovada'))::int AS em_aberto,
          COUNT(*) FILTER (WHERE status = 'solicitada')::int AS a_avaliar,
          COUNT(*) FILTER (WHERE status = 'aprovada')::int AS em_manutencao,
          COUNT(*) FILTER (WHERE status = 'aprovada'
            AND data_retorno_prevista IS NOT NULL
            AND data_retorno_prevista < CURRENT_DATE
            AND data_retorno IS NULL)::int AS atrasadas
        FROM manutencoes`),
      { emAberto: 0, aAvaliar: 0, emManutencao: 0, atrasadas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        WITH ds AS (
          SELECT NULLIF(doc.val->>'uploadedAt', '')::timestamptz
                   + (t.periodicidade_meses || ' months')::interval AS vence_em
          FROM recursos r,
               jsonb_each(r.documentos) AS doc(tipo, val),
               doc_templates t
          WHERE r.status = 'funcionario'
            AND r.documentos IS NOT NULL
            AND r.documentos != '{}'::jsonb
            AND t.id = doc.tipo
            AND t.periodicidade_meses IS NOT NULL
            AND (doc.val->>'uploadedAt') IS NOT NULL
        )
        SELECT
          COUNT(*) FILTER (WHERE vence_em < NOW())::int AS vencidos,
          COUNT(*) FILTER (WHERE vence_em BETWEEN NOW() AND NOW() + interval '30 days')::int AS vencendo_30d
        FROM ds`),
      { vencidos: 0, vencendo30d: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('rascunho','enviada'))::int AS em_andamento,
          COALESCE(SUM(valor_total) FILTER (WHERE status IN ('rascunho','enviada')), 0)::float AS valor_em_andamento,
          CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE status = 'aceita')::float / COUNT(*) * 100)::numeric, 0)
            ELSE 0 END::int AS taxa_conversao
        FROM propostas`),
      { emAndamento: 0, valorEmAndamento: 0, taxaConversao: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (
          WHERE status IN ('contatado','interessado')
            AND updated_at < NOW() - interval '7 days'
        )::int AS parados
        FROM candidatos`),
      { parados: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(DISTINCT veiculo_id)::int AS vencidas
        FROM veiculo_planos
        WHERE ativo = TRUE
          AND intervalo_meses IS NOT NULL
          AND ultima_data IS NOT NULL
          AND (ultima_data + (intervalo_meses || ' months')::interval)::date < CURRENT_DATE`),
      { vencidas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(DISTINCT r.id)::int AS proximas_5d
        FROM recursos r
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.folgas, '[]'::jsonb)) AS f
        WHERE r.status = 'funcionario'
          AND NULLIF(f->>'dataInicio', '')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 5`),
      { proximas5d: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pendente_avaliacao')::int AS em_avaliacao,
          COUNT(*) FILTER (WHERE status = 'pendente_avaliacao'
            AND updated_at < NOW() - interval '3 days')::int AS paradas_3d
        FROM solicitacoes_compra`),
      { emAvaliacao: 0, paradas3d: 0 }
    ),
  ]);

  sendJson(res, {
    combustivel: {
      mesAtual: comb.mesAtual,
      mesAnterior: comb.mesAnterior,
      litrosAtual: comb.litrosAtual,
      litrosAnterior: comb.litrosAnterior,
    },
    topCombustivel,
    manutencao: { mesAtual: manut.mesAtual, mesAnterior: manut.mesAnterior },
    compras: {
      abertas: compras.abertas,
      valorAberto: compras.valorAberto,
      compradoAtual: compras.compradoAtual,
      compradoAnterior: compras.compradoAnterior,
    },
    recrutamento: {
      vagasAbertas: vagas.abertas,
      candidatosEmAndamento: candidatos.emAndamento,
      candidatosAprovados: candidatos.aprovados,
    },
    folha: {
      custoAtual: folha.custoAtual,
      custoAnterior: folha.custoAnterior,
      pendente: folha.pendenteAtual,
    },
    estoque: { valor: estoqueValor.valor, abaixoMinimo: estoqueMin.abaixo },
    manutEquip: {
      emAberto: manutEquip.emAberto,
      aAvaliar: manutEquip.aAvaliar,
      emManutencao: manutEquip.emManutencao,
      atrasadas: manutEquip.atrasadas,
    },
    docsKpi: { vencidos: docsKpi.vencidos, vencendo30d: docsKpi.vencendo30d },
    propostasKpi: {
      emAndamento: propostasKpi.emAndamento,
      valorEmAndamento: propostasKpi.valorEmAndamento,
      taxaConversao: propostasKpi.taxaConversao,
    },
    candidatosParados: candidatosParados.parados,
    revisoes: { vencidas: revisoes.vencidas },
    folgasKpi: { proximas5d: folgasKpi.proximas5d },
    comprasParadas: {
      emAvaliacao: comprasParadas.emAvaliacao,
      paradas3d: comprasParadas.paradas3d,
    },
  });
}

async function handleDashboard(res, query) {
  try {
    const [contracts, caixaEntries, baseItems, notasFiscaisRows] = await Promise.all([
      repos.contracts.getEnvelope(),
      repos.caixa.findAll(),
      repos.baseItems.findAll(),
      repos.notasFiscais.findAll(),
    ]);
    const caixa = { entries: caixaEntries };
    const base = { items: baseItems };
    const notasFiscais = { notas_fiscais: notasFiscaisRows };

    // Janela do gráfico — configurável via ?projDays (30/60/90, default 60, max 180).
    // Controla TANTO o histórico (passado) quanto a projeção (futuro).
    const projDays = Math.min(180, Math.max(7, parseInt(query?.projDays) || 60));

    // Period filter: mes=1-12, ano=YYYY, or modo='ano' for full year
    const hoje = new Date();
    const filtroAno = query && query.ano ? parseInt(query.ano) : null;
    const filtroMes = query && query.mes ? parseInt(query.mes) : null;
    const modoAno = query && query.modo === 'ano';

    // Build period boundaries for caixa filtering
    let periodoInicio = null;
    let periodoFim = null;
    if (filtroAno && filtroMes && !modoAno) {
      periodoInicio = new Date(filtroAno, filtroMes - 1, 1);
      periodoFim = new Date(filtroAno, filtroMes, 0, 23, 59, 59, 999);
    } else if (filtroAno && modoAno) {
      periodoInicio = new Date(filtroAno, 0, 1);
      periodoFim = new Date(filtroAno, 11, 31, 23, 59, 59, 999);
    }

    const activeContracts = contracts.contracts.filter((c) => c.status === 'ativo').length;
    const totalContractValue = contracts.contracts
      .filter((c) => c.status === 'ativo')
      .reduce((sum, c) => sum + c.value, 0);

    const totalSaidas = contracts.saidas.reduce((sum, s) => sum + s.value, 0);

    const totalBaseUnallocated = base.items.reduce((sum, item) => {
      const allocated = (item.allocations || []).reduce((s, a) => s + a.value, 0);
      return sum + (item.value - allocated);
    }, 0);

    // Caixa balance: always total (not filtered by period)
    const caixaBalance = caixa.entries.reduce((sum, e) => {
      return e.type === 'entrada' ? sum + e.value : sum - e.value;
    }, 0);

    const recentCaixaEntries = [...caixa.entries]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);

    const contractsWithMargin = contracts.contracts.map((c) => {
      const cSaidas = contracts.saidas
        .filter((s) => s.contractId === c.id)
        .reduce((sum, s) => sum + s.value, 0);
      const margin = c.value - cSaidas;
      return {
        id: c.id,
        name: c.name,
        client: c.client,
        value: c.value,
        totalSaidas: cSaidas,
        margin: margin,
        marginPct: c.value > 0 ? ((margin / c.value) * 100).toFixed(2) : 0,
        status: c.status,
        endDate: c.endDate,
      };
    });

    // Contratos a vencer nos próximos 30 dias
    const em30dias = new Date(hoje);
    em30dias.setDate(em30dias.getDate() + 30);
    const contratosAVencer = contracts.contracts
      .filter((c) => c.status === 'ativo' && c.endDate)
      .filter((c) => {
        const fim = new Date(c.endDate);
        return fim >= hoje && fim <= em30dias;
      })
      .map((c) => {
        const diasRestantes = Math.floor((new Date(c.endDate) - hoje) / (1000 * 60 * 60 * 24));
        return { ...c, diasRestantes };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    // Histórico de saldo de caixa: adapts to selected period
    const historicoCaixa = [];
    // Pre-sort ascending uma vez; running sum evita O(n×d) re-scan por ponto
    const entriesOrdenadas = [...caixa.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (periodoInicio && periodoFim) {
      if (modoAno) {
        // Month-by-month — running sum O(n + 12)
        let rsSum = 0,
          rsIdx = 0;
        for (let m = 0; m < 12; m++) {
          const fimMes = new Date(filtroAno, m + 1, 0, 23, 59, 59, 999);
          while (
            rsIdx < entriesOrdenadas.length &&
            new Date(entriesOrdenadas[rsIdx].date) <= fimMes
          ) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(m + 1).padStart(2, '0')}-01`,
            saldo: rsSum,
            label: [
              'Jan',
              'Fev',
              'Mar',
              'Abr',
              'Mai',
              'Jun',
              'Jul',
              'Ago',
              'Set',
              'Out',
              'Nov',
              'Dez',
            ][m],
          });
        }
      } else {
        // Day-by-day — running sum O(n + dias)
        const diasNoMes = new Date(filtroAno, filtroMes, 0).getDate();
        let rsSum = 0,
          rsIdx = 0;
        for (let d = 1; d <= diasNoMes; d++) {
          const diaEnd = new Date(filtroAno, filtroMes - 1, d, 23, 59, 59, 999);
          while (
            rsIdx < entriesOrdenadas.length &&
            new Date(entriesOrdenadas[rsIdx].date) <= diaEnd
          ) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(filtroMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            saldo: rsSum,
          });
        }
      }
    } else {
      // Default: últimos N dias (N = projDays). Amostra a cada `histStep` dias
      const histStep = projDays <= 30 ? 1 : projDays <= 60 ? 2 : 3;
      let rsSum = 0,
        rsIdx = 0;
      for (let i = projDays - 1; i >= 0; i -= histStep) {
        const dia = new Date();
        dia.setDate(dia.getDate() - i);
        dia.setHours(23, 59, 59, 999);
        while (rsIdx < entriesOrdenadas.length && new Date(entriesOrdenadas[rsIdx].date) <= dia) {
          const e = entriesOrdenadas[rsIdx++];
          rsSum += e.type === 'entrada' ? e.value : -e.value;
        }
        historicoCaixa.push({
          data: dia.toISOString().split('T')[0],
          saldo: rsSum,
        });
      }
      // Garante que o último ponto seja exatamente HOJE (caso o passo pule)
      if (
        historicoCaixa.length === 0 ||
        historicoCaixa[historicoCaixa.length - 1].data !== new Date().toISOString().split('T')[0]
      ) {
        const hojeFim = new Date();
        hojeFim.setHours(23, 59, 59, 999);
        while (
          rsIdx < entriesOrdenadas.length &&
          new Date(entriesOrdenadas[rsIdx].date) <= hojeFim
        ) {
          const e = entriesOrdenadas[rsIdx++];
          rsSum += e.type === 'entrada' ? e.value : -e.value;
        }
        historicoCaixa.push({ data: new Date().toISOString().split('T')[0], saldo: rsSum });
      }
    }

    // NFs por status (ignora NFs já emitidas)
    const nfsStatus = { vencidas: 0, proximasVencer: 0, noPrazo: 0, emitidas: 0 };
    const hojeStr = new Date().toISOString().split('T')[0];
    const em7Dias = new Date();
    em7Dias.setDate(em7Dias.getDate() + 7);
    const em7DiasStr = em7Dias.toISOString().split('T')[0];
    notasFiscais.notas_fiscais.forEach((nf) => {
      if (nf.emitida) {
        nfsStatus.emitidas++;
        return;
      }
      if (nf.dataLimite < hojeStr) nfsStatus.vencidas++;
      else if (nf.dataLimite <= em7DiasStr) nfsStatus.proximasVencer++;
      else nfsStatus.noPrazo++;
    });

    // Projeção de fluxo de caixa futuro (próximos 90 dias)
    // Pré-computa datas de recebimento uma vez — O(n) — em vez de O(90×2n)
    const _nfsProjMap = new Map();
    for (const nf of notasFiscais.notas_fiscais) {
      if (nf.emitida || !(nf.valor > 0) || !nf.dataLimite) continue;
      const prazo = Number.isFinite(parseInt(nf.prazoRecebimento))
        ? parseInt(nf.prazoRecebimento)
        : 30;
      const dtRec = new Date(nf.dataLimite + 'T12:00:00');
      dtRec.setDate(dtRec.getDate() + prazo);
      const diaStr = dtRec.toISOString().split('T')[0];
      if (!_nfsProjMap.has(diaStr)) _nfsProjMap.set(diaStr, []);
      _nfsProjMap.get(diaStr).push({
        nfId: nf.id,
        numero: nf.numero,
        contractId: nf.contractId,
        valor: nf.valor,
        dataEmissao: nf.dataLimite,
        prazoRecebimento: prazo,
      });
    }

    const projecaoFutura = [];
    for (let i = 1; i <= 90; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasEsperadas = _nfsProjMap.get(diaStr) || [];
      if (entradasEsperadas.length > 0) {
        projecaoFutura.push({
          data: diaStr,
          entradas: entradasEsperadas,
          totalEntradas: entradasEsperadas.reduce((s, e) => s + e.valor, 0),
        });
      }
    }

    // Contas a pagar status
    const contasPagar = { contas: await repos.contasPagar.findAll() };
    const hojeStrCP = new Date().toISOString().split('T')[0];
    const em7DiasStrCP = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })();
    const contasPagarStatus = { vencidas: 0, proximasVencer: 0, pendentes: 0, totalPendente: 0 };
    contasPagar.contas
      .filter((c) => c.status === 'pendente')
      .forEach((c) => {
        contasPagarStatus.pendentes++;
        contasPagarStatus.totalPendente += parseFloat(c.valor) || 0;
        if (c.dataVencimento && c.dataVencimento < hojeStrCP) contasPagarStatus.vencidas++;
        else if (c.dataVencimento && c.dataVencimento <= em7DiasStrCP)
          contasPagarStatus.proximasVencer++;
      });

    const contasVencidasTotal = contasPagar.contas
      .filter((c) => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStrCP)
      .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldoProjetado = [];
    // Recorrências virtuais (BASE items com metadata.recurrence) — ainda não materializadas
    // Idempotência: descarta ocorrências cujo (base_item_id, data) já existe no caixa
    const baseItemsRecorrentes = base.items.filter((b) => b.metadata?.recurrence?.active);
    const caixaPorBaseDate = new Set(
      caixa.entries.filter((e) => e.baseItemId).map((e) => `${e.baseItemId}|${e.date}`)
    );
    const ocorrenciasVirtuais = []; // { data, valor, baseItemId, descricao }
    const addUnits = (d, n, freq) => {
      const x = new Date(d);
      if (freq === 'weekly') x.setDate(x.getDate() + 7 * n);
      else if (freq === 'quarterly') x.setMonth(x.getMonth() + 3 * n);
      else if (freq === 'yearly') x.setFullYear(x.getFullYear() + n);
      else x.setMonth(x.getMonth() + n);
      return x;
    };
    const hojeDt = new Date();
    hojeDt.setHours(0, 0, 0, 0);
    baseItemsRecorrentes.forEach((item) => {
      const rec = item.metadata.recurrence;
      const startD = new Date(rec.startDate + 'T12:00:00');
      const endD = rec.endDate ? new Date(rec.endDate + 'T12:00:00') : null;
      for (let i = 0; i < 1000; i++) {
        const d = addUnits(startD, i, rec.frequency || 'monthly');
        if (endD && d > endD) break;
        if (d > new Date(hojeDt.getTime() + projDays * 86400000)) break;
        if (d < hojeDt) continue;
        const ds = d.toISOString().split('T')[0];
        if (caixaPorBaseDate.has(`${item.id}|${ds}`)) continue; // já materializado
        ocorrenciasVirtuais.push({
          data: ds,
          valor: money.parse(item.value),
          baseItemId: item.id,
          descricao: item.description || '',
        });
      }
    });

    let saldoAcumulado = caixaBalance - contasVencidasTotal;
    // Granularidade da projeção: pontos a cada 3 dias para janelas curtas
    // (≤30d), a cada 7 dias para janelas maiores.
    const step = projDays <= 30 ? 3 : 7;
    for (let i = 1; i <= projDays; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasDia = projecaoFutura.find((p) => p.data === diaStr);
      if (entradasDia) saldoAcumulado += entradasDia.totalEntradas;
      const saidasCP = contasPagar.contas
        .filter((c) => c.status === 'pendente' && c.dataVencimento === diaStr)
        .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
      if (saidasCP > 0) saldoAcumulado -= saidasCP;
      // Saídas virtuais de recorrências BASE
      const saidasVirt = ocorrenciasVirtuais
        .filter((o) => o.data === diaStr)
        .reduce((s, o) => s + o.valor, 0);
      if (saidasVirt > 0) saldoAcumulado -= saidasVirt;
      if (i === 1 || i % step === 0 || i === projDays) {
        saldoProjetado.push({ data: diaStr, saldo: saldoAcumulado });
      }
    }

    const dashboard = {
      activeContracts,
      totalContractValue,
      totalSaidas,
      totalBaseUnallocated,
      caixaBalance,
      recentCaixaEntries,
      contractsWithMargin,
      contratosAVencer,
      historicoCaixa,
      nfsStatus,
      projecaoFutura,
      saldoProjetado,
      projDays,
      contasPagarStatus,
      ocorrenciasVirtuais,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard));
  } catch (e) {
    // FIX A-01: nao expor e.message (mensagens internas do Postgres) ao cliente.
    sendError(res, 500, e.message);
  }
}

// ============ Dashboard layouts (preferências por usuário) ============
async function handleListDashLayouts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const rows = await db.getMany(
      'SELECT id, nome, widgets, is_default FROM dashboard_layouts WHERE user_id = $1 ORDER BY is_default DESC, nome ASC',
      [userId]
    );
    sendJson(res, { layouts: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostDashLayout(req, body, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const id = generateId('dash');
    const widgets = Array.isArray(body.widgets) ? body.widgets : [];
    const row = await db.getOne(
      `INSERT INTO dashboard_layouts (id, user_id, nome, widgets, is_default)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        id,
        userId,
        String(body.nome || 'Layout').slice(0, 60),
        JSON.stringify(widgets),
        body.isDefault === true,
      ]
    );
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutDashLayout(req, id, body, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const widgets = Array.isArray(body.widgets) ? body.widgets : [];
    const row = await db.getOne(
      `UPDATE dashboard_layouts SET nome = $3, widgets = $4, is_default = $5, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [
        id,
        userId,
        String(body.nome || 'Layout').slice(0, 60),
        JSON.stringify(widgets),
        body.isDefault === true,
      ]
    );
    if (!row) return sendError(res, 404, 'Layout não encontrado');
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteDashLayout(req, id, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    await db.query('DELETE FROM dashboard_layouts WHERE id = $1 AND user_id = $2', [id, userId]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleDashboardOperacional,
  handleDashboard,
  handleListDashLayouts,
  handlePostDashLayout,
  handlePutDashLayout,
  handleDeleteDashLayout,
};
