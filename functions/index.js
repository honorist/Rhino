const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ─── Firestore helpers (mirrors JSON file read/write) ───────────────────────

const DEFAULTS = {
  contracts:     { contracts: [], saidas: [] },
  caixa:         { entries: [] },
  base:          { items: [] },
  notas_fiscais: { notas_fiscais: [] },
  contas_pagar:  { contas: [] },
  socios:        { socios: [] },
  investimentos: { investimentos: [] },
  clientes:      { clientes: [] },
  fornecedores:  { fornecedores: [] },
  tipos_base:    { tipos: [] },
  niveis_acesso: { niveis: [] },
};

async function readData(key) {
  const snap = await db.collection('data').doc(key).get();
  return snap.exists ? snap.data() : (DEFAULTS[key] || {});
}

async function writeData(key, data) {
  await db.collection('data').doc(key).set(data);
}

function generateId(prefix) {
  const ts  = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${ts}${rnd}`;
}

function err400(res, msg) { res.status(400).json({ error: msg }); }
function err404(res, msg) { res.status(404).json({ error: msg }); }

// ─── Contracts ──────────────────────────────────────────────────────────────

app.get('/api/contracts', async (req, res) => {
  res.json(await readData('contracts'));
});

app.post('/api/contracts', async (req, res) => {
  try {
    const data = await readData('contracts');
    const b = req.body;
    const contract = {
      id: generateId('ctr'),
      name: b.name, client: b.client, clientId: b.clientId || null,
      value: parseFloat(b.value) || 0,
      startDate: b.startDate || '', endDate: b.endDate || '',
      status: b.status || 'ativo', notes: b.notes || '',
      endereco: b.endereco || '', lat: b.lat || '', lng: b.lng || '',
      contractNumber: b.contractNumber || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.contracts.push(contract);
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/contracts/:id', async (req, res) => {
  try {
    const data = await readData('contracts');
    const idx = data.contracts.findIndex(c => c.id === req.params.id);
    if (idx === -1) return err404(res, 'Contract not found');
    data.contracts[idx] = { ...data.contracts[idx], ...req.body, updatedAt: new Date().toISOString() };
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/contracts/:id', async (req, res) => {
  try {
    const data = await readData('contracts');
    data.contracts = data.contracts.filter(c => c.id !== req.params.id);
    data.saidas    = data.saidas.filter(s => s.contractId !== req.params.id);
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Saídas ──────────────────────────────────────────────────────────────────

app.post('/api/contracts/:contractId/saidas', async (req, res) => {
  try {
    const data = await readData('contracts');
    if (!data.contracts.find(c => c.id === req.params.contractId))
      return err404(res, 'Contract not found');
    const b = req.body;
    data.saidas.push({
      id: generateId('sai'), contractId: req.params.contractId,
      type: b.type || 'material', description: b.description || '',
      value: parseFloat(b.value) || 0,
      date: b.date || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    });
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/saidas/:id', async (req, res) => {
  try {
    const data = await readData('contracts');
    const idx = data.saidas.findIndex(s => s.id === req.params.id);
    if (idx === -1) return err404(res, 'Saida not found');
    data.saidas[idx] = { ...data.saidas[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/saidas/:id', async (req, res) => {
  try {
    const data = await readData('contracts');
    data.saidas = data.saidas.filter(s => s.id !== req.params.id);
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Budget ──────────────────────────────────────────────────────────────────

app.post('/api/contracts/:contractId/budget', async (req, res) => {
  try {
    const data = await readData('contracts');
    const contract = data.contracts.find(c => c.id === req.params.contractId);
    if (!contract) return err404(res, 'Contrato não encontrado');
    if (!contract.budget) contract.budget = [];
    const b = req.body;
    contract.budget.push({
      id: generateId('bud'), contractId: req.params.contractId,
      description: b.description || '', type: b.type || 'outros',
      value: parseFloat(b.value) || 0, notes: b.notes || '',
      createdAt: new Date().toISOString()
    });
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/contracts/:contractId/budget/:itemId', async (req, res) => {
  try {
    const data = await readData('contracts');
    const contract = data.contracts.find(c => c.id === req.params.contractId);
    if (!contract) return err404(res, 'Contrato não encontrado');
    const idx = (contract.budget || []).findIndex(b => b.id === req.params.itemId);
    if (idx === -1) return err404(res, 'Item não encontrado');
    const b = req.body;
    if (b.value !== undefined) b.value = parseFloat(b.value) || 0;
    contract.budget[idx] = { ...contract.budget[idx], ...b };
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/contracts/:contractId/budget/:itemId', async (req, res) => {
  try {
    const data = await readData('contracts');
    const contract = data.contracts.find(c => c.id === req.params.contractId);
    if (!contract) return err404(res, 'Contrato não encontrado');
    contract.budget = (contract.budget || []).filter(b => b.id !== req.params.itemId);
    await writeData('contracts', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Caixa ───────────────────────────────────────────────────────────────────

app.get('/api/caixa', async (req, res) => {
  res.json(await readData('caixa'));
});

app.post('/api/caixa', async (req, res) => {
  try {
    const data = await readData('caixa');
    const b = req.body;
    data.entries.push({
      id: generateId('cxa'), type: b.type || 'entrada',
      description: b.description || '', value: parseFloat(b.value) || 0,
      date: b.date || new Date().toISOString().split('T')[0],
      contractId: b.contractId || null, baseItemId: b.baseItemId || null,
      category: b.category || 'geral', notes: b.notes || '',
      createdAt: new Date().toISOString()
    });
    await writeData('caixa', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/caixa/:id', async (req, res) => {
  try {
    const data = await readData('caixa');
    const idx = data.entries.findIndex(e => e.id === req.params.id);
    if (idx === -1) return err404(res, 'Entry not found');
    const b = { ...req.body };
    if (b.value !== undefined) b.value = parseFloat(b.value) || 0;
    data.entries[idx] = { ...data.entries[idx], ...b };
    await writeData('caixa', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/caixa/:id', async (req, res) => {
  try {
    const data = await readData('caixa');
    data.entries = data.entries.filter(e => e.id !== req.params.id);
    await writeData('caixa', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── BASE ────────────────────────────────────────────────────────────────────

app.get('/api/base', async (req, res) => {
  res.json(await readData('base'));
});

app.post('/api/base', async (req, res) => {
  try {
    const data = await readData('base');
    const b = req.body;
    data.items.push({
      id: generateId('bas'), description: b.description || '',
      type: b.type || 'variavel', value: parseFloat(b.value) || 0,
      date: b.date || new Date().toISOString().split('T')[0],
      allocations: [], notes: b.notes || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await writeData('base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/base/:id', async (req, res) => {
  try {
    const data = await readData('base');
    const idx = data.items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return err404(res, 'Item not found');
    data.items[idx] = { ...data.items[idx], ...req.body, updatedAt: new Date().toISOString() };
    await writeData('base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/base/:id', async (req, res) => {
  try {
    const data = await readData('base');
    data.items = data.items.filter(i => i.id !== req.params.id);
    await writeData('base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.post('/api/base/:id/allocate', async (req, res) => {
  try {
    const [baseData, caixaData, contractData] = await Promise.all([
      readData('base'), readData('caixa'), readData('contracts')
    ]);
    const baseItemIdx = baseData.items.findIndex(i => i.id === req.params.id);
    if (baseItemIdx === -1) return err404(res, 'Base item not found');
    const baseItem = baseData.items[baseItemIdx];
    const allocationValue = parseFloat(req.body.value) || 0;
    const totalAllocated  = baseItem.allocations.reduce((s, a) => s + a.value, 0);
    if (totalAllocated + allocationValue > baseItem.value)
      return err400(res, `Cannot allocate more than available. Available: ${baseItem.value - totalAllocated}`);

    const allocation = {
      id: generateId('alc'), contractId: req.body.contractId,
      value: allocationValue, date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
    baseItem.allocations.push(allocation);
    baseItem.updatedAt = new Date().toISOString();

    caixaData.entries.push({
      id: generateId('cxa'), type: 'saida',
      description: `Alocação BASE: ${baseItem.description}`,
      value: allocationValue, date: allocation.date,
      contractId: req.body.contractId, baseItemId: req.params.id,
      category: 'base', notes: '', createdAt: new Date().toISOString()
    });

    const contract = contractData.contracts.find(c => c.id === req.body.contractId);
    if (contract) {
      if (!contract.baseAllocations) contract.baseAllocations = [];
      contract.baseAllocations.push(allocation);
    }

    await Promise.all([
      writeData('base', baseData),
      writeData('caixa', caixaData),
      writeData('contracts', contractData)
    ]);

    res.json({ base: baseData, caixa: caixaData, contracts: contractData });
  } catch (e) { err400(res, e.message); }
});

// ─── Sócios ──────────────────────────────────────────────────────────────────

app.get('/api/socios', async (req, res) => res.json(await readData('socios')));

app.post('/api/socios', async (req, res) => {
  try {
    const data = await readData('socios');
    const b = req.body;
    data.socios.push({
      id: generateId('soc'), name: b.name, document: b.document || '',
      email: b.email || '', phone: b.phone || '',
      participacao: parseFloat(b.participacao) || 0, notes: b.notes || '',
      createdAt: new Date().toISOString()
    });
    await writeData('socios', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/socios/:id', async (req, res) => {
  try {
    const data = await readData('socios');
    const idx = data.socios.findIndex(s => s.id === req.params.id);
    if (idx === -1) return err404(res, 'Sócio not found');
    data.socios[idx] = { ...data.socios[idx], ...req.body, id: req.params.id };
    await writeData('socios', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/socios/:id', async (req, res) => {
  try {
    const data = await readData('socios');
    data.socios = data.socios.filter(s => s.id !== req.params.id);
    await writeData('socios', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Investimentos ───────────────────────────────────────────────────────────

app.get('/api/investimentos', async (req, res) => res.json(await readData('investimentos')));

app.post('/api/investimentos', async (req, res) => {
  try {
    const b = req.body;
    const origem  = b.origem  || 'socio';
    const destino = b.destino || 'contrato';
    const valor   = parseFloat(b.value) || 0;
    const dataDoc = b.date || new Date().toISOString().split('T')[0];

    const [invData, baseData, caixaData] = await Promise.all([
      readData('investimentos'), readData('base'), readData('caixa')
    ]);

    const aporte = {
      id: generateId('ap'), socioId: b.socioId || null, value: valor, date: dataDoc,
      description: b.description || '', origem, destino,
      baseType: b.baseType || 'outros',
      contractId: destino === 'contrato' ? (b.contractId || null) : null,
      baseItemId: null, caixaEntryId: null,
      createdAt: new Date().toISOString()
    };

    if (destino === 'base') {
      const baseItem = {
        id: generateId('bas'), description: b.description || 'Aporte',
        type: b.baseType || 'outros', value: valor, date: dataDoc, allocations: [],
        notes: `Criado via Aporte (${origem === 'socio' ? 'sócio' : 'caixa da empresa'})`,
        aporteId: aporte.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      baseData.items.push(baseItem);
      aporte.baseItemId = baseItem.id;
    }

    if (origem === 'caixa_empresa') {
      const entry = {
        id: generateId('cxa'), type: 'saida',
        description: `[Aporte → ${destino === 'base' ? 'BASE' : 'Contrato'}] ${b.description || ''}`,
        value: valor, date: dataDoc,
        contractId: aporte.contractId, baseItemId: aporte.baseItemId,
        category: destino === 'base' ? 'aporte_base' : 'aporte_contrato',
        notes: `Aporte via caixa da empresa`, aporteId: aporte.id,
        createdAt: new Date().toISOString()
      };
      caixaData.entries.push(entry);
      aporte.caixaEntryId = entry.id;
    }

    invData.investimentos.push(aporte);

    await Promise.all([
      writeData('investimentos', invData),
      writeData('base', baseData),
      writeData('caixa', caixaData)
    ]);
    res.json(invData);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/investimentos/:id', async (req, res) => {
  try {
    const [invData, caixaData, baseData] = await Promise.all([
      readData('investimentos'), readData('caixa'), readData('base')
    ]);
    const aporte = invData.investimentos.find(i => i.id === req.params.id);
    if (aporte && aporte.caixaEntryId)
      caixaData.entries = caixaData.entries.filter(e => e.id !== aporte.caixaEntryId);
    if (aporte && aporte.baseItemId) {
      const bi = baseData.items.find(b => b.id === aporte.baseItemId);
      if (bi && (!bi.allocations || bi.allocations.length === 0))
        baseData.items = baseData.items.filter(b => b.id !== aporte.baseItemId);
    }
    invData.investimentos = invData.investimentos.filter(i => i.id !== req.params.id);
    await Promise.all([
      writeData('investimentos', invData),
      writeData('caixa', caixaData),
      writeData('base', baseData)
    ]);
    res.json(invData);
  } catch (e) { err400(res, e.message); }
});

// ─── Clientes ────────────────────────────────────────────────────────────────

app.get('/api/clientes', async (req, res) => res.json(await readData('clientes')));

app.post('/api/clientes', async (req, res) => {
  try {
    const data = await readData('clientes');
    const b = req.body;
    data.clientes.push({
      id: generateId('cli'), nome: b.nome || '', empresa: b.empresa || '',
      cargo: b.cargo || '', setor: b.setor || '',
      telefone: b.telefone || '', email: b.email || '',
      endereco: b.endereco || '', lat: b.lat || '', lng: b.lng || '',
      notas: b.notas || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await writeData('clientes', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/clientes/:id', async (req, res) => {
  try {
    const data = await readData('clientes');
    const idx = data.clientes.findIndex(c => c.id === req.params.id);
    if (idx === -1) return err404(res, 'Cliente não encontrado');
    data.clientes[idx] = { ...data.clientes[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeData('clientes', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const data = await readData('clientes');
    data.clientes = data.clientes.filter(c => c.id !== req.params.id);
    await writeData('clientes', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Fornecedores ────────────────────────────────────────────────────────────

app.get('/api/fornecedores', async (req, res) => res.json(await readData('fornecedores')));

app.post('/api/fornecedores', async (req, res) => {
  try {
    const data = await readData('fornecedores');
    const b = req.body;
    let materiais = b.materiais || [];
    if (typeof materiais === 'string')
      materiais = materiais.split(',').map(s => s.trim()).filter(Boolean);
    data.fornecedores.push({
      id: generateId('for'), nome: b.nome || '', cnpj: b.cnpj || '',
      endereco: b.endereco || '', telefone: b.telefone || '',
      pessoaContato: b.pessoaContato || '', materiais,
      banco: b.banco || '', agencia: b.agencia || '', conta: b.conta || '',
      chavePix: b.chavePix || '', notas: b.notas || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await writeData('fornecedores', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/fornecedores/:id', async (req, res) => {
  try {
    const data = await readData('fornecedores');
    const idx = data.fornecedores.findIndex(f => f.id === req.params.id);
    if (idx === -1) return err404(res, 'Fornecedor não encontrado');
    const b = { ...req.body };
    if (typeof b.materiais === 'string')
      b.materiais = b.materiais.split(',').map(s => s.trim()).filter(Boolean);
    data.fornecedores[idx] = { ...data.fornecedores[idx], ...b, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeData('fornecedores', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/fornecedores/:id', async (req, res) => {
  try {
    const data = await readData('fornecedores');
    data.fornecedores = data.fornecedores.filter(f => f.id !== req.params.id);
    await writeData('fornecedores', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Tipos BASE ──────────────────────────────────────────────────────────────

function slugify(texto) {
  return (texto || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40) || ('tipo_' + Date.now().toString(36));
}

app.get('/api/tipos-base', async (req, res) => res.json(await readData('tipos_base')));

app.post('/api/tipos-base', async (req, res) => {
  try {
    const data = await readData('tipos_base');
    const label = (req.body.label || '').trim();
    if (!label) return err400(res, 'Nome do tipo é obrigatório');
    let key = slugify(req.body.key || label);
    const existentes = data.tipos.map(t => t.key);
    let k = key, n = 2;
    while (existentes.includes(k)) { k = `${key}_${n++}`; }
    data.tipos.push({
      id: generateId('tpb'), key: k, label,
      icon: req.body.icon || '🔹', cor: req.body.cor || '#718096',
      sistema: false, createdAt: new Date().toISOString()
    });
    await writeData('tipos_base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/tipos-base/:id', async (req, res) => {
  try {
    const data = await readData('tipos_base');
    const idx = data.tipos.findIndex(t => t.id === req.params.id);
    if (idx === -1) return err404(res, 'Tipo não encontrado');
    const isSystem = data.tipos[idx].sistema;
    const updated = { ...data.tipos[idx] };
    if (req.body.label) updated.label = req.body.label.trim();
    if (req.body.icon)  updated.icon  = req.body.icon;
    if (req.body.cor)   updated.cor   = req.body.cor;
    if (!isSystem && req.body.key) updated.key = slugify(req.body.key);
    data.tipos[idx] = updated;
    await writeData('tipos_base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/tipos-base/:id', async (req, res) => {
  try {
    const [data, baseData] = await Promise.all([readData('tipos_base'), readData('base')]);
    const tipo = data.tipos.find(t => t.id === req.params.id);
    if (!tipo) return err404(res, 'Tipo não encontrado');
    if (tipo.sistema) return err400(res, 'Não é possível excluir tipos do sistema');
    if (baseData.items.some(i => i.type === tipo.key))
      return err400(res, 'Tipo em uso. Remova ou reclassifique os itens antes de excluir.');
    data.tipos = data.tipos.filter(t => t.id !== req.params.id);
    await writeData('tipos_base', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Contas a Pagar ──────────────────────────────────────────────────────────

app.get('/api/contas-pagar', async (req, res) => res.json(await readData('contas_pagar')));

app.post('/api/contas-pagar', async (req, res) => {
  try {
    const data = await readData('contas_pagar');
    const b = req.body;
    data.contas.push({
      id: generateId('cp'), descricao: b.descricao || '',
      fornecedorId: b.fornecedorId || null, numeroNF: b.numeroNF || '',
      valor: parseFloat(b.valor) || 0,
      dataEmissao: b.dataEmissao || new Date().toISOString().split('T')[0],
      dataVencimento: b.dataVencimento || '', status: 'pendente',
      dataPagamento: null, caixaEntryId: null,
      contractId: b.contractId || null, category: b.category || 'fornecedor',
      observacoes: b.observacoes || '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await writeData('contas_pagar', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/contas-pagar/:id', async (req, res) => {
  try {
    const data = await readData('contas_pagar');
    const idx = data.contas.findIndex(c => c.id === req.params.id);
    if (idx === -1) return err404(res, 'Conta não encontrada');
    data.contas[idx] = { ...data.contas[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeData('contas_pagar', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/contas-pagar/:id', async (req, res) => {
  try {
    const [data, caixa] = await Promise.all([readData('contas_pagar'), readData('caixa')]);
    const conta = data.contas.find(c => c.id === req.params.id);
    if (conta && conta.caixaEntryId)
      caixa.entries = caixa.entries.filter(e => e.id !== conta.caixaEntryId);
    data.contas = data.contas.filter(c => c.id !== req.params.id);
    await Promise.all([writeData('contas_pagar', data), writeData('caixa', caixa)]);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.post('/api/contas-pagar/:id/pagar', async (req, res) => {
  try {
    const [data, caixa] = await Promise.all([readData('contas_pagar'), readData('caixa')]);
    const idx = data.contas.findIndex(c => c.id === req.params.id);
    if (idx === -1) return err404(res, 'Conta não encontrada');
    const conta = data.contas[idx];
    if (conta.status === 'pago') return err400(res, 'Conta já foi paga');
    const b = req.body;
    const dataPagamento = b.dataPagamento || new Date().toISOString().split('T')[0];
    const caixaEntry = {
      id: generateId('cxa'), type: 'saida',
      description: conta.descricao + (conta.numeroNF ? ` — NF ${conta.numeroNF}` : '') + (b.formaPagamento ? ` [${b.formaPagamento}]` : ''),
      value: parseFloat(b.valorPago) || conta.valor,
      date: dataPagamento, contractId: conta.contractId || null, baseItemId: null,
      category: conta.category || 'fornecedor',
      notes: `Pagamento de conta: ${conta.descricao}`,
      formaPagamento: b.formaPagamento || null, contaPagarId: conta.id,
      createdAt: new Date().toISOString()
    };
    caixa.entries.push(caixaEntry);
    data.contas[idx] = {
      ...conta, status: 'pago', dataPagamento,
      valorPago: parseFloat(b.valorPago) || conta.valor,
      formaPagamento: b.formaPagamento || null,
      caixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString()
    };
    await Promise.all([writeData('contas_pagar', data), writeData('caixa', caixa)]);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.post('/api/contas-pagar/:id/estornar', async (req, res) => {
  try {
    const [data, caixa] = await Promise.all([readData('contas_pagar'), readData('caixa')]);
    const idx = data.contas.findIndex(c => c.id === req.params.id);
    if (idx === -1) return err404(res, 'Conta não encontrada');
    const conta = data.contas[idx];
    if (conta.caixaEntryId)
      caixa.entries = caixa.entries.filter(e => e.id !== conta.caixaEntryId);
    data.contas[idx] = {
      ...conta, status: 'pendente', dataPagamento: null,
      valorPago: null, caixaEntryId: null, updatedAt: new Date().toISOString()
    };
    await Promise.all([writeData('contas_pagar', data), writeData('caixa', caixa)]);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Notas Fiscais ───────────────────────────────────────────────────────────

app.get('/api/notas-fiscais', async (req, res) => res.json(await readData('notas_fiscais')));

app.post('/api/notas-fiscais', async (req, res) => {
  try {
    const data = await readData('notas_fiscais');
    const b = req.body;
    data.notas_fiscais.push({
      id: generateId('nf'), numero: b.numero, contractId: b.contractId,
      dataLimite: b.dataLimite, valor: parseFloat(b.valor) || 0,
      prazoRecebimento: parseInt(b.prazoRecebimento) || 30,
      observacoes: b.observacoes || '', emitida: false,
      dataEmissaoReal: null, caixaEntryId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    await writeData('notas_fiscais', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.put('/api/notas-fiscais/:id', async (req, res) => {
  try {
    const data = await readData('notas_fiscais');
    const idx = data.notas_fiscais.findIndex(n => n.id === req.params.id);
    if (idx === -1) return err404(res, 'Nota fiscal not found');
    data.notas_fiscais[idx] = { ...data.notas_fiscais[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeData('notas_fiscais', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

app.delete('/api/notas-fiscais/:id', async (req, res) => {
  try {
    const [nfData, caixa] = await Promise.all([readData('notas_fiscais'), readData('caixa')]);
    const nf = nfData.notas_fiscais.find(n => n.id === req.params.id);
    if (nf && nf.caixaEntryId)
      caixa.entries = caixa.entries.filter(e => e.id !== nf.caixaEntryId);
    nfData.notas_fiscais = nfData.notas_fiscais.filter(n => n.id !== req.params.id);
    await Promise.all([writeData('notas_fiscais', nfData), writeData('caixa', caixa)]);
    res.json(nfData);
  } catch (e) { err400(res, e.message); }
});

app.post('/api/notas-fiscais/:id/emitir', async (req, res) => {
  try {
    const [nfData, caixaData, contracts] = await Promise.all([
      readData('notas_fiscais'), readData('caixa'), readData('contracts')
    ]);
    const idx = nfData.notas_fiscais.findIndex(n => n.id === req.params.id);
    if (idx === -1) return err404(res, 'Nota fiscal não encontrada');
    const nf = nfData.notas_fiscais[idx];
    if (nf.emitida) return err400(res, 'Nota fiscal já foi emitida');
    const dataEmissaoReal = req.body.dataEmissaoReal || new Date().toISOString().split('T')[0];
    const prazo = parseInt(nf.prazoRecebimento) || 30;
    const dtEmissao = new Date(dataEmissaoReal + 'T12:00:00');
    const dtRecebimento = new Date(dtEmissao);
    dtRecebimento.setDate(dtRecebimento.getDate() + prazo);
    const dataRecebimento = dtRecebimento.toISOString().split('T')[0];
    const contract = contracts.contracts.find(c => c.id === nf.contractId);
    const caixaEntry = {
      id: generateId('cxa'), type: 'entrada',
      description: `Recebimento NF ${nf.numero}${contract ? ` - ${contract.client}` : ''}`,
      value: parseFloat(nf.valor) || 0, date: dataRecebimento,
      contractId: nf.contractId, baseItemId: null, category: 'nota_fiscal',
      notes: `NF ${nf.numero} emitida em ${dataEmissaoReal}, prazo ${prazo} dias`,
      nfId: nf.id, createdAt: new Date().toISOString()
    };
    caixaData.entries.push(caixaEntry);
    nfData.notas_fiscais[idx] = { ...nf, emitida: true, dataEmissaoReal, caixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString() };
    await Promise.all([writeData('notas_fiscais', nfData), writeData('caixa', caixaData)]);
    res.json({ notas_fiscais: nfData.notas_fiscais, caixa: caixaData, mensagem: `NF marcada como emitida. Entrada de ${nf.valor} agendada para ${dataRecebimento}` });
  } catch (e) { err400(res, e.message); }
});

app.post('/api/notas-fiscais/:id/cancelar-emissao', async (req, res) => {
  try {
    const [nfData, caixaData] = await Promise.all([readData('notas_fiscais'), readData('caixa')]);
    const idx = nfData.notas_fiscais.findIndex(n => n.id === req.params.id);
    if (idx === -1) return err404(res, 'Nota fiscal não encontrada');
    const nf = nfData.notas_fiscais[idx];
    if (nf.caixaEntryId)
      caixaData.entries = caixaData.entries.filter(e => e.id !== nf.caixaEntryId);
    nfData.notas_fiscais[idx] = { ...nf, emitida: false, dataEmissaoReal: null, caixaEntryId: null, updatedAt: new Date().toISOString() };
    await Promise.all([writeData('notas_fiscais', nfData), writeData('caixa', caixaData)]);
    res.json({ notas_fiscais: nfData.notas_fiscais });
  } catch (e) { err400(res, e.message); }
});

// ─── Níveis de Acesso ────────────────────────────────────────────────────────

app.get('/api/niveis-acesso', async (req, res) => res.json(await readData('niveis_acesso')));

app.put('/api/niveis-acesso/:id', async (req, res) => {
  try {
    const data = await readData('niveis_acesso');
    const idx = data.niveis.findIndex(n => n.id === req.params.id);
    if (idx === -1) return err404(res, 'Nível não encontrado');
    data.niveis[idx] = { ...data.niveis[idx], abas: req.body.abas || [] };
    await writeData('niveis_acesso', data);
    res.json(data);
  } catch (e) { err400(res, e.message); }
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

app.get('/api/dashboard', async (req, res) => {
  try {
    const [contracts, caixa, base, notasFiscais, contasPagar] = await Promise.all([
      readData('contracts'), readData('caixa'), readData('base'),
      readData('notas_fiscais'), readData('contas_pagar')
    ]);

    const hoje = new Date();
    const filtroAno = req.query.ano ? parseInt(req.query.ano) : null;
    const filtroMes = req.query.mes ? parseInt(req.query.mes) : null;
    const modoAno   = req.query.modo === 'ano';

    let periodoInicio = null, periodoFim = null;
    if (filtroAno && filtroMes && !modoAno) {
      periodoInicio = new Date(filtroAno, filtroMes - 1, 1);
      periodoFim    = new Date(filtroAno, filtroMes, 0, 23, 59, 59, 999);
    } else if (filtroAno && modoAno) {
      periodoInicio = new Date(filtroAno, 0, 1);
      periodoFim    = new Date(filtroAno, 11, 31, 23, 59, 59, 999);
    }

    const activeContracts    = contracts.contracts.filter(c => c.status === 'ativo').length;
    const totalContractValue = contracts.contracts.filter(c => c.status === 'ativo').reduce((s, c) => s + c.value, 0);
    const totalSaidas        = contracts.saidas.reduce((s, x) => s + x.value, 0);
    const totalBaseUnallocated = base.items.reduce((s, item) => {
      const alloc = item.allocations.reduce((a, x) => a + x.value, 0);
      return s + (item.value - alloc);
    }, 0);
    const caixaBalance = caixa.entries.reduce((s, e) => e.type === 'entrada' ? s + e.value : s - e.value, 0);
    const recentCaixaEntries = [...caixa.entries].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    const contractsWithMargin = contracts.contracts.map(c => {
      const cSaidas = contracts.saidas.filter(s => s.contractId === c.id).reduce((s, x) => s + x.value, 0);
      const margin  = c.value - cSaidas;
      return { id: c.id, name: c.name, client: c.client, value: c.value, totalSaidas: cSaidas, margin, marginPct: c.value > 0 ? ((margin / c.value) * 100).toFixed(2) : 0, status: c.status, endDate: c.endDate };
    });
    const em30dias = new Date(hoje); em30dias.setDate(em30dias.getDate() + 30);
    const contratosAVencer = contracts.contracts
      .filter(c => c.status === 'ativo' && c.endDate && new Date(c.endDate) >= hoje && new Date(c.endDate) <= em30dias)
      .map(c => ({ ...c, diasRestantes: Math.floor((new Date(c.endDate) - hoje) / 86400000) }))
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    const entriesOrdenadas = [...caixa.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const historicoCaixa = [];
    if (periodoInicio && periodoFim) {
      if (modoAno) {
        for (let m = 0; m < 12; m++) {
          const fimMes = new Date(filtroAno, m + 1, 0, 23, 59, 59, 999);
          historicoCaixa.push({ data: `${filtroAno}-${String(m+1).padStart(2,'0')}-01`, saldo: entriesOrdenadas.filter(e => new Date(e.date) <= fimMes).reduce((s, e) => e.type === 'entrada' ? s + e.value : s - e.value, 0), label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m] });
        }
      } else {
        const diasNoMes = new Date(filtroAno, filtroMes, 0).getDate();
        for (let d = 1; d <= diasNoMes; d++) {
          const dia = new Date(filtroAno, filtroMes - 1, d, 23, 59, 59, 999);
          historicoCaixa.push({ data: `${filtroAno}-${String(filtroMes).padStart(2,'0')}-${String(d).padStart(2,'0')}`, saldo: entriesOrdenadas.filter(e => new Date(e.date) <= dia).reduce((s, e) => e.type === 'entrada' ? s + e.value : s - e.value, 0) });
        }
      }
    } else {
      for (let i = 29; i >= 0; i--) {
        const dia = new Date(); dia.setDate(dia.getDate() - i); dia.setHours(23, 59, 59, 999);
        historicoCaixa.push({ data: dia.toISOString().split('T')[0], saldo: entriesOrdenadas.filter(e => new Date(e.date) <= dia).reduce((s, e) => e.type === 'entrada' ? s + e.value : s - e.value, 0) });
      }
    }

    const hojeStr = hoje.toISOString().split('T')[0];
    const em7Str  = (() => { const d = new Date(); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; })();
    const nfsStatus = { vencidas: 0, proximasVencer: 0, noPrazo: 0, emitidas: 0 };
    notasFiscais.notas_fiscais.forEach(nf => {
      if (nf.emitida) { nfsStatus.emitidas++; return; }
      if (nf.dataLimite < hojeStr) nfsStatus.vencidas++;
      else if (nf.dataLimite <= em7Str) nfsStatus.proximasVencer++;
      else nfsStatus.noPrazo++;
    });

    const projecaoFutura = [];
    for (let i = 1; i <= 90; i++) {
      const dia = new Date(); dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const entradasEsperadas = notasFiscais.notas_fiscais.filter(nf => !nf.emitida && nf.valor > 0).filter(nf => {
        const prazo = parseInt(nf.prazoRecebimento) || 30;
        const dt = new Date(nf.dataLimite + 'T12:00:00'); dt.setDate(dt.getDate() + prazo);
        return dt.toISOString().split('T')[0] === diaStr;
      }).map(nf => ({ nfId: nf.id, numero: nf.numero, contractId: nf.contractId, valor: nf.valor, dataEmissao: nf.dataLimite, prazoRecebimento: parseInt(nf.prazoRecebimento) || 30 }));
      if (entradasEsperadas.length > 0)
        projecaoFutura.push({ data: diaStr, entradas: entradasEsperadas, totalEntradas: entradasEsperadas.reduce((s, e) => s + e.valor, 0) });
    }

    const hojeStrCP = hojeStr;
    const em7StrCP  = em7Str;
    const contasPagarStatus = { vencidas: 0, proximasVencer: 0, pendentes: 0, totalPendente: 0 };
    contasPagar.contas.filter(c => c.status === 'pendente').forEach(c => {
      contasPagarStatus.pendentes++;
      contasPagarStatus.totalPendente += c.valor;
      if (c.dataVencimento && c.dataVencimento < hojeStrCP) contasPagarStatus.vencidas++;
      else if (c.dataVencimento && c.dataVencimento <= em7StrCP) contasPagarStatus.proximasVencer++;
    });

    const contasVencidasTotal = contasPagar.contas.filter(c => c.status === 'pendente' && c.dataVencimento && c.dataVencimento <= hojeStrCP).reduce((s, c) => s + (c.valor || 0), 0);
    const saldoProjetado = [];
    let saldoAcumulado = caixaBalance - contasVencidasTotal;
    for (let i = 1; i <= 60; i++) {
      const dia = new Date(); dia.setDate(dia.getDate() + i);
      const diaStr = dia.toISOString().split('T')[0];
      const ep = projecaoFutura.find(p => p.data === diaStr);
      if (ep) saldoAcumulado += ep.totalEntradas;
      const saidasCP = contasPagar.contas.filter(c => c.status === 'pendente' && c.dataVencimento === diaStr).reduce((s, c) => s + (c.valor || 0), 0);
      if (saidasCP > 0) saldoAcumulado -= saidasCP;
      if (i % 7 === 0 || i === 1) saldoProjetado.push({ data: diaStr, saldo: saldoAcumulado });
    }

    res.json({ activeContracts, totalContractValue, totalSaidas, totalBaseUnallocated, caixaBalance, recentCaixaEntries, contractsWithMargin, contratosAVencer, historicoCaixa, nfsStatus, projecaoFutura, saldoProjetado, contasPagarStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Export ──────────────────────────────────────────────────────────────────

exports.api = functions.https.onRequest(app);
