'use strict';
/**
 * @file Enforcement server-side de aceite de Termos (achado 2.3 da varredura
 * 2026-09-08). Antes só existia checagem no client (js/app.js — abre um modal
 * bloqueante), sem nenhuma barreira equivalente no servidor: um cliente HTTP
 * direto (curl, script) contornava o consentimento sem esforço.
 */

/** Rotas acessíveis mesmo sem aceite — senão o usuário nunca conseguiria aceitar ou sair. */
const EXEMPT_PATHS = new Set(['/api/auth/accept-terms', '/api/auth/logout']);

/**
 * @param {object} params
 * @param {string} params.pathname
 * @param {{acceptedTermsAt?: unknown} | null} params.user  Usuário já autenticado (ou null).
 * @returns {boolean} true se a request deve ser bloqueada (termos pendentes).
 */
function blocksOnPendingTerms({ pathname, user }) {
  if (!user) return false; // sem usuário autenticado, este enforcement não se aplica
  if (EXEMPT_PATHS.has(pathname)) return false;
  return !user.acceptedTermsAt;
}

module.exports = { EXEMPT_PATHS, blocksOnPendingTerms };
