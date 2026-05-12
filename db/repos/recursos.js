/** @file Repositório de `recursos` — funcionários/colaboradores (RH).
 *  Inclui campos PII (CPF, endereço) — proteger logs. CRUD genérico. */
const { createRepo } = require('./_factory');
module.exports = createRepo('recursos', { orderBy: 'nome ASC' });
