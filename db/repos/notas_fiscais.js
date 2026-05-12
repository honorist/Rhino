/**
 * @file Repositório de `notas_fiscais` — Boletins de Medição (BMs) que viram
 *  NFs ao serem emitidas.
 *
 * Ciclo de vida:
 *  1. Criada como BM pendente (`emitida=false`) por `handlePostSaida`.
 *  2. Agregada com novas saídas no mesmo dia (mesma `data_limite`).
 *  3. Emitida via `handleEmitirNotaFiscal` → cria entrada agendada no caixa.
 *  4. Recebimento via baixa manual no caixa (`caixaEntryId`).
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('notas_fiscais', { orderBy: 'data_limite ASC NULLS LAST' });

/**
 * Lista NFs de um contrato. Substitui o pattern `findAll().filter(c => c.contractId === id)`
 * (anti-pattern N+1 — ver P1-1 do backend review).
 *
 * @param {string} contractId
 * @returns {Promise<object[]>}
 */
async function findByContract(contractId) {
  return db.getMany(
    `SELECT * FROM notas_fiscais WHERE contract_id = $1 ORDER BY data_limite ASC NULLS LAST`,
    [contractId]
  );
}

/**
 * NFs pendentes de emissão (`emitida=false`). Útil para dashboards.
 * @returns {Promise<object[]>}
 */
async function findPendentes() {
  return db.getMany(
    `SELECT * FROM notas_fiscais WHERE emitida = false ORDER BY data_limite ASC NULLS LAST`
  );
}

module.exports = { ...base, findByContract, findPendentes };
