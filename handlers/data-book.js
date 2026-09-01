'use strict';
/**
 * @file Data book / prontidão de comissionamento (item 12) — endpoint de LEITURA
 * que responde se a obra está PRONTA para a entrega. Não há tabela nova: agrega
 * dados que já existem — itens de punch list (repos.punchItens) + avanço físico
 * das atividades (SQL direto). A regra é a função pura lib/data-book.js ›
 * prontidao; aqui só se orquestra as consultas e responde HTTP.
 *
 * FASE 2 (F20): PDF do data book (capa, índice, evidências) via
 * lib/data-book-pdf.js — mesmo padrão de handlers/contract-rdos.js (PDF).
 *
 * Cada consulta é embrulhada em safe() (molde handlers/dre.js): a ausência de
 * uma tabela ou um erro pontual devolve o fallback em vez de derrubar a
 * avaliação inteira.
 */
const db = require('../db');
const repos = require('../db/repos');
const { prontidao } = require('../lib/data-book');
const { sendJson, sendError } = require('../lib/http-respond');

const safe = async (fn, fallback) => {
  try {
    return (await fn()) ?? fallback;
  } catch (e) {
    console.error('[data-book]', e.message);
    return fallback;
  }
};

async function _carregar(contractId) {
  const [punchItens, atividades] = await Promise.all([
    safe(() => repos.punchItens.findAll({ contractId }), []),
    safe(
      () => db.getMany('SELECT exec_pct FROM atividades WHERE contract_id = $1', [contractId]),
      []
    ),
  ]);
  return { punchItens, atividades };
}

/** GET /api/contracts/:id/data-book — prontidão de comissionamento da obra. */
async function handleGetDataBook(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');
    const { punchItens, atividades } = await _carregar(contractId);
    sendJson(res, { prontidao: prontidao({ punchItens, atividades }) });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

/** GET /api/contracts/:id/data-book/pdf — documento de entrega (capa+índice+evidências). */
async function handleGetDataBookPdf(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const { gerarDataBookPdf, isPdfAvailable } = require('../lib/data-book-pdf');
    if (!isPdfAvailable()) return sendError(res, 500, 'Gerador de PDF indisponível.');

    const [{ punchItens, atividades }, recursos] = await Promise.all([
      _carregar(contractId),
      safe(() => repos.recursos.findAll(), []),
    ]);
    const resumo = prontidao({ punchItens, atividades });
    const buf = await gerarDataBookPdf(contract, resumo, punchItens, recursos);

    const fname = `DataBook_${String(contract.name || contractId).replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': buf.length,
      'Content-Disposition': `inline; filename="${fname}"`,
    });
    res.end(buf);
  } catch (e) {
    console.error('[data-book/pdf] erro:', e);
    sendError(res, e.statusCode || 500, e.message);
  }
}

module.exports = { handleGetDataBook, handleGetDataBookPdf };
