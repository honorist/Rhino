'use strict';
/**
 * @file Rotas de plataforma/sistema — auditoria, usuários, saúde, métricas,
 * IA, feature flags, busca global, stream de eventos, níveis de acesso, push.
 *
 * Fase 2 do desmembramento do server.js. Handlers e utilitários (`bus`,
 * `sendJson`) são injetados via `deps` — os handlers continuam no server.js.
 *
 * @param {object} router  Instância de lib/router.js.
 * @param {object} deps    { bus, sendJson, handle* ... }
 */
module.exports = function registerPlatform(router, deps) {
  const { bus, sendJson } = deps;

  // ── Auditoria ──
  router.get('/api/audit', (ctx) => deps.handleGetAudit(ctx.parsedUrl.query, ctx.res));

  // ── Usuários (CRUD) ──
  router.get('/api/users',        (ctx) => deps.handleGetUsers(ctx.req, ctx.res));
  router.post('/api/users',       (ctx) => deps.handlePostUser(ctx.req, ctx.body, ctx.res));
  router.put('/api/users/:id',    (ctx) => deps.handlePutUser(ctx.req, ctx.params[0], ctx.body, ctx.res));
  router.delete('/api/users/:id', (ctx) => deps.handleDeleteUser(ctx.params[0], ctx.req, ctx.res));

  // ── Saúde / métricas / uso de IA ──
  router.get('/api/ai-usage/stats', (ctx) => deps.handleAiUsageStats(ctx.res));
  router.get('/api/health',         (ctx) => deps.handleHealth(ctx.res));
  router.get('/api/metrics',        (ctx) => deps.handleMetrics(ctx.res, ctx.req));

  // ── Admin ──
  router.get('/api/admin/arquivos', (ctx) => deps.handleGetAdminArquivos(ctx.res));

  // ── IA ──
  router.post('/api/ai/chat',             (ctx) => deps.handleAiChat(ctx.body, ctx.res));
  router.post('/api/ai/classify-expense', (ctx) => deps.handleAiClassify(ctx.body, ctx.res));

  // ── Feature flags ──
  router.get('/api/feature-flags',     (ctx) => deps.handleGetFeatureFlags(ctx.res));
  router.put('/api/feature-flags/:id', (ctx) => deps.handlePutFeatureFlag(ctx.params[0], ctx.body, ctx.res));

  // ── Busca global ──
  router.get('/api/search', (ctx) => deps.handleGlobalSearch(ctx.parsedUrl.query, ctx.res));

  // ── Stream de eventos em tempo real / quem está online ──
  router.get('/api/stream', (ctx) => bus.attach(ctx.req, ctx.res, {
    userId: ctx.req.user?.id,
    userEmail: ctx.req.user?.email,
  }));
  router.get('/api/online', (ctx) => sendJson(ctx.res, { online: bus.online() }));

  // ── Níveis de acesso ──
  router.get('/api/niveis-acesso',     (ctx) => deps.handleGetNiveisAcesso(ctx.res));
  router.put('/api/niveis-acesso/:id', (ctx) => deps.handlePutNivelAcesso(ctx.params[0], ctx.body, ctx.res));

  // ── Push notifications ──
  router.get('/api/push/vapid-public-key', (ctx) =>
    sendJson(ctx.res, { publicKey: process.env.VAPID_PUBLIC_KEY || null }));
  router.post('/api/push/subscribe', (ctx) =>
    deps.handlePushSubscribe(ctx.body, ctx.req.user?.id || null, ctx.res));
  router.post('/api/push/unsubscribe', (ctx) =>
    deps.handlePushUnsubscribe(ctx.body, ctx.req, ctx.res));

  // ── Dashboard / backup / anomalias / LGPD ──
  router.get('/api/dashboard',       (ctx) => deps.handleDashboard(ctx.res, ctx.parsedUrl.query));
  router.post('/api/backup',         (ctx) => deps.handleBackup(ctx.res));
  router.get('/api/backup/download', (ctx) => deps.handleBackupDownload(ctx.res));
  router.post('/api/backup/email',   (ctx) => {
    deps._runEmailBackup().catch((e) => console.error('[backup/email]', e.message));
    sendJson(ctx.res, { ok: true, message: `Backup iniciado — será enviado para ${deps.BACKUP_EMAIL}` });
  });
  router.get('/api/anomalias',            (ctx) => deps.handleGetAnomalias(ctx.res));
  router.get('/api/lgpd/export',          (ctx) => deps.handleLgpdExport(ctx.req, ctx.res));
  router.post('/api/lgpd/delete-account', (ctx) => deps.handleLgpdDelete(ctx.req, ctx.res));
};
