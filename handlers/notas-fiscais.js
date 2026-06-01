'use strict';
/**
 * @file Handlers de Notas Fiscais (medições/BM) — CRUD + emitir/cancelar-emissão.
 * Extraído do server.js. `emitir` cria entrada AGENDADA no caixa (sob advisory
 * lock, FIX P1-3); `cancelar-emissão` remove. O PUT sincroniza a entrada de
 * caixa quando data/prazo mudam numa NF já emitida.
 */
const db = require('../db');
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');
const { validateBody, schemas } = require('../lib/validate');

async function envelope() { return { notas_fiscais: await repos.notasFiscais.findAll() }; }

async function handleGetNotasFiscais(res) {
  try { sendJson(res, await envelope()); } catch (e) { sendError(res, 500, e.message); }
}

async function handlePostNotaFiscal(body, res) {
  try {
    const p = validateBody(schemas.notaFiscalPost, body);
    const nf = {
      id: generateId('nf'),
      numero: p.numero, contractId: p.contractId, dataLimite: p.dataLimite,
      valor: p.valor, prazoRecebimento: p.prazoRecebimento, observacoes: p.observacoes,
      emitida: false, dataEmissaoReal: null, caixaEntryId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await repos.notasFiscais.create(nf);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handlePutNotaFiscal(id, body, res) {
  try {
    const existing = await repos.notasFiscais.findById(id);
    if (!existing) return sendError(res, 404, 'Nota fiscal not found');
    const allowed = { ...validateBody(schemas.notaFiscalPut, body) };
    allowed.updatedAt = new Date().toISOString();
    const updated = { ...existing, ...allowed };

    // Sincroniza a entrada de caixa quando data/prazo mudam para NF emitida.
    if (existing.emitida && existing.caixaEntryId) {
      const newDataEmissao = (allowed.dataEmissaoReal !== undefined ? allowed.dataEmissaoReal : existing.dataEmissaoReal);
      const newPrazo = (allowed.prazoRecebimento !== undefined ? allowed.prazoRecebimento : existing.prazoRecebimento);
      if (newDataEmissao) {
        const dtRecebimento = new Date(newDataEmissao + 'T12:00:00');
        dtRecebimento.setDate(dtRecebimento.getDate() + newPrazo);
        const dataRecebimento = dtRecebimento.toISOString().split('T')[0];
        await repos.caixa.updateById(existing.caixaEntryId, {
          value: updated.valor, date: dataRecebimento,
          notes: `NF ${updated.numero} emitida em ${newDataEmissao}, prazo ${newPrazo} dias`,
        });
      }
    }
    await repos.notasFiscais.updateById(id, allowed);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

async function handleDeleteNotaFiscal(id, res) {
  try {
    const nf = await repos.notasFiscais.findById(id);
    if (nf && nf.caixaEntryId) await repos.caixa.removeById(nf.caixaEntryId);
    await repos.notasFiscais.removeById(id);
    sendJson(res, await envelope());
  } catch (e) { sendError(res, 400, e.message); }
}

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
        id: generateId('cxa'), type: 'entrada', description: descricao,
        value: money.parse(nf.valor), date: dataRecebimento, contractId: nf.contractId, baseItemId: null,
        category: 'nota_fiscal', notes: `NF ${nf.numero} emitida em ${dataEmissaoReal}, prazo ${prazo} dias`,
        nfId: nf.id, createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(caixaEntry);
      await repos.notasFiscais.updateById(id, {
        emitida: true, dataEmissaoReal, caixaEntryId: caixaEntry.id, updatedAt: new Date().toISOString(),
      });
      return { dataRecebimento, valor: nf.valor };
    });

    sendJson(res, {
      notas_fiscais: await repos.notasFiscais.findAll(),
      caixa: { entries: await repos.caixa.findAll() },
      mensagem: `NF marcada como emitida. Entrada de ${result.valor} agendada para ${result.dataRecebimento}`,
    });
  } catch (e) { sendError(res, e.statusCode || 400, e.message); }
}

async function handleCancelarEmissao(id, res) {
  try {
    const nf = await repos.notasFiscais.findById(id);
    if (!nf) return sendError(res, 404, 'Nota fiscal não encontrada');
    if (nf.caixaEntryId) await repos.caixa.removeById(nf.caixaEntryId);
    await repos.notasFiscais.updateById(id, {
      emitida: false, dataEmissaoReal: null, caixaEntryId: null, updatedAt: new Date().toISOString(),
    });
    sendJson(res, { notas_fiscais: await repos.notasFiscais.findAll() });
  } catch (e) { sendError(res, 400, e.message); }
}

module.exports = {
  handleGetNotasFiscais, handlePostNotaFiscal, handlePutNotaFiscal,
  handleDeleteNotaFiscal, handleEmitirNotaFiscal, handleCancelarEmissao,
};
