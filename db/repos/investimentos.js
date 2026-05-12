/** @file Repositório de `investimentos` — aportes de sócios. CRUD genérico,
 *  ordenado por data DESC (registros sem data ao final). */
const { createRepo } = require('./_factory');
module.exports = createRepo('investimentos', { orderBy: 'date DESC NULLS LAST, created_at DESC' });
