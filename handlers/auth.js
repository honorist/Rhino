'use strict';
/**
 * @file Handlers de autenticação — /api/auth/*
 *
 * Fase A do desmembramento do server.js: os handlers saem do monólito para
 * módulos por domínio. Dependem só de libs — sem estado do server.js.
 */
const auth = require('../lib/auth');
const perms = require('../lib/permissions');
const email = require('../lib/email');
const queue = require('../lib/queue');
const pgRateLimit = require('../lib/pg-rate-limit');
const { sendJson, sendError } = require('../lib/http-respond');

async function handleLogin(req, body, res) {
  try {
    const emailIn = (body.email || '').trim();
    const password = body.password || '';
    if (!emailIn || !password) return sendError(res, 400, 'Email e senha são obrigatórios');

    // Rate limit: 5 tentativas FALHAS / 15 min por IP+email.
    // Logins bem sucedidos NÃO contam — refund é chamado abaixo.
    // FIX SEC-09: persistente em Postgres — sobrevive a restarts (antes
    // o bucket in-memory zerava em cada redeploy do Railway).
    const rlKey = pgRateLimit.clientKey(req, 'login:' + emailIn.toLowerCase());
    const rlPeek = await pgRateLimit.check(rlKey, { max: 5, windowMs: 15 * 60 * 1000 });
    if (!rlPeek.ok) {
      res.setHeader('Retry-After', rlPeek.retryAfterSec);
      return sendError(res, 429, `Muitas tentativas. Tente novamente em ${rlPeek.retryAfterSec} segundos.`);
    }

    const user = await auth.findUserByEmail(emailIn);
    const ok = user ? await auth.verify(password, user.passwordHash) : false;
    if (!user || !ok) {
      // Falhou — o registro feito por check() acima permanece (conta como falha)
      return sendError(res, 401, 'Credenciais inválidas');
    }
    // Sucesso — devolve o slot consumido
    await pgRateLimit.refund(rlKey);

    const session = await auth.createSession(user.id);
    auth.setSessionCookie(res, session.id, session.expiresAt);
    await auth.bumpLastLogin(user.id);

    sendJson(res, {
      user: {
        id: user.id, email: user.email, name: user.name,
        nivelAcessoId: user.nivelAcessoId, socioId: user.socioId,
        acceptedTermsAt: user.acceptedTermsAt || null,
      },
      permissions: await perms.summary(user),
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleForgotPassword(req, body, res) {
  try {
    const emailIn = (body.email || '').trim().toLowerCase();
    if (!emailIn) return sendError(res, 400, 'Email é obrigatório');

    // Rate limit: 3 / hora por IP+email (evita spam de envio) — persistente em PG
    const rlKey = pgRateLimit.clientKey(req, 'forgot:' + emailIn);
    const rl = await pgRateLimit.check(rlKey, { max: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.ok) {
      // Resposta genérica pra não vazar info de rate limit por usuário
      return sendJson(res, { ok: true, message: 'Se o email existir, enviamos as instruções.' });
    }

    const user = await auth.findUserByEmail(emailIn);
    // Sempre responde sucesso (não vazar quais emails existem)
    if (user) {
      const { token } = await auth.createResetToken(user.id);
      // FIX SEC-03: link de reset usa APP_BASE_URL (variável de ambiente) como fonte
      // de verdade — NUNCA os headers Origin/Host, que podem ser forjados pelo
      // atacante apontando o link de email para domínio controlado por ele.
      const origin = process.env.APP_BASE_URL || 'http://localhost:3001';
      const link = `${origin}/?action=reset-password&token=${token}`;
      const tmpl = email.tmplResetPassword({ nome: user.name, link, expiraEm: '1 hora' });
      const msg = { to: user.email, subject: 'Rhino — redefinir sua senha', html: tmpl.html, text: tmpl.text };
      // Enfileira o envio para não bloquear o request. Se a fila estiver
      // indisponível, envia inline — o reset de senha nunca pode se perder.
      const jobId = await queue.enqueue('email', msg).catch(() => null);
      if (!jobId) await email.send(msg);
    }
    sendJson(res, { ok: true, message: 'Se o email existir, enviamos as instruções.' });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleResetPassword(req, body, res) {
  try {
    // Rate limit: 10 / hora por IP (resgate de token) — persistente em PG
    const rlKey = pgRateLimit.clientKey(req, 'reset-password');
    const rl = await pgRateLimit.check(rlKey, { max: 10, windowMs: 60 * 60 * 1000 });
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      return sendError(res, 429, 'Muitas tentativas. Tente novamente mais tarde.');
    }
    const token = (body.token || '').trim();
    const newPassword = body.password || '';
    if (!token || !newPassword) return sendError(res, 400, 'Token e nova senha são obrigatórios');
    if (newPassword.length < 8) return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');

    const result = await auth.consumeResetToken(token, newPassword);
    if (!result) return sendError(res, 400, 'Token inválido ou expirado');
    sendJson(res, { ok: true, email: result.email });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleAcceptTerms(req, res) {
  try {
    if (!req.user) return sendError(res, 401, 'Não autenticado');
    await auth.acceptTerms(req.user.id, '1.0');
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleLogout(req, res) {
  try {
    const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
    await auth.destroySession(sid);
    auth.clearSessionCookie(res);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleMe(req, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  const u = req.user;
  sendJson(res, {
    user: {
      id: u.id, email: u.email, name: u.name,
      nivelAcessoId: u.nivelAcessoId, socioId: u.socioId,
      acceptedTermsAt: u.acceptedTermsAt || null,
    },
    permissions: await perms.summary(u),
  });
}

module.exports = {
  handleLogin, handleLogout, handleMe,
  handleForgotPassword, handleResetPassword, handleAcceptTerms,
};
