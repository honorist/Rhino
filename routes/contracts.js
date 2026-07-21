'use strict';
/**
 * @file Rotas de contratos — CRUD, saídas, orçamento, atividades/cronograma,
 * organograma, RDOs (diários de obra) + assinaturas, aditivos, marcos e
 * ocorrências. Inclui a visão global de RDOs (`GET /api/rdos`).
 *
 * Fase 2 do desmembramento do server.js. Handlers injetados via `deps`.
 *
 * @param {object} router  Instância de lib/router.js.
 * @param {object} deps    { handle* ... }
 */
module.exports = function registerContracts(router, deps) {
  // ── RDOs (visão global) ──
  router.get('/api/rdos', (ctx) => deps.handleGetRdosGlobal(ctx.res));

  // ── Contratos (CRUD) ── (PATCH reusa PUT — aceita campos parciais)
  router.get('/api/contracts',        (ctx) => deps.handleGetContracts(ctx.res, ctx.parsedUrl.query));
  router.post('/api/contracts',       (ctx) => deps.handlePostContract(ctx.body, ctx.res));
  router.put('/api/contracts/:id',    (ctx) => deps.handlePutContract(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/contracts/:id', (ctx) => deps.handleDeleteContract(ctx.params[0], ctx.res));
  router.patch('/api/contracts/:id',  (ctx) => deps.handlePutContract(ctx.params[0], ctx.body, ctx.res));

  // ── Saídas / orçamento ──
  router.post('/api/contracts/:id/saidas',             (ctx) => deps.handlePostSaida(ctx.params[0], ctx.body, ctx.res));
  router.post('/api/contracts/:id/budget',             (ctx) => deps.handlePostBudgetItem(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/budget/:budgetId',    (ctx) => deps.handlePutBudgetItem(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/budget/:budgetId', (ctx) => deps.handleDeleteBudgetItem(ctx.params[0], ctx.params[1], ctx.res));

  // ── BM estruturado: planilha de serviços + medições por itens + aprovação ──
  router.get('/api/contracts/:id/servicos',                (ctx) => deps.handleListContractServicos(ctx.params[0], ctx.res));
  router.post('/api/contracts/:id/servicos',               (ctx) => deps.handlePostContractServico(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/servicos/:servicoId',     (ctx) => deps.handlePutContractServico(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/servicos/:servicoId',  (ctx) => deps.handleDeleteContractServico(ctx.params[0], ctx.params[1], ctx.res));
  router.get('/api/contracts/:id/medicoes',                (ctx) => deps.handleGetContractMedicoes(ctx.params[0], ctx.res));
  router.post('/api/contracts/:id/medicoes',               (ctx) => deps.handlePostContractMedicao(ctx.params[0], ctx.body, ctx.res));
  router.post('/api/contracts/:id/bms/:nfId/aprovacao',    (ctx) => deps.handlePostBmAprovacao(ctx.params[0], ctx.params[1], ctx.body, ctx.req && ctx.req.user, ctx.res));

  // ── Atividades / cronograma ──
  router.get('/api/contracts/:id/atividades',           (ctx) => deps.handleListAtividades(ctx.params[0], ctx.res));
  router.post('/api/contracts/:id/atividades',          (ctx) => deps.handlePostAtividade(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/atividades/:atvId',    (ctx) => deps.handlePutAtividade(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/atividades/:atvId', (ctx) => deps.handleDeleteAtividade(ctx.params[0], ctx.params[1], ctx.res));
  router.get('/api/contracts/:id/curva-s',              (ctx) => deps.handleGetCurvaS(ctx.params[0], ctx.res));
  router.get('/api/contracts/:id/dre',                  (ctx) => deps.handleGetContractDre(ctx.params[0], ctx.res));

  // ── Organograma ── (DELETE recebe também body e query)
  router.post('/api/contracts/:id/organograma',             (ctx) => deps.handlePostMembroOrganograma(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/organograma/:membroId',    (ctx) => deps.handlePutMembroOrganograma(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/organograma/:membroId', (ctx) => deps.handleDeleteMembroOrganograma(ctx.params[0], ctx.params[1], ctx.body, ctx.res, ctx.parsedUrl.query));

  // ── RDO (diário de obra) ──
  router.post('/api/contracts/:id/rdos',          (ctx) => deps.handlePostRdo(ctx.params[0], ctx.body, ctx.res));
  router.get('/api/contracts/:id/rdos/:rdoId/pdf', (ctx) => deps.handleGetRdoPdf(ctx.params[0], ctx.params[1], ctx.res));
  router.put('/api/contracts/:id/rdos/:rdoId',    (ctx) => deps.handlePutRdo(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/rdos/:rdoId', (ctx) => deps.handleDeleteRdo(ctx.params[0], ctx.params[1], ctx.res));
  router.post('/api/contracts/:id/rdos/:rdoId/fotos',           (ctx) => deps.handlePostRdoFoto(ctx.params[0], ctx.params[1], ctx.req, ctx.res));
  router.delete('/api/contracts/:id/rdos/:rdoId/fotos/:fotoId', (ctx) => deps.handleDeleteRdoFoto(ctx.params[0], ctx.params[1], ctx.params[2], ctx.res));
  // Assinaturas do RDO — os handlers recebem (rdoId, ...); o contractId não é usado.
  router.get('/api/contracts/:id/rdos/:rdoId/assinaturas',           (ctx) => deps.handleListRdoAssinaturas(ctx.params[1], ctx.res));
  router.get('/api/contracts/:id/rdos/:rdoId/assinaturas/:assId',    (ctx) => deps.handleGetRdoAssinatura(ctx.params[1], ctx.params[2], ctx.res));
  router.delete('/api/contracts/:id/rdos/:rdoId/assinaturas/:assId', (ctx) => deps.handleDeleteRdoAssinatura(ctx.params[1], ctx.params[2], ctx.res));
  // Apontamento de HH por colaborador × atividade (sub-recurso do RDO).
  router.get('/api/contracts/:id/rdos/:rdoId/apontamentos', (ctx) => deps.handleListRdoApontamentos(ctx.params[0], ctx.params[1], ctx.res));
  router.put('/api/contracts/:id/rdos/:rdoId/apontamentos', (ctx) => deps.handlePutRdoApontamentos(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.get('/api/contracts/:id/produtividade-hh',         (ctx) => deps.handleGetContractProdutividade(ctx.params[0], ctx.res));

  // ── Punch list / Qualidade (item 11) ── (POST de foto é interceptado no server.js por ser multipart)
  router.get('/api/contracts/:id/punch',                    (ctx) => deps.handleListPunch(ctx.params[0], ctx.res));
  router.post('/api/contracts/:id/punch',                   (ctx) => deps.handlePostPunch(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/punch/:itemId',            (ctx) => deps.handlePutPunch(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/punch/:itemId',         (ctx) => deps.handleDeletePunch(ctx.params[0], ctx.params[1], ctx.res));
  router.post('/api/contracts/:id/punch/:itemId/fotos',            (ctx) => deps.handlePostPunchFoto(ctx.params[0], ctx.params[1], ctx.req, ctx.res));
  router.delete('/api/contracts/:id/punch/:itemId/fotos/:fotoId',  (ctx) => deps.handleDeletePunchFoto(ctx.params[0], ctx.params[1], ctx.params[2], ctx.res));

  // ── SSMA — Desvios e incidentes de segurança (item 7) ──
  router.get('/api/contracts/:id/ssma',             (ctx) => deps.handleListSsma(ctx.params[0], ctx.res, ctx.parsedUrl.query));
  router.post('/api/contracts/:id/ssma',            (ctx) => deps.handlePostSsma(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/ssma/:ocorrId',    (ctx) => deps.handlePutSsma(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/ssma/:ocorrId', (ctx) => deps.handleDeleteSsma(ctx.params[0], ctx.params[1], ctx.res));

  // ── Data book / prontidão de comissionamento (item 12) ──
  router.get('/api/contracts/:id/data-book',        (ctx) => deps.handleGetDataBook(ctx.params[0], ctx.res));

  // ── Aditivos ──
  router.post('/api/contracts/:id/aditivos',              (ctx) => deps.handlePostAditivo(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/aditivos/:aditivoId',    (ctx) => deps.handlePutAditivo(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/aditivos/:aditivoId', (ctx) => deps.handleDeleteAditivo(ctx.params[0], ctx.params[1], ctx.res));

  // ── Marcos ──
  router.post('/api/contracts/:id/marcos',            (ctx) => deps.handlePostMarco(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/marcos/:marcoId',    (ctx) => deps.handlePutMarco(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/marcos/:marcoId', (ctx) => deps.handleDeleteMarco(ctx.params[0], ctx.params[1], ctx.res));

  // ── Ocorrências ──
  router.post('/api/contracts/:id/ocorrencias',            (ctx) => deps.handlePostOcorrencia(ctx.params[0], ctx.body, ctx.res));
  router.put('/api/contracts/:id/ocorrencias/:ocorrId',    (ctx) => deps.handlePutOcorrencia(ctx.params[0], ctx.params[1], ctx.body, ctx.res));
  router.delete('/api/contracts/:id/ocorrencias/:ocorrId', (ctx) => deps.handleDeleteOcorrencia(ctx.params[0], ctx.params[1], ctx.res));

  // ── Saídas (edição/exclusão direta) ──
  router.put('/api/saidas/:id',    (ctx) => deps.handlePutSaida(ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/saidas/:id', (ctx) => deps.handleDeleteSaida(ctx.params[0], ctx.res));
};
