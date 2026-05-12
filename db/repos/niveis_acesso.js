/** @file Repositório de `niveis_acesso` — perfis de permissão (abas + ações).
 *  `nivelAcessoId = null` no user = super admin (bypass de checks). */
const { createRepo } = require('./_factory');
module.exports = createRepo('niveis_acesso', { orderBy: 'label ASC' });
