'use strict';
/**
 * @file Preferências de notificação por usuário (F19). O catálogo de tipos e
 * a regra de opt-out vivem em lib/notificacoes.js; aqui só a orquestração
 * HTTP (ler/gravar `users.notif_tipos_desativados` do usuário autenticado).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { TIPOS_CATALOGO } = require('../lib/notificacoes');

async function handleGetPreferenciasNotificacao(req, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  try {
    const user = await repos.users.findById(req.user.id);
    if (!user) return sendError(res, 404, 'Usuário não encontrado');
    sendJson(res, {
      catalogo: TIPOS_CATALOGO,
      tiposDesativados: user.notifTiposDesativados || [],
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutPreferenciasNotificacao(req, body, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  try {
    const enviados = Array.isArray(body.tiposDesativados) ? body.tiposDesativados : [];
    const validos = new Set(TIPOS_CATALOGO.map((t) => t.tipo));
    // Ignora tipo desconhecido em vez de rejeitar a requisição inteira — o
    // catálogo pode ter mudado entre o cliente carregar a tela e salvar.
    const tiposDesativados = [...new Set(enviados.filter((t) => validos.has(t)))];
    await repos.users.updateById(req.user.id, {
      notifTiposDesativados: JSON.stringify(tiposDesativados),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { ok: true, tiposDesativados });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = { handleGetPreferenciasNotificacao, handlePutPreferenciasNotificacao };
