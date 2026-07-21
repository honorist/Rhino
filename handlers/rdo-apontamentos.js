'use strict';
/**
 * @file Apontamento de HH por colaborador × atividade — sub-recurso do RDO.
 *
 * O RDO segue registrando efetivo por função (JSONB); este handler grava, numa
 * tabela-filha estruturada, quem (recurso) trabalhou quantas horas em qual
 * etapa (atividade) do cronograma. Isso destrava a produtividade da obra: HH
 * previsto por atividade (atividades.hh_plan) × HH realizado (Σ apontamentos).
 *
 * A regra (normalização/validação e o cálculo de produtividade) mora em
 * lib/rdo-apontamento.js; aqui só orquestra HTTP + persistência.
 *
 * O PUT é replace-all do RDO (o form manda o conjunto inteiro): apaga os
 * apontamentos daquele RDO e reinsere os normalizados, sob transação.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { normalizarApontamentos, computeProdutividade } = require('../lib/rdo-apontamento');

/** Confere que o RDO existe e pertence ao contrato. Lança {statusCode}. */
async function _assertRdoDoContrato(contractId, rdoId) {
  const rdo = await repos.rdos.findById(rdoId);
  if (!rdo || rdo.contractId !== contractId) {
    const err = new Error('RDO não encontrado neste contrato');
    err.statusCode = 404;
    throw err;
  }
  return rdo;
}

async function handleListRdoApontamentos(contractId, rdoId, res) {
  try {
    await _assertRdoDoContrato(contractId, rdoId);
    const apontamentos = await repos.rdoApontamentos.findAll({ rdoId });
    sendJson(res, { apontamentos });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

async function handlePutRdoApontamentos(contractId, rdoId, body, res) {
  try {
    await _assertRdoDoContrato(contractId, rdoId);
    const itens = normalizarApontamentos(body && body.apontamentos);

    await db.withTransaction(async (client) => {
      await client.query('DELETE FROM rdo_apontamentos WHERE rdo_id = $1', [rdoId]);
      if (itens.length) {
        const cols = ['id', 'rdo_id', 'contract_id', 'recurso_id', 'atividade_id', 'funcao', 'horas', 'observacoes'];
        const values = [];
        const params = [];
        itens.forEach((it, i) => {
          const base = i * cols.length;
          values.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(', ')})`);
          params.push(
            generateId('apont'),
            rdoId,
            contractId,
            it.recursoId,
            it.atividadeId,
            it.funcao,
            it.horas,
            it.observacoes
          );
        });
        await client.query(
          `INSERT INTO rdo_apontamentos (${cols.join(', ')}) VALUES ${values.join(', ')}`,
          params
        );
      }
    });

    const apontamentos = await repos.rdoApontamentos.findAll({ rdoId });
    sendJson(res, { apontamentos });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** GET /api/contracts/:id/produtividade-hh — HH previsto × realizado por atividade. */
async function handleGetContractProdutividade(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const [atividades, realPorAtividade] = await Promise.all([
      db.getMany(
        `SELECT id, nome, hh_plan FROM atividades WHERE contract_id = $1 ORDER BY ordem ASC, created_at ASC`,
        [contractId]
      ),
      repos.rdoApontamentos.somarPorAtividade(contractId),
    ]);

    // Passa o realizado já agregado (uma linha por atividade) para a regra pura,
    // que re-soma por atividade e separa o bucket "sem atividade".
    const prod = computeProdutividade({
      atividades,
      apontamentos: realPorAtividade.map((r) => ({ atividadeId: r.atividadeId, horas: r.hhReal })),
    });
    sendJson(res, { produtividade: prod });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

module.exports = {
  handleListRdoApontamentos,
  handlePutRdoApontamentos,
  handleGetContractProdutividade,
};
