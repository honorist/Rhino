'use strict';
/**
 * @file Portal do Cliente — autenticação própria (cookie rhino_portal, sessão de
 * 7 dias, rate-limit no login), "Ver portal como cliente" (impersonação por
 * super admin, sessão de 30 min marcada), dashboard do cliente (seus contratos/
 * NFs/RDOs) e PDF de RDO com gate de ownership. Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * applyPortalAuth é o middleware de sessão do portal — usado tanto no roteador
 * (registerPortal) quanto na interceptação de rotas do createServer.
 * As variantes de PROPOSTA do portal vivem em handlers/propostas.js (acopladas
 * aos geradores). handlePortalRdoPdf reusa o gerador de RDO de contract-rdos.js.
 */
const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');
const pgRateLimit = require('../lib/pg-rate-limit');
const portalImpersonate = require('../lib/portal-impersonate');
const contractRdosHandlers = require('./contract-rdos');
const { sendJson, sendError } = require('../lib/http-respond');

// ============ Portal do Cliente ============
const PORTAL_COOKIE = 'rhino_portal';
const PORTAL_SESSION_DAYS = 7;

async function applyPortalAuth(req, res) {
  const sid = auth.parseCookies(req)[PORTAL_COOKIE];
  if (!sid) {
    sendError(res, 401, 'Não autenticado no portal');
    return true;
  }
  const row = await db.getOne(
    `SELECT ps.cliente_id, ps.impersonated_by, c.nome, c.empresa, c.email
     FROM portal_sessions ps
     JOIN clientes c ON ps.cliente_id = c.id
     WHERE ps.id = $1 AND ps.expires_at > NOW()`,
    [sid]
  );
  if (!row) {
    sendError(res, 401, 'Sessão do portal expirada');
    return true;
  }
  // db.getOne converte colunas snake_case → camelCase (db/index.js):
  // ps.cliente_id chega como row.clienteId, ps.impersonated_by como
  // row.impersonatedBy. Ler em snake_case retorna undefined silencioso
  // (portal sem contratos e sem banner de impersonação).
  req.portalCliente = {
    id: row.clienteId,
    nome: row.nome,
    empresa: row.empresa,
    email: row.email,
    // "Ver como": sessão criada por super admin (NULL = sessão real do cliente)
    impersonadoPor: row.impersonatedBy || null,
  };
  return false;
}

async function handlePortalLogin(req, body, res) {
  try {
    const emailRaw = (body.email || '').trim().toLowerCase();
    const senha = body.senha || '';
    if (!emailRaw || !senha) return sendError(res, 400, 'Email e senha são obrigatórios');

    // Rate limit: 5 tentativas / 15 min por IP+email — persistente em PG
    const rlKey = pgRateLimit.clientKey(req, 'portal-login:' + emailRaw);
    const rl = await pgRateLimit.check(rlKey, { max: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      return sendError(
        res,
        429,
        `Muitas tentativas. Tente novamente em ${rl.retryAfterSec} segundos.`
      );
    }

    const cliente = await db.getOne(
      'SELECT id, nome, empresa, portal_password_hash FROM clientes WHERE LOWER(portal_email) = $1',
      [emailRaw]
    );
    // db.getOne cameliza: portal_password_hash → portalPasswordHash.
    if (!cliente || !cliente.portalPasswordHash)
      return sendError(res, 401, 'Email ou senha incorretos');

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(senha, cliente.portalPasswordHash);
    if (!ok) return sendError(res, 401, 'Email ou senha incorretos');

    // Sucesso — devolve slot consumido
    await pgRateLimit.refund(rlKey);

    // Token de 256 bits — generateId tinha ~32 bits de entropia, fraco demais
    // para credencial de sessão (espaço de busca de ~4 bi era forçável).
    const sid = 'pses_' + require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PORTAL_SESSION_DAYS * 86400 * 1000);
    await db.query('INSERT INTO portal_sessions (id, cliente_id, expires_at) VALUES ($1, $2, $3)', [
      sid,
      cliente.id,
      expiresAt.toISOString(),
    ]);
    const isProd = process.env.NODE_ENV === 'production';
    const cookieParts = [
      `${PORTAL_COOKIE}=${sid}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      `Max-Age=${PORTAL_SESSION_DAYS * 86400}`,
    ];
    if (isProd) cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    sendJson(res, {
      ok: true,
      cliente: { id: cliente.id, nome: cliente.nome, empresa: cliente.empresa },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalLogout(req, res) {
  const sid = auth.parseCookies(req)[PORTAL_COOKIE];
  if (sid) await db.query('DELETE FROM portal_sessions WHERE id = $1', [sid]).catch(() => {});
  const isProd = process.env.NODE_ENV === 'production';
  const cookieParts = [`${PORTAL_COOKIE}=`, 'HttpOnly', 'Path=/', 'SameSite=Strict', 'Max-Age=0'];
  if (isProd) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
  sendJson(res, { ok: true });
}

/**
 * POST /api/clientes/:id/portal-impersonate — "Ver portal como cliente".
 * Somente super admin (regra em lib/portal-impersonate.js). Cria sessão de
 * portal de 30 min marcada com `impersonated_by` e seta o cookie
 * `rhino_portal`; o cookie admin (`rhino_sid`) fica intacto — sair da
 * visualização é só o logout do portal. Auditoria: o middleware de audit já
 * captura POST /api/* (usuário, path, IP).
 */
async function handlePortalImpersonate(req, clienteId, res) {
  try {
    const erro = portalImpersonate.validarImpersonacao(req.user);
    if (erro) return sendError(res, req.user ? 403 : 401, erro);

    const cliente = await db.getOne('SELECT id, nome, empresa, email FROM clientes WHERE id = $1', [
      clienteId,
    ]);
    if (!cliente) return sendError(res, 404, 'Cliente não encontrado');

    const sessao = portalImpersonate.criarSessaoImpersonada(req.user.id);
    await db.query(
      'INSERT INTO portal_sessions (id, cliente_id, expires_at, impersonated_by) VALUES ($1, $2, $3, $4)',
      [sessao.sid, cliente.id, sessao.expiresAt.toISOString(), sessao.impersonatedBy]
    );

    const isProd = process.env.NODE_ENV === 'production';
    const cookieParts = [
      `${PORTAL_COOKIE}=${sessao.sid}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      `Max-Age=${portalImpersonate.IMPERSONATE_TTL_MIN * 60}`,
    ];
    if (isProd) cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    sendJson(res, {
      ok: true,
      cliente: { id: cliente.id, nome: cliente.nome, empresa: cliente.empresa },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * GET /api/portal/rdos/:id/pdf — PDF oficial do RDO para o cliente do portal.
 * Segurança: o RDO precisa pertencer a um contrato do cliente da sessão
 * (mesmo escopo do dashboard); caso contrário 404 — sem vazar existência.
 * Reusa o gerador do admin (template xlsx → LibreOffice, fallback pdfkit),
 * incluindo o guard de concorrência de handlers/contract-rdos.js.
 */
async function handlePortalRdoPdf(req, rdoId, res) {
  try {
    // db.getOne cameliza: contract_id → contractId, client_id → clientId.
    const rdo = await db.getOne('SELECT id, contract_id FROM rdos WHERE id = $1', [rdoId]);
    if (!rdo) return sendError(res, 404, 'RDO não encontrado');
    const contrato = await db.getOne('SELECT id, client_id FROM contracts WHERE id = $1', [
      rdo.contractId,
    ]);
    if (!contrato || contrato.clientId !== req.portalCliente.id) {
      return sendError(res, 404, 'RDO não encontrado');
    }
    return contractRdosHandlers.handleGetRdoPdf(contrato.id, rdoId, res);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalDashboard(req, res) {
  try {
    const clienteId = req.portalCliente.id;
    // findAllWithChildren({ clientId }) filtra no SQL e traz rdos/organograma/etc
    // — só os contratos deste cliente (antes carregava TODOS e filtrava em
    // memória). NFs ainda vêm completas e são filtradas por contractId abaixo.
    const [allContracts, allNfs] = await Promise.all([
      repos.contracts.findAllWithChildren({ clientId: clienteId }),
      repos.notasFiscais.findAll(),
    ]);

    const contratos = allContracts.map((c) => {
      const saidas = Array.isArray(c.saidas) ? c.saidas : [];
      const totalGasto = saidas.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
      const pct = c.value > 0 ? Math.min(100, Math.round((totalGasto / c.value) * 100)) : 0;
      const rdos = Array.isArray(c.rdos) ? c.rdos : [];
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        value: c.value,
        currency: c.currency || 'BRL',
        startDate: c.startDate,
        endDate: c.endDate,
        contractNumber: c.contractNumber,
        progresso: pct,
        totalRdos: rdos.length,
        ultimoRdo: rdos.length > 0 ? rdos[rdos.length - 1]?.data : null,
      };
    });

    const contratosIds = new Set(contratos.map((c) => c.id));
    const nfs = allNfs
      .filter((n) => contratosIds.has(n.contractId))
      .map((n) => ({
        id: n.id,
        numero: n.numero,
        valor: n.valor,
        status: n.status,
        dataEmissao: n.dataEmissao,
        contractId: n.contractId,
      }))
      .slice(-20);

    // Collect RDOs from the client's contracts (last 15 across all contracts, most recent first)
    const rdosAll = [];
    allContracts.forEach((c) => {
      const rdos = Array.isArray(c.rdos) ? c.rdos : [];
      rdos.forEach((r) => {
        const fotos = Array.isArray(r.fotos) ? r.fotos.slice(0, 4) : [];
        rdosAll.push({
          id: r.id,
          contractId: c.id,
          contractName: c.name,
          data: r.data,
          clima: r.clima,
          atividades: (r.atividades || '').slice(0, 200),
          fotos: fotos.map((f) => ({ id: f.id, url: f.url || f.path, legenda: f.legenda || '' })),
        });
      });
    });
    rdosAll.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const rdos = rdosAll.slice(0, 15);

    // `impersonado`: liga o banner "Visualizando como..." no portal (Ver como)
    sendJson(res, {
      cliente: req.portalCliente,
      contratos,
      nfs,
      rdos,
      impersonado: !!req.portalCliente.impersonadoPor,
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  applyPortalAuth,
  handlePortalLogin,
  handlePortalLogout,
  handlePortalImpersonate,
  handlePortalRdoPdf,
  handlePortalDashboard,
};
