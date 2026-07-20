'use strict';
/**
 * @file Plataforma — handlers transversais de feature que não pertencem a um
 * domínio de negócio específico: push notifications (subscribe/unsubscribe),
 * leitura da auditoria (com mascaramento de PII), detecção de anomalias de
 * gasto, processamento de contas recorrentes, feature flags, busca global e o
 * inventário de arquivos (admin). Extraído do server.js (desmembramento), sem
 * alteração de lógica.
 *
 * As rotas de OPS do próprio servidor (health, metrics, backup, changelog)
 * permanecem no server.js — dependem do estado de boot (APP_START, contadores
 * de request, job de backup agendado) e são a superfície de introspecção do
 * processo, não handlers de feature.
 */
const db = require('../db');
const repos = require('../db/repos');
const { generateId } = require('../lib/id');
const recorrencia = require('../lib/recorrencia');
const perms = require('../lib/permissions');
const audit = require('../lib/audit');
const { sendJson, sendError } = require('../lib/http-respond');

// ============ Push notifications ============
async function handlePushSubscribe(body, userId, res) {
  try {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth)
      return sendError(res, 400, 'Subscription inválida');
    const id = 'ps_' + Date.now().toString(36);
    await db.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (endpoint) DO UPDATE SET user_id=$2, p256dh=$4, auth=$5, created_at=NOW()`,
      [id, userId || null, body.endpoint, body.keys.p256dh, body.keys.auth]
    );
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * Remove uma push subscription do usuário autenticado.
 *
 * Apenas remove subscriptions que pertencem ao próprio usuário — sem isso, um
 * usuário autenticado poderia desativar notificações de qualquer outro (basta
 * conhecer o endpoint, que é semi-público em sites com SW).
 *
 * @param {{ endpoint?: string }} body  Payload com o endpoint a remover.
 * @param {import('http').IncomingMessage & { user?: { id: string } }} req  Request com user injetado pelo auth middleware.
 * @param {import('http').ServerResponse} res
 */
async function handlePushUnsubscribe(body, req, res) {
  try {
    if (
      !body?.endpoint ||
      typeof body.endpoint !== 'string' ||
      !body.endpoint.startsWith('https://')
    ) {
      return sendError(res, 400, 'Endpoint inválido');
    }
    if (!req.user?.id) return sendError(res, 401, 'Não autenticado');
    await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [
      body.endpoint,
      req.user.id,
    ]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Auditoria (leitura) ============
async function handleGetAudit(req, query, res) {
  // Auditoria NÃO é tela universal: espelha o gate do frontend (podeAcessar).
  // Sem isso, qualquer usuário logado lia o log inteiro (e-mails, IPs, estados)
  // chamando /api/audit direto. Super admin passa; perfis restritos só com
  // '#/auditoria' nas abas (perms.can resolve 'view' = abas.includes(rota)).
  if (!(await perms.can(req.user, 'auditoria', 'view'))) {
    return sendError(res, 403, 'Sem permissão para visualizar a auditoria.');
  }
  try {
    const limit = Math.min(500, parseInt(query.limit) || 100);
    const offset = Math.max(0, parseInt(query.offset) || 0);
    const data = await audit.listEvents({
      user: query.user || null,
      entity: query.entity || null,
      action: query.action || null,
      from: query.from || null,
      to: query.to || null,
      errorsOnly: query.errors === '1',
      limit,
      offset,
    });
    // Mascara PII/sensíveis ANTES de sair do servidor (nunca em claro no cliente).
    data.rows = (data.rows || []).map((r) => ({
      ...r,
      beforeState: audit.maskSensitive(r.beforeState),
      body: audit.maskSensitive(r.body),
    }));
    sendJson(res, data);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Anomalias de gasto + Contas recorrentes ============
async function handleGetAnomalias(res) {
  try {
    const caixaAll = await repos.caixa.findAll();
    const saidas = caixaAll.filter((e) => e.type === 'saida');

    const byCat = {};
    for (const s of saidas) {
      const cat = s.category || 'outros';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ v: parseFloat(s.value) || 0, entry: s });
    }

    const anomalias = [];
    for (const [cat, items] of Object.entries(byCat)) {
      if (items.length < 4) continue;
      const values = items.map((i) => i.v);
      const n = values.length;
      const mean = values.reduce((s, v) => s + v, 0) / n;
      const sigma = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);
      if (sigma < 1) continue;
      for (const { v, entry } of items) {
        if (v > mean + 2 * sigma) {
          anomalias.push({
            ...entry,
            category: cat,
            media: Math.round(mean * 100) / 100,
            sigma: Math.round(sigma * 100) / 100,
            desvios: ((v - mean) / sigma).toFixed(1),
            severidade: v > mean + 3 * sigma ? 'alta' : 'media',
          });
        }
      }
    }

    anomalias.sort((a, b) => parseFloat(b.desvios) - parseFloat(a.desvios));
    sendJson(res, { anomalias });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ F7: Contas Recorrentes ============
// Próxima data de recorrência — regra extraída para lib/recorrencia.js (testável).
const _calcProximaData = recorrencia.proximaData;

async function handleProcessarRecorrencias(res) {
  try {
    const hojeStr = new Date().toISOString().split('T')[0];
    const contas = await repos.contasPagar.findAll();
    const recorrentes = contas.filter(
      (c) =>
        c.recorrente && c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStr
    );

    const criadas = [];
    for (const conta of recorrentes) {
      // Avança até a próxima data futura (evita criar parcelas já passadas quando há atraso acumulado)
      let nextDate = _calcProximaData(conta.dataVencimento, conta.periodicidade || 'mensal');
      while (nextDate <= hojeStr) {
        nextDate = _calcProximaData(nextDate, conta.periodicidade || 'mensal');
      }
      const jaExiste = contas.some(
        (c) => c.recorrenciaOrigemId === conta.id && c.dataVencimento === nextDate
      );
      if (jaExiste) continue;
      const nova = {
        id: generateId('cp'),
        descricao: conta.descricao,
        fornecedorId: conta.fornecedorId || null,
        valor: conta.valor,
        dataEmissao: hojeStr,
        dataVencimento: nextDate,
        status: 'pendente',
        contractId: conta.contractId || null,
        category: conta.category || 'fornecedor',
        observacoes: conta.observacoes || '',
        recorrente: true,
        periodicidade: conta.periodicidade,
        recorrenciaOrigemId: conta.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repos.contasPagar.create(nova);
      criadas.push(nova);
    }
    sendJson(res, { criadas: criadas.length, contas: await repos.contasPagar.findAll() });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ F18: Feature Flags ============
async function handleGetFeatureFlags(res) {
  try {
    const rows = await db.getMany('SELECT * FROM feature_flags ORDER BY key');
    sendJson(res, { flags: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutFeatureFlag(key, body, res) {
  try {
    await db.query(
      `INSERT INTO feature_flags (key, enabled, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET enabled = $2, updated_at = NOW()`,
      [key, !!body.enabled, body.description || '']
    );
    const rows = await db.getMany('SELECT * FROM feature_flags ORDER BY key');
    sendJson(res, { flags: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Global search (M3) ============
async function handleGlobalSearch(query, res) {
  const q = String(query.q || '')
    .trim()
    .toLowerCase();
  if (!q || q.length < 2) {
    return sendJson(res, { results: [], q });
  }
  const norm = (s) => String(s || '').toLowerCase();
  const matches = (s) => norm(s).includes(q);
  const results = [];
  const safe = async (fn) => {
    try {
      return await fn();
    } catch {
      return [];
    }
  };

  const [contracts, clientes, fornecedores, contas, nfs, recursos] = await Promise.all([
    safe(() => repos.contracts.findAll()),
    safe(() => repos.clientes.findAll()),
    safe(() => repos.fornecedores.findAll()),
    safe(() => repos.contasPagar.findAll()),
    safe(() => repos.notasFiscais.findAll()),
    safe(() => repos.recursos.findAll()),
  ]);

  contracts.forEach((c) => {
    if (matches(c.name) || matches(c.client) || matches(c.contractNumber) || matches(c.id)) {
      results.push({
        kind: 'Contrato',
        id: c.id,
        title: c.name || c.id,
        hint: c.client || '',
        hash: `#/contratos/${c.id}`,
      });
    }
  });
  clientes.forEach((c) => {
    if (matches(c.nome) || matches(c.email) || matches(c.empresa)) {
      results.push({
        kind: 'Cliente',
        id: c.id,
        title: c.nome,
        hint: c.email || c.empresa || '',
        hash: '#/clientes',
      });
    }
  });
  fornecedores.forEach((f) => {
    if (matches(f.nome) || matches(f.cnpj)) {
      results.push({
        kind: 'Fornecedor',
        id: f.id,
        title: f.nome,
        hint: f.cnpj || '',
        hash: '#/fornecedores',
      });
    }
  });
  contas.forEach((c) => {
    if (matches(c.descricao) || matches(c.fornecedor) || matches(c.numero)) {
      results.push({
        kind: 'Conta a Pagar',
        id: c.id,
        title: c.descricao || c.fornecedor || c.numero,
        hint: c.dataVencimento || '',
        hash: '#/contas-pagar',
      });
    }
  });
  nfs.forEach((n) => {
    if (matches(n.numero) || matches(n.descricao) || matches(n.cliente)) {
      results.push({
        kind: 'Nota Fiscal',
        id: n.id,
        title: n.numero || n.descricao || n.cliente,
        hint: n.dataVencimento || '',
        hash: '#/notas-fiscais',
      });
    }
  });
  recursos.forEach((r) => {
    if (matches(r.name) || matches(r.cpf) || matches(r.role)) {
      results.push({
        kind: 'Recurso',
        id: r.id,
        title: r.name,
        hint: r.role || '',
        hash: '#/recursos',
      });
    }
  });

  sendJson(res, { results: results.slice(0, 50), q, count: results.length });
}

// ============ Inventário de arquivos (admin) ============
async function handleGetAdminArquivos(res) {
  try {
    const rows = await db.getMany(
      `SELECT a.id, a.recurso_id, a.doc_id, a.filename, a.filename_original,
              a.mime_type, a.size_bytes, a.created_at,
              r.nome AS recurso_nome
       FROM recurso_doc_arquivos a
       LEFT JOIN recursos r ON r.id = a.recurso_id
       ORDER BY a.created_at DESC`
    );
    // Resolve tipoDoc a partir do JSONB documentos do recurso
    const recursosIds = [...new Set(rows.map((r) => r.recursoId).filter(Boolean))];
    const tipoPorDocId = new Map();
    if (recursosIds.length > 0) {
      const ph = recursosIds.map((_, i) => `$${i + 1}`).join(', ');
      const recs = await db.getMany(
        `SELECT id, documentos FROM recursos WHERE id IN (${ph})`,
        recursosIds
      );
      for (const rec of recs) {
        for (const d of rec.documentos || []) {
          tipoPorDocId.set(d.id, d.tipoLabel || d.tipo || '—');
        }
      }
    }
    const total = rows.reduce((s, r) => s + (r.sizeBytes || 0), 0);
    sendJson(res, {
      arquivos: rows.map((r) => ({ ...r, tipoDoc: tipoPorDocId.get(r.docId) || '—' })),
      totalBytes: total,
      count: rows.length,
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handlePushSubscribe,
  handlePushUnsubscribe,
  handleGetAudit,
  handleGetAnomalias,
  handleProcessarRecorrencias,
  handleGetFeatureFlags,
  handlePutFeatureFlag,
  handleGlobalSearch,
  handleGetAdminArquivos,
};
