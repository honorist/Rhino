/** @file Repositório de `composicoes` — catálogo GLOBAL de composições de custo
 *  unitário (a "receita" de insumos por serviço). Ordena por código para leitura
 *  em ordem de planilha; a regra de custo vive em lib/composicao.js. */
const { createRepo } = require('./_factory');

module.exports = createRepo('composicoes', { orderBy: 'codigo ASC' });
