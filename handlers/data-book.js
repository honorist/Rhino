'use strict';
/**
 * @file Data book / prontidão de comissionamento (item 12) — endpoint de LEITURA
 * que responde se a obra está PRONTA para a entrega. Não há tabela nova: agrega
 * dados que já existem — itens de punch list (repos.punchItens) + avanço físico
 * das atividades (SQL direto). A regra é a função pura lib/data-book.js ›
 * prontidao; aqui só se orquestra as consultas e responde HTTP.
 *
 * FASE 2 (fora deste MVP): gerar o PDF do data book (capa, índice, evidências).
 *
 * Cada consulta é embrulhada em safe() (molde handlers/dre.js): a ausência de
 * uma tabela ou um erro pontual devolve o fallback em vez de derrubar a
 * avaliação inteira.
 */
const db = require('../db');
const repos = require('../db/repos');
const { prontidao } = require('../lib/data-book');
const { sendJson, sendError } = require('../lib/http-respond');

/** GET /api/contracts/:id/data-book — prontidão de comissionamento da obra. */
async function handleGetDataBook(contractId, res) {
  try {
    const contract = await repos.contracts.findById(contractId);
    if (!contract) return sendError(res, 404, 'Contrato não encontrado');

    const safe = async (fn, fallback) => {
      try {
        return (await fn()) ?? fallback;
      } catch (e) {
        console.error('[data-book]', e.message);
        return fallback;
      }
    };

    const [punchItens, atividades] = await Promise.all([
      safe(() => repos.punchItens.findAll({ contractId }), []),
      safe(
        () => db.getMany('SELECT exec_pct FROM atividades WHERE contract_id = $1', [contractId]),
        []
      ),
    ]);

    sendJson(res, { prontidao: prontidao({ punchItens, atividades }) });
  } catch (e) {
    sendError(res, e.statusCode || 500, e.message);
  }
}

module.exports = { handleGetDataBook };
