'use strict';
/**
 * @file Rotas comerciais — clientes, fornecedores, cláusulas (biblioteca).
 *
 * Fase 2 do desmembramento. Propostas, apresentação global e case-logos
 * entram numa etapa seguinte (têm upload multipart e sub-recursos).
 *
 * @param {object} router  Instância de lib/router.js.
 * @param {object} deps    { handle* ... }
 */
module.exports = function registerComercial(router, deps) {
  // ── Clientes ──
  router.get('/api/clientes',        (ctx) => deps.handleGetClientes(ctx.res));
  router.post('/api/clientes',       (ctx) => deps.handlePostCliente(ctx.body, ctx.res));
  router.put('/api/clientes/:id',    (ctx) => deps.handlePutCliente(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/clientes/:id', (ctx) => deps.handleDeleteCliente(ctx.params[0], ctx.res));

  // ── Fornecedores ──
  router.get('/api/fornecedores',        (ctx) => deps.handleGetFornecedores(ctx.res));
  router.post('/api/fornecedores',       (ctx) => deps.handlePostFornecedor(ctx.body, ctx.res));
  router.put('/api/fornecedores/:id',    (ctx) => deps.handlePutFornecedor(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/fornecedores/:id', (ctx) => deps.handleDeleteFornecedor(ctx.params[0], ctx.res));

  // ── Cláusulas (biblioteca) ── (GET recebe res + query, nessa ordem)
  router.get('/api/clausulas',        (ctx) => deps.handleGetClausulas(ctx.res, ctx.parsedUrl.query));
  router.post('/api/clausulas',       (ctx) => deps.handlePostClausula(ctx.body, ctx.res));
  router.put('/api/clausulas/:id',    (ctx) => deps.handlePutClausula(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/clausulas/:id', (ctx) => deps.handleDeleteClausula(ctx.params[0], ctx.res));
};
