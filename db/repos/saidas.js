/** @file Repositório de `saidas` — itens individuais de medição (BM) ligados a
 *  uma NF. Mutações vão por handlers transacionais (`handlePostSaida` etc.).
 *  Ordenado por data DESC. */
const { createRepo } = require('./_factory');

const base = createRepo('saidas', { orderBy: 'date DESC, created_at DESC' });

module.exports = { ...base };
