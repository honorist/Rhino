'use strict';
/**
 * @file Rotas comerciais — clientes, fornecedores, cláusulas, propostas,
 * apresentação global e case-logos.
 *
 * Fase 2 do desmembramento. `POST /api/case-logos` NÃO entra aqui: é upload
 * multipart tratado no createServer do server.js, antes do routeRequest.
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
  // "Ver portal como cliente" — super admin only (gate dentro do handler)
  router.post('/api/clientes/:id/portal-impersonate',
    (ctx) => deps.handlePortalImpersonate(ctx.req, ctx.params[0], ctx.res));

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

  // ── Propostas comerciais ──
  router.get('/api/propostas',        (ctx) => deps.handleGetPropostas(ctx.res));
  router.post('/api/propostas',       (ctx) => deps.handlePostProposta(ctx.body, ctx.res));
  router.get('/api/propostas/:id',    (ctx) => deps.handleGetProposta(ctx.params[0], ctx.res));
  router.put('/api/propostas/:id',    (ctx) => deps.handlePutProposta(ctx.params[0], ctx.body, ctx.res));
  router.patch('/api/propostas/:id',  (ctx) => deps.handlePutProposta(ctx.params[0], ctx.body, ctx.res)); // PATCH reusa PUT
  router.delete('/api/propostas/:id', (ctx) => deps.handleDeleteProposta(ctx.params[0], ctx.res));
  router.post('/api/propostas/:id/enviar',   (ctx) => deps.handleEnviarProposta(ctx.params[0], ctx.res));
  router.post('/api/propostas/:id/aceitar',  (ctx) => deps.handleAceitarProposta(ctx.params[0], ctx.res));
  router.post('/api/propostas/:id/rejeitar', (ctx) => deps.handleRejeitarProposta(ctx.params[0], ctx.body, ctx.res));
  router.post('/api/propostas/:id/duplicar', (ctx) => deps.handleDuplicarProposta(ctx.params[0], ctx.res));
  router.post('/api/propostas/:id/custos',           (ctx) => deps.handlePostPropostaCusto(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/propostas/:id/custos/:custoId',   (ctx) => deps.handlePutPropostaCusto(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/propostas/:id/custos/:custoId', (ctx) => deps.handleDeletePropostaCusto(ctx.params[0], ctx.params[1], ctx.res));
  router.post('/api/propostas/:id/anexos',            (ctx) => deps.handleUploadPropostaAnexo(ctx.params[0], ctx.req, ctx.res));
  router.get('/api/propostas/:id/anexos/:anexoId',    (ctx) => deps.handleGetPropostaAnexo(ctx.params[0], ctx.params[1], ctx.res));
  router.put('/api/propostas/:id/anexos/:anexoId',    (ctx) => deps.handlePutPropostaAnexo(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/propostas/:id/anexos/:anexoId', (ctx) => deps.handleDeletePropostaAnexo(ctx.params[0], ctx.params[1], ctx.res));
  router.get('/api/propostas/:id/docx',    (ctx) => deps.handleGetPropostaDocx(ctx.params[0], ctx.res));
  router.get('/api/propostas/:id/pdf',     (ctx) => deps.handleGetPropostaPdf(ctx.params[0], ctx.res));
  router.get('/api/propostas/:id/preview', (ctx) => deps.handleGetPropostaPreview(ctx.params[0], ctx.res));

  // ── Apresentação global da proposta ──
  router.get('/api/app-settings/proposta_apresentacao', (ctx) => deps.handleGetApresentacao(ctx.res));
  router.put('/api/app-settings/proposta_apresentacao', (ctx) => deps.handlePutApresentacao(ctx.body, ctx.res));

  // ── Case logos ── (POST /api/case-logos é multipart, tratado no server.js)
  router.get('/api/case-logos',           (ctx) => deps.handleGetCaseLogos(ctx.res));
  router.get('/api/case-logos/:id/image', (ctx) => deps.handleGetCaseLogoImage(ctx.params[0], ctx.res));
  router.put('/api/case-logos/:id',       (ctx) => deps.handlePutCaseLogo(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/case-logos/:id',    (ctx) => deps.handleDeleteCaseLogo(ctx.params[0], ctx.res));
};
