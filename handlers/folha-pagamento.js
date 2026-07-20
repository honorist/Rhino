'use strict';
/**
 * @file Handlers da Folha de Pagamento — gerar/consultar a folha do mês, pagar e
 * estornar as parcelas (vale/saldo), lançar descontos e proventos, e limpar as
 * linhas não pagas de uma competência. Extraído do server.js (desmembramento).
 *
 * As regras PURAS (vale 40%, 5º dia útil, faixas de INSS) moram em lib/folha.js,
 * com testes em test/folha.test.js — aqui fica só HTTP + orquestração.
 * A extração das regras foi validada por equivalência contra a implementação
 * anterior: 21 anos de feriados, 252 competências e ~32k salários, zero divergência.
 *
 * Pagar/estornar é espelhado nas Contas a Pagar vinculadas (folha ↔ conta); o
 * caminho inverso (pagar pela tela de Contas a Pagar) vive em handlers/contas-pagar.js.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money'); // dinheiro 2 casas — contém drift de float
// Desestruturado, e NÃO guardado numa const `folha`: várias funções deste
// arquivo declaram `const folha = await repos.folhaPagamento...` no próprio
// corpo. Uma const de módulo com esse nome fica sombreada pelo bloco inteiro,
// e qualquer uso antes da declaração local cai na temporal dead zone —
// `ReferenceError` em runtime, invisível para lint e para node --check.
const { quintoDiaUtil, calcInss, calcVale } = require('../lib/folha');

// POST /api/folha-pagamento/gerar — gera as linhas de folha do mês (idempotente).
async function handleGerarFolha(body, res) {
  try {
    const competencia = (body && body.competencia) || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const [ano, mes] = competencia.split('-').map(Number);
    const ultimoDia = String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
    const dataRef = `${competencia}-${ultimoDia}`;
    const vencimentoSaldo = quintoDiaUtil(competencia); // saldo vence no 5º dia útil

    const recursos = await repos.recursos.findAll();
    const funcs = recursos.filter((r) => r.status === 'funcionario' && parseFloat(r.salario) > 0);
    const jaTem = new Set(
      (await repos.folhaPagamento.findByCompetencia(competencia)).map((f) => f.recursoId)
    );

    let criadas = 0;
    for (const r of funcs) {
      if (jaTem.has(r.id)) continue;
      const salario = parseFloat(r.salario) || 0;
      const contractId = (r.alocacaoAtual && r.alocacaoAtual.contractId) || null;
      const elegivel = !!r.elegivelVale;
      const valorVale = calcVale(salario, elegivel);
      // Descontos automáticos de todo colaborador — INSS e contribuição
      // sindical. Já entram no saldo; viram itens editáveis/removíveis.
      const inssAuto = calcInss(salario);
      const sindicalAuto = Math.round(Math.min(salario * 0.02, 70) * 100) / 100;
      const valorSaldo = Math.round((salario - valorVale - inssAuto - sindicalAuto) * 100) / 100;

      // Sede (sem contrato) → o salário vira um item BASE (rastreável, rateável).
      const baseItemId = contractId ? null : generateId('bas');

      const folhaRow = {
        id: generateId('flh'),
        recursoId: r.id,
        recursoNome: r.nome || '',
        competencia,
        salarioBase: salario,
        elegivelVale: elegivel,
        contractId,
        baseItemId,
        valorVale,
        valorSaldo,
        valePago: false,
        valeDataPagamento: null,
        valeCaixaEntryId: null,
        saldoPago: false,
        saldoDataPagamento: null,
        saldoCaixaEntryId: null,
        observacoes: contractId ? '' : 'Despesa da Sede (BASE)',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // O base_item da Sede precisa existir ANTES da linha de folha: a FK
      // folha_pagamento.base_item_id → base_items(id) exige o pai primeiro.
      if (baseItemId) {
        await repos.baseItems.create({
          id: baseItemId,
          description: `Salário ${r.nome || ''} — ${competencia}`,
          type: 'salario',
          value: salario,
          date: dataRef,
          notes: `Folha de pagamento ${competencia}`,
          metadata: JSON.stringify({ origem: 'folha', recursoId: r.id, competencia }),
        });
      }
      try {
        await repos.folhaPagamento.create(folhaRow);
      } catch (e) {
        // Folha não "pegou" — remove o base_item órfão recém-criado.
        if (baseItemId) await repos.baseItems.removeById(baseItemId).catch(() => {});
        if (e && e.code === '23505') continue; // já existe (corrida) — idempotente
        throw e;
      }

      // Contas a Pagar vinculadas — saldo vence no 5º dia útil do mês seguinte,
      // vale (se houver) no dia 20. Pagar/estornar é sincronizado (folha ↔ conta).
      const catConta = contractId ? 'mao_de_obra' : 'base';
      const contasPatch = {};
      const saldoContaId = generateId('cp');
      await repos.contasPagar.create({
        id: saldoContaId,
        descricao: `Saldo salário ${r.nome || ''} — ${competencia}`,
        valor: valorSaldo,
        dataEmissao: dataRef,
        dataVencimento: vencimentoSaldo,
        status: 'pendente',
        contractId,
        category: catConta,
        observacoes: 'Gerado pela Folha de Pagamento',
        folhaPagamentoId: folhaRow.id,
        folhaParcela: 'saldo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      contasPatch.saldoContaPagarId = saldoContaId;
      if (elegivel && valorVale > 0) {
        const valeContaId = generateId('cp');
        await repos.contasPagar.create({
          id: valeContaId,
          descricao: `Vale salário ${r.nome || ''} — ${competencia}`,
          valor: valorVale,
          dataEmissao: dataRef,
          dataVencimento: `${competencia}-20`,
          status: 'pendente',
          contractId,
          category: catConta,
          observacoes: 'Gerado pela Folha de Pagamento (vale 40%)',
          folhaPagamentoId: folhaRow.id,
          folhaParcela: 'vale',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        contasPatch.valeContaPagarId = valeContaId;
      }
      await repos.folhaPagamento.updateById(folhaRow.id, contasPatch);

      // Lançamentos de desconto automáticos (INSS e sindical) — itens normais,
      // que o usuário pode editar ou remover depois na tela de Lançamentos.
      for (const auto of [
        { descricao: 'INSS', valor: inssAuto },
        { descricao: 'Contribuição sindical', valor: sindicalAuto },
      ]) {
        if (auto.valor > 0) {
          await repos.folhaPagamentoItens.create({
            id: generateId('fli'),
            folhaPagamentoId: folhaRow.id,
            tipo: 'desconto',
            descricao: auto.descricao,
            valor: auto.valor,
            createdAt: new Date().toISOString(),
          });
        }
      }
      criadas++;
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    sendJson(res, { competencia, criadas, folha });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// GET /api/folha-pagamento?competencia=YYYY-MM
async function handleGetFolha(query, res) {
  try {
    const competencia = (query && query.competencia) || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    // Anexa os lançamentos (descontos/proventos) de cada linha, em lote (sem N+1).
    if (folha.length) {
      const itens = await repos.folhaPagamentoItens.findByFolhaIds(folha.map((f) => f.id));
      const porFolha = new Map();
      for (const it of itens) {
        if (!porFolha.has(it.folhaPagamentoId)) porFolha.set(it.folhaPagamentoId, []);
        porFolha.get(it.folhaPagamentoId).push(it);
      }
      for (const f of folha) f.itens = porFolha.get(f.id) || [];
    }
    sendJson(res, { competencia, folha });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// Recalcula o Saldo de uma linha de folha a partir dos lançamentos:
// Saldo = (salário − vale) + Σproventos − Σdescontos. Sincroniza a conta a pagar.
async function recalcularSaldoFolha(folhaId) {
  const f = await repos.folhaPagamento.findById(folhaId);
  if (!f) return null;
  const itens = await repos.folhaPagamentoItens.findByFolha(folhaId);
  let proventos = 0,
    descontos = 0;
  for (const it of itens) {
    const v = parseFloat(it.valor) || 0;
    if (it.tipo === 'provento') proventos += v;
    else if (it.tipo === 'desconto') descontos += v;
  }
  const saldoBase = (parseFloat(f.salarioBase) || 0) - (parseFloat(f.valorVale) || 0);
  // money.round2 trata casos que Math.round(*100)/100 erra (ex.: 2.005 → 2.01).
  const novoSaldo = money.round2(saldoBase + proventos - descontos);
  const atualizada = await repos.folhaPagamento.updateById(folhaId, {
    valorSaldo: novoSaldo,
    updatedAt: new Date().toISOString(),
  });
  // Mantém a conta a pagar do Saldo coerente com o novo valor.
  if (f.saldoContaPagarId) {
    await repos.contasPagar
      .updateById(f.saldoContaPagarId, {
        valor: novoSaldo,
        updatedAt: new Date().toISOString(),
      })
      .catch((e) =>
        console.error(
          '[folha] falha ao sincronizar conta do saldo',
          f.saldoContaPagarId,
          e && e.message
        )
      );
  }
  return atualizada;
}

// POST /api/folha-pagamento/:id/itens — lança um desconto ou provento.
async function handleAddFolhaItem(id, body, res) {
  try {
    const tipo = body && body.tipo;
    if (tipo !== 'desconto' && tipo !== 'provento') {
      return sendError(res, 400, "Campo 'tipo' deve ser 'desconto' ou 'provento'");
    }
    const descricao = String((body && body.descricao) || '').trim();
    if (!descricao) return sendError(res, 400, 'Informe a descrição do lançamento');
    const valor = money.parse(body && body.valor);
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');

    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de lançar descontos/proventos');
        e.statusCode = 400;
        throw e;
      }
      await repos.folhaPagamentoItens.create({
        id: generateId('fli'),
        folhaPagamentoId: id,
        tipo,
        descricao,
        valor,
        createdAt: new Date().toISOString(),
      });
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// DELETE /api/folha-pagamento/:id/itens/:itemId — remove um lançamento.
async function handleRemoveFolhaItem(id, itemId, res) {
  try {
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400;
        throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado');
        e.statusCode = 404;
        throw e;
      }
      await repos.folhaPagamentoItens.removeById(itemId);
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// PUT /api/folha-pagamento/:id/itens/:itemId — edita o valor de um lançamento.
async function handleUpdateFolhaItem(id, itemId, body, res) {
  try {
    const valor = money.parse(body && body.valor);
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400;
        throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado');
        e.statusCode = 404;
        throw e;
      }
      await repos.folhaPagamentoItens.updateById(itemId, { valor });
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/:id/pagar — paga uma parcela (vale|saldo).
async function handlePagarFolhaParcela(id, body, res) {
  try {
    const parcela = body && body.parcela;
    if (parcela !== 'vale' && parcela !== 'saldo') {
      return sendError(res, 400, "Campo 'parcela' deve ser 'vale' ou 'saldo'");
    }
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (parcela === 'vale' && f.valePago) {
        const e = new Error('Vale já foi pago');
        e.statusCode = 400;
        throw e;
      }
      if (parcela === 'saldo' && f.saldoPago) {
        const e = new Error('Saldo já foi pago');
        e.statusCode = 400;
        throw e;
      }
      const valor = parcela === 'vale' ? parseFloat(f.valorVale) : parseFloat(f.valorSaldo);
      if (!(valor > 0)) {
        const e = new Error('Esta parcela não tem valor a pagar');
        e.statusCode = 400;
        throw e;
      }

      const dataPagamento = (body && body.dataPagamento) || new Date().toISOString().split('T')[0];
      const label = parcela === 'vale' ? 'Vale' : 'Saldo';
      const caixaEntry = {
        id: generateId('cxa'),
        type: 'saida',
        description:
          `${label} salário ${f.recursoNome} — ${f.competencia}` +
          (body && body.formaPagamento ? ` [${body.formaPagamento}]` : ''),
        value: valor,
        date: dataPagamento,
        contractId: f.contractId || null,
        baseItemId: f.baseItemId || null,
        category: f.contractId ? 'mao_de_obra' : 'base',
        notes: `Folha de pagamento ${f.competencia} — ${label}`,
        formaPagamento: (body && body.formaPagamento) || null,
        folhaPagamentoId: f.id,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      const patch =
        parcela === 'vale'
          ? {
              valePago: true,
              valeDataPagamento: dataPagamento,
              valeCaixaEntryId: caixaEntry.id,
              updatedAt: new Date().toISOString(),
            }
          : {
              saldoPago: true,
              saldoDataPagamento: dataPagamento,
              saldoCaixaEntryId: caixaEntry.id,
              updatedAt: new Date().toISOString(),
            };
      const atualizada = await repos.folhaPagamento.updateById(id, patch);
      // Sincroniza a conta a pagar vinculada — paga junto, mesmo lançamento de caixa.
      const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
      if (contaId) {
        await repos.contasPagar
          .updateById(contaId, {
            status: 'pago',
            dataPagamento,
            valorPago: valor,
            caixaEntryId: caixaEntry.id,
            formaPagamento: (body && body.formaPagamento) || null,
            updatedAt: new Date().toISOString(),
          })
          .catch(() => {});
      }
      return atualizada;
    });
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/:id/estornar — estorna uma parcela (vale|saldo).
async function handleEstornarFolhaParcela(id, body, res) {
  try {
    const parcela = body && body.parcela;
    if (parcela !== 'vale' && parcela !== 'saldo') {
      return sendError(res, 400, "Campo 'parcela' deve ser 'vale' ou 'saldo'");
    }
    // FIX: estorno agora usa transação + advisory lock (igual ao pagar) + guard "já pago"
    // — antes era sem lock/transação, permitindo estorno duplo concorrente (caixa divergia da folha).
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      const jaPago = parcela === 'vale' ? f.valePago : f.saldoPago;
      if (!jaPago) {
        const e = new Error('Esta parcela não está paga — nada a estornar');
        e.statusCode = 400;
        throw e;
      }
      const caixaEntryId = parcela === 'vale' ? f.valeCaixaEntryId : f.saldoCaixaEntryId;
      if (caixaEntryId) await repos.caixa.removeById(caixaEntryId);
      const patch =
        parcela === 'vale'
          ? {
              valePago: false,
              valeDataPagamento: null,
              valeCaixaEntryId: null,
              updatedAt: new Date().toISOString(),
            }
          : {
              saldoPago: false,
              saldoDataPagamento: null,
              saldoCaixaEntryId: null,
              updatedAt: new Date().toISOString(),
            };
      const atualizada = await repos.folhaPagamento.updateById(id, patch);
      // Sincroniza a conta a pagar vinculada — volta a pendente.
      const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
      if (contaId) {
        await repos.contasPagar
          .updateById(contaId, {
            status: 'pendente',
            dataPagamento: null,
            valorPago: null,
            caixaEntryId: null,
            updatedAt: new Date().toISOString(),
          })
          .catch((e) =>
            console.error(
              '[folha-estorno] falha ao sincronizar conta a pagar',
              contaId,
              e && e.message
            )
          );
      }
      return atualizada;
    });
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/limpar — remove os registros NÃO pagos da competência
// (e suas contas a pagar pendentes). Linhas com vale ou saldo já pago são mantidas.
async function handleLimparFolha(body, res) {
  try {
    const competencia = (body && body.competencia) || '';
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    let removidas = 0,
      mantidas = 0;
    for (const f of folha) {
      if (f.valePago || f.saldoPago) {
        mantidas++;
        continue;
      } // tem pagamento — preserva
      // Contas a pagar vinculadas (ainda pendentes) — removidas junto.
      for (const cpId of [f.valeContaPagarId, f.saldoContaPagarId]) {
        if (cpId)
          await repos.contasPagar
            .removeById(cpId)
            .catch((e) =>
              console.error('[limpar-folha] falha ao remover conta', cpId, e && e.message)
            );
      }
      // Ordem: folha_pagamento antes do base_item (FK base_item_id).
      await repos.folhaPagamento.removeById(f.id);
      if (f.baseItemId)
        await repos.baseItems
          .removeById(f.baseItemId)
          .catch((e) =>
            console.error('[limpar-folha] falha ao remover base item', f.baseItemId, e && e.message)
          );
      removidas++;
    }
    const restante = await repos.folhaPagamento.findByCompetencia(competencia);
    sendJson(res, { competencia, removidas, mantidas, folha: restante });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleGerarFolha,
  handleGetFolha,
  handleAddFolhaItem,
  handleRemoveFolhaItem,
  handleUpdateFolhaItem,
  handlePagarFolhaParcela,
  handleEstornarFolhaParcela,
  handleLimparFolha,
};
