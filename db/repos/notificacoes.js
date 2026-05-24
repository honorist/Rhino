/**
 * @file Repositório de notificações in-app.
 * `destinatario`: 'rh' (broadcast), 'todos' ou um user_id específico.
 * Estrutura plug-in para adicionar email/push no futuro sem reescrever o repo.
 */
const { createRepo } = require('./_factory');

module.exports = createRepo('notificacoes', {
  orderBy: 'created_at DESC',
});
