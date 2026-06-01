'use strict';
/**
 * @file Rotas do Canal de Sugestões (RaiaPro História 2). Auto-contido (requer
 * os handlers diretamente, como routes/recrutamento). O upload de foto
 * (POST /api/sugestoes/:id/anexo) é multipart e é tratado no createServer.
 */
const h = require('../handlers/sugestoes');

module.exports = function registerSugestoes(router) {
  router.get('/api/sugestoes', (ctx) => h.listar(ctx.req, ctx.res));
  router.post('/api/sugestoes', (ctx) => h.criar(ctx.req, ctx.body, ctx.res));
  router.put('/api/sugestoes/:id/status', (ctx) => h.mudarStatus(ctx.req, ctx.body, ctx.res, ctx.params[0]));
  router.delete('/api/sugestoes/:id', (ctx) => h.excluir(ctx.req, ctx.res, ctx.params[0]));
  router.get('/api/sugestoes/:id/anexo', (ctx) => h.getAnexo(ctx.params[0], ctx.res));
  // POST /api/sugestoes/:id/anexo → multipart, despachado no createServer (server.js).
};
