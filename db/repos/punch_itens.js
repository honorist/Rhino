/** @file Repositório de `punch_itens` — itens de punch list / qualidade por obra
 *  (pendência técnica / RNC / inspeção), tabela-filha por contract_id. Foto em
 *  BYTEA fica na tabela irmã `punch_fotos`; metadados leves no JSONB `fotos`. */
const { createRepo } = require('./_factory');

module.exports = createRepo('punch_itens', { orderBy: 'created_at DESC' });
