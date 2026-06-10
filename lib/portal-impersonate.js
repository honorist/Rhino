'use strict';
/**
 * @file "Ver portal como cliente" — regras da impersonação de portal.
 *
 * Permite que um SUPER ADMIN abra o portal de qualquer cliente sem saber a
 * senha dele: cria-se uma sessão em `portal_sessions` marcada com
 * `impersonated_by` (id do admin) e TTL curto. A rota/handler fica no
 * server.js; aqui vive só a regra pura (testável sem DB).
 *
 * Segurança:
 *  - gate: somente super admin (mesma definição de lib/permissions.js);
 *  - TTL 30 min — sessão de visualização, não de uso contínuo;
 *  - sid com o mesmo formato forte do login real (pses_ + 256 bits);
 *  - `impersonated_by` preenchido distingue da sessão real (NULL) e
 *    alimenta o banner "Visualizando como..." no portal.
 */

const crypto = require('crypto');
const perms = require('./permissions');

/** TTL da sessão impersonada, em minutos (sessão real do cliente: 7 dias). */
const IMPERSONATE_TTL_MIN = 30;

/**
 * Perfis nomeados (niveis_acesso.id) autorizados a impersonar além do
 * super admin. O C-04 (mutação) ainda exige edição em #/clientes ou
 * #/contratos no perfil — dupla camada.
 */
const PERFIS_PERMITIDOS = new Set(['gerente']);

/**
 * Valida quem pode impersonar: super admin ou perfil em PERFIS_PERMITIDOS.
 * @param {object|null} user `req.user` já resolvido pela sessão admin.
 * @returns {string|null} Mensagem de erro, ou null se permitido.
 */
function validarImpersonacao(user) {
  if (!user) return 'Não autenticado';
  if (perms.isSuperAdmin(user)) return null;
  if (PERFIS_PERMITIDOS.has(user.nivelAcessoId)) return null;
  return 'Apenas super admin ou gerente pode visualizar o portal de um cliente';
}

/**
 * Monta os dados da sessão impersonada (não toca no banco).
 * @param {string} adminUserId Id do admin que está visualizando.
 * @param {number} [agora] Timestamp base (injetável p/ teste).
 * @returns {{ sid: string, expiresAt: Date, impersonatedBy: string }}
 */
function criarSessaoImpersonada(adminUserId, agora = Date.now()) {
  return {
    sid: 'pses_' + crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(agora + IMPERSONATE_TTL_MIN * 60 * 1000),
    impersonatedBy: adminUserId,
  };
}

module.exports = { IMPERSONATE_TTL_MIN, validarImpersonacao, criarSessaoImpersonada };
