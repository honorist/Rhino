const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('contracts');

// Operações específicas de budget (subitens em JSONB)
async function addBudgetItem(contractId, item) {
  const sql = `
    UPDATE contracts
    SET budget = COALESCE(budget, '[]'::jsonb) || $2::jsonb
    WHERE id = $1
    RETURNING *`;
  return db.getOne(sql, [contractId, JSON.stringify(item)]);
}

async function updateBudgetItem(contractId, itemId, patch) {
  return db.withTransaction(async (client) => {
    const cur = await client.query('SELECT budget FROM contracts WHERE id = $1', [contractId]);
    if (!cur.rows[0]) return null;
    const budget = (cur.rows[0].budget || []).map((b) =>
      b.id === itemId ? { ...b, ...patch } : b
    );
    const upd = await client.query(
      'UPDATE contracts SET budget = $2 WHERE id = $1 RETURNING *',
      [contractId, JSON.stringify(budget)]
    );
    return upd.rows[0] ? db.rowToCamel(upd.rows[0]) : null;
  });
}

async function removeBudgetItem(contractId, itemId) {
  return db.withTransaction(async (client) => {
    const cur = await client.query('SELECT budget FROM contracts WHERE id = $1', [contractId]);
    if (!cur.rows[0]) return null;
    const budget = (cur.rows[0].budget || []).filter((b) => b.id !== itemId);
    const upd = await client.query(
      'UPDATE contracts SET budget = $2 WHERE id = $1 RETURNING *',
      [contractId, JSON.stringify(budget)]
    );
    return upd.rows[0] ? db.rowToCamel(upd.rows[0]) : null;
  });
}

// ============ Carregamento com filhos aninhados ============
// Retorna um array de contratos, cada um com organograma[] e rdos[] embutidos.
// Mantém o shape esperado pelo frontend (que ainda lê do JSON).
async function findAllWithChildren() {
  const contracts = await db.getMany(
    `SELECT * FROM contracts ORDER BY created_at DESC`
  );
  if (!contracts.length) return [];

  const ids = contracts.map((c) => c.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(', ');

  const [orgs, rdos] = await Promise.all([
    db.getMany(
      `SELECT * FROM organograma_membros WHERE contract_id IN (${ph}) ORDER BY created_at ASC`,
      ids
    ),
    db.getMany(
      `SELECT * FROM rdos WHERE contract_id IN (${ph}) ORDER BY created_at ASC`,
      ids
    ),
  ]);

  const orgsByContract = new Map();
  const rdosByContract = new Map();
  for (const o of orgs) {
    if (!orgsByContract.has(o.contractId)) orgsByContract.set(o.contractId, []);
    orgsByContract.get(o.contractId).push(o);
  }
  for (const r of rdos) {
    if (!rdosByContract.has(r.contractId)) rdosByContract.set(r.contractId, []);
    rdosByContract.get(r.contractId).push(r);
  }

  return contracts.map((c) => ({
    ...c,
    organograma: orgsByContract.get(c.id) || [],
    rdos: rdosByContract.get(c.id) || [],
  }));
}

async function findByIdWithChildren(id) {
  const contract = await db.getOne(`SELECT * FROM contracts WHERE id = $1`, [id]);
  if (!contract) return null;
  const [organograma, rdos] = await Promise.all([
    db.getMany(
      `SELECT * FROM organograma_membros WHERE contract_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    db.getMany(
      `SELECT * FROM rdos WHERE contract_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
  ]);
  return { ...contract, organograma, rdos };
}

// Apaga o contrato e TUDO que está vinculado a ele.
// FK CASCADE remove saidas/organograma_membros/rdos automaticamente.
// Aqui apagamos manualmente o que está como ON DELETE SET NULL no schema:
// notas_fiscais (BMs/Contas a Receber), contas_pagar, caixa, investimentos.
// Tudo dentro de uma transação — ou apaga tudo, ou nada.
async function removeByIdCascade(id) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM caixa WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM contas_pagar WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM notas_fiscais WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM investimentos WHERE contract_id = $1', [id]);
    const r = await client.query('DELETE FROM contracts WHERE id = $1', [id]);
    return r.rowCount > 0;
  });
}

// Envelope no shape do contracts.json: { contracts: [...], saidas: [...] }
async function getEnvelope() {
  const [contracts, saidas] = await Promise.all([
    findAllWithChildren(),
    db.getMany(`SELECT * FROM saidas ORDER BY date DESC, created_at DESC`),
  ]);
  return { contracts, saidas };
}

module.exports = {
  ...base,
  addBudgetItem,
  updateBudgetItem,
  removeBudgetItem,
  findAllWithChildren,
  findByIdWithChildren,
  getEnvelope,
  removeByIdCascade,
};
