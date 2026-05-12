/** @file Repositório de `contract_aditivos` — aditivos contratuais (prazo/valor).
 *  Spread permite estender no futuro com helpers customizados. */
const { createRepo } = require('./_factory');
const base = createRepo('contract_aditivos', { orderBy: 'data DESC, created_at DESC' });
module.exports = { ...base };
