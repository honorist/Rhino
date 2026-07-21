/** @file Repositório de `equipamentos` — ativos próprios/locados da empresa
 *  (item 16). Cadastro global (não por obra). Ordena por nome (ASC) — a tela é
 *  um catálogo do parque de equipamentos, mais útil em ordem alfabética. */
const { createRepo } = require('./_factory');

module.exports = createRepo('equipamentos', { orderBy: 'nome ASC' });
