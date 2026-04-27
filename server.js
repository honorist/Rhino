const http = require('http');
const fs = require('fs');
const path = require('path');
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
        version: process.env.APP_VERSION || 'dev',
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
    version: process.env.APP_VERSION || 'dev',
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
    allowed.updatedAt = new Date().toISOString();

    const { envelope, result } = await writeCollection('clientes', 'clientes', (repo) => repo.updateById(id, allowed));
    if (!result) return sendError(res, 404, 'Cliente não encontrado');
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
    if (baseItems.some(b => b.tipoKey === tipo.key)) {
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
    const fields = ['descricao', 'fornecedorId', 'numeroNF', 'contractId', 'category', 'observacoes'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (body.valor !== undefined) allowed.valor = parseFloat(body.valor) || 0;
    if (body.dataEmissao !== undefined) allowed.dataEmissao = body.dataEmissao || null;
    if (body.dataVencimento !== undefined) allowed.dataVencimento = body.dataVencimento || null;
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
    // Remove caixa entry vinculada (se houver)
    if (conta && conta.caixaEntryId) {
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
      req.destroy();
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload muito grande' }));
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
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
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
  res.end(fs.readFileSync(filepath));
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

  // Parse body for POST/PUT requests
  const MAX_BODY_BYTES = 1_000_000; // 1 MB
  let body = '';
  let bodySize = 0;
  if (['POST', 'PUT'].includes(req.method)) {
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
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

  // Doc Templates routes
  if (pathname === '/api/doc-templates' && method === 'GET') return handleGetDocTemplates(res);
  if (pathname === '/api/doc-templates' && method === 'POST') return handlePostDocTemplate(body, res);
  if (pathname.match(/^\/api\/doc-templates\/[^/]+$/) && method === 'PUT') return handlePutDocTemplate(pathname.split('/')[3], body, res);
  if (pathname.match(/^\/api\/doc-templates\/[^/]+$/) && method === 'DELETE') return handleDeleteDocTemplate(pathname.split('/')[3], res);

  // Níveis de Acesso routes
  if (pathname === '/api/niveis-acesso' && method === 'GET') return handleGetNiveisAcesso(res);
  if (pathname.match(/^\/api\/niveis-acesso\/[^/]+$/) && method === 'PUT') {
    return handlePutNivelAcesso(pathname.split('/')[3], body, res);
  }

  // Static files
  if (pathname === '/' || pathname === '') {
    return serveStaticFile('/index.html', res);
  }

  serveStaticFile(pathname, res);
}

// ============ Níveis de Acesso handlers ============
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
    const fields = ['nome', 'tipoDocumento', 'empresaId'];
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
    // Limpa sessões expiradas a cada hora
    setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 60 * 60 * 1000);
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
