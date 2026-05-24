/**
 * @file Repositório de vagas dentro de uma solicitação de contratação (US-05).
 * Uma solicitação tem N vagas (cargo + qtd_total + qtd_preenchida).
 */
const { createRepo } = require('./_factory');

module.exports = createRepo('vagas', {
  orderBy: 'created_at ASC',
});
