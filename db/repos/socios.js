/** @file Repositório de `socios` — CRUD genérico, ordenado por `name ASC`. */
const { createRepo } = require('./_factory');
module.exports = createRepo('socios', { orderBy: 'name ASC' });
