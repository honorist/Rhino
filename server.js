const http = require('http');
const fs = require('fs');
const path = require('path');

// Versão do app: APP_VERSION env > package.json > 'dev'
const APP_VERSION = process.env.APP_VERSION || (() => {
  try { return require('./package.json').version || 'dev'; } catch { return 'dev'; }
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
const auth = require('./lib/auth');
const feriados = require('./lib/feriados');
const email = require('./lib/email');
const queue = require('./lib/queue');
const rateLimit = require('./lib/rate-limit');
const pgRateLimit = require('./lib/pg-rate-limit');
const audit = require('./lib/audit');
const bus = require('./lib/bus');
const perms = require('./lib/permissions');
const fluxoCompra = require('./lib/fluxo-compra');
const recorrencia = require('./lib/recorrencia');
const { sendJson, sendError } = require('./lib/http-respond');
const { createRouter } = require('./lib/router');
const registerAuth = require('./routes/auth');
const registerPortal = require('./routes/portal');
const registerPlatform = require('./routes/platform');
const registerFinanceiro = require('./routes/financeiro');
const registerComercial = require('./routes/comercial');
const registerOperacao = require('./routes/operacao');
const registerContracts = require('./routes/contracts');
const { validateBody, schemas, ValidationError } = require('./lib/validate');

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
const AUDIT_BEFORE_LOOKUP = {
  'clientes':       (id) => repos.clientes && repos.clientes.findById && repos.clientes.findById(id),
  'fornecedores':   (id) => repos.fornecedores && repos.fornecedores.findById && repos.fornecedores.findById(id),
  'recursos':       (id) => repos.recursos && repos.recursos.findById && repos.recursos.findById(id),
  'contracts':      (id) => repos.contracts && repos.contracts.findById && repos.contracts.findById(id),
  'contas-pagar':   (id) => repos.contasPagar && repos.contasPagar.findById && repos.contasPagar.findById(id),
  'notas-fiscais':  (id) => repos.notasFiscais && repos.notasFiscais.findById && repos.notasFiscais.findById(id),
  'caixa':          (id) => repos.caixa && repos.caixa.findById && repos.caixa.findById(id),
  'base':           (id) => repos.baseItems && repos.baseItems.findById && repos.baseItems.findById(id),
  'socios':         (id) => repos.socios && repos.socios.findById && repos.socios.findById(id),
  'investimentos':  (id) => repos.investimentos && repos.investimentos.findById && repos.investimentos.findById(id),
  'saidas':         (id) => repos.saidas && repos.saidas.findById && repos.saidas.findById(id),
  'tipos-base':     (id) => repos.tiposBase && repos.tiposBase.findById && repos.tiposBase.findById(id),
  'niveis-acesso':  (id) => repos.niveisAcesso && repos.niveisAcesso.findById && repos.niveisAcesso.findById(id),
  'doc-templates':  (id) => repos.docTemplates && repos.docTemplates.findById && repos.docTemplates.findById(id),
  'users':          (id) => repos.users && repos.users.findById && repos.users.findById(id),
  'folha-pagamento':(id) => repos.folhaPagamento && repos.folhaPagamento.findById && repos.folhaPagamento.findById(id),
};

function _auditFriendlyLabel(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return obj.nome || obj.name || obj.label || obj.descricao || obj.description ||
         obj.numero || obj.email || obj.tipoLabel || obj.tipo || null;
}

async function captureAuditBefore(req, pathname) {
  try {
    if (!['PUT', 'DELETE'].includes(req.method)) return;
    // Match /api/{tipo}/{id}  (ignora sub-recursos por enquanto — só raiz)
    const m = pathname.match(/^\/api\/([^/]+)\/([^/]+)$/);
    if (!m) return;
    const lookup = AUDIT_BEFORE_LOOKUP[m[1]];
    if (!lookup) return;
    const before = await lookup(m[2]);
    if (!before) return;
    req._auditBefore = before;
    req._auditEntityLabel = _auditFriendlyLabel(before);
  } catch {
    // silencioso — auditoria não pode quebrar a requisição
  }
}

function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}${random}`;
}

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
async function handleGetContracts(res, query) {
  try {
    const lite = !!(query && (query.lite === '1' || query.lite === 'true'));
    sendJson(res, await repos.contracts.getEnvelope({ lite }));
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostContract(body, res) {
  try {
    if (!body.name || !body.client) {
      return sendError(res, 400, 'Nome e cliente são obrigatórios');
    }
    const contract = {
      id: generateId('ctr'),
      name: body.name,
      contractNumber: body.contractNumber || '',
      client: body.client,
      clientId: body.clientId || null,
      clientDocument: body.clientDocument || '',
      clientEmail: body.clientEmail || '',
      clientPhone: body.clientPhone || '',
      value: parseFloat(body.value) || 0,
      currency: body.currency || 'BRL',
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      tendencyDate: body.tendencyDate || null,
      status: body.status || 'ativo',
      endereco: body.endereco || '',
      lat: body.lat || '',
      lng: body.lng || '',
      notes: body.notes || '',
      retencaoPercent: parseFloat(body.retencaoPercent) || 0,
      budget: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.contracts.create(contract);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutContract(id, body, res) {
  try {
    const allowed = {};
    const fields = ['name', 'client', 'clientId', 'clientDocument', 'clientEmail', 'clientPhone', 'currency', 'status', 'notes', 'lat', 'lng', 'endereco', 'contractNumber'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.value !== undefined) allowed.value = parseFloat(body.value) || 0;
    if (body.retencaoPercent !== undefined) allowed.retencaoPercent = parseFloat(body.retencaoPercent) || 0;
    for (const f of ['startDate', 'endDate', 'tendencyDate']) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    allowed.updatedAt = new Date().toISOString();

    const result = await repos.contracts.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Contract not found');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteContract(id, res) {
  try {
    // Apaga TUDO vinculado ao contrato (financeiro + operacional) numa transação:
    // FK CASCADE remove saidas/organograma/rdos automaticamente; o cascade manual
    // (no repo) limpa caixa, contas_pagar, notas_fiscais e investimentos do contrato.
    await repos.contracts.removeByIdCascade(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

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
  } catch (e) { sendError(res, 500, e.message); }
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
    if (!body?.endpoint || typeof body.endpoint !== 'string' || !body.endpoint.startsWith('https://')) {
      return sendError(res, 400, 'Endpoint inválido');
    }
    if (!req.user?.id) return sendError(res, 401, 'Não autenticado');
    await db.query(
      'DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2',
      [body.endpoint, req.user.id]
    );
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 500, e.message); }
}

/**
 * Cria uma saída + BM (Boletim de Medição) vinculado a um contrato.
 *
 * FIX P0-1/P1-5 (backend review): toda a sequência (validação de teto contratual +
 * upsert da NF + create da saída) roda dentro de uma transação que toma
 * `SELECT contracts FOR UPDATE`. Isso serializa requests concorrentes sobre o
 * mesmo contrato — antes, dois POSTs simultâneos podiam ambos passar pela
 * validação e ultrapassar o valor do contrato.
 *
 * @param {string} contractId
 * @param {{ value?: number|string, date?: string, type?: string, description?: string, prazoRecebimento?: number }} body
 * @param {import('http').ServerResponse} res
 */
async function handlePostSaida(contractId, body, res) {
  try {
    const result = await db.withTransaction(async (client) => {
      // Lock pessimista no contrato — serializa todas as escritas sobre ele.
      const contractRow = await client.query(
        'SELECT * FROM contracts WHERE id = $1 FOR UPDATE',
        [contractId]
      );
      if (contractRow.rows.length === 0) {
        const err = new Error('Contract not found');
        err.statusCode = 404;
        throw err;
      }
      const contract = await repos.contracts.findById(contractId); // mesmo dado, mas pelo factory (camelCase)

      const { value: valor, date: dataSaida, type: saidaType, description: saidaDesc } = validateBody(schemas.saidaPost, body);

      const nfsAll = await repos.notasFiscais.findAll();
      const nfsContrato = nfsAll.filter(nf => nf.contractId === contractId);
      const totalMedidoAtual = nfsContrato.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      if (contract.value > 0 && totalMedidoAtual + valor > parseFloat(contract.value) + 0.01) {
        const err = new Error(`BM ultrapassa o valor do contrato. Disponível para medir: R$ ${(parseFloat(contract.value) - totalMedidoAtual).toFixed(2).replace('.', ',')}`);
        err.statusCode = 400;
        throw err;
      }

      // Busca NF do mesmo dia (não emitida) para agregar
      let nf = nfsContrato.find(n => n.dataLimite === dataSaida && !n.emitida);
      let numeroNf;

      if (nf) {
        const novoValor = (parseFloat(nf.valor) || 0) + valor;
        await repos.notasFiscais.updateById(nf.id, { valor: novoValor, updatedAt: new Date().toISOString() });
        numeroNf = nf.numero;
      } else {
        const numeroBm = String(nfsContrato.length + 1).padStart(3, '0');
        numeroNf = `BM-${numeroBm}`;
        const newNf = {
          id: generateId('nf'),
          numero: numeroNf,
          contractId,
          dataLimite: dataSaida,
          valor,
          prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento, 10)) ? parseInt(body.prazoRecebimento, 10) : 30),
          observacoes: saidaDesc,
          emitida: false,
          dataEmissaoReal: null,
          caixaEntryId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await repos.notasFiscais.create(newNf);
        nf = newNf;
      }

      const saida = {
        id: generateId('sai'),
        contractId,
        type: saidaType,
        description: saidaDesc,
        value: valor,
        date: dataSaida,
        nfId: nf.id,
        numeroBm: numeroNf,
        createdAt: new Date().toISOString(),
      };
      await repos.saidas.create(saida);
      return { ok: true };
    });
    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/**
 * Atualiza uma saída — tipo, descrição, data, valor, prazo.
 *
 * FIX P0-1/P1-5: pega advisory lock por contrato no início do handler.
 * `pg_advisory_xact_lock` é liberado automaticamente ao fim da transação;
 * serializa edits concorrentes no mesmo contrato (mas não bloqueia contratos
 * diferentes — escalável). Internamente continua usando repos (pool) — o lock
 * serializa o read-compute-write da validação de teto.
 *
 * @param {string} id
 * @param {object} body
 * @param {import('http').ServerResponse} res
 */
async function handlePutSaida(id, body, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saida not found');

    // Lock advisory por contrato (hash do contractId → int). Auto-libera no commit.
    // Outras requests para o mesmo contrato bloqueiam aqui até esta terminar.
    await db.withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::int)',
        [String(saida.contractId)]
      );
      await _handlePutSaidaInner(id, body, saida, res);
    });
  } catch (e) {
    if (!res.headersSent) sendError(res, e.statusCode || 400, e.message);
  }
}

/**
 * Implementação interna de PUT /saida — separada para rodar dentro de
 * `db.withTransaction`. Repos usam o pool (commits imediatos), o advisory
 * lock serializa o read-compute-write.
 */
async function _handlePutSaidaInner(id, body, saida, res) {
  try {
    const allowedSaida = { ...validateBody(schemas.saidaPut, body) };

    if (saida.nfId) {
      const nf = await repos.notasFiscais.findById(saida.nfId);
      const dataMudou  = allowedSaida.date  !== undefined && allowedSaida.date  !== saida.date;
      const valorMudou = allowedSaida.value !== undefined && allowedSaida.value !== parseFloat(saida.value);

      if (nf && nf.emitida && (dataMudou || valorMudou)) {
        return sendError(res, 400, 'Não é possível alterar valor ou data de saída com BM já emitido. Cancele a emissão antes.');
      }

      // Ajuste por delta de valor
      if (valorMudou && nf) {
        const delta = allowedSaida.value - (parseFloat(saida.value) || 0);
        const contract = await repos.contracts.findById(saida.contractId);
        if (contract && contract.value > 0) {
          const allNFs = await repos.notasFiscais.findAll();
          const totalMedidoOutros = allNFs.reduce((s, n) =>
            n.contractId !== saida.contractId ? s : s + (parseFloat(n.valor) || 0), 0);
          if (totalMedidoOutros + delta > parseFloat(contract.value) + 0.01) {
            return sendError(res, 400,
              `BM ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - totalMedidoOutros).toFixed(2).replace('.', ',')}`);
          }
        }
        await repos.notasFiscais.updateById(nf.id, {
          valor: Math.max(0, (parseFloat(nf.valor) || 0) + delta),
          updatedAt: new Date().toISOString(),
        });
      }

      // Se a data mudou, realoca entre NFs
      if (dataMudou && nf) {
        const novaData = allowedSaida.date;
        const outrasDaNfAtual = (await repos.saidas.findAll({ nfId: nf.id })).filter(s => s.id !== id);
        if (outrasDaNfAtual.length === 0) {
          await repos.notasFiscais.removeById(nf.id);
        } else {
          await repos.notasFiscais.updateById(nf.id, {
            valor: Math.max(0, (parseFloat(nf.valor) || 0) - (parseFloat(saida.value) || 0)),
            updatedAt: new Date().toISOString(),
          });
        }
        const valorFinal = allowedSaida.value !== undefined ? allowedSaida.value : (parseFloat(saida.value) || 0);
        const allNFs2 = await repos.notasFiscais.findAll();
        const nfsContrato = allNFs2.filter(n => n.contractId === saida.contractId);
        let nfNova = nfsContrato.find(n => n.dataLimite === novaData && !n.emitida);
        if (nfNova) {
          await repos.notasFiscais.updateById(nfNova.id, {
            valor: (parseFloat(nfNova.valor) || 0) + valorFinal,
            updatedAt: new Date().toISOString(),
          });
          allowedSaida.nfId = nfNova.id;
          allowedSaida.numeroBm = nfNova.numero;
        } else {
          const numeroNf = `BM-${String(nfsContrato.length + 1).padStart(3, '0')}`;
          const novaNf = {
            id: generateId('nf'),
            numero: numeroNf,
            contractId: saida.contractId,
            dataLimite: novaData,
            valor: valorFinal,
            prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30),
            observacoes: allowedSaida.description || saida.description || '',
            emitida: false,
            dataEmissaoReal: null,
            caixaEntryId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await repos.notasFiscais.create(novaNf);
          allowedSaida.nfId = novaNf.id;
          allowedSaida.numeroBm = numeroNf;
        }
      }

      // Atualiza prazoRecebimento da NF associada
      if (body.prazoRecebimento !== undefined) {
        const novoPrazo = (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30);
        const finalNfId = allowedSaida.nfId || saida.nfId;
        const targetNf = await repos.notasFiscais.findById(finalNfId);
        if (targetNf && !targetNf.emitida && targetNf.prazoRecebimento !== novoPrazo) {
          await repos.notasFiscais.updateById(finalNfId, {
            prazoRecebimento: novoPrazo,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    await repos.saidas.updateById(id, allowedSaida);
    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

/**
 * Exclui uma saída + ajusta a NF associada (zera ou recalcula valor).
 *
 * FIX P0-1: usa lock pessimista no contrato pai para serializar com POST/PUT
 * concorrentes. Sem lock, dois deletes simultâneos podiam ler o mesmo conjunto
 * de outrasSaidas e remover a NF duas vezes (segundo delete falha em
 * `removeById` por not found — irrita logs mas não corrompe).
 *
 * @param {string} id  ID da saída.
 * @param {import('http').ServerResponse} res
 */
async function handleDeleteSaida(id, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saída não encontrada');

    await db.withTransaction(async (client) => {
      // Lock no contrato para serializar com POST/PUT de saídas/NFs.
      await client.query('SELECT id FROM contracts WHERE id = $1 FOR UPDATE', [saida.contractId]);

      if (saida.nfId) {
        const nf = await repos.notasFiscais.findById(saida.nfId);
        if (nf) {
          if (nf.emitida) {
            const err = new Error('Não é possível excluir saída cujo BM já foi emitido. Cancele a emissão do BM primeiro.');
            err.statusCode = 400;
            throw err;
          }
          const outrasSaidas = (await repos.saidas.findAll({ nfId: nf.id })).filter(s => s.id !== id);
          if (outrasSaidas.length === 0) {
            await repos.notasFiscais.removeById(nf.id);
          } else {
            await repos.notasFiscais.updateById(nf.id, {
              valor: Math.max(0, (parseFloat(nf.valor) || 0) - (parseFloat(saida.value) || 0)),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
      await repos.saidas.removeById(id);
    });

    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

async function handleGetCaixa(res) {
  const data = await readCollection('caixa.json', 'caixa', 'entries');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostCaixa(body, res) {
  try {
    const entry = {
      id: generateId('cxa'),
      type: body.type || 'entrada',
      description: body.description || '',
      value: parseFloat(body.value) || 0,
      date: body.date || new Date().toISOString().split('T')[0],
      contractId: body.contractId || null,
      baseItemId: body.baseItemId || null,
      category: body.category || 'geral',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('caixa', 'entries', (repo) => repo.create(entry));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutCaixa(id, body, res) {
  try {
    const allowed = {};
    const fields = ['type', 'description', 'value', 'date', 'contractId', 'baseItemId', 'category', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (allowed.value !== undefined) allowed.value = parseFloat(allowed.value) || 0;

    const { envelope, result } = await writeCollection('caixa', 'entries', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Entry not found');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteCaixa(id, res) {
  try {
    const { envelope } = await writeCollection('caixa', 'entries', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleGetBase(res) {
  const data = await readCollection('base.json', 'baseItems', 'items');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostBase(body, res) {
  try {
    const item = {
      id: generateId('bas'),
      description: body.description || '',
      type: body.type || 'variavel',
      value: parseFloat(body.value) || 0,
      date: body.date || new Date().toISOString().split('T')[0],
      allocations: '[]',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('baseItems', 'items', (repo) => repo.create(item));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutBase(id, body, res) {
  try {
    const allowed = {};
    const fields = ['description', 'type', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.value !== undefined) allowed.value = parseFloat(body.value) || 0;
    if (body.date !== undefined) allowed.date = body.date || null;
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('baseItems', 'items', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Item not found');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteBase(id, res) {
  try {
    const { envelope } = await writeCollection('baseItems', 'items', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAllocateBase(id, body, res) {
  try {
    const baseItem = await repos.baseItems.findById(id);
    if (!baseItem) return sendError(res, 404, 'Base item not found');

    const allocationValue = parseFloat(body.value) || 0;
    const allocs = baseItem.allocations || [];
    const totalAllocated = allocs.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
    if (totalAllocated + allocationValue > parseFloat(baseItem.value)) {
      return sendError(res, 400, `Cannot allocate more than available. Available: ${parseFloat(baseItem.value) - totalAllocated}`);
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

    sendJson(res, {
      base: { items: await repos.baseItems.findAll() },
      caixa: { entries: await repos.caixa.findAll() },
      contracts: await repos.contracts.getEnvelope(),
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDashboard(res, query) {
  try {
    const contracts = await repos.contracts.getEnvelope();
    const caixa = { entries: await repos.caixa.findAll() };
    const base = { items: await repos.baseItems.findAll() };
    const notasFiscais = { notas_fiscais: await repos.notasFiscais.findAll() };

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

    const activeContracts = contracts.contracts.filter(c => c.status === 'ativo').length;
    const totalContractValue = contracts.contracts
      .filter(c => c.status === 'ativo')
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

    const contractsWithMargin = contracts.contracts.map(c => {
      const cSaidas = contracts.saidas
        .filter(s => s.contractId === c.id)
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
        endDate: c.endDate
      };
    });

    // Contratos a vencer nos próximos 30 dias
    const em30dias = new Date(hoje);
    em30dias.setDate(em30dias.getDate() + 30);
    const contratosAVencer = contracts.contracts
      .filter(c => c.status === 'ativo' && c.endDate)
      .filter(c => {
        const fim = new Date(c.endDate);
        return fim >= hoje && fim <= em30dias;
      })
      .map(c => {
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
        let rsSum = 0, rsIdx = 0;
        for (let m = 0; m < 12; m++) {
          const fimMes = new Date(filtroAno, m + 1, 0, 23, 59, 59, 999);
          while (rsIdx < entriesOrdenadas.length && new Date(entriesOrdenadas[rsIdx].date) <= fimMes) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(m + 1).padStart(2, '0')}-01`,
            saldo: rsSum,
            label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m]
          });
        }
      } else {
        // Day-by-day — running sum O(n + dias)
        const diasNoMes = new Date(filtroAno, filtroMes, 0).getDate();
        let rsSum = 0, rsIdx = 0;
        for (let d = 1; d <= diasNoMes; d++) {
          const diaEnd = new Date(filtroAno, filtroMes - 1, d, 23, 59, 59, 999);
          while (rsIdx < entriesOrdenadas.length && new Date(entriesOrdenadas[rsIdx].date) <= diaEnd) {
            const e = entriesOrdenadas[rsIdx++];
            rsSum += e.type === 'entrada' ? e.value : -e.value;
          }
          historicoCaixa.push({
            data: `${filtroAno}-${String(filtroMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            saldo: rsSum
          });
        }
      }
    } else {
      // Default: últimos N dias (N = projDays). Amostra a cada `histStep` dias
      const histStep = projDays <= 30 ? 1 : projDays <= 60 ? 2 : 3;
      let rsSum = 0, rsIdx = 0;
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
          saldo: rsSum
        });
      }
      // Garante que o último ponto seja exatamente HOJE (caso o passo pule)
      if (historicoCaixa.length === 0 || historicoCaixa[historicoCaixa.length - 1].data !== new Date().toISOString().split('T')[0]) {
        const hojeFim = new Date(); hojeFim.setHours(23, 59, 59, 999);
        while (rsIdx < entriesOrdenadas.length && new Date(entriesOrdenadas[rsIdx].date) <= hojeFim) {
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
    notasFiscais.notas_fiscais.forEach(nf => {
      if (nf.emitida) { nfsStatus.emitidas++; return; }
      if (nf.dataLimite < hojeStr) nfsStatus.vencidas++;
      else if (nf.dataLimite <= em7DiasStr) nfsStatus.proximasVencer++;
      else nfsStatus.noPrazo++;
    });

    // Projeção de fluxo de caixa futuro (próximos 90 dias)
    // Pré-computa datas de recebimento uma vez — O(n) — em vez de O(90×2n)
    const _nfsProjMap = new Map();
    for (const nf of notasFiscais.notas_fiscais) {
      if (nf.emitida || !(nf.valor > 0) || !nf.dataLimite) continue;
      const prazo = Number.isFinite(parseInt(nf.prazoRecebimento)) ? parseInt(nf.prazoRecebimento) : 30;
      const dtRec = new Date(nf.dataLimite + 'T12:00:00');
      dtRec.setDate(dtRec.getDate() + prazo);
      const diaStr = dtRec.toISOString().split('T')[0];
      if (!_nfsProjMap.has(diaStr)) _nfsProjMap.set(diaStr, []);
      _nfsProjMap.get(diaStr).push({
        nfId: nf.id, numero: nf.numero, contractId: nf.contractId,
        valor: nf.valor, dataEmissao: nf.dataLimite, prazoRecebimento: prazo
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
          totalEntradas: entradasEsperadas.reduce((s, e) => s + e.valor, 0)
        });
      }
    }

    // Contas a pagar status
    const contasPagar = { contas: await repos.contasPagar.findAll() };
    const hojeStrCP = new Date().toISOString().split('T')[0];
    const em7DiasStrCP = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })();
    const contasPagarStatus = { vencidas: 0, proximasVencer: 0, pendentes: 0, totalPendente: 0 };
    contasPagar.contas.filter(c => c.status === 'pendente').forEach(c => {
      contasPagarStatus.pendentes++;
      contasPagarStatus.totalPendente += parseFloat(c.valor) || 0;
      if (c.dataVencimento && c.dataVencimento < hojeStrCP) contasPagarStatus.vencidas++;
      else if (c.dataVencimento && c.dataVencimento <= em7DiasStrCP) contasPagarStatus.proximasVencer++;
    });

    const contasVencidasTotal = contasPagar.contas
      .filter(c => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStrCP)
      .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
    const saldoProjetado = [];
    // Recorrências virtuais (BASE items com metadata.recurrence) — ainda não materializadas
    // Idempotência: descarta ocorrências cujo (base_item_id, data) já existe no caixa
    const baseItemsRecorrentes = base.items.filter(b => b.metadata?.recurrence?.active);
    const caixaPorBaseDate = new Set(
      caixa.entries.filter(e => e.baseItemId).map(e => `${e.baseItemId}|${e.date}`)
    );
    const ocorrenciasVirtuais = []; // { data, valor, baseItemId, descricao }
    const addUnits = (d, n, freq) => {
      const x = new Date(d);
      if (freq === 'weekly')         x.setDate(x.getDate() + 7 * n);
      else if (freq === 'quarterly') x.setMonth(x.getMonth() + 3 * n);
      else if (freq === 'yearly')    x.setFullYear(x.getFullYear() + n);
      else                           x.setMonth(x.getMonth() + n);
      return x;
    };
    const hojeDt = new Date(); hojeDt.setHours(0,0,0,0);
    baseItemsRecorrentes.forEach(item => {
      const rec = item.metadata.recurrence;
      const startD = new Date(rec.startDate + 'T12:00:00');
      const endD   = rec.endDate ? new Date(rec.endDate + 'T12:00:00') : null;
      for (let i = 0; i < 1000; i++) {
        const d = addUnits(startD, i, rec.frequency || 'monthly');
        if (endD && d > endD) break;
        if (d > new Date(hojeDt.getTime() + projDays * 86400000)) break;
        if (d < hojeDt) continue;
        const ds = d.toISOString().split('T')[0];
        if (caixaPorBaseDate.has(`${item.id}|${ds}`)) continue; // já materializado
        ocorrenciasVirtuais.push({
          data: ds,
          valor: parseFloat(item.value) || 0,
          baseItemId: item.id,
          descricao: item.description || '',
        });
      }
    });

    let saldoAcumulado = caixaBalance - contasVencidasTotal;
    // Agregação: até 60 dias semanal (7), 60-90 semanal, 90+ quinzenal
    const stepAt = (i) => (projDays <= 30 ? 3 : projDays <= 60 ? 7 : 7);
    const step = stepAt(projDays);
    for (let i = 1; i <= projDays; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasDia = projecaoFutura.find(p => p.data === diaStr);
      if (entradasDia) saldoAcumulado += entradasDia.totalEntradas;
      const saidasCP = contasPagar.contas
        .filter(c => c.status === 'pendente' && c.dataVencimento === diaStr)
        .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
      if (saidasCP > 0) saldoAcumulado -= saidasCP;
      // Saídas virtuais de recorrências BASE
      const saidasVirt = ocorrenciasVirtuais
        .filter(o => o.data === diaStr)
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
  } catch (e) {
    sendError(res, 500, 'Falha ao enviar backup');
  }
}

// Backup completo COM DOWNLOAD: retorna 1 JSON consolidado de TUDO no banco.
// Pensado pra recuperação de desastre — pode importar de volta via scripts/migrate-json-to-pg.js.
async function handleBackupDownload(res) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const safe = async (fn) => { try { return await fn(); } catch { return []; } };

    const payload = {
      _meta: {
        version: APP_VERSION,
        generatedAt: new Date().toISOString(),
        format: 'rhino-backup-v1',
      },
      // Backup: opt-out do cap defensivo de findAll — precisa dump completo
      contracts:           await safe(() => repos.contracts.findAllWithChildren()),
      saidas:              await safe(() => repos.saidas.findAll({}, { limit: null })),
      caixa:               await safe(() => repos.caixa.findAll({}, { limit: null })),
      base:                await safe(() => repos.baseItems.findAll({}, { limit: null })),
      socios:              await safe(() => repos.socios.findAll({}, { limit: null })),
      investimentos:       await safe(() => repos.investimentos.findAll({}, { limit: null })),
      notas_fiscais:       await safe(() => repos.notasFiscais.findAll({}, { limit: null })),
      tipos_base:          await safe(() => repos.tiposBase.findAll({}, { limit: null })),
      clientes:            await safe(() => repos.clientes.findAll({}, { limit: null })),
      fornecedores:        await safe(() => repos.fornecedores.findAll({}, { limit: null })),
      contas_pagar:        await safe(() => repos.contasPagar.findAll({}, { limit: null })),
      niveis_acesso:       await safe(() => repos.niveisAcesso.findAll()),
      recursos:            await safe(() => repos.recursos.findAll({}, { limit: null })),
      doc_templates:       await safe(() => repos.docTemplates.findAll()),
      users:               await safe(() => (repos.users.findAll ? repos.users.findAll({}, { limit: null }) : [])),
    };

    // Remove campos sensíveis (hash de senha, tokens)
    if (Array.isArray(payload.users)) {
      payload.users = payload.users.map(u => {
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
  } catch (e) {
    result.db = 'down';
  }
  const status = result.db === 'ok' ? 200 : 503;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

// ============ Auth handlers ============
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

// ============ Auditoria ============
async function handleGetAudit(query, res) {
  try {
    const limit = Math.min(500, parseInt(query.limit) || 100);
    const offset = Math.max(0, parseInt(query.offset) || 0);
    const data = await audit.listEvents({
      user: query.user || null,
      entity: query.entity || null,
      action: query.action || null,
      from: query.from || null,
      to: query.to || null,
      limit, offset,
    });
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
  if (!sid) { sendError(res, 401, 'Não autenticado no portal'); return true; }
  const row = await db.getOne(
    `SELECT ps.cliente_id, c.nome, c.empresa, c.email
     FROM portal_sessions ps
     JOIN clientes c ON ps.cliente_id = c.id
     WHERE ps.id = $1 AND ps.expires_at > NOW()`,
    [sid]
  );
  if (!row) { sendError(res, 401, 'Sessão do portal expirada'); return true; }
  req.portalCliente = { id: row.cliente_id, nome: row.nome, empresa: row.empresa, email: row.email };
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
      return sendError(res, 429, `Muitas tentativas. Tente novamente em ${rl.retryAfterSec} segundos.`);
    }

    const cliente = await db.getOne(
      'SELECT id, nome, empresa, portal_password_hash FROM clientes WHERE LOWER(portal_email) = $1',
      [emailRaw]
    );
    if (!cliente || !cliente.portal_password_hash) return sendError(res, 401, 'Email ou senha incorretos');

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(senha, cliente.portal_password_hash);
    if (!ok) return sendError(res, 401, 'Email ou senha incorretos');

    // Sucesso — devolve slot consumido
    await pgRateLimit.refund(rlKey);

    const sid = generateId('pses');
    const expiresAt = new Date(Date.now() + PORTAL_SESSION_DAYS * 86400 * 1000);
    await db.query(
      'INSERT INTO portal_sessions (id, cliente_id, expires_at) VALUES ($1, $2, $3)',
      [sid, cliente.id, expiresAt.toISOString()]
    );
    const isProd = process.env.NODE_ENV === 'production';
    const cookieParts = [
      `${PORTAL_COOKIE}=${sid}`, 'HttpOnly', 'Path=/', 'SameSite=Strict',
      `Max-Age=${PORTAL_SESSION_DAYS * 86400}`,
    ];
    if (isProd) cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    sendJson(res, { ok: true, cliente: { id: cliente.id, nome: cliente.nome, empresa: cliente.empresa } });
  } catch (e) { sendError(res, 500, e.message); }
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

async function handlePortalDashboard(req, res) {
  try {
    const clienteId = req.portalCliente.id;
    const [allContracts, allNfs] = await Promise.all([
      repos.contracts.findAll({ clientId: clienteId }),
      repos.notasFiscais.findAll(),
    ]);

    const contratos = allContracts
      .map(c => {
        const saidas = Array.isArray(c.saidas) ? c.saidas : [];
        const totalGasto = saidas.reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
        const pct = c.value > 0 ? Math.min(100, Math.round((totalGasto / c.value) * 100)) : 0;
        const rdos = Array.isArray(c.rdos) ? c.rdos : [];
        return {
          id: c.id, name: c.name, status: c.status,
          value: c.value, currency: c.currency || 'BRL',
          startDate: c.startDate, endDate: c.endDate,
          contractNumber: c.contractNumber,
          progresso: pct,
          totalRdos: rdos.length,
          ultimoRdo: rdos.length > 0 ? rdos[rdos.length - 1]?.data : null,
        };
      });

    const contratosIds = new Set(contratos.map(c => c.id));
    const nfs = allNfs
      .filter(n => contratosIds.has(n.contractId))
      .map(n => ({ id: n.id, numero: n.numero, valor: n.valor, status: n.status, dataEmissao: n.dataEmissao, contractId: n.contractId }))
      .slice(-20);

    // Collect RDOs from the client's contracts (last 15 across all contracts, most recent first)
    const rdosAll = [];
    allContracts.forEach(c => {
        const rdos = Array.isArray(c.rdos) ? c.rdos : [];
        rdos.forEach(r => {
          const fotos = Array.isArray(r.fotos) ? r.fotos.slice(0, 4) : [];
          rdosAll.push({
            id: r.id,
            contractId: c.id,
            contractName: c.name,
            data: r.data,
            clima: r.clima,
            atividades: (r.atividades || '').slice(0, 200),
            fotos: fotos.map(f => ({ id: f.id, url: f.url || f.path, legenda: f.legenda || '' })),
          });
        });
      });
    rdosAll.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const rdos = rdosAll.slice(0, 15);

    sendJson(res, { cliente: req.portalCliente, contratos, nfs, rdos });
  } catch (e) { sendError(res, 500, e.message); }
}

// ============ RDOs (visão global) ============
async function handleGetRdosGlobal(res) {
  try {
    const [rdos, contracts, lastByContract] = await Promise.all([
      repos.rdos.findAllFlat(),
      repos.contracts.findAll(),
      repos.rdos.lastRdoDateByContract(),
    ]);

    const hojeISO = new Date().toISOString().split('T')[0];
    const ultimoDiaUtil = feriados.ultimoDiaUtilAnterior(hojeISO);

    // Obras ativas = status='ativo' (mesmo critério do dashboard).
    // Contratos com endDate no passado ainda contam se não foram concluídos manualmente —
    // isso é intencional: obra "vencida" mas aberta ainda precisa de RDO.
    const ativas = contracts.filter(c => c.status === 'ativo');

    // Sem RDO ontem: obra ativa cuja data do último RDO < último dia útil
    const obrasSemRdoOntem = ativas
      .filter(c => {
        const last = lastByContract[c.id];
        return !last || last < ultimoDiaUtil;
      })
      .map(c => ({ contractId: c.id, name: c.name, client: c.client, ultimoRdo: lastByContract[c.id] || null }));

    // Atrasada: > 2 dias úteis sem RDO ou nunca fez RDO.
    const obrasAtrasadas = ativas
      .map(c => {
        const last = lastByContract[c.id] || null;
        const nuncaFezRdo = !last;
        const diasSem = nuncaFezRdo ? null : feriados.diasUteisEntre(last, hojeISO);
        return { contractId: c.id, name: c.name, client: c.client, ultimoRdo: last, diasUteisSemRdo: diasSem, nuncaFezRdo };
      })
      .filter(c => c.nuncaFezRdo || c.diasUteisSemRdo > 2)
      .sort((a, b) => {
        const av = a.nuncaFezRdo ? Number.MAX_SAFE_INTEGER : a.diasUteisSemRdo;
        const bv = b.nuncaFezRdo ? Number.MAX_SAFE_INTEGER : b.diasUteisSemRdo;
        return bv - av;
      });

    // Aderência últimos 7 dias úteis: feitos / esperados (ativas × 7).
    const ultimos7 = feriados.ultimosNDiasUteis(7, hojeISO);
    const setUltimos7 = new Set(ultimos7);
    const ativasIds = new Set(ativas.map(c => c.id));
    let feitos = 0;
    // Contagem por dia para o gráfico
    const feitosPorDia = {};
    for (const d of ultimos7) feitosPorDia[d] = 0;
    for (const r of rdos) {
      if (!ativasIds.has(r.contractId)) continue;
      if (setUltimos7.has(r.data)) {
        feitos++;
        feitosPorDia[r.data] = (feitosPorDia[r.data] || 0) + 1;
      }
    }
    const esperados = ativas.length * ultimos7.length;
    const aderencia = esperados > 0 ? Math.round((feitos / esperados) * 100) : 100;

    // Série diária (ordenada cronologicamente) para o gráfico
    const aderenciaDiaria = ultimos7
      .slice()
      .sort()
      .map(d => ({
        data: d,
        feitos: feitosPorDia[d] || 0,
        esperados: ativas.length,
        pct: ativas.length > 0 ? Math.round((feitosPorDia[d] / ativas.length) * 100) : 100,
      }));

    // Detecta dia da semana de hoje (0=dom, 6=sáb) para banner relaxado
    const hojeDow = new Date(hojeISO + 'T12:00:00').getDay();
    const ehFimDeSemana = hojeDow === 0 || hojeDow === 6;

    // Aderência do mês corrente: RDOs feitos ÷ (obras ativas × dias úteis do mês até hoje).
    const mesInicio = hojeISO.slice(0, 7) + '-01';
    const diasUteisMes = feriados.ultimosNDiasUteis(45, hojeISO).filter(d => d >= mesInicio);
    const setMes = new Set(diasUteisMes);
    let feitosMes = 0;
    for (const r of rdos) {
      if (ativasIds.has(r.contractId) && setMes.has(r.data)) feitosMes++;
    }
    const esperadosMes = ativas.length * diasUteisMes.length;
    const aderenciaMes = esperadosMes > 0 ? Math.round((feitosMes / esperadosMes) * 100) : 100;

    sendJson(res, {
      rdos,
      stats: {
        ultimoDiaUtil,
        hoje: hojeISO,
        ehFimDeSemana,
        obrasAtivas: ativas.length,
        obrasSemRdoOntem,
        obrasAtrasadas,
        aderencia7d: aderencia,
        diasUteisAvaliados: ultimos7.length,
        aderenciaDiaria,
        aderenciaMes,
        diasUteisMes: diasUteisMes.length,
        feitosMes,
        esperadosMes,
      },
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
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser), user: sanitizeUser(created) });
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
      if (String(body.password).length < 8) return sendError(res, 400, 'Senha precisa ter no mínimo 8 caracteres');
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
    for (const t of ['contracts', 'clientes', 'recursos', 'caixa', 'notas_fiscais', 'contas_pagar', 'rdos']) {
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
async function handleGetSocios(res) {
  const data = await readCollection('socios.json', 'socios', 'socios');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostSocio(body, res) {
  try {
    if (!body.name) return sendError(res, 400, 'Nome é obrigatório');
    const socio = {
      id: generateId('soc'),
      name: body.name,
      document: body.document || '',
      email: body.email || '',
      phone: body.phone || '',
      participacao: parseFloat(body.participacao) || 0,
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('socios', 'socios', (repo) => repo.create(socio));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutSocio(id, body, res) {
  try {
    const allowed = {};
    const fields = ['name', 'document', 'email', 'phone', 'participacao', 'notes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (allowed.participacao !== undefined) allowed.participacao = parseFloat(allowed.participacao) || 0;
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('socios', 'socios', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Sócio não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteSocio(id, res) {
  try {
    const { envelope } = await writeCollection('socios', 'socios', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Investimentos handlers ============
async function handleGetInvestimentos(res) {
  const data = await readCollection('investimentos.json', 'investimentos', 'investimentos');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostInvestimento(body, res) {
  try {
    const origem  = body.origem  || 'socio';
    const destino = body.destino || 'contrato';
    const valor   = parseFloat(body.value) || 0;
    const dataDoc = body.date || new Date().toISOString().split('T')[0];

    const aporte = {
      id: generateId('ap'),
      socioId: body.socioId || null,
      value: valor,
      date: dataDoc,
      description: body.description || '',
      origem,
      destino,
      baseType: body.baseType || 'outros',
      contractId: destino === 'contrato' ? (body.contractId || null) : null,
      baseItemId: null,
      caixaEntryId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (destino === 'base') {
      const baseItem = {
        id: generateId('bas'),
        description: body.description || 'Aporte',
        type: body.baseType || 'outros',
        value: valor,
        date: dataDoc,
        allocations: '[]',
        notes: `Criado via Aporte (${origem === 'socio' ? 'sócio' : 'caixa da empresa'})`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repos.baseItems.create(baseItem);
      aporte.baseItemId = baseItem.id;
    }

    if (origem === 'caixa_empresa') {
      const destLabel = destino === 'base' ? 'BASE' : 'Contrato';
      const entry = {
        id: generateId('cxa'),
        type: 'saida',
        description: `[Aporte → ${destLabel}] ${body.description || 'Aquisição via caixa da empresa'}`,
        value: valor,
        date: dataDoc,
        contractId: aporte.contractId,
        baseItemId: aporte.baseItemId,
        category: destino === 'base' ? 'aporte_base' : 'aporte_contrato',
        notes: `Aporte via caixa da empresa - destino: ${destLabel}`,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(entry);
      aporte.caixaEntryId = entry.id;
    }

    const { envelope } = await writeCollection('investimentos', 'investimentos', (repo) => repo.create(aporte));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

/**
 * Exclui um aporte de investimento + entrada de caixa + base item órfão.
 *
 * FIX P1-3: serializa via advisory lock para evitar que dois deletes
 * concorrentes apaguem o mesmo caixaEntry duas vezes ou o baseItem em race com
 * outra operação. Não é atomic-rollback completo (repos ainda usam pool), mas
 * garante ordering. Para rollback verdadeiro, ver TODO sobre passar `client`
 * aos repos.
 *
 * @param {string} id
 * @param {import('http').ServerResponse} res
 */
async function handleDeleteInvestimento(id, res) {
  try {
    await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('investimentos:' || $1)::int)", [id]);
      const aporte = await repos.investimentos.findById(id);
      if (aporte && aporte.caixaEntryId) {
        await repos.caixa.removeById(aporte.caixaEntryId);
      }
      if (aporte && aporte.baseItemId) {
        const baseItem = await repos.baseItems.findById(aporte.baseItemId);
        if (baseItem && (!baseItem.allocations || baseItem.allocations.length === 0)) {
          await repos.baseItems.removeById(aporte.baseItemId);
        }
      }
    });
    const { envelope } = await writeCollection('investimentos', 'investimentos', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Clientes ============
async function handleGetClientes(res) {
  const data = await readCollection('clientes.json', 'clientes', 'clientes');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostCliente(body, res) {
  try {
    const cliente = {
      id: generateId('cli'),
      nome: body.nome || '',
      empresa: body.empresa || '',
      cargo: body.cargo || '',
      setor: body.setor || '',
      telefone: body.telefone || '',
      email: body.email || '',
      endereco: body.endereco || '',
      lat: body.lat || '',
      lng: body.lng || '',
      notas: body.notas || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (body.portalEmail) {
      cliente.portalEmail = body.portalEmail.trim().toLowerCase();
      if (body.portalSenha) {
        const bcrypt = require('bcryptjs');
        cliente.portalPasswordHash = await bcrypt.hash(body.portalSenha, 10);
      }
    }
    const { envelope } = await writeCollection('clientes', 'clientes', (repo) => repo.create(cliente));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutCliente(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'empresa', 'cargo', 'setor', 'telefone', 'email', 'endereco', 'notas', 'lat', 'lng'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.portalEmail !== undefined) {
      allowed.portalEmail = body.portalEmail ? body.portalEmail.trim().toLowerCase() : null;
    }
    if (body.portalSenha) {
      const bcrypt = require('bcryptjs');
      allowed.portalPasswordHash = await bcrypt.hash(body.portalSenha, 10);
    }
    if (body.removerPortalAcesso) {
      allowed.portalEmail = null;
      allowed.portalPasswordHash = null;
    }
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('clientes', 'clientes', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Cliente não encontrado');

    // Propaga endereço/lat/lng para contratos vinculados que ainda não tenham coordenadas.
    // Garante que, ao preencher o endereço do cliente após a criação, os contratos
    // antigos passem a aparecer no Mapa de Obras sem precisar editá-los um a um.
    const isEmpty = (v) => v === undefined || v === null || v === '';
    if (!isEmpty(result.lat) && !isEmpty(result.lng)) {
      try {
        const vinculados = await repos.contracts.findAll({ clientId: id });
        for (const ct of vinculados) {
          if (isEmpty(ct.lat) || isEmpty(ct.lng)) {
            await repos.contracts.updateById(ct.id, {
              lat: result.lat,
              lng: result.lng,
              endereco: isEmpty(ct.endereco) ? (result.endereco || '') : ct.endereco,
            });
          }
        }
      } catch (syncErr) {
        console.error('[clientes] falha ao propagar endereço para contratos:', syncErr.message);
      }
    }

    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteCliente(id, res) {
  try {
    const { envelope } = await writeCollection('clientes', 'clientes', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

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
        body.clienteNome      = body.clienteNome      || cli.nome || null;
        body.clienteEmpresa   = body.clienteEmpresa   || cli.empresa || cli.nome || null;
        body.clienteContato   = body.clienteContato   || cli.nome || null;
        body.clienteCargo     = body.clienteCargo     || cli.cargo || null;
        body.clienteEmail     = body.clienteEmail     || cli.email || null;
        body.clienteTelefone  = body.clienteTelefone  || cli.telefone || null;
        body.clienteEndereco  = body.clienteEndereco  || cli.endereco || null;
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
      'tipo','clienteId','clienteNome','clienteEmpresa','clienteContato','clienteCargo',
      'clienteEmail','clienteTelefone','clienteDocumento','clienteEndereco',
      'referencia','titulo','objetivo','saudacao',
      'condicoesPagamento','prazoExecucao','observacoes',
      'signatario','signatarioCargo','status',
    ];
    for (const f of camelFields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    // Campos numéricos
    if (body.valorTotal !== undefined) allowed.valorTotal = parseFloat(body.valorTotal) || 0;
    if (body.validadeDias !== undefined) allowed.validadeDias = parseInt(body.validadeDias, 10) || 15;
    if (body.garantiaMeses !== undefined) {
      allowed.garantiaMeses = body.garantiaMeses === null || body.garantiaMeses === ''
        ? null : parseInt(body.garantiaMeses, 10);
    }
    // JSONB
    for (const f of ['escopo','obrigacoesContratada','obrigacoesContratante','cronograma','investimentoHh','investimentoMat','metadata']) {
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
      valor: parseFloat(body.valor) || 0,
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
    if (body.categoria !== undefined)  allowed.categoria = body.categoria;
    if (body.descricao !== undefined)  allowed.descricao = body.descricao;
    if (body.valor !== undefined)      allowed.valor = parseFloat(body.valor) || 0;
    if (body.percentual !== undefined) allowed.percentual = body.percentual === null || body.percentual === '' ? null : parseFloat(body.percentual);
    if (body.ordem !== undefined)      allowed.ordem = parseInt(body.ordem, 10) || 0;
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

// ============ Anexos de Proposta (PDFs + Imagens) ============
const PROPOSTA_ANEXO_MAX_BYTES = 8 * 1024 * 1024; // 8 MB por arquivo
const PROPOSTA_IMG_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const PROPOSTA_PDF_MIME  = 'application/pdf';

function handleUploadPropostaAnexo(propostaId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = PROPOSTA_ANEXO_MAX_BYTES + 64 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      sendError(res, 413, `Arquivo muito grande (limite ${PROPOSTA_ANEXO_MAX_BYTES/1024/1024} MB)`);
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', async () => {
    try {
      const proposta = await repos.propostas.findById(propostaId);
      if (!proposta) return sendError(res, 404, 'Proposta não encontrada');

      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const tipoPart  = parts.find(p => p.name === 'tipo');
      const secaoPart = parts.find(p => p.name === 'secao');
      const filePart  = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!filePart) return sendError(res, 400, 'Nenhum arquivo enviado');

      const tipo = (tipoPart && tipoPart.data.toString('utf8')) || (filePart.contentType?.startsWith('image/') ? 'imagem' : 'pdf');
      const secao = (secaoPart && secaoPart.data.toString('utf8')) || (tipo === 'imagem' ? 'escopo' : 'anexo_final');

      // Valida tipo
      if (tipo === 'imagem') {
        if (!filePart.contentType || !PROPOSTA_IMG_MIMES.includes(filePart.contentType))
          return sendError(res, 400, 'Imagem precisa ser JPEG, PNG ou WebP');
        if (!_isAllowedImageMagic(filePart.data))
          return sendError(res, 400, 'Conteúdo do arquivo não bate com o tipo declarado');
      } else if (tipo === 'pdf') {
        if (filePart.contentType !== PROPOSTA_PDF_MIME)
          return sendError(res, 400, 'Anexo precisa ser PDF');
        // PDF magic: %PDF-
        if (!(filePart.data[0] === 0x25 && filePart.data[1] === 0x50 && filePart.data[2] === 0x44 && filePart.data[3] === 0x46))
          return sendError(res, 400, 'Arquivo não é um PDF válido');
      } else {
        return sendError(res, 400, 'Tipo inválido (use "imagem" ou "pdf")');
      }

      const anexoId = generateId('anx');
      await repos.propostaAnexos.create({
        id: anexoId,
        propostaId,
        tipo,
        nome: filePart.filename,
        dataBuffer: filePart.data,
        mimeType: filePart.contentType,
        sizeBytes: filePart.data.length,
        secao,
        ordem: 0,
      });

      const propostaAtualizada = await repos.propostas.findByIdWithChildren(propostaId);
      sendJson(res, { proposta: propostaAtualizada, anexoId });
    } catch (e) {
      console.error('[propostas/anexos] erro upload:', e);
      sendError(res, 400, e.message);
    }
  });
}

async function handleGetPropostaAnexo(propostaId, anexoId, res) {
  try {
    const a = await repos.propostaAnexos.findByIdWithData(anexoId);
    if (!a || a.propostaId !== propostaId) return sendError(res, 404, 'Anexo não encontrado');
    res.writeHead(200, {
      'Content-Type': a.mimeType || 'application/octet-stream',
      'Content-Length': a.data.length,
      'Content-Disposition': `inline; filename="${a.nome.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(a.data);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePutPropostaAnexo(propostaId, anexoId, body, res) {
  try {
    const allowed = {};
    if (body.legenda !== undefined) allowed.legenda = body.legenda;
    if (body.ordem !== undefined)   allowed.ordem = parseInt(body.ordem, 10) || 0;
    if (body.secao !== undefined)   allowed.secao = body.secao;
    await repos.propostaAnexos.updateById(anexoId, allowed);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeletePropostaAnexo(propostaId, anexoId, res) {
  try {
    await repos.propostaAnexos.removeById(anexoId);
    const proposta = await repos.propostas.findByIdWithChildren(propostaId);
    sendJson(res, { proposta });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Geração de DOCX/PDF/Preview de proposta ============
async function _loadPropostaComAnexosBinarios(propostaId) {
  const proposta = await repos.propostas.findByIdWithChildren(propostaId);
  if (!proposta) return null;
  // Carrega `data` BYTEA de TODOS os anexos: imagens (embed inline) e PDFs
  // (concatenação na sequência via pdf-lib). Sem isso, o concatenador filtra
  // por `a.data` e pula os PDFs anexos.
  const anexosMeta = proposta.anexos || [];
  const anexosComData = await Promise.all(anexosMeta.map(async (a) => {
    const full = await repos.propostaAnexos.findByIdWithData(a.id);
    return full || a;
  }));
  // Apresentação global + logos de cases (centralizado, não duplicado por proposta)
  let apresentacao = {};
  let caseLogos = [];
  try {
    apresentacao = (await repos.appSettings.get('proposta_apresentacao')) || {};
    const logosMeta = await repos.caseLogos.listMetadata({ ativo: true });
    // Carrega binário de cada logo para embed em PDF/DOCX
    caseLogos = await Promise.all(logosMeta.map(async (lg) => {
      const full = await repos.caseLogos.findByIdWithData(lg.id);
      return full || lg;
    }));
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
      return sendError(res, 500, 'Lib `puppeteer` não instalada. Rode `npm install puppeteer` no servidor.');
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
  } catch (e) { sendError(res, 500, e.message); }
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
  } catch (e) { sendError(res, 500, e.message); }
}

// ============ Cláusulas (biblioteca reusável) ============
async function handleGetClausulas(res, query) {
  try {
    const filtros = {
      categoria: query?.categoria || undefined,
      termo: query?.termo || undefined,
      ativa: query?.ativa === '0' || query?.ativa === 'false' ? false :
             query?.ativa === '1' || query?.ativa === 'true' ? true : undefined,
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
    for (const f of ['titulo','texto','categoria','ativa']) {
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
    const value = await repos.appSettings.get('proposta_apresentacao') || {};
    sendJson(res, { apresentacao: value });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePutApresentacao(body, res) {
  try {
    const allowed = {};
    for (const k of ['apresentacao', 'casesSucesso', 'segurancaSaude']) {
      if (body[k] !== undefined) allowed[k] = String(body[k] || '');
    }
    const novo = await repos.appSettings.patch('proposta_apresentacao', allowed);
    sendJson(res, { apresentacao: novo });
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Case Logos ============
const CASE_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const CASE_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

async function handleGetCaseLogos(res) {
  try {
    const logos = await repos.caseLogos.listMetadata();
    sendJson(res, { logos });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handleGetCaseLogoImage(id, res) {
  try {
    const lg = await repos.caseLogos.findByIdWithData(id);
    if (!lg) return sendError(res, 404, 'Logo não encontrada');
    res.writeHead(200, {
      'Content-Type': lg.mimeType || 'image/png',
      'Content-Length': lg.data.length,
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(lg.data);
  } catch (e) { sendError(res, 500, e.message); }
}

function handleUploadCaseLogo(req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');
  const chunks = [];
  let total = 0;
  req.on('data', c => {
    total += c.length;
    if (total > CASE_LOGO_MAX_BYTES + 64 * 1024) {
      sendError(res, 413, `Logo muito grande (limite ${CASE_LOGO_MAX_BYTES / 1024 / 1024} MB)`);
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);
      const nomePart = parts.find(p => p.name === 'nome');
      const clienteIdPart = parts.find(p => p.name === 'clienteId');
      const ordemPart = parts.find(p => p.name === 'ordem');
      const filePart = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!filePart) return sendError(res, 400, 'Nenhuma imagem enviada');
      if (!filePart.contentType || !CASE_LOGO_MIMES.includes(filePart.contentType))
        return sendError(res, 400, 'Imagem precisa ser JPEG, PNG ou WebP');
      if (!_isAllowedImageMagic(filePart.data))
        return sendError(res, 400, 'Conteúdo do arquivo não bate com o tipo declarado');
      const nome = (nomePart ? nomePart.data.toString('utf8') : '') || filePart.filename.replace(/\.[^.]+$/, '');
      const clienteId = clienteIdPart ? clienteIdPart.data.toString('utf8').trim() || null : null;
      const ordem = ordemPart ? (parseInt(ordemPart.data.toString('utf8'), 10) || 0) : 0;
      await repos.caseLogos.create({
        id: generateId('clg'),
        nome,
        clienteId,
        dataBuffer: filePart.data,
        mimeType: filePart.contentType,
        sizeBytes: filePart.data.length,
        ordem,
        ativo: true,
      });
      const logos = await repos.caseLogos.listMetadata();
      sendJson(res, { logos });
    } catch (e) {
      console.error('[case-logos] upload erro:', e);
      sendError(res, 400, e.message);
    }
  });
}

async function handlePutCaseLogo(id, body, res) {
  try {
    const allowed = {};
    for (const f of ['nome', 'clienteId', 'ordem', 'ativo']) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    await repos.caseLogos.updateById(id, allowed);
    sendJson(res, { logos: await repos.caseLogos.listMetadata() });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteCaseLogo(id, res) {
  try {
    await repos.caseLogos.removeById(id);
    sendJson(res, { logos: await repos.caseLogos.listMetadata() });
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Fornecedores ============
async function handleGetFornecedores(res) {
  const data = await readCollection('fornecedores.json', 'fornecedores', 'fornecedores');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function normalizeMateriais(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

async function handlePostFornecedor(body, res) {
  try {
    const fornecedor = {
      id: generateId('for'),
      nome: body.nome || '',
      cnpj: body.cnpj || '',
      endereco: body.endereco || '',
      telefone: body.telefone || '',
      email: body.email || '',
      pessoaContato: body.pessoaContato || '',
      materiais: JSON.stringify(normalizeMateriais(body.materiais)),
      banco: body.banco || '',
      agencia: body.agencia || '',
      conta: body.conta || '',
      chavePix: body.chavePix || '',
      notas: body.notas || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('fornecedores', 'fornecedores', (repo) => repo.create(fornecedor));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutFornecedor(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'cnpj', 'endereco', 'telefone', 'email', 'pessoaContato', 'banco', 'agencia', 'conta', 'chavePix', 'notas'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.materiais !== undefined) allowed.materiais = JSON.stringify(normalizeMateriais(body.materiais));
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('fornecedores', 'fornecedores', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Fornecedor não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteFornecedor(id, res) {
  try {
    const { envelope } = await writeCollection('fornecedores', 'fornecedores', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Tipos BASE (custos administrativos customizáveis) ============
async function handleGetTiposBase(res) {
  const data = await readCollection('tipos_base.json', 'tiposBase', 'tipos');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function slugify(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || ('tipo_' + Date.now().toString(36));
}

async function handlePostTipoBase(body, res) {
  try {
    const label = (body.label || '').trim();
    if (!label) return sendError(res, 400, 'Nome do tipo é obrigatório');

    const baseKey = slugify(body.key || label);
    // Garantir chave única (consulta os já existentes)
    const existentes = (await repos.tiposBase.findAll()).map(t => t.key);
    let k = baseKey, n = 2;
    while (existentes.includes(k)) { k = `${baseKey}_${n++}`; }

    const tipo = {
      id: generateId('tpb'),
      key: k,
      label,
      icon: body.icon || '🔹',
      cor: body.cor || '#718096',
      sistema: false,
    };
    const { envelope } = await writeCollection('tiposBase', 'tipos', (repo) => repo.create(tipo));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutTipoBase(id, body, res) {
  try {
    const current = await repos.tiposBase.findById(id);
    if (!current) return sendError(res, 404, 'Tipo não encontrado');

    const allowed = {};
    if (body.label) allowed.label = body.label.trim();
    if (body.icon)  allowed.icon  = body.icon;
    if (body.cor)   allowed.cor   = body.cor;
    if (!current.sistema && body.key) allowed.key = slugify(body.key);

    const { envelope } = await writeCollection('tiposBase', 'tipos', (repo) => repo.updateById(id, allowed));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteTipoBase(id, res) {
  try {
    const tipo = await repos.tiposBase.findById(id);
    if (!tipo) return sendError(res, 404, 'Tipo não encontrado');
    if (tipo.sistema) return sendError(res, 400, 'Não é possível excluir tipos do sistema');

    // Verificar se está em uso (base_items ainda lê do JSON enquanto não migramos)
    const baseItems = await repos.baseItems.findAll();
    if (baseItems.some(b => b.type === tipo.key)) {
      return sendError(res, 400, 'Tipo em uso por itens da BASE. Remova ou reclassifique os itens antes de excluir.');
    }
    const { envelope } = await writeCollection('tiposBase', 'tipos', (repo) => repo.removeById(id));
    sendJson(res, envelope);
    return;
  } catch (e) {
    return sendError(res, 400, e.message);
  }
}

// ============ Contas a Pagar handlers ============
async function handleGetContasPagar(res) {
  const data = await readCollection('contas_pagar.json', 'contasPagar', 'contas');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostContaPagar(body, res) {
  try {
    const p = validateBody(schemas.contaPagarPost, body);
    const conta = {
      id: generateId('cp'),
      descricao: p.descricao,
      fornecedorId: p.fornecedorId,
      numeroNF: p.numeroNF,
      valor: p.valor,
      dataEmissao: p.dataEmissao,
      dataVencimento: p.dataVencimento,
      status: 'pendente',
      dataPagamento: null,
      caixaEntryId: null,
      contractId: p.contractId,
      category: p.category,
      observacoes: p.observacoes,
      recorrente: p.recorrente,
      periodicidade: p.periodicidade,
      recorrenciaOrigemId: p.recorrenciaOrigemId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('contasPagar', 'contas', (repo) => repo.create(conta));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutContaPagar(id, body, res) {
  try {
    const allowed = {};
    const fields = ['descricao', 'fornecedorId', 'numeroNF', 'contractId', 'category', 'observacoes', 'periodicidade'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valor !== undefined) allowed.valor = parseFloat(body.valor) || 0;
    if (body.dataEmissao !== undefined) allowed.dataEmissao = body.dataEmissao || null;
    if (body.dataVencimento !== undefined) allowed.dataVencimento = body.dataVencimento || null;
    if (body.recorrente !== undefined) allowed.recorrente = !!body.recorrente;
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('contasPagar', 'contas', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Conta não encontrada');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteContaPagar(id, res) {
  try {
    const conta = await repos.contasPagar.findById(id);
    if (!conta) return sendError(res, 404, 'Conta não encontrada');
    // Remove caixa entry vinculada (se houver)
    if (conta.caixaEntryId) {
      await repos.caixa.removeById(conta.caixaEntryId);
    }
    const { envelope } = await writeCollection('contasPagar', 'contas', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

/**
 * Paga uma conta a pagar: cria entrada de caixa e atualiza status para 'pago'.
 *
 * FIX P1-3: serializa via advisory lock por conta — evita que dois pagamentos
 * simultâneos criem duas entradas de caixa duplicadas.
 *
 * @param {string} id
 * @param {{ dataPagamento?: string, valorPago?: number|string, formaPagamento?: string }} body
 * @param {import('http').ServerResponse} res
 */
async function handlePagarConta(id, body, res) {
  try {
    const envelope = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('conta:' || $1)::int)", [id]);
      const conta = await repos.contasPagar.findById(id);
      if (!conta) { const err = new Error('Conta não encontrada'); err.statusCode = 404; throw err; }
      if (conta.status === 'pago') { const err = new Error('Conta já foi paga'); err.statusCode = 400; throw err; }

      const dataPagamento = body.dataPagamento || new Date().toISOString().split('T')[0];
      const valorPago = parseFloat(body.valorPago) || parseFloat(conta.valor) || 0;
      const caixaEntry = {
        id: generateId('cxa'),
        type: 'saida',
        description: conta.descricao + (conta.numeroNF ? ` — NF ${conta.numeroNF}` : '') + (body.formaPagamento ? ` [${body.formaPagamento}]` : ''),
        value: valorPago,
        date: dataPagamento,
        contractId: conta.contractId || null,
        baseItemId: null,
        category: conta.category || 'fornecedor',
        notes: `Pagamento de conta: ${conta.descricao}`,
        formaPagamento: body.formaPagamento || null,
        contaPagarId: conta.id,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      const { envelope } = await writeCollection('contasPagar', 'contas', (repo) =>
        repo.updateById(id, {
          status: 'pago',
          dataPagamento,
          valorPago,
          formaPagamento: body.formaPagamento || null,
          caixaEntryId: caixaEntry.id,
          updatedAt: new Date().toISOString(),
        })
      );
      // Conta originada da Folha de Pagamento — marca a parcela como paga lá também.
      if (conta.folhaPagamentoId && (conta.folhaParcela === 'vale' || conta.folhaParcela === 'saldo')) {
        const fPatch = conta.folhaParcela === 'vale'
          ? { valePago: true, valeDataPagamento: dataPagamento, valeCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() }
          : { saldoPago: true, saldoDataPagamento: dataPagamento, saldoCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() };
        await repos.folhaPagamento.updateById(conta.folhaPagamentoId, fPatch).catch(() => {});
      }
      return envelope;
    });
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

async function handleEstornarConta(id, res) {
  try {
    const conta = await repos.contasPagar.findById(id);
    if (!conta) return sendError(res, 404, 'Conta não encontrada');
    if (conta.caixaEntryId) {
      await repos.caixa.removeById(conta.caixaEntryId);
    }
    const { envelope } = await writeCollection('contasPagar', 'contas', (repo) =>
      repo.updateById(id, {
        status: 'pendente',
        dataPagamento: null,
        valorPago: null,
        caixaEntryId: null,
        updatedAt: new Date().toISOString(),
      })
    );
    // Conta originada da Folha de Pagamento — estorna a parcela lá também.
    if (conta.folhaPagamentoId && (conta.folhaParcela === 'vale' || conta.folhaParcela === 'saldo')) {
      const fPatch = conta.folhaParcela === 'vale'
        ? { valePago: false, valeDataPagamento: null, valeCaixaEntryId: null, updatedAt: new Date().toISOString() }
        : { saldoPago: false, saldoDataPagamento: null, saldoCaixaEntryId: null, updatedAt: new Date().toISOString() };
      await repos.folhaPagamento.updateById(conta.folhaPagamentoId, fPatch).catch(() => {});
    }
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Folha de Pagamento handlers ============
const VALE_PCT = 0.40; // adiantamento (vale) = 40% do salário

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
  const set = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);
  const sexta = dataPascoa(ano);
  sexta.setDate(sexta.getDate() - 2); // Sexta-feira Santa = Páscoa − 2 dias
  set.add(String(sexta.getMonth() + 1).padStart(2, '0') + '-' + String(sexta.getDate()).padStart(2, '0'));
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
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (d.getDay() !== 0 && !feriados.has(mmdd)) { // domingo (0) e feriados não contam
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
  let inss = Math.min(s, 1621.00) * 0.075;
  if (s > 1621.00) inss += (Math.min(s, 2902.84) - 1621.00) * 0.09;
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
    const funcs = recursos.filter(r => r.status === 'funcionario' && parseFloat(r.salario) > 0);
    const jaTem = new Set((await repos.folhaPagamento.findByCompetencia(competencia)).map(f => f.recursoId));

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
      const itens = await repos.folhaPagamentoItens.findByFolhaIds(folha.map(f => f.id));
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
  let proventos = 0, descontos = 0;
  for (const it of itens) {
    const v = parseFloat(it.valor) || 0;
    if (it.tipo === 'provento') proventos += v;
    else if (it.tipo === 'desconto') descontos += v;
  }
  const saldoBase = (parseFloat(f.salarioBase) || 0) - (parseFloat(f.valorVale) || 0);
  const novoSaldo = Math.round((saldoBase + proventos - descontos) * 100) / 100;
  const atualizada = await repos.folhaPagamento.updateById(folhaId, {
    valorSaldo: novoSaldo,
    updatedAt: new Date().toISOString(),
  });
  // Mantém a conta a pagar do Saldo coerente com o novo valor.
  if (f.saldoContaPagarId) {
    await repos.contasPagar.updateById(f.saldoContaPagarId, {
      valor: novoSaldo,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
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
    const valor = Math.round((parseFloat(body && body.valor) || 0) * 100) / 100;
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');

    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) { const e = new Error('Registro de folha não encontrado'); e.statusCode = 404; throw e; }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de lançar descontos/proventos');
        e.statusCode = 400; throw e;
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
      if (!f) { const e = new Error('Registro de folha não encontrado'); e.statusCode = 404; throw e; }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400; throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado'); e.statusCode = 404; throw e;
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
    const valor = Math.round((parseFloat(body && body.valor) || 0) * 100) / 100;
    if (!(valor > 0)) return sendError(res, 400, 'O valor deve ser maior que zero');
    const folha = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('folha:' || $1)::int)", [id]);
      const f = await repos.folhaPagamento.findById(id);
      if (!f) { const e = new Error('Registro de folha não encontrado'); e.statusCode = 404; throw e; }
      if (f.saldoPago) {
        const e = new Error('Saldo já pago — estorne o saldo antes de alterar os lançamentos');
        e.statusCode = 400; throw e;
      }
      const item = await repos.folhaPagamentoItens.findById(itemId);
      if (!item || item.folhaPagamentoId !== id) {
        const e = new Error('Lançamento não encontrado'); e.statusCode = 404; throw e;
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
      if (!f) { const e = new Error('Registro de folha não encontrado'); e.statusCode = 404; throw e; }
      if (parcela === 'vale' && f.valePago)   { const e = new Error('Vale já foi pago');  e.statusCode = 400; throw e; }
      if (parcela === 'saldo' && f.saldoPago) { const e = new Error('Saldo já foi pago'); e.statusCode = 400; throw e; }
      const valor = parcela === 'vale' ? parseFloat(f.valorVale) : parseFloat(f.valorSaldo);
      if (!(valor > 0)) { const e = new Error('Esta parcela não tem valor a pagar'); e.statusCode = 400; throw e; }

      const dataPagamento = (body && body.dataPagamento) || new Date().toISOString().split('T')[0];
      const label = parcela === 'vale' ? 'Vale' : 'Saldo';
      const caixaEntry = {
        id: generateId('cxa'),
        type: 'saida',
        description: `${label} salário ${f.recursoNome} — ${f.competencia}` +
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
      const patch = parcela === 'vale'
        ? { valePago: true, valeDataPagamento: dataPagamento, valeCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() }
        : { saldoPago: true, saldoDataPagamento: dataPagamento, saldoCaixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() };
      const atualizada = await repos.folhaPagamento.updateById(id, patch);
      // Sincroniza a conta a pagar vinculada — paga junto, mesmo lançamento de caixa.
      const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
      if (contaId) {
        await repos.contasPagar.updateById(contaId, {
          status: 'pago', dataPagamento, valorPago: valor, caixaEntryId: caixaEntry.id,
          formaPagamento: (body && body.formaPagamento) || null, updatedAt: new Date().toISOString(),
        }).catch(() => {});
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
    const f = await repos.folhaPagamento.findById(id);
    if (!f) return sendError(res, 404, 'Registro de folha não encontrado');
    const caixaEntryId = parcela === 'vale' ? f.valeCaixaEntryId : f.saldoCaixaEntryId;
    if (caixaEntryId) await repos.caixa.removeById(caixaEntryId);
    const patch = parcela === 'vale'
      ? { valePago: false, valeDataPagamento: null, valeCaixaEntryId: null, updatedAt: new Date().toISOString() }
      : { saldoPago: false, saldoDataPagamento: null, saldoCaixaEntryId: null, updatedAt: new Date().toISOString() };
    const folha = await repos.folhaPagamento.updateById(id, patch);
    // Sincroniza a conta a pagar vinculada — volta a pendente.
    const contaId = parcela === 'vale' ? f.valeContaPagarId : f.saldoContaPagarId;
    if (contaId) {
      await repos.contasPagar.updateById(contaId, {
        status: 'pendente', dataPagamento: null, valorPago: null, caixaEntryId: null,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    sendJson(res, { folha });
  } catch (e) {
    sendError(res, 400, e.message);
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
    let removidas = 0, mantidas = 0;
    for (const f of folha) {
      if (f.valePago || f.saldoPago) { mantidas++; continue; } // tem pagamento — preserva
      // Contas a pagar vinculadas (ainda pendentes) — removidas junto.
      for (const cpId of [f.valeContaPagarId, f.saldoContaPagarId]) {
        if (cpId) await repos.contasPagar.removeById(cpId).catch(() => {});
      }
      // Ordem: folha_pagamento antes do base_item (FK base_item_id).
      await repos.folhaPagamento.removeById(f.id);
      if (f.baseItemId) await repos.baseItems.removeById(f.baseItemId).catch(() => {});
      removidas++;
    }
    const restante = await repos.folhaPagamento.findByCompetencia(competencia);
    sendJson(res, { competencia, removidas, mantidas, folha: restante });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Notas Fiscais handlers ============
async function handleGetNotasFiscais(res) {
  const data = await readCollection('notas_fiscais.json', 'notasFiscais', 'notas_fiscais');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostNotaFiscal(body, res) {
  try {
    const p = validateBody(schemas.notaFiscalPost, body);
    const nf = {
      id: generateId('nf'),
      numero: p.numero,
      contractId: p.contractId,
      dataLimite: p.dataLimite,
      valor: p.valor,
      prazoRecebimento: p.prazoRecebimento,
      observacoes: p.observacoes,
      emitida: false,
      dataEmissaoReal: null,
      caixaEntryId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('notasFiscais', 'notas_fiscais', (repo) => repo.create(nf));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutNotaFiscal(id, body, res) {
  try {
    const existing = await repos.notasFiscais.findById(id);
    if (!existing) return sendError(res, 404, 'Nota fiscal not found');

    const allowed = { ...validateBody(schemas.notaFiscalPut, body) };
    allowed.updatedAt = new Date().toISOString();

    const updated = { ...existing, ...allowed };

    // Sincroniza caixa entry quando data/prazo mudam para NF emitida
    if (existing.emitida && existing.caixaEntryId) {
      const newDataEmissao = (allowed.dataEmissaoReal !== undefined ? allowed.dataEmissaoReal : existing.dataEmissaoReal);
      const newPrazo = (allowed.prazoRecebimento !== undefined ? allowed.prazoRecebimento : existing.prazoRecebimento);
      if (newDataEmissao) {
        const dtRecebimento = new Date(newDataEmissao + 'T12:00:00');
        dtRecebimento.setDate(dtRecebimento.getDate() + newPrazo);
        const dataRecebimento = dtRecebimento.toISOString().split('T')[0];
        await repos.caixa.updateById(existing.caixaEntryId, {
          value: updated.valor,
          date: dataRecebimento,
          notes: `NF ${updated.numero} emitida em ${newDataEmissao}, prazo ${newPrazo} dias`,
        });
      }
    }

    const { envelope } = await writeCollection('notasFiscais', 'notas_fiscais', (repo) => repo.updateById(id, allowed));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteNotaFiscal(id, res) {
  try {
    const nf = await repos.notasFiscais.findById(id);
    if (nf && nf.caixaEntryId) {
      await repos.caixa.removeById(nf.caixaEntryId);
    }
    const { envelope } = await writeCollection('notasFiscais', 'notas_fiscais', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

/**
 * Marca NF como emitida e cria entrada agendada no caixa.
 *
 * FIX P1-3: lock advisory por NF — evita duas emissões concorrentes criarem
 * dois caixaEntries duplicados.
 *
 * @param {string} id
 * @param {{ dataEmissaoReal?: string }} body
 * @param {import('http').ServerResponse} res
 */
async function handleEmitirNotaFiscal(id, body, res) {
  try {
    const result = await db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('nf:' || $1)::int)", [id]);
      const nf = await repos.notasFiscais.findById(id);
      if (!nf) { const err = new Error('Nota fiscal não encontrada'); err.statusCode = 404; throw err; }
      if (nf.emitida) { const err = new Error('Nota fiscal já foi emitida'); err.statusCode = 400; throw err; }

      const dataEmissaoReal = body.dataEmissaoReal || new Date().toISOString().split('T')[0];
      const prazo = Number.isFinite(parseInt(nf.prazoRecebimento)) ? parseInt(nf.prazoRecebimento) : 30;
      const dtRecebimento = new Date(dataEmissaoReal + 'T12:00:00');
      dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
      const dataRecebimento = dtRecebimento.toISOString().split('T')[0];

      const contract = nf.contractId ? await repos.contracts.findById(nf.contractId) : null;
      const descricao = `Recebimento NF ${nf.numero}${contract ? ` - ${contract.client}` : ''}`;

      const caixaEntry = {
        id: generateId('cxa'),
        type: 'entrada',
        description: descricao,
        value: parseFloat(nf.valor) || 0,
        date: dataRecebimento,
        contractId: nf.contractId,
        baseItemId: null,
        category: 'nota_fiscal',
        notes: `NF ${nf.numero} emitida em ${dataEmissaoReal}, prazo ${prazo} dias`,
        nfId: nf.id,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      await repos.notasFiscais.updateById(id, {
        emitida: true,
        dataEmissaoReal,
        caixaEntryId: caixaEntry.id,
        updatedAt: new Date().toISOString(),
      });
      return { dataRecebimento, valor: nf.valor };
    });

    sendJson(res, {
      notas_fiscais: await repos.notasFiscais.findAll(),
      caixa: { entries: await repos.caixa.findAll() },
      mensagem: `NF marcada como emitida. Entrada de ${result.valor} agendada para ${result.dataRecebimento}`,
    });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// Desfaz emissão: remove entrada do caixa e volta status
async function handleCancelarEmissao(id, res) {
  try {
    const nf = await repos.notasFiscais.findById(id);
    if (!nf) return sendError(res, 404, 'Nota fiscal não encontrada');
    if (nf.caixaEntryId) {
      await repos.caixa.removeById(nf.caixaEntryId);
    }
    await repos.notasFiscais.updateById(id, {
      emitida: false,
      dataEmissaoReal: null,
      caixaEntryId: null,
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { notas_fiscais: await repos.notasFiscais.findAll() });
    return;
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Orçamento (Budget) handlers ============
async function handlePostBudgetItem(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const novoValor = parseFloat(body.value) || 0;
    const budget = contract.budget || [];
    const totalAtual = budget.reduce((s, b) => s + (parseFloat(b.value) || 0), 0);
    if (contract.value > 0 && totalAtual + novoValor > parseFloat(contract.value) + 0.01) {
      return sendError(res, 400,
        `Orçamento ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - totalAtual).toFixed(2).replace('.', ',')}`);
    }
    const item = {
      id: generateId('bud'),
      contractId,
      description: body.description || '',
      type: body.type || 'outros',
      value: novoValor,
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
    };
    await repos.contracts.addBudgetItem(contractId, item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutBudgetItem(contractId, itemId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const budget = contract.budget || [];
    const idx = budget.findIndex(b => b.id === itemId);
    if (idx === -1) return sendError(res, 404, 'Item não encontrado');

    const patch = { ...body };
    if (patch.value !== undefined) patch.value = parseFloat(patch.value) || 0;
    if (patch.value !== undefined && contract.value > 0) {
      const outros = budget.reduce((s, b, i) => i === idx ? s : s + (parseFloat(b.value) || 0), 0);
      if (outros + patch.value > parseFloat(contract.value) + 0.01) {
        return sendError(res, 400,
          `Orçamento ultrapassa o valor do contrato. Disponível: R$ ${(parseFloat(contract.value) - outros).toFixed(2).replace('.', ',')}`);
      }
    }
    await repos.contracts.updateBudgetItem(contractId, itemId, patch);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteBudgetItem(contractId, itemId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    await repos.contracts.removeBudgetItem(contractId, itemId);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Organograma (Equipe por Contrato) handlers ============
const NIVEIS_VALIDOS = ['encarregado', 'lider_area', 'profissional'];

function validarMembroOrganograma(body, organograma, membroIdAtual) {
  const nivel = body.nivel;
  if (!NIVEIS_VALIDOS.includes(nivel)) {
    return 'Nível inválido';
  }
  if (!body.recursoId) return 'Recurso obrigatório';

  // recurso duplicado no mesmo contrato
  const jaExiste = organograma.some(m =>
    m.recursoId === body.recursoId && m.id !== membroIdAtual
  );
  if (jaExiste) return 'Este recurso já faz parte do organograma deste contrato';

  if (nivel === 'encarregado') {
    const outroEnc = organograma.some(m =>
      m.nivel === 'encarregado' && m.id !== membroIdAtual
    );
    if (outroEnc) return 'Já existe um encarregado neste contrato';
  }

  if (nivel === 'lider_area') {
    if (!body.area || !String(body.area).trim()) return 'Área é obrigatória para líder';
  }

  if (nivel === 'profissional') {
    if (!body.supervisorId) return 'Profissional precisa ter um supervisor';
    const sup = organograma.find(m => m.id === body.supervisorId);
    if (!sup) return 'Supervisor não encontrado';
    if (sup.nivel !== 'lider_area') return 'Supervisor de profissional deve ser Líder de Área';
  }

  return null;
}

async function handlePostMembroOrganograma(contractId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const erro = validarMembroOrganograma(body, contract.organograma || [], null);
    if (erro) return sendError(res, 400, erro);

    const membro = {
      id: generateId('org'),
      contractId,
      recursoId: body.recursoId,
      nivel: body.nivel,
      cargo: body.cargo,
      supervisorId: body.nivel === 'encarregado' ? null : (body.supervisorId || null),
      area: body.nivel === 'lider_area' ? String(body.area).trim() : null,
      createdAt: new Date().toISOString(),
    };
    await repos.organograma.create(membro);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutMembroOrganograma(contractId, membroId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const lista = contract.organograma || [];
    const atual = lista.find(m => m.id === membroId);
    if (!atual) return sendError(res, 404, 'Membro não encontrado');

    const merged = {
      recursoId:    body.recursoId    !== undefined ? body.recursoId    : atual.recursoId,
      nivel:        body.nivel        !== undefined ? body.nivel        : atual.nivel,
      cargo:        body.cargo        !== undefined ? body.cargo        : atual.cargo,
      supervisorId: body.supervisorId !== undefined ? body.supervisorId : atual.supervisorId,
      area:         body.area         !== undefined ? body.area         : atual.area,
    };
    const erro = validarMembroOrganograma(merged, lista, membroId);
    if (erro) return sendError(res, 400, erro);

    await repos.organograma.updateById(membroId, {
      recursoId: merged.recursoId,
      nivel: merged.nivel,
      cargo: merged.cargo,
      supervisorId: merged.nivel === 'encarregado' ? null : (merged.supervisorId || null),
      area: merged.nivel === 'lider_area' ? String(merged.area).trim() : null,
    });
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteMembroOrganograma(contractId, membroId, body, res, query) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const lista = contract.organograma || [];
    const alvo = lista.find(m => m.id === membroId);
    if (!alvo) return sendError(res, 404, 'Membro não encontrado');

    const mode = (query && query.mode) || 'strict';
    const reassignTo = query && query.reassignTo;

    if (alvo.nivel === 'encarregado') {
      if (lista.some(m => m.nivel === 'lider_area')) {
        return sendError(res, 409, 'Não é possível remover o encarregado enquanto houver líderes no organograma');
      }
      await repos.organograma.removeById(membroId);
    } else if (alvo.nivel === 'lider_area') {
      const subordinados = lista.filter(m => m.supervisorId === membroId);
      if (subordinados.length > 0 && mode === 'strict') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Líder possui profissionais vinculados. Informe mode=reassign&reassignTo=<liderId> ou mode=cascade',
          subordinadosCount: subordinados.length,
        }));
        return;
      }
      if (mode === 'reassign') {
        const novo = lista.find(m => m.id === reassignTo && m.nivel === 'lider_area' && m.id !== membroId);
        if (!novo) return sendError(res, 400, 'Líder de destino inválido');
        for (const s of subordinados) {
          await repos.organograma.updateById(s.id, { supervisorId: novo.id });
        }
        await repos.organograma.removeById(membroId);
      } else if (mode === 'cascade') {
        for (const s of subordinados) await repos.organograma.removeById(s.id);
        await repos.organograma.removeById(membroId);
      } else {
        await repos.organograma.removeById(membroId);
      }
    } else {
      await repos.organograma.removeById(membroId);
    }

    sendJson(res, await repos.contracts.getEnvelope());
    return;
  } catch (e) {
    sendError(res, 400, e.message);
    return;
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ RDO (Relatório Diário de Obra) handlers ============
const RDO_FOTOS_DIR = path.join(__dirname, 'data', 'rdo-fotos');

function validarRdo(body, rdos, rdoIdAtual) {
  if (!body.data) return 'Data é obrigatória';
  const duplicado = rdos.some(r => r.data === body.data && r.id !== rdoIdAtual);
  if (duplicado) return `Já existe um RDO para a data ${body.data} neste contrato`;
  return null;
}

function proxNumeroRdo(rdos) {
  return rdos.reduce((max, r) => Math.max(max, r.numero || 0), 0) + 1;
}

async function handlePostRdo(contractId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const erro = validarRdo(body, contract.rdos || [], null);
    if (erro) return sendError(res, 400, erro);

    const rdo = {
      id: generateId('rdo'),
      contractId,
      numero: String(proxNumeroRdo(contract.rdos || [])),
      data: body.data,
      diaSemana: body.diaSemana || '',
      osNumero: body.osNumero || '',
      ordemCompra: body.ordemCompra || '',
      projeto: body.projeto || '',
      prazo: JSON.stringify(body.prazo || { dataInicial: '', contratual: 0, decorrido: 0, faltante: 0, pctConcluida: 0 }),
      tempo: JSON.stringify(body.tempo || {
        manha:    { tempo: 'bom', condicoes: 'operavel' },
        tarde:    { tempo: 'bom', condicoes: 'operavel' },
        noiteAnt: { tempo: 'bom', condicoes: 'operavel' },
        precipitacao: 0,
      }),
      periodoTrabalho: body.periodoTrabalho || '7:00 às 17:00',
      horaExtra: !!body.horaExtra ? 'true' : 'false',
      moi:  JSON.stringify(Array.isArray(body.moi)  ? body.moi  : []),
      mod:  JSON.stringify(Array.isArray(body.mod)  ? body.mod  : []),
      terc: JSON.stringify(Array.isArray(body.terc) ? body.terc : []),
      equipamentos: JSON.stringify(Array.isArray(body.equipamentos) ? body.equipamentos : []),
      atividades:   JSON.stringify(Array.isArray(body.atividades)   ? body.atividades   : []),
      seguranca: JSON.stringify(body.seguranca || { acidente: 'nao_houve', diagnostico: '', comentarios: '' }),
      fiscalizacaoComentarios: body.fiscalizacaoComentarios || '',
      totais: JSON.stringify(body.totais || { moi: 0, mod: 0, terc: 0, eqp: 0, homensHora: 0, horasParadas: 0, equipamentoHora: 0 }),
      fotos: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.rdos.create(rdo);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutRdo(contractId, rdoId, body, res) {
  try {
    const contract = await repos.contracts.findByIdWithChildren(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const atual = (contract.rdos || []).find(r => r.id === rdoId);
    if (!atual) return sendError(res, 404, 'RDO não encontrado');

    const novaData = body.data !== undefined ? body.data : atual.data;
    const erro = validarRdo({ ...body, data: novaData }, contract.rdos || [], rdoId);
    if (erro) return sendError(res, 400, erro);

    const allowed = {};
    const stringFields = ['data', 'diaSemana', 'osNumero', 'ordemCompra', 'projeto', 'periodoTrabalho', 'fiscalizacaoComentarios'];
    for (const f of stringFields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    const jsonbFields = ['prazo', 'tempo', 'moi', 'mod', 'terc', 'equipamentos', 'atividades', 'seguranca', 'totais'];
    for (const f of jsonbFields) {
      if (body[f] !== undefined) allowed[f] = JSON.stringify(body[f]);
    }
    if (body.horaExtra !== undefined) allowed.horaExtra = !!body.horaExtra ? 'true' : 'false';
    allowed.updatedAt = new Date().toISOString();

    await repos.rdos.updateById(rdoId, allowed);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteRdo(contractId, rdoId, res) {
  try {
    await repos.rdos.removeById(rdoId);
    // Remove pasta de fotos associada
    const pastaFotos = path.join(RDO_FOTOS_DIR, rdoId);
    try {
      if (fs.existsSync(pastaFotos)) fs.rmSync(pastaFotos, { recursive: true, force: true });
    } catch {}
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// --- Upload de fotos: parser multipart nativo simples ---
function parseMultipart(buffer, boundary) {
  const boundaryBytes = Buffer.from('--' + boundary);
  const parts = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(boundaryBytes, offset);
    if (start === -1) break;
    const end = buffer.indexOf(boundaryBytes, start + boundaryBytes.length);
    if (end === -1) break;
    const section = buffer.slice(start + boundaryBytes.length, end);
    // section começa com \r\n headers \r\n\r\n content \r\n
    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd === -1) { offset = end; continue; }
    const headersRaw = section.slice(2, headerEnd).toString('utf8');
    const content = section.slice(headerEnd + 4, section.length - 2);
    // Extrai name e filename com regexes separados (evita confusão de backtracking)
    const nameMatch = headersRaw.match(/\bname="([^"]*)"/i);
    const fileMatch = headersRaw.match(/\bfilename="([^"]*)"/i);
    const typeMatch = headersRaw.match(/Content-Type:\s*([^\r\n]+)/i);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: fileMatch ? fileMatch[1] : null,
        contentType: typeMatch ? typeMatch[1].trim() : null,
        data: content
      });
    }
    offset = end;
  }
  return parts;
}

const FOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
/**
 * Mapeia Content-Type → extensão segura. Usado para evitar que a extensão venha
 * do nome de arquivo do cliente (ex: `foto.jpg.svg` resultaria em SVG XSS).
 * Fixes A-05 e A-06.
 */
const FOTO_EXT_FROM_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
/**
 * Verifica que os primeiros bytes de um Buffer correspondem a um magic-number de
 * imagem aceito (JPEG `FF D8`, PNG `89 50 4E 47`, RIFF/WEBP). Defesa contra
 * payloads disfarçados de imagem (ex: PHP/HTML com extensão e header forjados).
 *
 * @param {Buffer} buf
 * @returns {boolean}
 */
function _isAllowedImageMagic(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
  // RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  return false;
}

function handlePostRdoFoto(contractId, rdoId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Content-Type multipart esperado' }));
    return;
  }
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = 25 * 1024 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload muito grande' }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const rdo = await repos.rdos.findById(rdoId);
      if (!rdo) return sendError(res, 404, 'RDO não encontrado');

      const legendaPart = parts.find(p => p.name === 'legenda');
      const legenda = legendaPart ? legendaPart.data.toString('utf8') : '';

      const arquivos = parts.filter(p => p.filename && p.data && p.data.length > 0);
      if (arquivos.length === 0) return sendError(res, 400, 'Nenhum arquivo enviado');

      const pastaRdo = path.join(RDO_FOTOS_DIR, rdoId);
      if (!fs.existsSync(pastaRdo)) fs.mkdirSync(pastaRdo, { recursive: true });

      const adicionadas = [];
      for (const arq of arquivos) {
        // FIX A-05: rejeita upload sem Content-Type ou com tipo não permitido.
        // O `arq.contentType &&` original permitia bypass simplesmente omitindo o header.
        if (!arq.contentType || !FOTO_ALLOWED_TYPES.includes(arq.contentType)) continue;
        if (arq.data.length > FOTO_MAX_BYTES) continue;
        // Defesa em profundidade: magic-bytes batem com o Content-Type declarado.
        if (!_isAllowedImageMagic(arq.data)) continue;
        // FIX A-06: extensão vem do MIME validado, nunca do filename do cliente
        // (que pode ser `foto.jpg.svg` → XSS persistente quando servido depois).
        const ext = FOTO_EXT_FROM_MIME[arq.contentType] || '.jpg';
        const fotoId = generateId('foto');
        const filename = fotoId + ext;
        // FIX P1-2: writeFile assíncrono não bloqueia o event loop durante uploads grandes.
        await fs.promises.writeFile(path.join(pastaRdo, filename), arq.data);
        adicionadas.push({
          id: fotoId, filename, legenda,
          url: `/data/rdo-fotos/${rdoId}/${filename}`,
          createdAt: new Date().toISOString(),
        });
      }

      const fotos = (rdo.fotos || []).concat(adicionadas);
      await repos.rdos.updateById(rdoId, {
        fotos: JSON.stringify(fotos),
        updatedAt: new Date().toISOString(),
      });
      const env = await repos.contracts.getEnvelope();
      sendJson(res, { contracts: env.contracts, fotos: adicionadas });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleDeleteRdoFoto(contractId, rdoId, fotoId, res) {
  try {
    const rdo = await repos.rdos.findById(rdoId);
    if (!rdo) return sendError(res, 404, 'RDO não encontrado');
    const fotos = rdo.fotos || [];
    const foto = fotos.find(f => f.id === fotoId);
    if (foto) {
      const filepath = path.join(RDO_FOTOS_DIR, rdoId, foto.filename);
      try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
    }
    const novasFotos = fotos.filter(f => f.id !== fotoId);
    await repos.rdos.updateById(rdoId, {
      fotos: JSON.stringify(novasFotos),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Aditivos de Contrato ============

async function handlePostAditivo(contractId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const item = {
      id: generateId('adi'),
      contractId,
      numero: body.numero || '',
      tipo: body.tipo || 'valor',
      descricao: body.descricao,
      valorDelta: parseFloat(body.valorDelta) || 0,
      diasDelta: parseInt(body.diasDelta) || 0,
      data: body.data || null,
      aprovado: !!body.aprovado,
      createdAt: new Date().toISOString(),
    };
    await repos.aditivos.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutAditivo(contractId, id, body, res) {
  try {
    const allowed = {};
    const fields = ['numero', 'tipo', 'descricao', 'data'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valorDelta !== undefined) allowed.valorDelta = parseFloat(body.valorDelta) || 0;
    if (body.diasDelta !== undefined) allowed.diasDelta = parseInt(body.diasDelta) || 0;
    if (body.aprovado !== undefined) allowed.aprovado = !!body.aprovado;
    const result = await repos.aditivos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Aditivo não encontrado');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteAditivo(contractId, id, res) {
  try {
    await repos.aditivos.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Marcos / Checklist ============

async function handlePostMarco(contractId, body, res) {
  try {
    if (!body.titulo) return sendError(res, 400, 'Título é obrigatório');
    const item = {
      id: generateId('mrc'),
      contractId,
      titulo: body.titulo,
      descricao: body.descricao || '',
      prazo: body.prazo || null,
      concluido: false,
      concluidoEm: null,
      ordem: parseInt(body.ordem) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.marcos.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutMarco(contractId, id, body, res) {
  try {
    const allowed = { updatedAt: new Date().toISOString() };
    const fields = ['titulo', 'descricao', 'prazo', 'ordem'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.concluido !== undefined) {
      allowed.concluido = !!body.concluido;
      allowed.concluidoEm = body.concluido ? (body.concluidoEm || new Date().toISOString().split('T')[0]) : null;
    }
    const result = await repos.marcos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Marco não encontrado');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteMarco(contractId, id, res) {
  try {
    await repos.marcos.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Ocorrências ============

async function handlePostOcorrencia(contractId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const item = {
      id: generateId('ocr'),
      contractId,
      tipo: body.tipo || 'geral',
      severidade: body.severidade || 'media',
      descricao: body.descricao,
      data: body.data || new Date().toISOString().split('T')[0],
      encerrada: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.ocorrencias.create(item);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutOcorrencia(contractId, id, body, res) {
  try {
    const allowed = { updatedAt: new Date().toISOString() };
    const fields = ['tipo', 'severidade', 'descricao', 'data'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.encerrada !== undefined) allowed.encerrada = !!body.encerrada;
    const result = await repos.ocorrencias.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Ocorrência não encontrada');
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteOcorrencia(contractId, id, res) {
  try {
    await repos.ocorrencias.removeById(id);
    sendJson(res, await repos.contracts.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

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
  '.woff':  'font/woff',
  '.woff2': 'font/woff2'
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
function go(srv){
  if(srv===loaded)return;
  var key="rh:upgrade-attempt";
  try{if(sessionStorage.getItem(key)===srv)return;sessionStorage.setItem(key,srv);}catch(e){}
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
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org",
    "connect-src 'self' https://*.openstreetmap.org https://nominatim.openstreetmap.org https://router.project-osrm.org https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; ');
}

function _serveHtmlWithBootstrap(pathname, res) {
  const filename = (pathname === '/' || pathname === '') ? '/index.html' : pathname;
  const filepath = path.resolve(__dirname, '.' + filename);
  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }
  // Nonce único por request — libera APENAS o nosso bootstrap inline na CSP.
  const nonce = crypto.randomBytes(16).toString('base64');
  const bootstrap = _bootstrapInline(APP_VERSION);
  const html = fs.readFileSync(filepath, 'utf8')
    .replace(
      '</head>',
      `<script nonce="${nonce}">${bootstrap}</script></head>`
    )
    // Cache-busting dos JS/CSS eager: anexa ?v=APP_VERSION. Sem isso o sw.js
    // (stale-while-revalidate) serve o JS antigo cacheado e o usuário fica uma
    // versão atrás a cada deploy. Os scripts lazy já versionam em app.js.
    .replace(
      /(src|href)="(\.\/(?:js|css)\/[^"]+\.(?:js|css))"/g,
      `$1="$2?v=${APP_VERSION}"`
    );
  // CSP com nonce — só o script-src difere; resto vem de buildCsp().
  const csp = buildCsp(`script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Security-Policy': csp,
  });
  res.end(html);
}

function serveStaticFile(pathname, res) {
  // HTML nunca usa cache em memória — cada response tem nonce CSP único.
  if (pathname === '/' || pathname.endsWith('.html')) {
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
  } else if (ext === '.svg' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' ||
             ext === '.webp' || ext === '.woff2' || ext === '.woff' || ext === '.ico') {
    headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  }

  let body;
  if (ext === '.html') {
    // Injeta versão do app para que a sidebar mostre v1.x.y dinâmico
    body = Buffer.from(
      fs.readFileSync(filepath, 'utf8').replace(
        '</head>',
        `<script>window.__APP_VERSION__="${APP_VERSION}";</script></head>`
      )
    );
  } else if (pathname === '/sw.js') {
    // Injeta a versão no Service Worker para que o cache seja invalidado a cada deploy
    body = Buffer.from(
      fs.readFileSync(filepath, 'utf8').replace(
        "'__RHINO_VERSION__'",
        `'rhino-v${APP_VERSION}'`
      )
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
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && pathname.startsWith('/api/') && status < 500) {
      setImmediate(() => audit.log({ req, res, body: req._auditBody, status, durationMs: ms, requestId }).catch(() => {}));

      // Real-time bus (G1) — publica para clientes conectados via /api/stream
      if (status >= 200 && status < 300) {
        // pathname tipo /api/contracts ou /api/contracts/abc → entidade = contracts
        const m = pathname.match(/^\/api\/([a-z0-9-]+)(?:\/([a-zA-Z0-9_-]+))?/i);
        if (m) {
          const entity = m[1];
          const id = m[2] || null;
          const action = req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : 'delete';
          // Skip endpoints internos que não representam mutação de entidade
          if (!['auth', 'stream', 'metrics', 'health', 'audit', 'search', 'backup'].includes(entity)) {
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
  res.setHeader('Content-Security-Policy', buildCsp("script-src 'self' https://cdn.jsdelivr.net"));
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
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
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
      const result = { status: 'ok', db: 'unknown', uptime_s: Math.round((Date.now() - APP_START) / 1000), version: APP_VERSION };
      try {
        result.db = (await require('./db').ping()) ? 'ok' : 'down';
      } catch { result.db = 'down'; }
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
  const isRdoFotoUpload = req.method === 'POST'
    && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/fotos$/.test(pathname);
  if (isRdoFotoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      handlePostRdoFoto(parts[3], parts[5], req, res);
    })();
    return;
  }

  // Multipart (upload de arquivo de documento de recurso) — também precisa pular body parser
  const isRecursoDocArqUpload = req.method === 'POST'
    && /^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/.test(pathname);
  if (isRecursoDocArqUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      handlePostRecursoDocArquivo(parts[3], parts[5], req, res);
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
  const isRdoAssinaturaUpload = req.method === 'POST'
    && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas$/.test(pathname);
  if (isRdoAssinaturaUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      const parts = pathname.split('/');
      handlePostRdoAssinatura(parts[5], req, res);
    })();
    return;
  }

  // Multipart (upload de anexo de proposta)
  const isPropostaAnexoUpload = req.method === 'POST'
    && /^\/api\/propostas\/[^/]+\/anexos$/.test(pathname);
  if (isPropostaAnexoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      handleUploadPropostaAnexo(pathname.split('/')[3], req, res);
    })();
    return;
  }

  // Multipart (upload de case logo)
  const isCaseLogoUpload = req.method === 'POST' && pathname === '/api/case-logos';
  if (isCaseLogoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname, req.method)) return;
      handleUploadCaseLogo(req, res);
    })();
    return;
  }

  // Parse body for POST/PUT requests
  const MAX_BODY_BYTES = 1_000_000; // 1 MB
  let body = '';
  let bodySize = 0;
  if (['POST', 'PUT'].includes(req.method)) {
    // Enforce Content-Type for JSON API routes (only when body is present)
    if (pathname.startsWith('/api/')) {
      const ct = req.headers['content-type'] || '';
      const hasBody = (req.headers['content-length'] && req.headers['content-length'] !== '0')
        || req.headers['transfer-encoding'];
      if (hasBody && !ct.includes('application/json') && !ct.includes('multipart/form-data') && !ct.includes('text/')) {
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content-Type deve ser application/json' }));
        return;
      }
    }
    req.on('data', chunk => {
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
      } catch (e) {
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
  return ADMIN_PATH_PREFIXES.some(p =>
    pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/')
  );
}
function requireAdmin(req, res) {
  if (!req.user) { sendError(res, 401, 'Não autenticado'); return false; }
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
  { re: /^\/api\/base\/[^/]+\/allocate$/,   screens: ['#/base', '#/contratos'] },
  { re: /^\/api\/(contracts|saidas)(\/|$)/, screens: ['#/contratos'] },
  { re: /^\/api\/(base|tipos-base)(\/|$)/,  screens: ['#/base'] },
  { re: /^\/api\/caixa(\/|$)/,              screens: ['#/caixa'] },
  { re: /^\/api\/socios(\/|$)/,             screens: ['#/socios'] },
  { re: /^\/api\/investimentos(\/|$)/,      screens: ['#/investimentos'] },
  { re: /^\/api\/clientes(\/|$)/,           screens: ['#/clientes', '#/contratos'] },
  { re: /^\/api\/fornecedores(\/|$)/,       screens: ['#/fornecedores', '#/contratos', '#/contas-pagar'] },
  { re: /^\/api\/notas-fiscais(\/|$)/,      screens: ['#/notas-fiscais', '#/contratos'] },
  { re: /^\/api\/contas-pagar(\/|$)/,       screens: ['#/contas-pagar'] },
  { re: /^\/api\/recursos(\/|$)/,           screens: ['#/recursos'] },
  { re: /^\/api\/folha-pagamento(\/|$)/,    screens: ['#/folha-pagamento'] },
];

/**
 * Bloqueia uma mutação se o usuário não tem acesso à tela correspondente.
 * @returns {Promise<boolean>} true se bloqueou (resposta 403 já enviada).
 */
async function checkMutationPermission(req, res, pathname, method) {
  if (!MUTATION_METHODS.has(method)) return false;        // não é mutação
  if (perms.isSuperAdmin(req.user)) return false;         // admin / super admin passam
  const rule = MUTATION_PERMISSION_RULES.find(r => r.re.test(pathname));
  if (!rule) return false;                                // rota não mapeada → não bloqueia
  const abas = await perms.loadAbas(req.user);
  if (!abas) return false;                                // null = sem restrição
  // Exige permissão de EDIÇÃO (edit:#/rota). O OR cobre cross-invocações.
  if (rule.screens.some(s => abas.includes('edit:' + s))) return false;
  console.warn(`[C-04] mutação bloqueada: user=${req.user?.id} ${method} ${pathname} — precisa de permissão de edição em uma de: ${rule.screens.join(', ')}`);
  sendError(res, 403, 'Você não tem permissão para esta operação.');
  return true;
}

async function applyAuthMiddleware(req, res, pathname, method) {
  if (!pathname.startsWith('/api/')) return false;

  // Rate limit global pra /api/* — 1000 req / min por IP (anti-DDoS / abuso)
  const rlGlobal = rateLimit.check(rateLimit.clientKey(req, 'global'), { max: 1000, windowMs: 60 * 1000 });
  if (!rlGlobal.ok) {
    res.setHeader('Retry-After', rlGlobal.retryAfterSec);
    sendError(res, 429, 'Limite de requisições atingido. Aguarde um momento.');
    return true;
  }

  if (AUTH_WHITELIST.has(pathname)) return false;
  try {
    const sid = auth.parseCookies(req)[auth.COOKIE_NAME];
    const user = await auth.getUserBySession(sid);
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
  const rowId = crypto.createHash('sha256').update(`${method} ${pathname} ${key}`).digest('hex');
  const reqHash = crypto.createHash('sha256')
    .update(typeof body === 'string' ? body : JSON.stringify(body || {})).digest('hex');

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
  res.writeHead = (status, ...rest) => { capturedStatus = status; return origWriteHead(status, ...rest); };
  res.end = (chunk, ...rest) => {
    if (chunk) capturedBody += chunk.toString();
    const ret = origEnd(chunk, ...rest);
    // Só guarda sucesso — erros (4xx/5xx) devem poder ser refeitos num retry.
    if (capturedStatus >= 200 && capturedStatus < 300) {
      db.query(
        `INSERT INTO idempotency_keys (id, request_hash, status_code, response_body)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [rowId, reqHash, capturedStatus, capturedBody]
      ).catch(() => {});
    }
    return ret;
  };
  return runHandler();
}

// ── Router modular (Fase 2) — domínios migrados saem da cadeia de if abaixo ──
const apiRouter = createRouter();
registerAuth(apiRouter, {
  handleLogin, handleLogout, handleMe,
  handleForgotPassword, handleResetPassword, handleAcceptTerms,
});
registerPortal(apiRouter, {
  handlePortalLogin, applyPortalAuth, handlePortalLogout,
  handlePortalDashboard, handlePortalListPropostas,
  handlePortalPropostaPdf, handlePortalPropostaDocx,
});
registerPlatform(apiRouter, {
  bus, sendJson,
  handleGetAudit, handleGetUsers, handlePostUser, handlePutUser, handleDeleteUser,
  handleAiUsageStats, handleHealth, handleMetrics, handleGetAdminArquivos,
  handleAiChat, handleAiClassify, handleGetFeatureFlags, handlePutFeatureFlag,
  handleGlobalSearch, handleGetNiveisAcesso, handlePutNivelAcesso,
  handlePushSubscribe, handlePushUnsubscribe,
});
registerFinanceiro(apiRouter, {
  withIdempotency,
  handleGetCaixa, handlePostCaixa, handlePutCaixa, handleDeleteCaixa,
  handleGetBase, handlePostBase, handlePutBase, handleDeleteBase, handleAllocateBase,
  handleGetSocios, handlePostSocio, handlePutSocio, handleDeleteSocio,
  handleGetInvestimentos, handlePostInvestimento, handleDeleteInvestimento,
  handleGetTiposBase, handlePostTipoBase, handlePutTipoBase, handleDeleteTipoBase,
  handleGetContasPagar, handlePostContaPagar, handlePutContaPagar, handleDeleteContaPagar,
  handlePagarConta, handleEstornarConta, handleProcessarRecorrencias,
  handleGetFolha, handleGerarFolha, handleLimparFolha, handlePagarFolhaParcela,
  handleEstornarFolhaParcela, handleAddFolhaItem, handleRemoveFolhaItem, handleUpdateFolhaItem,
  handleGetNotasFiscais, handlePostNotaFiscal, handleEmitirNotaFiscal, handleCancelarEmissao,
  handlePutNotaFiscal, handleDeleteNotaFiscal,
  handleCobrancaHistorico, handleCobrancaProjecaoAtual, handleCobrancaMensal,
  handleImportarOfx,
});
registerComercial(apiRouter, {
  handleGetClientes, handlePostCliente, handlePutCliente, handleDeleteCliente,
  handleGetFornecedores, handlePostFornecedor, handlePutFornecedor, handleDeleteFornecedor,
  handleGetClausulas, handlePostClausula, handlePutClausula, handleDeleteClausula,
  handleGetPropostas, handlePostProposta, handleGetProposta, handlePutProposta, handleDeleteProposta,
  handleEnviarProposta, handleAceitarProposta, handleRejeitarProposta, handleDuplicarProposta,
  handlePostPropostaCusto, handlePutPropostaCusto, handleDeletePropostaCusto,
  handleUploadPropostaAnexo, handleGetPropostaAnexo, handlePutPropostaAnexo, handleDeletePropostaAnexo,
  handleGetPropostaDocx, handleGetPropostaPdf, handleGetPropostaPreview,
  handleGetApresentacao, handlePutApresentacao,
  handleGetCaseLogos, handleGetCaseLogoImage, handlePutCaseLogo, handleDeleteCaseLogo,
});
registerOperacao(apiRouter, {
  handleGetRecursos, handlePostRecurso, handlePutRecurso, handleDeleteRecurso,
  handleAddFolga, handleDeleteFolga, handleComprarPassagem,
  handleGetDocumentosStatus, handleAddDocumento, handlePutDocumento, handleDeleteDocumento,
  handlePostRecursoDocArquivo, handleGetRecursoDocArquivo, handleDeleteRecursoDocArquivo,
  handleValidarDocumento,
  handleListItensEstoque, handlePostItemEstoque, handlePutItemEstoque, handleDeleteItemEstoque,
  handleListAlmoxarifados, handlePostAlmoxarifado, handlePutAlmoxarifado, handleDeleteAlmoxarifado,
  handleListMovimentacoes, handlePostMovimentacao, handleDeleteMovimentacao,
  handleGetSaldoEstoque, handleGetVisaoGeral,
  handleListSolicitacoesCompra, handlePostSolicitacaoCompra, handlePutSolicitacaoCompra,
  handleDeleteSolicitacaoCompra, handleAvaliarSolicitacao, handleCancelarSolicitacao,
  handleAprovarSolicitacao, handleRejeitarSolicitacao, handleComprarSolicitacao, handleReceberSolicitacao,
  handleListManutencoes, handlePostManutencao, handlePutManutencao, handleDeleteManutencao,
  handleRetornoManutencao, handleCancelarManutencao, handleAvaliarManutencao,
  handleAprovarManutencao, handleRejeitarManutencao,
  handleListVeiculos, handlePostVeiculo, handlePutVeiculo, handleDeleteVeiculo,
  handlePutVeiculoKm, handlePutVeiculoLocalizacao,
  handlePostVeiculoPlano, handlePutVeiculoPlano, handleDeleteVeiculoPlano,
  handlePostVeiculoManutencao, handlePutVeiculoManutencao, handleDeleteVeiculoManutencao,
  handleListDashLayouts, handlePostDashLayout, handlePutDashLayout, handleDeleteDashLayout,
  handleGetDocTemplates, handlePostDocTemplate, handlePutDocTemplate, handleDeleteDocTemplate,
});
registerContracts(apiRouter, {
  handleGetRdosGlobal, handleGetContracts, handlePostContract, handlePutContract, handleDeleteContract,
  handlePostSaida, handlePostBudgetItem, handlePutBudgetItem, handleDeleteBudgetItem,
  handleListAtividades, handlePostAtividade, handlePutAtividade, handleDeleteAtividade, handleGetCurvaS,
  handlePostMembroOrganograma, handlePutMembroOrganograma, handleDeleteMembroOrganograma,
  handlePostRdo, handlePutRdo, handleDeleteRdo, handlePostRdoFoto, handleDeleteRdoFoto,
  handleListRdoAssinaturas, handleGetRdoAssinatura, handleDeleteRdoAssinatura,
  handlePostAditivo, handlePutAditivo, handleDeleteAditivo,
  handlePostMarco, handlePutMarco, handleDeleteMarco,
  handlePostOcorrencia, handlePutOcorrencia, handleDeleteOcorrencia,
  handlePutSaida, handleDeleteSaida,
});

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

  if (pathname === '/api/dashboard') {
    return handleDashboard(res, parsedUrl.query);
  }
  if (pathname === '/api/backup' && method === 'POST') {
    return handleBackup(res);
  }
  if (pathname === '/api/backup/download' && method === 'GET') {
    return handleBackupDownload(res);
  }
  if (pathname === '/api/backup/email' && method === 'POST') {
    _runEmailBackup().catch(e => console.error('[backup/email]', e.message));
    return sendJson(res, { ok: true, message: `Backup iniciado — será enviado para ${BACKUP_EMAIL}` });
  }

  // ── F6: Anomaly detection ──
  if (pathname === '/api/anomalias' && method === 'GET') return handleGetAnomalias(res);

  // ── F13: LGPD ──
  if (pathname === '/api/lgpd/export' && method === 'GET') return handleLgpdExport(req, res);
  if (pathname === '/api/lgpd/delete-account' && method === 'POST') return handleLgpdDelete(req, res);

  // Static files
  if (pathname === '/' || pathname === '') {
    return serveStaticFile('/index.html', res);
  }

  serveStaticFile(pathname, res);
}

// ============ F6: Anomaly Detection ============
async function handleGetAnomalias(res) {
  try {
    const caixaAll = await repos.caixa.findAll();
    const saidas = caixaAll.filter(e => e.type === 'saida');

    const byCat = {};
    for (const s of saidas) {
      const cat = s.category || 'outros';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push({ v: parseFloat(s.value) || 0, entry: s });
    }

    const anomalias = [];
    for (const [cat, items] of Object.entries(byCat)) {
      if (items.length < 4) continue;
      const values = items.map(i => i.v);
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
    const recorrentes = contas.filter(c => c.recorrente && c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStr);

    const criadas = [];
    for (const conta of recorrentes) {
      // Avança até a próxima data futura (evita criar parcelas já passadas quando há atraso acumulado)
      let nextDate = _calcProximaData(conta.dataVencimento, conta.periodicidade || 'mensal');
      while (nextDate <= hojeStr) {
        nextDate = _calcProximaData(nextDate, conta.periodicidade || 'mensal');
      }
      const jaExiste = contas.some(c => c.recorrenciaOrigemId === conta.id && c.dataVencimento === nextDate);
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
    const sessions = await db.getMany('SELECT id, created_at, expires_at FROM sessions WHERE user_id = $1', [userId]);
    const auditRows = await db.getMany('SELECT ts, method, path, entity, action FROM audit_log WHERE user_id = $1 ORDER BY ts DESC LIMIT 200', [userId]);
    const data = {
      usuario: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, acceptedTermsAt: user.acceptedTermsAt },
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
      email: anonEmail, name: '[Dados excluídos]', passwordHash: anonHash,
      isActive: false, updatedAt: new Date().toISOString(),
    });
    await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    auth.clearSessionCookie(res);
    sendJson(res, { ok: true, message: 'Dados anonimizados conforme LGPD. Sessão encerrada.' });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ F15: AI Chat ============
async function handleAiChat(body, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return sendError(res, 503, 'ANTHROPIC_API_KEY não configurada');
  const message = (body.message || '').trim();
  if (!message) return sendError(res, 400, 'message é obrigatório');
  try {
    const [allContracts, caixaAll, contas] = await Promise.all([
      repos.contracts.findAll(), repos.caixa.findAll(), repos.contasPagar.findAll(),
    ]);
    const saldo = caixaAll.reduce((s, e) => s + (e.type === 'entrada' ? 1 : -1) * (parseFloat(e.value) || 0), 0);
    const pendentes = contas.filter(c => c.status === 'pendente');
    const systemPrompt = `Você é o assistente financeiro do Rhino, sistema de gestão de contratos de construção civil.

Contexto atual:
- Contratos: ${allContracts.length} total, ${allContracts.filter(c => c.status === 'ativo').length} ativos
- Saldo do caixa: R$ ${saldo.toFixed(2)}
- Contas a pagar: ${pendentes.length} pendentes, total R$ ${pendentes.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0).toFixed(2)}

Responda em português, de forma concisa e objetiva.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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
async function handleAiClassify(body, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return sendError(res, 503, 'ANTHROPIC_API_KEY não configurada');
  const { descricao, valor, fornecedor } = body;
  if (!descricao) return sendError(res, 400, 'descricao é obrigatório');
  try {
    const [tiposBase, allContracts] = await Promise.all([repos.tiposBase.findAll(), repos.contracts.findAll()]);
    const cats = tiposBase.map(t => t.label || t.key).join(', ') || 'material, mão-de-obra, equipamento, administrativo, outros';
    const ctrs = allContracts.filter(c => c.status === 'ativo').map(c => `${c.id}: ${c.name}`).join('\n') || 'nenhum';
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
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 256, messages: [{ role: 'user', content: prompt }] }),
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
    const get = (tag) => { const m = block.match(new RegExp(`<${tag}>([^<\n\r]+)`, 'i')); return m ? m[1].trim() : ''; };
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
      req.on('data', d => {
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
    if (transacoes.length === 0) return sendError(res, 400, 'Nenhuma transação encontrada no arquivo OFX');

    const caixaAll = await repos.caixa.findAll();
    const sugestoes = transacoes.map(t => {
      const match = caixaAll.find(e => {
        const vMatch = Math.abs((parseFloat(e.value) || 0) - Math.abs(t.valor)) < 0.02;
        const dMatch = Math.abs(new Date(e.date) - new Date(t.data)) <= 86400000;
        return vMatch && dMatch;
      });
      return { ...t, match: match ? { id: match.id, description: match.description, date: match.date } : null, status: match ? 'conciliado' : 'novo' };
    });
    sendJson(res, { transacoes: sugestoes, total: transacoes.length, novos: sugestoes.filter(t => t.status === 'novo').length });
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
  const q = String(query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) {
    return sendJson(res, { results: [], q });
  }
  const norm = (s) => String(s || '').toLowerCase();
  const matches = (s) => norm(s).includes(q);
  const results = [];
  const safe = async (fn) => { try { return await fn(); } catch { return []; } };

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
      results.push({ kind: 'Contrato', id: c.id, title: c.name || c.id, hint: c.client || '', hash: `#/contratos/${c.id}` });
    }
  });
  clientes.forEach((c) => {
    if (matches(c.nome) || matches(c.email) || matches(c.empresa)) {
      results.push({ kind: 'Cliente', id: c.id, title: c.nome, hint: c.email || c.empresa || '', hash: '#/clientes' });
    }
  });
  fornecedores.forEach((f) => {
    if (matches(f.nome) || matches(f.cnpj)) {
      results.push({ kind: 'Fornecedor', id: f.id, title: f.nome, hint: f.cnpj || '', hash: '#/fornecedores' });
    }
  });
  contas.forEach((c) => {
    if (matches(c.descricao) || matches(c.fornecedor) || matches(c.numero)) {
      results.push({ kind: 'Conta a Pagar', id: c.id, title: c.descricao || c.fornecedor || c.numero, hint: c.dataVencimento || '', hash: '#/contas-pagar' });
    }
  });
  nfs.forEach((n) => {
    if (matches(n.numero) || matches(n.descricao) || matches(n.cliente)) {
      results.push({ kind: 'Nota Fiscal', id: n.id, title: n.numero || n.descricao || n.cliente, hint: n.dataVencimento || '', hash: '#/notas-fiscais' });
    }
  });
  recursos.forEach((r) => {
    if (matches(r.name) || matches(r.cpf) || matches(r.role)) {
      results.push({ kind: 'Recurso', id: r.id, title: r.name, hint: r.role || '', hash: '#/recursos' });
    }
  });

  sendJson(res, { results: results.slice(0, 50), q, count: results.length });
}

async function handleGetNiveisAcesso(res) {
  const data = await readCollection('niveis_acesso.json', 'niveisAcesso', 'niveis');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePutNivelAcesso(id, body, res) {
  try {
    const abas = JSON.stringify(body.abas || []);
    const { envelope, result } = await writeCollection('niveisAcesso', 'niveis', (repo) => repo.updateById(id, { abas }));
    if (!result) return sendError(res, 404, 'Nível não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Recursos handlers ============
async function handleGetRecursos(res) {
  const data = await readCollection('recursos.json', 'recursos', 'recursos');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostRecurso(body, res) {
  try {
    const recurso = {
      id: generateId('rec'),
      nome: body.nome || '',
      cpf: body.cpf || '',
      dataNascimento: body.dataNascimento || null,
      genero: body.genero || '',
      telefone: body.telefone || '',
      email: body.email || '',
      endereco: body.endereco || '',
      lat: body.lat || '',
      lng: body.lng || '',
      status: body.status || 'candidato',
      profissao: body.profissao || '',
      dataAdmissao: body.dataAdmissao || null,
      salario: parseFloat(body.salario) || 0,
      elegivelVale: !!body.elegivelVale,
      cnh: body.cnh || '',
      pis: body.pis || '',
      dataDesligamento: body.dataDesligamento || null,
      motivoDesligamento: body.motivoDesligamento || '',
      obsDesligamento: body.obsDesligamento || '',
      notas: body.notas || '',
      rdoCategoria: body.rdoCategoria || '',
      folgas: '[]',
      documentos: '[]',
      historicoAlocacoes: '[]',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('recursos', 'recursos', (repo) => repo.create(recurso));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutRecurso(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'cpf', 'genero', 'telefone', 'email', 'endereco', 'lat', 'lng',
      'status', 'profissao', 'cnh', 'pis', 'motivoDesligamento', 'obsDesligamento', 'notas', 'rdoCategoria'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    // Datas: '' → null
    for (const f of ['dataNascimento', 'dataAdmissao', 'dataDesligamento']) {
      if (body[f] !== undefined) allowed[f] = body[f] || null;
    }
    if (body.salario !== undefined) allowed.salario = parseFloat(body.salario) || 0;
    if (body.elegivelVale !== undefined) allowed.elegivelVale = !!body.elegivelVale;
    if (body.alocacaoAtual !== undefined) {
      allowed.alocacaoAtual = body.alocacaoAtual ? JSON.stringify(body.alocacaoAtual) : null;
    }
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('recursos', 'recursos', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Recurso não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteRecurso(id, res) {
  try {
    const { envelope } = await writeCollection('recursos', 'recursos', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAddFolga(id, body, res) {
  try {
    const rec = await repos.recursos.findById(id);
    if (!rec) return sendError(res, 404, 'Não encontrado');
    const folga = {
      id: generateId('fol'),
      dataInicio:   body.dataInicio || '',
      dataFim:      body.dataFim    || '',
      observacoes:  body.observacoes || '',
      passagemIda:   { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
      passagemVolta: { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
      createdAt: new Date().toISOString(),
    };
    const folgas = (rec.folgas || []).concat(folga);
    const { envelope } = await writeCollection('recursos', 'recursos',
      (repo) => repo.updateById(id, { folgas: JSON.stringify(folgas), updatedAt: new Date().toISOString() })
    );
    sendJson(res, envelope);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteFolga(recursoId, folgaId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Não encontrado');
    const folgas = (rec.folgas || []).filter(f => f.id !== folgaId);
    const { envelope } = await writeCollection('recursos', 'recursos',
      (repo) => repo.updateById(recursoId, { folgas: JSON.stringify(folgas), updatedAt: new Date().toISOString() })
    );
    sendJson(res, envelope);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleComprarPassagem(recursoId, folgaId, body, res) {
  try {
    const recurso = await repos.recursos.findById(recursoId);
    if (!recurso) return sendError(res, 404, 'Recurso não encontrado');

    const folgas = recurso.folgas || [];
    const fIdx = folgas.findIndex(f => f.id === folgaId);
    if (fIdx === -1) return sendError(res, 404, 'Folga não encontrada');

    const tipo      = body.tipo === 'ida' ? 'passagemIda' : 'passagemVolta';
    const tipoLabel = body.tipo === 'ida' ? 'Ida' : 'Volta';
    const valor     = parseFloat(body.valor) || 0;
    const folga     = folgas[fIdx];

    const contractId = body.contractIdPagador || recurso.alocacaoAtual?.contractId || null;
    let obraLabel = '';
    if (contractId) {
      const ct = await repos.contracts.findById(contractId);
      if (ct) obraLabel = ` — ${ct.name}`;
    }
    const descricao = `Passagem de ${tipoLabel} — ${recurso.nome}${obraLabel}`;
    const dataCompra = body.dataCompra || new Date().toISOString().split('T')[0];

    let caixaEntryId = null, contaPagarId = null;

    if (body.tipoLancamento === 'conta_pagar') {
      const conta = {
        id: generateId('cp'), descricao,
        fornecedorId: null, numeroNF: '',
        valor, dataEmissao: dataCompra,
        dataVencimento: folga.dataInicio || null, status: 'pendente',
        dataPagamento: null, caixaEntryId: null,
        contractId: body.financiadoPor === 'contrato' ? (body.contractIdPagador || null) : null,
        category: 'passagem', observacoes: `Folga de ${recurso.nome}`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await repos.contasPagar.create(conta);
      contaPagarId = conta.id;
    } else {
      const entry = {
        id: generateId('cxa'), type: 'saida', description: descricao,
        value: valor, date: dataCompra,
        contractId: body.financiadoPor === 'contrato' ? (body.contractIdPagador || null) : null,
        baseItemId: null, category: 'passagem',
        notes: `Passagem ${tipoLabel} folga de ${recurso.nome}`,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(entry);
      caixaEntryId = entry.id;
    }

    folgas[fIdx] = {
      ...folga,
      [tipo]: {
        comprada: true, valor,
        dataCompra,
        companhia:         body.companhia  || '',
        numeroVoo:         body.numeroVoo  || '',
        origem:            body.origem     || '',
        destino:           body.destino    || '',
        dataVoo:           body.dataVoo    || '',
        horario:           body.horario    || '',
        financiadoPor:     body.financiadoPor,
        contractIdPagador: body.contractIdPagador || null,
        caixaEntryId, contaPagarId,
      },
    };
    await repos.recursos.updateById(recursoId, {
      folgas: JSON.stringify(folgas),
      updatedAt: new Date().toISOString(),
    });

    sendJson(res, {
      recursos: await repos.recursos.findAll(),
      caixa: { entries: await repos.caixa.findAll() },
      contas_pagar: { contas: await repos.contasPagar.findAll() },
    });
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Doc Templates handlers ============
async function handleGetDocTemplates(res) {
  const data = await readCollection('doc_templates.json', 'docTemplates', 'templates');
  if (!data.templates) data.templates = [];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handlePostDocTemplate(body, res) {
  try {
    const template = {
      id: generateId('tpl'),
      nome: body.nome || '',
      tipoDocumento: body.tipoDocumento || '',
      empresaId: body.empresaId || null,
      checklist: JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []),
      periodicidadeMeses: Number.isFinite(parseInt(body.periodicidadeMeses)) ? parseInt(body.periodicidadeMeses) : 12,
      metadata: JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      body: body.body || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { envelope } = await writeCollection('docTemplates', 'templates', (repo) => repo.create(template));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutDocTemplate(id, body, res) {
  try {
    const allowed = {};
    const fields = ['nome', 'tipoDocumento', 'empresaId', 'body'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.checklist !== undefined) {
      allowed.checklist = JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []);
    }
    if (body.metadata !== undefined) {
      allowed.metadata = JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {});
    }
    if (body.periodicidadeMeses !== undefined) {
      allowed.periodicidadeMeses = Number.isFinite(parseInt(body.periodicidadeMeses)) ? parseInt(body.periodicidadeMeses) : 12;
    }
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('docTemplates', 'templates', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Não encontrado');
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteDocTemplate(id, res) {
  try {
    const { envelope } = await writeCollection('docTemplates', 'templates', (repo) => repo.removeById(id));
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Validação de documento contra template (Claude Vision) ============
// Lê o BYTEA do arquivo, converte PDF→imagem se preciso, redimensiona com jimp,
// chama Claude Vision com o checklist do template e retorna relatório estruturado.
// SEMPRE retorna um objeto válido — em caso de erro, retorna status nao_validado.
async function _validarDocComTemplate(arquivoBuffer, mimeType, template) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 'nao_validado', motivo: 'ANTHROPIC_API_KEY não configurada' };
  const meta = template?.metadata || {};
  const secoes = Array.isArray(meta.secoes) ? meta.secoes : [];
  const campos = Array.isArray(meta.campos) ? meta.campos : [];
  const visuais = Array.isArray(meta.elementos_visuais) ? meta.elementos_visuais : [];
  if (!secoes.length && !campos.length && !visuais.length) {
    return { status: 'nao_validado', motivo: 'template sem padrão de validação configurado' };
  }

  // Coleta imagens (PDF: até 5 páginas amostradas; imagem: 1 página)
  let images = []; // [{data, mediaType, pagina}]
  let totalPaginas = 1;

  try {
    if (mimeType === 'application/pdf') {
      const { pdf } = require('pdf-to-img');
      const { Jimp } = require('jimp');
      const allPages = [];
      for await (const page of await pdf(arquivoBuffer, { scale: 1.2 })) {
        allPages.push(page);
      }
      if (!allPages.length) throw new Error('PDF sem páginas legíveis');
      totalPaginas = allPages.length;

      // Seleciona índices estratégicos: primeira, distribuídas, última (máx 5)
      const idxSet = new Set([0]);
      if (totalPaginas > 1) idxSet.add(totalPaginas - 1);
      if (totalPaginas >= 4) {
        const step = Math.floor(totalPaginas / 3);
        idxSet.add(step);
        idxSet.add(step * 2);
      }
      if (totalPaginas >= 10) idxSet.add(Math.floor(totalPaginas / 2));

      for (const idx of [...idxSet].sort((a, b) => a - b)) {
        let imgBuf = allPages[idx];
        try {
          const img = await Jimp.read(imgBuf);
          if (img.bitmap.width > 1024) { img.resize({ w: 1024 }); imgBuf = await img.getBuffer('image/png'); }
        } catch {}
        images.push({ data: imgBuf.toString('base64'), mediaType: 'image/png', pagina: idx + 1 });
      }
    } else if (/^image\//.test(mimeType)) {
      let imgBuf = arquivoBuffer;
      try {
        const { Jimp } = require('jimp');
        const img = await Jimp.read(imgBuf);
        if (img.bitmap.width > 1280) { img.resize({ w: 1280 }); imgBuf = await img.getBuffer('image/png'); }
      } catch (eImg) {
        console.warn('[validar-doc] jimp falhou:', eImg.message);
      }
      images.push({ data: imgBuf.toString('base64'), mediaType: mimeType });
    } else {
      return { status: 'nao_validado', motivo: `Tipo de arquivo não suportado pra validação: ${mimeType}` };
    }
  } catch (e) {
    return { status: 'nao_validado', erro: 'falha ao preparar imagem: ' + e.message };
  }

  const isMultiPage = totalPaginas > 1;
  const paginasEsperadas = meta.total_paginas_esperado ? Number(meta.total_paginas_esperado) : null;

  const promptTexto = `
Você é um auditor rigoroso de documentos trabalhistas brasileiros.

${isMultiPage
  ? `O documento enviado tem ${totalPaginas} página(s) no total.${paginasEsperadas ? ` O template exige exatamente ${paginasEsperadas} páginas.` : ''}
As imagens abaixo são amostras de páginas selecionadas (cada uma identificada com "Página X de ${totalPaginas}").
Avalie a conformidade com base nas imagens e no total de páginas informado.`
  : 'Analise a IMAGEM abaixo e verifique se ela atende aos requisitos.'}

Responda APENAS com um JSON válido (sem markdown, sem comentários) no formato exato indicado.

REQUISITOS:

Seções esperadas (na ordem informada, todas obrigatórias salvo indicação):
${secoes.map(s => `- ordem ${s.ordem}: ${s.nome}${s.obrigatorio === false ? ' (opcional)' : ''}`).join('\n') || '(nenhuma)'}

Campos a extrair:
${campos.map(c => `- ${c.nome}${c.obrigatorio === false ? ' (opcional)' : ''}${c.regex ? ` (formato: ${c.regex})` : ''}`).join('\n') || '(nenhum)'}

Elementos visuais esperados:
${visuais.map(v => `- ${v.descricao}${v.obrigatorio === false ? ' (opcional)' : ''}`).join('\n') || '(nenhum)'}

Instruções extras:
${meta.instrucoes_extras || '(nenhuma)'}

FORMATO DE RESPOSTA (JSON puro):
{
  "total_paginas": ${totalPaginas},
  "secoes": [{"ordem": 1, "encontrada": true, "observacao": "..."}],
  "campos": [{"nome": "Nome", "encontrado": true, "valor": "..."}],
  "elementos_visuais": [{"descricao": "Assinatura", "encontrado": true}],
  "problemas": ["item específico que não atende"],
  "resumo": "frase curta sobre conformidade geral"
}
`.trim();

  // Monta content com imagens intercaladas de label de página
  const contentItems = [];
  for (const img of images) {
    if (img.pagina) contentItems.push({ type: 'text', text: `--- Página ${img.pagina} de ${totalPaginas} ---` });
    contentItems.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  }
  contentItems.push({ type: 'text', text: promptTexto });

  let texto;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'Você é um auditor de documentos. Responda APENAS com JSON válido, sem markdown.',
        messages: [{ role: 'user', content: contentItems }],
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const errText = await resp.text();
      return { status: 'nao_validado', erro: `Claude HTTP ${resp.status}: ${errText.slice(0, 200)}` };
    }
    const json = await resp.json();
    texto = json?.content?.[0]?.text || '';
    // Registra uso da API para billing interno
    try {
      const inputTok = json?.usage?.input_tokens || 0;
      const outputTok = json?.usage?.output_tokens || 0;
      // Haiku 4.5: $0.80/MTok input, $4.00/MTok output
      const costUsd = (inputTok * 0.0000008) + (outputTok * 0.000004);
      await db.query(
        `INSERT INTO ai_usage (model, input_tokens, output_tokens, cost_usd, status)
         VALUES ($1, $2, $3, $4, $5)`,
        ['claude-haiku-4-5-20251001', inputTok, outputTok, costUsd, 'ok'],
      );
    } catch (eUsage) {
      console.warn('[ai-usage] falha ao registrar:', eUsage.message);
    }
  } catch (e) {
    return { status: 'nao_validado', erro: 'falha ao chamar Claude: ' + e.message };
  }

  // Extrai JSON da resposta (tolerante a fences ```json ... ```)
  let parsed;
  try {
    const m = texto.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : texto);
  } catch {
    return { status: 'nao_validado', erro: 'Claude não retornou JSON válido', resposta: texto.slice(0, 300) };
  }

  // Calcula score: peso por categoria, considerando obrigatórios
  let totalPeso = 0, atendidoPeso = 0;
  const checaSec = (s, idx) => {
    const obr = secoes[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    if (s.encontrada) atendidoPeso += peso;
  };
  const checaCampo = (c, idx) => {
    const obr = campos[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    let ok = c.encontrado;
    // Verifica regex se houver
    if (ok && campos[idx]?.regex && c.valor) {
      try { ok = new RegExp(campos[idx].regex).test(c.valor); } catch {}
    }
    if (ok) atendidoPeso += peso;
  };
  const checaVis = (v, idx) => {
    const obr = visuais[idx]?.obrigatorio !== false;
    const peso = obr ? 2 : 1;
    totalPeso += peso;
    if (v.encontrado) atendidoPeso += peso;
  };
  (parsed.secoes || []).forEach(checaSec);
  (parsed.campos || []).forEach(checaCampo);
  (parsed.elementos_visuais || []).forEach(checaVis);
  const score = totalPeso > 0 ? Math.round((atendidoPeso / totalPeso) * 100) : 0;
  const status = score >= 90 ? 'conforme' : score >= 60 ? 'parcial' : 'nao_conforme';

  return {
    status,
    score,
    validadoEm: new Date().toISOString(),
    modelo: 'claude-haiku-4-5-20251001',
    secoes: parsed.secoes || [],
    campos: parsed.campos || [],
    elementos_visuais: parsed.elementos_visuais || [],
    problemas: parsed.problemas || [],
    resumo: parsed.resumo || '',
  };
}

// Roda validação em background e atualiza o JSONB do recurso quando termina.
// Não retorna nada — silencia erros pra não impactar o fluxo principal.
async function _validarDocBackground(recursoId, docId) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return;
    const docs = rec.documentos || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return;
    const doc = docs[idx];
    if (!doc.templateId) return;
    const tpl = await repos.docTemplates.findById(doc.templateId);
    if (!tpl) return;

    const arq = await db.getOne(
      `SELECT mime_type, data FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!arq) return;

    const validacao = await _validarDocComTemplate(arq.data, arq.mimeType, tpl);

    // Re-busca o recurso (pode ter mudado) e atualiza só o doc
    const recAtual = await repos.recursos.findById(recursoId);
    const docsAtual = recAtual.documentos || [];
    const idx2 = docsAtual.findIndex(d => d.id === docId);
    if (idx2 === -1) return;
    docsAtual[idx2] = { ...docsAtual[idx2], validacao, updatedAt: new Date().toISOString() };
    await repos.recursos.updateById(recursoId, {
      documentos: JSON.stringify(docsAtual),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[validar-doc-bg] erro:', e.message);
  }
}

async function handleValidarDocumento(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = rec.documentos || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return sendError(res, 404, 'Documento não encontrado');
    const doc = docs[idx];
    if (!doc.templateId) return sendError(res, 400, 'Documento não tem template associado');
    const tpl = await repos.docTemplates.findById(doc.templateId);
    if (!tpl) return sendError(res, 404, 'Template não encontrado');
    const arq = await db.getOne(
      `SELECT mime_type, data FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!arq) return sendError(res, 400, 'Documento sem arquivo anexado');

    const validacao = await _validarDocComTemplate(arq.data, arq.mimeType, tpl);
    docs[idx] = { ...doc, validacao, updatedAt: new Date().toISOString() };
    await repos.recursos.updateById(recursoId, {
      documentos: JSON.stringify(docs),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { validacao });
  } catch (e) {
    console.error('[validar-doc]', e);
    sendError(res, 400, e.message);
  }
}

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
  const detalhes = [];
  for (const c of contracts) {
    const dias = await _calcularDiasAtivos(c.id, ano, mes);
    if (dias >= 2) {
      detalhes.push({ contractId: c.id, name: c.name, statusAtual: c.status, diasAtivos: dias });
    }
  }
  detalhes.sort((a, b) => b.diasAtivos - a.diasAtivos);
  const n = detalhes.length;
  const valorPorContrato = _cobrancaPorContrato(n);
  const valorContratos = n * valorPorContrato;
  const total = COBRANCA_TAXA_FIXA + valorContratos;
  return {
    ano, mes,
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
    if (!await _eAdmin(req)) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
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
    if (!await _eAdmin(req)) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
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
    if (!await _eAdmin(req)) return sendError(res, 403, 'Apenas admin pode acessar cobrança');
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
      tipo:           body.tipo || '',
      tipoLabel:      body.tipoLabel || body.tipo || '',
      templateId:     body.templateId || null,
      dataEmissao:    body.dataEmissao || '',
      dataVencimento: body.dataVencimento || '',
      responsavel:    body.responsavel || '',
      resultado:      body.resultado || '',
      observacoes:    body.observacoes || '',
      nomeArquivo:    body.nomeArquivo || null,
      validacao:      null,  // preenchido após validação por IA quando há arquivo + template
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    };
    const documentos = (rec.documentos || []).concat(doc);
    const { envelope } = await writeCollection('recursos', 'recursos',
      (repo) => repo.updateById(recursoId, { documentos: JSON.stringify(documentos), updatedAt: new Date().toISOString() })
    );
    sendJson(res, envelope);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutDocumento(recursoId, docId, body, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = rec.documentos || [];
    const dIdx = docs.findIndex(d => d.id === docId);
    if (dIdx === -1) return sendError(res, 404, 'Documento não encontrado');
    docs[dIdx] = { ...docs[dIdx], ...body, id: docId, updatedAt: new Date().toISOString() };
    const { envelope } = await writeCollection('recursos', 'recursos',
      (repo) => repo.updateById(recursoId, { documentos: JSON.stringify(docs), updatedAt: new Date().toISOString() })
    );
    sendJson(res, envelope);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteDocumento(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const docs = (rec.documentos || []).filter(d => d.id !== docId);
    // Apaga também o arquivo físico (BYTEA) vinculado, se houver
    await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [recursoId, docId]);
    const { envelope } = await writeCollection('recursos', 'recursos',
      (repo) => repo.updateById(recursoId, { documentos: JSON.stringify(docs), updatedAt: new Date().toISOString() })
    );
    sendJson(res, envelope);
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Arquivos de documentos de recursos (BYTEA no PG) ============
const ARQ_DOC_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
];
const ARQ_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB por arquivo

function _slugifyForFilename(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, '_')                       // não-alfanum → _
    .replace(/^_+|_+$/g, '');                             // trim _
}

// Formato: AAAA_MM_DD_TipoDoc_Nome_Pessoa.ext
function _buildArquivoFilename({ nomeRecurso, tipoDoc, filenameOriginal }) {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  const tipo   = _slugifyForFilename(tipoDoc) || 'Doc';
  const pessoa = _slugifyForFilename(nomeRecurso) || 'Pessoa';
  const m = String(filenameOriginal || '').match(/\.[a-zA-Z0-9]+$/);
  const ext = m ? m[0].toLowerCase() : '.bin';
  return `${ano}_${mes}_${dia}_${tipo}_${pessoa}${ext}`;
}

function handlePostRecursoDocArquivo(recursoId, docId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = ARQ_DOC_MAX_BYTES + 64 * 1024; // file + overhead multipart

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      req.destroy();
      sendError(res, 413, `Arquivo muito grande (máximo ${Math.floor(ARQ_DOC_MAX_BYTES / 1024 / 1024)} MB)`);
    } else {
      chunks.push(c);
    }
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);
      const arq = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhum arquivo enviado');
      // FIX C-02: bypass — sem '!arq.contentType', omitir o Content-Type no
      // multipart pulava o check inteiro e permitia subir HTML/SVG com script.
      if (!arq.contentType || !ARQ_DOC_ALLOWED_TYPES.includes(arq.contentType)) {
        return sendError(res, 400, `Tipo não permitido. Use: PDF, JPG ou PNG`);
      }
      if (arq.data.length > ARQ_DOC_MAX_BYTES) {
        return sendError(res, 413, `Arquivo excede ${Math.floor(ARQ_DOC_MAX_BYTES / 1024 / 1024)} MB`);
      }

      const rec = await repos.recursos.findById(recursoId);
      if (!rec) return sendError(res, 404, 'Recurso não encontrado');
      const docs = rec.documentos || [];
      const docIdx = docs.findIndex(d => d.id === docId);
      if (docIdx === -1) return sendError(res, 404, 'Documento não encontrado');
      const doc = docs[docIdx];

      // Renomeia: AAAA_MM_DD_Tipo_Nome.ext
      const filename = _buildArquivoFilename({
        nomeRecurso: rec.nome,
        tipoDoc: doc.tipoLabel || doc.tipo || 'Documento',
        filenameOriginal: arq.filename,
      });

      // Apaga arquivo anterior do mesmo doc (se existir) — substitui
      await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [recursoId, docId]);

      const arqId = generateId('arq');
      await db.query(
        `INSERT INTO recurso_doc_arquivos
         (id, recurso_id, doc_id, filename, filename_original, mime_type, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [arqId, recursoId, docId, filename, arq.filename || null, arq.contentType || 'application/octet-stream', arq.data.length, arq.data]
      );

      // Atualiza JSONB do doc com referência ao arquivo (sem o BYTEA)
      docs[docIdx] = {
        ...doc,
        arquivo: {
          id: arqId,
          filename,
          filenameOriginal: arq.filename || null,
          mimeType: arq.contentType || 'application/octet-stream',
          sizeBytes: arq.data.length,
          uploadedAt: new Date().toISOString(),
        },
        nomeArquivo: filename, // mantém compat com campo legado
        updatedAt: new Date().toISOString(),
      };
      await repos.recursos.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      });

      sendJson(res, { ok: true, arquivo: docs[docIdx].arquivo });

      // Trigger validação em background se houver template associado.
      // Não bloqueia a resposta — o frontend faz refresh e pega o validacao.
      if (docs[docIdx].templateId) {
        setImmediate(() => _validarDocBackground(recursoId, docId));
      }
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleGetRecursoDocArquivo(recursoId, docId, res) {
  try {
    const row = await db.getOne(
      `SELECT filename, mime_type, data FROM recurso_doc_arquivos
       WHERE recurso_id = $1 AND doc_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [recursoId, docId]
    );
    if (!row) return sendError(res, 404, 'Arquivo não encontrado');
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.filename)}"`,
      'Content-Length': row.data.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(row.data);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleDeleteRecursoDocArquivo(recursoId, docId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    await db.query('DELETE FROM recurso_doc_arquivos WHERE recurso_id = $1 AND doc_id = $2', [recursoId, docId]);
    // Remove referência do JSONB do doc
    const docs = rec.documentos || [];
    const dIdx = docs.findIndex(d => d.id === docId);
    if (dIdx !== -1) {
      const { arquivo, nomeArquivo, ...rest } = docs[dIdx];
      docs[dIdx] = { ...rest, updatedAt: new Date().toISOString() };
      await repos.recursos.updateById(recursoId, {
        documentos: JSON.stringify(docs),
        updatedAt: new Date().toISOString(),
      });
    }
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

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
  } catch (e) { sendError(res, 500, e.message); }
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
      [id, userId, String(body.nome || 'Layout').slice(0, 60), JSON.stringify(widgets), body.isDefault === true]
    );
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutDashLayout(req, id, body, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    const widgets = Array.isArray(body.widgets) ? body.widgets : [];
    const row = await db.getOne(
      `UPDATE dashboard_layouts SET nome = $3, widgets = $4, is_default = $5, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, String(body.nome || 'Layout').slice(0, 60), JSON.stringify(widgets), body.isDefault === true]
    );
    if (!row) return sendError(res, 404, 'Layout não encontrado');
    if (body.isDefault === true) {
      await db.query(
        'UPDATE dashboard_layouts SET is_default = FALSE WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }
    sendJson(res, row);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteDashLayout(req, id, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return sendError(res, 401, 'Não autenticado');
    await db.query('DELETE FROM dashboard_layouts WHERE id = $1 AND user_id = $2', [id, userId]);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
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
  const contract = await db.getOne('SELECT name, endereco FROM contracts WHERE id = $1', [contractId]);
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
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostItemEstoque(body, res) {
  try {
    const id = generateId('item');
    const row = await db.getOne(
      `INSERT INTO itens_estoque (id, codigo, descricao, unidade, categoria, estoque_minimo, custo_medio, notas, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
      [id, body.codigo || null, String(body.descricao || '').slice(0, 200),
       body.unidade || null, body.categoria || null,
       parseFloat(body.estoqueMinimo) || 0, parseFloat(body.custoMedio) || 0,
       body.notas || null]
    );
    sendJson(res, row);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutItemEstoque(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE itens_estoque SET
         codigo=$2, descricao=$3, unidade=$4, categoria=$5,
         estoque_minimo=$6, notas=$7, ativo=$8, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, body.codigo || null, String(body.descricao || '').slice(0, 200),
       body.unidade || null, body.categoria || null,
       parseFloat(body.estoqueMinimo) || 0,
       body.notas || null, body.ativo !== false]
    );
    if (!row) return sendError(res, 404, 'Item não encontrado');
    sendJson(res, row);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteItemEstoque(id, res) {
  try {
    // Soft delete (preserva histórico de movimentações)
    await db.query('UPDATE itens_estoque SET ativo=FALSE, updated_at=NOW() WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
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
  } catch (e) { sendError(res, 500, e.message); }
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
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutAlmoxarifado(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE almoxarifados SET nome=$2, contract_id=$3, endereco=$4, ativo=$5
       WHERE id=$1 RETURNING *`,
      [id, String(body.nome || '').slice(0, 100), body.contractId || null,
       body.endereco || null, body.ativo !== false]
    );
    if (!row) return sendError(res, 404, 'Almoxarifado não encontrado');
    sendJson(res, row);
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteAlmoxarifado(id, res) {
  try {
    await db.query('UPDATE almoxarifados SET ativo=FALSE WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
}

// ── Movimentações (núcleo do módulo) ──
async function handleListMovimentacoes(query, res) {
  try {
    const conds = [];
    const vals = [];
    if (query.itemId)    { vals.push(query.itemId);    conds.push(`m.item_id = $${vals.length}`); }
    if (query.almoxId)   { vals.push(query.almoxId);   conds.push(`(m.almoxarifado_origem_id = $${vals.length} OR m.almoxarifado_destino_id = $${vals.length})`); }
    if (query.contractId){ vals.push(query.contractId);conds.push(`m.contract_id = $${vals.length}`); }
    if (query.tipo)      { vals.push(query.tipo);      conds.push(`m.tipo = $${vals.length}`); }
    if (query.from)      { vals.push(query.from);      conds.push(`m.data >= $${vals.length}`); }
    if (query.to)        { vals.push(query.to);        conds.push(`m.data <= $${vals.length}`); }
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
  } catch (e) { sendError(res, 500, e.message); }
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
    const origemId  = await _resolveAlmoxId(body.almoxarifadoOrigemId);
    const destinoId = await _resolveAlmoxId(body.almoxarifadoDestinoId);
    if (tipo === 'entrada' && !destinoId) return sendError(res, 400, 'Entrada precisa almoxarifado destino');
    if (tipo === 'saida'   && !origemId)  return sendError(res, 400, 'Saída precisa almoxarifado origem');
    if (tipo === 'transferencia' && (!origemId || !destinoId)) return sendError(res, 400, 'Transferência precisa origem e destino');
    if (tipo === 'transferencia' && origemId === destinoId) return sendError(res, 400, 'Origem e destino não podem ser iguais');

    const result = await db.withTransaction(async (client) => {
      const id = generateId('mov');
      const movRow = (await client.query(
        `INSERT INTO estoque_movimentacoes
          (id, item_id, almoxarifado_origem_id, almoxarifado_destino_id, tipo,
           quantidade, custo_unit, contract_id, data, documento, user_id, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [id, itemId, origemId, destinoId, tipo, qtd, custo,
         body.contractId || null, body.data || new Date().toISOString().split('T')[0],
         body.documento || null, body.userId || null, body.notas || null]
      )).rows[0];

      // Atualiza saldos por tipo
      if (tipo === 'entrada')        await _ajustarSaldo(client, itemId, destinoId, qtd);
      else if (tipo === 'saida')     await _ajustarSaldo(client, itemId, origemId, -qtd);
      else if (tipo === 'transferencia') {
        await _ajustarSaldo(client, itemId, origemId, -qtd);
        await _ajustarSaldo(client, itemId, destinoId, qtd);
      } else if (tipo === 'ajuste') {
        // ajuste: quantidade pode ser negativa (perda) ou positiva (encontrou)
        await _ajustarSaldo(client, itemId, destinoId || origemId, qtd * (body.sinal === '-' ? -1 : 1));
      }

      // Atualiza custo médio ponderado em entradas (CMV)
      if (tipo === 'entrada' && custo > 0) {
        const item = (await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [itemId])).rows[0];
        const saldoTotal = (await client.query(
          'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
          [itemId]
        )).rows[0].s;
        // Saldo já foi atualizado acima — saldoAnterior = saldoTotal - qtd
        const saldoAnt = parseFloat(saldoTotal) - qtd;
        const custoMedAnt = parseFloat(item?.custo_medio) || 0;
        const novoCustoMedio = saldoTotal > 0
          ? ((saldoAnt * custoMedAnt) + (qtd * custo)) / parseFloat(saldoTotal)
          : custo;
        await client.query(
          'UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1',
          [itemId, novoCustoMedio]
        );
      }
      return movRow;
    });

    sendJson(res, db.rowToCamel(result));
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteMovimentacao(id, res) {
  try {
    // Reverte o saldo antes de apagar (transação)
    await db.withTransaction(async (client) => {
      const m = (await client.query('SELECT * FROM estoque_movimentacoes WHERE id = $1', [id])).rows[0];
      if (!m) return;
      const qtd = parseFloat(m.quantidade);
      if (m.tipo === 'entrada')              await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      else if (m.tipo === 'saida')           await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
      else if (m.tipo === 'transferencia') {
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      } else if (m.tipo === 'ajuste') {
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id || m.almoxarifado_origem_id, -qtd);
      }
      await client.query('DELETE FROM estoque_movimentacoes WHERE id = $1', [id]);
    });
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
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
    const itens = itensAtivos.map(i => {
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
  } catch (e) { sendError(res, 500, e.message); }
}

// ============ Solicitações de Compra ============
// Normaliza itens na criação (encarregado): só descrição + qtd + observações (sem preço/cotações).
function _normalizaItensInicial(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((it) => ({
    itemEstoqueId: it.itemEstoqueId || null,
    descricao: (it.descricao || '').trim(),
    qtd: parseFloat(it.qtd) || 0,
    observacoes: it.observacoes || '',
    tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
    cotacoes: [],
    cotacaoEscolhidaIdx: null,
    precoUnit: 0,
  })).filter((it) => it.descricao && it.qtd > 0);
}

// Normaliza itens na avaliação (financeiro): cada item com cotações + cotacaoEscolhidaIdx.
// Retorna { itens, total, fornecedorIdEscolhido } onde fornecedorIdEscolhido é o fornecedor
// da primeira cotação escolhida (usado pra criar a Conta a Pagar).
function _normalizaItensComCotacoes(arr) {
  if (!Array.isArray(arr)) return { itens: [], total: 0, fornecedorIdEscolhido: null };
  let fornecedorIdEscolhido = null;
  const itens = arr.map((it) => {
    const cotacoes = Array.isArray(it.cotacoes) ? it.cotacoes.map((c) => ({
      fornecedorId: c.fornecedorId || null,
      fornecedorNome: (c.fornecedorNome || '').trim(),
      precoUnit: parseFloat(c.precoUnit) || 0,
      link: c.link || '',
      observacoes: c.observacoes || '',
    })) : [];
    const idx = (it.cotacaoEscolhidaIdx != null && cotacoes[it.cotacaoEscolhidaIdx])
      ? it.cotacaoEscolhidaIdx : (cotacoes.length > 0 ? 0 : null);
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
  }).filter((it) => it.descricao && it.qtd > 0);
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
    if (query.status) { params.push(query.status); where.push(`status = $${params.length}`); }
    if (query.contractId) { params.push(query.contractId); where.push(`contract_id = $${params.length}`); }
    if (query.solicitanteUserId) { params.push(query.solicitanteUserId); where.push(`solicitante_user_id = $${params.length}`); }
    const sql = `SELECT * FROM solicitacoes_compra ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { solicitacoes: rows });
  } catch (e) { sendError(res, 500, e.message); }
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
      status: 'pendente_avaliacao',
    };
    const created = await repos.solicitacoesCompra.create(data);
    sendJson(res, { solicitacao: created });
  } catch (e) { sendError(res, 400, e.message); }
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
    const result = await repos.solicitacoesCompra.updateById(id, allowed);
    sendJson(res, { solicitacao: result });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteSolicitacaoCompra(id, res) {
  try {
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status === 'aprovada') return sendError(res, 400, 'Solicitação aprovada não pode ser excluída');
    await repos.solicitacoesCompra.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
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
    if (query.status)     { params.push(query.status);     where.push(`status = $${params.length}`); }
    if (query.contractId) { params.push(query.contractId); where.push(`contract_id = $${params.length}`); }
    const sql = `SELECT * FROM manutencoes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { manutencoes: rows });
  } catch (e) { sendError(res, 500, e.message); }
}

// 1ª etapa — solicitante: apenas o equipamento e o problema.
async function handlePostManutencao(req, body, res) {
  try {
    const equipamento = (body.equipamento || '').trim();
    if (!equipamento) return sendError(res, 400, 'Informe o equipamento');
    const data = {
      id: generateId('man'),
      equipamento,
      contractId: body.contractId || null,
      problema: (body.problema || '').trim(),
      status: 'solicitada',
      custo: 0,
      custoEstimado: 0,
      observacoes: (body.observacoes || '').trim(),
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
    };
    const created = await repos.manutencoes.create(data);
    sendJson(res, { manutencao: created });
  } catch (e) { sendError(res, 400, e.message); }
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
    if (body.contractId !== undefined)  allowed.contractId = body.contractId || null;
    if (body.problema !== undefined)    allowed.problema = (body.problema || '').trim();
    if (body.observacoes !== undefined) allowed.observacoes = (body.observacoes || '').trim();
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) { sendError(res, 400, e.message); }
}

// 2ª etapa — equipe de compras: define oficina, prazo e custo estimado.
async function handleAvaliarManutencao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'manutencao:avaliar')) {
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
      custoEstimado: parseFloat(body.custoEstimado) || 0,
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
  } catch (e) { sendError(res, 400, e.message); }
}

// 3ª etapa — gerência aprova.
async function handleAprovarManutencao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'manutencao:aprovar')) {
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
  } catch (e) { sendError(res, 400, e.message); }
}

// 3ª etapa — gerência rejeita.
async function handleRejeitarManutencao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'manutencao:aprovar')) {
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
  } catch (e) { sendError(res, 400, e.message); }
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
      custo: parseFloat(body.custo) || 0,
    };
    if (body.observacoes != null && String(body.observacoes).trim()) {
      allowed.observacoes = String(body.observacoes).trim();
    }
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleCancelarManutencao(req, id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status === 'retornado') return sendError(res, 400, 'Manutenção concluída não pode ser cancelada');
    if (atual.status === 'cancelada') return sendError(res, 400, 'Manutenção já cancelada');
    const result = await repos.manutencoes.updateById(id, { status: 'cancelada' });
    sendJson(res, { manutencao: result });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteManutencao(id, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    await repos.manutencoes.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleAvaliarSolicitacao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'solicitacoes-compra:avaliar')) {
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
    if (!await _temPermissao(req, 'solicitacoes-compra:avaliar')) {
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
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleAprovarSolicitacao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'solicitacoes-compra:aprovar')) {
      return sendError(res, 403, 'Sem permissão para aprovar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (sol.status === 'pendente_avaliacao') {
      return sendError(res, 400, 'Solicitação aguarda avaliação do financeiro antes de poder ser aprovada');
    }
    if (!fluxoCompra.podeTransicionar(sol.status, 'aprovar')) return sendError(res, 400, `Solicitação já está ${sol.status}`);

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
    if (!await _temPermissao(req, 'solicitacoes-compra:avaliar')) {
      return sendError(res, 403, 'Sem permissão para registrar compras');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'comprar')) {
      return sendError(res, 400, `Só é possível registrar compra de solicitações aprovadas (atual: ${sol.status})`);
    }

    const venc = body.dataVencimento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
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
        [cpId,
         `Solicitação de compra #${sol.numero || id.slice(-6)}${numeroPedido ? ' · pedido ' + numeroPedido : ''}`,
         sol.valorTotal, venc, fornecedorId, sol.contractId,
         sol.justificativa || '', 'Estoque']
      );

      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'comprada',
             comprador_user_id = $2, comprador_nome = $3, comprado_em = NOW(),
             numero_pedido = $4, data_prevista_entrega = $5,
             conta_pagar_id = $6, fornecedor_id = COALESCE($7, fornecedor_id), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, req.user?.id || null, req.user?.name || req.user?.email || null,
         numeroPedido || null, dataPrevistaEntrega, cpId, fornecedorId]
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
    if (!await _temPermissao(req, 'solicitacoes-compra:receber')) {
      return sendError(res, 403, 'Sem permissão para confirmar recebimento');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'receber')) {
      return sendError(res, 400, `Só é possível receber solicitações compradas (atual: ${sol.status})`);
    }

    const itensSol = Array.isArray(sol.itens) ? sol.itens : (typeof sol.itens === 'string' ? JSON.parse(sol.itens) : []);
    if (!itensSol.length) return sendError(res, 400, 'Solicitação sem itens');
    const destinoId = sol.almoxarifadoDestinoId || await ensureAlmoxarifadoCentral();
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
          [movId, it.itemEstoqueId, destinoId, it.qtd, it.precoUnit || 0, sol.contractId,
           dataReceb, nfReceb || `Solicitação ${id}`, req.user?.id || null,
           `Recebida por ${req.user?.name || ''}`.trim()]
        );
        await _ajustarSaldo(client, it.itemEstoqueId, destinoId, parseFloat(it.qtd));
        // Recalcula custo médio ponderado
        if ((parseFloat(it.precoUnit) || 0) > 0) {
          const item = (await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [it.itemEstoqueId])).rows[0];
          const saldoTotal = parseFloat((await client.query(
            'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
            [it.itemEstoqueId]
          )).rows[0].s) || 0;
          const saldoAnt = saldoTotal - parseFloat(it.qtd);
          const custoMedAnt = parseFloat(item?.custo_medio) || 0;
          const novoCustoMedio = saldoTotal > 0
            ? ((saldoAnt * custoMedAnt) + (parseFloat(it.qtd) * parseFloat(it.precoUnit))) / saldoTotal
            : parseFloat(it.precoUnit);
          await client.query('UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1', [it.itemEstoqueId, novoCustoMedio]);
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
        [id, req.user?.id || null, req.user?.name || req.user?.email || null,
         dataReceb, nfReceb || null, obsReceb || null, JSON.stringify(movIds)]
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
    if (!await _temPermissao(req, 'solicitacoes-compra:aprovar')) {
      return sendError(res, 403, 'Sem permissão para rejeitar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'rejeitar')) return sendError(res, 400, `Solicitação já está ${sol.status}`);

    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'rejeitada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
      motivoRejeicao: body.motivo || '',
    });
    sendJson(res, { solicitacao: result });
  } catch (e) { sendError(res, 400, e.message); }
}

// ============ Frota / Veículos ============
async function handleListVeiculos(res) {
  try { sendJson(res, await repos.veiculos.getEnvelope()); }
  catch (e) { sendError(res, 500, e.message); }
}

function _allowedVeiculoFields(body) {
  const allowed = {};
  const fields = ['placa','modelo','marca','tipo','observacoes','status','contractId','endereco'];
  for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f] || null; }
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
    const created = await repos.veiculos.create(data);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutVeiculo(id, body, res) {
  try {
    const allowed = _allowedVeiculoFields(body);
    const result = await repos.veiculos.updateById(id, allowed);
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteVeiculo(id, res) {
  try {
    await repos.veiculos.removeById(id);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutVeiculoKm(id, body, res) {
  try {
    const km = parseInt(body.km);
    if (!(km >= 0)) return sendError(res, 400, 'KM inválido');
    const result = await repos.veiculos.updateById(id, { kmAtual: km, kmAtualizadoEm: new Date() });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutVeiculoLocalizacao(id, body, res) {
  try {
    const lat = body.lat ? parseFloat(body.lat) : null;
    const lng = body.lng ? parseFloat(body.lng) : null;
    const result = await repos.veiculos.updateById(id, {
      lat, lng, endereco: body.endereco || null, localizadoEm: new Date(),
    });
    if (!result) return sendError(res, 404, 'Veículo não encontrado');
    sendJson(res, { veiculo: result });
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePostVeiculoPlano(veiculoId, body, res) {
  try {
    if (!body.descricao) return sendError(res, 400, 'Descrição obrigatória');
    if (!body.intervaloKm && !body.intervaloMeses) return sendError(res, 400, 'Informe intervaloKm e/ou intervaloMeses');
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
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutVeiculoPlano(veiculoId, planoId, body, res) {
  try {
    const allowed = {};
    if (body.descricao !== undefined) allowed.descricao = body.descricao;
    if (body.intervaloKm !== undefined) allowed.intervaloKm = body.intervaloKm ? parseInt(body.intervaloKm) : null;
    if (body.intervaloMeses !== undefined) allowed.intervaloMeses = body.intervaloMeses ? parseInt(body.intervaloMeses) : null;
    if (body.ultimoKm !== undefined) allowed.ultimoKm = body.ultimoKm ? parseInt(body.ultimoKm) : null;
    if (body.ultimaData !== undefined) allowed.ultimaData = body.ultimaData || null;
    if (body.ativo !== undefined) allowed.ativo = !!body.ativo;
    await repos.veiculoPlanos.updateById(planoId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteVeiculoPlano(veiculoId, planoId, res) {
  try {
    await repos.veiculoPlanos.removeById(planoId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
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
      custo: body.custo ? parseFloat(body.custo) : null,
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
      if (Object.keys(planoUpd).length) await repos.veiculoPlanos.updateById(body.planoId, planoUpd);
    }
    // Atualiza KM atual do veículo se a manutenção informou KM maior
    if (data.km) {
      const veic = await repos.veiculos.findById(veiculoId);
      if (veic && data.km > (parseInt(veic.kmAtual) || 0)) {
        await repos.veiculos.updateById(veiculoId, { kmAtual: data.km, kmAtualizadoEm: new Date() });
      }
    }

    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutVeiculoManutencao(veiculoId, manId, body, res) {
  try {
    const allowed = {};
    const fields = ['tipo','descricao','data','observacoes','planoId','fornecedorId'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f] || null; }
    if (body.km !== undefined) allowed.km = body.km ? parseInt(body.km) : null;
    if (body.custo !== undefined) allowed.custo = body.custo ? parseFloat(body.custo) : null;
    if (body.arquivo !== undefined) allowed.arquivo = body.arquivo ? JSON.stringify(body.arquivo) : null;
    await repos.veiculoManutencoes.updateById(manId, allowed);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteVeiculoManutencao(veiculoId, manId, res) {
  try {
    await repos.veiculoManutencoes.removeById(manId);
    sendJson(res, await repos.veiculos.getEnvelope());
  } catch (e) { sendError(res, 400, e.message); }
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
        id, contractId, body.parentId || null, parseInt(body.ordem) || 0,
        String(body.nome || '').slice(0, 200),
        body.dataInicioPlan || null, body.dataFimPlan || null,
        body.dataInicioReal || null, body.dataFimReal || null,
        parseFloat(body.pesoPct) || 0, parseFloat(body.execPct) || 0,
        parseFloat(body.custoPlan) || 0,
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
    const fields = ['parent_id', 'ordem', 'nome', 'data_inicio_plan', 'data_fim_plan',
      'data_inicio_real', 'data_fim_real', 'peso_pct', 'exec_pct', 'custo_plan',
      'predecessoras', 'notas'];
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
      custo_plan: parseFloat(body.custoPlan) || 0,
      predecessoras: Array.isArray(body.predecessoras) ? body.predecessoras : [],
      notas: body.notas ?? null,
    };
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const vals = fields.map(f => map[f]);
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
    await db.query('DELETE FROM atividades WHERE id = $1 AND contract_id = $2', [atvId, contractId]);
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

// ============ Assinaturas digitais do RDO ============
const ASSINATURA_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ASSINATURA_MAX_BYTES = 2 * 1024 * 1024; // 2MB — assinatura é leve
const ASSINATURA_PAPEIS = new Set(['encarregado', 'cliente', 'fiscal', 'engenheiro', 'outro']);

function handlePostRdoAssinatura(rdoId, req, res) {
  const contentType = req.headers['content-type'] || '';
  const mBoundary = contentType.match(/boundary=(.+)$/);
  if (!mBoundary) return sendError(res, 400, 'Content-Type multipart esperado');
  const boundary = mBoundary[1].replace(/^"|"$/g, '');

  const chunks = [];
  let totalSize = 0;
  const MAX_TOTAL = ASSINATURA_MAX_BYTES + 32 * 1024;

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_TOTAL) {
      req.destroy();
      sendError(res, 413, 'Assinatura muito grande (máx 2 MB)');
    } else {
      chunks.push(c);
    }
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const arq = parts.find(p => p.filename && p.data && p.data.length > 0);
      if (!arq) return sendError(res, 400, 'Nenhuma imagem enviada');
      // FIX A-05: Content-Type obrigatório (antes `arq.contentType &&` permitia bypass).
      if (!arq.contentType || !ASSINATURA_ALLOWED_TYPES.includes(arq.contentType)) {
        return sendError(res, 400, 'Tipo não permitido (use PNG, JPG ou WEBP)');
      }
      // Defesa em profundidade: magic-bytes batem com o MIME declarado.
      if (!_isAllowedImageMagic(arq.data)) {
        return sendError(res, 400, 'Arquivo não é uma imagem válida');
      }
      if (arq.data.length > ASSINATURA_MAX_BYTES) {
        return sendError(res, 413, 'Assinatura excede 2 MB');
      }

      const papelPart = parts.find(p => p.name === 'papel' && !p.filename);
      const nomePart  = parts.find(p => p.name === 'nome'  && !p.filename);
      const papel = papelPart ? papelPart.data.toString('utf8').trim() : '';
      const nome  = nomePart  ? nomePart.data.toString('utf8').trim()  : '';
      if (!papel || !ASSINATURA_PAPEIS.has(papel)) return sendError(res, 400, 'Papel inválido');
      if (!nome) return sendError(res, 400, 'Nome obrigatório');

      const rdo = await repos.rdos.findById(rdoId);
      if (!rdo) return sendError(res, 404, 'RDO não encontrado');

      const id = generateId('ass');
      const ip = req.socket?.remoteAddress || (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || null;
      const ua = (req.headers['user-agent'] || '').slice(0, 500);

      await db.query(
        `INSERT INTO rdo_assinaturas (id, rdo_id, papel, nome, imagem, mime_type, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, rdoId, papel, nome, arq.data, arq.contentType || 'image/png', ip, ua]
      );

      sendJson(res, { ok: true, id, papel, nome, sizeBytes: arq.data.length, createdAt: new Date().toISOString() });
    } catch (e) {
      sendError(res, 400, e.message);
    }
  });
}

async function handleListRdoAssinaturas(rdoId, res) {
  try {
    const rows = await db.getMany(
      `SELECT id, rdo_id, papel, nome, mime_type, ip, created_at
       FROM rdo_assinaturas WHERE rdo_id = $1 ORDER BY created_at ASC`,
      [rdoId]
    );
    sendJson(res, { assinaturas: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleGetRdoAssinatura(rdoId, assId, res) {
  try {
    const row = await db.getOne(
      `SELECT mime_type, imagem FROM rdo_assinaturas WHERE id = $1 AND rdo_id = $2`,
      [assId, rdoId]
    );
    if (!row) return sendError(res, 404, 'Assinatura não encontrada');
    res.writeHead(200, {
      'Content-Type': row.mimeType || 'image/png',
      'Content-Length': row.imagem.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(row.imagem);
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleDeleteRdoAssinatura(rdoId, assId, res) {
  try {
    await db.query('DELETE FROM rdo_assinaturas WHERE id = $1 AND rdo_id = $2', [assId, rdoId]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

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
    const recursosIds = [...new Set(rows.map(r => r.recursoId).filter(Boolean))];
    const tipoPorDocId = new Map();
    if (recursosIds.length > 0) {
      const ph = recursosIds.map((_, i) => `$${i + 1}`).join(', ');
      const recs = await db.getMany(`SELECT id, documentos FROM recursos WHERE id IN (${ph})`, recursosIds);
      for (const rec of recs) {
        for (const d of (rec.documentos || [])) {
          tipoPorDocId.set(d.id, d.tipoLabel || d.tipo || '—');
        }
      }
    }
    const total = rows.reduce((s, r) => s + (r.sizeBytes || 0), 0);
    sendJson(res, {
      arquivos: rows.map(r => ({ ...r, tipoDoc: tipoPorDocId.get(r.docId) || '—' })),
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
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ativos = recursos.filter(r => r.status === 'funcionario');
    let totalDocs = 0, vigentes = 0, vencidos = 0, vencendo = 0, pendentes = 0;

    ativos.forEach(r => {
      (r.documentos || []).forEach(doc => {
        totalDocs++;
        if (!doc.dataVencimento) { pendentes++; return; }
        const venc = new Date(doc.dataVencimento + 'T12:00:00');
        const dias = Math.ceil((venc - hoje) / 86400000);
        if (dias < 0) vencidos++;
        else if (dias <= 30) vencendo++;
        else vigentes++;
      });
    });

    const colaboradoresComVencidos = ativos.filter(r =>
      (r.documentos || []).some(doc => {
        if (!doc.dataVencimento) return false;
        return Math.ceil((new Date(doc.dataVencimento + 'T12:00:00') - hoje) / 86400000) < 0;
      })
    ).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ totalAtivos: ativos.length, colaboradoresComVencidos, totalDocs, vigentes, vencidos, vencendo, pendentes }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// Export for testing; start only when run directly
async function bootstrap() {
  try {
    const db = require('./db');
    await db.ping();
    console.log('[server] Postgres conectado');

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
    try { await ensureAlmoxarifadoCentral(); } catch (e) { console.warn('[server] Aviso ao criar almox central:', e.message); }
    // Limpa sessões expiradas a cada hora
    setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 60 * 60 * 1000);

    // Cleanup do rate-limit persistente — diário, mantém últimos 7 dias.
    // Roda 1x no boot pra limpar acúmulo de deploys anteriores, depois a cada 24h.
    pgRateLimit.cleanup(7).then(n => n > 0 && console.log(`[pg-rate-limit] cleanup inicial: ${n} rows`)).catch(() => {});
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
                await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [sub.endpoint]).catch(() => {});
              }
            }
          }
        } catch (e) { console.warn('[push] Erro ao enviar:', e.message); }
      };

      setInterval(async () => {
        try {
          const hoje = new Date().toISOString().split('T')[0];
          const em7 = new Date(); em7.setDate(em7.getDate() + 7); const em7str = em7.toISOString().split('T')[0];
          const em3 = new Date(); em3.setDate(em3.getDate() + 3); const em3str = em3.toISOString().split('T')[0];

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
              data: { url: '/#/contratos' }
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
              data: { url: '/#/contas-pagar' }
            });
          }
        } catch (e) { console.warn('[push] Erro no scheduler:', e.message); }
      }, 60 * 60 * 1000); // a cada 1 hora
    }
  } catch (e) {
    console.error('[server] Falha ao conectar no Postgres:', e.message);
    process.exit(1);
  }
}

// ── Backup automático diário por email ─────────────────────────────────────
const BACKUP_EMAIL = process.env.BACKUP_EMAIL || process.env.ADMIN_EMAIL || '';
const BACKUP_HOUR  = parseInt(process.env.BACKUP_HOUR || '3', 10); // 3h da manhã (UTC)

async function _runEmailBackup() {
  const email = require('./lib/email');
  if (!BACKUP_EMAIL) {
    console.warn('[backup] BACKUP_EMAIL não configurado — pulando envio');
    return;
  }
  try {
    const safe = async (fn) => { try { return await fn(); } catch { return []; } };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const payload = {
      _meta: { version: APP_VERSION, generatedAt: new Date().toISOString(), format: 'rhino-backup-v1' },
      contracts:      await safe(() => repos.contracts.findAllWithChildren()),
      saidas:         await safe(() => repos.saidas.findAll()),
      caixa:          await safe(() => repos.caixa.findAll()),
      base:           await safe(() => repos.baseItems.findAll()),
      socios:         await safe(() => repos.socios.findAll()),
      investimentos:  await safe(() => repos.investimentos.findAll()),
      notas_fiscais:  await safe(() => repos.notasFiscais.findAll()),
      tipos_base:     await safe(() => repos.tiposBase.findAll()),
      clientes:       await safe(() => repos.clientes.findAll()),
      fornecedores:   await safe(() => repos.fornecedores.findAll()),
      contas_pagar:   await safe(() => repos.contasPagar.findAll()),
      niveis_acesso:  await safe(() => repos.niveisAcesso.findAll()),
      recursos:       await safe(() => repos.recursos.findAll()),
      doc_templates:  await safe(() => repos.docTemplates.findAll()),
    };
    const json = JSON.stringify(payload);
    const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
    const filename = `rhino-backup-${timestamp}.json`;
    const base64 = Buffer.from(json).toString('base64');

    const tableRows = Object.entries(payload)
      .filter(([k]) => k !== '_meta')
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${k}</td><td style="padding:4px 0;font-weight:600;">${Array.isArray(v) ? v.length : '—'} registros</td></tr>`)
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
      attachments: [{ filename, content: base64, type: 'application/json', disposition: 'attachment' }],
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
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), BACKUP_HOUR, 0, 0, 0));
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
  const r = await email.send({ to: data.to, subject: data.subject, html: data.html, text: data.text });
  if (!r.ok && !r.dev) throw new Error(r.error || 'falha ao enviar e-mail'); // throw → pg-boss reprocessa
}

function _registerWorkers() {
  if (process.env.NODE_ENV === 'test') return; // sem fila em CI/test
  queue.work('email', _emailWorker)
    .then((ok) => { if (ok) console.log('[queue] worker de e-mail registrado'); })
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
    .catch(err => {
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
    .catch(err => {
      console.error('[server] Falha no bootstrap:', err);
      process.exit(1);
    });
}

module.exports = { __server: server };
