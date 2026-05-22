'use strict';
/**
 * @file Rotas financeiras — caixa, base de custos administrativos, sócios,
 * investimentos. (Contas a pagar, folha, notas fiscais e cobrança entram na
 * etapa 2.4b deste mesmo arquivo.)
 *
 * Fase 2 do desmembramento do server.js. Handlers injetados via `deps`.
 *
 * @param {object} router  Instância de lib/router.js.
 * @param {object} deps    { handle* ... }
 */
module.exports = function registerFinanceiro(router, deps) {
  // ── Caixa ──
  router.get('/api/caixa',        (ctx) => deps.handleGetCaixa(ctx.res));
  router.post('/api/caixa',       (ctx) => deps.handlePostCaixa(ctx.body, ctx.res));
  router.put('/api/caixa/:id',    (ctx) => deps.handlePutCaixa(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/caixa/:id', (ctx) => deps.handleDeleteCaixa(ctx.params[0], ctx.res));

  // ── Base de custos administrativos ──
  router.get('/api/base',               (ctx) => deps.handleGetBase(ctx.res));
  router.post('/api/base',              (ctx) => deps.handlePostBase(ctx.body, ctx.res));
  router.put('/api/base/:id',           (ctx) => deps.handlePutBase(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/base/:id',        (ctx) => deps.handleDeleteBase(ctx.params[0], ctx.res));
  router.post('/api/base/:id/allocate', (ctx) => deps.handleAllocateBase(ctx.params[0], ctx.body, ctx.res));

  // ── Sócios ──
  router.get('/api/socios',        (ctx) => deps.handleGetSocios(ctx.res));
  router.post('/api/socios',       (ctx) => deps.handlePostSocio(ctx.body, ctx.res));
  router.put('/api/socios/:id',    (ctx) => deps.handlePutSocio(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/socios/:id', (ctx) => deps.handleDeleteSocio(ctx.params[0], ctx.res));

  // ── Investimentos ──
  router.get('/api/investimentos',        (ctx) => deps.handleGetInvestimentos(ctx.res));
  router.post('/api/investimentos',       (ctx) => deps.handlePostInvestimento(ctx.body, ctx.res));
  router.delete('/api/investimentos/:id', (ctx) => deps.handleDeleteInvestimento(ctx.params[0], ctx.res));
};
