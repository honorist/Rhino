const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('notas_fiscais', { orderBy: 'data_limite ASC NULLS LAST' });

async function findByContract(contractId) {
  return db.getMany(
    `SELECT * FROM notas_fiscais WHERE contract_id = $1 ORDER BY data_limite ASC NULLS LAST`,
    [contractId]
  );
}

async function findPendentes() {
  return db.getMany(
    `SELECT * FROM notas_fiscais WHERE emitida = false ORDER BY data_limite ASC NULLS LAST`
  );
}

module.exports = { ...base, findByContract, findPendentes };
