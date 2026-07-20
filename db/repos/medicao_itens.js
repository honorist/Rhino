/** @file Repositório de `medicao_itens` — itens de medição estruturada (BM),
 *  pendurados na saída (FK CASCADE) com preço snapshot. `contract_id` é
 *  denormalizado para acumulação por contrato sem JOIN. */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('medicao_itens', { orderBy: 'created_at ASC' });

/**
 * Acumulado medido por serviço, somado no BANCO.
 *
 * Substitui o pattern `findAll({contractId})` + soma em JS, que trafegava todas
 * as linhas e — pior — batia no cap defensivo `DEFAULT_LIMIT` (5000) do factory:
 * acima disso o acumulado vinha SILENCIOSAMENTE truncado (as linhas mais antigas,
 * por causa do `ORDER BY created_at ASC`), o saldo calculado ficava maior que o
 * real e a BR-MED-001 deixava de bloquear. Um contrato de montagem com ~200
 * serviços medidos mensalmente cruza 5000 linhas em ~2 anos.
 *
 * Devolve os dois acumulados porque servem a propósitos distintos:
 *  - `qtd`   → saldo contratado (BR-MED-001).
 *  - `valor` → soma dos snapshots de preço (BR-MED-002); NÃO recalcular por
 *    preço atual, senão um reajuste da planilha reescreveria retroativamente o
 *    valor já faturado nos BMs.
 *
 * @param {string} contractId
 * @returns {Promise<{qtd: Record<string, number>, valor: Record<string, number>}>}
 */
async function somarPorServico(contractId) {
  const rows = await db.getMany(
    `SELECT servico_id, SUM(qtd) AS qtd, SUM(valor) AS valor
       FROM medicao_itens
      WHERE contract_id = $1
      GROUP BY servico_id`,
    [contractId]
  );
  const qtd = {};
  const valor = {};
  for (const r of rows) {
    qtd[r.servicoId] = parseFloat(r.qtd) || 0;
    valor[r.servicoId] = parseFloat(r.valor) || 0;
  }
  return { qtd, valor };
}

module.exports = { ...base, somarPorServico };
