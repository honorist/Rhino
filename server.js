const http = require('http');
const fs = require('fs');
const path = require('path');

// Versão do app: APP_VERSION env > package.json > 'dev'
const APP_VERSION = process.env.APP_VERSION || (() => {
  try { return require('./package.json').version || 'dev'; } catch { return 'dev'; }
})();
const url = require('url');
const crypto = require('crypto');

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
const rateLimit = require('./lib/rate-limit');
const audit = require('./lib/audit');
const bus = require('./lib/bus');

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

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ============ Route handlers ============
async function handleGetContracts(res) {
  try {
    sendJson(res, await repos.contracts.getEnvelope());
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

async function handlePushUnsubscribe(body, res) {
  try {
    await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [body?.endpoint]);
    sendJson(res, { ok: true });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostSaida(contractId, body, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contract not found');

    const valor = parseFloat(body.value) || 0;
    const dataSaida = body.date || new Date().toISOString().split('T')[0];

    const nfsAll = await repos.notasFiscais.findAll();
    const nfsContrato = nfsAll.filter(nf => nf.contractId === contractId);
    const totalMedidoAtual = nfsContrato.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
    if (contract.value > 0 && totalMedidoAtual + valor > parseFloat(contract.value) + 0.01) {
      return sendError(res, 400,
        `BM ultrapassa o valor do contrato. Disponível para medir: R$ ${(parseFloat(contract.value) - totalMedidoAtual).toFixed(2).replace('.', ',')}`);
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
        prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30),
        observacoes: body.description || '',
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
      type: body.type || 'material',
      description: body.description || '',
      value: valor,
      date: dataSaida,
      nfId: nf.id,
      numeroBm: numeroNf,
      createdAt: new Date().toISOString(),
    };
    await repos.saidas.create(saida);

    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutSaida(id, body, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saida not found');

    const allowedSaida = {};
    const fields = ['type', 'description', 'date'];
    for (const f of fields) { if (body[f] !== undefined) allowedSaida[f] = body[f]; }
    if (body.value !== undefined) allowedSaida.value = parseFloat(body.value) || 0;

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
        const outrasDaNfAtual = (await repos.saidas.findAll()).filter(s => s.nfId === nf.id && s.id !== id);
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

async function handleDeleteSaida(id, res) {
  try {
    const saida = await repos.saidas.findById(id);
    if (!saida) return sendError(res, 404, 'Saída não encontrada');

    if (saida.nfId) {
      const nf = await repos.notasFiscais.findById(saida.nfId);
      if (nf) {
        if (nf.emitida) {
          return sendError(res, 400, 'Não é possível excluir saída cujo BM já foi emitido. Cancele a emissão do BM primeiro.');
        }
        const outrasSaidas = (await repos.saidas.findAll()).filter(s => s.nfId === nf.id && s.id !== id);
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

    const env = await repos.contracts.getEnvelope();
    sendJson(res, { ...env, notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
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
    const entriesOrdenadas = [...caixa.entries].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (periodoInicio && periodoFim) {
      // Show day-by-day for the selected month, or month-by-month for full year
      if (modoAno) {
        // Month-by-month for the year
        for (let m = 0; m < 12; m++) {
          const fimMes = new Date(filtroAno, m + 1, 0, 23, 59, 59, 999);
          // All entries up to end of this month
          const saldoAteOMes = entriesOrdenadas
            .filter(e => new Date(e.date) <= fimMes)
            .reduce((sum, e) => e.type === 'entrada' ? sum + e.value : sum - e.value, 0);
          historicoCaixa.push({
            data: `${filtroAno}-${String(m + 1).padStart(2, '0')}-01`,
            saldo: saldoAteOMes,
            label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m]
          });
        }
      } else {
        // Day-by-day for the selected month
        const diasNoMes = new Date(filtroAno, filtroMes, 0).getDate();
        for (let d = 1; d <= diasNoMes; d++) {
          const dia = new Date(filtroAno, filtroMes - 1, d, 23, 59, 59, 999);
          const saldoAteODia = entriesOrdenadas
            .filter(e => new Date(e.date) <= dia)
            .reduce((sum, e) => e.type === 'entrada' ? sum + e.value : sum - e.value, 0);
          historicoCaixa.push({
            data: `${filtroAno}-${String(filtroMes).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            saldo: saldoAteODia
          });
        }
      }
    } else {
      // Default: last 30 days
      for (let i = 29; i >= 0; i--) {
        const dia = new Date();
        dia.setDate(dia.getDate() - i);
        dia.setHours(23, 59, 59, 999);
        const saldoAteODia = entriesOrdenadas
          .filter(e => new Date(e.date) <= dia)
          .reduce((sum, e) => e.type === 'entrada' ? sum + e.value : sum - e.value, 0);
        historicoCaixa.push({
          data: dia.toISOString().split('T')[0],
          saldo: saldoAteODia
        });
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
    // Cada NF emitida até dataLimite gera uma entrada em: dataLimite + prazoRecebimento
    const projecaoFutura = [];
    for (let i = 1; i <= 90; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];

      // Entradas esperadas neste dia (NFs não-emitidas cujo recebimento cai nesta data)
      // NFs já emitidas não entram aqui pois a entrada no caixa já foi criada
      const entradasEsperadas = notasFiscais.notas_fiscais
        .filter(nf => !nf.emitida && nf.valor > 0)
        .filter(nf => {
          const prazo = (Number.isFinite(parseInt(nf.prazoRecebimento)) ? parseInt(nf.prazoRecebimento) : 30);
          const dtEmissao = new Date(nf.dataLimite + 'T12:00:00');
          const dtRecebimento = new Date(dtEmissao);
          dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
          return dtRecebimento.toISOString().split('T')[0] === diaStr;
        })
        .map(nf => {
          const prazo = (Number.isFinite(parseInt(nf.prazoRecebimento)) ? parseInt(nf.prazoRecebimento) : 30);
          return {
            nfId: nf.id,
            numero: nf.numero,
            contractId: nf.contractId,
            valor: nf.valor,
            dataEmissao: nf.dataLimite,
            prazoRecebimento: prazo
          };
        });

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

    // Saldo projetado acumulado para o gráfico — configurável via ?projDays (30/60/90, default 60, max 180)
    const projDays = Math.min(180, Math.max(7, parseInt(query?.projDays) || 60));
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
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// Backup: dump do PG pras pastas JSON (útil antes de refatorar ou restaurar)
async function handleBackup(res) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const dumps = {
      contracts: await repos.contracts.getEnvelope(),
      caixa: { entries: await repos.caixa.findAll() },
      base: { items: await repos.baseItems.findAll() },
      notas_fiscais: { notas_fiscais: await repos.notasFiscais.findAll() },
      contas_pagar: { contas: await repos.contasPagar.findAll() },
      clientes: { clientes: await repos.clientes.findAll() },
    };
    for (const [name, payload] of Object.entries(dumps)) {
      const filepath = path.join(BACKUPS_DIR, `${name}_pgdump_${timestamp}.json`);
      fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf8');
    }
    sendJson(res, { message: 'Backup completed', timestamp });
  } catch (e) {
    sendError(res, 400, e.message);
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
      contracts:           await safe(() => repos.contracts.findAllWithChildren()),
      saidas:              await safe(() => repos.saidas.findAll()),
      caixa:               await safe(() => repos.caixa.findAll()),
      base:                await safe(() => repos.baseItems.findAll()),
      socios:              await safe(() => repos.socios.findAll()),
      investimentos:       await safe(() => repos.investimentos.findAll()),
      notas_fiscais:       await safe(() => repos.notasFiscais.findAll()),
      tipos_base:          await safe(() => repos.tiposBase.findAll()),
      clientes:            await safe(() => repos.clientes.findAll()),
      fornecedores:        await safe(() => repos.fornecedores.findAll()),
      contas_pagar:        await safe(() => repos.contasPagar.findAll()),
      niveis_acesso:       await safe(() => repos.niveisAcesso.findAll()),
      recursos:            await safe(() => repos.recursos.findAll()),
      doc_templates:       await safe(() => repos.docTemplates.findAll()),
      users:               await safe(() => (repos.users.findAll ? repos.users.findAll() : [])),
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
    node: process.version,
    timestamp: new Date().toISOString(),
  };
  try {
    const db = require('./db');
    const ok = await db.ping();
    result.db = ok ? 'ok' : 'down';
    if (ok) {
      const ver = await db.getOne('SELECT version() AS v');
      if (ver) result.db_version = String(ver.v).split(' ')[1];
    }
  } catch (e) {
    result.db = 'down';
    result.db_error = e.message;
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
    // Logins bem sucedidos NÃO contam — evita travar usuário legítimo.
    const rlKey = rateLimit.clientKey(req, 'login:' + emailIn.toLowerCase());
    // Consulta sem consumir
    const rlPeek = rateLimit.check(rlKey, { max: 5, windowMs: 15 * 60 * 1000 });
    if (!rlPeek.ok) {
      res.setHeader('Retry-After', rlPeek.retryAfterSec);
      return sendError(res, 429, `Muitas tentativas. Tente novamente em ${rlPeek.retryAfterSec} segundos.`);
    }

    const user = await auth.findUserByEmail(emailIn);
    const ok = user ? await auth.verify(password, user.passwordHash) : false;
    if (!user || !ok) {
      // Falhou — registra tentativa no bucket
      // (rlPeek já registrou um slot acima; mantém — total de 5 falhas em 15min)
      return sendError(res, 401, 'Credenciais inválidas');
    }
    // Sucesso — devolve o slot consumido (o login certo não deve contar contra o usuário)
    rateLimit.refund(rlKey);

    const session = await auth.createSession(user.id);
    auth.setSessionCookie(res, session.id, session.expiresAt);
    await auth.bumpLastLogin(user.id);

    sendJson(res, {
      user: {
        id: user.id, email: user.email, name: user.name,
        nivelAcessoId: user.nivelAcessoId, socioId: user.socioId,
        acceptedTermsAt: user.acceptedTermsAt || null,
      },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleForgotPassword(req, body, res) {
  try {
    const emailIn = (body.email || '').trim().toLowerCase();
    if (!emailIn) return sendError(res, 400, 'Email é obrigatório');

    // Rate limit: 3 / hora por IP+email (evita spam de envio)
    const rlKey = rateLimit.clientKey(req, 'forgot:' + emailIn);
    const rl = rateLimit.check(rlKey, { max: 3, windowMs: 60 * 60 * 1000 });
    if (!rl.ok) {
      // Resposta genérica pra não vazar info de rate limit por usuário
      return sendJson(res, { ok: true, message: 'Se o email existir, enviamos as instruções.' });
    }

    const user = await auth.findUserByEmail(emailIn);
    // Sempre responde sucesso (não vazar quais emails existem)
    if (user) {
      const { token } = await auth.createResetToken(user.id);
      const origin = req.headers.origin || (req.headers['x-forwarded-proto'] && req.headers.host
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : 'http://localhost:3001');
      const link = `${origin}/?action=reset-password&token=${token}`;
      const tmpl = email.tmplResetPassword({ nome: user.name, link, expiraEm: '1 hora' });
      await email.send({ to: user.email, subject: 'Rhino — redefinir sua senha', html: tmpl.html, text: tmpl.text });
    }
    sendJson(res, { ok: true, message: 'Se o email existir, enviamos as instruções.' });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleResetPassword(body, res) {
  try {
    const token = (body.token || '').trim();
    const newPassword = body.password || '';
    if (!token || !newPassword) return sendError(res, 400, 'Token e nova senha são obrigatórios');
    if (newPassword.length < 6) return sendError(res, 400, 'Senha precisa ter no mínimo 6 caracteres');

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

async function handlePortalLogin(body, res) {
  try {
    const emailRaw = (body.email || '').trim().toLowerCase();
    const senha = body.senha || '';
    if (!emailRaw || !senha) return sendError(res, 400, 'Email e senha são obrigatórios');

    const cliente = await db.getOne(
      'SELECT id, nome, empresa, portal_password_hash FROM clientes WHERE LOWER(portal_email) = $1',
      [emailRaw]
    );
    if (!cliente || !cliente.portal_password_hash) return sendError(res, 401, 'Email ou senha incorretos');

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(senha, cliente.portal_password_hash);
    if (!ok) return sendError(res, 401, 'Email ou senha incorretos');

    const sid = generateId('pses');
    const expiresAt = new Date(Date.now() + PORTAL_SESSION_DAYS * 86400 * 1000);
    await db.query(
      'INSERT INTO portal_sessions (id, cliente_id, expires_at) VALUES ($1, $2, $3)',
      [sid, cliente.id, expiresAt.toISOString()]
    );
    res.setHeader('Set-Cookie',
      `${PORTAL_COOKIE}=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${PORTAL_SESSION_DAYS * 86400}`
    );
    sendJson(res, { ok: true, cliente: { id: cliente.id, nome: cliente.nome, empresa: cliente.empresa } });
  } catch (e) { sendError(res, 500, e.message); }
}

async function handlePortalLogout(req, res) {
  const sid = auth.parseCookies(req)[PORTAL_COOKIE];
  if (sid) await db.query('DELETE FROM portal_sessions WHERE id = $1', [sid]).catch(() => {});
  res.setHeader('Set-Cookie', `${PORTAL_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  sendJson(res, { ok: true });
}

async function handlePortalDashboard(req, res) {
  try {
    const clienteId = req.portalCliente.id;
    const [allContracts, allNfs] = await Promise.all([
      repos.contracts.findAll(),
      repos.notasFiscais.findAll(),
    ]);

    const contratos = allContracts
      .filter(c => c.clientId === clienteId)
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
    allContracts
      .filter(c => c.clientId === clienteId)
      .forEach(c => {
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
      },
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ============ Users CRUD (admin) ============
function sanitizeUser(u) {
  // Nunca devolver password_hash pro frontend
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

async function handleGetUsers(res) {
  try {
    const rows = await repos.users.findAll();
    sendJson(res, { users: rows.map(sanitizeUser) });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostUser(body, res) {
  try {
    const email = (body.email || '').trim();
    const password = body.password || '';
    if (!email || !password) return sendError(res, 400, 'Email e senha são obrigatórios');
    if (password.length < 6) return sendError(res, 400, 'Senha precisa ter no mínimo 6 caracteres');

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

async function handlePutUser(id, body, res) {
  try {
    const allowed = {};
    if (body.name !== undefined) allowed.name = body.name;
    if (body.email !== undefined) allowed.email = String(body.email).trim().toLowerCase();
    if (body.nivelAcessoId !== undefined) allowed.nivelAcessoId = body.nivelAcessoId || null;
    if (body.socioId !== undefined) allowed.socioId = body.socioId || null;
    if (body.isActive !== undefined) allowed.isActive = !!body.isActive;
    if (body.password) {
      if (String(body.password).length < 6) return sendError(res, 400, 'Senha precisa ter no mínimo 6 caracteres');
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
  try {
    if (req.user && req.user.id === id) {
      return sendError(res, 400, 'Você não pode deletar seu próprio usuário');
    }
    await repos.users.removeById(id);
    sendJson(res, { users: (await repos.users.findAll()).map(sanitizeUser) });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleMetrics(res) {
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

async function handleDeleteInvestimento(id, res) {
  try {
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
    if (!body.descricao || !body.valor || parseFloat(body.valor) <= 0) {
      return sendError(res, 400, 'Descrição e valor (>0) são obrigatórios');
    }
    const conta = {
      id: generateId('cp'),
      descricao: body.descricao || '',
      fornecedorId: body.fornecedorId || null,
      numeroNF: body.numeroNF || '',
      valor: parseFloat(body.valor) || 0,
      dataEmissao: body.dataEmissao || new Date().toISOString().split('T')[0],
      dataVencimento: body.dataVencimento || null,
      status: 'pendente',
      dataPagamento: null,
      caixaEntryId: null,
      contractId: body.contractId || null,
      category: body.category || 'fornecedor',
      observacoes: body.observacoes || '',
      recorrente: !!body.recorrente,
      periodicidade: body.periodicidade || null,
      recorrenciaOrigemId: body.recorrenciaOrigemId || null,
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

async function handlePagarConta(id, body, res) {
  try {
    const conta = await repos.contasPagar.findById(id);
    if (!conta) return sendError(res, 404, 'Conta não encontrada');
    if (conta.status === 'pago') return sendError(res, 400, 'Conta já foi paga');

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
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
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
    sendJson(res, envelope);
  } catch (e) {
    sendError(res, 400, e.message);
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
    if (!body.numero || !body.contractId || !body.dataLimite) {
      return sendError(res, 400, 'Número, contrato e data limite são obrigatórios');
    }
    const nf = {
      id: generateId('nf'),
      numero: body.numero,
      contractId: body.contractId,
      dataLimite: body.dataLimite,
      valor: parseFloat(body.valor) || 0,
      prazoRecebimento: (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30),
      observacoes: body.observacoes || '',
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

    const allowed = {};
    const fields = ['numero', 'contractId', 'observacoes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valor !== undefined) allowed.valor = parseFloat(body.valor) || 0;
    if (body.prazoRecebimento !== undefined) {
      allowed.prazoRecebimento = (Number.isFinite(parseInt(body.prazoRecebimento)) ? parseInt(body.prazoRecebimento) : 30);
    }
    if (body.dataLimite !== undefined) allowed.dataLimite = body.dataLimite || null;
    if (body.dataEmissaoReal !== undefined) allowed.dataEmissaoReal = body.dataEmissaoReal || null;
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

// Marca NF como emitida e cria entrada agendada no caixa
async function handleEmitirNotaFiscal(id, body, res) {
  try {
    const nf = await repos.notasFiscais.findById(id);
    if (!nf) return sendError(res, 404, 'Nota fiscal não encontrada');
    if (nf.emitida) return sendError(res, 400, 'Nota fiscal já foi emitida');

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

    sendJson(res, {
      notas_fiscais: await repos.notasFiscais.findAll(),
      caixa: { entries: await repos.caixa.findAll() },
      mensagem: `NF marcada como emitida. Entrada de ${nf.valor} agendada para ${dataRecebimento}`,
    });
  } catch (e) {
    sendError(res, 400, e.message);
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
      seguranca: JSON.stringify(body.seguranca || { acidente: 'nao_houve', diagnostico: '', admissoes: 0, demissoes: 0, comentarios: '' }),
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
        if (arq.contentType && !FOTO_ALLOWED_TYPES.includes(arq.contentType)) continue;
        if (arq.data.length > FOTO_MAX_BYTES) continue;
        const ext = (arq.filename.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
        const fotoId = generateId('foto');
        const filename = fotoId + ext;
        fs.writeFileSync(path.join(pastaRdo, filename), arq.data);
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

function serveStaticFile(pathname, res) {
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
  const contentTypeMap = {
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

  const contentType = contentTypeMap[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': contentType };
  // Desabilita cache para JS/CSS/HTML durante desenvolvimento — evita ter que forçar reload
  if (['.js', '.css', '.html'].includes(ext)) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  }
  res.writeHead(200, headers);
  if (ext === '.html') {
    // Injeta versão do app para que a sidebar mostre v1.x.y dinâmico
    const html = fs.readFileSync(filepath, 'utf8').replace(
      '</head>',
      `<script>window.__APP_VERSION__="${APP_VERSION}";</script></head>`
    );
    res.end(html);
  } else if (pathname === '/sw.js') {
    // Injeta a versão no Service Worker para que o cache seja invalidado a cada deploy
    // O SW usa VERSION como chave de cache; se mudar, o activate limpa o cache antigo.
    const sw = fs.readFileSync(filepath, 'utf8').replace(
      "'__RHINO_VERSION__'",
      `'rhino-v${APP_VERSION}'`
    );
    res.end(sw);
  } else {
    res.end(fs.readFileSync(filepath));
  }
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
  const pathname = parsedUrl.pathname;
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

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Multipart (upload de fotos RDO) — não passa pelo body parser JSON
  const isRdoFotoUpload = req.method === 'POST'
    && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/fotos$/.test(pathname);
  if (isRdoFotoUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname)) return;
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
      if (await applyAuthMiddleware(req, res, pathname)) return;
      const parts = pathname.split('/');
      handlePostRecursoDocArquivo(parts[3], parts[5], req, res);
    })();
    return;
  }

  // OFX import — lê o corpo raw (não é JSON), precisa pular o body parser
  const isOfxImport = req.method === 'POST' && pathname === '/api/caixa/importar-ofx';
  if (isOfxImport) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname)) return;
      handleImportarOfx(req, res);
    })();
    return;
  }

  // Multipart (upload de assinatura digital no RDO)
  const isRdoAssinaturaUpload = req.method === 'POST'
    && /^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas$/.test(pathname);
  if (isRdoAssinaturaUpload) {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname)) return;
      const parts = pathname.split('/');
      handlePostRdoAssinatura(parts[5], req, res);
    })();
    return;
  }

  // Parse body for POST/PUT requests
  const MAX_BODY_BYTES = 1_000_000; // 1 MB
  let body = '';
  let bodySize = 0;
  if (['POST', 'PUT'].includes(req.method)) {
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
        body = {};
      }
      req._auditBody = body;
      if (await applyAuthMiddleware(req, res, pathname)) return;
      await captureAuditBefore(req, pathname);
      routeRequest(pathname, req.method, body, res, parsedUrl, req);
    });
  } else {
    (async () => {
      if (await applyAuthMiddleware(req, res, pathname)) return;
      await captureAuditBefore(req, pathname);
      routeRequest(pathname, req.method, null, res, parsedUrl, req);
    })();
  }
});

// Middleware: rotas /api/* exigem sessão, exceto whitelist abaixo.
const AUTH_WHITELIST = new Set([
  '/api/health',
  '/api/metrics',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/portal/login',
]);
async function applyAuthMiddleware(req, res, pathname) {
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
    return false;
  } catch (e) {
    sendError(res, 500, e.message);
    return true;
  }
}

function routeRequest(pathname, method, body, res, parsedUrl, req) {
  // ============ Auth routes ============
  if (pathname === '/api/auth/login' && method === 'POST') return handleLogin(req, body, res);
  if (pathname === '/api/auth/logout' && method === 'POST') return handleLogout(req, res);
  if (pathname === '/api/auth/me' && method === 'GET') return handleMe(req, res);
  if (pathname === '/api/auth/forgot-password' && method === 'POST') return handleForgotPassword(req, body, res);
  if (pathname === '/api/auth/reset-password' && method === 'POST') return handleResetPassword(body, res);
  if (pathname === '/api/auth/accept-terms' && method === 'POST') return handleAcceptTerms(req, res);

  // ============ Portal do Cliente ============
  if (pathname === '/api/portal/login' && method === 'POST') return handlePortalLogin(body, res);
  if (pathname.startsWith('/api/portal/')) {
    (async () => {
      if (await applyPortalAuth(req, res)) return;
      if (pathname === '/api/portal/logout' && method === 'POST') return handlePortalLogout(req, res);
      if (pathname === '/api/portal/dashboard' && method === 'GET') return handlePortalDashboard(req, res);
      sendError(res, 404, 'Rota do portal não encontrada');
    })();
    return;
  }

  // ============ Auditoria ============
  if (pathname === '/api/audit' && method === 'GET') return handleGetAudit(parsedUrl.query, res);

  // ============ RDOs (visão global) ============
  if (pathname === '/api/rdos' && method === 'GET') return handleGetRdosGlobal(res);

  // ============ Users CRUD ============
  if (pathname === '/api/users' && method === 'GET') return handleGetUsers(res);
  if (pathname === '/api/users' && method === 'POST') return handlePostUser(body, res);
  if (pathname.match(/^\/api\/users\/[^/]+$/) && method === 'PUT') {
    return handlePutUser(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/users\/[^/]+$/) && method === 'DELETE') {
    return handleDeleteUser(pathname.split('/')[3], req, res);
  }
  // API routes
  if (pathname === '/api/contracts' && method === 'GET') {
    return handleGetContracts(res);
  }
  if (pathname === '/api/contracts' && method === 'POST') {
    return handlePostContract(body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutContract(id, body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteContract(id, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+$/) && method === 'PATCH') {
    const id = pathname.split('/')[3];
    return handlePutContract(id, body, res); // reusa PUT — já aceita campos parciais
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/saidas$/) && method === 'POST') {
    const contractId = pathname.split('/')[3];
    return handlePostSaida(contractId, body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/budget$/) && method === 'POST') {
    const contractId = pathname.split('/')[3];
    return handlePostBudgetItem(contractId, body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/budget\/[^/]+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    return handlePutBudgetItem(parts[3], parts[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/budget\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteBudgetItem(parts[3], parts[5], res);
  }
  // Atividades / Cronograma
  if (pathname.match(/^\/api\/contracts\/[^/]+\/atividades$/) && method === 'GET') {
    return handleListAtividades(pathname.split('/')[3], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/atividades$/) && method === 'POST') {
    return handlePostAtividade(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/atividades\/[^/]+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    return handlePutAtividade(parts[3], parts[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/atividades\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteAtividade(parts[3], parts[5], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/curva-s$/) && method === 'GET') {
    return handleGetCurvaS(pathname.split('/')[3], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/organograma$/) && method === 'POST') {
    const contractId = pathname.split('/')[3];
    return handlePostMembroOrganograma(contractId, body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/organograma\/[^/]+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    return handlePutMembroOrganograma(parts[3], parts[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/organograma\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteMembroOrganograma(parts[3], parts[5], body, res, parsedUrl.query);
  }

  // ── RDO ──
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos$/) && method === 'POST') {
    const contractId = pathname.split('/')[3];
    return handlePostRdo(contractId, body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    return handlePutRdo(parts[3], parts[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteRdo(parts[3], parts[5], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/fotos$/) && method === 'POST') {
    // multipart — não é tratado no body JSON parser acima, chamamos handler que consome req diretamente
    const parts = pathname.split('/');
    return handlePostRdoFoto(parts[3], parts[5], req, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/fotos\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteRdoFoto(parts[3], parts[5], parts[7], res);
  }
  // Assinaturas do RDO
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas$/) && method === 'GET') {
    const parts = pathname.split('/');
    return handleListRdoAssinaturas(parts[5], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas\/[^/]+$/) && method === 'GET') {
    const parts = pathname.split('/');
    return handleGetRdoAssinatura(parts[5], parts[7], res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/rdos\/[^/]+\/assinaturas\/[^/]+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    return handleDeleteRdoAssinatura(parts[5], parts[7], res);
  }

  // ── Aditivos ──
  if (pathname.match(/^\/api\/contracts\/[^/]+\/aditivos$/) && method === 'POST') {
    return handlePostAditivo(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/aditivos\/[^/]+$/) && method === 'PUT') {
    const p = pathname.split('/');
    return handlePutAditivo(p[3], p[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/aditivos\/[^/]+$/) && method === 'DELETE') {
    const p = pathname.split('/');
    return handleDeleteAditivo(p[3], p[5], res);
  }

  // ── Marcos ──
  if (pathname.match(/^\/api\/contracts\/[^/]+\/marcos$/) && method === 'POST') {
    return handlePostMarco(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/marcos\/[^/]+$/) && method === 'PUT') {
    const p = pathname.split('/');
    return handlePutMarco(p[3], p[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/marcos\/[^/]+$/) && method === 'DELETE') {
    const p = pathname.split('/');
    return handleDeleteMarco(p[3], p[5], res);
  }

  // ── Ocorrências ──
  if (pathname.match(/^\/api\/contracts\/[^/]+\/ocorrencias$/) && method === 'POST') {
    return handlePostOcorrencia(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/ocorrencias\/[^/]+$/) && method === 'PUT') {
    const p = pathname.split('/');
    return handlePutOcorrencia(p[3], p[5], body, res);
  }
  if (pathname.match(/^\/api\/contracts\/[^/]+\/ocorrencias\/[^/]+$/) && method === 'DELETE') {
    const p = pathname.split('/');
    return handleDeleteOcorrencia(p[3], p[5], res);
  }

  if (pathname.match(/^\/api\/saidas\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutSaida(id, body, res);
  }
  if (pathname.match(/^\/api\/saidas\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteSaida(id, res);
  }
  if (pathname === '/api/caixa' && method === 'GET') {
    return handleGetCaixa(res);
  }
  if (pathname === '/api/caixa' && method === 'POST') {
    return handlePostCaixa(body, res);
  }
  if (pathname.match(/^\/api\/caixa\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutCaixa(id, body, res);
  }
  if (pathname.match(/^\/api\/caixa\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteCaixa(id, res);
  }
  if (pathname === '/api/base' && method === 'GET') {
    return handleGetBase(res);
  }
  if (pathname === '/api/base' && method === 'POST') {
    return handlePostBase(body, res);
  }
  if (pathname.match(/^\/api\/base\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutBase(id, body, res);
  }
  if (pathname.match(/^\/api\/base\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteBase(id, res);
  }
  if (pathname.match(/^\/api\/base\/[^/]+\/allocate$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    return handleAllocateBase(id, body, res);
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
  if (pathname === '/api/health' && method === 'GET') {
    return handleHealth(res);
  }
  if (pathname === '/api/metrics' && method === 'GET') {
    return handleMetrics(res);
  }

  // Sócios routes
  if (pathname === '/api/socios' && method === 'GET') {
    return handleGetSocios(res);
  }
  if (pathname === '/api/socios' && method === 'POST') {
    return handlePostSocio(body, res);
  }
  if (pathname.match(/^\/api\/socios\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutSocio(id, body, res);
  }
  if (pathname.match(/^\/api\/socios\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteSocio(id, res);
  }

  // Investimentos routes
  if (pathname === '/api/investimentos' && method === 'GET') {
    return handleGetInvestimentos(res);
  }
  if (pathname === '/api/investimentos' && method === 'POST') {
    return handlePostInvestimento(body, res);
  }
  if (pathname.match(/^\/api\/investimentos\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteInvestimento(id, res);
  }

  // Clientes routes
  if (pathname === '/api/clientes' && method === 'GET')  return handleGetClientes(res);
  if (pathname === '/api/clientes' && method === 'POST') return handlePostCliente(body, res);
  if (pathname.match(/^\/api\/clientes\/[^/]+$/) && method === 'PUT') {
    return handlePutCliente(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/clientes\/[^/]+$/) && method === 'DELETE') {
    return handleDeleteCliente(pathname.split('/')[3], res);
  }

  // Fornecedores routes
  if (pathname === '/api/fornecedores' && method === 'GET')  return handleGetFornecedores(res);
  if (pathname === '/api/fornecedores' && method === 'POST') return handlePostFornecedor(body, res);
  if (pathname.match(/^\/api\/fornecedores\/[^/]+$/) && method === 'PUT') {
    return handlePutFornecedor(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/fornecedores\/[^/]+$/) && method === 'DELETE') {
    return handleDeleteFornecedor(pathname.split('/')[3], res);
  }

  // Tipos BASE routes
  if (pathname === '/api/tipos-base' && method === 'GET') {
    return handleGetTiposBase(res);
  }
  if (pathname === '/api/tipos-base' && method === 'POST') {
    return handlePostTipoBase(body, res);
  }
  if (pathname.match(/^\/api\/tipos-base\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutTipoBase(id, body, res);
  }
  if (pathname.match(/^\/api\/tipos-base\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteTipoBase(id, res);
  }

  // Contas a Pagar routes
  if (pathname === '/api/contas-pagar' && method === 'GET') return handleGetContasPagar(res);
  if (pathname === '/api/contas-pagar' && method === 'POST') return handlePostContaPagar(body, res);
  if (pathname.match(/^\/api\/contas-pagar\/[^/]+$/) && method === 'PUT') {
    return handlePutContaPagar(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contas-pagar\/[^/]+$/) && method === 'DELETE') {
    return handleDeleteContaPagar(pathname.split('/')[3], res);
  }
  if (pathname.match(/^\/api\/contas-pagar\/[^/]+\/pagar$/) && method === 'POST') {
    return handlePagarConta(pathname.split('/')[3], body, res);
  }
  if (pathname.match(/^\/api\/contas-pagar\/[^/]+\/estornar$/) && method === 'POST') {
    return handleEstornarConta(pathname.split('/')[3], res);
  }

  // Notas Fiscais routes
  if (pathname === '/api/notas-fiscais' && method === 'GET') {
    return handleGetNotasFiscais(res);
  }
  if (pathname === '/api/notas-fiscais' && method === 'POST') {
    return handlePostNotaFiscal(body, res);
  }
  if (pathname.match(/^\/api\/notas-fiscais\/[^/]+\/emitir$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    return handleEmitirNotaFiscal(id, body, res);
  }
  if (pathname.match(/^\/api\/notas-fiscais\/[^/]+\/cancelar-emissao$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    return handleCancelarEmissao(id, res);
  }
  if (pathname.match(/^\/api\/notas-fiscais\/[^/]+$/) && method === 'PUT') {
    const id = pathname.split('/')[3];
    return handlePutNotaFiscal(id, body, res);
  }
  if (pathname.match(/^\/api\/notas-fiscais\/[^/]+$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    return handleDeleteNotaFiscal(id, res);
  }

  // Recursos routes
  if (pathname === '/api/recursos' && method === 'GET')  return handleGetRecursos(res);
  if (pathname === '/api/recursos' && method === 'POST') return handlePostRecurso(body, res);
  if (pathname.match(/^\/api\/recursos\/[^/]+$/) && method === 'PUT')    return handlePutRecurso(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/recursos\/[^/]+$/) && method === 'DELETE') return handleDeleteRecurso(pathname.split('/')[3], res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/folgas$/) && method === 'POST') return handleAddFolga(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/folgas\/[^/]+$/) && method === 'DELETE') return handleDeleteFolga(pathname.split('/')[3], pathname.split('/')[5], res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/folgas\/[^/]+\/passagem$/) && method === 'POST') return handleComprarPassagem(pathname.split('/')[3], pathname.split('/')[5], body, res);

  // Documentos routes
  if (pathname === '/api/documentos/status' && method === 'GET') return handleGetDocumentosStatus(res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos$/) && method === 'POST') return handleAddDocumento(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos\/[^/]+$/) && method === 'PUT') return handlePutDocumento(pathname.split('/')[3], pathname.split('/')[5], body, res);
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos\/[^/]+$/) && method === 'DELETE') return handleDeleteDocumento(pathname.split('/')[3], pathname.split('/')[5], res);
  // Arquivos anexados a documentos (BYTEA no PG)
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/) && method === 'POST') {
    return handlePostRecursoDocArquivo(pathname.split('/')[3], pathname.split('/')[5], req, res);
  }
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/) && method === 'GET') {
    return handleGetRecursoDocArquivo(pathname.split('/')[3], pathname.split('/')[5], res);
  }
  if (pathname.match(/^\/api\/recursos\/[^/]+\/documentos\/[^/]+\/arquivo$/) && method === 'DELETE') {
    return handleDeleteRecursoDocArquivo(pathname.split('/')[3], pathname.split('/')[5], res);
  }
  // Admin: lista todos os arquivos do sistema
  if (pathname === '/api/admin/arquivos' && method === 'GET') {
    return handleGetAdminArquivos(res);
  }

  // ── Estoque ──
  if (pathname === '/api/estoque/itens' && method === 'GET')  return handleListItensEstoque(res);
  if (pathname === '/api/estoque/itens' && method === 'POST') return handlePostItemEstoque(body, res);
  if (pathname.match(/^\/api\/estoque\/itens\/[^/]+$/) && method === 'PUT')    return handlePutItemEstoque(pathname.split('/')[4], body, res);
  if (pathname.match(/^\/api\/estoque\/itens\/[^/]+$/) && method === 'DELETE') return handleDeleteItemEstoque(pathname.split('/')[4], res);
  if (pathname === '/api/estoque/almoxarifados' && method === 'GET')  return handleListAlmoxarifados(res);
  if (pathname === '/api/estoque/almoxarifados' && method === 'POST') return handlePostAlmoxarifado(body, res);
  if (pathname.match(/^\/api\/estoque\/almoxarifados\/[^/]+$/) && method === 'PUT')    return handlePutAlmoxarifado(pathname.split('/')[4], body, res);
  if (pathname.match(/^\/api\/estoque\/almoxarifados\/[^/]+$/) && method === 'DELETE') return handleDeleteAlmoxarifado(pathname.split('/')[4], res);
  if (pathname === '/api/estoque/movimentacoes' && method === 'GET')  return handleListMovimentacoes(parsedUrl.query, res);
  if (pathname === '/api/estoque/movimentacoes' && method === 'POST') return handlePostMovimentacao(body, res);
  if (pathname.match(/^\/api\/estoque\/movimentacoes\/[^/]+$/) && method === 'DELETE') return handleDeleteMovimentacao(pathname.split('/')[4], res);
  if (pathname === '/api/estoque/saldo' && method === 'GET') return handleGetSaldoEstoque(parsedUrl.query, res);
  if (pathname === '/api/estoque/visao-geral' && method === 'GET') return handleGetVisaoGeral(res);

  // ── Solicitações de Compra ──
  if (pathname === '/api/solicitacoes-compra' && method === 'GET')  return handleListSolicitacoesCompra(parsedUrl.query, res);
  if (pathname === '/api/solicitacoes-compra' && method === 'POST') return handlePostSolicitacaoCompra(req, body, res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+$/) && method === 'PUT')    return handlePutSolicitacaoCompra(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+$/) && method === 'DELETE') return handleDeleteSolicitacaoCompra(pathname.split('/')[3], res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+\/avaliar$/) && method === 'POST')  return handleAvaliarSolicitacao(req, pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+\/cancelar$/) && method === 'POST') return handleCancelarSolicitacao(req, pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+\/aprovar$/) && method === 'POST')  return handleAprovarSolicitacao(req, pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/solicitacoes-compra\/[^/]+\/rejeitar$/) && method === 'POST') return handleRejeitarSolicitacao(req, pathname.split('/')[3], body, res);

  // ── Frota / Veículos ──
  if (pathname === '/api/veiculos' && method === 'GET')  return handleListVeiculos(res);
  if (pathname === '/api/veiculos' && method === 'POST') return handlePostVeiculo(body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+$/) && method === 'PUT')    return handlePutVeiculo(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+$/) && method === 'DELETE') return handleDeleteVeiculo(pathname.split('/')[3], res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/km$/) && method === 'PUT')           return handlePutVeiculoKm(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/localizacao$/) && method === 'PUT')  return handlePutVeiculoLocalizacao(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/planos$/) && method === 'POST')                 return handlePostVeiculoPlano(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/planos\/[^/]+$/) && method === 'PUT')           return handlePutVeiculoPlano(pathname.split('/')[3], pathname.split('/')[5], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/planos\/[^/]+$/) && method === 'DELETE')        return handleDeleteVeiculoPlano(pathname.split('/')[3], pathname.split('/')[5], res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/manutencoes$/) && method === 'POST')            return handlePostVeiculoManutencao(req, pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/manutencoes\/[^/]+$/) && method === 'PUT')      return handlePutVeiculoManutencao(pathname.split('/')[3], pathname.split('/')[5], body, res);
  if (pathname.match(/^\/api\/veiculos\/[^/]+\/manutencoes\/[^/]+$/) && method === 'DELETE')   return handleDeleteVeiculoManutencao(pathname.split('/')[3], pathname.split('/')[5], res);

  // Dashboard layouts (por usuário)
  if (pathname === '/api/dashboard/layouts' && method === 'GET')  return handleListDashLayouts(req, res);
  if (pathname === '/api/dashboard/layouts' && method === 'POST') return handlePostDashLayout(req, body, res);
  if (pathname.match(/^\/api\/dashboard\/layouts\/[^/]+$/) && method === 'PUT')    return handlePutDashLayout(req, pathname.split('/')[4], body, res);
  if (pathname.match(/^\/api\/dashboard\/layouts\/[^/]+$/) && method === 'DELETE') return handleDeleteDashLayout(req, pathname.split('/')[4], res);

  // Doc Templates routes
  if (pathname === '/api/doc-templates' && method === 'GET') return handleGetDocTemplates(res);
  if (pathname === '/api/doc-templates' && method === 'POST') return handlePostDocTemplate(body, res);
  if (pathname.match(/^\/api\/doc-templates\/[^/]+$/) && method === 'PUT') return handlePutDocTemplate(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/doc-templates\/[^/]+$/) && method === 'DELETE') return handleDeleteDocTemplate(pathname.split('/')[3], res);

  // ── F6: Anomaly detection ──
  if (pathname === '/api/anomalias' && method === 'GET') return handleGetAnomalias(res);

  // ── F7: Recurring payments ──
  if (pathname === '/api/contas-pagar/processar-recorrencias' && method === 'POST') return handleProcessarRecorrencias(res);

  // ── F13: LGPD ──
  if (pathname === '/api/lgpd/export' && method === 'GET') return handleLgpdExport(req, res);
  if (pathname === '/api/lgpd/delete-account' && method === 'POST') return handleLgpdDelete(req, res);

  // ── F15: AI Chat ──
  if (pathname === '/api/ai/chat' && method === 'POST') return handleAiChat(body, res);

  // ── F16: AI Classify ──
  if (pathname === '/api/ai/classify-expense' && method === 'POST') return handleAiClassify(body, res);

  // ── F5: OFX Import ──
  if (pathname === '/api/caixa/importar-ofx' && method === 'POST') return handleImportarOfx(req, res);

  // ── F18: Feature Flags ──
  if (pathname === '/api/feature-flags' && method === 'GET') return handleGetFeatureFlags(res);
  if (pathname.match(/^\/api\/feature-flags\/[^/]+$/) && method === 'PUT') return handlePutFeatureFlag(pathname.split('/')[3], body, res);

  // Busca global cross-collection (M3)
  if (pathname === '/api/search' && method === 'GET') return handleGlobalSearch(parsedUrl.query, res);

  // Real-time event stream (G1)
  if (pathname === '/api/stream' && method === 'GET') {
    return bus.attach(req, res, { userId: req.user?.id, userEmail: req.user?.email });
  }
  // Lista de quem está online (G1) — útil pra avatar bar
  if (pathname === '/api/online' && method === 'GET') {
    return sendJson(res, { online: bus.online() });
  }

  // Níveis de Acesso routes
  if (pathname === '/api/niveis-acesso' && method === 'GET') return handleGetNiveisAcesso(res);
  if (pathname.match(/^\/api\/niveis-acesso\/[^/]+$/) && method === 'PUT') {
    return handlePutNivelAcesso(pathname.split('/')[3], body, res);
  }

  // Push Notification routes
  if (pathname === '/api/push/vapid-public-key' && method === 'GET') {
    const pk = process.env.VAPID_PUBLIC_KEY || null;
    return sendJson(res, { publicKey: pk });
  }
  if (pathname === '/api/push/subscribe' && method === 'POST') {
    const userId = req._userId || null;
    return handlePushSubscribe(body, userId, res);
  }
  if (pathname === '/api/push/unsubscribe' && method === 'POST') {
    return handlePushUnsubscribe(body, res);
  }

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
function _calcProximaData(dateStr, periodicidade) {
  const d = new Date(dateStr + 'T12:00:00');
  switch (periodicidade) {
    case 'semanal':    d.setDate(d.getDate() + 7); break;
    case 'quinzenal':  d.setDate(d.getDate() + 15); break;
    case 'trimestral': d.setMonth(d.getMonth() + 3); break;
    case 'semestral':  d.setMonth(d.getMonth() + 6); break;
    case 'anual':      d.setFullYear(d.getFullYear() + 1); break;
    default:           d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

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
    await new Promise((resolve, reject) => {
      req.on('data', d => chunks.push(d));
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

// ============ Documentos de colaboradores handlers ============
async function handleAddDocumento(recursoId, body, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Recurso não encontrado');
    const doc = {
      id: generateId('doc'),
      tipo:           body.tipo || '',
      tipoLabel:      body.tipoLabel || body.tipo || '',
      dataEmissao:    body.dataEmissao || '',
      dataVencimento: body.dataVencimento || '',
      responsavel:    body.responsavel || '',
      resultado:      body.resultado || '',
      observacoes:    body.observacoes || '',
      nomeArquivo:    body.nomeArquivo || null,
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
      if (arq.contentType && !ARQ_DOC_ALLOWED_TYPES.includes(arq.contentType)) {
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
    const rows = await db.getMany(
      `SELECT m.*, i.descricao AS item_desc, i.unidade,
              ao.nome AS origem_nome, ad.nome AS destino_nome,
              c.name AS contract_name
       FROM estoque_movimentacoes m
       LEFT JOIN itens_estoque i ON i.id = m.item_id
       LEFT JOIN almoxarifados ao ON ao.id = m.almoxarifado_origem_id
       LEFT JOIN almoxarifados ad ON ad.id = m.almoxarifado_destino_id
       LEFT JOIN contracts c ON c.id = m.contract_id
       ${where} ORDER BY m.data DESC, m.created_at DESC LIMIT ${lim}`,
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
  if (!nivelId) return true; // admin sem perfil ativo
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
    // Encarregado cria com itens (descrição + qtd + observações) + justificativa.
    // Destino e preços são definidos pelo financeiro na avaliação.
    const itens = _normalizaItensInicial(body.itens);
    if (!itens.length) return sendError(res, 400, 'Adicione pelo menos um item válido');
    const id = generateId('sol');
    const data = {
      id,
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
      contractId: null,
      almoxarifadoDestinoId: null,
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

async function handleAvaliarSolicitacao(req, id, body, res) {
  try {
    if (!await _temPermissao(req, 'solicitacoes-compra:avaliar')) {
      return sendError(res, 403, 'Sem permissão para avaliar solicitações');
    }
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status !== 'pendente_avaliacao') {
      return sendError(res, 400, `Solicitação já está ${atual.status}`);
    }
    const { itens, total, fornecedorIdEscolhido } = _normalizaItensComCotacoes(body.itens);
    if (!itens.length) return sendError(res, 400, 'Itens inválidos');
    if (itens.some((it) => it.cotacoes.length === 0)) {
      return sendError(res, 400, 'Cada item precisa ter ao menos uma cotação');
    }

    const allowed = {
      itens: JSON.stringify(itens),
      valorTotal: total,
      contractId: body.contractId || null,
      almoxarifadoDestinoId: await _resolveAlmoxId(body.almoxarifadoDestinoId || 'auto-central'),
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
    if (atual.status === 'aprovada' || atual.status === 'cancelada') {
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
    if (sol.status !== 'pendente_aprovacao') return sendError(res, 400, `Solicitação já está ${sol.status}`);

    const itensSol = Array.isArray(sol.itens) ? sol.itens : (typeof sol.itens === 'string' ? JSON.parse(sol.itens) : []);
    if (!itensSol.length) return sendError(res, 400, 'Solicitação sem itens');
    const destinoId = sol.almoxarifadoDestinoId || await ensureAlmoxarifadoCentral();

    // Tudo dentro de uma transação: cria movimentações + conta a pagar + atualiza solicitação.
    const result = await db.withTransaction(async (client) => {
      const movIds = [];
      for (const it of itensSol) {
        // Só cria entrada quando há item de estoque vinculado.
        if (!it.itemEstoqueId || !(parseFloat(it.qtd) > 0)) continue;
        const movId = generateId('mov');
        await client.query(
          `INSERT INTO estoque_movimentacoes
            (id, item_id, almoxarifado_destino_id, tipo, quantidade, custo_unit, contract_id, data, documento, user_id, notas)
           VALUES ($1,$2,$3,'entrada',$4,$5,$6,$7,$8,$9,$10)`,
          [movId, it.itemEstoqueId, destinoId, it.qtd, it.precoUnit || 0, sol.contractId,
           new Date().toISOString().split('T')[0], `Solicitação ${id}`, req.user?.id || null,
           `Aprovada por ${req.user?.name || ''}`.trim()]
        );
        await _ajustarSaldo(client, it.itemEstoqueId, destinoId, parseFloat(it.qtd));
        // Recalcula custo médio ponderado quando há custo informado
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

      // Cria Conta a Pagar com valor total
      const cpId = generateId('cp');
      const venc = body.dataVencimento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      await client.query(
        `INSERT INTO contas_pagar
          (id, descricao, valor, data_vencimento, fornecedor_id, contract_id, status, observacoes, category)
         VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8)`,
        [cpId, `Solicitação de compra #${sol.numero || id.slice(-6)}`, sol.valorTotal,
         venc, sol.fornecedorId, sol.contractId,
         sol.justificativa || '', 'Estoque']
      );

      // Atualiza a solicitação
      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'aprovada', aprovador_user_id = $2, aprovador_nome = $3, aprovado_em = NOW(),
             conta_pagar_id = $4, movimentacao_ids = $5, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, req.user?.id || null, req.user?.name || req.user?.email || null,
         cpId, JSON.stringify(movIds)]
      );
      return db.rowToCamel(upd.rows[0]);
    });

    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[aprovar-solicitacao]', e);
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
    if (sol.status !== 'pendente_aprovacao') return sendError(res, 400, `Solicitação já está ${sol.status}`);

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
      if (arq.contentType && !ASSINATURA_ALLOWED_TYPES.includes(arq.contentType)) {
        return sendError(res, 400, 'Tipo não permitido (use PNG, JPG ou WEBP)');
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

    await auth.bootstrapAdmin();
    await auth.purgeExpiredSessions();
    // Garante que o almoxarifado Central exista (idempotente)
    try { await ensureAlmoxarifadoCentral(); } catch (e) { console.warn('[server] Aviso ao criar almox central:', e.message); }
    // Limpa sessões expiradas a cada hora
    setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 60 * 60 * 1000);

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

if (require.main === module) {
  bootstrap().finally(() => {
    server.listen(PORT, () => {
      console.log(`Rhino running at http://localhost:${PORT}`);
    });
  });
} else {
  bootstrap().finally(() => server.listen(PORT));
}

module.exports = { __server: server };
