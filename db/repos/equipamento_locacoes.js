/** @file Repositório de `equipamento_locacoes` — janelas de locação de um
 *  equipamento a obras (item 16), tabela-filha por equipamento_id. Ordena por
 *  data de início (mais recente primeiro) — é a linha do tempo de uso do ativo. */
const { createRepo } = require('./_factory');

module.exports = createRepo('equipamento_locacoes', { orderBy: 'data_inicio DESC' });
