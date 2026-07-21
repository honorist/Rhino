'use strict';
/**
 * @file EVM / Curva S — Earned Value Management por obra (roadmap item 2).
 * Endpoint de leitura que consolida os indicadores de valor agregado do contrato
 * numa DATA DE REFERÊNCIA. A conta é a regra pura lib/evm.js; aqui só se
 * orquestram as fontes e a resposta HTTP. SEM tabela/persistência própria.
 *
 * Fontes:
 *  - Atividades do cronograma (tabela `atividades`, atividades de topo
 *    `parent_id IS NULL` — MESMA base da Curva S de handlers/atividades.js):
 *    custo_plan, exec_pct e datas planejadas → BAC, PV, EV.
 *  - AC (custo realizado, base caixa): reusa a conta do DRE (lib/dre.js) sobre o
 *    caixa da obra — `custoTotal` do DRE = AC. Não duplica a regra de custo.
 *
 * Envelope: { evm: { ...indicadores, dataRef, contractId, contractName } }.
 */
const db = require('../db');
const repos = require('../db/repos');
const evmLib = require('../lib/evm');
const { computeDreRealizado } = require('../lib/dre');
const { sendJson, sendError } = require('../lib/http-respond');

/**
 * Data de referência do cálculo: `?data=YYYY-MM-DD` quando válida, senão hoje
 * (UTC, YYYY-MM-DD — mesma origem de parse das datas das atividades).
 * @param {Record<string,string>} [query]
 * @returns {string}
 */
function _dataRef(query) {
  const raw = query && query.data;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

/**
 * AC (Actual Cost / custo realizado) da obra — base caixa, MESMA conta do DRE
 * (`custoTotal` de lib/dre). Reusa computeDreRealizado para não duplicar a regra;
 * contractValue/totalMedido não influenciam o custoTotal. Falha ao ler o caixa
 * não derruba o EVM (cai para custo 0, como no DRE).
 * @param {string} contractId
 * @returns {Promise<number>}
 */
async function _custoRealizado(contractId) {
  let caixaRows = [];
  try {
    caixaRows = await db.getMany(
      `SELECT type, category, SUM(value)::float AS total
         FROM caixa WHERE contract_id = $1 GROUP BY type, category`,
      [contractId]
    );
  } catch (e) {
    console.error('[evm]', e.message);
    caixaRows = [];
  }
  const dre = computeDreRealizado({ contractValue: 0, totalMedido: 0, caixaRows });
  return dre.custoTotal;
}

/** GET /api/contracts/:id/evm — indicadores EVM numa data de referência. */
async function handleGetEvm(contractId, res, query) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const dataRef = _dataRef(query);
    // Mesma base da Curva S existente: atividades de topo (parent_id IS NULL).
    const atividades = await db.getMany(
      `SELECT id, nome, data_inicio_plan, data_fim_plan, exec_pct, custo_plan
         FROM atividades WHERE contract_id = $1 AND parent_id IS NULL
         ORDER BY data_inicio_plan ASC, ordem ASC`,
      [contractId]
    );
    const ac = await _custoRealizado(contractId);
    const indicadores = evmLib.evm(atividades, ac, dataRef);

    sendJson(res, {
      evm: { ...indicadores, dataRef, contractId, contractName: contract.name || null },
    });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

module.exports = { handleGetEvm };
