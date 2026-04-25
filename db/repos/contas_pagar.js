const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('contas_pagar', { orderBy: 'data_vencimento ASC NULLS LAST' });

async function findByStatus(status) {
  return db.getMany(
    `SELECT * FROM contas_pagar WHERE status = $1 ORDER BY data_vencimento ASC NULLS LAST`,
    [status]
  );
}

async function findVencendo(diasAFrente = 30) {
  return db.getMany(
    `SELECT * FROM contas_pagar
     WHERE status = 'aberto'
       AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
     ORDER BY data_vencimento ASC`,
    [String(diasAFrente)]
  );
}

module.exports = { ...base, findByStatus, findVencendo };
