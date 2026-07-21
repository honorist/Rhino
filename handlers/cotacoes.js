'use strict';
/**
 * @file Mapa de cotações + Pedido de Compra (roadmap item 13).
 *
 * Fluxo de compras GLOBAL (não por obra, embora possa referenciar uma):
 *   1. Cria-se uma COTAÇÃO com seus ITENS (o que se quer comprar).
 *   2. Preenche-se a MATRIZ item×fornecedor (cotacao_precos) — os PREÇOS.
 *   3. Compara-se (mapa / vencedor / totais / economia) e GERA-SE um pedido de
 *      compra (PO) para um fornecedor.
 *
 * Toda a REGRA (matriz, menor preço, totais, economia, total do pedido) vive em
 * lib/cotacao.js; aqui só se orquestra HTTP + persistência.
 *
 * Envelope de detalhe { cotacao, itens, precos, mapa, melhores, totais, economia }:
 * como no punch/SSMA, cada mutação de item/preço devolve a VERDADE COMPLETA da
 * cotação (matriz e análise já calculadas) para o front re-renderizar sem
 * recalcular. Mutações do cabeçalho (POST/PUT cotação) devolvem só a linha; o
 * pedido de compra devolve { ordem, itens }.
 *
 * Preços da matriz: a célula (item, fornecedor) é gravada por UPSERT em
 * PUT /api/cotacoes/:id/precos. precoUnit ≤ 0 LIMPA a célula (remove a linha),
 * mantendo a coluna do fornecedor significativa (só aparece quem tem preço > 0).
 */
const repos = require('../db/repos');
const cotacaoLib = require('../lib/cotacao');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

/** Número (qtd/preço) tolerante a vírgula decimal; inválido → 0. */
function _num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Garante que a cotação existe. Lança Error com statusCode 404 caso contrário.
 * @param {string} cotacaoId @returns {Promise<object>}
 */
async function _assertCotacao(cotacaoId) {
  const c = await repos.cotacoes.findById(cotacaoId);
  if (!c) { const e = new Error('Cotação não encontrada'); e.statusCode = 404; throw e; }
  return c;
}

/**
 * Garante que o item existe e pertence à cotação (404 caso contrário).
 * @param {string} cotacaoId @param {string} itemId @returns {Promise<object>}
 */
async function _assertItemDaCotacao(cotacaoId, itemId) {
  const it = await repos.cotacaoItens.findById(itemId);
  if (!it || it.cotacaoId !== cotacaoId) {
    const e = new Error('Item não encontrado nesta cotação'); e.statusCode = 404; throw e;
  }
  return it;
}

/**
 * Garante que o preço existe e pertence à cotação (404 caso contrário).
 * @param {string} cotacaoId @param {string} precoId @returns {Promise<object>}
 */
async function _assertPrecoDaCotacao(cotacaoId, precoId) {
  const p = await repos.cotacaoPrecos.findById(precoId);
  if (!p || p.cotacaoId !== cotacaoId) {
    const e = new Error('Preço não encontrado nesta cotação'); e.statusCode = 404; throw e;
  }
  return p;
}

/**
 * Garante que o pedido de compra existe (404 caso contrário).
 * @param {string} ordemId @returns {Promise<object>}
 */
async function _assertOrdem(ordemId) {
  const o = await repos.ordensCompra.findById(ordemId);
  if (!o) { const e = new Error('Pedido de compra não encontrado'); e.statusCode = 404; throw e; }
  return o;
}

/**
 * Monta o envelope de detalhe da cotação: cabeçalho, itens, matriz de preços e a
 * análise (mapa, vencedores, totais por fornecedor, economia).
 * @param {string} cotacaoId @param {object} [cotacao] cabeçalho já carregado.
 * @returns {Promise<object>}
 */
async function _detalhe(cotacaoId, cotacao) {
  const cab = cotacao || (await repos.cotacoes.findById(cotacaoId));
  const itens = await repos.cotacaoItens.findAll({ cotacaoId });
  const precos = await repos.cotacaoPrecos.findAll({ cotacaoId });
  return {
    cotacao: cab,
    itens,
    precos,
    mapa: cotacaoLib.mapa(itens, precos),
    melhores: cotacaoLib.melhorPorItem(itens, precos),
    totais: cotacaoLib.totaisPorFornecedor(itens, precos),
    economia: cotacaoLib.economia(itens, precos),
  };
}

// ── Cotações (cabeçalho) ─────────────────────────────────────────────────────

/** GET /api/cotacoes — lista de cotações. Filtra por ?status e ?contractId. */
async function handleListCotacoes(query, res) {
  try {
    const filtros = {};
    if (query && query.status) filtros.status = String(query.status);
    if (query && query.contractId) filtros.contractId = String(query.contractId);
    sendJson(res, await repos.cotacoes.findAll(filtros));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** GET /api/cotacoes/:id — cotação + itens + matriz + análise (envelope). */
async function handleGetCotacao(cotacaoId, res) {
  try {
    const cab = await _assertCotacao(cotacaoId);
    sendJson(res, await _detalhe(cotacaoId, cab));
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** POST /api/cotacoes — cria uma cotação. `descricao` é obrigatória. */
async function handlePostCotacao(body, res) {
  try {
    const descricao = String((body && body.descricao) || '').trim();
    if (!descricao) return sendError(res, 400, 'Descrição é obrigatória');
    const agora = new Date().toISOString();
    const nova = {
      id: generateId('cot'),
      contractId: (body && body.contractId) || null,
      descricao,
      status: cotacaoLib.normalizarStatusCotacao(body && body.status),
      dataAbertura: (body && body.dataAbertura) || new Date().toISOString().split('T')[0],
      observacoes: (body && body.observacoes) || '',
      createdAt: agora,
      updatedAt: agora,
    };
    sendJson(res, await repos.cotacoes.create(nova));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/cotacoes/:id — atualiza os campos presentes do cabeçalho. */
async function handlePutCotacao(cotacaoId, body, res) {
  try {
    await _assertCotacao(cotacaoId);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.descricao !== undefined) {
      const d = String(body.descricao || '').trim();
      if (!d) return sendError(res, 400, 'Descrição é obrigatória');
      patch.descricao = d;
    }
    if (body.status !== undefined) patch.status = cotacaoLib.normalizarStatusCotacao(body.status);
    if (body.contractId !== undefined) patch.contractId = body.contractId || null;
    if (body.dataAbertura !== undefined) patch.dataAbertura = body.dataAbertura || null;
    if (body.observacoes !== undefined) patch.observacoes = body.observacoes || '';
    sendJson(res, await repos.cotacoes.updateById(cotacaoId, patch));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/cotacoes/:id — remove a cotação (cascata itens e preços). */
async function handleDeleteCotacao(cotacaoId, res) {
  try {
    await _assertCotacao(cotacaoId);
    await repos.cotacoes.removeById(cotacaoId);
    sendJson(res, { ok: true, id: cotacaoId });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ── Itens da cotação (linhas da matriz) ──────────────────────────────────────

/** POST /api/cotacoes/:id/itens — adiciona um item. Devolve o detalhe. */
async function handlePostCotacaoItem(cotacaoId, body, res) {
  try {
    await _assertCotacao(cotacaoId);
    const descricao = String((body && body.descricao) || '').trim();
    if (!descricao) return sendError(res, 400, 'Descrição do item é obrigatória');
    const agora = new Date().toISOString();
    await repos.cotacaoItens.create({
      id: generateId('coti'),
      cotacaoId,
      descricao,
      unidade: String((body && body.unidade) || 'un').trim() || 'un',
      quantidade: _num(body && body.quantidade),
      createdAt: agora,
      updatedAt: agora,
    });
    sendJson(res, await _detalhe(cotacaoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** PUT /api/cotacoes/:id/itens/:itemId — atualiza um item. Devolve o detalhe. */
async function handlePutCotacaoItem(cotacaoId, itemId, body, res) {
  try {
    await _assertCotacao(cotacaoId);
    await _assertItemDaCotacao(cotacaoId, itemId);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.descricao !== undefined) {
      const d = String(body.descricao || '').trim();
      if (!d) return sendError(res, 400, 'Descrição do item é obrigatória');
      patch.descricao = d;
    }
    if (body.unidade !== undefined) patch.unidade = String(body.unidade || 'un').trim() || 'un';
    if (body.quantidade !== undefined) patch.quantidade = _num(body.quantidade);
    await repos.cotacaoItens.updateById(itemId, patch);
    sendJson(res, await _detalhe(cotacaoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/cotacoes/:id/itens/:itemId — remove o item (e seus preços). */
async function handleDeleteCotacaoItem(cotacaoId, itemId, res) {
  try {
    await _assertCotacao(cotacaoId);
    await _assertItemDaCotacao(cotacaoId, itemId);
    await repos.cotacaoItens.removeById(itemId);
    sendJson(res, await _detalhe(cotacaoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ── Preços (células da matriz) ───────────────────────────────────────────────

/**
 * PUT /api/cotacoes/:id/precos — grava (upsert) a célula (itemId, fornecedorId).
 * precoUnit > 0 cria/atualiza; ≤ 0 limpa a célula (remove a linha existente).
 * Devolve o detalhe recalculado. body: { itemId, fornecedorId, precoUnit }.
 */
async function handleUpsertCotacaoPreco(cotacaoId, body, res) {
  try {
    await _assertCotacao(cotacaoId);
    const itemId = body && body.itemId;
    const fornecedorId = body && body.fornecedorId;
    if (!itemId) return sendError(res, 400, 'itemId é obrigatório');
    if (!fornecedorId) return sendError(res, 400, 'fornecedorId é obrigatório');
    await _assertItemDaCotacao(cotacaoId, itemId);
    const precoUnit = _num(body.precoUnit);
    const existentes = await repos.cotacaoPrecos.findAll({ cotacaoId, itemId, fornecedorId });
    const atual = existentes[0] || null;
    if (precoUnit > 0) {
      const agora = new Date().toISOString();
      if (atual) {
        await repos.cotacaoPrecos.updateById(atual.id, { precoUnit, updatedAt: agora });
      } else {
        await repos.cotacaoPrecos.create({
          id: generateId('cotp'),
          cotacaoId,
          itemId,
          fornecedorId,
          precoUnit,
          createdAt: agora,
          updatedAt: agora,
        });
      }
    } else if (atual) {
      await repos.cotacaoPrecos.removeById(atual.id);
    }
    sendJson(res, await _detalhe(cotacaoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/cotacoes/:id/precos/:precoId — remove uma célula da matriz. */
async function handleDeleteCotacaoPreco(cotacaoId, precoId, res) {
  try {
    await _assertCotacao(cotacaoId);
    await _assertPrecoDaCotacao(cotacaoId, precoId);
    await repos.cotacaoPrecos.removeById(precoId);
    sendJson(res, await _detalhe(cotacaoId));
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ── Gerar pedido de compra ───────────────────────────────────────────────────

/**
 * POST /api/cotacoes/:id/gerar-ordem — emite um pedido de compra (PO) para UM
 * fornecedor. body.fornecedorId escolhe; se ausente, usa o vencedor global (o de
 * menor total em totaisPorFornecedor). Os itens do PO são os que esse fornecedor
 * cotou (preço > 0), com quantidade e preço snapshot da cotação. valor_total vem
 * de lib.totalOrdem. Fecha a cotação (se ainda aberta/em análise). Devolve
 * { ordem, itens }. body opcional: { fornecedorId, numero, dataEmissao, contractId }.
 */
async function handleGerarOrdem(cotacaoId, body, res) {
  try {
    const cotacao = await _assertCotacao(cotacaoId);
    const itens = await repos.cotacaoItens.findAll({ cotacaoId });
    const precos = await repos.cotacaoPrecos.findAll({ cotacaoId });
    const totais = cotacaoLib.totaisPorFornecedor(itens, precos);
    const fornecedorId = (body && body.fornecedorId) || (totais[0] && totais[0].fornecedorId) || null;
    if (!fornecedorId) return sendError(res, 400, 'Sem fornecedor com preços para gerar o pedido');

    // Preço do fornecedor escolhido por item (só cotações válidas > 0).
    const precoDe = new Map();
    for (const p of precos) {
      if (p.fornecedorId === fornecedorId && Number(p.precoUnit) > 0) precoDe.set(p.itemId, Number(p.precoUnit));
    }
    const linhasPO = [];
    for (const it of itens) {
      if (precoDe.has(it.id)) {
        linhasPO.push({
          descricao: it.descricao,
          unidade: it.unidade || 'un',
          quantidade: Number(it.quantidade) || 0,
          precoUnit: precoDe.get(it.id),
        });
      }
    }
    if (linhasPO.length === 0) return sendError(res, 400, 'O fornecedor selecionado não cotou nenhum item');

    const agora = new Date().toISOString();
    const seq = await repos.ordensCompra.count();
    const ordemId = generateId('oc');
    const ordem = await repos.ordensCompra.create({
      id: ordemId,
      cotacaoId,
      fornecedorId,
      contractId: cotacao.contractId || (body && body.contractId) || null,
      numero: (body && body.numero && String(body.numero).trim()) || ('PC-' + String(seq + 1).padStart(4, '0')),
      status: 'emitida',
      valorTotal: cotacaoLib.totalOrdem(linhasPO),
      dataEmissao: (body && body.dataEmissao) || new Date().toISOString().split('T')[0],
      createdAt: agora,
      updatedAt: agora,
    });

    const itensCriados = [];
    for (const oi of linhasPO) {
      itensCriados.push(await repos.ordemCompraItens.create({
        id: generateId('oci'),
        ordemId,
        descricao: oi.descricao,
        unidade: oi.unidade,
        quantidade: oi.quantidade,
        precoUnit: oi.precoUnit,
        createdAt: agora,
        updatedAt: agora,
      }));
    }

    // Fechar a cotação — só se ainda estava em curso (não reabre uma cancelada).
    if (cotacao.status === 'aberta' || cotacao.status === 'em_analise') {
      await repos.cotacoes.updateById(cotacaoId, { status: 'fechada', updatedAt: agora });
    }

    sendJson(res, { ordem, itens: itensCriados });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

// ── Pedidos de compra ────────────────────────────────────────────────────────

/**
 * GET /api/ordens-compra — pedidos emitidos, cada um com seus itens embutidos.
 * Filtra por ?cotacaoId, ?fornecedorId, ?contractId, ?status.
 */
async function handleListOrdens(query, res) {
  try {
    const filtros = {};
    if (query && query.cotacaoId) filtros.cotacaoId = String(query.cotacaoId);
    if (query && query.fornecedorId) filtros.fornecedorId = String(query.fornecedorId);
    if (query && query.contractId) filtros.contractId = String(query.contractId);
    if (query && query.status) filtros.status = String(query.status);
    const ordens = await repos.ordensCompra.findAll(filtros);
    const comItens = [];
    for (const o of ordens) {
      comItens.push({ ...o, itens: await repos.ordemCompraItens.findAll({ ordemId: o.id }) });
    }
    sendJson(res, comItens);
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** GET /api/ordens-compra/:id — pedido + itens. */
async function handleGetOrdem(ordemId, res) {
  try {
    const ordem = await _assertOrdem(ordemId);
    const itens = await repos.ordemCompraItens.findAll({ ordemId });
    sendJson(res, { ...ordem, itens });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/**
 * PUT /api/ordens-compra/:id — atualiza status (emitida|recebida|cancelada),
 * número e data de emissão. Devolve o pedido com itens.
 */
async function handlePutOrdem(ordemId, body, res) {
  try {
    await _assertOrdem(ordemId);
    const patch = { updatedAt: new Date().toISOString() };
    if (body.status !== undefined) patch.status = cotacaoLib.normalizarStatusOrdem(body.status);
    if (body.numero !== undefined) patch.numero = String(body.numero || '').trim() || null;
    if (body.dataEmissao !== undefined) patch.dataEmissao = body.dataEmissao || null;
    const atualizada = await repos.ordensCompra.updateById(ordemId, patch);
    const itens = await repos.ordemCompraItens.findAll({ ordemId });
    sendJson(res, { ...atualizada, itens });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

/** DELETE /api/ordens-compra/:id — remove o pedido (cascata itens). */
async function handleDeleteOrdem(ordemId, res) {
  try {
    await _assertOrdem(ordemId);
    await repos.ordensCompra.removeById(ordemId);
    sendJson(res, { ok: true, id: ordemId });
  } catch (e) {
    sendError(res, e.statusCode || 400, e.message);
  }
}

module.exports = {
  handleListCotacoes,
  handleGetCotacao,
  handlePostCotacao,
  handlePutCotacao,
  handleDeleteCotacao,
  handlePostCotacaoItem,
  handlePutCotacaoItem,
  handleDeleteCotacaoItem,
  handleUpsertCotacaoPreco,
  handleDeleteCotacaoPreco,
  handleGerarOrdem,
  handleListOrdens,
  handleGetOrdem,
  handlePutOrdem,
  handleDeleteOrdem,
};
