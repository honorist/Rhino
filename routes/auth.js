'use strict';
/**
 * @file Rotas de autenticação — /api/auth/*
 *
 * Fase 2 do desmembramento do server.js. Os handlers continuam no server.js
 * (Opção A — extrai só o roteamento) e são injetados via `handlers`.
 *
 * @param {object} router    Instância de lib/router.js.
 * @param {object} handlers  { handleLogin, handleLogout, handleMe,
 *                             handleForgotPassword, handleResetPassword, handleAcceptTerms }
 */
module.exports = function registerAuth(router, handlers) {
  router.post('/api/auth/login',           (ctx) => handlers.handleLogin(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/logout',          (ctx) => handlers.handleLogout(ctx.req, ctx.res));
  router.get('/api/auth/me',               (ctx) => handlers.handleMe(ctx.req, ctx.res));
  router.post('/api/auth/forgot-password', (ctx) => handlers.handleForgotPassword(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/reset-password',  (ctx) => handlers.handleResetPassword(ctx.req, ctx.body, ctx.res));
  router.post('/api/auth/accept-terms',    (ctx) => handlers.handleAcceptTerms(ctx.req, ctx.res));
};
