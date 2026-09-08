'use strict';
/**
 * @file Instrumentação básica de uso — achado 6.3 da varredura 2026-09-08:
 * 13 módulos novos (SSMA, ponto, NR, EPIs, composições, data book, punch
 * list, HH, DRE, EVM/Curva S, cotações, subcontratados, ferramentas,
 * equipamentos) foram ao ar sem nenhum sinal de quantas pessoas os abrem.
 *
 * Contador agregado por (tela, dia) — de propósito o mínimo possível: sem
 * PII, sem cliques individuais rastreados.
 */
const repos = require('../db/repos');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');

/** Só aceita hash de rota (#/algo), descartando querystring/params — a tela
 *  é a MESMA independente de `?docs=vencidos` ou `/123` no fim. */
const TELA_RE = /^#\/[a-z0-9_-]+/i;

/** POST /api/telemetria/visita — registra que a tela foi aberta hoje. */
async function handleRegistrarVisita(req, body, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  const telaRaw = body && body.tela;
  if (!telaRaw || typeof telaRaw !== 'string') return sendError(res, 400, 'tela é obrigatória');
  const m = TELA_RE.exec(telaRaw);
  if (!m) return sendError(res, 400, 'Formato de tela inválido');
  const tela = m[0];
  try {
    const hoje = new Date().toISOString().split('T')[0];
    await repos.telaVisitas.incrementar(tela, hoje);
  } catch (e) {
    // Telemetria nunca pode quebrar a navegação do usuário.
    console.warn('[telemetria] falha ao registrar visita:', e.message);
  }
  sendJson(res, { ok: true });
}

/** GET /api/telemetria/resumo?dias=30 — admin: adoção por tela. */
async function handleResumoVisitas(req, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  if (!perms.isSuperAdmin(req.user)) return sendError(res, 403, 'Acesso restrito a administradores');
  try {
    const dias = parseInt(req.query && req.query.dias, 10) || 30;
    const resumo = await repos.telaVisitas.resumoPorTela(dias);
    sendJson(res, { resumo, dias });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = { handleRegistrarVisita, handleResumoVisitas };
