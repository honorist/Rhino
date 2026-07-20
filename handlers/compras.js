'use strict';
/**
 * @file Solicitações de Compra — fluxo pendente_avaliacao → pendente_aprovacao →
 * aprovada → comprada → recebida (+ cancelada / rejeitada), com máquina de
 * estados em lib/fluxo-compra. Inclui o histórico de cotações. Extraído do
 * server.js (desmembramento), sem alteração de comportamento.
 *
 * Dois passos mexem em dinheiro/estoque sob transação: handleComprarSolicitacao
 * cria a Conta a Pagar e marca 'comprada'; handleReceberSolicitacao dá entrada
 * no estoque, recalcula o custo médio (lib/estoque-custo) e marca 'recebida'. Os
 * helpers de almoxarifado vêm de handlers/estoque; os gates usam
 * permissions.temAba (antes o inline _temPermissao, mesmo comportamento).
 */
const db = require('../db');
const repos = require('../db/repos');
const { generateId } = require('../lib/id');
const fluxoCompra = require('../lib/fluxo-compra');
const { temAba } = require('../lib/permissions');
const { custoMedioPonderado } = require('../lib/estoque-custo');
const { ensureAlmoxarifadoCentral, _resolveAlmoxId, _ajustarSaldo } = require('./estoque');
const { sendJson, sendError } = require('../lib/http-respond');

// ============ Solicitações de Compra ============
// Normaliza itens na criação (encarregado): só descrição + qtd + observações (sem preço/cotações).
function _normalizaItensInicial(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => ({
      itemEstoqueId: it.itemEstoqueId || null,
      descricao: (it.descricao || '').trim(),
      qtd: parseFloat(it.qtd) || 0,
      observacoes: it.observacoes || '',
      tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
      cotacoes: [],
      cotacaoEscolhidaIdx: null,
      precoUnit: 0,
    }))
    .filter((it) => it.descricao && it.qtd > 0);
}

// Normaliza itens na avaliação (financeiro): cada item com cotações + cotacaoEscolhidaIdx.
// Retorna { itens, total, fornecedorIdEscolhido } onde fornecedorIdEscolhido é o fornecedor
// da primeira cotação escolhida (usado pra criar a Conta a Pagar).
function _normalizaItensComCotacoes(arr) {
  if (!Array.isArray(arr)) return { itens: [], total: 0, fornecedorIdEscolhido: null };
  let fornecedorIdEscolhido = null;
  const itens = arr
    .map((it) => {
      const cotacoes = Array.isArray(it.cotacoes)
        ? it.cotacoes.map((c) => ({
            fornecedorId: c.fornecedorId || null,
            fornecedorNome: (c.fornecedorNome || '').trim(),
            precoUnit: parseFloat(c.precoUnit) || 0,
            link: c.link || '',
            observacoes: c.observacoes || '',
          }))
        : [];
      const idx =
        it.cotacaoEscolhidaIdx != null && cotacoes[it.cotacaoEscolhidaIdx]
          ? it.cotacaoEscolhidaIdx
          : cotacoes.length > 0
            ? 0
            : null;
      const precoUnit = idx != null ? cotacoes[idx].precoUnit : 0;
      if (idx != null && !fornecedorIdEscolhido) fornecedorIdEscolhido = cotacoes[idx].fornecedorId;
      return {
        itemEstoqueId: it.itemEstoqueId || null,
        descricao: (it.descricao || '').trim(),
        qtd: parseFloat(it.qtd) || 0,
        observacoes: it.observacoes || '',
        tipo: it.tipo === 'aluguel' ? 'aluguel' : 'compra',
        cotacoes,
        cotacaoEscolhidaIdx: idx,
        precoUnit,
      };
    })
    .filter((it) => it.descricao && it.qtd > 0);
  const total = itens.reduce((s, i) => s + i.qtd * i.precoUnit, 0);
  return { itens, total, fornecedorIdEscolhido };
}

async function handleListSolicitacoesCompra(query, res) {
  try {
    const where = [];
    const params = [];
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.contractId) {
      params.push(query.contractId);
      where.push(`contract_id = $${params.length}`);
    }
    if (query.solicitanteUserId) {
      params.push(query.solicitanteUserId);
      where.push(`solicitante_user_id = $${params.length}`);
    }
    const sql = `SELECT * FROM solicitacoes_compra ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { solicitacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostSolicitacaoCompra(req, body, res) {
  try {
    // Encarregado cria com itens + qtd + destino (sede ou obra) + justificativa.
    // Preços são definidos pelo financeiro na avaliação.
    const itens = _normalizaItensInicial(body.itens);
    if (!itens.length) return sendError(res, 400, 'Adicione pelo menos um item válido');
    const id = generateId('sol');
    const data = {
      id,
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
      contractId: body.contractId || null,
      almoxarifadoDestinoId: await _resolveAlmoxId(body.almoxarifadoDestinoId || 'auto-central'),
      fornecedorId: null,
      itens: JSON.stringify(itens),
      valorTotal: 0,
      justificativa: body.justificativa || '',
      dataDesejadaObra: body.dataDesejadaObra || null,
      status: 'pendente_avaliacao',
    };
    const created = await repos.solicitacoesCompra.create(data);
    sendJson(res, { solicitacao: created });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutSolicitacaoCompra(id, body, res) {
  try {
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status !== 'pendente_avaliacao') {
      return sendError(res, 400, 'Só é possível editar solicitações aguardando avaliação');
    }
    const allowed = {};
    if (body.justificativa !== undefined) allowed.justificativa = body.justificativa;
    if (body.contractId !== undefined) allowed.contractId = body.contractId || null;
    if (body.almoxarifadoDestinoId !== undefined) {
      allowed.almoxarifadoDestinoId = await _resolveAlmoxId(body.almoxarifadoDestinoId);
    }
    if (body.itens !== undefined) {
      allowed.itens = JSON.stringify(_normalizaItensInicial(body.itens));
    }
    if (body.dataDesejadaObra !== undefined)
      allowed.dataDesejadaObra = body.dataDesejadaObra || null;
    const result = await repos.solicitacoesCompra.updateById(id, allowed);
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteSolicitacaoCompra(id, res) {
  try {
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (atual.status === 'aprovada')
      return sendError(res, 400, 'Solicitação aprovada não pode ser excluída');
    await repos.solicitacoesCompra.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ============ Histórico de Cotações ============

async function handleCotacoesHistorico(query, res) {
  try {
    const params = [];
    let itemFilter = '';
    if (query.item) {
      // Escapa metacaracteres ILIKE (%, _, \) — senão `?item=%` retorna tudo
      // e `?item=____` vira varredura cara (injeção de padrão ILIKE).
      params.push(`%${String(query.item).replace(/[%_\\]/g, (c) => '\\' + c)}%`);
      itemFilter = `AND t1.item_v->>'descricao' ILIKE $${params.length}`;
    }
    const sql = `
      SELECT
        sc.numero::text           AS sc_numero,
        sc.created_at,
        sc.contract_id,
        c.name                    AS contract_name,
        t1.item_v->>'descricao'   AS item_descricao,
        t2.cot_v->>'fornecedorNome' AS fornecedor,
        t2.cot_v->>'fornecedorId'   AS fornecedor_id,
        COALESCE((t2.cot_v->>'precoUnit')::numeric, 0) AS valor,
        (t2.cot_ord - 1) = COALESCE((t1.item_v->>'cotacaoEscolhidaIdx')::int, -1) AS venceu
      FROM solicitacoes_compra sc
      LEFT JOIN contracts c ON c.id = sc.contract_id,
        jsonb_array_elements(sc.itens) AS t1(item_v),
        jsonb_array_elements(t1.item_v -> 'cotacoes') WITH ORDINALITY AS t2(cot_v, cot_ord)
      WHERE sc.status NOT IN ('cancelada')
        AND jsonb_typeof(t1.item_v -> 'cotacoes') = 'array'
        AND jsonb_array_length(t1.item_v -> 'cotacoes') > 0
        AND (t2.cot_v->>'fornecedorNome') IS NOT NULL
        ${itemFilter}
      ORDER BY sc.created_at DESC
      LIMIT 1000
    `;
    const rows = await db.getMany(sql, params);
    sendJson(res, { cotacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handleAvaliarSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para avaliar solicitações');
    }
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(atual.status, 'avaliar')) {
      return sendError(res, 400, `Solicitação já está ${atual.status}`);
    }
    const { itens, total, fornecedorIdEscolhido } = _normalizaItensComCotacoes(body.itens);
    if (!itens.length) return sendError(res, 400, 'Itens inválidos');
    if (itens.some((it) => it.cotacoes.length === 0)) {
      return sendError(res, 400, 'Cada item precisa ter ao menos uma cotação');
    }

    // Destino vem do encarregado e NÃO é alterado pelo financeiro.
    const allowed = {
      itens: JSON.stringify(itens),
      valorTotal: total,
      fornecedorId: body.fornecedorId || fornecedorIdEscolhido || null,
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
      avaliadoEm: new Date(),
      status: 'pendente_aprovacao',
    };
    const result = await repos.solicitacoesCompra.updateById(id, allowed);
    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[avaliar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

async function handleCancelarSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para cancelar solicitações');
    }
    const atual = await repos.solicitacoesCompra.findById(id);
    if (!atual) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(atual.status, 'cancelar')) {
      return sendError(res, 400, `Solicitação já está ${atual.status}`);
    }
    if (!body.motivo || !body.motivo.trim()) {
      return sendError(res, 400, 'Motivo do cancelamento obrigatório');
    }
    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'cancelada',
      motivoCancelamento: body.motivo,
      canceladoEm: new Date(),
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleAprovarSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para aprovar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (sol.status === 'pendente_avaliacao') {
      return sendError(
        res,
        400,
        'Solicitação aguarda avaliação do financeiro antes de poder ser aprovada'
      );
    }
    if (!fluxoCompra.podeTransicionar(sol.status, 'aprovar'))
      return sendError(res, 400, `Solicitação já está ${sol.status}`);

    // Aprovação só autoriza — a Conta a Pagar nasce no /comprar (financeiro registra a compra),
    // e a entrada de estoque nasce no /receber (quando o material chega).
    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'aprovada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[aprovar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

// Financeiro registra que a compra foi efetivamente feita junto ao fornecedor.
// Cria a Conta a Pagar e marca a solicitação como 'comprada'.
async function handleComprarSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para registrar compras');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'comprar')) {
      return sendError(
        res,
        400,
        `Só é possível registrar compra de solicitações aprovadas (atual: ${sol.status})`
      );
    }

    const venc =
      body.dataVencimento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const fornecedorId = body.fornecedorId || sol.fornecedorId || null;
    const numeroPedido = (body.numeroPedido || '').trim();
    const dataPrevistaEntrega = body.dataPrevistaEntrega || null;

    const result = await db.withTransaction(async (client) => {
      // Cria Conta a Pagar com o valor já definido na avaliação
      const cpId = generateId('cp');
      await client.query(
        `INSERT INTO contas_pagar
          (id, descricao, valor, data_vencimento, fornecedor_id, contract_id, status, observacoes, category)
         VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8)`,
        [
          cpId,
          `Solicitação de compra #${sol.numero || id.slice(-6)}${numeroPedido ? ' · pedido ' + numeroPedido : ''}`,
          sol.valorTotal,
          venc,
          fornecedorId,
          sol.contractId,
          sol.justificativa || '',
          'Estoque',
        ]
      );

      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'comprada',
             comprador_user_id = $2, comprador_nome = $3, comprado_em = NOW(),
             numero_pedido = $4, data_prevista_entrega = $5,
             conta_pagar_id = $6, fornecedor_id = COALESCE($7, fornecedor_id), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          req.user?.id || null,
          req.user?.name || req.user?.email || null,
          numeroPedido || null,
          dataPrevistaEntrega,
          cpId,
          fornecedorId,
        ]
      );
      return db.rowToCamel(upd.rows[0]);
    });

    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[comprar-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

// Almoxarife / financeiro confirma chegada do material — gera entrada de estoque.
async function handleReceberSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:receber'))) {
      return sendError(res, 403, 'Sem permissão para confirmar recebimento');
    }
    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'receber')) {
      return sendError(
        res,
        400,
        `Só é possível receber solicitações compradas (atual: ${sol.status})`
      );
    }

    const itensSol = Array.isArray(sol.itens)
      ? sol.itens
      : typeof sol.itens === 'string'
        ? JSON.parse(sol.itens)
        : [];
    if (!itensSol.length) return sendError(res, 400, 'Solicitação sem itens');
    const destinoId = sol.almoxarifadoDestinoId || (await ensureAlmoxarifadoCentral());
    const dataReceb = body.dataRecebimento || new Date().toISOString().split('T')[0];
    const nfReceb = (body.nfRecebimento || '').trim();
    const obsReceb = (body.obsRecebimento || '').trim();

    const result = await db.withTransaction(async (client) => {
      const movIds = [];
      for (const it of itensSol) {
        if (!it.itemEstoqueId || !(parseFloat(it.qtd) > 0)) continue;
        const movId = generateId('mov');
        await client.query(
          `INSERT INTO estoque_movimentacoes
            (id, item_id, almoxarifado_destino_id, tipo, quantidade, custo_unit, contract_id, data, documento, user_id, notas)
           VALUES ($1,$2,$3,'entrada',$4,$5,$6,$7,$8,$9,$10)`,
          [
            movId,
            it.itemEstoqueId,
            destinoId,
            it.qtd,
            it.precoUnit || 0,
            sol.contractId,
            dataReceb,
            nfReceb || `Solicitação ${id}`,
            req.user?.id || null,
            `Recebida por ${req.user?.name || ''}`.trim(),
          ]
        );
        await _ajustarSaldo(client, it.itemEstoqueId, destinoId, parseFloat(it.qtd));
        // Recalcula custo médio ponderado
        if ((parseFloat(it.precoUnit) || 0) > 0) {
          const item = (
            await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [
              it.itemEstoqueId,
            ])
          ).rows[0];
          const saldoTotal =
            parseFloat(
              (
                await client.query(
                  'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
                  [it.itemEstoqueId]
                )
              ).rows[0].s
            ) || 0;
          const novoCustoMedio = custoMedioPonderado({
            saldoTotal,
            qtdEntrada: parseFloat(it.qtd),
            custoMedioAnterior: parseFloat(item?.custo_medio) || 0,
            precoUnitEntrada: parseFloat(it.precoUnit),
          });
          await client.query(
            'UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1',
            [it.itemEstoqueId, novoCustoMedio]
          );
        }
        movIds.push(movId);
      }

      const upd = await client.query(
        `UPDATE solicitacoes_compra
         SET status = 'recebida',
             recebedor_user_id = $2, recebedor_nome = $3, recebido_em = NOW(),
             data_recebimento = $4, nf_recebimento = $5, obs_recebimento = $6,
             movimentacao_ids = $7, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          req.user?.id || null,
          req.user?.name || req.user?.email || null,
          dataReceb,
          nfReceb || null,
          obsReceb || null,
          JSON.stringify(movIds),
        ]
      );
      return db.rowToCamel(upd.rows[0]);
    });

    sendJson(res, { solicitacao: result });
  } catch (e) {
    console.error('[receber-solicitacao]', e);
    sendError(res, 400, e.message);
  }
}

async function handleRejeitarSolicitacao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'solicitacoes-compra:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para rejeitar solicitações');
    }

    const sol = await repos.solicitacoesCompra.findById(id);
    if (!sol) return sendError(res, 404, 'Solicitação não encontrada');
    if (!fluxoCompra.podeTransicionar(sol.status, 'rejeitar'))
      return sendError(res, 400, `Solicitação já está ${sol.status}`);

    const result = await repos.solicitacoesCompra.updateById(id, {
      status: 'rejeitada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
      motivoRejeicao: body.motivo || '',
    });
    sendJson(res, { solicitacao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleListSolicitacoesCompra,
  handlePostSolicitacaoCompra,
  handlePutSolicitacaoCompra,
  handleDeleteSolicitacaoCompra,
  handleCotacoesHistorico,
  handleAvaliarSolicitacao,
  handleCancelarSolicitacao,
  handleAprovarSolicitacao,
  handleComprarSolicitacao,
  handleReceberSolicitacao,
  handleRejeitarSolicitacao,
  _normalizaItensInicial,
  _normalizaItensComCotacoes,
};
