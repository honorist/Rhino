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

  const [orgs, rdos, aditivos, marcos, ocorrencias] = await Promise.all([
    db.getMany(
      `SELECT * FROM organograma_membros WHERE contract_id IN (${ph}) ORDER BY created_at ASC`,
      ids
    ),
    db.getMany(
      `SELECT * FROM rdos WHERE contract_id IN (${ph}) ORDER BY created_at ASC`,
      ids
    ),
    db.getMany(
      `SELECT * FROM contract_aditivos WHERE contract_id IN (${ph}) ORDER BY data DESC, created_at DESC`,
      ids
    ),
    db.getMany(
      `SELECT * FROM contract_marcos WHERE contract_id IN (${ph}) ORDER BY ordem ASC, prazo ASC NULLS LAST, created_at ASC`,
      ids
    ),
    db.getMany(
      `SELECT * FROM contract_ocorrencias WHERE contract_id IN (${ph}) ORDER BY data DESC, created_at DESC`,
      ids
    ),
  ]);

  const orgsByContract = new Map();
  const rdosByContract = new Map();
  const aditivosByContract = new Map();
  const marcosByContract = new Map();
  const ocorrenciasByContract = new Map();
  for (const o of orgs) {
    if (!orgsByContract.has(o.contractId)) orgsByContract.set(o.contractId, []);
    orgsByContract.get(o.contractId).push(o);
  }
  for (const r of rdos) {
    if (!rdosByContract.has(r.contractId)) rdosByContract.set(r.contractId, []);
    rdosByContract.get(r.contractId).push(r);
  }
  for (const a of aditivos) {
    if (!aditivosByContract.has(a.contractId)) aditivosByContract.set(a.contractId, []);
    aditivosByContract.get(a.contractId).push(a);
  }
  for (const m of marcos) {
    if (!marcosByContract.has(m.contractId)) marcosByContract.set(m.contractId, []);
    marcosByContract.get(m.contractId).push(m);
  }
  for (const oc of ocorrencias) {
    if (!ocorrenciasByContract.has(oc.contractId)) ocorrenciasByContract.set(oc.contractId, []);
    ocorrenciasByContract.get(oc.contractId).push(oc);
  }

  return contracts.map((c) => ({
    ...c,
    organograma: orgsByContract.get(c.id) || [],
    rdos: rdosByContract.get(c.id) || [],
    aditivos: aditivosByContract.get(c.id) || [],
    marcos: marcosByContract.get(c.id) || [],
    ocorrencias: ocorrenciasByContract.get(c.id) || [],
  }));
}

async function findByIdWithChildren(id) {
  const contract = await db.getOne(`SELECT * FROM contracts WHERE id = $1`, [id]);
  if (!contract) return null;
  const [organograma, rdos, aditivos, marcos, ocorrencias] = await Promise.all([
    db.getMany(`SELECT * FROM organograma_membros WHERE contract_id = $1 ORDER BY created_at ASC`, [id]),
    db.getMany(`SELECT * FROM rdos WHERE contract_id = $1 ORDER BY created_at ASC`, [id]),
    db.getMany(`SELECT * FROM contract_aditivos WHERE contract_id = $1 ORDER BY data DESC, created_at DESC`, [id]),
    db.getMany(`SELECT * FROM contract_marcos WHERE contract_id = $1 ORDER BY ordem ASC, prazo ASC NULLS LAST, created_at ASC`, [id]),
    db.getMany(`SELECT * FROM contract_ocorrencias WHERE contract_id = $1 ORDER BY data DESC, created_at DESC`, [id]),
  ]);
  return { ...contract, organograma, rdos, aditivos, marcos, ocorrencias };
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
// Limita saidas para evitar payloads enormes em telas que só usam recentes.
// opts.lite=true → pula filhos (organograma, rdos, aditivos, marcos, ocorrencias) e saidas
//                  para telas que só listam contratos (ex: ContasPagar, NotasFiscais, selects).
const SAIDAS_DEFAULT_LIMIT = 2000;
async function findAllLite() {
  const contracts = await db.getMany(`SELECT * FROM contracts ORDER BY created_at DESC`);
  return contracts.map(c => ({ ...c, organograma: [], rdos: [], aditivos: [], marcos: [], ocorrencias: [] }));
}
async function getEnvelope(opts) {
  const lite = !!(opts && opts.lite);
  if (lite) {
    const contracts = await findAllLite();
    return { contracts, saidas: [] };
  }
  const limit = (opts && Number.isFinite(opts.saidasLimit)) ? opts.saidasLimit : SAIDAS_DEFAULT_LIMIT;
  const [contracts, saidas] = await Promise.all([
    findAllWithChildren(),
    db.getMany(`SELECT * FROM saidas ORDER BY date DESC, created_at DESC LIMIT $1`, [limit]),
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
