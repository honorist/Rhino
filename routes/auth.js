'use strict';
/**
 * @file Rotas de autenticação — /api/auth/*
 *
 * Fase 2 (roteamento) + Fase A (handlers). Os handlers vivem em
 * `handlers/auth.js`; o 2º parâmetro `handlers` é opcional e serve só para
 * os testes de paridade injetarem stubs.
 *
 * @param {object} router      Instância de lib/router.js.
 * @param {object} [handlers]  Override de handlers (testes). Default: handlers/auth.js.
 */
module.exports = function registerAuth(router, handlers) {
  const h = handlers || require('../handlers/auth');
  router.post('/api/auth/login',           (ctx) => h.handleLogin(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/logout',          (ctx) => h.handleLogout(ctx.req, ctx.res));
  router.get('/api/auth/me',               (ctx) => h.handleMe(ctx.req, ctx.res));
  router.post('/api/auth/forgot-password', (ctx) => h.handleForgotPassword(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/reset-password',  (ctx) => h.handleResetPassword(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/accept-terms',    (ctx) => h.handleAcceptTerms(ctx.req, ctx.res));
};
