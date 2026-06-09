'use strict';
/**
 * @file Rotas do subsistema de Recrutamento (US-05 a US-09).
 * Padrão idêntico a routes/auth.js — handlers vivem em handlers/recrutamento.js.
 *
 * @param {object} router      Instância de lib/router.js.
 * @param {object} [handlers]  Override de handlers (testes).
 */
module.exports = function registerRecrutamento(router, handlers) {
  // Junta os handlers do fluxo (handlers/recrutamento) com os de arquivo de
  // documento de candidato (handlers/candidato-documentos). Sem colisão de nome.
  const h = handlers || {
    ...require('../handlers/recrutamento'),
    ...require('../handlers/candidato-documentos'),
  };

  // Solicitações de contratação (US-05)
  router.get('/api/recrutamento/solicitacoes', (ctx) => h.listarSolicitacoes(ctx.req, ctx.res));
  router.post('/api/recrutamento/solicitacoes', (ctx) =>
    h.criarSolicitacao(ctx.req, ctx.body, ctx.res));
  router.get('/api/recrutamento/solicitacoes/:id', (ctx) =>
    h.obterSolicitacao(ctx.req, ctx.res, ctx.params[0]));
  router.post('/api/recrutamento/solicitacoes/:id/cancelar', (ctx) =>
    h.cancelarSolicitacao(ctx.req, ctx.res, ctx.params[0]));

  // Candidatos (US-06 a US-09)
  router.post('/api/recrutamento/vagas/:id/candidatos', (ctx) =>
    h.adicionarCandidato(ctx.req, ctx.body, ctx.res, ctx.params[0]));
  router.patch('/api/recrutamento/candidatos/:id/triagem', (ctx) =>
    h.atualizarTriagem(ctx.req, ctx.body, ctx.res, ctx.params[0]));
  router.patch('/api/recrutamento/candidatos/:id/antecedentes', (ctx) =>
    h.atualizarAntecedentes(ctx.req, ctx.body, ctx.res, ctx.params[0]));
  router.post('/api/recrutamento/candidatos/:id/documentos/:tipo', (ctx) =>
    h.anexarDocumento(ctx.req, ctx.body, ctx.res, ctx.params[0], ctx.params[1]));
  // Arquivo (BYTEA) do documento — Etapa 4.3. O POST é interceptado no
  // createServer (multipart, pula o body parser); registrado aqui por simetria.
  router.post('/api/recrutamento/candidatos/:id/documentos/:tipo/arquivo', (ctx) =>
    h.handlePostCandidatoDocArquivo(ctx.params[0], ctx.params[1], ctx.req, ctx.res));
  router.get('/api/recrutamento/candidatos/:id/documentos/:tipo/arquivo', (ctx) =>
    h.handleGetCandidatoDocArquivo(ctx.params[0], ctx.params[1], ctx.res));
  router.delete('/api/recrutamento/candidatos/:id/documentos/:tipo/arquivo', (ctx) =>
    h.handleDeleteCandidatoDocArquivo(ctx.params[0], ctx.params[1], ctx.res));
  router.post('/api/recrutamento/candidatos/:id/aprovar', (ctx) =>
    h.aprovarCandidato(ctx.req, ctx.body, ctx.res, ctx.params[0]));

  // Notificações in-app (consumido pela sidebar/bell)
  router.get('/api/notificacoes', (ctx) => h.listarNotificacoes(ctx.req, ctx.res));
  router.post('/api/notificacoes/:id/marcar-lida', (ctx) =>
    h.marcarLida(ctx.req, ctx.res, ctx.params[0]));
};
