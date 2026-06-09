'use strict';
/**
 * @file Rotas do Portal do Cliente — /api/portal/*
 *
 * Fase 2 do desmembramento. Exceto o login, toda rota do portal passa antes
 * por `applyPortalAuth` — que responde (401) e devolve truthy se a sessão
 * falhar; nesse caso o handler não roda.
 *
 * O catch-all de `/api/portal/*` desconhecido (404 do portal, após auth)
 * permanece no routeRequest do server.js — o router só registra rotas reais.
 */
module.exports = function registerPortal(router, handlers) {
  // Login — não passa por portal-auth.
  router.post('/api/portal/login', (ctx) => handlers.handlePortalLogin(ctx.req, ctx.body, ctx.res));

  // Portal-auth primeiro; se ela já respondeu, encerra sem chamar o handler.
  const comAuth = (fn) => async (ctx) => {
    if (await handlers.applyPortalAuth(ctx.req, ctx.res)) return;
    return fn(ctx);
  };

  router.post('/api/portal/logout',   comAuth((ctx) => handlers.handlePortalLogout(ctx.req, ctx.res)));
  router.get('/api/portal/dashboard', comAuth((ctx) => handlers.handlePortalDashboard(ctx.req, ctx.res)));
  router.get('/api/portal/propostas', comAuth((ctx) => handlers.handlePortalListPropostas(ctx.req, ctx.res)));
  router.get('/api/portal/propostas/:id/pdf',
    comAuth((ctx) => handlers.handlePortalPropostaPdf(ctx.req, ctx.params[0], ctx.res)));
  router.get('/api/portal/propostas/:id/docx',
    comAuth((ctx) => handlers.handlePortalPropostaDocx(ctx.req, ctx.params[0], ctx.res)));
  // PDF oficial do RDO — escopo: RDO de contrato do cliente da sessão.
  router.get('/api/portal/rdos/:id/pdf',
    comAuth((ctx) => handlers.handlePortalRdoPdf(ctx.req, ctx.params[0], ctx.res)));
};
