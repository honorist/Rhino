'use strict';
/**
 * @file Repositório de sugestões de melhoria (canal do colaborador — RaiaPro H2).
 * Conversão snake↔camel e CRUD genérico via _factory. Anexos (BYTEA) são
 * acessados por SQL direto no handler (igual recurso_doc_arquivos/proposta_anexos).
 */
const { createRepo } = require('./_factory');

module.exports = createRepo('sugestoes', {
  orderBy: 'created_at DESC',
});
