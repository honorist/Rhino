const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ============ Data persistence ============
function readData(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
    return {};
  }
}

function writeData(filename, data) {
  const filepath = path.join(DATA_DIR, filename);

  // Backup before write
  if (fs.existsSync(filepath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(BACKUPS_DIR, `${filename.replace('.json', '')}_${timestamp}.json`);
    fs.copyFileSync(filepath, backupPath);

    // Keep max 10 backups per file
    const pattern = filename.replace('.json', '');
    const backups = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith(pattern))
      .sort()
      .reverse();

    for (let i = 10; i < backups.length; i++) {
      fs.unlinkSync(path.join(BACKUPS_DIR, backups[i]));
    }
  }

  const jsonString = JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, jsonString, 'utf8');
}

function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}${random}`;
}

// ============ Route handlers ============
function handleGetContracts(res) {
  const data = readData('contracts.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostContract(body, res) {
  try {
    if (!body.name || !body.client) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nome e cliente são obrigatórios' }));
      return;
    }
    const data = readData('contracts.json');
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
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      tendencyDate: body.tendencyDate || '',
      status: body.status || 'ativo',
      endereco: body.endereco || '',
      lat: body.lat || '',
      lng: body.lng || '',
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.contracts.push(contract);
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutContract(id, body, res) {
  try {
    const data = readData('contracts.json');
    const idx = data.contracts.findIndex(c => c.id === id);

    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contract not found' }));
      return;
    }

    const allowed = {};
    const fields = ['name', 'client', 'clientId', 'clientDocument', 'clientEmail', 'clientPhone', 'value', 'currency', 'startDate', 'endDate', 'tendencyDate', 'status', 'notes', 'lat', 'lng', 'endereco', 'contractNumber'];
    for (const f of fields) { if (body[f] !== undefined) allowed[f] = body[f]; }
    if (allowed.value !== undefined) allowed.value = parseFloat(allowed.value) || 0;

    data.contracts[idx] = {
      ...data.contracts[idx],
      ...allowed,
      updatedAt: new Date().toISOString()
    };
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteContract(id, res) {
  try {
    const data = readData('contracts.json');
    data.contracts = (data.contracts || []).filter(c => c.id !== id);
    data.saidas = (data.saidas || []).filter(s => s.contractId !== id);
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePostSaida(contractId, body, res) {
  try {
    const data = readData('contracts.json');

    if (!data.contracts.find(c => c.id === contractId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contract not found' }));
      return;
    }

    const saida = {
      id: generateId('sai'),
      contractId,
      type: body.type || 'material',
      description: body.description || '',
      value: parseFloat(body.value) || 0,
      date: body.date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    data.saidas.push(saida);
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutSaida(id, body, res) {
  try {
    const data = readData('contracts.json');
    const idx = data.saidas.findIndex(s => s.id === id);

    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Saida not found' }));
      return;
    }

    const allowedSaida = {};
    const saidaFields = ['type', 'description', 'value', 'date'];
    for (const f of saidaFields) { if (body[f] !== undefined) allowedSaida[f] = body[f]; }
    if (allowedSaida.value !== undefined) allowedSaida.value = parseFloat(allowedSaida.value) || 0;

    data.saidas[idx] = { ...data.saidas[idx], ...allowedSaida, id, updatedAt: new Date().toISOString() };
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteSaida(id, res) {
  try {
    const data = readData('contracts.json');
    data.saidas = data.saidas.filter(s => s.id !== id);
    writeData('contracts.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleGetCaixa(res) {
  const data = readData('caixa.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostCaixa(body, res) {
  try {
    const data = readData('caixa.json');
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
      createdAt: new Date().toISOString()
    };
    data.entries.push(entry);
    writeData('caixa.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutCaixa(id, body, res) {
  try {
    const data = readData('caixa.json');
    const idx = data.entries.findIndex(e => e.id === id);

    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Entry not found' }));
      return;
    }

    const allowedCxa = {};
    const cxaFields = ['type', 'description', 'value', 'date', 'contractId', 'baseItemId', 'category', 'notes'];
    for (const f of cxaFields) { if (body[f] !== undefined) allowedCxa[f] = body[f]; }
    if (allowedCxa.value !== undefined) allowedCxa.value = parseFloat(allowedCxa.value) || 0;

    data.entries[idx] = { ...data.entries[idx], ...allowedCxa };
    writeData('caixa.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteCaixa(id, res) {
  try {
    const data = readData('caixa.json');
    data.entries = data.entries.filter(e => e.id !== id);
    writeData('caixa.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleGetBase(res) {
  const data = readData('base.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostBase(body, res) {
  try {
    const data = readData('base.json');
    const item = {
      id: generateId('bas'),
      description: body.description || '',
      type: body.type || 'variavel',
      value: parseFloat(body.value) || 0,
      date: body.date || new Date().toISOString().split('T')[0],
      allocations: [],
      notes: body.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.items.push(item);
    writeData('base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutBase(id, body, res) {
  try {
    const data = readData('base.json');
    const idx = data.items.findIndex(i => i.id === id);

    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Item not found' }));
      return;
    }

    const allowedBase = {};
    const baseFields = ['description', 'type', 'value', 'date', 'notes'];
    for (const f of baseFields) { if (body[f] !== undefined) allowedBase[f] = body[f]; }
    if (allowedBase.value !== undefined) allowedBase.value = parseFloat(allowedBase.value) || 0;

    data.items[idx] = {
      ...data.items[idx],
      ...allowedBase,
      updatedAt: new Date().toISOString()
    };
    writeData('base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteBase(id, res) {
  try {
    const data = readData('base.json');
    data.items = data.items.filter(i => i.id !== id);
    writeData('base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleAllocateBase(id, body, res) {
  try {
    const baseData = readData('base.json');
    const baseItemIdx = baseData.items.findIndex(i => i.id === id);

    if (baseItemIdx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Base item not found' }));
      return;
    }

    const baseItem = baseData.items[baseItemIdx];
    const allocationValue = parseFloat(body.value) || 0;
    const totalAllocated = (baseItem.allocations || []).reduce((sum, a) => sum + a.value, 0);

    if (totalAllocated + allocationValue > baseItem.value) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Cannot allocate more than available. Available: ${baseItem.value - totalAllocated}` }));
      return;
    }

    const allocation = {
      id: generateId('alc'),
      contractId: body.contractId,
      value: allocationValue,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    // Update base item immutably to avoid partial-write inconsistency
    baseData.items[baseItemIdx] = {
      ...baseItem,
      allocations: [...(baseItem.allocations || []), allocation],
      updatedAt: new Date().toISOString()
    };
    writeData('base.json', baseData);

    // Add matching caixa entry
    const caixaData = readData('caixa.json');
    caixaData.entries.push({
      id: generateId('cxa'),
      type: 'saida',
      description: `Alocação BASE: ${baseItem.description}`,
      value: allocationValue,
      date: allocation.date,
      contractId: body.contractId,
      baseItemId: id,
      category: 'base',
      notes: '',
      createdAt: new Date().toISOString()
    });
    writeData('caixa.json', caixaData);

    // Add to contract's baseAllocations (create if not exists)
    const contractData = readData('contracts.json');
    const contract = contractData.contracts.find(c => c.id === body.contractId);
    if (contract) {
      if (!contract.baseAllocations) contract.baseAllocations = [];
      contract.baseAllocations.push(allocation);
      writeData('contracts.json', contractData);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      base: baseData,
      caixa: caixaData,
      contracts: contractData
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDashboard(res, query) {
  try {
    const contracts = readData('contracts.json');
    const caixa = readData('caixa.json');
    const base = readData('base.json');
    const notasFiscais = readData('notas_fiscais.json');

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
      .slice(0, 5);

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
          const prazo = parseInt(nf.prazoRecebimento) || 30;
          const dtEmissao = new Date(nf.dataLimite + 'T12:00:00');
          const dtRecebimento = new Date(dtEmissao);
          dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
          return dtRecebimento.toISOString().split('T')[0] === diaStr;
        })
        .map(nf => {
          const prazo = parseInt(nf.prazoRecebimento) || 30;
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
    const contasPagar = readData('contas_pagar.json');
    const hojeStrCP = new Date().toISOString().split('T')[0];
    const em7DiasStrCP = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; })();
    const contasPagarStatus = { vencidas: 0, proximasVencer: 0, pendentes: 0, totalPendente: 0 };
    contasPagar.contas.filter(c => c.status === 'pendente').forEach(c => {
      contasPagarStatus.pendentes++;
      contasPagarStatus.totalPendente += c.valor;
      if (c.dataVencimento && c.dataVencimento < hojeStrCP) contasPagarStatus.vencidas++;
      else if (c.dataVencimento && c.dataVencimento <= em7DiasStrCP) contasPagarStatus.proximasVencer++;
    });

    // Saldo projetado acumulado para o gráfico (próximos 60 dias, semanalmente)
    // Inclui entradas de NFs e saídas de contas a pagar (vencidas já são deduzidas no início)
    const contasVencidasTotal = contasPagar.contas
      .filter(c => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStrCP)
      .reduce((s, c) => s + (c.valor || 0), 0);
    const saldoProjetado = [];
    let saldoAcumulado = caixaBalance - contasVencidasTotal;
    for (let i = 1; i <= 60; i++) {
      const dia = new Date();
      dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasDia = projecaoFutura.find(p => p.data === diaStr);
      if (entradasDia) saldoAcumulado += entradasDia.totalEntradas;
      // Subtrair contas a pagar com vencimento neste dia futuro
      const saidasCP = contasPagar.contas
        .filter(c => c.status === 'pendente' && c.dataVencimento === diaStr)
        .reduce((s, c) => s + (c.valor || 0), 0);
      if (saidasCP > 0) saldoAcumulado -= saidasCP;
      // Agregar apenas a cada 7 dias para não poluir o gráfico
      if (i % 7 === 0 || i === 1) {
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
      contasPagarStatus
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dashboard));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleBackup(res) {
  try {
    writeData('contracts.json', readData('contracts.json'));
    writeData('caixa.json', readData('caixa.json'));
    writeData('base.json', readData('base.json'));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Backup completed' }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Sócios handlers ============
function handleGetSocios(res) {
  const data = readData('socios.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostSocio(body, res) {
  try {
    const data = readData('socios.json');
    const socio = {
      id: generateId('soc'),
      name: body.name,
      document: body.document || '',
      email: body.email || '',
      phone: body.phone || '',
      participacao: parseFloat(body.participacao) || 0,
      notes: body.notes || '',
      createdAt: new Date().toISOString()
    };
    data.socios.push(socio);
    writeData('socios.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutSocio(id, body, res) {
  try {
    const data = readData('socios.json');
    const idx = data.socios.findIndex(s => s.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sócio not found' }));
      return;
    }
    const allowedSocio = {};
    const socioFields = ['name', 'document', 'email', 'phone', 'participacao', 'notes'];
    for (const f of socioFields) { if (body[f] !== undefined) allowedSocio[f] = body[f]; }
    if (allowedSocio.participacao !== undefined) allowedSocio.participacao = parseFloat(allowedSocio.participacao) || 0;

    data.socios[idx] = { ...data.socios[idx], ...allowedSocio, id };
    writeData('socios.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteSocio(id, res) {
  try {
    const data = readData('socios.json');
    data.socios = data.socios.filter(s => s.id !== id);
    writeData('socios.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Investimentos handlers ============
function handleGetInvestimentos(res) {
  const data = readData('investimentos.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostInvestimento(body, res) {
  try {
    const data = readData('investimentos.json');
    const origem  = body.origem  || 'socio';        // 'socio' | 'caixa_empresa'
    const destino = body.destino || 'contrato';     // 'contrato' | 'base'
    const valor   = parseFloat(body.value) || 0;
    const dataDoc = body.date || new Date().toISOString().split('T')[0];

    const aporte = {
      id: generateId('ap'),
      socioId: body.socioId || null,
      value: valor,
      date: dataDoc,
      description: body.description || '',
      origem: origem,
      destino: destino,
      baseType: body.baseType || 'outros',
      contractId: destino === 'contrato' ? (body.contractId || null) : null,
      baseItemId: null,
      caixaEntryId: null,
      createdAt: new Date().toISOString()
    };

    // Se destino=base, cria automaticamente um item na BASE para rastrear
    if (destino === 'base') {
      const baseData = readData('base.json');
      const baseItem = {
        id: generateId('bas'),
        description: body.description || 'Aporte',
        type: body.baseType || 'outros',      // tipo do custo na base
        value: valor,
        date: dataDoc,
        allocations: [],
        notes: `Criado via Aporte (${origem === 'socio' ? 'sócio' : 'caixa da empresa'})`,
        aporteId: aporte.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      baseData.items.push(baseItem);
      writeData('base.json', baseData);
      aporte.baseItemId = baseItem.id;
    }

    // Se origem = caixa_empresa, cria saída contábil automática no caixa
    if (origem === 'caixa_empresa') {
      const caixaData = readData('caixa.json');
      const descricaoOrigem = body.description || 'Aquisição via caixa da empresa';
      const destLabel = destino === 'base' ? 'BASE' : 'Contrato';
      const entry = {
        id: generateId('cxa'),
        type: 'saida',
        description: `[Aporte → ${destLabel}] ${descricaoOrigem}`,
        value: valor,
        date: dataDoc,
        contractId: aporte.contractId,
        baseItemId: aporte.baseItemId,
        category: destino === 'base' ? 'aporte_base' : 'aporte_contrato',
        notes: `Aporte via caixa da empresa - destino: ${destLabel}`,
        aporteId: aporte.id,
        createdAt: new Date().toISOString()
      };
      caixaData.entries.push(entry);
      writeData('caixa.json', caixaData);
      aporte.caixaEntryId = entry.id;
    }

    data.investimentos.push(aporte);
    writeData('investimentos.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteInvestimento(id, res) {
  try {
    const data = readData('investimentos.json');
    const aporte = data.investimentos.find(i => i.id === id);

    // Remover entrada do caixa vinculada
    if (aporte && aporte.caixaEntryId) {
      const caixaData = readData('caixa.json');
      caixaData.entries = caixaData.entries.filter(e => e.id !== aporte.caixaEntryId);
      writeData('caixa.json', caixaData);
    }

    // Remover item BASE criado (se houver e não tiver alocações)
    if (aporte && aporte.baseItemId) {
      const baseData = readData('base.json');
      const baseItem = baseData.items.find(b => b.id === aporte.baseItemId);
      if (baseItem && (!baseItem.allocations || baseItem.allocations.length === 0)) {
        baseData.items = baseData.items.filter(b => b.id !== aporte.baseItemId);
        writeData('base.json', baseData);
      }
    }

    data.investimentos = data.investimentos.filter(i => i.id !== id);
    writeData('investimentos.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Clientes ============
function handleGetClientes(res) {
  const data = readData('clientes.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostCliente(body, res) {
  try {
    const data = readData('clientes.json');
    const cliente = {
      id: generateId('cli'),
      nome: body.nome || '',
      empresa: body.empresa || '',
      telefone: body.telefone || '',
      email: body.email || '',
      endereco: body.endereco || '',
      notas: body.notas || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.clientes.push(cliente);
    writeData('clientes.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutCliente(id, body, res) {
  try {
    const data = readData('clientes.json');
    const idx = data.clientes.findIndex(c => c.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cliente não encontrado' }));
      return;
    }
    const allowedCliente = {};
    const clienteFields = ['nome', 'empresa', 'cargo', 'setor', 'telefone', 'email', 'endereco', 'notas', 'lat', 'lng'];
    for (const f of clienteFields) { if (body[f] !== undefined) allowedCliente[f] = body[f]; }

    data.clientes[idx] = { ...data.clientes[idx], ...allowedCliente, id, updatedAt: new Date().toISOString() };
    writeData('clientes.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteCliente(id, res) {
  try {
    const data = readData('clientes.json');
    data.clientes = data.clientes.filter(c => c.id !== id);
    writeData('clientes.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Fornecedores ============
function handleGetFornecedores(res) {
  const data = readData('fornecedores.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostFornecedor(body, res) {
  try {
    const data = readData('fornecedores.json');
    // materiais: string separada por vírgula OU array
    let materiais = body.materiais || [];
    if (typeof materiais === 'string') {
      materiais = materiais.split(',').map(s => s.trim()).filter(Boolean);
    }
    const fornecedor = {
      id: generateId('for'),
      nome: body.nome || '',
      cnpj: body.cnpj || '',
      endereco: body.endereco || '',
      telefone: body.telefone || '',
      pessoaContato: body.pessoaContato || '',
      materiais,
      banco: body.banco || '',
      agencia: body.agencia || '',
      conta: body.conta || '',
      chavePix: body.chavePix || '',
      notas: body.notas || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.fornecedores.push(fornecedor);
    writeData('fornecedores.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutFornecedor(id, body, res) {
  try {
    const data = readData('fornecedores.json');
    const idx = data.fornecedores.findIndex(f => f.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Fornecedor não encontrado' }));
      return;
    }
    const allowedForn = {};
    const fornFields = ['nome', 'cnpj', 'endereco', 'telefone', 'pessoaContato', 'materiais', 'banco', 'agencia', 'conta', 'chavePix', 'notas'];
    for (const f of fornFields) { if (body[f] !== undefined) allowedForn[f] = body[f]; }
    if (typeof allowedForn.materiais === 'string') {
      allowedForn.materiais = allowedForn.materiais.split(',').map(s => s.trim()).filter(Boolean);
    }
    data.fornecedores[idx] = { ...data.fornecedores[idx], ...allowedForn, id, updatedAt: new Date().toISOString() };
    writeData('fornecedores.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteFornecedor(id, res) {
  try {
    const data = readData('fornecedores.json');
    data.fornecedores = data.fornecedores.filter(f => f.id !== id);
    writeData('fornecedores.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Tipos BASE (custos administrativos customizáveis) ============
function handleGetTiposBase(res) {
  const data = readData('tipos_base.json');
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

function handlePostTipoBase(body, res) {
  try {
    const data = readData('tipos_base.json');
    const label = (body.label || '').trim();
    if (!label) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nome do tipo é obrigatório' }));
      return;
    }
    let key = slugify(body.key || label);
    // Garantir chave única
    const existentes = data.tipos.map(t => t.key);
    let k = key, n = 2;
    while (existentes.includes(k)) { k = `${key}_${n++}`; }

    const tipo = {
      id: generateId('tpb'),
      key: k,
      label,
      icon: body.icon || '🔹',
      cor: body.cor || '#718096',
      sistema: false,
      createdAt: new Date().toISOString()
    };
    data.tipos.push(tipo);
    writeData('tipos_base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutTipoBase(id, body, res) {
  try {
    const data = readData('tipos_base.json');
    const idx = data.tipos.findIndex(t => t.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tipo não encontrado' }));
      return;
    }
    // Não permite alterar a key de tipos do sistema
    const isSystem = data.tipos[idx].sistema;
    const updated = { ...data.tipos[idx] };
    if (body.label) updated.label = body.label.trim();
    if (body.icon)  updated.icon  = body.icon;
    if (body.cor)   updated.cor   = body.cor;
    if (!isSystem && body.key) updated.key = slugify(body.key);

    data.tipos[idx] = updated;
    writeData('tipos_base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteTipoBase(id, res) {
  try {
    const data = readData('tipos_base.json');
    const tipo = data.tipos.find(t => t.id === id);
    if (!tipo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tipo não encontrado' }));
      return;
    }
    if (tipo.sistema) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Não é possível excluir tipos do sistema' }));
      return;
    }
    // Verificar se está em uso em algum item da BASE
    const baseData = readData('base.json');
    const emUso = baseData.items.some(item => item.type === tipo.key);
    if (emUso) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tipo em uso por itens da BASE. Remova ou reclassifique os itens antes de excluir.' }));
      return;
    }
    data.tipos = data.tipos.filter(t => t.id !== id);
    writeData('tipos_base.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Contas a Pagar handlers ============
function handleGetContasPagar(res) {
  const data = readData('contas_pagar.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostContaPagar(body, res) {
  try {
    if (!body.descricao || !body.valor || parseFloat(body.valor) <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Descrição e valor (>0) são obrigatórios' }));
      return;
    }
    const data = readData('contas_pagar.json');
    const conta = {
      id: generateId('cp'),
      descricao: body.descricao || '',
      fornecedorId: body.fornecedorId || null,
      numeroNF: body.numeroNF || '',
      valor: parseFloat(body.valor) || 0,
      dataEmissao: body.dataEmissao || new Date().toISOString().split('T')[0],
      dataVencimento: body.dataVencimento || '',
      status: 'pendente',
      dataPagamento: null,
      caixaEntryId: null,
      contractId: body.contractId || null,
      category: body.category || 'fornecedor',
      observacoes: body.observacoes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.contas.push(conta);
    writeData('contas_pagar.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutContaPagar(id, body, res) {
  try {
    const data = readData('contas_pagar.json');
    const idx = data.contas.findIndex(c => c.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Conta não encontrada' }));
      return;
    }
    const allowedCP = {};
    const cpFields = ['descricao', 'fornecedorId', 'numeroNF', 'valor', 'dataEmissao', 'dataVencimento', 'contractId', 'category', 'observacoes'];
    for (const f of cpFields) { if (body[f] !== undefined) allowedCP[f] = body[f]; }
    if (allowedCP.valor !== undefined) allowedCP.valor = parseFloat(allowedCP.valor) || 0;

    data.contas[idx] = { ...data.contas[idx], ...allowedCP, id, updatedAt: new Date().toISOString() };
    writeData('contas_pagar.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteContaPagar(id, res) {
  try {
    const data = readData('contas_pagar.json');
    const conta = data.contas.find(c => c.id === id);
    // Remove linked caixa entry if exists
    if (conta && conta.caixaEntryId) {
      const caixa = readData('caixa.json');
      caixa.entries = caixa.entries.filter(e => e.id !== conta.caixaEntryId);
      writeData('caixa.json', caixa);
    }
    data.contas = data.contas.filter(c => c.id !== id);
    writeData('contas_pagar.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePagarConta(id, body, res) {
  try {
    const data = readData('contas_pagar.json');
    const idx = data.contas.findIndex(c => c.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Conta não encontrada' }));
      return;
    }
    const conta = data.contas[idx];
    if (conta.status === 'pago') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Conta já foi paga' }));
      return;
    }

    // Create caixa saída entry
    const caixa = readData('caixa.json');
    const dataPagamento = body.dataPagamento || new Date().toISOString().split('T')[0];
    const caixaEntry = {
      id: generateId('cxa'),
      type: 'saida',
      description: conta.descricao + (conta.numeroNF ? ` — NF ${conta.numeroNF}` : '') + (body.formaPagamento ? ` [${body.formaPagamento}]` : ''),
      value: parseFloat(body.valorPago) || conta.valor,
      date: dataPagamento,
      contractId: conta.contractId || null,
      baseItemId: null,
      category: conta.category || 'fornecedor',
      notes: `Pagamento de conta: ${conta.descricao}`,
      formaPagamento: body.formaPagamento || null,
      contaPagarId: conta.id,
      createdAt: new Date().toISOString()
    };
    caixa.entries.push(caixaEntry);
    writeData('caixa.json', caixa);

    // Mark conta as paid
    data.contas[idx] = {
      ...conta,
      status: 'pago',
      dataPagamento,
      valorPago: parseFloat(body.valorPago) || conta.valor,
      formaPagamento: body.formaPagamento || null,
      caixaEntryId: caixaEntry.id,
      updatedAt: new Date().toISOString()
    };
    writeData('contas_pagar.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleEstornarConta(id, res) {
  try {
    const data = readData('contas_pagar.json');
    const idx = data.contas.findIndex(c => c.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Conta não encontrada' }));
      return;
    }
    const conta = data.contas[idx];
    // Remove caixa entry
    if (conta.caixaEntryId) {
      const caixa = readData('caixa.json');
      caixa.entries = caixa.entries.filter(e => e.id !== conta.caixaEntryId);
      writeData('caixa.json', caixa);
    }
    data.contas[idx] = {
      ...conta,
      status: 'pendente',
      dataPagamento: null,
      valorPago: null,
      caixaEntryId: null,
      updatedAt: new Date().toISOString()
    };
    writeData('contas_pagar.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Notas Fiscais handlers ============
function handleGetNotasFiscais(res) {
  const data = readData('notas_fiscais.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostNotaFiscal(body, res) {
  try {
    if (!body.numero || !body.contractId || !body.dataLimite) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Número, contrato e data limite são obrigatórios' }));
      return;
    }
    const data = readData('notas_fiscais.json');
    const nf = {
      id: generateId('nf'),
      numero: body.numero,
      contractId: body.contractId,
      dataLimite: body.dataLimite,
      valor: parseFloat(body.valor) || 0,
      prazoRecebimento: parseInt(body.prazoRecebimento) || 30,
      observacoes: body.observacoes || '',
      emitida: false,
      dataEmissaoReal: null,
      caixaEntryId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.notas_fiscais.push(nf);
    writeData('notas_fiscais.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutNotaFiscal(id, body, res) {
  try {
    const data = readData('notas_fiscais.json');
    const idx = data.notas_fiscais.findIndex(nf => nf.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nota fiscal not found' }));
      return;
    }
    const existing = data.notas_fiscais[idx];
    const allowedNF = {};
    const nfFields = ['numero', 'contractId', 'dataLimite', 'valor', 'prazoRecebimento', 'observacoes', 'dataEmissaoReal'];
    for (const f of nfFields) { if (body[f] !== undefined) allowedNF[f] = body[f]; }
    if (allowedNF.valor !== undefined) allowedNF.valor = parseFloat(allowedNF.valor) || 0;
    if (allowedNF.prazoRecebimento !== undefined) allowedNF.prazoRecebimento = parseInt(allowedNF.prazoRecebimento) || 30;

    data.notas_fiscais[idx] = {
      ...existing,
      ...allowedNF,
      id,
      updatedAt: new Date().toISOString()
    };

    // Sync caixa entry when emission date or prazo changes for an emitted NF
    const updated = data.notas_fiscais[idx];
    if (existing.emitida && existing.caixaEntryId) {
      const newDataEmissao = updated.dataEmissaoReal || existing.dataEmissaoReal;
      const newPrazo = updated.prazoRecebimento;
      const dtRecebimento = new Date(newDataEmissao + 'T12:00:00');
      dtRecebimento.setDate(dtRecebimento.getDate() + newPrazo);
      const dataRecebimento = dtRecebimento.toISOString().split('T')[0];

      const caixaData = readData('caixa.json');
      const caixaIdx = caixaData.entries.findIndex(e => e.id === existing.caixaEntryId);
      if (caixaIdx !== -1) {
        caixaData.entries[caixaIdx] = {
          ...caixaData.entries[caixaIdx],
          value: updated.valor,
          date: dataRecebimento,
          notes: `NF ${updated.numero} emitida em ${newDataEmissao}, prazo ${newPrazo} dias`
        };
        writeData('caixa.json', caixaData);
      }
    }

    writeData('notas_fiscais.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteNotaFiscal(id, res) {
  try {
    const data = readData('notas_fiscais.json');
    const nf = data.notas_fiscais.find(n => n.id === id);

    // Se tinha entrada no caixa vinculada, remove
    if (nf && nf.caixaEntryId) {
      const caixa = readData('caixa.json');
      caixa.entries = caixa.entries.filter(e => e.id !== nf.caixaEntryId);
      writeData('caixa.json', caixa);
    }

    data.notas_fiscais = data.notas_fiscais.filter(nf => nf.id !== id);
    writeData('notas_fiscais.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// Marca NF como emitida e cria entrada agendada no caixa
function handleEmitirNotaFiscal(id, body, res) {
  try {
    const nfData = readData('notas_fiscais.json');
    const idx = nfData.notas_fiscais.findIndex(n => n.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nota fiscal não encontrada' }));
      return;
    }

    const nf = nfData.notas_fiscais[idx];
    if (nf.emitida) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nota fiscal já foi emitida' }));
      return;
    }

    // Data real de emissão (informada pelo usuário ou hoje)
    const dataEmissaoReal = body.dataEmissaoReal || new Date().toISOString().split('T')[0];
    const prazo = parseInt(nf.prazoRecebimento) || 30;

    // Calcular data prevista de recebimento
    const dtEmissao = new Date(dataEmissaoReal + 'T12:00:00');
    const dtRecebimento = new Date(dtEmissao);
    dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
    const dataRecebimento = dtRecebimento.toISOString().split('T')[0];

    // Buscar contrato para descrição
    const contracts = readData('contracts.json');
    const contract = contracts.contracts.find(c => c.id === nf.contractId);
    const descricao = `Recebimento NF ${nf.numero}${contract ? ` - ${contract.client}` : ''}`;

    // Criar entrada no caixa
    const caixaData = readData('caixa.json');
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
      createdAt: new Date().toISOString()
    };
    caixaData.entries.push(caixaEntry);
    writeData('caixa.json', caixaData);

    // Atualizar NF
    nfData.notas_fiscais[idx] = {
      ...nf,
      emitida: true,
      dataEmissaoReal,
      caixaEntryId: caixaEntry.id,
      updatedAt: new Date().toISOString()
    };
    writeData('notas_fiscais.json', nfData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      notas_fiscais: nfData.notas_fiscais,
      caixa: caixaData,
      mensagem: `NF marcada como emitida. Entrada de ${nf.valor} agendada para ${dataRecebimento}`
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// Desfaz emissão: remove entrada do caixa e volta status
function handleCancelarEmissao(id, res) {
  try {
    const nfData = readData('notas_fiscais.json');
    const idx = nfData.notas_fiscais.findIndex(n => n.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nota fiscal não encontrada' }));
      return;
    }

    const nf = nfData.notas_fiscais[idx];

    // Remover entrada do caixa
    if (nf.caixaEntryId) {
      const caixaData = readData('caixa.json');
      caixaData.entries = caixaData.entries.filter(e => e.id !== nf.caixaEntryId);
      writeData('caixa.json', caixaData);
    }

    // Voltar NF ao estado pendente
    nfData.notas_fiscais[idx] = {
      ...nf,
      emitida: false,
      dataEmissaoReal: null,
      caixaEntryId: null,
      updatedAt: new Date().toISOString()
    };
    writeData('notas_fiscais.json', nfData);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ notas_fiscais: nfData.notas_fiscais }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Orçamento (Budget) handlers ============
function handlePostBudgetItem(contractId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    if (!contract.budget) contract.budget = [];
    const item = {
      id: generateId('bud'),
      contractId,
      description: body.description || '',
      type: body.type || 'outros',
      value: parseFloat(body.value) || 0,
      notes: body.notes || '',
      createdAt: new Date().toISOString()
    };
    contract.budget.push(item);
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutBudgetItem(contractId, itemId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const idx = (contract.budget || []).findIndex(b => b.id === itemId);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Item não encontrado' }));
      return;
    }
    if (body.value !== undefined) body.value = parseFloat(body.value) || 0;
    contract.budget[idx] = { ...contract.budget[idx], ...body };
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteBudgetItem(contractId, itemId, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    contract.budget = (contract.budget || []).filter(b => b.id !== itemId);
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
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

function handlePostMembroOrganograma(contractId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    if (!contract.organograma) contract.organograma = [];

    const erro = validarMembroOrganograma(body, contract.organograma, null);
    if (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: erro }));
      return;
    }

    const membro = {
      id: generateId('org'),
      contractId,
      recursoId: body.recursoId,
      nivel: body.nivel,
      cargo: body.cargo,
      supervisorId: body.nivel === 'encarregado' ? null : (body.supervisorId || null),
      area: body.nivel === 'lider_area' ? String(body.area).trim() : null,
      createdAt: new Date().toISOString()
    };
    contract.organograma.push(membro);
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutMembroOrganograma(contractId, membroId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const idx = (contract.organograma || []).findIndex(m => m.id === membroId);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Membro não encontrado' }));
      return;
    }

    const atual = contract.organograma[idx];
    const merged = {
      recursoId:    body.recursoId    !== undefined ? body.recursoId    : atual.recursoId,
      nivel:        body.nivel        !== undefined ? body.nivel        : atual.nivel,
      cargo:        body.cargo        !== undefined ? body.cargo        : atual.cargo,
      supervisorId: body.supervisorId !== undefined ? body.supervisorId : atual.supervisorId,
      area:         body.area         !== undefined ? body.area         : atual.area
    };

    const erro = validarMembroOrganograma(merged, contract.organograma, membroId);
    if (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: erro }));
      return;
    }

    contract.organograma[idx] = {
      ...atual,
      recursoId: merged.recursoId,
      nivel: merged.nivel,
      cargo: merged.cargo,
      supervisorId: merged.nivel === 'encarregado' ? null : (merged.supervisorId || null),
      area: merged.nivel === 'lider_area' ? String(merged.area).trim() : null,
      updatedAt: new Date().toISOString()
    };
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteMembroOrganograma(contractId, membroId, body, res, query) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const lista = contract.organograma || [];
    const alvo = lista.find(m => m.id === membroId);
    if (!alvo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Membro não encontrado' }));
      return;
    }

    const mode = (query && query.mode) || 'strict'; // strict | reassign | cascade
    const reassignTo = query && query.reassignTo;

    if (alvo.nivel === 'encarregado') {
      const temLideres = lista.some(m => m.nivel === 'lider_area');
      if (temLideres) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Não é possível remover o encarregado enquanto houver líderes no organograma' }));
        return;
      }
      contract.organograma = lista.filter(m => m.id !== membroId);
    } else if (alvo.nivel === 'lider_area') {
      const subordinados = lista.filter(m => m.supervisorId === membroId);
      if (subordinados.length > 0 && mode === 'strict') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Líder possui profissionais vinculados. Informe mode=reassign&reassignTo=<liderId> ou mode=cascade',
          subordinadosCount: subordinados.length
        }));
        return;
      }
      if (mode === 'reassign') {
        const novo = lista.find(m => m.id === reassignTo && m.nivel === 'lider_area' && m.id !== membroId);
        if (!novo) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Líder de destino inválido' }));
          return;
        }
        contract.organograma = lista
          .map(m => m.supervisorId === membroId ? { ...m, supervisorId: novo.id } : m)
          .filter(m => m.id !== membroId);
      } else if (mode === 'cascade') {
        const idsRemover = new Set([membroId, ...subordinados.map(s => s.id)]);
        contract.organograma = lista.filter(m => !idsRemover.has(m.id));
      } else {
        contract.organograma = lista.filter(m => m.id !== membroId);
      }
    } else {
      contract.organograma = lista.filter(m => m.id !== membroId);
    }

    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
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

function handlePostRdo(contractId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    if (!contract.rdos) contract.rdos = [];

    const erro = validarRdo(body, contract.rdos, null);
    if (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: erro }));
      return;
    }

    const rdo = {
      id: generateId('rdo'),
      contractId,
      numero: proxNumeroRdo(contract.rdos),
      data: body.data,
      diaSemana: body.diaSemana || '',
      osNumero: body.osNumero || '',
      ordemCompra: body.ordemCompra || '',
      projeto: body.projeto || '',
      prazo: body.prazo || { dataInicial: '', contratual: 0, decorrido: 0, faltante: 0, pctConcluida: 0 },
      tempo: body.tempo || {
        manha:    { tempo: 'bom', condicoes: 'operavel' },
        tarde:    { tempo: 'bom', condicoes: 'operavel' },
        noiteAnt: { tempo: 'bom', condicoes: 'operavel' },
        precipitacao: 0
      },
      periodoTrabalho: body.periodoTrabalho || '7:00 às 17:00',
      horaExtra: !!body.horaExtra,
      moi:  Array.isArray(body.moi)  ? body.moi  : [],
      mod:  Array.isArray(body.mod)  ? body.mod  : [],
      terc: Array.isArray(body.terc) ? body.terc : [],
      equipamentos: Array.isArray(body.equipamentos) ? body.equipamentos : [],
      atividades:   Array.isArray(body.atividades)   ? body.atividades   : [],
      seguranca: body.seguranca || { acidente: 'nao_houve', diagnostico: '', admissoes: 0, demissoes: 0, comentarios: '' },
      fiscalizacaoComentarios: body.fiscalizacaoComentarios || '',
      totais: body.totais || { moi: 0, mod: 0, terc: 0, eqp: 0, homensHora: 0, horasParadas: 0, equipamentoHora: 0 },
      fotos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    contract.rdos.push(rdo);
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutRdo(contractId, rdoId, body, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const idx = (contract.rdos || []).findIndex(r => r.id === rdoId);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'RDO não encontrado' }));
      return;
    }
    const atual = contract.rdos[idx];
    const novaData = body.data !== undefined ? body.data : atual.data;
    const erro = validarRdo({ ...body, data: novaData }, contract.rdos, rdoId);
    if (erro) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: erro }));
      return;
    }
    // merge preservando fotos (gerenciadas por endpoints próprios) e id/numero/createdAt
    contract.rdos[idx] = {
      ...atual,
      ...body,
      id: atual.id,
      contractId: atual.contractId,
      numero: atual.numero,
      fotos: atual.fotos || [],
      createdAt: atual.createdAt,
      updatedAt: new Date().toISOString()
    };
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteRdo(contractId, rdoId, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const rdo = (contract.rdos || []).find(r => r.id === rdoId);
    contract.rdos = (contract.rdos || []).filter(r => r.id !== rdoId);
    writeData('contracts.json', data);

    // Remove pasta de fotos associada
    if (rdo) {
      const pastaFotos = path.join(RDO_FOTOS_DIR, rdoId);
      try {
        if (fs.existsSync(pastaFotos)) fs.rmSync(pastaFotos, { recursive: true, force: true });
      } catch {}
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
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

  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = parseMultipart(body, boundary);

      const data = readData('contracts.json');
      const contract = data.contracts.find(c => c.id === contractId);
      if (!contract) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
        return;
      }
      const rdo = (contract.rdos || []).find(r => r.id === rdoId);
      if (!rdo) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'RDO não encontrado' }));
        return;
      }
      if (!rdo.fotos) rdo.fotos = [];

      const legendaPart = parts.find(p => p.name === 'legenda');
      const legenda = legendaPart ? legendaPart.data.toString('utf8') : '';

      const arquivos = parts.filter(p => p.filename && p.data && p.data.length > 0);
      if (arquivos.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nenhum arquivo enviado' }));
        return;
      }

      const pastaRdo = path.join(RDO_FOTOS_DIR, rdoId);
      if (!fs.existsSync(pastaRdo)) fs.mkdirSync(pastaRdo, { recursive: true });

      const adicionadas = [];
      for (const arq of arquivos) {
        if (arq.contentType && !FOTO_ALLOWED_TYPES.includes(arq.contentType)) continue;
        if (arq.data.length > FOTO_MAX_BYTES) continue;
        const ext = (arq.filename.match(/\.[a-z0-9]+$/i) || ['.jpg'])[0].toLowerCase();
        const fotoId = generateId('foto');
        const filename = fotoId + ext;
        const destino = path.join(pastaRdo, filename);
        fs.writeFileSync(destino, arq.data);
        const fotoObj = {
          id: fotoId,
          filename,
          legenda,
          url: `/data/rdo-fotos/${rdoId}/${filename}`,
          createdAt: new Date().toISOString()
        };
        rdo.fotos.push(fotoObj);
        adicionadas.push(fotoObj);
      }

      rdo.updatedAt = new Date().toISOString();
      writeData('contracts.json', data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ contracts: data.contracts, fotos: adicionadas }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

function handleDeleteRdoFoto(contractId, rdoId, fotoId, res) {
  try {
    const data = readData('contracts.json');
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contrato não encontrado' }));
      return;
    }
    const rdo = (contract.rdos || []).find(r => r.id === rdoId);
    if (!rdo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'RDO não encontrado' }));
      return;
    }
    const foto = (rdo.fotos || []).find(f => f.id === fotoId);
    if (foto) {
      const filepath = path.join(RDO_FOTOS_DIR, rdoId, foto.filename);
      try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
    }
    rdo.fotos = (rdo.fotos || []).filter(f => f.id !== fotoId);
    rdo.updatedAt = new Date().toISOString();
    writeData('contracts.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
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

// ============ Request handler ============
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

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
    const parts = pathname.split('/');
    return handlePostRdoFoto(parts[3], parts[5], req, res);
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
    req.on('end', () => {
      try {
        body = body ? JSON.parse(body) : {};
      } catch (e) {
        body = {};
      }
      routeRequest(pathname, req.method, body, res, parsedUrl);
    });
  } else {
    routeRequest(pathname, req.method, null, res, parsedUrl);
  }
});

function routeRequest(pathname, method, body, res, parsedUrl) {
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
function handleGetNiveisAcesso(res) {
  const data = readData('niveis_acesso.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePutNivelAcesso(id, body, res) {
  try {
    const data = readData('niveis_acesso.json');
    const idx = data.niveis.findIndex(n => n.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Nível não encontrado' }));
      return;
    }
    data.niveis[idx] = { ...data.niveis[idx], abas: body.abas || [] };
    writeData('niveis_acesso.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Recursos handlers ============
function handleGetRecursos(res) {
  const data = readData('recursos.json');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostRecurso(body, res) {
  try {
    const data = readData('recursos.json');
    const recurso = {
      id: generateId('rec'),
      nome: body.nome || '',
      cpf: body.cpf || '',
      dataNascimento: body.dataNascimento || '',
      genero: body.genero || '',
      telefone: body.telefone || '',
      email: body.email || '',
      endereco: body.endereco || '',
      lat: body.lat || '',
      lng: body.lng || '',
      status: body.status || 'candidato',
      profissao: body.profissao || '',
      dataAdmissao: body.dataAdmissao || '',
      salario: parseFloat(body.salario) || 0,
      cnh: body.cnh || '',
      pis: body.pis || '',
      dataDesligamento: body.dataDesligamento || '',
      motivoDesligamento: body.motivoDesligamento || '',
      obsDesligamento: body.obsDesligamento || '',
      notas: body.notas || '',
      rdoCategoria: body.rdoCategoria || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.recursos.push(recurso);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutRecurso(id, body, res) {
  try {
    const data = readData('recursos.json');
    const idx = data.recursos.findIndex(r => r.id === id);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Recurso não encontrado' }));
      return;
    }
    const allowedRec = {};
    const recFields = ['nome', 'cpf', 'dataNascimento', 'genero', 'telefone', 'email', 'endereco', 'lat', 'lng',
      'status', 'profissao', 'dataAdmissao', 'salario', 'cnh', 'pis', 'dataDesligamento',
      'motivoDesligamento', 'obsDesligamento', 'notas', 'alocacaoAtual', 'rdoCategoria'];
    for (const f of recFields) { if (body[f] !== undefined) allowedRec[f] = body[f]; }
    if (allowedRec.salario !== undefined) allowedRec.salario = parseFloat(allowedRec.salario) || 0;

    data.recursos[idx] = { ...data.recursos[idx], ...allowedRec, id, updatedAt: new Date().toISOString() };
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteRecurso(id, res) {
  try {
    const data = readData('recursos.json');
    data.recursos = data.recursos.filter(r => r.id !== id);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleAddFolga(id, body, res) {
  try {
    const data = readData('recursos.json');
    const idx  = data.recursos.findIndex(r => r.id === id);
    if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Não encontrado' })); return; }
    if (!data.recursos[idx].folgas) data.recursos[idx].folgas = [];
    const folga = {
      id: generateId('fol'),
      dataInicio:   body.dataInicio || '',
      dataFim:      body.dataFim    || '',
      observacoes:  body.observacoes || '',
      passagemIda:   { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
      passagemVolta: { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
      createdAt: new Date().toISOString()
    };
    data.recursos[idx].folgas.push(folga);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
}

function handleDeleteFolga(recursoId, folgaId, res) {
  try {
    const data = readData('recursos.json');
    const idx  = data.recursos.findIndex(r => r.id === recursoId);
    if (idx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Não encontrado' })); return; }
    data.recursos[idx].folgas = (data.recursos[idx].folgas || []).filter(f => f.id !== folgaId);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
}

function handleComprarPassagem(recursoId, folgaId, body, res) {
  try {
    const data       = readData('recursos.json');
    const caixaData  = readData('caixa.json');
    const cpData     = readData('contas_pagar.json');

    const rIdx = data.recursos.findIndex(r => r.id === recursoId);
    if (rIdx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Recurso não encontrado' })); return; }
    const recurso = data.recursos[rIdx];
    const fIdx    = (recurso.folgas || []).findIndex(f => f.id === folgaId);
    if (fIdx === -1) { res.writeHead(404); res.end(JSON.stringify({ error: 'Folga não encontrada' })); return; }

    const tipo        = body.tipo === 'ida' ? 'passagemIda' : 'passagemVolta';
    const tipoLabel   = body.tipo === 'ida' ? 'Ida' : 'Volta';
    const valor       = parseFloat(body.valor) || 0;
    const folga       = recurso.folgas[fIdx];

    // Get contract/obra name for description
    const contractId  = body.contractIdPagador || recurso.alocacaoAtual?.contractId || null;
    let obraLabel = '';
    if (contractId) {
      const contracts = readData('contracts.json');
      const ct = (contracts.contracts || []).find(c => c.id === contractId);
      if (ct) obraLabel = ` — ${ct.name}`;
    }
    const descricao   = `Passagem de ${tipoLabel} — ${recurso.nome}${obraLabel}`;

    let caixaEntryId = null, contaPagarId = null;

    if (body.tipoLancamento === 'conta_pagar') {
      const conta = {
        id: generateId('cp'), descricao,
        fornecedorId: null, numeroNF: '',
        valor, dataEmissao: body.dataCompra || new Date().toISOString().split('T')[0],
        dataVencimento: folga.dataInicio || '', status: 'pendente',
        dataPagamento: null, caixaEntryId: null,
        contractId: body.financiadoPor === 'contrato' ? (body.contractIdPagador || null) : null,
        category: 'passagem', observacoes: `Folga de ${recurso.nome}`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      cpData.contas.push(conta);
      writeData('contas_pagar.json', cpData);
      contaPagarId = conta.id;
    } else {
      const entry = {
        id: generateId('cxa'), type: 'saida', description: descricao,
        value: valor, date: body.dataCompra || new Date().toISOString().split('T')[0],
        contractId: body.financiadoPor === 'contrato' ? (body.contractIdPagador || null) : null,
        baseItemId: null, category: 'passagem',
        notes: `Passagem ${tipoLabel} folga de ${recurso.nome}`,
        createdAt: new Date().toISOString()
      };
      caixaData.entries.push(entry);
      writeData('caixa.json', caixaData);
      caixaEntryId = entry.id;
    }

    recurso.folgas[fIdx][tipo] = {
      comprada: true, valor,
      dataCompra:        body.dataCompra || new Date().toISOString().split('T')[0],
      companhia:         body.companhia  || '',
      numeroVoo:         body.numeroVoo  || '',
      origem:            body.origem     || '',
      destino:           body.destino    || '',
      dataVoo:           body.dataVoo    || '',
      horario:           body.horario    || '',
      financiadoPor:     body.financiadoPor,
      contractIdPagador: body.contractIdPagador || null,
      caixaEntryId, contaPagarId
    };
    writeData('recursos.json', data);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ recursos: data.recursos, caixa: caixaData, contas_pagar: cpData }));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
}

// ============ Doc Templates handlers ============
function handleGetDocTemplates(res) {
  const data = readData('doc_templates.json');
  if (!data.templates) data.templates = [];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handlePostDocTemplate(body, res) {
  try {
    const data = readData('doc_templates.json');
    if (!data.templates) data.templates = [];
    const template = {
      id: generateId('tpl'),
      nome: body.nome || '',
      tipoDocumento: body.tipoDocumento || '',
      empresaId: body.empresaId || null,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      periodicidadeMeses: parseInt(body.periodicidadeMeses) || 12,
      createdAt: new Date().toISOString()
    };
    data.templates.push(template);
    writeData('doc_templates.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handlePutDocTemplate(id, body, res) {
  try {
    const data = readData('doc_templates.json');
    if (!data.templates) data.templates = [];
    const idx = data.templates.findIndex(t => t.id === id);
    if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Não encontrado' })); return; }
    data.templates[idx] = { ...data.templates[idx], ...body, id, updatedAt: new Date().toISOString() };
    writeData('doc_templates.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

function handleDeleteDocTemplate(id, res) {
  try {
    const data = readData('doc_templates.json');
    if (!data.templates) data.templates = [];
    data.templates = data.templates.filter(t => t.id !== id);
    writeData('doc_templates.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
}

// ============ Documentos de colaboradores handlers ============
function handleAddDocumento(recursoId, body, res) {
  try {
    const data = readData('recursos.json');
    const idx = data.recursos.findIndex(r => r.id === recursoId);
    if (idx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Recurso não encontrado' })); return; }
    if (!data.recursos[idx].documentos) data.recursos[idx].documentos = [];
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
      updatedAt:  new Date().toISOString()
    };
    data.recursos[idx].documentos.push(doc);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
}

function handlePutDocumento(recursoId, docId, body, res) {
  try {
    const data = readData('recursos.json');
    const rIdx = data.recursos.findIndex(r => r.id === recursoId);
    if (rIdx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Recurso não encontrado' })); return; }
    const docs = data.recursos[rIdx].documentos || [];
    const dIdx = docs.findIndex(d => d.id === docId);
    if (dIdx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Documento não encontrado' })); return; }
    data.recursos[rIdx].documentos[dIdx] = {
      ...data.recursos[rIdx].documentos[dIdx],
      ...body,
      id: docId,
      updatedAt: new Date().toISOString()
    };
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
}

function handleDeleteDocumento(recursoId, docId, res) {
  try {
    const data = readData('recursos.json');
    const rIdx = data.recursos.findIndex(r => r.id === recursoId);
    if (rIdx === -1) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Recurso não encontrado' })); return; }
    data.recursos[rIdx].documentos = (data.recursos[rIdx].documentos || []).filter(d => d.id !== docId);
    writeData('recursos.json', data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
}

function handleGetDocumentosStatus(res) {
  try {
    const data = readData('recursos.json');
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ativos = (data.recursos || []).filter(r => r.status === 'funcionario');
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
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Rhino running at http://localhost:${PORT}`);
  });
} else {
  server.listen(PORT);
}

module.exports = { __server: server };
