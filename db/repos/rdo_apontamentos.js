/** @file Repositório de `rdo_apontamentos` — horas por colaborador × atividade
 *  apontadas num RDO (FK rdo_id CASCADE). `contract_id` é denormalizado para
 *  agregar produtividade por obra/atividade sem JOIN (padrão de medicao_itens). */
const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('rdo_apontamentos', { orderBy: 'created_at ASC' });

/**
 * HH realizado por atividade, somado no BANCO (evita o cap de 5000 linhas do
 * findAll genérico numa obra com muitos apontamentos ao longo do tempo).
 * @param {string} contractId
 * @returns {Promise<Array<{atividadeId: string|null, hhReal: number}>>}
 */
async function somarPorAtividade(contractId) {
  const rows = await db.getMany(
    `SELECT atividade_id, SUM(horas)::float AS hh_real
       FROM rdo_apontamentos
      WHERE contract_id = $1
      GROUP BY atividade_id`,
    [contractId]
  );
  return rows.map((r) => ({ atividadeId: r.atividadeId || null, hhReal: parseFloat(r.hhReal) || 0 }));
}

module.exports = { ...base, somarPorAtividade };
