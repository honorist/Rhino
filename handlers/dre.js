'use strict';
/**
 * @file DRE / Margem por obra — endpoint de leitura que consolida o resultado
 * REALIZADO de um contrato a partir do caixa. A conta em si é a regra pura
 * lib/dre.js; este handler só orquestra as queries e responde HTTP.
 *
 * Cada consulta é embrulhada em safe() (padrão de handlers/dashboards.js): a
 * ausência de uma tabela ou um erro pontual devolve o fallback em vez de
 * derrubar a demonstração inteira.
 */
const db = require('../db');
const repos = require('../db/repos');
const { computeDreRealizado } = require('../lib/dre');
const { sendJson, sendError } = require('../lib/http-respond');

async function handleGetContractDre(id, res) {
  try {
    const contract = await repos.contracts.findById(id);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const safe = async (fn, fallback) => {
      try {
        return (await fn()) ?? fallback;
      } catch (e) {
        console.error('[dre]', e.message);
        return fallback;
      }
    };

    const [caixaRows, medidoRow] = await Promise.all([
      safe(
        () =>
          db.getMany(
            `SELECT type, category, SUM(value)::float AS total
               FROM caixa WHERE contract_id = $1 GROUP BY type, category`,
            [id]
          ),
        []
      ),
      safe(
        () =>
          db.getOne(`SELECT COALESCE(SUM(value),0)::float AS total FROM saidas WHERE contract_id = $1`, [
            id,
          ]),
        { total: 0 }
      ),
    ]);

    const dre = computeDreRealizado({
      contractValue: contract.value,
      totalMedido: medidoRow ? medidoRow.total : 0,
      caixaRows,
    });
    sendJson(res, { dre: { ...dre, contractId: id, contractName: contract.name || null } });
  } catch (e) {
    console.error('[dre] erro:', e);
    sendError(res, 500, e.message);
  }
}

module.exports = { handleGetContractDre };
