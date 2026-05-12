/** @file Repositório de `solicitacoes_compra` — fluxo de aprovação de compras
 *  (pendente_avaliacao → pendente_aprovacao → aprovada → comprada → recebida).
 *  Numeração SEQUENCIAL via SERIAL `numero` da tabela. */
const { createRepo } = require('./_factory');

module.exports = createRepo('solicitacoes_compra', { orderBy: 'created_at DESC' });
