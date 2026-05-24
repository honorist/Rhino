/**
 * @file Repositório de solicitações de contratação (US-05+).
 * Encarregado abre → RH preenche → fecha quando todas as vagas têm aprovados.
 */
const { createRepo } = require('./_factory');

module.exports = createRepo('solicitacoes_contratacao', {
  orderBy: 'created_at DESC',
});
