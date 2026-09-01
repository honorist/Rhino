/**
 * @file Repositório de `contas_pagar` — contas a pagar a fornecedores.
 *
 * Estende CRUD com queries por status e alertas de vencimento próximo.
 * Status válidos: 'aberto', 'pago', 'estornado'.
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('contas_pagar', { orderBy: 'data_vencimento ASC NULLS LAST' });

/**
 * Lista contas filtradas por status.
 * @param {'aberto'|'pago'|'estornado'} status
 * @returns {Promise<object[]>}
 */
async function findByStatus(status) {
  return db.getMany(
    `SELECT * FROM contas_pagar WHERE status = $1 ORDER BY data_vencimento ASC NULLS LAST`,
    [status]
  );
}

/**
 * Lista contas em aberto com vencimento nos próximos N dias (incl. hoje).
 *
 * P2-5 da DB review (concluído): era `($1 || ' days')::interval` — concatenar
 * string pra montar um INTERVAL é o padrão errado (o valor vira texto SQL em
 * vez de ficar 100% no parâmetro). Multiplicação numérica de INTERVAL é
 * parametrizada de ponta a ponta e não depende de nenhuma formatação textual.
 *
 * @param {number} [diasAFrente=30]
 * @returns {Promise<object[]>}
 */
async function findVencendo(diasAFrente = 30) {
  return db.getMany(
    `SELECT * FROM contas_pagar
     WHERE status = 'aberto'
       AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
     ORDER BY data_vencimento ASC`,
    [diasAFrente]
  );
}

module.exports = { ...base, findByStatus, findVencendo };
