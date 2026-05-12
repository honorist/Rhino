/** @file Repositório de `fornecedores` — CRUD genérico, ordenado por `nome ASC`. */
const { createRepo } = require('./_factory');
module.exports = createRepo('fornecedores', { orderBy: 'nome ASC' });
