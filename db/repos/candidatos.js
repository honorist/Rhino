/**
 * @file Repositório de candidatos a uma vaga (US-06+).
 * Status: contatado | interessado | sem_interesse | reprovado_antecedentes | aprovado.
 * Antecedentes: pendente | ok | reprovado.
 */
const { createRepo } = require('./_factory');

module.exports = createRepo('candidatos', {
  orderBy: 'created_at DESC',
});
