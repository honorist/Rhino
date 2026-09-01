/**
 * @file Repositório de `caixa` — entradas e saídas financeiras.
 *
 * Estende CRUD básico com helpers de período e agregação. A tabela é a fonte
 * de verdade do saldo de caixa; entries são imutáveis após criação exceto via
 * `updateById` (que respeita ownership). Tabela cresce indefinidamente.
 *
 * P1-3 da DB review: o risco de OOM já está coberto — `findAll()` (do
 * factory) aplica um cap defensivo de 5000 linhas por padrão. O que faltava
 * era paginação DE VERDADE pra listagem: `findPageKeyset()` abaixo, por
 * cursor (date, created_at, id) — sem OFFSET. NÃO trocamos o default de
 * `findAll()`/`envelope()` (handlers/caixa.js): o front carrega `caixa`
 * inteiro uma vez via Store.loadAll() e filtra em memória — mudar esse
 * contrato é uma reforma de arquitetura maior que este item, fora de escopo
 * aqui. `findPageKeyset` fica disponível pra quem quiser paginar de verdade
 * (uma tela dedicada futura, ou consumidor de API) sem tocar no que já existe.
 */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('caixa', { orderBy: 'date DESC, created_at DESC' });

/**
 * Página de lançamentos por cursor — sem OFFSET (P1-3). `after`, quando
 * passado, é a tupla (date, createdAt, id) da última linha da página
 * anterior; `id` desempata (date/created_at podem colidir entre lançamentos).
 *
 * @param {{ limit?: number, after?: { date: string, createdAt: string, id: string } }} [opts]
 * @returns {Promise<object[]>}
 */
async function findPageKeyset({ limit = 100, after } = {}) {
  const lim = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  const vals = [];
  let where = '';
  if (after && after.date && after.createdAt && after.id) {
    vals.push(after.date, after.createdAt, after.id);
    where = `WHERE (date, created_at, id) < ($1, $2, $3)`;
  }
  vals.push(lim);
  return db.getMany(
    `SELECT * FROM caixa ${where} ORDER BY date DESC, created_at DESC, id DESC LIMIT $${vals.length}`,
    vals
  );
}

/**
 * Retorna entradas/saídas dentro de um intervalo de datas (inclusive nas pontas).
 *
 * @param {string} startDate  ISO `YYYY-MM-DD`.
 * @param {string} endDate    ISO `YYYY-MM-DD`.
 * @returns {Promise<object[]>}
 */
async function findByPeriod(startDate, endDate) {
  return db.getMany(
    `SELECT * FROM caixa WHERE date BETWEEN $1 AND $2 ORDER BY date DESC, created_at DESC`,
    [startDate, endDate]
  );
}

/**
 * Soma de `value` filtrada por tipo (entrada/saida) e opcionalmente por
 * período + contractId. Conversão para Number aqui captura o caveat do
 * P0-3 (precisão de NUMERIC) — para somas críticas, considere agregação SQL.
 *
 * @param {'entrada'|'saida'} type
 * @param {{ startDate?: string, endDate?: string, contractId?: string }} [filters]
 * @returns {Promise<number>}
 */
async function totalByType(type, filters = {}) {
  const conds = ['type = $1'];
  const values = [type];
  if (filters.startDate) { values.push(filters.startDate); conds.push(`date >= $${values.length}`); }
  if (filters.endDate)   { values.push(filters.endDate);   conds.push(`date <= $${values.length}`); }
  if (filters.contractId){ values.push(filters.contractId);conds.push(`contract_id = $${values.length}`); }
  const sql = `SELECT COALESCE(SUM(value), 0)::numeric AS total FROM caixa WHERE ${conds.join(' AND ')}`;
  const row = await db.getOne(sql, values);
  return row ? Number(row.total) : 0;
}

module.exports = { ...base, findByPeriod, totalByType, findPageKeyset };
