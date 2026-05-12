/** @file Repositório de `clientes` — CRUD genérico, ordenado por `nome ASC`. */
const { createRepo } = require('./_factory');
module.exports = createRepo('clientes', { orderBy: 'nome ASC' });
