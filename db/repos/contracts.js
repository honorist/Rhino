/**
 * @file Repositório de `contracts` — repositório mais complexo do app.
 *
 * Estende CRUD com:
 * - Operações no campo JSONB `budget` (adicionar/atualizar/remover sub-itens
 *   atomicamente — `updateBudgetItem` usa transação para read-modify-write).
 * - `findAllWithChildren` / `findByIdWithChildren`: carrega filhos
 *   (organograma, rdos, aditivos, marcos, ocorrências) numa única chamada via
 *   3-4 queries paralelas + join in-memory, evitando N+1.
 * - `getEnvelope`: shape do contracts.json que o frontend ainda consome
 *   ({ contracts, saidas }), com flag `lite` para telas que só precisam dos
 *   contratos sem filhos pesados.
 * - `removeByIdCascade`: deleta o contrato + tudo vinculado (caixa, NFs, contas
 *   a pagar, investimentos) numa transação. CASCADE do schema cobre saidas,
 *   organograma e rdos automaticamente.
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('contracts');

/**
 * Adiciona um item ao array JSONB `budget` do contrato (concatena).
 * Atomic via UPDATE em SQL (sem race window).
 *
 * @param {string} contractId
 * @param {object} item
 * @returns {Promise<object | null>}  Contrato atualizado.
 */
async function addBudgetItem(contractId, item) {
  const sql = `
    UPDATE contracts
    SET budget = COALESCE(budget, '[]'::jsonb) || $2::jsonb
    WHERE id = $1
    RETURNING *`;
  return db.getOne(sql, [contractId, JSON.stringify(item)]);
}

/**
 * Atualiza um item específico do `budget` por `itemId`. Read-modify-write
 * dentro de transação evita perda de updates concorrentes.
 *
 * @param {string} contractId
 * @param {string} itemId
 * @param {Partial<object>} patch
 * @returns {Promise<object | null>}
 */
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

/**
 * Remove um item do `budget` por `itemId`.
 *
 * @param {string} contractId
 * @param {string} itemId
 * @returns {Promise<object | null>}
 */
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

/**
 * Lista todos os contratos com filhos aninhados (organograma, rdos, aditivos,
 * marcos, ocorrências). Executa 6 queries em paralelo (1 master + 5 children
 * com IN-clause) e faz join in-memory via Map. Performance O(n+m) vs O(n×m)
 * do antipadrão "for each contract → fetch children".
 *
 * Mantém shape esperado pelo frontend.
 *
 * @returns {Promise<Array<object & { organograma: object[], rdos: object[], aditivos: object[], marcos: object[], ocorrencias: object[] }>>}
 */
async function findAllWithChildren(filter = {}) {
  // Filtro opcional por cliente — empurra o WHERE pro SQL em vez de carregar
  // TODOS os contratos + filhos e filtrar em memória (usado pelo portal do
  // cliente, que só precisa dos contratos daquele cliente). Valor parametrizado.
  const params = [];
  let where = '';
  if (filter.clientId) {
    params.push(filter.clientId);
    where = `WHERE client_id = $${params.length}`;
  }
  const contracts = await db.getMany(
    `SELECT * FROM contracts ${where} ORDER BY created_at DESC`,
    params
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

/**
 * Single-contrato com todos os filhos aninhados.
 *
 * @param {string} id
 * @returns {Promise<object | null>}
 */
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

/**
 * Apaga o contrato e TUDO que está vinculado a ele.
 *
 * - FK CASCADE no schema cuida automaticamente: `saidas`, `organograma_membros`,
 *   `rdos`, `contract_aditivos`, `contract_marcos`, `contract_ocorrencias`.
 * - Aqui apagamos manualmente o que está como ON DELETE SET NULL no schema:
 *   `notas_fiscais` (BMs/Contas a Receber), `contas_pagar`, `caixa`, `investimentos`.
 * - Tudo dentro de uma transação — atômico (rollback em erro).
 *
 * @param {string} id
 * @returns {Promise<boolean>}  `true` se o contrato foi removido.
 */
async function removeByIdCascade(id) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM caixa WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM contas_pagar WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM notas_fiscais WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM investimentos WHERE contract_id = $1', [id]);
    // medicao_itens ANTES de contract_servicos: a FK `medicao_itens.servico_id`
    // é ON DELETE RESTRICT, então deixar os dois a cargo do CASCADE tornava a
    // exclusão dependente da ordem de disparo dos triggers RI (alfabética por
    // `RI_ConstraintTrigger_a_<oid>`) — podia abortar com violação de FK num
    // banco e funcionar em outro, conforme os OIDs sorteados. Apagar
    // explicitamente aqui torna o resultado determinístico.
    await client.query('DELETE FROM medicao_itens WHERE contract_id = $1', [id]);
    await client.query('DELETE FROM contract_servicos WHERE contract_id = $1', [id]);
    const r = await client.query('DELETE FROM contracts WHERE id = $1', [id]);
    return r.rowCount > 0;
  });
}

/** Limite default de saídas no envelope (evita payloads multi-MB). */
const SAIDAS_DEFAULT_LIMIT = 2000;

/**
 * Lista "lite" de contratos — sem filhos aninhados. Para telas que só
 * precisam de contratos para selects/lookups.
 *
 * @returns {Promise<object[]>}
 */
async function findAllLite() {
  const contracts = await db.getMany(`SELECT * FROM contracts ORDER BY created_at DESC`);
  return contracts.map(c => ({ ...c, organograma: [], rdos: [], aditivos: [], marcos: [], ocorrencias: [] }));
}

/**
 * Envelope completo no shape `{ contracts, saidas }` (formato esperado pelo
 * frontend, que historicamente lia de JSON).
 *
 * @param {{ lite?: boolean, saidasLimit?: number }} [opts]
 * @returns {Promise<{ contracts: object[], saidas: object[] }>}
 */
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
