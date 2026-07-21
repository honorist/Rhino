/** @file Repositório de `subcontrato_medicoes` — boletim de medições de um
 *  subcontratado (tabela-filha por subcontratado_id). Ordena por competência
 *  (mais recente primeiro) e, como desempate, pela criação — é a linha do tempo
 *  do faturamento do empreiteiro (previsto → medido → pago). */
const { createRepo } = require('./_factory');

module.exports = createRepo('subcontrato_medicoes', { orderBy: 'competencia DESC, created_at DESC' });
