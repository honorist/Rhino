/** @file Repositório de `ssma_ocorrencias` — desvios e incidentes de segurança
 *  (SSMA) por obra: desvio / quase-acidente / incidente / acidente, tabela-filha
 *  por contract_id. Ordena por data (mais recente primeiro) — é uma linha do
 *  tempo de segurança da obra. */
const { createRepo } = require('./_factory');

module.exports = createRepo('ssma_ocorrencias', { orderBy: 'data DESC' });
