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
  router.get('/api/caixa',        (ctx) => deps.handleGetCaixa(ctx.res, ctx.parsedUrl.query));
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

  // ── Tipos de base ──
  router.get('/api/tipos-base',        (ctx) => deps.handleGetTiposBase(ctx.res));
  router.post('/api/tipos-base',       (ctx) => deps.handlePostTipoBase(ctx.body, ctx.res));
  router.put('/api/tipos-base/:id',    (ctx) => deps.handlePutTipoBase(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/tipos-base/:id', (ctx) => deps.handleDeleteTipoBase(ctx.params[0], ctx.res));

  // ── Contas a pagar ── (POST e pagar passam por withIdempotency)
  router.get('/api/contas-pagar',  (ctx) => deps.handleGetContasPagar(ctx.res));
  router.post('/api/contas-pagar', (ctx) => deps.withIdempotency(ctx.req, ctx.res, ctx.pathname, ctx.body,
    () => deps.handlePostContaPagar(ctx.body, ctx.res)));
  router.put('/api/contas-pagar/:id',    (ctx) => deps.handlePutContaPagar(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/contas-pagar/:id', (ctx) => deps.handleDeleteContaPagar(ctx.params[0], ctx.res));
  router.post('/api/contas-pagar/:id/pagar', (ctx) => deps.withIdempotency(ctx.req, ctx.res, ctx.pathname, ctx.body,
    () => deps.handlePagarConta(ctx.params[0], ctx.body, ctx.res)));
  router.post('/api/contas-pagar/:id/estornar', (ctx) => deps.handleEstornarConta(ctx.params[0], ctx.res));
  router.post('/api/contas-pagar/processar-recorrencias', (ctx) => deps.handleProcessarRecorrencias(ctx.res));

  // ── Folha de pagamento ── (gerar e pagar passam por withIdempotency)
  router.get('/api/folha-pagamento',         (ctx) => deps.handleGetFolha(ctx.parsedUrl.query, ctx.res));
  router.post('/api/folha-pagamento/gerar',  (ctx) => deps.withIdempotency(ctx.req, ctx.res, ctx.pathname, ctx.body,
    () => deps.handleGerarFolha(ctx.body, ctx.res)));
  router.post('/api/folha-pagamento/limpar', (ctx) => deps.handleLimparFolha(ctx.body, ctx.res));
  router.post('/api/folha-pagamento/:id/pagar', (ctx) => deps.withIdempotency(ctx.req, ctx.res, ctx.pathname, ctx.body,
    () => deps.handlePagarFolhaParcela(ctx.params[0], ctx.body, ctx.res)));
  router.post('/api/folha-pagamento/:id/estornar', (ctx) => deps.handleEstornarFolhaParcela(ctx.params[0], ctx.body, ctx.res));
  router.post('/api/folha-pagamento/:id/itens',    (ctx) => deps.handleAddFolhaItem(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/folha-pagamento/:id/itens/:itemId', (ctx) => deps.handleRemoveFolhaItem(ctx.params[0], ctx.params[1], ctx.res));
  router.put('/api/folha-pagamento/:id/itens/:itemId',    (ctx) => deps.handleUpdateFolhaItem(ctx.params[0], ctx.params[1], ctx.body, ctx.res));

  // ── Notas fiscais ──
  router.get('/api/notas-fiscais',  (ctx) => deps.handleGetNotasFiscais(ctx.res));
  router.post('/api/notas-fiscais', (ctx) => deps.handlePostNotaFiscal(ctx.body, ctx.res));
  router.post('/api/notas-fiscais/:id/emitir',           (ctx) => deps.handleEmitirNotaFiscal(ctx.params[0], ctx.body, ctx.res));
  router.post('/api/notas-fiscais/:id/cancelar-emissao', (ctx) => deps.handleCancelarEmissao(ctx.params[0], ctx.res));
  router.put('/api/notas-fiscais/:id',    (ctx) => deps.handlePutNotaFiscal(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/notas-fiscais/:id', (ctx) => deps.handleDeleteNotaFiscal(ctx.params[0], ctx.res));

  // ── Cobrança mensal ──
  router.get('/api/cobranca-mensal/historico',      (ctx) => deps.handleCobrancaHistorico(ctx.req, ctx.res));
  router.get('/api/cobranca-mensal/projecao-atual', (ctx) => deps.handleCobrancaProjecaoAtual(ctx.req, ctx.res));
  router.get(/^\/api\/cobranca-mensal\/(\d{4})\/(\d{1,2})$/,
    (ctx) => deps.handleCobrancaMensal(ctx.req, parseInt(ctx.params[0]), parseInt(ctx.params[1]), ctx.res));

  // ── Importação de extrato bancário (OFX) ──
  router.post('/api/caixa/importar-ofx', (ctx) => deps.handleImportarOfx(ctx.req, ctx.res));
};
