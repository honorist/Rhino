const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
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

    if (backups.length > 10) {
      fs.unlinkSync(path.join(BACKUPS_DIR, backups[10]));
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
    const data = readData('contracts.json');
    const contract = {
      id: generateId('ctr'),
      name: body.name,
      client: body.client,
      value: parseFloat(body.value) || 0,
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      status: body.status || 'ativo',
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

    data.contracts[idx] = {
      ...data.contracts[idx],
      ...body,
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

    data.saidas[idx] = { ...data.saidas[idx], ...body, id, updatedAt: new Date().toISOString() };
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

    // Garante que value seja sempre número
    const bodyLimpo = { ...body };
    if (bodyLimpo.value !== undefined) bodyLimpo.value = parseFloat(bodyLimpo.value) || 0;

    data.entries[idx] = { ...data.entries[idx], ...bodyLimpo };
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

    data.items[idx] = {
      ...data.items[idx],
      ...body,
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
    const totalAllocated = baseItem.allocations.reduce((sum, a) => sum + a.value, 0);

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

    baseItem.allocations.push(allocation);
    baseItem.updatedAt = new Date().toISOString();
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
      const allocated = item.allocations.reduce((s, a) => s + a.value, 0);
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
    data.socios[idx] = { ...data.socios[idx], ...body, id: id };
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
    data.clientes[idx] = { ...data.clientes[idx], ...body, id, updatedAt: new Date().toISOString() };
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
    const bodyLimpo = { ...body };
    if (typeof bodyLimpo.materiais === 'string') {
      bodyLimpo.materiais = bodyLimpo.materiais.split(',').map(s => s.trim()).filter(Boolean);
    }
    data.fornecedores[idx] = { ...data.fornecedores[idx], ...bodyLimpo, id, updatedAt: new Date().toISOString() };
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
    data.contas[idx] = { ...data.contas[idx], ...body, id, updatedAt: new Date().toISOString() };
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
    data.notas_fiscais[idx] = {
      ...data.notas_fiscais[idx],
      ...body,
      id: id,
      updatedAt: new Date().toISOString()
    };
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

// ============ Static file serving ============
function serveStaticFile(pathname, res) {
  const filepath = path.join(__dirname, pathname);

  if (!fs.existsSync(filepath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filepath);
  const contentTypeMap = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  const contentType = contentTypeMap[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(fs.readFileSync(filepath));
}

// ============ Request handler ============
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse body for POST/PUT requests
  let body = '';
  if (['POST', 'PUT'].includes(req.method)) {
    req.on('data', chunk => { body += chunk; });
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

server.listen(PORT, () => {
  console.log(`Rhino running at http://localhost:${PORT}`);
});
