'use strict';
/**
 * @file Planilha de serviços do contrato (BM estruturado) — CRUD.
 * Cada serviço: código, descrição, unidade, qtd contratada e preço unitário.
 * Regras em lib/medicao.js: qtd contratada nunca fica abaixo do já medido
 * (BR-MED-005); serviço com medição acumulada não é excluído — inativa-se.
 *
 * CONCORRÊNCIA: PUT e DELETE tomam o MESMO `pg_advisory_xact_lock(contractId)`
 * usado por saídas e medições. Sem ele havia corrida real: uma medição em voo
 * já tinha lido `qtd_contratada=100` e aprovado a medição quando um PUT
 * concorrente baixava para 10 — o INSERT dos itens então gravava 100 medidos
 * sobre 10 contratados (saldo negativo, avanço 1000%), furando BR-MED-001 e
 * BR-MED-005 ao mesmo tempo. Os repos usam o pool e commitam fora da transação
 * (ver db/index.js), então o lock é a única serialização: leitura do medido e
 * escrita do serviço precisam ficar na mesma seção crítica.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const { validateBody, schemas } = require('../lib/validate');
const med = require('../lib/medicao');

/** Serializa com saídas/medições do mesmo contrato. */
function lockContrato(client, contractId) {
  return client.query('SELECT pg_advisory_xact_lock(hashtext($1)::int)', [String(contractId)]);
}

/** Planilha do contrato com saldo (contratado × medido acumulado). */
async function handleListContractServicos(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const [servicos, medido] = await Promise.all([
      repos.contractServicos.findAll({ contractId }),
      repos.medicaoItens.somarPorServico(contractId),
    ]);
    sendJson(res, { servicos: med.saldoPorServico(servicos, medido.qtd, medido.valor) });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

async function handlePostContractServico(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const parsed = validateBody(schemas.servicoPost, body);
    const ordem = parsed.ordem !== undefined ? parsed.ordem : (await repos.contractServicos.count({ contractId })) + 1;
    const servico = {
      id: generateId('srv'),
      contractId,
      codigo: parsed.codigo,
      descricao: parsed.descricao,
      unidade: parsed.unidade,
      qtdContratada: parsed.qtdContratada,
      precoUnit: parsed.precoUnit,
      ordem,
      ativo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.contractServicos.create(servico);
    await handleListContractServicos(contractId, res);
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

async function handlePutContractServico(contractId, servicoId, body, res) {
  try {
    await db.withTransaction(async (client) => {
      await lockContrato(client, contractId);
      const servico = await repos.contractServicos.findById(servicoId);
      if (!servico || servico.contractId !== contractId) {
        const err = new Error('Serviço não encontrado neste contrato');
        err.statusCode = 404;
        throw err;
      }
      const parsed = validateBody(schemas.servicoPut, body);

      // BR-MED-005: qtd contratada não pode ficar abaixo do já medido.
      const medido = await repos.medicaoItens.somarPorServico(contractId);
      const check = med.validarServicoUpdate(servico, medido.qtd[servicoId] || 0, parsed);
      if (!check.ok) {
        const err = new Error(check.errors.map((er) => er.msg).join('; '));
        err.statusCode = 400;
        throw err;
      }

      await repos.contractServicos.updateById(servicoId, { ...parsed, updatedAt: new Date().toISOString() });
    });
    await handleListContractServicos(contractId, res);
  } catch (e) {
    if (!res.headersSent) sendError(res, e.statusCode || 400, e.message);
  }
}

async function handleDeleteContractServico(contractId, servicoId, res) {
  try {
    await db.withTransaction(async (client) => {
      await lockContrato(client, contractId);
      const servico = await repos.contractServicos.findById(servicoId);
      if (!servico || servico.contractId !== contractId) {
        const err = new Error('Serviço não encontrado neste contrato');
        err.statusCode = 404;
        throw err;
      }
      const medido = await repos.medicaoItens.somarPorServico(contractId);
      if (!med.podeExcluirServico(medido.qtd[servicoId] || 0)) {
        const err = new Error('Serviço com medição acumulada não pode ser excluído. Inative-o (ativo=false) para tirá-lo de novas medições.');
        err.statusCode = 400;
        throw err;
      }
      await repos.contractServicos.removeById(servicoId);
    });
    await handleListContractServicos(contractId, res);
  } catch (e) {
    if (!res.headersSent) sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListContractServicos,
  handlePostContractServico,
  handlePutContractServico,
  handleDeleteContractServico,
};
