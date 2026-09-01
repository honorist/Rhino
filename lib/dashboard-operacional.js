'use strict';
/**
 * @file KPIs operacionais do dashboard (frota/combustível, compras,
 * recrutamento, folha, estoque, manutenção de equipamentos, documentos,
 * propostas, candidatos parados, revisões de frota, folgas, compras paradas)
 * com comparação mês atual × mês anterior. Extraído de
 * handlers/dashboards.js (item 5 do plano async-wandering-kite, seção A) —
 * regra de negócio pura em lib/, handler fica só com sendJson.
 *
 * Cada query tem fallback via safe() — a ausência de uma tabela nunca
 * derruba o painel inteiro.
 */

/**
 * @param {object} db  módulo de acesso a dados (db.getOne/db.getMany)
 * @returns {Promise<object>} payload igual ao que a rota devolvia antes
 */
async function getDashboardOperacional(db) {
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

  return {
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
  };
}

module.exports = { getDashboardOperacional };
