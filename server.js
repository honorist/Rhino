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

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
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
const bus = require('./lib/bus');
const perms = require('./lib/permissions');
const portalImpersonate = require('./lib/portal-impersonate'); // "Ver portal como cliente" (super admin)
const fluxoCompra = require('./lib/fluxo-compra');
const recorrencia = require('./lib/recorrencia');
const { sendJson, sendError } = require('./lib/http-respond');
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

// Lê uma coleção do Postgres e retorna o envelope `{ [arrayKey]: rows }`.
// Nota: `filename` é vestigial (legado da época JSON); mantido para evitar
// editar 12 call sites. Postgres é única fonte de verdade em runtime.
async function readCollection(filename, repoName, arrayKey) {
  const rows = await repos[repoName].findAll();
  return { [arrayKey]: rows };
}

// Executa uma operação de escrita via repo e devolve o envelope atualizado.
// Lança se o PG não estiver disponível (escritas não têm fallback seguro).
async function writeCollection(repoName, arrayKey, fn) {
  if (!repos || !repos[repoName]) {
    throw new Error('Banco de dados indisponível');
  }
  const result = await fn(repos[repoName]);
  const rows = await repos[repoName].findAll();
  return { envelope: { [arrayKey]: rows }, result };
}

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

// KPIs operacionais (frota/combustível, compras, recrutamento, folha, estoque)
// com comparação mês atual × mês anterior. Endpoint leve e dedicado — o Dashboard
// carrega em paralelo (não infla o handleDashboard financeiro). Auth via /api/*.
async function handleDashboardOperacional(res) {
  const db = require('./db');
  const safe = async (fn, fallback) => {
    try {
      return (await fn()) || fallback;
    } catch (e) {
      console.error('[dash-op]', e.message);
      return fallback;
    }
  };
  const MES_ATUAL = `data >= date_trunc('month', CURRENT_DATE)`;
  const MES_ANT = `data >= date_trunc('month', CURRENT_DATE - interval '1 month') AND data < date_trunc('month', CURRENT_DATE)`;

  const [
    comb,
    topCombustivel,
    manut,
    compras,
    vagas,
    candidatos,
    folha,
    estoqueValor,
    estoqueMin,
    manutEquip,
    docsKpi,
    propostasKpi,
    candidatosParados,
    revisoes,
    folgasKpi,
    comprasParadas,
  ] = await Promise.all([
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(valor_total) FILTER (WHERE ${MES_ATUAL}),0)::float AS mes_atual,
               COALESCE(SUM(valor_total) FILTER (WHERE ${MES_ANT}),0)::float AS mes_anterior,
               COALESCE(SUM(litros) FILTER (WHERE ${MES_ATUAL}),0)::float AS litros_atual,
               COALESCE(SUM(litros) FILTER (WHERE ${MES_ANT}),0)::float AS litros_anterior
        FROM veiculo_abastecimentos`),
      { mesAtual: 0, mesAnterior: 0, litrosAtual: 0, litrosAnterior: 0 }
    ),
    safe(
      () =>
        db.getMany(`
        SELECT v.placa, v.modelo, COALESCE(SUM(a.valor_total),0)::float AS total, COALESCE(SUM(a.litros),0)::float AS litros
        FROM veiculo_abastecimentos a JOIN veiculos v ON v.id = a.veiculo_id
        WHERE a.data >= date_trunc('month', CURRENT_DATE)
        GROUP BY v.id, v.placa, v.modelo ORDER BY total DESC LIMIT 5`),
      []
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(custo) FILTER (WHERE ${MES_ATUAL}),0)::float AS mes_atual,
               COALESCE(SUM(custo) FILTER (WHERE ${MES_ANT}),0)::float AS mes_anterior
        FROM veiculo_manutencoes`),
      { mesAtual: 0, mesAnterior: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (WHERE status IN ('pendente_avaliacao','pendente_aprovacao'))::int AS abertas,
               COALESCE(SUM(valor_total) FILTER (WHERE status IN ('pendente_avaliacao','pendente_aprovacao')),0)::float AS valor_aberto,
               COALESCE(SUM(valor_total) FILTER (WHERE status='aprovada' AND aprovado_em >= date_trunc('month', CURRENT_DATE)),0)::float AS comprado_atual,
               COALESCE(SUM(valor_total) FILTER (WHERE status='aprovada' AND aprovado_em >= date_trunc('month', CURRENT_DATE - interval '1 month') AND aprovado_em < date_trunc('month', CURRENT_DATE)),0)::float AS comprado_anterior
        FROM solicitacoes_compra`),
      { abertas: 0, valorAberto: 0, compradoAtual: 0, compradoAnterior: 0 }
    ),
    safe(
      () =>
        db.getOne(
          `SELECT COALESCE(SUM(GREATEST(qtd_total - qtd_preenchida,0)),0)::int AS abertas FROM vagas`
        ),
      { abertas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (WHERE status IN ('contatado','interessado'))::int AS em_andamento,
               COUNT(*) FILTER (WHERE status='aprovado')::int AS aprovados FROM candidatos`),
      { emAndamento: 0, aprovados: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COALESCE(SUM(valor_vale + valor_saldo) FILTER (WHERE competencia = to_char(CURRENT_DATE,'YYYY-MM')),0)::float AS custo_atual,
               COALESCE(SUM(valor_vale + valor_saldo) FILTER (WHERE competencia = to_char(CURRENT_DATE - interval '1 month','YYYY-MM')),0)::float AS custo_anterior,
               COALESCE(SUM((CASE WHEN NOT vale_pago THEN valor_vale ELSE 0 END) + (CASE WHEN NOT saldo_pago THEN valor_saldo ELSE 0 END)) FILTER (WHERE competencia = to_char(CURRENT_DATE,'YYYY-MM')),0)::float AS pendente_atual
        FROM folha_pagamento`),
      { custoAtual: 0, custoAnterior: 0, pendenteAtual: 0 }
    ),
    safe(
      () =>
        db.getOne(
          `SELECT COALESCE(SUM(s.quantidade * i.custo_medio),0)::float AS valor FROM estoque_saldo s JOIN itens_estoque i ON i.id = s.item_id`
        ),
      { valor: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*)::int AS abaixo FROM (
          SELECT i.id FROM itens_estoque i LEFT JOIN estoque_saldo s ON s.item_id = i.id
          WHERE i.ativo = TRUE AND i.estoque_minimo > 0
          GROUP BY i.id, i.estoque_minimo HAVING COALESCE(SUM(s.quantidade),0) < i.estoque_minimo) t`),
      { abaixo: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('solicitada','pendente_aprovacao','aprovada'))::int AS em_aberto,
          COUNT(*) FILTER (WHERE status = 'solicitada')::int AS a_avaliar,
          COUNT(*) FILTER (WHERE status = 'aprovada')::int AS em_manutencao,
          COUNT(*) FILTER (WHERE status = 'aprovada'
            AND data_retorno_prevista IS NOT NULL
            AND data_retorno_prevista < CURRENT_DATE
            AND data_retorno IS NULL)::int AS atrasadas
        FROM manutencoes`),
      { emAberto: 0, aAvaliar: 0, emManutencao: 0, atrasadas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        WITH ds AS (
          SELECT NULLIF(doc.val->>'uploadedAt', '')::timestamptz
                   + (t.periodicidade_meses || ' months')::interval AS vence_em
          FROM recursos r,
               jsonb_each(r.documentos) AS doc(tipo, val),
               doc_templates t
          WHERE r.status = 'funcionario'
            AND r.documentos IS NOT NULL
            AND r.documentos != '{}'::jsonb
            AND t.id = doc.tipo
            AND t.periodicidade_meses IS NOT NULL
            AND (doc.val->>'uploadedAt') IS NOT NULL
        )
        SELECT
          COUNT(*) FILTER (WHERE vence_em < NOW())::int AS vencidos,
          COUNT(*) FILTER (WHERE vence_em BETWEEN NOW() AND NOW() + interval '30 days')::int AS vencendo_30d
        FROM ds`),
      { vencidos: 0, vencendo30d: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('rascunho','enviada'))::int AS em_andamento,
          COALESCE(SUM(valor_total) FILTER (WHERE status IN ('rascunho','enviada')), 0)::float AS valor_em_andamento,
          CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE status = 'aceita')::float / COUNT(*) * 100)::numeric, 0)
            ELSE 0 END::int AS taxa_conversao
        FROM propostas`),
      { emAndamento: 0, valorEmAndamento: 0, taxaConversao: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(*) FILTER (
          WHERE status IN ('contatado','interessado')
            AND updated_at < NOW() - interval '7 days'
        )::int AS parados
        FROM candidatos`),
      { parados: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(DISTINCT veiculo_id)::int AS vencidas
        FROM veiculo_planos
        WHERE ativo = TRUE
          AND intervalo_meses IS NOT NULL
          AND ultima_data IS NOT NULL
          AND (ultima_data + (intervalo_meses || ' months')::interval)::date < CURRENT_DATE`),
      { vencidas: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT COUNT(DISTINCT r.id)::int AS proximas_5d
        FROM recursos r
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.folgas, '[]'::jsonb)) AS f
        WHERE r.status = 'funcionario'
          AND NULLIF(f->>'dataInicio', '')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 5`),
      { proximas5d: 0 }
    ),
    safe(
      () =>
        db.getOne(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pendente_avaliacao')::int AS em_avaliacao,
          COUNT(*) FILTER (WHERE status = 'pendente_avaliacao'
            AND updated_at < NOW() - interval '3 days')::int AS paradas_3d
        FROM solicitacoes_compra`),
      { emAvaliacao: 0, paradas3d: 0 }
    ),
  ]);

  sendJson(res, {
    combustivel: {
      mesAtual: comb.mesAtual,
      mesAnterior: comb.mesAnterior,
      litrosAtual: comb.litrosAtual,
      litrosAnterior: comb.litrosAnterior,
    },
    topCombustivel,
    manutencao: { mesAtual: manut.mesAtual, mesAnterior: manut.mesAnterior },
    compras: {
      abertas: compras.abertas,
      valorAberto: compras.valorAberto,
      compradoAtual: compras.compradoAtual,
      compradoAnterior: compras.compradoAnterior,
    },
    recrutamento: {
      vagasAbertas: vagas.abertas,
      candidatosEmAndamento: candidatos.emAndamento,
      candidatosAprovados: candidatos.aprovados,
    },
    folha: {
      custoAtual: folha.custoAtual,
      custoAnterior: folha.custoAnterior,
      pendente: folha.pendenteAtual,
    },
    estoque: { valor: estoqueValor.valor, abaixoMinimo: estoqueMin.abaixo },
    manutEquip: {
      emAberto: manutEquip.emAberto,
      aAvaliar: manutEquip.aAvaliar,
      emManutencao: manutEquip.emManutencao,
      atrasadas: manutEquip.atrasadas,
    },
    docsKpi: { vencidos: docsKpi.vencidos, vencendo30d: docsKpi.vencendo30d },
    propostasKpi: {
      emAndamento: propostasKpi.emAndamento,
      valorEmAndamento: propostasKpi.valorEmAndamento,
      taxaConversao: propostasKpi.taxaConversao,
    },
    candidatosParados: candidatosParados.parados,
    revisoes: { vencidas: revisoes.vencidas },
    folgasKpi: { proximas5d: folgasKpi.proximas5d },
    comprasParadas: {
      emAvaliacao: comprasParadas.emAvaliacao,
      paradas3d: comprasParadas.paradas3d,
    },
  });
}

async function handleDashboard(res, query) {
  try {
    const [contracts, caixaEntries, baseItems, notasFiscaisRows] = await Promise.all([
      repos.contracts.getEnvelope(),
      repos.caixa.findAll(),
      repos.baseItems.findAll(),
      repos.notasFiscais.findAll(),
    ]);
    const caixa = { entries: caixaEntries };
    const base = { items: baseItems };
    const notasFiscais = { notas_fiscais: notasFiscaisRows };

    // Janela do gráfico — configurável via ?projDays (30/60/90, default 60, max 180).
    // Controla TANTO o histórico (passado) quanto a projeção (futuro).
    const projDays = Math.min(180, Math.max(7, parseInt(query?.projDays) || 60));

    // Period filter: mes=1-12, ano=YYYY, or modo='ano' for full year
    const hoje = new Date();
    const filtroAno = query && query.ano ? parseInt(query.ano) : null;
    const filtroMes = query && query.mes ? parseInt(query.mes) : null;
    const modoAno = query && query.modo === 'ano';

    // Build period boundaries for caixa filtering
    let periodoInicio = null;
    let periodoFim = null;
    if (filtroAno && filtroMes && !modoAno) {
      periodoInicio = new Date(filtroAno, filtroMes - 1, 1);
      periodoFim = new Date(filtroAno, filtroMes, 0, 23, 59, 59, 999);
    } else if (filtroAno && modoAno) {
      periodoInicio = new Date(filtroAno, 0, 1);
      periodoFim = new Date(filtroAno, 11, 31, 23, 59, 59, 999);
    }

    const activeContracts = contracts.contracts.filter((c) => c.status === 'ativo').length;
    const totalContractValue = contracts.contracts
      .filter((c) => c.status === 'ativo')
      .reduce((sum, c) => sum + c.value, 0);

    const totalSaidas = contracts.saidas.reduce((sum, s) => sum + s.value, 0);

    const totalBaseUnallocated = base.items.reduce((sum, item) => {
      const allocated = (item.allocations || []).reduce((s, a) => s + a.value, 0);
      return sum + (item.value - allocated);
    }, 0);

    // Caixa balance: always total (not filtered by period)
    const caixaBalance = caixa.entries.reduce((sum, e) => {
      return e.type === 'entrada' ? sum + e.value : sum - e.value;
    }, 0);

    const recentCaixaEntries = [...caixa.entries]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);

    const contractsWithMargin = contracts.contracts.map((c) => {
      const cSaidas = contracts.saidas
        .filter((s) => s.contractId === c.id)
        .reduce((sum, s) => sum + s.value, 0);
      const margin = c.value - cSaidas;
      return {
        id: c.id,
        name: c.name,
        client: c.client,
        value: c.value,
        totalSaidas: cSaidas,
        margin: margin,
        marginPct: c.value > 0 ? ((margin / c.value) * 100).toFixed(2) : 0,
        status: c.status,
        endDate: c.endDate,
      };
    });

    // Contratos a vencer nos próximos 30 dias
    const em30dias = new Date(hoje);
    em30dias.setDate(em30dias.getDate() + 30);
    const contratosAVencer = contracts.contracts
      .filter((c) => c.status === 'ativo' && c.endDate)
      .filter((c) => {
        const fim = new Date(c.endDate);
        return fim >= hoje && fim <= em30dias;
      })
      .map((c) => {
        const diasRestantes = Math.floor((new Date(c.endDate) - hoje) / (1000 * 60 * 60 * 24));
        return { ...c, diasRestantes };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    // Histórico de saldo de caixa: adapts to selected period
    const historicoCaixa = [];
    // Pre-sort ascending uma vez; running sum evita O(n×d) re-scan por ponto
    const entriesOrdenadas = [...caixa.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (periodoInicio && periodoFim) {
      if (modoAno) {
        // Month-by-month — running sum O(n + 12)
        let rsSum = 0,
          rsIdx = 0;
        for (let m = 0; m < 12; m++) {
          const fimMes = new Date(filtroAno, m + 1, 0, 23, 59, 59, 999);
          while (
            rsIdx < entriesOrdenadas.length &&
            new Date(entriesOrdenadas[rsIdx].date) <= fimMes
          ) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(m + 1).padStart(2, '0')}-01`,
            saldo: rsSum,
            label: [
              'Jan',
              'Fev',
              'Mar',
              'Abr',
              'Mai',
              'Jun',
              'Jul',
              'Ago',
              'Set',
              'Out',
              'Nov',
              'Dez',
            ][m],
          });
        }
      } else {
        // Day-by-day — running sum O(n + dias)
        const diasNoMes = new Date(filtroAno, filtroMes, 0).getDate();
        let rsSum = 0,
          rsIdx = 0;
        for (let d = 1; d <= diasNoMes; d++) {
          const diaEnd = new Date(filtroAno, filtroMes - 1, d, 23, 59, 59, 999);
          while (
            rsIdx < entriesOrdenadas.length &&
            new Date(entriesOrdenadas[rsIdx].date) <= diaEnd
          ) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(filtroMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            saldo: rsSum,
          });
        }
      }
    } else {
      // Default: últimos N dias (N = projDays). Amostra a cada `histStep` dias
      const histStep = projDays <= 30 ? 1 : projDays <= 60 ? 2 : 3;
      let rsSum = 0,
        rsIdx = 0;
      for (let i = projDays - 1; i >= 0; i -= histStep) {
        const dia = new Date();
        dia.setDate(dia.getDate() - i);
        dia.setHours(23, 59, 59, 999);
        while (rsIdx < entriesOrdenadas.length && new Date(entriesOrdenadas[rsIdx].date) <= dia) {
          const e = entriesOrdenadas[rsIdx++];
          rsSum += e.type === 'entrada' ? e.value : -e.value;
        }
        historicoCaixa.push({
          data: dia.toISOString().split('T')[0],
          saldo: rsSum,
        });
      }
      // Garante que o último ponto seja exatamente HOJE (caso o passo pule)
      if (
        historicoCaixa.length === 0 ||
        historicoCaixa[historicoCaixa.length - 1].data !== new Date().toISOString().split('T')[0]
      ) {
        const hojeFim = new Date();
        hojeFim.setHours(23, 59, 59, 999);
        while (
          rsIdx < entriesOrdenadas.length &&
          new Date(entriesOrdenadas[rsIdx].date) <= hojeFim
        ) {
          const e = entriesOrdenadas[rsIdx++];
          rsSum += e.type === 'entrada' ? e.value : -e.value;
        }
        historicoCaixa.push({ data: new Date().toISOString().split('T')[0], saldo: rsSum });
      }
    }

    // NFs por status (ignora NFs já emitidas)
    const nfsStatus = { vencidas: 0, proximasVencer: 0, noPrazo: 0, emitidas: 0 };
    const hojeStr = new Date().toISOString().split('T')[0];
    const em7Dias = new Date();
    em7Dias.setDate(em7Dias.getDate() + 7);
    const em7DiasStr = em7Dias.toISOString().split('T')[0];
    notasFiscais.notas_fiscais.forEach((nf) => {
      if (nf.emitida) {
        nfsStatus.emitidas++;
        return;
      }
      if (nf.dataLimite < hojeStr) nfsStatus.vencidas++;
      else if (nf.dataLimite <= em7DiasStr) nfsStatus.proximasVencer++;
      else nfsStatus.noPrazo++;
    });

    // Projeção de fluxo de caixa futuro (próximos 90 dias)
    // Pré-computa datas de recebimento uma vez — O(n) — em vez de O(90×2n)
    const _nfsProjMap = new Map();
    for (const nf of notasFiscais.notas_fiscais) {
      if (nf.emitida || !(nf.valor > 0) || !nf.dataLimite) continue;
      const prazo = Number.isFinite(parseInt(nf.prazoRecebimento))
        ? parseInt(nf.prazoRecebimento)
        : 30;
      const dtRec = new Date(nf.dataLimite + 'T12:00:00');
      dtRec.setDate(dtRec.getDate() + prazo);
      const diaStr = dtRec.toISOString().split('T')[0];
      if (!_nfsProjMap.has(diaStr)) _nfsProjMap.set(diaStr, []);
      _nfsProjMap.get(diaStr).push({
        nfId: nf.id,
        numero: nf.numero,
        contractId: nf.contractId,
        valor: nf.valor,
        dataEmissao: nf.dataLimite,
        prazoRecebimento: prazo,
      });
    }

    const projecaoFutura = [];
    for (let i = 1; i <= 90; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasEsperadas = _nfsProjMap.get(diaStr) || [];
      if (entradasEsperadas.length > 0) {
        projecaoFutura.push({
          data: diaStr,
          entradas: entradasEsperadas,
          totalEntradas: entradasEsperadas.reduce((s, e) => s + e.valor, 0),
        });
      }
    }

    // Contas a pagar status
    const contasPagar = { contas: await repos.contasPagar.findAll() };
    const hojeStrCP = new Date().toISOString().split('T')[0];
    const em7DiasStrCP = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    })();
    const contasPagarStatus = { vencidas: 0, proximasVencer: 0, pendentes: 0, totalPendente: 0 };
    contasPagar.contas
      .filter((c) => c.status === 'pendente')
      .forEach((c) => {
        contasPagarStatus.pendentes++;
        contasPagarStatus.totalPendente += parseFloat(c.valor) || 0;
        if (c.dataVencimento && c.dataVencimento < hojeStrCP) contasPagarStatus.vencidas++;
        else if (c.dataVencimento && c.dataVencimento <= em7DiasStrCP)
          contasPagarStatus.proximasVencer++;
      });

    const contasVencidasTotal = contasPagar.contas
      .filter((c) => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStrCP)
      .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldoProjetado = [];
    // Recorrências virtuais (BASE items com metadata.recurrence) — ainda não materializadas
    // Idempotência: descarta ocorrências cujo (base_item_id, data) já existe no caixa
    const baseItemsRecorrentes = base.items.filter((b) => b.metadata?.recurrence?.active);
    const caixaPorBaseDate = new Set(
      caixa.entries.filter((e) => e.baseItemId).map((e) => `${e.baseItemId}|${e.date}`)
    );
    const ocorrenciasVirtuais = []; // { data, valor, baseItemId, descricao }
    const addUnits = (d, n, freq) => {
      const x = new Date(d);
      if (freq === 'weekly') x.setDate(x.getDate() + 7 * n);
      else if (freq === 'quarterly') x.setMonth(x.getMonth() + 3 * n);
      else if (freq === 'yearly') x.setFullYear(x.getFullYear() + n);
      else x.setMonth(x.getMonth() + n);
      return x;
    };
    const hojeDt = new Date();
    hojeDt.setHours(0, 0, 0, 0);
    baseItemsRecorrentes.forEach((item) => {
      const rec = item.metadata.recurrence;
      const startD = new Date(rec.startDate + 'T12:00:00');
      const endD = rec.endDate ? new Date(rec.endDate + 'T12:00:00') : null;
      for (let i = 0; i < 1000; i++) {
        const d = addUnits(startD, i, rec.frequency || 'monthly');
        if (endD && d > endD) break;
        if (d > new Date(hojeDt.getTime() + projDays * 86400000)) break;
        if (d < hojeDt) continue;
        const ds = d.toISOString().split('T')[0];
        if (caixaPorBaseDate.has(`${item.id}|${ds}`)) continue; // já materializado
        ocorrenciasVirtuais.push({
          data: ds,
          valor: money.parse(item.value),
          baseItemId: item.id,
          descricao: item.description || '',
        });
      }
    });

    let saldoAcumulado = caixaBalance - contasVencidasTotal;
    // Granularidade da projeção: pontos a cada 3 dias para janelas curtas
    // (≤30d), a cada 7 dias para janelas maiores.
    const step = projDays <= 30 ? 3 : 7;
    for (let i = 1; i <= projDays; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasDia = projecaoFutura.find((p) => p.data === diaStr);
      if (entradasDia) saldoAcumulado += entradasDia.totalEntradas;
      const saidasCP = contasPagar.contas
        .filter((c) => c.status === 'pendente' && c.dataVencimento === diaStr)
        .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
      if (saidasCP > 0) saldoAcumulado -= saidasCP;
      // Saídas virtuais de recorrências BASE
      const saidasVirt = ocorrenciasVirtuais
        .filter((o) => o.data === diaStr)
        .reduce((s, o) => s + o.valor, 0);
      if (saidasVirt > 0) saldoAcumulado -= saidasVirt;
      if (i === 1 || i % step === 0 || i === projDays) {
        saldoProjetado.push({ data: diaStr, saldo: saldoAcumulado });
      }
    }

    const dashboard = {
      activeContracts,
      totalContractValue,
      totalSaidas,
      totalBaseUnallocated,
      caixaBalance,
      recentCaixaEntries,
      contractsWithMargin,
      contratosAVencer,
      historicoCaixa,
      nfsStatus,
      projecaoFutura,
      saldoProjetado,
      projDays,
      contasPagarStatus,
      ocorrenciasVirtuais,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard));
  } catch (e) {
    // FIX A-01: nao expor e.message (mensagens internas do Postgres) ao cliente.
    sendError(res, 500, e.message);
  }
}

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

// ============ Users CRUD (admin) ============
function sanitizeUser(u) {
  // Nunca devolver password_hash pro frontend.
  // Defensivo contra ambas as formas (camelCase pós-rowToCamel e snake_case bruto)
  // pra evitar vazamento se algum row escapar do conversor.
  if (!u) return null;
  const { passwordHash, password_hash, ...rest } = u;
  return rest;
}

async function handleGetUsers(req, res) {
  if (!(await perms.can(req.user, 'users', 'view'))) {
    return sendError(res, 403, 'Sem permissão para listar usuários');
  }
  try {
    const rows = await repos.users.findAll();
    sendJson(res, { users: rows.map(sanitizeUser) });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostUser(req, body, res) {
  if (!(await perms.can(req.user, 'users', 'create'))) {
    return sendError(res, 403, 'Sem permissão para criar usuários');
  }
  if (!perms.canAssignNivel(req.user, body.nivelAcessoId)) {
    return sendError(res, 403, 'Você não pode criar usuários com esse nível de acesso');
  }
  try {
    const email = (body.email || '').trim();
    const password = body.password || '';
    if (!email || !password) return sendError(res, 400, 'Email e senha são obrigatórios');
    if (password.length < 8) return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');

    const exists = await auth.findUserByEmail(email);
    if (exists) return sendError(res, 400, 'Já existe um usuário com este email');

    const id = await auth.createUser({
      email,
      password,
      name: body.name || null,
      nivelAcessoId: body.nivelAcessoId || null,
      socioId: body.socioId || null,
    });
    const created = await repos.users.findById(id);
    sendJson(res, {
      users: (await repos.users.findAll()).map(sanitizeUser),
      user: sanitizeUser(created),
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutUser(req, id, body, res) {
  if (!(await perms.can(req.user, 'users', 'update'))) {
    return sendError(res, 403, 'Sem permissão para editar usuários');
  }
  try {
    // Anti-escalada: não-super-admin não modifica usuário privilegiado (admin / super admin)
    const target = await repos.users.findById(id);
    if (!target) return sendError(res, 404, 'Usuário não encontrado');
    const targetNivel = target.nivelAcessoId ?? null;
    const targetIsPrivileged = targetNivel === null || targetNivel === 'admin';
    if (targetIsPrivileged && !perms.isSuperAdmin(req.user)) {
      return sendError(res, 403, 'Você não pode editar um usuário administrador');
    }
    if (body.nivelAcessoId !== undefined && !perms.canAssignNivel(req.user, body.nivelAcessoId)) {
      return sendError(res, 403, 'Você não pode atribuir esse nível de acesso');
    }

    const allowed = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.email !== undefined) allowed.email = String(body.email).trim().toLowerCase();
    if (body.nivelAcessoId !== undefined) allowed.nivelAcessoId = body.nivelAcessoId || null;
    if (body.socioId !== undefined) allowed.socioId = body.socioId || null;
    if (body.isActive !== undefined) allowed.isActive = !!body.isActive;
    if (body.password) {
      if (String(body.password).length < 8)
        return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');
      allowed.passwordHash = await auth.hash(body.password);
    }
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.users.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Usuário não encontrado');
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser) });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteUser(id, req, res) {
  if (!(await perms.can(req.user, 'users', 'delete'))) {
    return sendError(res, 403, 'Sem permissão para remover usuários');
  }
  try {
    if (req.user && req.user.id === id) {
      return sendError(res, 400, 'Você não pode deletar seu próprio usuário');
    }
    const target = await repos.users.findById(id);
    if (!target) return sendError(res, 404, 'Usuário não encontrado');

    const targetNivel = target.nivelAcessoId ?? null;
    const targetIsPrivileged = targetNivel === null || targetNivel === 'admin';
    if (targetIsPrivileged && !perms.isSuperAdmin(req.user)) {
      return sendError(res, 403, 'Você não pode remover um usuário administrador');
    }

    if (targetNivel === null) {
      const superAdmins = await db.getOne(
        `SELECT COUNT(*)::int AS n FROM users WHERE nivel_acesso_id IS NULL AND is_active = TRUE`
      );
      if (superAdmins && superAdmins.n <= 1) {
        return sendError(res, 400, 'Não é possível remover o último super admin');
      }
    }
    await repos.users.removeById(id);
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser) });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

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
async function handleGetPropostas(res) {
  try {
    sendJson(res, await repos.propostas.getEnvelope());
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleGetProposta(id, res) {
  try {
    const proposta = await repos.propostas.findByIdWithChildren(id);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostProposta(body, res) {
  try {
    if (!body.titulo || !String(body.titulo).trim()) {
      return sendError(res, 400, 'Título é obrigatório');
    }
    if (!body.clienteId && !body.clienteNome && !body.clienteEmpresa) {
      return sendError(res, 400, 'Cliente é obrigatório');
    }
    // Se vier cliente_id, faz snapshot dos campos do cliente atual
    if (body.clienteId) {
      const cli = await repos.clientes.findById(body.clienteId);
      if (cli) {
        body.clienteNome = body.clienteNome || cli.nome || null;
        body.clienteEmpresa = body.clienteEmpresa || cli.empresa || cli.nome || null;
        body.clienteContato = body.clienteContato || cli.nome || null;
        body.clienteCargo = body.clienteCargo || cli.cargo || null;
        body.clienteEmail = body.clienteEmail || cli.email || null;
        body.clienteTelefone = body.clienteTelefone || cli.telefone || null;
        body.clienteEndereco = body.clienteEndereco || cli.endereco || null;
      }
    }
    const { proposta, contract } = await repos.propostas.createWithContract(body);
    sendJson(res, { proposta, contract, propostasEnvelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    console.error('[propostas] erro POST:', e);
    sendError(res, 400, e.message);
  }
}

async function handlePutProposta(id, body, res) {
  try {
    const allowed = {};
    const camelFields = [
      'tipo',
      'clienteId',
      'clienteNome',
      'clienteEmpresa',
      'clienteContato',
      'clienteCargo',
      'clienteEmail',
      'clienteTelefone',
      'clienteDocumento',
      'clienteEndereco',
      'referencia',
      'titulo',
      'objetivo',
      'saudacao',
      'condicoesPagamento',
      'prazoExecucao',
      'observacoes',
      'signatario',
      'signatarioCargo',
      'status',
    ];
    for (const f of camelFields) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    // Campos numéricos
    if (body.valorTotal !== undefined) allowed.valorTotal = money.parse(body.valorTotal);
    if (body.validadeDias !== undefined)
      allowed.validadeDias = parseInt(body.validadeDias, 10) || 15;
    if (body.garantiaMeses !== undefined) {
      allowed.garantiaMeses =
        body.garantiaMeses === null || body.garantiaMeses === ''
          ? null
          : parseInt(body.garantiaMeses, 10);
    }
    // JSONB
    for (const f of [
      'escopo',
      'obrigacoesContratada',
      'obrigacoesContratante',
      'cronograma',
      'investimentoHh',
      'investimentoMat',
      'metadata',
    ]) {
      if (body[f] !== undefined) allowed[f] = JSON.stringify(body[f]);
    }
    if (body.dataEmissao !== undefined) allowed.dataEmissao = body.dataEmissao || null;
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.propostas.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');

    // Se valorTotal mudou e há contrato vinculado, sincroniza o value do contrato
    if (body.valorTotal !== undefined && result.contratoId) {
      try {
        await repos.contracts.updateById(result.contratoId, { value: allowed.valorTotal });
      } catch (syncErr) {
        console.error('[propostas] falha ao sincronizar value do contrato:', syncErr.message);
      }
    }
    const proposta = await repos.propostas.findByIdWithChildren(id);
    sendJson(res, { proposta });
  } catch (e) {
    console.error('[propostas] erro PUT:', e);
    sendError(res, 400, e.message);
  }
}

async function handleDeleteProposta(id, res) {
  try {
    const proposta = await repos.propostas.findById(id);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    // Desvincula contrato (mantém em prospecção; usuário decide se apaga depois)
    if (proposta.contratoId) {
      try {
        await db.query(
          `UPDATE contracts
              SET metadata = metadata - 'propostaId' - 'propostaNumero' - 'propostaAno' - 'propostaRevisao' - 'origem'
            WHERE id = $1`,
          [proposta.contratoId]
        );
      } catch (e) {
        console.error('[propostas] falha ao desvincular contrato:', e.message);
      }
    }
    await repos.propostas.removeById(id);
    sendJson(res, await repos.propostas.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleEnviarProposta(id, res) {
  try {
    const result = await repos.propostas.enviar(id);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta: result, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAceitarProposta(id, res) {
  try {
    const { proposta, contract } = await repos.propostas.aceitar(id);
    sendJson(res, {
      proposta,
      contract,
      envelope: await repos.propostas.getEnvelope(),
      contractsEnvelope: await repos.contracts.getEnvelope({ lite: true }),
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleRejeitarProposta(id, body, res) {
  try {
    const result = await repos.propostas.rejeitar(id, body.motivo);
    if (!result) return sendError(res, 404, 'Proposta não encontrada');
    sendJson(res, { proposta: result, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDuplicarProposta(id, res) {
  try {
    const nova = await repos.propostas.duplicarNovaRevisao(id);
    sendJson(res, { proposta: nova, envelope: await repos.propostas.getEnvelope() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Custos internos ──
async function handlePostPropostaCusto(propostaId, body, res) {
  try {
    const custo = {
      id: generateId('cst'),
      propostaId,
      categoria: body.categoria || 'outros',
      descricao: body.descricao || '',
      valor: money.parse(body.valor),
      percentual: body.percentual != null ? parseFloat(body.percentual) : null,
      ordem: parseInt(body.ordem, 10) || 0,
    };
    await repos.propostaCustos.create(custo);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutPropostaCusto(propostaId, custoId, body, res) {
  try {
    const allowed = {};
    if (body.categoria !== undefined) allowed.categoria = body.categoria;
    if (body.descricao !== undefined) allowed.descricao = body.descricao;
    if (body.valor !== undefined) allowed.valor = money.parse(body.valor);
    if (body.percentual !== undefined)
      allowed.percentual =
        body.percentual === null || body.percentual === '' ? null : parseFloat(body.percentual);
    if (body.ordem !== undefined) allowed.ordem = parseInt(body.ordem, 10) || 0;
    const result = await repos.propostaCustos.updateById(custoId, allowed);
    if (!result) return sendError(res, 404, 'Custo não encontrado');
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeletePropostaCusto(propostaId, custoId, res) {
  try {
    await repos.propostaCustos.removeById(custoId);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Anexos de proposta extraídos → handlers/proposta-anexos.js

// ============ Geração de DOCX/PDF/Preview de proposta ============
async function _loadPropostaComAnexosBinarios(propostaId) {
  const proposta = await repos.propostas.findByIdWithChildren(propostaId);
  if (!proposta) return null;
  // Carrega `data` BYTEA de TODOS os anexos: imagens (embed inline) e PDFs
  // (concatenação na sequência via pdf-lib). Sem isso, o concatenador filtra
  // por `a.data` e pula os PDFs anexos.
  const anexosMeta = proposta.anexos || [];
  const anexosComData = await Promise.all(
    anexosMeta.map(async (a) => {
      const full = await repos.propostaAnexos.findByIdWithData(a.id);
      return full || a;
    })
  );
  // Apresentação global + logos de cases (centralizado, não duplicado por proposta)
  let apresentacao = {};
  let caseLogos = [];
  try {
    apresentacao = (await repos.appSettings.get('proposta_apresentacao')) || {};
    const logosMeta = await repos.caseLogos.listMetadata({ ativo: true });
    // Carrega binário de cada logo para embed em PDF/DOCX
    caseLogos = await Promise.all(
      logosMeta.map(async (lg) => {
        const full = await repos.caseLogos.findByIdWithData(lg.id);
        return full || lg;
      })
    );
  } catch (e) {
    console.warn('[propostas] não pude carregar apresentação global:', e.message);
  }
  return { ...proposta, anexos: anexosComData, _apresentacao: apresentacao, _caseLogos: caseLogos };
}

// FIX A-05: limita geração SIMULTÂNEA de documentos. PDF (Puppeteer) e DOCX
// são caros em CPU/memória — sem cap, várias gerações em paralelo derrubam o
// servidor. O rate limit global (1000/min) não protege contra isso.
let _heavyGenInFlight = 0;
const _HEAVY_GEN_MAX = 3;

async function handleGetPropostaDocx(propostaId, res) {
  if (_heavyGenInFlight >= _HEAVY_GEN_MAX) {
    return sendError(res, 429, 'Servidor ocupado gerando documentos. Aguarde alguns segundos.');
  }
  _heavyGenInFlight++;
  try {
    const { gerarDocx, isDocxAvailable } = require('./lib/proposta-docx');
    if (!isDocxAvailable()) {
      return sendError(res, 500, 'Lib `docx` não instalada. Rode `npm install` no servidor.');
    }
    const proposta = await _loadPropostaComAnexosBinarios(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    // NOTA: tentativa de injetar conteudo no Template.dotx (v1.1.2) gerou
    // DOCX corrompido por causa de rIds conflitantes entre meu document.xml
    // e os _rels do template. Revertido para gerador programatico que ja
    // usa logo, cores e fontes do template via lib `docx`.
    const buf = await gerarDocx(proposta);
    const cfg = require('./lib/proposta-template-config');
    const numeroLimpo = cfg.formatNumeroCompleto(proposta).replace(/[^A-Za-z0-9_-]+/g, '_');
    const fname = `Proposta_${numeroLimpo}.docx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': buf.length,
      'Content-Disposition': `attachment; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[propostas/docx] erro:', e);
    sendError(res, 500, e.message);
  } finally {
    _heavyGenInFlight--;
  }
}

async function handleGetPropostaPdf(propostaId, res) {
  if (_heavyGenInFlight >= _HEAVY_GEN_MAX) {
    return sendError(res, 429, 'Servidor ocupado gerando documentos. Aguarde alguns segundos.');
  }
  _heavyGenInFlight++;
  try {
    const { gerarPdf, isPdfAvailable } = require('./lib/proposta-pdf');
    if (!isPdfAvailable()) {
      return sendError(
        res,
        500,
        'Lib `puppeteer` não instalada. Rode `npm install puppeteer` no servidor.'
      );
    }
    const proposta = await _loadPropostaComAnexosBinarios(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    const buf = await gerarPdf(proposta);
    const cfg = require('./lib/proposta-template-config');
    const numeroLimpo = cfg.formatNumeroCompleto(proposta).replace(/[^A-Za-z0-9_-]+/g, '_');
    const fname = `Proposta_${numeroLimpo}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': `inline; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[propostas/pdf] erro:', e);
    sendError(res, 500, e.message);
  } finally {
    _heavyGenInFlight--;
  }
}

async function handleGetPropostaPreview(propostaId, res) {
  try {
    const { renderHtml } = require('./lib/proposta-html');
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    if (!proposta) return sendError(res, 404, 'Proposta não encontrada');
    const html = renderHtml(proposta);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (e) {
    console.error('[propostas/preview] erro:', e);
    sendError(res, 500, e.message);
  }
}

// ============ Portal do Cliente — Propostas ============
async function handlePortalListPropostas(req, res) {
  try {
    const clienteId = req.portalCliente.id;
    const propostas = await db.getMany(
      `SELECT id, numero, ano, revisao, titulo, referencia, tipo,
              valor_total, validade_dias, data_emissao, data_envio,
              status, created_at, updated_at
         FROM propostas
        WHERE cliente_id = $1 AND status IN ('enviada','aceita','rejeitada','expirada')
        ORDER BY data_emissao DESC, created_at DESC`,
      [clienteId]
    );
    sendJson(res, { propostas });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalPropostaPdf(req, propostaId, res) {
  try {
    const proposta = await repos.propostas.findById(propostaId);
    if (!proposta || proposta.clienteId !== req.portalCliente.id) {
      return sendError(res, 404, 'Proposta não encontrada');
    }
    if (proposta.status === 'rascunho') {
      return sendError(res, 403, 'Proposta ainda em rascunho — aguarde o envio');
    }
    return handleGetPropostaPdf(propostaId, res);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePortalPropostaDocx(req, propostaId, res) {
  try {
    const proposta = await repos.propostas.findById(propostaId);
    if (!proposta || proposta.clienteId !== req.portalCliente.id) {
      return sendError(res, 404, 'Proposta não encontrada');
    }
    if (proposta.status === 'rascunho') {
      return sendError(res, 403, 'Proposta ainda em rascunho — aguarde o envio');
    }
    return handleGetPropostaDocx(propostaId, res);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Cláusulas (biblioteca reusável) ============
async function handleGetClausulas(res, query) {
  try {
    const filtros = {
      categoria: query?.categoria || undefined,
      termo: query?.termo || undefined,
      ativa:
        query?.ativa === '0' || query?.ativa === 'false'
          ? false
          : query?.ativa === '1' || query?.ativa === 'true'
            ? true
            : undefined,
    };
    const clausulas = await repos.clausulas.buscar(filtros);
    sendJson(res, { clausulas });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostClausula(body, res) {
  try {
    if (!body.titulo || !body.texto || !body.categoria) {
      return sendError(res, 400, 'Título, texto e categoria são obrigatórios');
    }
    const clausula = {
      id: generateId('cla'),
      titulo: body.titulo,
      texto: body.texto,
      categoria: body.categoria,
      tags: Array.isArray(body.tags) ? body.tags : [],
      ativa: body.ativa !== false,
    };
    await repos.clausulas.create(clausula);
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutClausula(id, body, res) {
  try {
    const allowed = {};
    for (const f of ['titulo', 'texto', 'categoria', 'ativa']) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    if (Array.isArray(body.tags)) allowed.tags = body.tags;
    const result = await repos.clausulas.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Cláusula não encontrada');
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteClausula(id, res) {
  try {
    await repos.clausulas.removeById(id);
    sendJson(res, { clausulas: await repos.clausulas.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Apresentação Global (configuração) ============
async function handleGetApresentacao(res) {
  try {
    const value = (await repos.appSettings.get('proposta_apresentacao')) || {};
    sendJson(res, { apresentacao: value });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutApresentacao(body, res) {
  try {
    const allowed = {};
    for (const k of ['apresentacao', 'casesSucesso', 'segurancaSaude']) {
      if (body[k] !== undefined) allowed[k] = String(body[k] || '');
    }
    const novo = await repos.appSettings.patch('proposta_apresentacao', allowed);
    sendJson(res, { apresentacao: novo });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Case Logos extraídos → handlers/case-logos.js

// ============ Fornecedores ============
// Fornecedores (CRUD) extraídos → handlers/fornecedores.js

// Tipos da BASE (CRUD) extraídos → handlers/tipos-base.js

// ============ Contas a Pagar handlers ============
// Contas a Pagar (CRUD + pagar/estornar) extraídos → handlers/contas-pagar.js

// ============ Folha de Pagamento handlers ============
const VALE_PCT = 0.4; // adiantamento (vale) = 40% do salário

// Data da Páscoa (algoritmo de Computus / Gauss) — base dos feriados móveis.
function dataPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// Feriados nacionais de um ano, como Set de 'MM-DD': os 9 fixos + a
// Sexta-feira Santa (móvel). NÃO inclui pontos facultativos (Carnaval,
// Corpus Christi) nem feriados estaduais/municipais.
function feriadosNacionais(ano) {
  const set = new Set([
    '01-01',
    '04-21',
    '05-01',
    '09-07',
    '10-12',
    '11-02',
    '11-15',
    '11-20',
    '12-25',
  ]);
  const sexta = dataPascoa(ano);
  sexta.setDate(sexta.getDate() - 2); // Sexta-feira Santa = Páscoa − 2 dias
  set.add(
    String(sexta.getMonth() + 1).padStart(2, '0') + '-' + String(sexta.getDate()).padStart(2, '0')
  );
  return set;
}

// 5º dia útil do mês seguinte à competência 'YYYY-MM' — data de vencimento do
// saldo do salário. Nesta contagem o SÁBADO conta como dia útil; não contam
// domingos nem feriados nacionais.
function quintoDiaUtil(competencia) {
  const [ano, mes] = competencia.split('-').map(Number);
  const d = new Date(ano, mes, 1); // dia 1 do mês seguinte (mes 1-12 → índice do próximo)
  const feriados = feriadosNacionais(d.getFullYear());
  let uteis = 0;
  while (true) {
    const mmdd =
      String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (d.getDay() !== 0 && !feriados.has(mmdd)) {
      // domingo (0) e feriados não contam
      uteis++;
      if (uteis === 5) break;
    }
    d.setDate(d.getDate() + 1);
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// INSS progressivo do segurado empregado — tabela 2026 (Portaria
// Interministerial MPS/MF nº 13). Mantém os mesmos valores de
// FolhaPagamento.js (_calcInss) — atualizar os dois quando a tabela mudar.
function calcInss(salario) {
  const s = Math.min(parseFloat(salario) || 0, 8475.55); // teto INSS 2026
  if (s <= 0) return 0;
  let inss = Math.min(s, 1621.0) * 0.075;
  if (s > 1621.0) inss += (Math.min(s, 2902.84) - 1621.0) * 0.09;
  if (s > 2902.84) inss += (Math.min(s, 4354.27) - 2902.84) * 0.12;
  if (s > 4354.27) inss += (s - 4354.27) * 0.14;
  return Math.round(inss * 100) / 100;
}

// POST /api/folha-pagamento/gerar — gera as linhas de folha do mês (idempotente).
async function handleGerarFolha(body, res) {
  try {
    const competencia = (body && body.competencia) || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const [ano, mes] = competencia.split('-').map(Number);
    const ultimoDia = String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
    const dataRef = `${competencia}-${ultimoDia}`;
    const vencimentoSaldo = quintoDiaUtil(competencia); // saldo vence no 5º dia útil

    const recursos = await repos.recursos.findAll();
    const funcs = recursos.filter((r) => r.status === 'funcionario' && parseFloat(r.salario) > 0);
    const jaTem = new Set(
      (await repos.folhaPagamento.findByCompetencia(competencia)).map((f) => f.recursoId)
    );

    let criadas = 0;
    for (const r of funcs) {
      if (jaTem.has(r.id)) continue;
      const salario = parseFloat(r.salario) || 0;
      const contractId = (r.alocacaoAtual && r.alocacaoAtual.contractId) || null;
      const elegivel = !!r.elegivelVale;
      const valorVale = elegivel ? Math.round(salario * VALE_PCT * 100) / 100 : 0;
      // Descontos automáticos de todo colaborador — INSS e contribuição
      // sindical. Já entram no saldo; viram itens editáveis/removíveis.
      const inssAuto = calcInss(salario);
      const sindicalAuto = Math.round(Math.min(salario * 0.02, 70) * 100) / 100;
      const valorSaldo = Math.round((salario - valorVale - inssAuto - sindicalAuto) * 100) / 100;

      // Sede (sem contrato) → o salário vira um item BASE (rastreável, rateável).
      const baseItemId = contractId ? null : generateId('bas');

      const folhaRow = {
        id: generateId('flh'),
        recursoId: r.id,
        recursoNome: r.nome || '',
        competencia,
        salarioBase: salario,
        elegivelVale: elegivel,
        contractId,
        baseItemId,
        valorVale,
        valorSaldo,
        valePago: false,
        valeDataPagamento: null,
        valeCaixaEntryId: null,
        saldoPago: false,
        saldoDataPagamento: null,
        saldoCaixaEntryId: null,
        observacoes: contractId ? '' : 'Despesa da Sede (BASE)',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // O base_item da Sede precisa existir ANTES da linha de folha: a FK
      // folha_pagamento.base_item_id → base_items(id) exige o pai primeiro.
      if (baseItemId) {
        await repos.baseItems.create({
          id: baseItemId,
          description: `Salário ${r.nome || ''} — ${competencia}`,
          type: 'salario',
          value: salario,
          date: dataRef,
          notes: `Folha de pagamento ${competencia}`,
          metadata: JSON.stringify({ origem: 'folha', recursoId: r.id, competencia }),
        });
      }
      try {
        await repos.folhaPagamento.create(folhaRow);
      } catch (e) {
        // Folha não "pegou" — remove o base_item órfão recém-criado.
        if (baseItemId) await repos.baseItems.removeById(baseItemId).catch(() => {});
        if (e && e.code === '23505') continue; // já existe (corrida) — idempotente
        throw e;
      }

      // Contas a Pagar vinculadas — saldo vence no 5º dia útil do mês seguinte,
      // vale (se houver) no dia 20. Pagar/estornar é sincronizado (folha ↔ conta).
      const catConta = contractId ? 'mao_de_obra' : 'base';
      const contasPatch = {};
      const saldoContaId = generateId('cp');
      await repos.contasPagar.create({
        id: saldoContaId,
        descricao: `Saldo salário ${r.nome || ''} — ${competencia}`,
        valor: valorSaldo,
        dataEmissao: dataRef,
        dataVencimento: vencimentoSaldo,
        status: 'pendente',
        contractId,
        category: catConta,
        observacoes: 'Gerado pela Folha de Pagamento',
        folhaPagamentoId: folhaRow.id,
        folhaParcela: 'saldo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      contasPatch.saldoContaPagarId = saldoContaId;
      if (elegivel && valorVale > 0) {
        const valeContaId = generateId('cp');
        await repos.contasPagar.create({
          id: valeContaId,
          descricao: `Vale salário ${r.nome || ''} — ${competencia}`,
          valor: valorVale,
          dataEmissao: dataRef,
          dataVencimento: `${competencia}-20`,
          status: 'pendente',
          contractId,
          category: catConta,
          observacoes: 'Gerado pela Folha de Pagamento (vale 40%)',
          folhaPagamentoId: folhaRow.id,
          folhaParcela: 'vale',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        contasPatch.valeContaPagarId = valeContaId;
      }
      await repos.folhaPagamento.updateById(folhaRow.id, contasPatch);

      // Lançamentos de desconto automáticos (INSS e sindical) — itens normais,
      // que o usuário pode editar ou remover depois na tela de Lançamentos.
      for (const auto of [
        { descricao: 'INSS', valor: inssAuto },
        { descricao: 'Contribuição sindical', valor: sindicalAuto },
      ]) {
        if (auto.valor > 0) {
          await repos.folhaPagamentoItens.create({
            id: generateId('fli'),
            folhaPagamentoId: folhaRow.id,
            tipo: 'desconto',
            descricao: auto.descricao,
            valor: auto.valor,
            createdAt: new Date().toISOString(),
          });
        }
      }
      criadas++;
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    sendJson(res, { competencia, criadas, folha });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// GET /api/folha-pagamento?competencia=YYYY-MM
async function handleGetFolha(query, res) {
  try {
    const competencia = (query && query.competencia) || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    // Anexa os lançamentos (descontos/proventos) de cada linha, em lote (sem N+1).
    if (folha.length) {
      const itens = await repos.folhaPagamentoItens.findByFolhaIds(folha.map((f) => f.id));
      const porFolha = new Map();
      for (const it of itens) {
        if (!porFolha.has(it.folhaPagamentoId)) porFolha.set(it.folhaPagamentoId, []);
        porFolha.get(it.folhaPagamentoId).push(it);
      }
      for (const f of folha) f.itens = porFolha.get(f.id) || [];
    }
    sendJson(res, { competencia, folha });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// Recalcula o Saldo de uma linha de folha a partir dos lançamentos:
// Saldo = (salário − vale) + Σproventos − Σdescontos. Sincroniza a conta a pagar.
async function recalcularSaldoFolha(folhaId) {
  const f = await repos.folhaPagamento.findById(folhaId);
  if (!f) return null;
  const itens = await repos.folhaPagamentoItens.findByFolha(folhaId);
  let proventos = 0,
    descontos = 0;
  for (const it of itens) {
    const v = parseFloat(it.valor) || 0;
    if (it.tipo === 'provento') proventos += v;
    else if (it.tipo === 'desconto') descontos += v;
  }
  const saldoBase = (parseFloat(f.salarioBase) || 0) - (parseFloat(f.valorVale) || 0);
  // money.round2 trata casos que Math.round(*100)/100 erra (ex.: 2.005 → 2.01).
  const novoSaldo = money.round2(saldoBase + proventos - descontos);
  const atualizada = await repos.folhaPagamento.updateById(folhaId, {
    valorSaldo: novoSaldo,
    updatedAt: new Date().toISOString(),
  });
  // Mantém a conta a pagar do Saldo coerente com o novo valor.
  if (f.saldoContaPagarId) {
    await repos.contasPagar
      .updateById(f.saldoContaPagarId, {
        valor: novoSaldo,
        updatedAt: new Date().toISOString(),
      })
      .catch((e) =>
        console.error(
          '[folha] falha ao sincronizar conta do saldo',
          f.saldoContaPagarId,
          e && e.message
        )
      );
  }
  return atualizada;
}

// POST /api/folha-pagamento/:id/itens — lança um desconto ou provento.
async function handleAddFolhaItem(id, body, res) {
  try {
    const tipo = body && body.tipo;
    if (tipo !== 'desconto' && tipo !== 'provento') {
      return sendError(res, 400, "Campo 'tipo' deve ser 'desconto' ou 'provento'");
    }
    const descricao = String((body && body.descricao) || '').trim();
    if (!descricao) return sendError(res, 400, 'Informe a descrição do lançamento');
    const valor = money.parse(body && body.valor);
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');

    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de lançar descontos/proventos');
        e.statusCode = 400;
        throw e;
      }
      await repos.folhaPagamentoItens.create({
        id: generateId('fli'),
        folhaPagamentoId: id,
        tipo,
        descricao,
        valor,
        createdAt: new Date().toISOString(),
      });
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// DELETE /api/folha-pagamento/:id/itens/:itemId — remove um lançamento.
async function handleRemoveFolhaItem(id, itemId, res) {
  try {
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400;
        throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado');
        e.statusCode = 404;
        throw e;
      }
      await repos.folhaPagamentoItens.removeById(itemId);
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// PUT /api/folha-pagamento/:id/itens/:itemId — edita o valor de um lançamento.
async function handleUpdateFolhaItem(id, itemId, body, res) {
  try {
    const valor = money.parse(body && body.valor);
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400;
        throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado');
        e.statusCode = 404;
        throw e;
      }
      await repos.folhaPagamentoItens.updateById(itemId, { valor });
      return recalcularSaldoFolha(id);
    });
    folha.itens = await repos.folhaPagamentoItens.findByFolha(id);
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/:id/pagar — paga uma parcela (vale|saldo).
async function handlePagarFolhaParcela(id, body, res) {
  try {
    const parcela = body && body.parcela;
    if (parcela !== 'vale' && parcela !== 'saldo') {
      return sendError(res, 400, "Campo 'parcela' deve ser 'vale' ou 'saldo'");
    }
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      if (parcela === 'vale' && f.valePago) {
        const e = new Error('Vale já foi pago');
        e.statusCode = 400;
        throw e;
      }
      if (parcela === 'saldo' && f.saldoPago) {
        const e = new Error('Saldo já foi pago');
        e.statusCode = 400;
        throw e;
      }
      const valor = parcela === 'vale' ? parseFloat(f.valorVale) : parseFloat(f.valorSaldo);
      if (!(valor > 0)) {
        const e = new Error('Esta parcela não tem valor a pagar');
        e.statusCode = 400;
        throw e;
      }

      const dataPagamento = (body && body.dataPagamento) || new Date().toISOString().split('T')[0];
      const label = parcela === 'vale' ? 'Vale' : 'Saldo';
      const caixaEntry = {
        id: generateId('cxa'),
        type: 'saida',
        description:
          `${label} salário ${f.recursoNome} — ${f.competencia}` +
          (body && body.formaPagamento ? ` [${body.formaPagamento}]` : ''),
        value: valor,
        date: dataPagamento,
        contractId: f.contractId || null,
        baseItemId: f.baseItemId || null,
        category: f.contractId ? 'mao_de_obra' : 'base',
        notes: `Folha de pagamento ${f.competencia} — ${label}`,
        formaPagamento: (body && body.formaPagamento) || null,
        folhaPagamentoId: f.id,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      const patch =
        parcela === 'vale'
          ? {
              valePago: true,
              valeDataPagamento: dataPagamento,
              valeCaixaEntryId: caixaEntry.id,
              updatedAt: new Date().toISOString(),
            }
          : {
              saldoPago: true,
              saldoDataPagamento: dataPagamento,
              saldoCaixaEntryId: caixaEntry.id,
              updatedAt: new Date().toISOString(),
            };
      const atualizada = await repos.folhaPagamento.updateById(id, patch);
      // Sincroniza a conta a pagar vinculada — paga junto, mesmo lançamento de caixa.
      const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
      if (contaId) {
        await repos.contasPagar
          .updateById(contaId, {
            status: 'pago',
            dataPagamento,
            valorPago: valor,
            caixaEntryId: caixaEntry.id,
            formaPagamento: (body && body.formaPagamento) || null,
            updatedAt: new Date().toISOString(),
          })
          .catch(() => {});
      }
      return atualizada;
    });
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/:id/estornar — estorna uma parcela (vale|saldo).
async function handleEstornarFolhaParcela(id, body, res) {
  try {
    const parcela = body && body.parcela;
    if (parcela !== 'vale' && parcela !== 'saldo') {
      return sendError(res, 400, "Campo 'parcela' deve ser 'vale' ou 'saldo'");
    }
    // FIX: estorno agora usa transação + advisory lock (igual ao pagar) + guard "já pago"
    // — antes era sem lock/transação, permitindo estorno duplo concorrente (caixa divergia da folha).
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) {
        const e = new Error('Registro de folha não encontrado');
        e.statusCode = 404;
        throw e;
      }
      const jaPago = parcela === 'vale' ? f.valePago : f.saldoPago;
      if (!jaPago) {
        const e = new Error('Esta parcela não está paga — nada a estornar');
        e.statusCode = 400;
        throw e;
      }
      const caixaEntryId = parcela === 'vale' ? f.valeCaixaEntryId : f.saldoCaixaEntryId;
      if (caixaEntryId) await repos.caixa.removeById(caixaEntryId);
      const patch =
        parcela === 'vale'
          ? {
              valePago: false,
              valeDataPagamento: null,
              valeCaixaEntryId: null,
              updatedAt: new Date().toISOString(),
            }
          : {
              saldoPago: false,
              saldoDataPagamento: null,
              saldoCaixaEntryId: null,
              updatedAt: new Date().toISOString(),
            };
      const atualizada = await repos.folhaPagamento.updateById(id, patch);
      // Sincroniza a conta a pagar vinculada — volta a pendente.
      const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
      if (contaId) {
        await repos.contasPagar
          .updateById(contaId, {
            status: 'pendente',
            dataPagamento: null,
            valorPago: null,
            caixaEntryId: null,
            updatedAt: new Date().toISOString(),
          })
          .catch((e) =>
            console.error(
              '[folha-estorno] falha ao sincronizar conta a pagar',
              contaId,
              e && e.message
            )
          );
      }
      return atualizada;
    });
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// POST /api/folha-pagamento/limpar — remove os registros NÃO pagos da competência
// (e suas contas a pagar pendentes). Linhas com vale ou saldo já pago são mantidas.
async function handleLimparFolha(body, res) {
  try {
    const competencia = (body && body.competencia) || '';
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return sendError(res, 400, 'Competência inválida (use YYYY-MM)');
    }
    const folha = await repos.folhaPagamento.findByCompetencia(competencia);
    let removidas = 0,
      mantidas = 0;
    for (const f of folha) {
      if (f.valePago || f.saldoPago) {
        mantidas++;
        continue;
      } // tem pagamento — preserva
      // Contas a pagar vinculadas (ainda pendentes) — removidas junto.
      for (const cpId of [f.valeContaPagarId, f.saldoContaPagarId]) {
        if (cpId)
          await repos.contasPagar
            .removeById(cpId)
            .catch((e) =>
              console.error('[limpar-folha] falha ao remover conta', cpId, e && e.message)
            );
      }
      // Ordem: folha_pagamento antes do base_item (FK base_item_id).
      await repos.folhaPagamento.removeById(f.id);
      if (f.baseItemId)
        await repos.baseItems
          .removeById(f.baseItemId)
          .catch((e) =>
            console.error('[limpar-folha] falha ao remover base item', f.baseItemId, e && e.message)
          );
      removidas++;
    }
    const restante = await repos.folhaPagamento.findByCompetencia(competencia);
    sendJson(res, { competencia, removidas, mantidas, folha: restante });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

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
      handleImportarOfx(req, res);
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
  handlePortalLogin,
  applyPortalAuth,
  handlePortalLogout,
  handlePortalDashboard,
  handlePortalListPropostas,
  handlePortalPropostaPdf,
  handlePortalPropostaDocx,
  handlePortalRdoPdf, // "ter acesso aos RDO da obra" — PDF oficial no portal
});
registerPlatform(apiRouter, {
  bus,
  sendJson,
  handleGetAudit,
  handleGetUsers,
  handlePostUser,
  handlePutUser,
  handleDeleteUser,
  handleAiUsageStats,
  handleHealth,
  handleChangelog,
  handleMetrics,
  handleGetAdminArquivos,
  handleAiChat,
  handleAiClassify,
  handleGetFeatureFlags,
  handlePutFeatureFlag,
  handleGlobalSearch,
  handleGetNiveisAcesso,
  handlePutNivelAcesso,
  handlePushSubscribe,
  handlePushUnsubscribe,
  handleDashboard,
  handleDashboardOperacional,
  handleBackup,
  handleBackupDownload,
  _runEmailBackup,
  handleGetAnomalias,
  handleLgpdExport,
  handleLgpdDelete,
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
  handleGetFolha,
  handleGerarFolha,
  handleLimparFolha,
  handlePagarFolhaParcela,
  handleEstornarFolhaParcela,
  handleAddFolhaItem,
  handleRemoveFolhaItem,
  handleUpdateFolhaItem,
  ...notasFiscaisHandlers, // CRUD + emitir/cancelar-emissão (handlers/notas-fiscais.js)
  handleCobrancaHistorico,
  handleCobrancaProjecaoAtual,
  handleCobrancaMensal,
  handleImportarOfx,
});
registerComercial(apiRouter, {
  ...clientesHandlers, // handlers/clientes.js
  handlePortalImpersonate, // "Ver portal como cliente" (super admin) — server.js seção Portal
  ...fornecedoresHandlers, // handlers/fornecedores.js
  handleGetClausulas,
  handlePostClausula,
  handlePutClausula,
  handleDeleteClausula,
  handleGetPropostas,
  handlePostProposta,
  handleGetProposta,
  handlePutProposta,
  handleDeleteProposta,
  handleEnviarProposta,
  handleAceitarProposta,
  handleRejeitarProposta,
  handleDuplicarProposta,
  handlePostPropostaCusto,
  handlePutPropostaCusto,
  handleDeletePropostaCusto,
  ...propostaAnexosHandlers, // anexos PDF/imagem: upload + get/put/delete (handlers/proposta-anexos.js)
  handleGetPropostaDocx,
  handleGetPropostaPdf,
  handleGetPropostaPreview,
  handleGetApresentacao,
  handlePutApresentacao,
  ...caseLogosHandlers, // case logos: list/get-image + upload + put/delete (handlers/case-logos.js)
});
registerOperacao(apiRouter, {
  ...recursosHandlers, // CRUD principal (handlers/recursos.js)
  ...recursoFolgasHandlers, // folgas + passagens (handlers/recurso-folgas.js)
  handleGetDocumentosStatus,
  handleAddDocumento,
  handlePutDocumento,
  handleDeleteDocumento,
  ...recursoDocsHandlers, // arquivo (BYTEA) + validação IA (handlers/recurso-documentos.js)
  handleListItensEstoque,
  handlePostItemEstoque,
  handlePutItemEstoque,
  handleDeleteItemEstoque,
  handleListAlmoxarifados,
  handlePostAlmoxarifado,
  handlePutAlmoxarifado,
  handleDeleteAlmoxarifado,
  handleListMovimentacoes,
  handlePostMovimentacao,
  handleDeleteMovimentacao,
  handleGetSaldoEstoque,
  handleGetVisaoGeral,
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

  handleListVeiculos,
  handlePostVeiculo,
  handlePutVeiculo,
  handleDeleteVeiculo,
  handlePutVeiculoKm,
  handlePutVeiculoLocalizacao,
  handlePostVeiculoPlano,
  handlePutVeiculoPlano,
  handleDeleteVeiculoPlano,
  handlePostVeiculoManutencao,
  handlePutVeiculoManutencao,
  handleDeleteVeiculoManutencao,
  handleListVeiculoAbastecimentos,
  handlePostVeiculoAbastecimento,
  handlePutVeiculoAbastecimento,
  handleDeleteVeiculoAbastecimento,
  ...dashboardCobrancaHandlers, // handleDashboardCobranca (handlers/dashboard-cobranca.js)
  handleDashboardOperacional,
  handleListDashLayouts,
  handlePostDashLayout,
  handlePutDashLayout,
  handleDeleteDashLayout,
  ...docTemplatesHandlers, // handlers/doc-templates.js
});
registerContracts(apiRouter, {
  ...contractRdosHandlers,
  ...contractsHandlers, // RDO global+CRUD (handlers/contract-rdos.js) + CRUD do contrato (handlers/contracts.js)
  ...contractSaidasHandlers,
  ...contractServicosHandlers, // BM estruturado: planilha de serviços (handlers/contract-servicos.js)
  ...contractMedicoesHandlers, // BM estruturado: medições por itens + aprovação (handlers/contract-medicoes.js)
  ...contractExtrasHandlers, // saídas/BM + budget/aditivos/marcos/ocorrências
  handleListAtividades,
  handlePostAtividade,
  handlePutAtividade,
  handleDeleteAtividade,
  handleGetCurvaS,
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
      if (await applyPortalAuth(req, res)) return;
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

async function handleGetNiveisAcesso(res) {
  try {
    const data = await readCollection('niveis_acesso.json', 'niveisAcesso', 'niveis');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    console.error('[niveis-acesso] erro ao carregar:', e && e.message);
    sendError(res, 500, 'Erro ao carregar níveis de acesso');
  }
}

async function handlePutNivelAcesso(id, body, res) {
  try {
    const abas = JSON.stringify(body.abas || []);
    const { envelope, result } = await writeCollection('niveisAcesso', 'niveis', (repo) =>
      repo.updateById(id, { abas })
    );
    if (!result) return sendError(res, 404, 'Nível não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 500, e.message);
  }
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
const COBRANCA_TAXA_FIXA = 500;
function _cobrancaPorContrato(n) {
  if (n <= 10) return 100;
  if (n <= 15) return 80;
  return 60;
}
function _cobrancaFaixaLabel(n) {
  if (n <= 10) return '1-10 contratos';
  if (n <= 15) return '11-15 contratos';
  return '16+ contratos';
}

// Pode acessar a tela de cobrança? Verifica a permissão '#/cobranca' nas abas do perfil.
// Sem perfil ativo = libera (admin de fato sem nível atribuído).
async function _eAdmin(req) {
  return await _temPermissao(req, '#/cobranca');
}

// Calcula dias com status='ativo' que se sobrepõem ao mês [ano, mes].
// Retorna inteiro de dias ativos.
async function _calcularDiasAtivos(contractId, ano, mes) {
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1));
  const fimMes = new Date(Date.UTC(ano, mes, 1)); // primeiro dia do mês seguinte
  const rows = await db.getMany(
    `SELECT status, valid_from FROM contract_status_history
     WHERE contract_id = $1 AND valid_from < $2 ORDER BY valid_from ASC`,
    [contractId, fimMes.toISOString()]
  );
  if (!rows.length) return 0;
  let dias = 0;
  for (let i = 0; i < rows.length; i++) {
    const ini = new Date(rows[i].validFrom);
    const fim = i + 1 < rows.length ? new Date(rows[i + 1].validFrom) : fimMes;
    if (rows[i].status !== 'ativo') continue;
    // Interseção [ini, fim) ∩ [inicioMes, fimMes)
    const a = ini > inicioMes ? ini : inicioMes;
    const b = fim < fimMes ? fim : fimMes;
    if (b > a) dias += Math.ceil((b - a) / 86400000);
  }
  return dias;
}

async function _calcularCobrancaMensal(ano, mes) {
  const contracts = await repos.contracts.findAll();
  // Calcula os dias-ativos de cada contrato em paralelo. Antes era um loop
  // sequencial (1 query por contrato = N+1); aqui as N queries disparam juntas
  // e o pool do pg serializa pela capacidade (PG_POOL_MAX). Resultado idêntico:
  // mesmo filtro (>= 2 dias) e mesma ordenação por diasAtivos desc.
  const comDias = await Promise.all(
    contracts.map(async (c) => ({ c, dias: await _calcularDiasAtivos(c.id, ano, mes) }))
  );
  const detalhes = comDias
    .filter(({ dias }) => dias >= 2)
    .map(({ c, dias }) => ({
      contractId: c.id,
      name: c.name,
      statusAtual: c.status,
      diasAtivos: dias,
    }));
  detalhes.sort((a, b) => b.diasAtivos - a.diasAtivos);
  const n = detalhes.length;
  const valorPorContrato = _cobrancaPorContrato(n);
  const valorContratos = n * valorPorContrato;
  const total = COBRANCA_TAXA_FIXA + valorContratos;
  return {
    ano,
    mes,
    contratosAtivos: n,
    faixa: _cobrancaFaixaLabel(n),
    valorPorContrato,
    taxaFixa: COBRANCA_TAXA_FIXA,
    valorContratos,
    total,
    detalhes,
  };
}

async function handleCobrancaMensal(req, ano, mes, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    if (!(ano >= 2020 && ano <= 2100) || !(mes >= 1 && mes <= 12)) {
      return sendError(res, 400, 'Ano/mês inválidos');
    }
    sendJson(res, await _calcularCobrancaMensal(ano, mes));
  } catch (e) {
    console.error('[cobranca-mensal]', e);
    sendError(res, 500, e.message);
  }
}

async function handleCobrancaHistorico(req, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    const hoje = new Date();
    const meses = [];
    // 12 meses anteriores ao corrente (não inclui o atual)
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(await _calcularCobrancaMensal(d.getFullYear(), d.getMonth() + 1));
    }
    sendJson(res, { meses });
  } catch (e) {
    console.error('[cobranca-historico]', e);
    sendError(res, 500, e.message);
  }
}

async function handleCobrancaProjecaoAtual(req, res) {
  try {
    if (!(await _eAdmin(req))) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
    const hoje = new Date();
    const r = await _calcularCobrancaMensal(hoje.getFullYear(), hoje.getMonth() + 1);
    sendJson(res, { ...r, parcial: true, geradoEm: new Date().toISOString() });
  } catch (e) {
    console.error('[cobranca-projecao]', e);
    sendError(res, 500, e.message);
  }
}

// ============ Documentos de colaboradores handlers ============
async function handleAddDocumento(recursoId, body, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const doc = {
      id: generateId('doc'),
      tipo: body.tipo || '',
      tipoLabel: body.tipoLabel || body.tipo || '',
      templateId: body.templateId || null,
      dataEmissao: body.dataEmissao || '',
      dataVencimento: body.dataVencimento || '',
      responsavel: body.responsavel || '',
      resultado: body.resultado || '',
      observacoes: body.observacoes || '',
      nomeArquivo: body.nomeArquivo || null,
      validacao: null, // preenchido após validação por IA quando há arquivo + template
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const documentos = (rec.documentos || []).concat(doc);
    const { envelope } = await writeCollection('recursos', 'recursos', (repo) =>
      repo.updateById(recursoId, {
        documentos: JSON.stringify(documentos),
        updatedAt: new Date().toISOString(),
      })
    );
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutDocumento(recursoId, docId, body, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = rec.documentos || [];
    const dIdx = docs.findIndex((d) => d.id === docId);
    if (dIdx === -1) return sendError(res, 404, 'Documento não encontrado');
    // Mescla os campos enviados, mas blinda os controlados pelo servidor para
    // evitar mass-assignment: `id` é imutável; `validacao` só é escrita pelo
    // fluxo de validação por IA (_validarDocComTemplate), nunca por este PUT;
    // `createdAt` nunca muda. Sem isso, o cliente poderia forjar a validação.
    docs[dIdx] = {
      ...docs[dIdx],
      ...body,
      id: docId,
      validacao: docs[dIdx].validacao,
      createdAt: docs[dIdx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('recursos', 'recursos', (repo) =>
      repo.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      })
    );
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteDocumento(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = (rec.documentos || []).filter((d) => d.id !== docId);
    // Apaga também o arquivo físico (BYTEA) vinculado, se houver
    await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [
      recursoId,
      docId,
    ]);
    const { envelope } = await writeCollection('recursos', 'recursos', (repo) =>
      repo.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      })
    );
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Arquivos de documentos de recurso extraídos → handlers/recurso-documentos.js

// ============ Dashboard layouts (preferências por usuário) ============
async function handleListDashLayouts(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const rows = await db.getMany(
      'SELECT id, nome, widgets, is_default FROM dashboard_layouts WHERE user_id = $1 ORDER BY is_default DESC, nome ASC',
      [userId]
    );
    sendJson(res, { layouts: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostDashLayout(req, body, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const id = generateId('dash');
    const widgets = Array.isArray(body.widgets) ? body.widgets : [];
    const row = await db.getOne(
      `INSERT INTO dashboard_layouts (id, user_id, nome, widgets, is_default)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        id,
        userId,
        String(body.nome || 'Layout').slice(0, 60),
        JSON.stringify(widgets),
        body.isDefault === true,
      ]
    );
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutDashLayout(req, id, body, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const widgets = Array.isArray(body.widgets) ? body.widgets : [];
    const row = await db.getOne(
      `UPDATE dashboard_layouts SET nome = $3, widgets = $4, is_default = $5, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [
        id,
        userId,
        String(body.nome || 'Layout').slice(0, 60),
        JSON.stringify(widgets),
        body.isDefault === true,
      ]
    );
    if (!row) return sendError(res, 404, 'Layout não encontrado');
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteDashLayout(req, id, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    await db.query('DELETE FROM dashboard_layouts WHERE id = $1 AND user_id = $2', [id, userId]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Almoxarifado / Estoque ============

// ── Helpers de auto-criação ──
// Garante que o almoxarifado Central existe (1 só, sem contract_id).
// Chamado no startup e no GET /api/estoque/visao-geral.
async function ensureAlmoxarifadoCentral() {
  const existe = await db.getOne(
    `SELECT id FROM almoxarifados WHERE contract_id IS NULL AND ativo = TRUE ORDER BY created_at ASC LIMIT 1`
  );
  if (existe) return existe.id;
  const id = generateId('almox');
  await db.query(
    `INSERT INTO almoxarifados (id, nome, contract_id, ativo) VALUES ($1, 'Central', NULL, TRUE)`,
    [id]
  );
  return id;
}

// Cria almoxarifado de obra automaticamente quando precisar movimentar pra ela.
// Reusa o existente se já houver. Endereço puxado do contract.
async function ensureAlmoxarifadoObra(contractId) {
  if (!contractId) return null;
  const existe = await db.getOne(
    `SELECT id FROM almoxarifados WHERE contract_id = $1 AND ativo = TRUE LIMIT 1`,
    [contractId]
  );
  if (existe) return existe.id;
  const contract = await db.getOne('SELECT name, endereco FROM contracts WHERE id = $1', [
    contractId,
  ]);
  if (!contract) return null;
  const id = generateId('almox');
  await db.query(
    `INSERT INTO almoxarifados (id, nome, contract_id, endereco, ativo) VALUES ($1, $2, $3, $4, TRUE)`,
    [id, `Almox - ${contract.name || 'Obra'}`, contractId, contract.endereco || null]
  );
  return id;
}

// Resolve aliases especiais pra IDs reais de almoxarifado:
//   "auto-central"          → id do Central (cria se preciso)
//   "auto-obra:<contractId>"→ id do almox da obra (cria se preciso)
//   <id normal>             → passa direto
async function _resolveAlmoxId(rawId) {
  if (!rawId || typeof rawId !== 'string') return rawId || null;
  if (rawId === 'auto-central') return await ensureAlmoxarifadoCentral();
  const m = rawId.match(/^auto-obra:(.+)$/);
  if (m) return await ensureAlmoxarifadoObra(m[1]);
  return rawId;
}

// Visão geral: matriz item × almoxarifado pronta pra render.
// Garante o Central existindo. Inclui contract_name pros almox de obra.
async function handleGetVisaoGeral(res) {
  try {
    await ensureAlmoxarifadoCentral();
    const almoxs = await db.getMany(
      `SELECT a.id, a.nome, a.contract_id, a.endereco, a.ativo, c.name AS contract_name
       FROM almoxarifados a LEFT JOIN contracts c ON c.id = a.contract_id
       WHERE a.ativo = TRUE
       ORDER BY (a.contract_id IS NULL) DESC, c.name ASC, a.nome ASC`
    );
    const itens = await db.getMany(
      `SELECT i.id, i.codigo, i.descricao, i.unidade, i.categoria, i.estoque_minimo, i.custo_medio,
              i.notas,
              COALESCE(json_agg(
                json_build_object('almoxId', s.almoxarifado_id, 'qtd', s.quantidade)
                ORDER BY s.almoxarifado_id
              ) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS saldos
       FROM itens_estoque i
       LEFT JOIN estoque_saldo s ON s.item_id = i.id
       WHERE i.ativo = TRUE
       GROUP BY i.id ORDER BY i.descricao ASC`
    );
    sendJson(res, { almoxarifados: almoxs, itens });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ── Itens ──
async function handleListItensEstoque(res) {
  try {
    const rows = await db.getMany(
      `SELECT * FROM itens_estoque WHERE ativo = TRUE ORDER BY descricao ASC`
    );
    sendJson(res, { itens: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostItemEstoque(body, res) {
  try {
    const id = generateId('item');
    const row = await db.getOne(
      `INSERT INTO itens_estoque (id, codigo, descricao, unidade, categoria, estoque_minimo, custo_medio, notas, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
      [
        id,
        body.codigo || null,
        String(body.descricao || '').slice(0, 200),
        body.unidade || null,
        body.categoria || null,
        parseFloat(body.estoqueMinimo) || 0,
        parseFloat(body.custoMedio) || 0,
        body.notas || null,
      ]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutItemEstoque(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE itens_estoque SET
         codigo=$2, descricao=$3, unidade=$4, categoria=$5,
         estoque_minimo=$6, notas=$7, ativo=$8, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [
        id,
        body.codigo || null,
        String(body.descricao || '').slice(0, 200),
        body.unidade || null,
        body.categoria || null,
        parseFloat(body.estoqueMinimo) || 0,
        body.notas || null,
        body.ativo !== false,
      ]
    );
    if (!row) return sendError(res, 404, 'Item não encontrado');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteItemEstoque(id, res) {
  try {
    // Soft delete (preserva histórico de movimentações)
    await db.query('UPDATE itens_estoque SET ativo=FALSE, updated_at=NOW() WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Almoxarifados ──
async function handleListAlmoxarifados(res) {
  try {
    const rows = await db.getMany(
      `SELECT a.*, c.name AS contract_name
       FROM almoxarifados a LEFT JOIN contracts c ON c.id = a.contract_id
       WHERE a.ativo = TRUE ORDER BY a.nome ASC`
    );
    sendJson(res, { almoxarifados: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostAlmoxarifado(body, res) {
  try {
    const id = generateId('almox');
    const row = await db.getOne(
      `INSERT INTO almoxarifados (id, nome, contract_id, endereco, ativo)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [id, String(body.nome || '').slice(0, 100), body.contractId || null, body.endereco || null]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutAlmoxarifado(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE almoxarifados SET nome=$2, contract_id=$3, endereco=$4, ativo=$5
       WHERE id=$1 RETURNING *`,
      [
        id,
        String(body.nome || '').slice(0, 100),
        body.contractId || null,
        body.endereco || null,
        body.ativo !== false,
      ]
    );
    if (!row) return sendError(res, 404, 'Almoxarifado não encontrado');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteAlmoxarifado(id, res) {
  try {
    await db.query('UPDATE almoxarifados SET ativo=FALSE WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Movimentações (núcleo do módulo) ──
async function handleListMovimentacoes(query, res) {
  try {
    const conds = [];
    const vals = [];
    if (query.itemId) {
      vals.push(query.itemId);
      conds.push(`m.item_id = $${vals.length}`);
    }
    if (query.almoxId) {
      vals.push(query.almoxId);
      conds.push(
        `(m.almoxarifado_origem_id = $${vals.length} OR m.almoxarifado_destino_id = $${vals.length})`
      );
    }
    if (query.contractId) {
      vals.push(query.contractId);
      conds.push(`m.contract_id = $${vals.length}`);
    }
    if (query.tipo) {
      vals.push(query.tipo);
      conds.push(`m.tipo = $${vals.length}`);
    }
    if (query.from) {
      vals.push(query.from);
      conds.push(`m.data >= $${vals.length}`);
    }
    if (query.to) {
      vals.push(query.to);
      conds.push(`m.data <= $${vals.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const lim = Math.min(parseInt(query.limit) || 200, 1000);
    vals.push(lim);
    const rows = await db.getMany(
      `SELECT m.*, i.descricao AS item_desc, i.unidade,
              ao.nome AS origem_nome, ad.nome AS destino_nome,
              c.name AS contract_name
       FROM estoque_movimentacoes m
       LEFT JOIN itens_estoque i ON i.id = m.item_id
       LEFT JOIN almoxarifados ao ON ao.id = m.almoxarifado_origem_id
       LEFT JOIN almoxarifados ad ON ad.id = m.almoxarifado_destino_id
       LEFT JOIN contracts c ON c.id = m.contract_id
       ${where} ORDER BY m.data DESC, m.created_at DESC LIMIT $${vals.length}`,
      vals
    );
    sendJson(res, { movimentacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// Ajusta saldo (insere ou atualiza UPSERT)
async function _ajustarSaldo(client, itemId, almoxId, delta) {
  if (!almoxId) return;
  await client.query(
    `INSERT INTO estoque_saldo (id, item_id, almoxarifado_id, quantidade)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id, almoxarifado_id)
     DO UPDATE SET quantidade = estoque_saldo.quantidade + $4`,
    [`saldo_${itemId}_${almoxId}`, itemId, almoxId, delta]
  );
}

async function handlePostMovimentacao(body, res) {
  try {
    const tipo = body.tipo;
    if (!['entrada', 'saida', 'transferencia', 'ajuste'].includes(tipo)) {
      return sendError(res, 400, 'Tipo inválido');
    }
    const itemId = body.itemId;
    const qtd = parseFloat(body.quantidade);
    const custo = parseFloat(body.custoUnit) || 0;
    if (!itemId || !(qtd > 0)) return sendError(res, 400, 'Item e quantidade são obrigatórios');

    // Resolve "auto-obra:<contractId>" e "auto-central" antes de prosseguir
    const origemId = await _resolveAlmoxId(body.almoxarifadoOrigemId);
    const destinoId = await _resolveAlmoxId(body.almoxarifadoDestinoId);
    if (tipo === 'entrada' && !destinoId)
      return sendError(res, 400, 'Entrada precisa almoxarifado destino');
    if (tipo === 'saida' && !origemId)
      return sendError(res, 400, 'Saída precisa almoxarifado origem');
    if (tipo === 'transferencia' && (!origemId || !destinoId))
      return sendError(res, 400, 'Transferência precisa origem e destino');
    if (tipo === 'transferencia' && origemId === destinoId)
      return sendError(res, 400, 'Origem e destino não podem ser iguais');

    const result = await db.withTransaction(async (client) => {
      const id = generateId('mov');
      const movRow = (
        await client.query(
          `INSERT INTO estoque_movimentacoes
          (id, item_id, almoxarifado_origem_id, almoxarifado_destino_id, tipo,
           quantidade, custo_unit, contract_id, data, documento, user_id, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            id,
            itemId,
            origemId,
            destinoId,
            tipo,
            qtd,
            custo,
            body.contractId || null,
            body.data || new Date().toISOString().split('T')[0],
            body.documento || null,
            body.userId || null,
            body.notas || null,
          ]
        )
      ).rows[0];

      // Atualiza saldos por tipo
      if (tipo === 'entrada') await _ajustarSaldo(client, itemId, destinoId, qtd);
      else if (tipo === 'saida') await _ajustarSaldo(client, itemId, origemId, -qtd);
      else if (tipo === 'transferencia') {
        await _ajustarSaldo(client, itemId, origemId, -qtd);
        await _ajustarSaldo(client, itemId, destinoId, qtd);
      } else if (tipo === 'ajuste') {
        // ajuste: quantidade pode ser negativa (perda) ou positiva (encontrou)
        await _ajustarSaldo(
          client,
          itemId,
          destinoId || origemId,
          qtd * (body.sinal === '-' ? -1 : 1)
        );
      }

      // Atualiza custo médio ponderado em entradas (CMV)
      if (tipo === 'entrada' && custo > 0) {
        const item = (
          await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [itemId])
        ).rows[0];
        const saldoTotal = (
          await client.query(
            'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
            [itemId]
          )
        ).rows[0].s;
        // Saldo já foi atualizado acima — saldoAnterior = saldoTotal - qtd
        const saldoAnt = parseFloat(saldoTotal) - qtd;
        const custoMedAnt = parseFloat(item?.custo_medio) || 0;
        const novoCustoMedio =
          saldoTotal > 0 ? (saldoAnt * custoMedAnt + qtd * custo) / parseFloat(saldoTotal) : custo;
        await client.query(
          'UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1',
          [itemId, novoCustoMedio]
        );
      }
      return movRow;
    });

    sendJson(res, db.rowToCamel(result));
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteMovimentacao(id, res) {
  try {
    // Reverte o saldo antes de apagar (transação)
    await db.withTransaction(async (client) => {
      const m = (await client.query('SELECT * FROM estoque_movimentacoes WHERE id = $1', [id]))
        .rows[0];
      if (!m) return;
      const qtd = parseFloat(m.quantidade);
      if (m.tipo === 'entrada')
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      else if (m.tipo === 'saida')
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
      else if (m.tipo === 'transferencia') {
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      } else if (m.tipo === 'ajuste') {
        await _ajustarSaldo(
          client,
          m.item_id,
          m.almoxarifado_destino_id || m.almoxarifado_origem_id,
          -qtd
        );
      }
      await client.query('DELETE FROM estoque_movimentacoes WHERE id = $1', [id]);
    });
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Saldo: matriz item × almoxarifado
async function handleGetSaldoEstoque(query, res) {
  try {
    // 1. Lista TODOS os itens ativos (mesmo os sem saldo ainda)
    const itensAtivos = await db.getMany(
      `SELECT id, codigo, descricao, unidade, categoria, estoque_minimo, custo_medio
       FROM itens_estoque WHERE ativo = TRUE ORDER BY descricao ASC`
    );
    // 2. Pega saldos reais por item × almoxarifado (excluindo almox inativos)
    const saldos = await db.getMany(
      `SELECT s.*, a.nome AS almox_nome, a.contract_id AS almox_contract_id
       FROM estoque_saldo s
       INNER JOIN almoxarifados a ON a.id = s.almoxarifado_id
       WHERE a.ativo = TRUE`
    );
    // 3. Agrupa saldos por item
    const saldosPorItem = new Map();
    for (const s of saldos) {
      if (!saldosPorItem.has(s.itemId)) saldosPorItem.set(s.itemId, []);
      saldosPorItem.get(s.itemId).push({
        almoxarifadoId: s.almoxarifadoId,
        almoxNome: s.almoxNome,
        almoxContractId: s.almoxContractId,
        quantidade: parseFloat(s.quantidade) || 0,
      });
    }
    // 4. Monta lista final — todos os itens ativos, com seus saldos (ou vazio se nunca houve movimentação)
    const itens = itensAtivos.map((i) => {
      const porAlmox = saldosPorItem.get(i.id) || [];
      const totalQtd = porAlmox.reduce((s, a) => s + a.quantidade, 0);
      const custoMedio = parseFloat(i.custoMedio) || 0;
      const estoqueMinimo = parseFloat(i.estoqueMinimo) || 0;
      return {
        itemId: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        unidade: i.unidade,
        categoria: i.categoria,
        estoqueMinimo,
        custoMedio,
        totalQtd,
        totalValor: totalQtd * custoMedio,
        porAlmox,
        abaixoMinimo: totalQtd < estoqueMinimo,
        semMovimentacao: porAlmox.length === 0,
      };
    });
    sendJson(res, { itens, total: itens.length });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

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
async function handleListVeiculos(res) {
  try {
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

function _allowedVeiculoFields(body) {
  const allowed = {};
  const fields = [
    'placa',
    'modelo',
    'marca',
    'tipo',
    'observacoes',
    'status',
    'contractId',
    'endereco',
  ];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f] || null;
  }
  if (body.ano !== undefined) allowed.ano = parseInt(body.ano) || null;
  if (body.kmAtual !== undefined) allowed.kmAtual = parseInt(body.kmAtual) || 0;
  if (body.lat !== undefined) allowed.lat = body.lat ? parseFloat(body.lat) : null;
  if (body.lng !== undefined) allowed.lng = body.lng ? parseFloat(body.lng) : null;
  return allowed;
}

async function handlePostVeiculo(body, res) {
  try {
    if (!body.placa) return sendError(res, 400, 'Placa é obrigatória');
    const data = { id: generateId('veic'), ..._allowedVeiculoFields(body) };
    if (data.kmAtual) data.kmAtualizadoEm = new Date();
    if (data.lat && data.lng) data.localizadoEm = new Date();
    await repos.veiculos.create(data);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculo(id, body, res) {
  try {
    const allowed = _allowedVeiculoFields(body);
    const result = await repos.veiculos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculo(id, res) {
  try {
    await repos.veiculos.removeById(id);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoKm(id, body, res) {
  try {
    const km = parseInt(body.km);
    if (!(km >= 0)) return sendError(res, 400, 'KM inválido');
    const result = await repos.veiculos.updateById(id, { kmAtual: km, kmAtualizadoEm: new Date() });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoLocalizacao(id, body, res) {
  try {
    const lat = body.lat ? parseFloat(body.lat) : null;
    const lng = body.lng ? parseFloat(body.lng) : null;
    const result = await repos.veiculos.updateById(id, {
      lat,
      lng,
      endereco: body.endereco || null,
      localizadoEm: new Date(),
    });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePostVeiculoPlano(veiculoId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição obrigatória');
    if (!body.intervaloKm && !body.intervaloMeses)
      return sendError(res, 400, 'Informe intervaloKm e/ou intervaloMeses');
    const data = {
      id: generateId('plano'),
      veiculoId,
      descricao: body.descricao,
      intervaloKm: body.intervaloKm ? parseInt(body.intervaloKm) : null,
      intervaloMeses: body.intervaloMeses ? parseInt(body.intervaloMeses) : null,
      ultimoKm: body.ultimoKm ? parseInt(body.ultimoKm) : null,
      ultimaData: body.ultimaData || null,
      ativo: body.ativo === undefined ? true : !!body.ativo,
    };
    await repos.veiculoPlanos.create(data);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoPlano(veiculoId, planoId, body, res) {
  try {
    const allowed = {};
    if (body.descricao !== undefined) allowed.descricao = body.descricao;
    if (body.intervaloKm !== undefined)
      allowed.intervaloKm = body.intervaloKm ? parseInt(body.intervaloKm) : null;
    if (body.intervaloMeses !== undefined)
      allowed.intervaloMeses = body.intervaloMeses ? parseInt(body.intervaloMeses) : null;
    if (body.ultimoKm !== undefined)
      allowed.ultimoKm = body.ultimoKm ? parseInt(body.ultimoKm) : null;
    if (body.ultimaData !== undefined) allowed.ultimaData = body.ultimaData || null;
    if (body.ativo !== undefined) allowed.ativo = !!body.ativo;
    await repos.veiculoPlanos.updateById(planoId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoPlano(veiculoId, planoId, res) {
  try {
    await repos.veiculoPlanos.removeById(planoId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePostVeiculoManutencao(req, veiculoId, body, res) {
  try {
    if (!body.data) return sendError(res, 400, 'Data obrigatória');
    const data = {
      id: generateId('manut'),
      veiculoId,
      planoId: body.planoId || null,
      tipo: body.tipo || 'preventiva',
      descricao: body.descricao || '',
      data: body.data,
      km: body.km ? parseInt(body.km) : null,
      custo: body.custo ? money.parse(body.custo) : null,
      fornecedorId: body.fornecedorId || null,
      observacoes: body.observacoes || '',
      arquivo: body.arquivo ? JSON.stringify(body.arquivo) : null,
    };
    await repos.veiculoManutencoes.create(data);

    // Se está vinculada a plano, atualiza ultimoKm e ultimaData do plano
    if (body.planoId) {
      const planoUpd = {};
      if (data.km) planoUpd.ultimoKm = data.km;
      if (data.data) planoUpd.ultimaData = data.data;
      if (Object.keys(planoUpd).length)
        await repos.veiculoPlanos.updateById(body.planoId, planoUpd);
    }
    // Atualiza KM atual do veículo se a manutenção informou KM maior
    if (data.km) {
      const veic = await repos.veiculos.findById(veiculoId);
      if (veic && data.km > (parseInt(veic.kmAtual) || 0)) {
        await repos.veiculos.updateById(veiculoId, {
          kmAtual: data.km,
          kmAtualizadoEm: new Date(),
        });
      }
    }

    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoManutencao(veiculoId, manId, body, res) {
  try {
    const allowed = {};
    const fields = ['tipo', 'descricao', 'data', 'observacoes', 'planoId', 'fornecedorId'];
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.km !== undefined) allowed.km = body.km ? parseInt(body.km) : null;
    if (body.custo !== undefined) allowed.custo = body.custo ? money.parse(body.custo) : null;
    if (body.arquivo !== undefined)
      allowed.arquivo = body.arquivo ? JSON.stringify(body.arquivo) : null;
    await repos.veiculoManutencoes.updateById(manId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoManutencao(veiculoId, manId, res) {
  try {
    await repos.veiculoManutencoes.removeById(manId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Abastecimentos ============
async function handleListVeiculoAbastecimentos(veiculoId, res) {
  try {
    // Filtra no SQL (WHERE veiculo_id = $1, com o ORDER BY do repo preservado)
    // em vez de trazer a tabela inteira e filtrar em JS — o histórico cresce.
    const rows = await repos.veiculoAbastecimentos.findAll({ veiculoId });
    sendJson(res, { abastecimentos: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostVeiculoAbastecimento(veiculoId, body, res) {
  try {
    if (!body.data) return sendError(res, 400, 'Data obrigatória');
    if (!body.litros) return sendError(res, 400, 'Litros obrigatório');
    const data = {
      id: generateId('abst'),
      veiculoId,
      data: body.data,
      km: body.km ? parseInt(body.km) : null,
      litros: parseFloat(body.litros),
      valorTotal: body.valorTotal ? money.parse(body.valorTotal) : null,
      tipoCombustivel: body.tipoCombustivel || null,
      fornecedorId: body.fornecedorId || null,
      contractId: body.contractId || null,
      observacoes: body.observacoes || '',
    };
    // Reserva e CRIA o lançamento de caixa (se houver contrato + valor) ANTES do
    // abastecimento — a FK caixa_entry_id exige que a row de caixa já exista.
    data.caixaEntryId = data.contractId && data.valorTotal ? generateId('cxa') : null;
    if (data.caixaEntryId) {
      await repos.caixa.create({
        id: data.caixaEntryId,
        type: 'saida',
        value: data.valorTotal,
        date: data.data,
        description: `Abastecimento veículo — ${data.litros}L`,
        category: 'abastecimento',
        contractId: data.contractId,
      });
    }
    await repos.veiculoAbastecimentos.create(data);

    // Atualiza KM atual do veículo se o hodômetro informado for maior
    if (data.km) {
      const veic = await repos.veiculos.findById(veiculoId);
      if (veic && data.km > (parseInt(veic.kmAtual) || 0)) {
        await repos.veiculos.updateById(veiculoId, {
          kmAtual: data.km,
          kmAtualizadoEm: new Date(),
        });
      }
    }

    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutVeiculoAbastecimento(veiculoId, abastecId, body, res) {
  try {
    const abast = await repos.veiculoAbastecimentos.findById(abastecId);
    if (!abast) return sendError(res, 404, 'Abastecimento não encontrado');
    const allowed = {};
    const strFields = ['data', 'tipoCombustivel', 'fornecedorId', 'contractId', 'observacoes'];
    for (const f of strFields) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.km !== undefined) allowed.km = body.km ? parseInt(body.km) : null;
    if (body.litros !== undefined) allowed.litros = body.litros ? parseFloat(body.litros) : null;
    if (body.valorTotal !== undefined)
      allowed.valorTotal = body.valorTotal ? money.parse(body.valorTotal) : null;

    // Re-sincroniza o lançamento de caixa: estorna o antigo e recria se ainda
    // houver contrato + valor (evita saída de caixa órfã ou desatualizada).
    const contractId = allowed.contractId !== undefined ? allowed.contractId : abast.contractId;
    const valorTotal = allowed.valorTotal !== undefined ? allowed.valorTotal : abast.valorTotal;
    const dataAb = allowed.data !== undefined ? allowed.data : abast.data;
    const litros = allowed.litros !== undefined ? allowed.litros : abast.litros;
    if (abast.caixaEntryId) await repos.caixa.removeById(abast.caixaEntryId);
    let novoCaixaId = null;
    if (contractId && valorTotal) {
      novoCaixaId = generateId('cxa');
      await repos.caixa.create({
        id: novoCaixaId,
        type: 'saida',
        value: valorTotal,
        date: dataAb,
        description: `Abastecimento veículo — ${litros}L`,
        category: 'abastecimento',
        contractId,
      });
    }
    allowed.caixaEntryId = novoCaixaId;
    await repos.veiculoAbastecimentos.updateById(abastecId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteVeiculoAbastecimento(veiculoId, abastecId, res) {
  try {
    const abast = await repos.veiculoAbastecimentos.findById(abastecId);
    await repos.veiculoAbastecimentos.removeById(abastecId);
    // Estorna o lançamento de caixa gerado por este abastecimento (se houver).
    if (abast && abast.caixaEntryId) await repos.caixa.removeById(abast.caixaEntryId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Cronograma físico-financeiro (atividades) ============
async function handleListAtividades(contractId, res) {
  try {
    const rows = await db.getMany(
      `SELECT * FROM atividades WHERE contract_id = $1 ORDER BY ordem ASC, created_at ASC`,
      [contractId]
    );
    sendJson(res, { atividades: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostAtividade(contractId, body, res) {
  try {
    const id = generateId('ativ');
    const row = await db.getOne(
      `INSERT INTO atividades
        (id, contract_id, parent_id, ordem, nome, data_inicio_plan, data_fim_plan,
         data_inicio_real, data_fim_real, peso_pct, exec_pct, custo_plan, predecessoras, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id,
        contractId,
        body.parentId || null,
        parseInt(body.ordem) || 0,
        String(body.nome || '').slice(0, 200),
        body.dataInicioPlan || null,
        body.dataFimPlan || null,
        body.dataInicioReal || null,
        body.dataFimReal || null,
        parseFloat(body.pesoPct) || 0,
        parseFloat(body.execPct) || 0,
        money.parse(body.custoPlan),
        Array.isArray(body.predecessoras) ? body.predecessoras : [],
        body.notas || null,
      ]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutAtividade(contractId, atvId, body, res) {
  try {
    const fields = [
      'parent_id',
      'ordem',
      'nome',
      'data_inicio_plan',
      'data_fim_plan',
      'data_inicio_real',
      'data_fim_real',
      'peso_pct',
      'exec_pct',
      'custo_plan',
      'predecessoras',
      'notas',
    ];
    const map = {
      parent_id: body.parentId ?? null,
      ordem: parseInt(body.ordem) || 0,
      nome: String(body.nome || '').slice(0, 200),
      data_inicio_plan: body.dataInicioPlan || null,
      data_fim_plan: body.dataFimPlan || null,
      data_inicio_real: body.dataInicioReal || null,
      data_fim_real: body.dataFimReal || null,
      peso_pct: parseFloat(body.pesoPct) || 0,
      exec_pct: parseFloat(body.execPct) || 0,
      custo_plan: money.parse(body.custoPlan),
      predecessoras: Array.isArray(body.predecessoras) ? body.predecessoras : [],
      notas: body.notas ?? null,
    };
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const vals = fields.map((f) => map[f]);
    vals.push(atvId, contractId);
    const row = await db.getOne(
      `UPDATE atividades SET ${set}, updated_at = NOW()
       WHERE id = $${fields.length + 1} AND contract_id = $${fields.length + 2}
       RETURNING *`,
      vals
    );
    if (!row) return sendError(res, 404, 'Atividade não encontrada');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteAtividade(contractId, atvId, res) {
  try {
    await db.query('DELETE FROM atividades WHERE id = $1 AND contract_id = $2', [
      atvId,
      contractId,
    ]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Curva S baseada nas atividades reais (substitui a linear quando há etapas cadastradas)
async function handleGetCurvaS(contractId, res) {
  try {
    const ativs = await db.getMany(
      `SELECT id, nome, data_inicio_plan, data_fim_plan, data_inicio_real, data_fim_real,
              peso_pct, exec_pct, custo_plan
       FROM atividades WHERE contract_id = $1 AND parent_id IS NULL
       ORDER BY data_inicio_plan ASC, ordem ASC`,
      [contractId]
    );
    sendJson(res, { atividades: ativs });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

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

async function handleGetDocumentosStatus(res) {
  try {
    const recursos = await repos.recursos.findAll();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ativos = recursos.filter((r) => r.status === 'funcionario');
    let totalDocs = 0,
      vigentes = 0,
      vencidos = 0,
      vencendo = 0,
      pendentes = 0;

    ativos.forEach((r) => {
      (r.documentos || []).forEach((doc) => {
        totalDocs++;
        if (!doc.dataVencimento) {
          pendentes++;
          return;
        }
        const venc = new Date(doc.dataVencimento + 'T12:00:00');
        const dias = Math.ceil((venc - hoje) / 86400000);
        if (dias < 0) vencidos++;
        else if (dias <= 30) vencendo++;
        else vigentes++;
      });
    });

    const colaboradoresComVencidos = ativos.filter((r) =>
      (r.documentos || []).some((doc) => {
        if (!doc.dataVencimento) return false;
        return Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000) < 0;
      })
    ).length;

    sendJson(res, {
      totalAtivos: ativos.length,
      colaboradoresComVencidos,
      totalDocs,
      vigentes,
      vencidos,
      vencendo,
      pendentes,
    });
  } catch (e) {
    // Via sendError (não res.end cru): redige a mensagem em 5xx, evitando vazar
    // o texto de erro do Postgres ao cliente. Mantém o padrão do resto do app.
    sendError(res, 500, e.message);
  }
}

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
