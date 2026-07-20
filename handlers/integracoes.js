'use strict';
/**
 * @file Integrações e recursos transversais — LGPD (export/anonimização dos
 * dados do próprio usuário), IA (chat assistente financeiro e classificação de
 * despesa via Claude Haiku, com rate-limit por usuário e gate de tela) e
 * importação/conciliação de extrato OFX. Inclui as estatísticas de uso da IA.
 * Extraído do server.js (desmembramento), sem alteração de lógica.
 *
 * blockIfNoScreenAccess veio junto: espelha no servidor o gate de tela do
 * frontend e só é usado pelos endpoints de IA. As chamadas à API Anthropic são
 * feitas com fetch + AbortSignal.timeout para não pendurar o worker.
 */
const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');
const crypto = require('crypto');
const rateLimit = require('../lib/rate-limit');
const perms = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');

async function handleAiUsageStats(res) {
  try {
    const [monthly, allTime] = await Promise.all([
      db.getOne(`
        SELECT
          COUNT(*)::int AS calls,
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM ai_usage
        WHERE ts >= date_trunc('month', NOW())
      `),
      db.getOne(`
        SELECT
          COUNT(*)::int AS calls,
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM ai_usage
      `),
    ]);
    return sendJson(res, { ok: true, monthly, allTime });
  } catch (e) {
    return sendError(res, 500, e.message);
  }
}

/**
 * Espelha no servidor o gate de acesso a tela do frontend (`podeAcessar`):
 * perfis restritos só acessam rotas NÃO-universais que estejam em suas `abas`.
 * Para endpoints que não são mutação de dados nem admin-only mas pertencem a
 * uma tela específica (ex.: IA). Super admin (abas = null) sempre passa.
 *
 * @param {object} req     `req` com `req.user` já resolvido.
 * @param {import('http').ServerResponse} res
 * @param {string} screen  Rota da tela, ex.: '#/ai-chat'.
 * @returns {Promise<boolean>} true se BLOQUEOU (403 já enviado).
 */
async function blockIfNoScreenAccess(req, res, screen) {
  if (perms.isSuperAdmin(req.user)) return false;
  const abas = await perms.loadAbas(req.user);
  if (abas && !abas.includes(screen)) {
    sendError(res, 403, 'Você não tem acesso a esta tela.');
    return true;
  }
  return false;
}

// ============ F13: LGPD ============
async function handleLgpdExport(req, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  try {
    const userId = req.user.id;
    const user = await repos.users.findById(userId);
    const sessions = await db.getMany(
      'SELECT id, created_at, expires_at FROM sessions WHERE user_id = $1',
      [userId]
    );
    const auditRows = await db.getMany(
      'SELECT ts, method, path, entity, action FROM audit_log WHERE user_id = $1 ORDER BY ts DESC LIMIT 200',
      [userId]
    );
    const data = {
      usuario: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        acceptedTermsAt: user.acceptedTermsAt,
      },
      sessoes: sessions,
      historico_auditoria: auditRows,
      exportado_em: new Date().toISOString(),
    };
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="rhino-lgpd-${userId}.json"`,
    });
    res.end(JSON.stringify(data, null, 2));
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleLgpdDelete(req, res) {
  if (!req.user) return sendError(res, 401, 'Não autenticado');
  try {
    const userId = req.user.id;
    const anonEmail = `deleted_${userId}@lgpd.rhino`;
    const anonHash = await auth.hash(crypto.randomBytes(32).toString('hex'));
    await repos.users.updateById(userId, {
      email: anonEmail,
      name: '[Dados excluídos]',
      passwordHash: anonHash,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    auth.clearSessionCookie(res);
    sendJson(res, { ok: true, message: 'Dados anonimizados conforme LGPD. Sessão encerrada.' });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// Rate-limit por usuário nas rotas de IA: cada chamada custa créditos Anthropic.
// Protege a fatura contra abuso/loop acidental do cliente (defesa que o gate de
// acesso não cobre — um usuário autorizado ainda poderia disparar em excesso).
const AI_RATE_LIMIT = { max: 20, windowMs: 5 * 60 * 1000 }; // 20 chamadas / 5 min
function _checkAiRateLimit(req, res) {
  const rl = rateLimit.check(`ai:${req.user?.id || 'anon'}`, AI_RATE_LIMIT);
  if (!rl.ok) {
    res.setHeader('Retry-After', rl.retryAfterSec);
    sendError(res, 429, 'Muitas requisições à IA em pouco tempo. Aguarde um momento.');
    return true;
  }
  return false;
}

// ============ F15: AI Chat ============
async function handleAiChat(req, body, res) {
  // IA não é tela universal e cada chamada custa créditos Anthropic + expõe um
  // resumo financeiro (saldo, contratos, contas a pagar). Bloqueia perfis sem
  // acesso à tela — mesmo critério do frontend (podeAcessar('#/ai-chat')).
  if (await blockIfNoScreenAccess(req, res, '#/ai-chat')) return;
  if (_checkAiRateLimit(req, res)) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return sendError(res, 503, 'ANTHROPIC_API_KEY não configurada');
  const message = (body.message || '').trim();
  if (!message) return sendError(res, 400, 'message é obrigatório');
  try {
    const [allContracts, caixaAll, contas] = await Promise.all([
      repos.contracts.findAll(),
      repos.caixa.findAll(),
      repos.contasPagar.findAll(),
    ]);
    const saldo = caixaAll.reduce(
      (s, e) => s + (e.type === 'entrada' ? 1 : -1) * (parseFloat(e.value) || 0),
      0
    );
    const pendentes = contas.filter((c) => c.status === 'pendente');
    const systemPrompt = `Você é o assistente financeiro do Rhino, sistema de gestão de contratos de construção civil.

Contexto atual:
- Contratos: ${allContracts.length} total, ${allContracts.filter((c) => c.status === 'ativo').length} ativos
- Saldo do caixa: R$ ${saldo.toFixed(2)}
- Contas a pagar: ${pendentes.length} pendentes, total R$ ${pendentes.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0).toFixed(2)}

Responda em português, de forma concisa e objetiva.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000), // não pendura o worker se a API externa travar
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    });
    if (!response.ok) return sendError(res, 502, 'Erro na API de IA');
    const data = await response.json();
    sendJson(res, { reply: data.content?.[0]?.text || '', model: data.model });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ F16: AI Auto-Classify Expense ============
async function handleAiClassify(req, body, res) {
  // Mesma proteção do handleAiChat: tela não-universal + custo por chamada.
  if (await blockIfNoScreenAccess(req, res, '#/ai-chat')) return;
  if (_checkAiRateLimit(req, res)) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return sendError(res, 503, 'ANTHROPIC_API_KEY não configurada');
  const { descricao, valor, fornecedor } = body;
  if (!descricao) return sendError(res, 400, 'descricao é obrigatório');
  try {
    const [tiposBase, allContracts] = await Promise.all([
      repos.tiposBase.findAll(),
      repos.contracts.findAll(),
    ]);
    const cats =
      tiposBase.map((t) => t.label || t.key).join(', ') ||
      'material, mão-de-obra, equipamento, administrativo, outros';
    const ctrs =
      allContracts
        .filter((c) => c.status === 'ativo')
        .map((c) => `${c.id}: ${c.name}`)
        .join('\n') || 'nenhum';
    const prompt = `Classifique esta despesa:
Descrição: ${descricao}
Valor: R$ ${valor || '?'}
Fornecedor: ${fornecedor || 'não informado'}

Categorias disponíveis: ${cats}
Contratos ativos:
${ctrs}

Responda APENAS com JSON válido:
{"category":"...","contractId":"..." ou null,"confidence":0.0,"justificativa":"..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000), // não pendura o worker se a API externa travar
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) return sendError(res, 502, 'Erro na API de IA');
    const apiData = await response.json();
    const text = apiData.content?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { category: 'outros', confidence: 0 };
    sendJson(res, result);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ F5: OFX Import ============
function _parseOFX(content) {
  const transacoes = [];
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\n\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const dtStr = get('DTPOSTED');
    if (!dtStr || dtStr.length < 8) continue;
    const data = `${dtStr.slice(0, 4)}-${dtStr.slice(4, 6)}-${dtStr.slice(6, 8)}`;
    const valor = parseFloat(get('TRNAMT')) || 0;
    const memo = get('MEMO') || get('NAME') || '';
    const fitid = get('FITID') || '';
    transacoes.push({ fitid, data, valor, memo, tipo: valor >= 0 ? 'entrada' : 'saida' });
  }
  return transacoes;
}

async function handleImportarOfx(req, res) {
  try {
    const chunks = [];
    const MAX_OFX_BYTES = 5 * 1024 * 1024; // 5 MB
    let totalSize = 0;
    await new Promise((resolve, reject) => {
      req.on('data', (d) => {
        totalSize += d.length;
        if (totalSize > MAX_OFX_BYTES) {
          req.destroy();
          return reject(new Error('Arquivo OFX muito grande (máx 5 MB)'));
        }
        chunks.push(d);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
    const ofxContent = Buffer.concat(chunks).toString('utf8');
    const transacoes = _parseOFX(ofxContent);
    if (transacoes.length === 0)
      return sendError(res, 400, 'Nenhuma transação encontrada no arquivo OFX');

    const caixaAll = await repos.caixa.findAll();
    const sugestoes = transacoes.map((t) => {
      const match = caixaAll.find((e) => {
        const vMatch = Math.abs((parseFloat(e.value) || 0) - Math.abs(t.valor)) < 0.02;
        const dMatch = Math.abs(new Date(e.date) - new Date(t.data)) <= 86400000;
        return vMatch && dMatch;
      });
      return {
        ...t,
        match: match ? { id: match.id, description: match.description, date: match.date } : null,
        status: match ? 'conciliado' : 'novo',
      };
    });
    sendJson(res, {
      transacoes: sugestoes,
      total: transacoes.length,
      novos: sugestoes.filter((t) => t.status === 'novo').length,
    });
  } catch (e) {
    sendError(res, 400, 'Erro ao processar OFX: ' + e.message);
  }
}

module.exports = {
  handleAiUsageStats,
  handleLgpdExport,
  handleLgpdDelete,
  handleAiChat,
  handleAiClassify,
  handleImportarOfx,
};
