'use strict';
/**
 * @file Handlers de Investimentos (aportes) — Get/Post/Delete. Extraído do
 * server.js. O aporte pode gerar item da BASE + lançamento de caixa; a exclusão
 * reverte ambos sob advisory lock (FIX P1-3). Sem update (não há PUT).
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function envelope() { return { investimentos: await repos.investimentos.findAll() }; }

async function handleGetInvestimentos(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostInvestimento(body, res) {
  try {
    const origem = body.origem || 'socio';
    const destino = body.destino || 'contrato';
    const valor = money.parse(body.value);
    const dataDoc = body.date || new Date().toISOString().split('T')[0];

    const aporte = {
      id: generateId('ap'),
      socioId: body.socioId || null,
      value: valor, date: dataDoc, description: body.description || '',
      origem, destino, baseType: body.baseType || 'outros',
      contractId: destino === 'contrato' ? (body.contractId || null) : null,
      baseItemId: null, caixaEntryId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };

    if (destino === 'base') {
      const baseItem = {
        id: generateId('bas'),
        description: body.description || 'Aporte', type: body.baseType || 'outros',
        value: valor, date: dataDoc, allocations: '[]',
        notes: `Criado via Aporte (${origem === 'socio' ? 'sócio' : 'caixa da empresa'})`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await repos.baseItems.create(baseItem);
      aporte.baseItemId = baseItem.id;
    }

    if (origem === 'caixa_empresa') {
      const destLabel = destino === 'base' ? 'BASE' : 'Contrato';
      const entry = {
        id: generateId('cxa'), type: 'saida',
        description: `[Aporte → ${destLabel}] ${body.description || 'Aquisição via caixa da empresa'}`,
        value: valor, date: dataDoc, contractId: aporte.contractId, baseItemId: aporte.baseItemId,
        category: destino === 'base' ? 'aporte_base' : 'aporte_contrato',
        notes: `Aporte via caixa da empresa - destino: ${destLabel}`,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(entry);
      aporte.caixaEntryId = entry.id;
    }

    await repos.investimentos.create(aporte);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

/**
 * Exclui um aporte + entrada de caixa + base item órfão. Serializa via advisory
 * lock (FIX P1-3) para evitar delete duplo do caixaEntry / race no baseItem.
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
      // FIX: remover o investimento DENTRO da transação (antes ficava fora → refs órfãs se falhasse).
      await repos.investimentos.removeById(id);
    });
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = { handleGetInvestimentos, handlePostInvestimento, handleDeleteInvestimento };
