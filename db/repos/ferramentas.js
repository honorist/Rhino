/** @file Repositório de `ferramentas` — cadastro da ferramentaria (instrumentos
 *  e ferramentas da empresa) com status operacional e controle de calibração.
 *  Catálogo global (não por obra). Ordena por nome (A→Z) por ser a leitura
 *  natural de uma lista de patrimônio. */
const { createRepo } = require('./_factory');

module.exports = createRepo('ferramentas', { orderBy: 'nome ASC' });
