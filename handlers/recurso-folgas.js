'use strict';
/**
 * @file Folgas e Passagens de Recursos (colaboradores) — sub-recursos. Extraído
 * do server.js. As folgas vivem no JSONB `folgas` do recurso. Comprar passagem
 * cria lançamento de caixa OU conta a pagar e marca a passagem na folga.
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function handleAddFolga(id, body, res) {
  try {
    const rec = await repos.recursos.findById(id);
    if (!rec) return sendError(res, 404, 'Não encontrado');
    const folga = {
      id: generateId('fol'),
      dataInicio: body.dataInicio || '',
      dataFim: body.dataFim || '',
      observacoes: body.observacoes || '',
      passagemIda: {
        comprada: false,
        valor: 0,
        dataCompra: null,
        financiadoPor: null,
        contractIdPagador: null,
        caixaEntryId: null,
        contaPagarId: null,
      },
      passagemVolta: {
        comprada: false,
        valor: 0,
        dataCompra: null,
        financiadoPor: null,
        contractIdPagador: null,
        caixaEntryId: null,
        contaPagarId: null,
      },
      createdAt: new Date().toISOString(),
    };
    const folgas = (rec.folgas || []).concat(folga);
    await repos.recursos.updateById(id, {
      folgas: JSON.stringify(folgas),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { recursos: await repos.recursos.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteFolga(recursoId, folgaId, res) {
  try {
    const rec = await repos.recursos.findById(recursoId);
    if (!rec) return sendError(res, 404, 'Não encontrado');
    const folgas = (rec.folgas || []).filter((f) => f.id !== folgaId);
    await repos.recursos.updateById(recursoId, {
      folgas: JSON.stringify(folgas),
      updatedAt: new Date().toISOString(),
    });
    sendJson(res, { recursos: await repos.recursos.findAll() });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleComprarPassagem(recursoId, folgaId, body, res) {
  try {
    const recurso = await repos.recursos.findById(recursoId);
    if (!recurso) return sendError(res, 404, 'Recurso não encontrado');

    const folgas = recurso.folgas || [];
    const fIdx = folgas.findIndex((f) => f.id === folgaId);
    if (fIdx === -1) return sendError(res, 404, 'Folga não encontrada');

    const tipo = body.tipo === 'ida' ? 'passagemIda' : 'passagemVolta';
    const tipoLabel = body.tipo === 'ida' ? 'Ida' : 'Volta';
    const valor = money.parse(body.valor);
    const folga = folgas[fIdx];

    const contractId = body.contractIdPagador || recurso.alocacaoAtual?.contractId || null;
    let obraLabel = '';
    if (contractId) {
      const ct = await repos.contracts.findById(contractId);
      if (ct) obraLabel = ` — ${ct.name}`;
    }
    const descricao = `Passagem de ${tipoLabel} — ${recurso.nome}${obraLabel}`;
    const dataCompra = body.dataCompra || new Date().toISOString().split('T')[0];

    let caixaEntryId = null,
      contaPagarId = null;

    if (body.tipoLancamento === 'conta_pagar') {
      const conta = {
        id: generateId('cp'),
        descricao,
        fornecedorId: null,
        numeroNF: '',
        valor,
        dataEmissao: dataCompra,
        dataVencimento: folga.dataInicio || null,
        status: 'pendente',
        dataPagamento: null,
        caixaEntryId: null,
        contractId: body.financiadoPor === 'contrato' ? body.contractIdPagador || null : null,
        category: 'passagem',
        observacoes: `Folga de ${recurso.nome}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repos.contasPagar.create(conta);
      contaPagarId = conta.id;
    } else {
      const entry = {
        id: generateId('cxa'),
        type: 'saida',
        description: descricao,
        value: valor,
        date: dataCompra,
        contractId: body.financiadoPor === 'contrato' ? body.contractIdPagador || null : null,
        baseItemId: null,
        category: 'passagem',
        notes: `Passagem ${tipoLabel} folga de ${recurso.nome}`,
        createdAt: new Date().toISOString(),
      };
      await repos.caixa.create(entry);
      caixaEntryId = entry.id;
    }

    folgas[fIdx] = {
      ...folga,
      [tipo]: {
        comprada: true,
        valor,
        dataCompra,
        companhia: body.companhia || '',
        numeroVoo: body.numeroVoo || '',
        origem: body.origem || '',
        destino: body.destino || '',
        dataVoo: body.dataVoo || '',
        horario: body.horario || '',
        financiadoPor: body.financiadoPor,
        contractIdPagador: body.contractIdPagador || null,
        caixaEntryId,
        contaPagarId,
      },
    };
    try {
      await repos.recursos.updateById(recursoId, {
        folgas: JSON.stringify(folgas),
        updatedAt: new Date().toISOString(),
      });
    } catch (updateErr) {
      // Compensação: desfaz o lançamento financeiro se a folga não foi salva
      if (contaPagarId) repos.contasPagar.removeById(contaPagarId).catch(() => {});
      if (caixaEntryId) repos.caixa.removeById(caixaEntryId).catch(() => {});
      throw updateErr;
    }

    sendJson(res, {
      recursos: await repos.recursos.findAll(),
      caixa: { entries: await repos.caixa.findAll() },
      contas_pagar: { contas: await repos.contasPagar.findAll() },
    });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = { handleAddFolga, handleDeleteFolga, handleComprarPassagem };
