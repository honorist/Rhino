const http = require('http');
const fs = require('fs');
const path = require('path');

// Versão do app: APP_VERSION env > package.json > 'dev'
const APP_VERSION =
  process.env.APP_VERSION ||
  (() => {
    try {
      return require('./package.json').version || 'dev';
    } catch {
      return 'dev';
    }
  })();
const url = require('url');
const crypto = require('crypto');

// Observabilidade (lib/observability.js): required cedo, ANTES dos handlers
// globais, para que uma falha de boot já seja reportada. Sink `console` por
// padrão (zero dependência); `webhook` em produção via OBSERVABILITY_SINK.
const observability = require('./lib/observability');

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
  observability.captureError(reason instanceof Error ? reason : new Error(String(reason)), {
    origem: 'unhandledRejection',
  });
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
  observability.captureError(err, { origem: 'uncaughtException', fatal: true });
  // O evento é emitido de forma síncrona pelo sink `console`; no `webhook` o
  // POST pode não completar antes do exit — perder o alerta de um crash é ruim,
  // mas segurar um processo em estado indefinido é pior.
  process.exit(1);
});

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Postgres é fonte única de verdade. DATABASE_URL é obrigatório.
if (!process.env.DATABASE_URL) {
  console.error('[server] DATABASE_URL é obrigatório (use docker compose ou exporte a variável)');
  process.exit(1);
}
const repos = require('./db/repos');
const db = require('./db');
const piiCrypto = require('./lib/crypto-pii'); // cifra CPF/documentos em repouso (LGPD)
const auth = require('./lib/auth');
const email = require('./lib/email');
const queue = require('./lib/queue');
const rateLimit = require('./lib/rate-limit');
const pgRateLimit = require('./lib/pg-rate-limit');
const audit = require('./lib/audit');
const money = require('./lib/money'); // dinheiro 2 casas — contém drift de float
const caixaHandlers = require('./handlers/caixa'); // domínio caixa extraído (desmembramento server.js)
const sociosHandlers = require('./handlers/socios'); // domínio sócios extraído
const baseHandlers = require('./handlers/base'); // domínio BASE (CRUD) extraído
const fornecedoresHandlers = require('./handlers/fornecedores');
const tiposBaseHandlers = require('./handlers/tipos-base');
const docTemplatesHandlers = require('./handlers/doc-templates');
const clientesHandlers = require('./handlers/clientes');
const investimentosHandlers = require('./handlers/investimentos');
const contasPagarHandlers = require('./handlers/contas-pagar');
const notasFiscaisHandlers = require('./handlers/notas-fiscais');
const contractsHandlers = require('./handlers/contracts'); // CRUD principal do contrato
const contractExtrasHandlers = require('./handlers/contract-extras'); // budget/aditivos/marcos/ocorrências
const contractOrganogramaHandlers = require('./handlers/contract-organograma');
const recursosHandlers = require('./handlers/recursos'); // CRUD principal de recursos (colaboradores)
const contractSaidasHandlers = require('./handlers/contract-saidas'); // saídas/BM (medições) — FIX deadlock
const contractServicosHandlers = require('./handlers/contract-servicos'); // BM estruturado: planilha de serviços
const contractMedicoesHandlers = require('./handlers/contract-medicoes'); // BM estruturado: medição por itens + aprovação
const recursoFolgasHandlers = require('./handlers/recurso-folgas'); // folgas + passagens de recursos
const contractRdosHandlers = require('./handlers/contract-rdos'); // RDO: visão global + CRUD (fotos/assinaturas seguem inline)
const rdoFotosHandlers = require('./handlers/rdo-fotos'); // RDO fotos: upload multipart + delete
const manutencaoFotosHandlers = require('./handlers/manutencao-fotos'); // Manutenção fotos: upload multipart + delete
const recursoDocsHandlers = require('./handlers/recurso-documentos'); // docs de recurso: arquivo (BYTEA) + validação IA
const candidatoDocsHandlers = require('./handlers/candidato-documentos'); // docs de candidato: arquivo (BYTEA), Etapa 4.3
const rdoAssinaturasHandlers = require('./handlers/rdo-assinaturas'); // RDO assinaturas digitais: upload + list/get/delete
const propostaAnexosHandlers = require('./handlers/proposta-anexos'); // anexos de proposta (PDF/imagem): upload + get/put/delete
const caseLogosHandlers = require('./handlers/case-logos'); // case logos: list/get-image + upload + put/delete
const dashboardCobrancaHandlers = require('./handlers/dashboard-cobranca'); // painel "Cobrança por área"
const folhaPagamentoHandlers = require('./handlers/folha-pagamento'); // folha: gerar/pagar/estornar/limpar + lançamentos
const estoqueHandlers = require('./handlers/estoque'); // estoque: itens/almoxarifados/movimentações/saldo
const frotaHandlers = require('./handlers/frota'); // frota: veículos/planos/manutenções/abastecimentos
const atividadesHandlers = require('./handlers/atividades'); // cronograma físico-financeiro + curva S
const clausulasHandlers = require('./handlers/clausulas'); // cláusulas reusáveis + apresentação da proposta
const cobrancaHandlers = require('./handlers/cobranca'); // cobrança mensal da plataforma (admin)
const dashboardsHandlers = require('./handlers/dashboards'); // painel financeiro + operacional + layouts
const propostasHandlers = require('./handlers/propostas'); // propostas: CRUD + custos + geradores + portal
// Helpers de estoque compartilhados com Solicitações de Compra e o startup (seguem aqui).
const { ensureAlmoxarifadoCentral, _resolveAlmoxId, _ajustarSaldo } = estoqueHandlers;
const bus = require('./lib/bus');
const perms = require('./lib/permissions');
const portalHandlers = require('./handlers/portal'); // portal do cliente: auth/login/impersonate/dashboard/rdo-pdf
const usuariosHandlers = require('./handlers/usuarios'); // RBAC: users CRUD + níveis de acesso
const integracoesHandlers = require('./handlers/integracoes'); // LGPD + IA (chat/classify/uso) + OFX
const fluxoCompra = require('./lib/fluxo-compra');
const recorrencia = require('./lib/recorrencia');
const { sendJson, sendError, setErrorReporter } = require('./lib/http-respond');
// Todo 5xx respondido pela API vira evento de observabilidade. Injetado (e não
// importado dentro do http-respond) para manter aquele módulo sem dependência.
setErrorReporter((status, message) => {
  observability.captureError(new Error(message), { origem: 'http-5xx', status });
});
// multipart/form-data (parser + validação de imagem) agora vive em lib/multipart.js,
// importado diretamente por cada módulo de upload (handlers/*). server.js não usa mais.
const { createRouter } = require('./lib/router');
const registerAuth = require('./routes/auth');
const registerPortal = require('./routes/portal');
const registerPlatform = require('./routes/platform');
const registerFinanceiro = require('./routes/financeiro');
const registerComercial = require('./routes/comercial');
const registerOperacao = require('./routes/operacao');
const registerContracts = require('./routes/contracts');
const registerRecrutamento = require('./routes/recrutamento');
const registerSugestoes = require('./routes/sugestoes');
const sugestoesHandlers = require('./handlers/sugestoes'); // p/ dispatch multipart do anexo

// Web Push — inicializa só se VAPID keys estiverem presentes
let _webPush = null;
try {
  _webPush = require('web-push');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    _webPush.setVapidDetails(
      'mailto:admin@rhino.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } else {
    console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não definidos — push desativado');
    _webPush = null;
  }
} catch (e) {
  console.warn('[push] web-push não instalado:', e.message);
}

// Ensure backups directory exists (used by handleBackup pra dump PG → JSON)
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ─── Auditoria detalhada: captura estado ANTES de PUT/DELETE ───
// Mapa de prefixo de rota → função que busca a entidade pelo id.
// Usado para registrar before_state em audit_log (mostrar "Excluiu cliente X" / "valor de A para B").
// As CHAVES batem exatamente com o `entity` produzido por audit.detectEntity
// (inclusive sub-recursos no formato `pai.sub`). `?.` deixa cada lookup
// defensivo: se o repo/método não existir, retorna undefined (sem before).
const AUDIT_BEFORE_LOOKUP = {
  clientes: (id) => repos.clientes?.findById?.(id),
  fornecedores: (id) => repos.fornecedores?.findById?.(id),
  // findByIdRaw: mantém o CPF cifrado no before_state da auditoria (LGPD — o
  // log não deve guardar PII em texto puro).
  recursos: (id) => repos.recursos?.findByIdRaw?.(id),
  contracts: (id) => repos.contracts?.findById?.(id),
  'contas-pagar': (id) => repos.contasPagar?.findById?.(id),
  'notas-fiscais': (id) => repos.notasFiscais?.findById?.(id),
  caixa: (id) => repos.caixa?.findById?.(id),
  base: (id) => repos.baseItems?.findById?.(id),
  socios: (id) => repos.socios?.findById?.(id),
  investimentos: (id) => repos.investimentos?.findById?.(id),
  saidas: (id) => repos.saidas?.findById?.(id),
  'tipos-base': (id) => repos.tiposBase?.findById?.(id),
  'niveis-acesso': (id) => repos.niveisAcesso?.findById?.(id),
  'doc-templates': (id) => repos.docTemplates?.findById?.(id),
  users: (id) => repos.users?.findById?.(id),
  'folha-pagamento': (id) => repos.folhaPagamento?.findById?.(id),
  // ── Cobertura ampliada (v1.4.15): edição/exclusão + ações especiais ──
  clausulas: (id) => repos.clausulas?.findById?.(id),
  propostas: (id) => repos.propostas?.findById?.(id),
  manutencoes: (id) => repos.manutencoes?.findById?.(id),
  veiculos: (id) => repos.veiculos?.findById?.(id),
  'solicitacoes-compra': (id) => repos.solicitacoesCompra?.findById?.(id),
  candidatos: (id) => repos.candidatos?.findById?.(id),
  // Sub-recursos de maior valor (medições, equipe, RDO, aditivos, custos…)
  'contracts.saidas': (id) => repos.saidas?.findById?.(id),
  'contracts.organograma': (id) => repos.organograma?.findById?.(id),
  'contracts.rdos': (id) => repos.rdos?.findById?.(id),
  'contracts.aditivos': (id) => repos.aditivos?.findById?.(id),
  'contracts.marcos': (id) => repos.marcos?.findById?.(id),
  'contracts.ocorrencias': (id) => repos.ocorrencias?.findById?.(id),
  'propostas.custos': (id) => repos.propostaCustos?.findById?.(id),
  'propostas.anexos': (id) => repos.propostaAnexos?.findById?.(id),
  'veiculos.planos': (id) => repos.veiculoPlanos?.findById?.(id),
  'veiculos.manutencoes': (id) => repos.veiculoManutencoes?.findById?.(id),
  'veiculos.abastecimentos': (id) => repos.veiculoAbastecimentos?.findById?.(id),
  'folha-pagamento.itens': (id) => repos.folhaPagamentoItens?.findById?.(id),
};

function _auditFriendlyLabel(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return (
    obj.nome ||
    obj.name ||
    obj.label ||
    obj.descricao ||
    obj.description ||
    obj.numero ||
    obj.email ||
    obj.tipoLabel ||
    obj.tipo ||
    null
  );
}

async function captureAuditBefore(req, pathname) {
  try {
    if (!['PUT', 'PATCH', 'DELETE', 'POST'].includes(req.method)) return;
    // Usa o MESMO detector do log (lib/audit) — cobre raiz, sub-recursos e
    // ações especiais (ex: POST /api/contas-pagar/:id/pagar). POST de criação
    // não tem id → não há "antes" a capturar.
    const { entity, entityId } = audit.detectEntity(pathname);
    if (!entity || !entityId) return;
    const lookup = AUDIT_BEFORE_LOOKUP[entity];
    if (!lookup) return;
    const before = await lookup(entityId);
    if (!before) return;
    req._auditBefore = before;
    req._auditEntityLabel = _auditFriendlyLabel(before);
  } catch (e) {
    // Silencioso para não quebrar a request — mas LOGADO: sem isso, a perda de
    // before_state (logo, do diff/nome na tela) é invisível em produção.
    console.warn('[audit] captureAuditBefore falhou:', e?.message || e);
  }
}

const { generateId } = require('./lib/id'); // Fase A — extraído para lib/id.js

// Envelopes de coleção (readCollection/writeCollection) → lib/collections.js,
// usados agora só dentro dos handlers extraídos (documentos de recurso, níveis).

// FIX SEC-04: 5xx NUNCA expõem `e.message` ao cliente — vazava nomes de coluna,
// trechos de SQL e stack do Postgres pra qualquer usuário autenticado.
// 4xx (validação) seguem expondo a mensagem, que é direcionada ao usuário final.
// Detalhe interno é logado server-side com timestamp para correlação.
// sendJson / sendError → lib/http-respond.js (Fase 1 do desmembramento).

// ============ Route handlers ============
// Contratos (CRUD principal) extraídos → handlers/contracts.js

// ── Push Notification Handlers ──────────────────────────────────────────────
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

// Saídas/BM (Post/Put/Delete) extraídas → handlers/contract-saidas.js (com FIX de deadlock)

// Handlers de Caixa (handleGetCaixa/Post/Put/Delete) extraídos → handlers/caixa.js
// (continuação do desmembramento do server.js). Ligados via `...caixaHandlers`
// no objeto de deps de registerFinanceiro.

// Handlers de BASE (CRUD) extraídos → handlers/base.js. handleAllocateBase
// (lógica de alocação) permanece abaixo.

async function handleAllocateBase(id, body, res) {
  try {
    const allocationValue = money.parse(body.value);
    // FIX: alocação sob transação + advisory lock — a checagem de limite e os 2 writes
    // (base item + caixa) eram soltos, permitindo over-alocação concorrente e inconsistência.
    const env = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('base:' || $1)::int)", [id]);
      const baseItem = await repos.baseItems.findById(id);
      if (!baseItem) {
        const e = new Error('Base item not found');
        e.statusCode = 404;
        throw e;
      }

      const allocs = baseItem.allocations || [];
      const totalAllocated = allocs.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
      if (totalAllocated + allocationValue > parseFloat(baseItem.value) + 0.01) {
        const e = new Error(
          `Cannot allocate more than available. Available: ${(parseFloat(baseItem.value) - totalAllocated).toFixed(2)}`
        );
        e.statusCode = 400;
        throw e;
      }

      const allocation = {
        id: generateId('alc'),
        contractId: body.contractId,
        value: allocationValue,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };
      const newAllocs = allocs.concat(allocation);
      await repos.baseItems.updateById(id, {
        allocations: JSON.stringify(newAllocs),
        updatedAt: new Date().toISOString(),
      });

      await repos.caixa.create({
        id: generateId('cxa'),
        type: 'saida',
        description: `Alocação BASE: ${baseItem.description}`,
        value: allocationValue,
        date: allocation.date,
        contractId: body.contractId,
        baseItemId: id,
        category: 'base',
        notes: '',
        createdAt: new Date().toISOString(),
      });

      return {
        base: { items: await repos.baseItems.findAll() },
        caixa: { entries: await repos.caixa.findAll() },
        contracts: await repos.contracts.getEnvelope(),
      };
    });
    sendJson(res, env);
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ============ Dashboards (financeiro + operacional) ============
// → handlers/dashboards.js (handleDashboard + handleDashboardOperacional).
// Registrado via ...dashboardsHandlers em registerPlatform e registerOperacao.

// handleAiUsageStats → handlers/integracoes.js (registrado em registerPlatform).

// Backup: dump do PG pras pastas JSON (útil antes de refatorar ou restaurar)
async function handleBackup(res) {
  // Redireciona para o backup por email (Railway usa disco efêmero; escrita local não persiste).
  try {
    await _runEmailBackup();
    sendJson(res, { message: 'Backup enviado por email' });
  } catch (_e) {
    sendError(res, 500, 'Falha ao enviar backup');
  }
}

// Backup completo COM DOWNLOAD: retorna 1 JSON consolidado de TUDO no banco.
// Pensado pra recuperação de desastre — pode importar de volta via scripts/migrate-json-to-pg.js.
async function handleBackupDownload(res) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const safe = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        console.warn('[dump] coleta falhou (resultado vazio):', e && e.message);
        return [];
      }
    };

    const payload = {
      _meta: {
        version: APP_VERSION,
        generatedAt: new Date().toISOString(),
        format: 'rhino-backup-v1',
      },
      // Backup: opt-out do cap defensivo de findAll — precisa dump completo
      contracts: await safe(() => repos.contracts.findAllWithChildren()),
      saidas: await safe(() => repos.saidas.findAll({}, { limit: null })),
      caixa: await safe(() => repos.caixa.findAll({}, { limit: null })),
      base: await safe(() => repos.baseItems.findAll({}, { limit: null })),
      socios: await safe(() => repos.socios.findAll({}, { limit: null })),
      investimentos: await safe(() => repos.investimentos.findAll({}, { limit: null })),
      notas_fiscais: await safe(() => repos.notasFiscais.findAll({}, { limit: null })),
      tipos_base: await safe(() => repos.tiposBase.findAll({}, { limit: null })),
      clientes: await safe(() => repos.clientes.findAll({}, { limit: null })),
      fornecedores: await safe(() => repos.fornecedores.findAll({}, { limit: null })),
      contas_pagar: await safe(() => repos.contasPagar.findAll({}, { limit: null })),
      niveis_acesso: await safe(() => repos.niveisAcesso.findAll()),
      recursos: await safe(() => repos.recursos.findAllRaw({}, { limit: null })), // CPF cifrado no backup (LGPD)
      doc_templates: await safe(() => repos.docTemplates.findAll()),
      users: await safe(() =>
        repos.users.findAll ? repos.users.findAll({}, { limit: null }) : []
      ),
    };

    // Remove campos sensíveis (hash de senha, tokens)
    if (Array.isArray(payload.users)) {
      payload.users = payload.users.map((u) => {
        const { passwordHash, password_hash, resetToken, reset_token, ...safe } = u;
        return safe;
      });
    }

    const json = JSON.stringify(payload, null, 2);
    const filename = `rhino-backup-${timestamp}.json`;
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * Serve changelog.json da raiz do projeto, sem cache.
 */
function handleChangelog(res) {
  try {
    const fp = path.resolve(__dirname, 'changelog.json');
    if (!fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"entries":[]}');
      return;
    }
    const body = fs.readFileSync(fp);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleHealth(res) {
  const result = {
    app: 'ok',
    db: 'unknown',
    uptime_s: Math.round((Date.now() - APP_START) / 1000),
    version: APP_VERSION,
    // Confere sem shell se a captura de erro está configurada como se espera —
    // descobrir que estava em 'console' só depois de um incidente é tarde.
    observability: observability.sinkAtivoNome(),
    timestamp: new Date().toISOString(),
  };
  try {
    const db = require('./db');
    const ok = await db.ping();
    result.db = ok ? 'ok' : 'down';
  } catch (_e) {
    result.db = 'down';
  }
  const status = result.db === 'ok' ? 200 : 503;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// ============ Auth handlers ============
// Handlers de autenticação → handlers/auth.js (Fase A do desmembramento).

// ============ Auditoria ============
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

// ============ Portal do Cliente ============
// → handlers/portal.js (auth própria, login/logout, impersonação, dashboard,
// RDO PDF). applyPortalAuth é usado no roteador e na interceptação do server.
// Variantes de proposta do portal seguem em handlers/propostas.js.

// ============ Users CRUD (admin) + Níveis de acesso ============
// → handlers/usuarios.js (RBAC: users CRUD com anti-escalada + níveis).
// Registrado via ...usuariosHandlers em registerPlatform.

/**
 * Endpoint de métricas operacionais. Restrito a admins.
 *
 * Expõe: contadores de requests, uso de memória RSS/heap e contagem por tabela.
 * Sem `req.user` o handler retorna 401; nivel diferente de admin retorna 403.
 * Antes era acessível anonimamente — fix A-03 da security review.
 *
 * @param {import('http').ServerResponse} res
 * @param {import('http').IncomingMessage & { user?: { id: string, nivelAcessoId: string | null } }} req
 */
async function handleMetrics(res, req) {
  if (!req || !req.user) return sendError(res, 401, 'Não autenticado');
  // Apenas admin (nivelAcessoId null) tem acesso a métricas operacionais.
  if (req.user.nivelAcessoId !== null && req.user.nivelAcessoId !== 'admin') {
    return sendError(res, 403, 'Acesso restrito a administradores');
  }
  const mem = process.memoryUsage();
  const out = {
    ...metrics,
    uptime_s: Math.round((Date.now() - APP_START) / 1000),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    },
  };
  // Contagens por tabela (rápido — só conta linhas)
  try {
    const db = require('./db');
    const counts = {};
    for (const t of [
      'contracts',
      'clientes',
      'recursos',
      'caixa',
      'notas_fiscais',
      'contas_pagar',
      'rdos',
    ]) {
      const row = await db.getOne(`SELECT COUNT(*)::int AS n FROM ${t}`);
      counts[t] = row ? row.n : 0;
    }
    out.tables = counts;
  } catch (e) {
    out.tables_error = e.message;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(out));
}

// ============ Sócios handlers ============
// Handlers de Sócios (CRUD) extraídos → handlers/socios.js.

// ============ Investimentos handlers ============
// Investimentos (Get/Post/Delete, com BASE+caixa e transação) extraídos → handlers/investimentos.js

// ============ Clientes ============
// Clientes (CRUD, com portal + propagação de endereço) extraídos → handlers/clientes.js

// ============ Propostas Comerciais ============
// ============ Propostas Comerciais ============
// → handlers/propostas.js (CRUD + custos + ciclo + geradores DOCX/PDF/preview +
// variantes do portal). Registrado via ...propostasHandlers em registerComercial.

// ============ Cláusulas + Apresentação Global ============
// → handlers/clausulas.js (biblioteca de cláusulas + apresentação da proposta).
// Registrado via `...clausulasHandlers` em registerComercial.

// Case Logos extraídos → handlers/case-logos.js

// ============ Fornecedores ============
// Fornecedores (CRUD) extraídos → handlers/fornecedores.js

// Tipos da BASE (CRUD) extraídos → handlers/tipos-base.js

// ============ Contas a Pagar handlers ============
// Contas a Pagar (CRUD + pagar/estornar) extraídos → handlers/contas-pagar.js

// ============ Folha de Pagamento handlers ============
// Folha de Pagamento (gerar/consultar, pagar/estornar parcela, lançamentos e
// limpar competência) extraída → handlers/folha-pagamento.js.
// Regras puras (vale, 5º dia útil, INSS) seguem em lib/folha.js (test/folha.test.js).

// ============ Notas Fiscais handlers ============
// Notas Fiscais (CRUD + emitir/cancelar-emissão) extraídos → handlers/notas-fiscais.js

// ============ Orçamento (Budget) handlers ============
// Orçamento (budget) do contrato extraído → handlers/contract-extras.js

// ============ Organograma (Equipe por Contrato) handlers ============
// Organograma (equipe por contrato) extraído → handlers/contract-organograma.js

// Aditivos / Marcos / Ocorrências do contrato extraídos → handlers/contract-extras.js

// ============ Static file serving ============
const STATIC_ROOT = path.resolve(__dirname);
// In-memory cache para evitar fs.readFileSync síncrono em cada request.
// APP_VERSION é constante no processo, então o conteúdo injetado não muda.
const _staticCache = new Map();

const _contentTypeMap = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// HTML inline bootstrap: injetado em cada response HTML com nonce CSP único.
// Roda ANTES de qualquer outro JS — garante version-check transparente mesmo
// quando o SW velho serve polish.js cacheado (que pode estar sem essa lógica).
// Como HTML é no-store, esse código sempre roda fresco. Faz:
//   1. Define window.__APP_VERSION__ pra sidebar mostrar a versão certa
//   2. Bate em /api/health — se versão do servidor != versão dessa pagina,
//      desregistra SWs + limpa caches + reload com cache-bust.
//      Como o nonce muda a cada request, isso roda sempre 'no cache'.
function _bootstrapInline(version) {
  return `(function(){
window.__APP_VERSION__="${version}";
var loaded="${version}";
var UPG_KEY="rh:upgrade-attempt",UPG_MAX=3;
function go(srv){
  if(srv===loaded){try{sessionStorage.removeItem(UPG_KEY);}catch(e){}return;}
  // Anti reload-loop TOLERANTE: durante o deploy ha uma janela em que /api/health
  // ja reporta a versao nova enquanto os assets ainda podem vir antigos. Desistir
  // na 1a tentativa deixaria o cliente preso na versao velha (precisaria refresh
  // manual). Conta as tentativas por versao (formato "versao@n") e so desiste apos
  // UPG_MAX — o cliente converge sozinho. Formato compartilhado com polish.js.
  try{
    var raw=sessionStorage.getItem(UPG_KEY)||"";
    var at=raw.indexOf("@");
    var ver=at>=0?raw.slice(0,at):raw;
    var cnt=at>=0?(parseInt(raw.slice(at+1),10)||0):0;
    var n=(ver===srv)?cnt:0;
    if(n>=UPG_MAX)return;
    sessionStorage.setItem(UPG_KEY,srv+"@"+(n+1));
  }catch(e){}
  Promise.resolve()
    .then(function(){
      if(!navigator.serviceWorker)return;
      return navigator.serviceWorker.getRegistrations().then(function(rs){
        return Promise.all(rs.map(function(r){return r.unregister().catch(function(){});}));
      });
    })
    .then(function(){
      if(!window.caches)return;
      return caches.keys().then(function(ks){
        return Promise.all(ks.map(function(k){return caches.delete(k).catch(function(){});}));
      });
    })
    .then(function(){
      var u=new URL(location.href);u.searchParams.set("_v",srv);
      location.replace(u.toString());
    });
}
function check(){
  fetch("/api/health",{cache:"no-store"})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){if(d&&d.version)go(d.version);})
    .catch(function(){});
}
setTimeout(check,3000);
setInterval(check,60000);
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible")check();
});
})();`;
}

// CSP — fonte única de verdade. Só o script-src varia entre respostas:
// o HTML da SPA usa nonce (bootstrap inline); as demais respostas não.
// Centralizar aqui evita o bug recorrente de adicionar um domínio externo
// em apenas um dos lugares (causa do fix v1.2.27 — faltava OSRM).
function buildCsp(scriptSrc) {
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org",
    "connect-src 'self' https://*.openstreetmap.org https://nominatim.openstreetmap.org https://router.project-osrm.org https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; ');
}

function _serveHtmlWithBootstrap(pathname, res) {
  const filename = pathname === '/' || pathname === '' ? '/index.html' : pathname;
  const filepath = path.resolve(__dirname, '.' + filename);
  // FIX: path traversal — url.parse NÃO colapsa `..`, então um pathname como
  // `/../../foo.html` escaparia da raiz. Mesmo guard do serveStaticFile.
  if (!filepath.startsWith(STATIC_ROOT + path.sep) && filepath !== STATIC_ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  // Nonce único por request — libera APENAS o nosso bootstrap inline na CSP.
  const nonce = crypto.randomBytes(16).toString('base64');
  const bootstrap = _bootstrapInline(APP_VERSION);
  const html = fs
    .readFileSync(filepath, 'utf8')
    .replace('</head>', `<script nonce="${nonce}">${bootstrap}</script></head>`)
    // Cache-busting dos JS/CSS eager: anexa ?v=APP_VERSION. Sem isso o sw.js
    // (stale-while-revalidate) serve o JS antigo cacheado e o usuário fica uma
    // versão atrás a cada deploy. Os scripts lazy já versionam em app.js.
    .replace(/(src|href)="(\.\/(?:js|css)\/[^"]+\.(?:js|css))"/g, `$1="$2?v=${APP_VERSION}"`);
  // CSP com nonce — só o script-src difere; resto vem de buildCsp().
  // FIX M4 (varredura 2026-07): estreita o script-src para os CAMINHOS dos pacotes
  // vendorados via jsDelivr (mermaid no Manual, shepherd no onboarding) em vez do
  // domínio inteiro — jsDelivr serve QUALQUER pacote npm, então liberar o host todo
  // é um bypass de CSP (um XSS poderia carregar /npm/<pacote-malicioso>).
  const csp = buildCsp(
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net/npm/mermaid@10/ https://cdn.jsdelivr.net/npm/shepherd.js@11/`
  );
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Content-Security-Policy': csp,
  });
  res.end(html);
}

function serveStaticFile(pathname, res) {
  // HTML nunca usa cache em memória — cada response tem nonce CSP único.
  // FIX L1: só o index.html é servido como HTML (com bootstrap). Qualquer outro
  // `.html` cai na allowlist abaixo e vira 404 — sem isso, QUALQUER .html da árvore
  // do projeto (ex.: relatórios de coverage) era servível com o bootstrap injetado.
  if (pathname === '/' || pathname === '/index.html') {
    return _serveHtmlWithBootstrap(pathname, res);
  }
  // FIX H-01: allowlist de recursos públicos do frontend. STATIC_ROOT é a raiz
  // do projeto — sem esta checagem, /server.js, /lib/*.js, /db/schema.sql e todo
  // o código do servidor ficam baixáveis pela web (white-box para o atacante).
  {
    const _seg = pathname.split('/')[1] || '';
    const _PUBLIC_DIRS = ['js', 'css', 'assets'];
    const _PUBLIC_FILES = ['/sw.js', '/manifest.webmanifest', '/changelog.json'];
    if (!_PUBLIC_DIRS.includes(_seg) && !_PUBLIC_FILES.includes(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
  }
  // Cache check primeiro — evita path.resolve, existsSync e readFileSync na rota quente
  if (_staticCache.has(pathname)) {
    const { headers, body } = _staticCache.get(pathname);
    res.writeHead(200, headers);
    res.end(body);
    return;
  }

  const filepath = path.resolve(STATIC_ROOT, '.' + pathname);

  // Prevent path traversal: resolved path must stay within project root
  if (!filepath.startsWith(STATIC_ROOT + path.sep) && filepath !== STATIC_ROOT) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filepath).toLowerCase();
  const contentType = _contentTypeMap[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': contentType };
  // HTML sempre revalidar (entrypoint que injeta __APP_VERSION__).
  // JS/CSS: cache-first com `stale-while-revalidate` — o SW (sw.js) já invalida
  // por VERSION a cada deploy via `caches.delete(<old>)` no `activate`. Antes
  // estava `no-cache` o que forçava 30+ requisições condicionais por navegação.
  // SVG/PNG/WOFF: cacheáveis longos com revalidação em background.
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else if (pathname === '/sw.js') {
    // SW: sempre revalidar. Browsers que cacheiam o próprio SW prendem o
    // usuário em versões antigas mesmo após deploy — `no-store` força
    // download fresco a cada navegação, garantindo que reg.update() veja
    // mudanças imediatamente.
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
  } else if (ext === '.js' || ext === '.css') {
    headers['Cache-Control'] = 'public, max-age=3600, stale-while-revalidate=86400';
  } else if (
    ext === '.svg' ||
    ext === '.png' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.webp' ||
    ext === '.woff2' ||
    ext === '.woff' ||
    ext === '.ico'
  ) {
    headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  }

  let body;
  if (ext === '.html') {
    // Injeta versão do app para que a sidebar mostre v1.x.y dinâmico
    body = Buffer.from(
      fs
        .readFileSync(filepath, 'utf8')
        .replace('</head>', `<script>window.__APP_VERSION__="${APP_VERSION}";</script></head>`)
    );
  } else if (pathname === '/sw.js') {
    // Injeta a versão no Service Worker para que o cache seja invalidado a cada deploy
    body = Buffer.from(
      fs.readFileSync(filepath, 'utf8').replace("'__RHINO_VERSION__'", `'rhino-v${APP_VERSION}'`)
    );
  } else {
    body = fs.readFileSync(filepath);
  }
  _staticCache.set(pathname, { headers, body });
  res.writeHead(200, headers);
  res.end(body);
}

// ============ Observabilidade ============
const APP_START = Date.now();
const metrics = {
  requests: 0,
  by_status: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  by_method: { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
  errors: 0,
};

function logEvent(obj) {
  // Logging estruturado em uma linha JSON (fácil de parsear em CloudWatch/Loki/etc)
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

// ============ Request handler ============
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;
  // Versionamento de API: /api/v1/* é o contrato público estável para
  // integradores externos. Internamente roteia igual a /api/* — o front
  // interno segue em /api/* sem quebrar, e o /v1/ nunca muda de contrato.
  if (pathname && pathname.startsWith('/api/v1/')) {
    pathname = '/api/' + pathname.slice('/api/v1/'.length);
  }
  const requestId = crypto.randomBytes(6).toString('hex');
  const t0 = Date.now();
  res.setHeader('X-Request-Id', requestId);

  // Hook no res.end pra emitir log + atualizar métricas + auditoria
  const origEnd = res.end.bind(res);
  res.end = function (...args) {
    const ms = Date.now() - t0;
    const status = res.statusCode;
    metrics.requests++;
    const bucket = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 300 ? '3xx' : '2xx';
    metrics.by_status[bucket]++;
    if (metrics.by_method[req.method] !== undefined) metrics.by_method[req.method]++;
    if (status >= 500) metrics.errors++;
    if (pathname.startsWith('/api/') || status >= 400) {
      logEvent({ rid: requestId, m: req.method, p: pathname, s: status, ms });
    }
    // Auditoria — salva no PG em background (não bloqueia o response)
    if (
      ['POST', 'PUT', 'DELETE'].includes(req.method) &&
      pathname.startsWith('/api/') &&
      status < 500
    ) {
      setImmediate(() =>
        audit
          .log({ req, res, body: req._auditBody, status, durationMs: ms, requestId })
          .catch(() => {})
      );

      // Real-time bus (G1) — publica para clientes conectados via /api/stream
      if (status >= 200 && status < 300) {
        // pathname tipo /api/contracts ou /api/contracts/abc → entidade = contracts
        const m = pathname.match(/^\/api\/([a-z0-9-]+)(?:\/([a-zA-Z0-9_-]+))?/i);
        if (m) {
          const entity = m[1];
          const id = m[2] || null;
          const action =
            req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : 'delete';
          // Skip endpoints internos que não representam mutação de entidade
          if (
            !['auth', 'stream', 'metrics', 'health', 'audit', 'search', 'backup'].includes(entity)
          ) {
            bus.publish({ entity, action, id, by: req.user?.email || null });
          }
        }
      }
    }
    return origEnd(...args);
  };

  // CORS: restrict to same-origin / localhost only
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Security headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  // FIX SEC-06: CSP fechada.
  //  - script-src sem 'unsafe-inline' (bloqueia XSS persistente)
  //  - script-src sem CDNs externas (libs vendoradas em /js/lib/vendor/)
  //  - script-src-elem permite jsdelivr APENAS para mermaid ESM (Manual)
  //  - style-src mantém 'unsafe-inline' (muitos inline styles em views;
  //    refator separado, menor risco que script inline)
  res.setHeader(
    'Content-Security-Policy',
    buildCsp("script-src 'self' https://cdn.jsdelivr.net/npm/mermaid@10/")
  );
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // /reset-sw — página de emergência que desregistra Service Workers e limpa
  // caches do browser. Necessário quando usuário fica preso em SW antigo
  // que não está se atualizando sozinho. Não exige auth — o efeito é só
  // limpar o estado local do próprio navegador do usuário.
  if (pathname === '/reset-sw') {
    // CSP relaxada SÓ pra essa página: precisa de script inline pra rodar
    // limpeza imediata sem depender de outro JS cacheado pelo SW.
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    });
    res.end(`<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Rhino — Reset</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b2545;color:#fff;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;}
  .box{max-width:480px}
  h1{font-size:24px;margin:0 0 12px;font-weight:700}
  p{font-size:14px;color:#cbd5e1;margin:6px 0;line-height:1.5}
  .ok{color:#10b981;font-weight:700;font-size:16px;margin-top:16px}
  .spin{display:inline-block;width:32px;height:32px;border:3px solid #1e3a5f;border-top-color:#fff;
        border-radius:50%;animation:s 0.8s linear infinite;margin-bottom:12px}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head>
<body><div class="box">
<div class="spin"></div>
<h1>Atualizando Rhino…</h1>
<p id="status">Limpando cache local e desregistrando workers.</p>
<p class="ok" id="done" style="display:none">Pronto! Redirecionando…</p>
</div>
<script>
(async function(){
  const status = document.getElementById('status');
  const done = document.getElementById('done');
  try {
    if ('serviceWorker' in navigator) {
      status.textContent = 'Desregistrando service workers…';
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      status.textContent = 'Limpando caches…';
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
    done.style.display = 'block';
    setTimeout(() => location.replace('/'), 1200);
  } catch (e) {
    status.textContent = 'Erro: ' + (e && e.message || e) + ' — recarregue manualmente.';
  }
})();
</script>
</body></html>`);
    return;
  }

  // /healthz e /readyz — sem autenticação, sem logging de auditoria
  if (pathname === '/healthz' || pathname === '/readyz') {
    (async () => {
      const result = {
        status: 'ok',
        db: 'unknown',
        uptime_s: Math.round((Date.now() - APP_START) / 1000),
        version: APP_VERSION,
      };
      try {
        result.db = (await require('./db').ping()) ? 'ok' : 'down';
      } catch {
        result.db = 'down';
      }
      if (result.db !== 'ok') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ...result, status: 'error' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    })();
    return;
  }

  // Multipart (upload de fotos RDO) — não passa pelo body parser JSON
  const isRdoFotoUpload =
    req.method === 'POST' && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/fotos$/.test(pathname);
  if (isRdoFotoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      rdoFotosHandlers.handlePostRdoFoto(parts[3], parts[5], req, res);
    })();
    return;
  }

  // Multipart (upload de fotos de manutenção) — não passa pelo body parser JSON
  const isManutencaoFotoUpload =
    req.method === 'POST' && /^\/api\/manutencoes\/[^/]+\/fotos$/.test(pathname);
  if (isManutencaoFotoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/'); // ['', 'api', 'manutencoes', id, 'fotos']
      manutencaoFotosHandlers.handlePostManutencaoFoto(parts[3], req, res);
    })();
    return;
  }

  // Multipart (upload de arquivo de documento de recurso) — também precisa pular body parser
  const isRecursoDocArqUpload =
    req.method === 'POST' && /^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/.test(pathname);
  if (isRecursoDocArqUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      recursoDocsHandlers.handlePostRecursoDocArquivo(parts[3], parts[5], req, res);
    })();
    return;
  }

  // Multipart (upload de arquivo de documento de candidato, Etapa 4.3) — pula o body parser
  const isCandidatoDocArqUpload =
    req.method === 'POST' &&
    /^\/api\/recrutamento\/candidatos\/[^/]+\/documentos\/[^/]+\/arquivo$/.test(pathname);
  if (isCandidatoDocArqUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      // /api/recrutamento/candidatos/:id/documentos/:tipo/arquivo
      const parts = pathname.split('/');
      candidatoDocsHandlers.handlePostCandidatoDocArquivo(parts[4], parts[6], req, res);
    })();
    return;
  }

  // OFX import — lê o corpo raw (não é JSON), precisa pular o body parser
  const isOfxImport = req.method === 'POST' && pathname === '/api/caixa/importar-ofx';
  if (isOfxImport) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      integracoesHandlers.handleImportarOfx(req, res);
    })();
    return;
  }

  // Multipart (upload de assinatura digital no RDO)
  const isRdoAssinaturaUpload =
    req.method === 'POST' && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas$/.test(pathname);
  if (isRdoAssinaturaUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      rdoAssinaturasHandlers.handlePostRdoAssinatura(parts[5], req, res);
    })();
    return;
  }

  // Multipart (upload de anexo de proposta)
  const isPropostaAnexoUpload =
    req.method === 'POST' && /^\/api\/propostas\/[^/]+\/anexos$/.test(pathname);
  if (isPropostaAnexoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      propostaAnexosHandlers.handleUploadPropostaAnexo(pathname.split('/')[3], req, res);
    })();
    return;
  }

  // Multipart (upload de case logo)
  const isCaseLogoUpload = req.method === 'POST' && pathname === '/api/case-logos';
  if (isCaseLogoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      caseLogosHandlers.handleUploadCaseLogo(req, res);
    })();
    return;
  }

  // Multipart (upload de foto de sugestão)
  const isSugestaoAnexoUpload =
    req.method === 'POST' && /^\/api\/sugestoes\/[^/]+\/anexo$/.test(pathname);
  if (isSugestaoAnexoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      sugestoesHandlers.uploadAnexo(pathname.split('/')[3], req, res);
    })();
    return;
  }

  // Parse body for POST/PUT/PATCH requests (PATCH faltava: triagem/antecedentes
  // de recrutamento e PATCH de propostas/contratos recebiam body null → 500).
  const MAX_BODY_BYTES = 1_000_000; // 1 MB
  let body = '';
  let bodySize = 0;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    // Enforce Content-Type for JSON API routes (only when body is present)
    if (pathname.startsWith('/api/')) {
      const ct = req.headers['content-type'] || '';
      const hasBody =
        (req.headers['content-length'] && req.headers['content-length'] !== '0') ||
        req.headers['transfer-encoding'];
      if (
        hasBody &&
        !ct.includes('application/json') &&
        !ct.includes('multipart/form-data') &&
        !ct.includes('text/')
      ) {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content-Type deve ser application/json' }));
        return;
      }
    }
    req.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      try {
        body = body ? JSON.parse(body) : {};
      } catch (_e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
        return;
      }
      // Nunca logar campos sensíveis no audit
      const { password, passwordHash, token, senha, ...safeBody } = body;
      req._auditBody = safeBody;
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      await captureAuditBefore(req, pathname);
      routeRequest(pathname, req.method, body, res, parsedUrl, req);
    });
  } else {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      await captureAuditBefore(req, pathname);
      routeRequest(pathname, req.method, null, res, parsedUrl, req);
    })();
  }
});

// Middleware: rotas /api/* exigem sessão, exceto whitelist abaixo.
const AUTH_WHITELIST = new Set([
  '/api/health',
  '/healthz',
  '/readyz',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/portal/login',
]);
// Rotas privilegiadas — exigem nivel_acesso_id = 'admin' (ou super admin).
// `/api/users/*` foi removido daqui em v1.2.7: agora cada handler chama `perms.can()`
// individualmente, permitindo que perfis com `edit:#/usuarios` (ex.: gerente) também
// gerenciem usuários — com bloqueio anti-escalada (não promovem para admin).
const ADMIN_PATH_PREFIXES = [
  '/api/backup',
  '/api/admin/',
  '/api/niveis-acesso',
  '/api/lgpd/delete-account',
  '/api/ai-usage',
];
function isAdminRoute(pathname, method) {
  // GET /api/niveis-acesso é necessário pra exibir perfis no login → liberar leitura
  if (pathname === '/api/niveis-acesso' && method === 'GET') return false;
  // Match exato OU prefixo de path-segment (evita falso match como /api/users-foo)
  return ADMIN_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/')
  );
}
function requireAdmin(req, res) {
  if (!req.user) {
    sendError(res, 401, 'Não autenticado');
    return false;
  }
  // Convenção do projeto (delega para perms.isSuperAdmin — fonte única):
  //   - nivelAcessoId = null    → super admin (pode escolher qualquer perfil na UI)
  //   - nivelAcessoId = 'admin' → admin explícito
  //   - qualquer outro valor    → usuário restrito
  if (!perms.isSuperAdmin(req.user)) {
    sendError(res, 403, 'Acesso restrito a administradores');
    return false;
  }
  return true;
}

// ============ FIX C-04: enforcement de permissão para mutações ============
// O modelo de perfis (niveis_acesso.abas) era aplicado SÓ no frontend para a
// maioria dos endpoints — qualquer usuário logado podia chamar a API direto
// (curl / console do browser) e alterar dados de telas que o perfil dele nem
// acessa. Aqui espelhamos no servidor a mesma regra do `podeEditar` do
// frontend: uma mutação (POST/PUT/DELETE/PATCH) numa tela NÃO-universal exige
// que o usuário tenha permissão de EDIÇÃO (`edit:#/rota`) naquela tela nas `abas`.
//
// Telas universais (propostas, estoque, frota, solicitações, cláusulas) NÃO
// são enforced — são abertas a qualquer usuário logado por design do app
// (ver `universais` em js/app.js). Super admin / admin sempre passam.
const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// Regex de pathname → telas (#/rota) que liberam a mutação (qualquer uma serve).
// O OR cobre recursos criados a partir de outra tela — ex.: um cliente novo
// criado de dentro do formulário de contrato (gate do frontend = #/contratos).
const MUTATION_PERMISSION_RULES = [
  { re: /^\/api\/base\/[^/]+\/allocate$/, screens: ['#/base', '#/contratos'] },
  { re: /^\/api\/(contracts|saidas)(\/|$)/, screens: ['#/contratos'] },
  { re: /^\/api\/(base|tipos-base)(\/|$)/, screens: ['#/base'] },
  { re: /^\/api\/caixa(\/|$)/, screens: ['#/caixa'] },
  { re: /^\/api\/socios(\/|$)/, screens: ['#/socios'] },
  { re: /^\/api\/investimentos(\/|$)/, screens: ['#/investimentos'] },
  { re: /^\/api\/clientes(\/|$)/, screens: ['#/clientes', '#/contratos'] },
  {
    re: /^\/api\/fornecedores(\/|$)/,
    screens: ['#/fornecedores', '#/contratos', '#/contas-pagar'],
  },
  { re: /^\/api\/notas-fiscais(\/|$)/, screens: ['#/notas-fiscais', '#/contratos'] },
  { re: /^\/api\/contas-pagar(\/|$)/, screens: ['#/contas-pagar'] },
  { re: /^\/api\/recursos(\/|$)/, screens: ['#/recursos'] },
  { re: /^\/api\/folha-pagamento(\/|$)/, screens: ['#/folha-pagamento'] },
  { re: /^\/api\/recrutamento(\/|$)/, screens: ['#/recrutamento'] },
];

/**
 * Bloqueia uma mutação se o usuário não tem acesso à tela correspondente.
 * @returns {Promise<boolean>} true se bloqueou (resposta 403 já enviada).
 */
async function checkMutationPermission(req, res, pathname, method) {
  if (!MUTATION_METHODS.has(method)) return false; // não é mutação
  if (perms.isSuperAdmin(req.user)) return false; // admin / super admin passam
  const rule = MUTATION_PERMISSION_RULES.find((r) => r.re.test(pathname));
  if (!rule) return false; // rota não mapeada → não bloqueia
  const abas = await perms.loadAbas(req.user);
  if (!abas) return false; // null = sem restrição
  // Exige permissão de EDIÇÃO (edit:#/rota). O OR cobre cross-invocações.
  if (rule.screens.some((s) => abas.includes('edit:' + s))) return false;
  console.warn(
    `[C-04] mutação bloqueada: user=${req.user?.id} ${method} ${pathname} — precisa de permissão de edição em uma de: ${rule.screens.join(', ')}`
  );
  sendError(res, 403, 'Você não tem permissão para esta operação.');
  return true;
}

// ============ Enforcement de LEITURA (GET) para telas sensíveis ============
// Mesmo problema do C-04, mas para leitura: sem isto, um perfil restrito lê via
// API (curl/console) dados financeiros/RH de telas que a UI dele esconde.
// Gateamos APENAS as telas sensíveis (caixa, sócios, investimentos, folha) —
// telas de REFERÊNCIA (contratos, clientes, fornecedores, base) seguem legíveis
// porque alimentam dropdowns/nomes em telas que o perfil PODE ver. O
// `Store.loadAll` tolera 403 nessas rotas (vira vazio, sem quebrar o app).
const VIEW_PERMISSION_RULES = [
  { re: /^\/api\/caixa(\/|$)/, screen: '#/caixa' },
  { re: /^\/api\/socios(\/|$)/, screen: '#/socios' },
  { re: /^\/api\/investimentos(\/|$)/, screen: '#/investimentos' },
  { re: /^\/api\/folha-pagamento(\/|$)/, screen: '#/folha-pagamento' },
  // Recrutamento expõe CPF/antecedentes — leitura restrita a quem tem a tela.
  // (/api/notificacoes NÃO casa este regex, segue aberto pro sino.)
  { re: /^\/api\/recrutamento(\/|$)/, screen: '#/recrutamento' },
  // Arquivo de documento de colaborador (BYTEA decifrado = PII sensível): só
  // baixa quem tem a tela Recursos. A LISTA /api/recursos segue aberta (alimenta
  // dropdowns/nomes em outras telas) — gateamos APENAS o download do arquivo.
  { re: /^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/, screen: '#/recursos' },
];

/**
 * Bloqueia a LEITURA (GET) de uma tela sensível se o perfil não a inclui.
 * @returns {Promise<boolean>} true se BLOQUEOU (403 já enviado).
 */
async function checkViewPermission(req, res, pathname, method) {
  if (method !== 'GET') return false;
  if (perms.isSuperAdmin(req.user)) return false; // super admin passa
  const rule = VIEW_PERMISSION_RULES.find((r) => r.re.test(pathname));
  if (!rule) return false; // rota não sensível
  const abas = await perms.loadAbas(req.user);
  if (!abas) return false; // null = sem restrição
  if (abas.includes(rule.screen)) return false; // tem a tela → libera
  console.warn(
    `[view-gate] leitura bloqueada: user=${req.user?.id} GET ${pathname} — sem ${rule.screen}`
  );
  sendError(res, 403, 'Você não tem acesso a esta tela.');
  return true;
}

// blockIfNoScreenAccess (gate de tela p/ IA) → handlers/integracoes.js

async function applyAuthMiddleware(req, res, pathname, method) {
  if (!pathname.startsWith('/api/')) return false;

  // Rate limit global pra /api/* — 1000 req / min por IP (anti-DDoS / abuso)
  const rlGlobal = rateLimit.check(rateLimit.clientKey(req, 'global'), {
    max: 1000,
    windowMs: 60 * 1000,
  });
  if (!rlGlobal.ok) {
    res.setHeader('Retry-After', rlGlobal.retryAfterSec);
    sendError(res, 429, 'Limite de requisições atingido. Aguarde um momento.');
    return true;
  }

  if (AUTH_WHITELIST.has(pathname)) return false;
  try {
    const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
    const user = await auth.getUserBySession(sid);
    // /api/auth/me ("quem sou eu"): seta o user se houver sessão, mas NÃO 401 se ausente —
    // deixa o handler responder 200 {user:null} (evita 401 no console no boot deslogado).
    if (pathname === '/api/auth/me') {
      req.user = user || null;
      return false;
    }
    if (!user) {
      sendError(res, 401, 'Não autenticado');
      return true;
    }
    req.user = user;
    // Bloqueio server-side de rotas admin (defesa em profundidade — frontend já filtra UI)
    if (isAdminRoute(pathname, method)) {
      if (!requireAdmin(req, res)) return true;
    }
    // FIX C-04: enforcement server-side de permissão para mutações.
    if (await checkMutationPermission(req, res, pathname, method)) return true;
    // Enforcement de leitura para telas sensíveis (financeiro/RH/sócios).
    if (await checkViewPermission(req, res, pathname, method)) return true;
    return false;
  } catch (e) {
    sendError(res, 500, e.message);
    return true;
  }
}

// ============ Idempotência ============
// Endpoints críticos aceitam o header `Idempotency-Key`. Num retry de rede com
// a mesma chave, a resposta de sucesso original é devolvida sem reexecutar o
// efeito — evita lançamento/pagamento duplicado. Opt-in: sem o header, nada muda.
async function withIdempotency(req, res, pathname, body, runHandler) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return runHandler();

  const method = req.method || 'POST';
  // FIX L2 (varredura 2026-07): escopa a chave por USUÁRIO. Sem o id do usuário no
  // hash, dois usuários com a mesma Idempotency-Key na mesma rota compartilhariam a
  // resposta capturada (replay cross-user vazaria a resposta de um pro outro).
  const uid = (req.user && req.user.id) || 'anon';
  const rowId = crypto
    .createHash('sha256')
    .update(`${uid} ${method} ${pathname} ${key}`)
    .digest('hex');
  const reqHash = crypto
    .createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body || {}))
    .digest('hex');

  let existing;
  try {
    existing = await db.getOne(
      'SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE id = $1',
      [rowId]
    );
  } catch {
    return runHandler(); // tabela ausente / erro de DB — não bloqueia o request
  }

  if (existing) {
    if (existing.requestHash && existing.requestHash !== reqHash) {
      return sendError(res, 422, 'Idempotency-Key já usada com um corpo diferente');
    }
    res.writeHead(existing.statusCode, { 'Content-Type': 'application/json' });
    res.end(existing.responseBody);
    return;
  }

  // Primeira vez — executa capturando a resposta para replays futuros.
  let capturedStatus = 200;
  let capturedBody = '';
  const origWriteHead = res.writeHead.bind(res);
  const origEnd = res.end.bind(res);
  res.writeHead = (status, ...rest) => {
    capturedStatus = status;
    return origWriteHead(status, ...rest);
  };
  res.end = (chunk, ...rest) => {
    if (chunk) capturedBody += chunk.toString();
    const ret = origEnd(chunk, ...rest);
    // Só guarda sucesso — erros (4xx/5xx) devem poder ser refeitos num retry.
    if (capturedStatus >= 200 && capturedStatus < 300) {
      db.query(
        `INSERT INTO idempotency_keys (id, request_hash, status_code, response_body)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [rowId, reqHash, capturedStatus, capturedBody]
      ).catch((e) =>
        console.error(
          '[idempotency] falha ao gravar chave (retries podem duplicar lançamento):',
          e && e.message
        )
      );
    }
    return ret;
  };
  return runHandler();
}

// ── Router modular (Fase 2) — domínios migrados saem da cadeia de if abaixo ──
const apiRouter = createRouter();
registerAuth(apiRouter);
// Recrutamento (US-05 a US-09) — handlers próprios, sem injeção de deps.
registerRecrutamento(apiRouter);
// Canal de Sugestões (RaiaPro H2) — handlers próprios. Upload de foto é multipart (abaixo).
registerSugestoes(apiRouter);
registerPortal(apiRouter, {
  ...portalHandlers, // auth/login/logout/impersonate/dashboard/rdo-pdf (handlers/portal.js)
  // Variantes de proposta do portal vivem em handlers/propostas.js (reaproveitam
  // os geradores DOCX/PDF internos, com gate de ownership do cliente).
  handlePortalListPropostas: propostasHandlers.handlePortalListPropostas,
  handlePortalPropostaPdf: propostasHandlers.handlePortalPropostaPdf,
  handlePortalPropostaDocx: propostasHandlers.handlePortalPropostaDocx,
});
registerPlatform(apiRouter, {
  bus,
  sendJson,
  handleGetAudit,
  ...usuariosHandlers, // RBAC: users CRUD + níveis de acesso (handlers/usuarios.js)
  ...integracoesHandlers, // LGPD + IA (chat/classify/uso) + OFX (handlers/integracoes.js; importarOfx é usado no financeiro)
  handleHealth,
  handleChangelog,
  handleMetrics,
  handleGetAdminArquivos,
  handleGetFeatureFlags,
  handlePutFeatureFlag,
  handleGlobalSearch,
  handlePushSubscribe,
  handlePushUnsubscribe,
  ...dashboardsHandlers, // painel financeiro + operacional + layouts (handlers/dashboards.js)
  handleBackup,
  handleBackupDownload,
  _runEmailBackup,
  handleGetAnomalias,
});
registerFinanceiro(apiRouter, {
  withIdempotency,
  ...caixaHandlers, // handleGetCaixa/Post/Put/Delete (handlers/caixa.js)
  ...baseHandlers,
  handleAllocateBase, // base CRUD em handlers/base.js; allocate inline
  ...sociosHandlers, // handlers/socios.js
  ...investimentosHandlers, // handlers/investimentos.js
  ...tiposBaseHandlers, // handlers/tipos-base.js
  ...contasPagarHandlers, // CRUD + pagar/estornar (handlers/contas-pagar.js)
  handleProcessarRecorrencias,
  ...folhaPagamentoHandlers, // gerar/get/limpar + pagar/estornar parcela + lançamentos (handlers/folha-pagamento.js)
  ...notasFiscaisHandlers, // CRUD + emitir/cancelar-emissão (handlers/notas-fiscais.js)
  ...cobrancaHandlers, // cobrança mensal da plataforma (handlers/cobranca.js)
  handleImportarOfx: integracoesHandlers.handleImportarOfx, // conciliação de extrato OFX (handlers/integracoes.js)
});
registerComercial(apiRouter, {
  ...clientesHandlers, // handlers/clientes.js
  handlePortalImpersonate: portalHandlers.handlePortalImpersonate, // "Ver portal como cliente" (handlers/portal.js)
  ...fornecedoresHandlers, // handlers/fornecedores.js
  ...clausulasHandlers, // cláusulas reusáveis + apresentação (handlers/clausulas.js)
  ...propostasHandlers, // CRUD + custos + ciclo + geradores DOCX/PDF/preview (handlers/propostas.js)
  ...propostaAnexosHandlers, // anexos PDF/imagem: upload + get/put/delete (handlers/proposta-anexos.js)
  ...caseLogosHandlers, // case logos: list/get-image + upload + put/delete (handlers/case-logos.js)
});
registerOperacao(apiRouter, {
  ...recursosHandlers, // CRUD principal (handlers/recursos.js)
  ...recursoFolgasHandlers, // folgas + passagens (handlers/recurso-folgas.js)
  ...recursoDocsHandlers, // metadados (Add/Put/Delete/Status) + arquivo BYTEA + validação IA (handlers/recurso-documentos.js)
  ...estoqueHandlers, // itens/almoxarifados/movimentações/saldo/visão geral (handlers/estoque.js)
  handleListSolicitacoesCompra,
  handlePostSolicitacaoCompra,
  handlePutSolicitacaoCompra,
  handleDeleteSolicitacaoCompra,
  handleAvaliarSolicitacao,
  handleCancelarSolicitacao,
  handleAprovarSolicitacao,
  handleRejeitarSolicitacao,
  handleComprarSolicitacao,
  handleReceberSolicitacao,
  handleCotacoesHistorico,
  handleListManutencoes,
  handlePostManutencao,
  handlePutManutencao,
  handleDeleteManutencao,
  handleRetornoManutencao,
  handleCancelarManutencao,
  handleAvaliarManutencao,
  handleAprovarManutencao,
  handleRejeitarManutencao,
  ...manutencaoFotosHandlers, // fotos da manutenção: upload (multipart, interceptado) + delete

  ...frotaHandlers, // veículos/planos/manutenções/abastecimentos (handlers/frota.js)
  ...dashboardCobrancaHandlers, // handleDashboardCobranca (handlers/dashboard-cobranca.js)
  ...dashboardsHandlers, // operacional + layouts (handlers/dashboards.js; handleDashboard financeiro é usado só no platform)
  ...docTemplatesHandlers, // handlers/doc-templates.js
});
registerContracts(apiRouter, {
  ...contractRdosHandlers,
  ...contractsHandlers, // RDO global+CRUD (handlers/contract-rdos.js) + CRUD do contrato (handlers/contracts.js)
  ...contractSaidasHandlers,
  ...contractServicosHandlers, // BM estruturado: planilha de serviços (handlers/contract-servicos.js)
  ...contractMedicoesHandlers, // BM estruturado: medições por itens + aprovação (handlers/contract-medicoes.js)
  ...contractExtrasHandlers, // saídas/BM + budget/aditivos/marcos/ocorrências
  ...atividadesHandlers, // cronograma físico-financeiro + curva S (handlers/atividades.js)
  ...contractOrganogramaHandlers, // handlers/contract-organograma.js
  ...rdoFotosHandlers, // fotos: upload + delete (handlers/rdo-fotos.js)
  ...rdoAssinaturasHandlers, // assinaturas digitais: upload + list/get/delete (handlers/rdo-assinaturas.js)
});

// Serve foto de RDO a partir do banco (BYTEA). Mantém a URL antiga
// /data/rdo-fotos/<rdoId>/<fotoId>.<ext> — o fotoId é o nome do arquivo sem
// extensão (handlers/rdo-fotos.js grava filename = fotoId + ext).
async function serveRdoFotoFromDb(pathname, req, res) {
  try {
    // Exige sessão válida (antes era estático público; fotos de obra podem ser
    // sensíveis). <img> same-origin e download direto enviam o cookie httpOnly.
    const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
    const sessionUser = await auth.getUserBySession(sid);
    if (!sessionUser) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Não autenticado');
      return;
    }
    const parts = pathname.split('/'); // ['', 'data', 'rdo-fotos', rdoId, filename]
    const rdoId = parts[3];
    const filename = parts[4] || '';
    const fotoId = filename.replace(/\.[^.]+$/, '');
    // Defesa em profundidade: IDs têm formato fixo (generateId) — rejeita ".." etc.
    if (!/^rdo_[0-9a-z]+$/i.test(rdoId) || !/^foto_[0-9a-z]+$/i.test(fotoId)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const row = await db.getOne('SELECT mime, data FROM rdo_fotos WHERE id = $1 AND rdo_id = $2', [
      fotoId,
      rdoId,
    ]);
    if (!row || !row.data) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': row.mime || 'image/jpeg',
      'Content-Length': row.data.length,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(row.data);
  } catch (_e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Erro ao carregar foto');
  }
}

// Serve foto de manutenção a partir do banco (BYTEA), espelhando o RDO.
// URL: /data/manutencao-fotos/<manutencaoId>/<fotoId>.<ext> — o fotoId é o nome
// do arquivo sem extensão (handlers/manutencao-fotos.js grava filename = fotoId + ext).
async function serveManutencaoFotoFromDb(pathname, req, res) {
  try {
    const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
    const sessionUser = await auth.getUserBySession(sid);
    if (!sessionUser) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Não autenticado');
      return;
    }
    const parts = pathname.split('/'); // ['', 'data', 'manutencao-fotos', manutencaoId, filename]
    const manutencaoId = parts[3];
    const filename = parts[4] || '';
    const fotoId = filename.replace(/\.[^.]+$/, '');
    // Defesa em profundidade: IDs têm formato fixo (generateId) — rejeita ".." etc.
    if (!/^man_[0-9a-z]+$/i.test(manutencaoId) || !/^foto_[0-9a-z]+$/i.test(fotoId)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const row = await db.getOne(
      'SELECT mime, data FROM manutencao_fotos WHERE id = $1 AND manutencao_id = $2',
      [fotoId, manutencaoId]
    );
    if (!row || !row.data) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': row.mime || 'image/jpeg',
      'Content-Length': row.data.length,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(row.data);
  } catch (_e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Erro ao carregar foto');
  }
}

function routeRequest(pathname, method, body, res, parsedUrl, req) {
  // Router modular — se o domínio já foi migrado, casa aqui e encerra.
  if (apiRouter.dispatch({ pathname, method, body, res, parsedUrl, req })) return;

  // ============ Rotas legadas (migração por domínio em andamento) ============

  // ============ Portal do Cliente — rotas em routes/portal.js ============
  // Catch-all: /api/portal/* desconhecido → 404 do portal (após portal-auth).
  if (pathname.startsWith('/api/portal/')) {
    (async () => {
      if (await portalHandlers.applyPortalAuth(req, res)) return;
      sendError(res, 404, 'Rota do portal não encontrada');
    })();
    return;
  }

  // Static files
  if (pathname === '/' || pathname === '') {
    return serveStaticFile('/index.html', res);
  }

  // Fotos de RDO: servidas do banco (BYTEA), não do disco.
  if (pathname.startsWith('/data/rdo-fotos/')) {
    serveRdoFotoFromDb(pathname, req, res);
    return;
  }

  // Fotos de manutenção: servidas do banco (BYTEA), não do disco.
  if (pathname.startsWith('/data/manutencao-fotos/')) {
    serveManutencaoFotoFromDb(pathname, req, res);
    return;
  }

  // No modo cutover, rotas SPA do React (ex.: /dashboard, /contratos/:id) caem
  // direto na serveStaticFile, que devolve o index.html quando o arquivo não
  // existe. Sem o modo cutover, a allowlist em serveStaticFile devolve 404.
  serveStaticFile(pathname, res);
}

// ============ F6: Anomaly Detection ============
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

// ============ LGPD + IA + OFX ============
// → handlers/integracoes.js (export/anonimização LGPD, chat/classify IA com
// rate-limit, importação/conciliação OFX). Registrados em platform/financeiro.

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

// ============ Níveis de Acesso handlers ============
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

// ============ Recursos handlers ============
/**
 * Pode ver o CPF completo? LGPD — super admin ou quem tem permissão de EDIÇÃO
 * em Recursos (#/recursos) vê o CPF inteiro; os demais veem mascarado. Quem
 * edita precisa do valor real; quem só visualiza não precisa enxergar a PII.
 */
// Recursos (CRUD principal + máscara de CPF/LGPD) extraídos → handlers/recursos.js

// Folgas + Passagens de recursos extraídas → handlers/recurso-folgas.js

// ============ Doc Templates handlers ============
// Templates de documento (CRUD) extraídos → handlers/doc-templates.js

// Validação de documento (IA) extraída → handlers/recurso-documentos.js

// ============ Cobrança Mensal (admin) ============
// → handlers/cobranca.js (taxa fixa + valor por contrato ativo, faixas por
// volume). Registrado via `...cobrancaHandlers` em registerFinanceiro.

// ============ Documentos de colaboradores handlers ============
// → handlers/recurso-documentos.js (Add/Put/Delete metadados no JSONB +
// GetDocumentosStatus). Arquivos BYTEA e validação por IA já estavam lá.

// Arquivos de documentos de recurso extraídos → handlers/recurso-documentos.js

// ============ Dashboard layouts (preferências por usuário) ============
// → handlers/dashboards.js (List/Post/Put/Delete). Registrado em registerOperacao.

// ============ Almoxarifado / Estoque ============
// Estoque (itens, almoxarifados, movimentações, saldo e visão geral) extraído
// → handlers/estoque.js. Os helpers ensureAlmoxarifadoCentral/_resolveAlmoxId/
// _ajustarSaldo vêm de lá (importados no topo) — Solicitações de Compra e o
// startup ainda os usam.

// ============ Solicitações de Compra ============
// Normaliza itens na criação (encarregado): só descrição + qtd + observações (sem preço/cotações).
function _normalizaItensInicial(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => ({
      itemEstoqueId: it.itemEstoqueId || null,
      descricao: (it.descricao || '').trim(),
      qtd: parseFloat(it.qtd) || 0,
      observacoes: it.observacoes || '',
      tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
      cotacoes: [],
      cotacaoEscolhidaIdx: null,
      precoUnit: 0,
    }))
    .filter((it) => it.descricao && it.qtd > 0);
}

// Normaliza itens na avaliação (financeiro): cada item com cotações + cotacaoEscolhidaIdx.
// Retorna { itens, total, fornecedorIdEscolhido } onde fornecedorIdEscolhido é o fornecedor
// da primeira cotação escolhida (usado pra criar a Conta a Pagar).
function _normalizaItensComCotacoes(arr) {
  if (!Array.isArray(arr)) return { itens: [], total: 0, fornecedorIdEscolhido: null };
  let fornecedorIdEscolhido = null;
  const itens = arr
    .map((it) => {
      const cotacoes = Array.isArray(it.cotacoes)
        ? it.cotacoes.map((c) => ({
            fornecedorId: c.fornecedorId || null,
            fornecedorNome: (c.fornecedorNome || '').trim(),
            precoUnit: parseFloat(c.precoUnit) || 0,
            link: c.link || '',
            observacoes: c.observacoes || '',
          }))
        : [];
      const idx =
        it.cotacaoEscolhidaIdx != null && cotacoes[it.cotacaoEscolhidaIdx]
          ? it.cotacaoEscolhidaIdx
          : cotacoes.length > 0
            ? 0
            : null;
      const precoUnit = idx != null ? cotacoes[idx].precoUnit : 0;
      if (idx != null && !fornecedorIdEscolhido) fornecedorIdEscolhido = cotacoes[idx].fornecedorId;
      return {
        itemEstoqueId: it.itemEstoqueId || null,
        descricao: (it.descricao || '').trim(),
        qtd: parseFloat(it.qtd) || 0,
        observacoes: it.observacoes || '',
        tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
        cotacoes,
        cotacaoEscolhidaIdx: idx,
        precoUnit,
      };
    })
    .filter((it) => it.descricao && it.qtd > 0);
  const total = itens.reduce((s, i) => s + i.qtd * i.precoUnit, 0);
  return { itens, total, fornecedorIdEscolhido };
}

async function _temPermissao(req, perm) {
  const nivelId = req.user?.nivelAcessoId;
  // nivelAcessoId === null significa super admin (criado via bootstrapAdmin ou sem perfil atribuído).
  // Super admins têm acesso irrestrito por convenção — requireAdmin já validou isso antes.
  if (!nivelId) return true;
  const nivel = await repos.niveisAcesso.findById(nivelId);
  return !!(nivel?.abas || []).includes(perm);
}

async function handleListSolicitacoesCompra(query, res) {
  try {
    const where = [];
    const params = [];
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.contractId) {
      params.push(query.contractId);
      where.push(`contract_id = $${params.length}`);
    }
    if (query.solicitanteUserId) {
      params.push(query.solicitanteUserId);
      where.push(`solicitante_user_id = $${params.length}`);
    }
    const sql = `SELECT * FROM solicitacoes_compra ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { solicitacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostSolicitacaoCompra(req, body, res) {
  try {
    // Encarregado cria com itens + qtd + destino (sede ou obra) + justificativa.
    // Preços são definidos pelo financeiro na avaliação.
    const itens = _normalizaItensInicial(body.itens);
    if (!itens.length) return sendError(res, 400, 'Adicione pelo menos um item válido');
    const id = generateId('sol');
    const data = {
      id,
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
      contractId: body.contractId || null,
      almoxarifadoDestinoId: await _resolveAlmoxId(body.almoxarifadoDestinoId || 'auto-central'),
      fornecedorId: null,
      itens: JSON.stringify(itens),
      valorTotal: 0,
      justificativa: body.justificativa || '',
      dataDesejadaObra: body.dataDesejadaObra || null,
      status: 'pendente_avaliacao',
    };
    const created = await repos.solicitacoesCompra.create(data);
    sendJson(res, { solicitacao: created });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutSolicitacaoCompra(id, body, res) {
  try {
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status !== 'pendente_avaliacao') {
      return sendError(res, 400, 'Só é possível editar solicitações aguardando avaliação');
    }
    const allowed = {};
    if (body.justificativa !== undefined) allowed.justificativa = body.justificativa;
    if (body.contractId !== undefined) allowed.contractId = body.contractId || null;
    if (body.almoxarifadoDestinoId !== undefined) {
      allowed.almoxarifadoDestinoId = await _resolveAlmoxId(body.almoxarifadoDestinoId);
    }
    if (body.itens !== undefined) {
      allowed.itens = JSON.stringify(_normalizaItensInicial(body.itens));
    }
    if (body.dataDesejadaObra !== undefined)
      allowed.dataDesejadaObra = body.dataDesejadaObra || null;
    const result = await repos.solicitacoesCompra.updateById(id, allowed);
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteSolicitacaoCompra(id, res) {
  try {
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status === 'aprovada')
      return sendError(res, 400, 'Solicitação aprovada não pode ser excluída');
    await repos.solicitacoesCompra.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Histórico de Cotações ============

async function handleCotacoesHistorico(query, res) {
  try {
    const params = [];
    let itemFilter = '';
    if (query.item) {
      // Escapa metacaracteres ILIKE (%, _, \) — senão `?item=%` retorna tudo
      // e `?item=____` vira varredura cara (injeção de padrão ILIKE).
      params.push(`%${String(query.item).replace(/[%_\\]/g, (c) => '\\' + c)}%`);
      itemFilter = `AND t1.item_v->>'descricao' ILIKE $${params.length}`;
    }
    const sql = `
      SELECT
        sc.numero::text           AS sc_numero,
        sc.created_at,
        sc.contract_id,
        c.name                    AS contract_name,
        t1.item_v->>'descricao'   AS item_descricao,
        t2.cot_v->>'fornecedorNome' AS fornecedor,
        t2.cot_v->>'fornecedorId'   AS fornecedor_id,
        COALESCE((t2.cot_v->>'precoUnit')::numeric, 0) AS valor,
        (t2.cot_ord - 1) = COALESCE((t1.item_v->>'cotacaoEscolhidaIdx')::int, -1) AS venceu
      FROM solicitacoes_compra sc
      LEFT JOIN contracts c ON c.id = sc.contract_id,
        jsonb_array_elements(sc.itens) AS t1(item_v),
        jsonb_array_elements(t1.item_v -> 'cotacoes') WITH ORDINALITY AS t2(cot_v, cot_ord)
      WHERE sc.status NOT IN ('cancelada')
        AND jsonb_typeof(t1.item_v -> 'cotacoes') = 'array'
        AND jsonb_array_length(t1.item_v -> 'cotacoes') > 0
        AND (t2.cot_v->>'fornecedorNome') IS NOT NULL
        ${itemFilter}
      ORDER BY sc.created_at DESC
      LIMIT 1000
    `;
    const rows = await db.getMany(sql, params);
    sendJson(res, { cotacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Manutenção de Equipamentos ============
// Fluxo: solicitada → pendente_aprovacao → aprovada → retornado
//        (+ rejeitada / cancelada).
// O solicitante só solicita; a equipe de compras avalia (oficina/prazo/custo);
// a gerência aprova ou rejeita.

async function handleListManutencoes(query, res) {
  try {
    const where = [];
    const params = [];
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.contractId) {
      params.push(query.contractId);
      where.push(`contract_id = $${params.length}`);
    }
    const sql = `SELECT * FROM manutencoes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { manutencoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// 1ª etapa — solicitante: apenas o equipamento e o problema.
// Normaliza a lista de materiais do romaneio: { descricao, patrimonio, qtd }.
// Mantém só linhas com descrição; qtd default 1.
function _normalizaItensManutencao(itens) {
  if (!Array.isArray(itens)) return [];
  return itens
    .map((it) => ({
      descricao: (it?.descricao || '').trim(),
      patrimonio: (it?.patrimonio || '').trim(),
      qtd: parseFloat(it?.qtd) || 0,
    }))
    .filter((it) => it.descricao);
}

async function handlePostManutencao(req, body, res) {
  try {
    const equipamento = (body.equipamento || '').trim();
    if (!equipamento) return sendError(res, 400, 'Informe o equipamento');
    // Número do romaneio: sequencial por ano de criação, gravado no pedido
    // (RM-NNN-AAAA). max(ano corrente)+1 — corrida é improvável nesta escala.
    const seqRow = await db.getOne(
      `SELECT COALESCE(MAX(romaneio_numero), 0) + 1 AS next
         FROM manutencoes
        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`
    );
    const romaneioNumero = (seqRow && seqRow.next) || 1;
    const data = {
      id: generateId('man'),
      equipamento,
      contractId: body.contractId || null,
      problema: (body.problema || '').trim(),
      status: 'solicitada',
      custo: 0,
      custoEstimado: 0,
      observacoes: (body.observacoes || '').trim(),
      itens: JSON.stringify(_normalizaItensManutencao(body.itens)),
      romaneioNumero,
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
    };
    const created = await repos.manutencoes.create(data);
    sendJson(res, { manutencao: created });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Solicitante edita enquanto ainda está 'solicitada'.
async function handlePutManutencao(id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'solicitada') {
      return sendError(res, 400, 'Só é possível editar enquanto a manutenção está como solicitada');
    }
    const allowed = {};
    if (body.equipamento !== undefined) {
      const eq = (body.equipamento || '').trim();
      if (!eq) return sendError(res, 400, 'Informe o equipamento');
      allowed.equipamento = eq;
    }
    if (body.contractId !== undefined) allowed.contractId = body.contractId || null;
    if (body.problema !== undefined) allowed.problema = (body.problema || '').trim();
    if (body.observacoes !== undefined) allowed.observacoes = (body.observacoes || '').trim();
    if (body.itens !== undefined)
      allowed.itens = JSON.stringify(_normalizaItensManutencao(body.itens));
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 2ª etapa — equipe de compras: define oficina, prazo e custo estimado.
async function handleAvaliarManutencao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'manutencao:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para avaliar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'solicitada') {
      return sendError(res, 400, `Esta manutenção já está ${atual.status}`);
    }
    const oficina = (body.oficina || '').trim();
    if (!oficina) return sendError(res, 400, 'Informe a oficina / empresa que vai reparar');
    const allowed = {
      oficina,
      custoEstimado: money.parse(body.custoEstimado),
      dataEnvio: body.dataEnvio || null,
      dataRetornoPrevista: body.dataRetornoPrevista || null,
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
      avaliadoEm: new Date(),
      status: 'pendente_aprovacao',
    };
    if (body.observacoes != null && String(body.observacoes).trim()) {
      allowed.observacoes = String(body.observacoes).trim();
    }
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 3ª etapa — gerência aprova.
async function handleAprovarManutencao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'manutencao:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para aprovar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'pendente_aprovacao') {
      return sendError(res, 400, 'Só é possível aprovar manutenções aguardando aprovação');
    }
    const result = await repos.manutencoes.updateById(id, {
      status: 'aprovada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 3ª etapa — gerência rejeita.
async function handleRejeitarManutencao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'manutencao:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para rejeitar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'pendente_aprovacao') {
      return sendError(res, 400, 'Só é possível rejeitar manutenções aguardando aprovação');
    }
    const result = await repos.manutencoes.updateById(id, {
      status: 'rejeitada',
      motivoRejeicao: (body.motivo || '').trim() || null,
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Encerramento — registra o retorno do equipamento.
async function handleRetornoManutencao(req, id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'aprovada') {
      return sendError(res, 400, 'Só é possível registrar retorno de manutenções aprovadas');
    }
    const allowed = {
      status: 'retornado',
      dataRetorno: body.dataRetorno || new Date().toISOString().slice(0, 10),
      custo: money.parse(body.custo),
    };
    if (body.observacoes != null && String(body.observacoes).trim()) {
      allowed.observacoes = String(body.observacoes).trim();
    }
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleCancelarManutencao(req, id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status === 'retornado')
      return sendError(res, 400, 'Manutenção concluída não pode ser cancelada');
    if (atual.status === 'cancelada') return sendError(res, 400, 'Manutenção já cancelada');
    const result = await repos.manutencoes.updateById(id, {
      status: 'cancelada',
      motivoCancelamento: (body?.motivo || '').trim() || null,
      canceladoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteManutencao(id, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    await repos.manutencoes.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAvaliarSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para avaliar solicitações');
    }
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(atual.status, 'avaliar')) {
      return sendError(res, 400, `Solicitação já está ${atual.status}`);
    }
    const { itens, total, fornecedorIdEscolhido } = _normalizaItensComCotacoes(body.itens);
    if (!itens.length) return sendError(res, 400, 'Itens inválidos');
    if (itens.some((it) => it.cotacoes.length === 0)) {
      return sendError(res, 400, 'Cada item precisa ter ao menos uma cotação');
    }

    // Destino vem do encarregado e NÃO é alterado pelo financeiro.
    const allowed = {
      itens: JSON.stringify(itens),
      valorTotal: total,
      fornecedorId: body.fornecedorId || fornecedorIdEscolhido || null,
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
      avaliadoEm: new Date(),
      status: 'pendente_aprovacao',
    };
    const result = await repos.solicitacoesCompra.updateById(id, allowed);
    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[avaliar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

async function handleCancelarSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para cancelar solicitações');
    }
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(atual.status, 'cancelar')) {
      return sendError(res, 400, `Solicitação já está ${atual.status}`);
    }
    if (!body.motivo || !body.motivo.trim()) {
      return sendError(res, 400, 'Motivo do cancelamento obrigatório');
    }
    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'cancelada',
      motivoCancelamento: body.motivo,
      canceladoEm: new Date(),
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAprovarSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para aprovar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (sol.status === 'pendente_avaliacao') {
      return sendError(
        res,
        400,
        'Solicitação aguarda avaliação do financeiro antes de poder ser aprovada'
      );
    }
    if (!fluxoCompra.podeTransicionar(sol.status, 'aprovar'))
      return sendError(res, 400, `Solicitação já está ${sol.status}`);

    // Aprovação só autoriza — a Conta a Pagar nasce no /comprar (financeiro registra a compra),
    // e a entrada de estoque nasce no /receber (quando o material chega).
    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'aprovada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[aprovar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

// Financeiro registra que a compra foi efetivamente feita junto ao fornecedor.
// Cria a Conta a Pagar e marca a solicitação como 'comprada'.
async function handleComprarSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para registrar compras');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'comprar')) {
      return sendError(
        res,
        400,
        `Só é possível registrar compra de solicitações aprovadas (atual: ${sol.status})`
      );
    }

    const venc =
      body.dataVencimento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const fornecedorId = body.fornecedorId || sol.fornecedorId || null;
    const numeroPedido = (body.numeroPedido || '').trim();
    const dataPrevistaEntrega = body.dataPrevistaEntrega || null;

    const result = await db.withTransaction(async (client) => {
      // Cria Conta a Pagar com o valor já definido na avaliação
      const cpId = generateId('cp');
      await client.query(
        `INSERT INTO contas_pagar
          (id, descricao, valor, data_vencimento, fornecedor_id, contract_id, status, observacoes, category)
         VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8)`,
        [
          cpId,
          `Solicitação de compra #${sol.numero || id.slice(-6)}${numeroPedido ? ' · pedido ' + numeroPedido : ''}`,
          sol.valorTotal,
          venc,
          fornecedorId,
          sol.contractId,
          sol.justificativa || '',
          'Estoque',
        ]
      );

      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'comprada',
             comprador_user_id = $2, comprador_nome = $3, comprado_em = NOW(),
             numero_pedido = $4, data_prevista_entrega = $5,
             conta_pagar_id = $6, fornecedor_id = COALESCE($7, fornecedor_id), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          req.user?.id || null,
          req.user?.name || req.user?.email || null,
          numeroPedido || null,
          dataPrevistaEntrega,
          cpId,
          fornecedorId,
        ]
      );
      return db.rowToCamel(upd.rows[0]);
    });

    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[comprar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

// Almoxarife / financeiro confirma chegada do material — gera entrada de estoque.
async function handleReceberSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:receber'))) {
      return sendError(res, 403, 'Sem permissão para confirmar recebimento');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'receber')) {
      return sendError(
        res,
        400,
        `Só é possível receber solicitações compradas (atual: ${sol.status})`
      );
    }

    const itensSol = Array.isArray(sol.itens)
      ? sol.itens
      : typeof sol.itens === 'string'
        ? JSON.parse(sol.itens)
        : [];
    if (!itensSol.length) return sendError(res, 400, 'Solicitação sem itens');
    const destinoId = sol.almoxarifadoDestinoId || (await ensureAlmoxarifadoCentral());
    const dataReceb = body.dataRecebimento || new Date().toISOString().split('T')[0];
    const nfReceb = (body.nfRecebimento || '').trim();
    const obsReceb = (body.obsRecebimento || '').trim();

    const result = await db.withTransaction(async (client) => {
      const movIds = [];
      for (const it of itensSol) {
        if (!it.itemEstoqueId || !(parseFloat(it.qtd) > 0)) continue;
        const movId = generateId('mov');
        await client.query(
          `INSERT INTO estoque_movimentacoes
            (id, item_id, almoxarifado_destino_id, tipo, quantidade, custo_unit, contract_id, data, documento, user_id, notas)
           VALUES ($1,$2,$3,'entrada',$4,$5,$6,$7,$8,$9,$10)`,
          [
            movId,
            it.itemEstoqueId,
            destinoId,
            it.qtd,
            it.precoUnit || 0,
            sol.contractId,
            dataReceb,
            nfReceb || `Solicitação ${id}`,
            req.user?.id || null,
            `Recebida por ${req.user?.name || ''}`.trim(),
          ]
        );
        await _ajustarSaldo(client, it.itemEstoqueId, destinoId, parseFloat(it.qtd));
        // Recalcula custo médio ponderado
        if ((parseFloat(it.precoUnit) || 0) > 0) {
          const item = (
            await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [
              it.itemEstoqueId,
            ])
          ).rows[0];
          const saldoTotal =
            parseFloat(
              (
                await client.query(
                  'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
                  [it.itemEstoqueId]
                )
              ).rows[0].s
            ) || 0;
          const saldoAnt = saldoTotal - parseFloat(it.qtd);
          const custoMedAnt = parseFloat(item?.custo_medio) || 0;
          const novoCustoMedio =
            saldoTotal > 0
              ? (saldoAnt * custoMedAnt + parseFloat(it.qtd) * parseFloat(it.precoUnit)) /
                saldoTotal
              : parseFloat(it.precoUnit);
          await client.query(
            'UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1',
            [it.itemEstoqueId, novoCustoMedio]
          );
        }
        movIds.push(movId);
      }

      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'recebida',
             recebedor_user_id = $2, recebedor_nome = $3, recebido_em = NOW(),
             data_recebimento = $4, nf_recebimento = $5, obs_recebimento = $6,
             movimentacao_ids = $7, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          req.user?.id || null,
          req.user?.name || req.user?.email || null,
          dataReceb,
          nfReceb || null,
          obsReceb || null,
          JSON.stringify(movIds),
        ]
      );
      return db.rowToCamel(upd.rows[0]);
    });

    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[receber-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

async function handleRejeitarSolicitacao(req, id, body, res) {
  try {
    if (!(await _temPermissao(req, 'solicitacoes-compra:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para rejeitar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'rejeitar'))
      return sendError(res, 400, `Solicitação já está ${sol.status}`);

    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'rejeitada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
      motivoRejeicao: body.motivo || '',
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Frota / Veículos ============
// → handlers/frota.js (veículos, planos de preventiva, manutenções de veículo e
// abastecimentos com espelho no caixa). Registrado via `...frotaHandlers`.

// ============ Cronograma físico-financeiro (atividades) ============
// → handlers/atividades.js (CRUD de atividades + Curva S). Registrado via
// `...atividadesHandlers` em registerContracts.

// Assinaturas digitais de RDO extraídas → handlers/rdo-assinaturas.js

// Lista TODOS os arquivos do sistema com tamanho (sem o BYTEA)
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

// handleGetDocumentosStatus → handlers/recurso-documentos.js

// Export for testing; start only when run directly
async function bootstrap() {
  try {
    const db = require('./db');
    await db.ping();
    console.log('[server] Postgres conectado');

    // LGPD: avisa cedo se a chave de PII não estiver configurada — leitura de
    // dados legados ainda funciona, mas escrita de CPF/documento vai falhar.
    if (!piiCrypto.isConfigured()) {
      console.warn(
        '[pii] PII_ENCRYPTION_KEY ausente — gravação de CPF/documentos vai falhar. Ver docs/LGPD.md.'
      );
    }

    // Auto-aplicar schema.sql na primeira execução (cloud deploy: Railway/Render).
    // Idempotente — todos CREATE TABLE são "IF NOT EXISTS".
    // Desabilitar com AUTO_SCHEMA=0 se preferir gerenciar migrações manualmente.
    if (process.env.AUTO_SCHEMA !== '0') {
      try {
        const schemaPath = path.join(__dirname, 'db', 'schema.sql');
        if (fs.existsSync(schemaPath)) {
          const sql = fs.readFileSync(schemaPath, 'utf8');
          await db.query(sql);
          console.log('[server] Schema aplicado');
        }
      } catch (e) {
        console.warn('[server] Aviso ao aplicar schema:', e.message);
      }
    }

    await auth.bootstrapAdmin();
    await auth.purgeExpiredSessions();
    // Garante que o almoxarifado Central exista (idempotente)
    try {
      await ensureAlmoxarifadoCentral();
    } catch (e) {
      console.warn('[server] Aviso ao criar almox central:', e.message);
    }
    // Limpa sessões expiradas a cada hora
    setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 60 * 60 * 1000);

    // Cleanup do rate-limit persistente — diário, mantém últimos 7 dias.
    // Roda 1x no boot pra limpar acúmulo de deploys anteriores, depois a cada 24h.
    pgRateLimit
      .cleanup(7)
      .then((n) => n > 0 && console.log(`[pg-rate-limit] cleanup inicial: ${n} rows`))
      .catch(() => {});
    setInterval(() => pgRateLimit.cleanup(7).catch(() => {}), 24 * 60 * 60 * 1000);

    // Push notifications — verifica contratos e contas a pagar a cada hora
    if (_webPush) {
      const _sendPushAll = async (payload) => {
        try {
          const { rows } = await db.query('SELECT * FROM push_subscriptions');
          for (const sub of rows) {
            try {
              await _webPush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(payload)
              );
            } catch (e) {
              // Subscription expirada → remove
              if (e.statusCode === 410 || e.statusCode === 404) {
                await db
                  .query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint])
                  .catch(() => {});
              }
            }
          }
        } catch (e) {
          console.warn('[push] Erro ao enviar:', e.message);
        }
      };

      setInterval(
        async () => {
          try {
            const hoje = new Date().toISOString().split('T')[0];
            const em7 = new Date();
            em7.setDate(em7.getDate() + 7);
            const em7str = em7.toISOString().split('T')[0];
            const em3 = new Date();
            em3.setDate(em3.getDate() + 3);
            const em3str = em3.toISOString().split('T')[0];

            // Contratos vencendo em 7 dias
            const { rows: vencendo } = await db.query(
              `SELECT name FROM contracts WHERE status='ativo' AND end_date BETWEEN $1 AND $2`,
              [hoje, em7str]
            );
            if (vencendo.length > 0) {
              await _sendPushAll({
                title: 'Contratos vencendo',
                body: `${vencendo.length} contrato(s) vencem nos próximos 7 dias`,
                icon: '/assets/logo.png',
                data: { url: '/#/contratos' },
              });
            }

            // Contas a pagar vencendo em 3 dias
            const { rows: cpVenc } = await db.query(
              `SELECT COUNT(*) as n, SUM(valor::numeric) as total FROM contas_pagar WHERE status='pendente' AND data_vencimento BETWEEN $1 AND $2`,
              [hoje, em3str]
            );
            if (parseInt(cpVenc[0]?.n || 0) > 0) {
              await _sendPushAll({
                title: 'Contas a pagar',
                body: `${cpVenc[0].n} conta(s) vencem em até 3 dias`,
                icon: '/assets/logo.png',
                data: { url: '/#/contas-pagar' },
              });
            }
          } catch (e) {
            console.warn('[push] Erro no scheduler:', e.message);
          }
        },
        60 * 60 * 1000
      ); // a cada 1 hora
    }
  } catch (e) {
    console.error('[server] Falha ao conectar no Postgres:', e.message);
    process.exit(1);
  }
}

// ── Backup automático diário por email ─────────────────────────────────────
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || process.env.ADMIN_EMAIL || '';
const BACKUP_HOUR = parseInt(process.env.BACKUP_HOUR || '3', 10); // 3h da manhã (UTC)

async function _runEmailBackup() {
  const email = require('./lib/email');
  if (!BACKUP_EMAIL) {
    console.warn('[backup] BACKUP_EMAIL não configurado — pulando envio');
    return;
  }
  try {
    const safe = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        console.warn('[dump] coleta falhou (resultado vazio):', e && e.message);
        return [];
      }
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const payload = {
      _meta: {
        version: APP_VERSION,
        generatedAt: new Date().toISOString(),
        format: 'rhino-backup-v1',
      },
      contracts: await safe(() => repos.contracts.findAllWithChildren()),
      saidas: await safe(() => repos.saidas.findAll()),
      caixa: await safe(() => repos.caixa.findAll()),
      base: await safe(() => repos.baseItems.findAll()),
      socios: await safe(() => repos.socios.findAll()),
      investimentos: await safe(() => repos.investimentos.findAll()),
      notas_fiscais: await safe(() => repos.notasFiscais.findAll()),
      tipos_base: await safe(() => repos.tiposBase.findAll()),
      clientes: await safe(() => repos.clientes.findAll()),
      fornecedores: await safe(() => repos.fornecedores.findAll()),
      contas_pagar: await safe(() => repos.contasPagar.findAll()),
      niveis_acesso: await safe(() => repos.niveisAcesso.findAll()),
      recursos: await safe(() => repos.recursos.findAllRaw()), // CPF cifrado no export (LGPD)
      doc_templates: await safe(() => repos.docTemplates.findAll()),
    };
    const json = JSON.stringify(payload);
    const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
    const filename = `rhino-backup-${timestamp}.json`;
    const base64 = Buffer.from(json).toString('base64');

    const tableRows = Object.entries(payload)
      .filter(([k]) => k !== '_meta')
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td style="padding:4px 0;font-weight:600;">${Array.isArray(v) ? v.length : '—'} registros</td></tr>`
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <div style="background:#55588B;color:#fff;padding:16px 24px;font-size:17px;font-weight:700;">Rhino — Backup diário</div>
        <div style="padding:20px 24px;font-size:14px;line-height:1.6;">
          <p>Backup gerado automaticamente em <strong>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:12px 0;">${tableRows}</table>
          <p style="color:#6b7280;font-size:13px;">Tamanho: ${sizeMB} MB · Arquivo: ${filename}</p>
          <p style="color:#6b7280;font-size:13px;">O arquivo JSON está anexado. Para restaurar, use <code>scripts/migrate-json-to-pg.js</code>.</p>
        </div>
        <div style="background:#f9fafb;padding:12px 24px;font-size:12px;color:#6b7280;">Rhino · Backup automático diário às ${BACKUP_HOUR}h UTC</div>
      </div>`;

    const result = await email.send({
      to: BACKUP_EMAIL,
      subject: `Rhino Backup ${new Date().toLocaleDateString('pt-BR')} — ${sizeMB} MB`,
      html,
      text: `Backup Rhino gerado em ${new Date().toISOString()}. Tamanho: ${sizeMB} MB.`,
      attachments: [
        { filename, content: base64, type: 'application/json', disposition: 'attachment' },
      ],
    });

    if (result.ok) console.log(`[backup] Email enviado para ${BACKUP_EMAIL} (${sizeMB} MB)`);
    else console.warn('[backup] Falha ao enviar email:', result.error);
  } catch (e) {
    console.error('[backup] Erro ao gerar backup:', e.message);
  }
}

function _scheduleBackup() {
  if (process.env.NODE_ENV === 'test') return; // skip in CI/test environment
  function msUntilNextRun() {
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), BACKUP_HOUR, 0, 0, 0)
    );
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }
  const scheduleNext = () => {
    const ms = msUntilNextRun();
    console.log(`[backup] Próximo backup agendado em ${(ms / 3600000).toFixed(1)}h`);
    setTimeout(async () => {
      await _runEmailBackup();
      scheduleNext();
    }, ms).unref();
  };
  scheduleNext();
}

// ── Workers de jobs assíncronos (pg-boss) ──────────────────────────────────
async function _emailWorker(data) {
  const r = await email.send({
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text,
  });
  if (!r.ok && !r.dev) throw new Error(r.error || 'falha ao enviar e-mail'); // throw → pg-boss reprocessa
}

function _registerWorkers() {
  if (process.env.NODE_ENV === 'test') return; // sem fila em CI/test
  queue
    .work('email', _emailWorker)
    .then((ok) => {
      if (ok) console.log('[queue] worker de e-mail registrado');
    })
    .catch((e) => console.error('[queue] erro ao registrar workers:', e && e.message));
}

if (require.main === module) {
  bootstrap()
    .then(() => {
      server.listen(PORT, () => {
        console.log(`Rhino running at http://localhost:${PORT}`);
        _scheduleBackup();
        _registerWorkers();
      });
    })
    .catch((err) => {
      console.error('[server] Falha no bootstrap:', err);
      process.exit(1);
    });
} else {
  bootstrap()
    .then(() => {
      server.listen(PORT);
      _scheduleBackup();
      _registerWorkers();
    })
    .catch((err) => {
      console.error('[server] Falha no bootstrap:', err);
      process.exit(1);
    });
}

module.exports = { __server: server };
