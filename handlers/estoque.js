'use strict';
/**
 * @file Handlers de Almoxarifado / Estoque — itens, almoxarifados, movimentações
 * (entrada/saída/transferência/ajuste), saldo por item × almoxarifado e a visão
 * geral. Extraído do server.js (desmembramento).
 *
 * Fala SQL direto (db.getOne/getMany/withTransaction) — este módulo não tem
 * repositório em db/repos, o schema é acessado aqui mesmo, como antes.
 *
 * Os helpers `ensureAlmoxarifadoCentral`, `ensureAlmoxarifadoObra`,
 * `_resolveAlmoxId` e `_ajustarSaldo` também são usados por Solicitações de
 * Compra e pelo startup, que continuam no server.js — por isso são exportados
 * daqui (o server.js os importa em vez de redefinir).
 */
const db = require('../db');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');

// ── Helpers de auto-criação ──
// Garante que o almoxarifado Central existe (1 só, sem contract_id).
// Chamado no startup e no GET /api/estoque/visao-geral.
async function ensureAlmoxarifadoCentral() {
  const existe = await db.getOne(
    `SELECT id FROM almoxarifados WHERE contract_id IS NULL AND ativo = TRUE ORDER BY created_at ASC LIMIT 1`
  );
  if (existe) return existe.id;
  const id = generateId('almox');
  await db.query(
    `INSERT INTO almoxarifados (id, nome, contract_id, ativo) VALUES ($1, 'Central', NULL, TRUE)`,
    [id]
  );
  return id;
}

// Cria almoxarifado de obra automaticamente quando precisar movimentar pra ela.
// Reusa o existente se já houver. Endereço puxado do contract.
async function ensureAlmoxarifadoObra(contractId) {
  if (!contractId) return null;
  const existe = await db.getOne(
    `SELECT id FROM almoxarifados WHERE contract_id = $1 AND ativo = TRUE LIMIT 1`,
    [contractId]
  );
  if (existe) return existe.id;
  const contract = await db.getOne('SELECT name, endereco FROM contracts WHERE id = $1', [
    contractId,
  ]);
  if (!contract) return null;
  const id = generateId('almox');
  await db.query(
    `INSERT INTO almoxarifados (id, nome, contract_id, endereco, ativo) VALUES ($1, $2, $3, $4, TRUE)`,
    [id, `Almox - ${contract.name || 'Obra'}`, contractId, contract.endereco || null]
  );
  return id;
}

// Resolve aliases especiais pra IDs reais de almoxarifado:
//   "auto-central"          → id do Central (cria se preciso)
//   "auto-obra:<contractId>"→ id do almox da obra (cria se preciso)
//   <id normal>             → passa direto
async function _resolveAlmoxId(rawId) {
  if (!rawId || typeof rawId !== 'string') return rawId || null;
  if (rawId === 'auto-central') return await ensureAlmoxarifadoCentral();
  const m = rawId.match(/^auto-obra:(.+)$/);
  if (m) return await ensureAlmoxarifadoObra(m[1]);
  return rawId;
}

// Visão geral: matriz item × almoxarifado pronta pra render.
// Garante o Central existindo. Inclui contract_name pros almox de obra.
async function handleGetVisaoGeral(res) {
  try {
    await ensureAlmoxarifadoCentral();
    const almoxs = await db.getMany(
      `SELECT a.id, a.nome, a.contract_id, a.endereco, a.ativo, c.name AS contract_name
       FROM almoxarifados a LEFT JOIN contracts c ON c.id = a.contract_id
       WHERE a.ativo = TRUE
       ORDER BY (a.contract_id IS NULL) DESC, c.name ASC, a.nome ASC`
    );
    const itens = await db.getMany(
      `SELECT i.id, i.codigo, i.descricao, i.unidade, i.categoria, i.estoque_minimo, i.custo_medio,
              i.notas,
              COALESCE(json_agg(
                json_build_object('almoxId', s.almoxarifado_id, 'qtd', s.quantidade)
                ORDER BY s.almoxarifado_id
              ) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS saldos
       FROM itens_estoque i
       LEFT JOIN estoque_saldo s ON s.item_id = i.id
       WHERE i.ativo = TRUE
       GROUP BY i.id ORDER BY i.descricao ASC`
    );
    sendJson(res, { almoxarifados: almoxs, itens });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ── Itens ──
async function handleListItensEstoque(res) {
  try {
    const rows = await db.getMany(
      `SELECT * FROM itens_estoque WHERE ativo = TRUE ORDER BY descricao ASC`
    );
    sendJson(res, { itens: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostItemEstoque(body, res) {
  try {
    const id = generateId('item');
    const row = await db.getOne(
      `INSERT INTO itens_estoque (id, codigo, descricao, unidade, categoria, estoque_minimo, custo_medio, notas, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
      [
        id,
        body.codigo || null,
        String(body.descricao || '').slice(0, 200),
        body.unidade || null,
        body.categoria || null,
        parseFloat(body.estoqueMinimo) || 0,
        parseFloat(body.custoMedio) || 0,
        body.notas || null,
      ]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutItemEstoque(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE itens_estoque SET
         codigo=$2, descricao=$3, unidade=$4, categoria=$5,
         estoque_minimo=$6, notas=$7, ativo=$8, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [
        id,
        body.codigo || null,
        String(body.descricao || '').slice(0, 200),
        body.unidade || null,
        body.categoria || null,
        parseFloat(body.estoqueMinimo) || 0,
        body.notas || null,
        body.ativo !== false,
      ]
    );
    if (!row) return sendError(res, 404, 'Item não encontrado');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteItemEstoque(id, res) {
  try {
    // Soft delete (preserva histórico de movimentações)
    await db.query('UPDATE itens_estoque SET ativo=FALSE, updated_at=NOW() WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Almoxarifados ──
async function handleListAlmoxarifados(res) {
  try {
    const rows = await db.getMany(
      `SELECT a.*, c.name AS contract_name
       FROM almoxarifados a LEFT JOIN contracts c ON c.id = a.contract_id
       WHERE a.ativo = TRUE ORDER BY a.nome ASC`
    );
    sendJson(res, { almoxarifados: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostAlmoxarifado(body, res) {
  try {
    const id = generateId('almox');
    const row = await db.getOne(
      `INSERT INTO almoxarifados (id, nome, contract_id, endereco, ativo)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING *`,
      [id, String(body.nome || '').slice(0, 100), body.contractId || null, body.endereco || null]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutAlmoxarifado(id, body, res) {
  try {
    const row = await db.getOne(
      `UPDATE almoxarifados SET nome=$2, contract_id=$3, endereco=$4, ativo=$5
       WHERE id=$1 RETURNING *`,
      [
        id,
        String(body.nome || '').slice(0, 100),
        body.contractId || null,
        body.endereco || null,
        body.ativo !== false,
      ]
    );
    if (!row) return sendError(res, 404, 'Almoxarifado não encontrado');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteAlmoxarifado(id, res) {
  try {
    await db.query('UPDATE almoxarifados SET ativo=FALSE WHERE id=$1', [id]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// ── Movimentações (núcleo do módulo) ──
async function handleListMovimentacoes(query, res) {
  try {
    const conds = [];
    const vals = [];
    if (query.itemId) {
      vals.push(query.itemId);
      conds.push(`m.item_id = $${vals.length}`);
    }
    if (query.almoxId) {
      vals.push(query.almoxId);
      conds.push(
        `(m.almoxarifado_origem_id = $${vals.length} OR m.almoxarifado_destino_id = $${vals.length})`
      );
    }
    if (query.contractId) {
      vals.push(query.contractId);
      conds.push(`m.contract_id = $${vals.length}`);
    }
    if (query.tipo) {
      vals.push(query.tipo);
      conds.push(`m.tipo = $${vals.length}`);
    }
    if (query.from) {
      vals.push(query.from);
      conds.push(`m.data >= $${vals.length}`);
    }
    if (query.to) {
      vals.push(query.to);
      conds.push(`m.data <= $${vals.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const lim = Math.min(parseInt(query.limit) || 200, 1000);
    vals.push(lim);
    const rows = await db.getMany(
      `SELECT m.*, i.descricao AS item_desc, i.unidade,
              ao.nome AS origem_nome, ad.nome AS destino_nome,
              c.name AS contract_name
       FROM estoque_movimentacoes m
       LEFT JOIN itens_estoque i ON i.id = m.item_id
       LEFT JOIN almoxarifados ao ON ao.id = m.almoxarifado_origem_id
       LEFT JOIN almoxarifados ad ON ad.id = m.almoxarifado_destino_id
       LEFT JOIN contracts c ON c.id = m.contract_id
       ${where} ORDER BY m.data DESC, m.created_at DESC LIMIT $${vals.length}`,
      vals
    );
    sendJson(res, { movimentacoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// Ajusta saldo (insere ou atualiza UPSERT)
async function _ajustarSaldo(client, itemId, almoxId, delta) {
  if (!almoxId) return;
  await client.query(
    `INSERT INTO estoque_saldo (id, item_id, almoxarifado_id, quantidade)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id, almoxarifado_id)
     DO UPDATE SET quantidade = estoque_saldo.quantidade + $4`,
    [`saldo_${itemId}_${almoxId}`, itemId, almoxId, delta]
  );
}

async function handlePostMovimentacao(body, res) {
  try {
    const tipo = body.tipo;
    if (!['entrada', 'saida', 'transferencia', 'ajuste'].includes(tipo)) {
      return sendError(res, 400, 'Tipo inválido');
    }
    const itemId = body.itemId;
    const qtd = parseFloat(body.quantidade);
    const custo = parseFloat(body.custoUnit) || 0;
    if (!itemId || !(qtd > 0)) return sendError(res, 400, 'Item e quantidade são obrigatórios');

    // Resolve "auto-obra:<contractId>" e "auto-central" antes de prosseguir
    const origemId = await _resolveAlmoxId(body.almoxarifadoOrigemId);
    const destinoId = await _resolveAlmoxId(body.almoxarifadoDestinoId);
    if (tipo === 'entrada' && !destinoId)
      return sendError(res, 400, 'Entrada precisa almoxarifado destino');
    if (tipo === 'saida' && !origemId)
      return sendError(res, 400, 'Saída precisa almoxarifado origem');
    if (tipo === 'transferencia' && (!origemId || !destinoId))
      return sendError(res, 400, 'Transferência precisa origem e destino');
    if (tipo === 'transferencia' && origemId === destinoId)
      return sendError(res, 400, 'Origem e destino não podem ser iguais');

    const result = await db.withTransaction(async (client) => {
      const id = generateId('mov');
      const movRow = (
        await client.query(
          `INSERT INTO estoque_movimentacoes
          (id, item_id, almoxarifado_origem_id, almoxarifado_destino_id, tipo,
           quantidade, custo_unit, contract_id, data, documento, user_id, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            id,
            itemId,
            origemId,
            destinoId,
            tipo,
            qtd,
            custo,
            body.contractId || null,
            body.data || new Date().toISOString().split('T')[0],
            body.documento || null,
            body.userId || null,
            body.notas || null,
          ]
        )
      ).rows[0];

      // Atualiza saldos por tipo
      if (tipo === 'entrada') await _ajustarSaldo(client, itemId, destinoId, qtd);
      else if (tipo === 'saida') await _ajustarSaldo(client, itemId, origemId, -qtd);
      else if (tipo === 'transferencia') {
        await _ajustarSaldo(client, itemId, origemId, -qtd);
        await _ajustarSaldo(client, itemId, destinoId, qtd);
      } else if (tipo === 'ajuste') {
        // ajuste: quantidade pode ser negativa (perda) ou positiva (encontrou)
        await _ajustarSaldo(
          client,
          itemId,
          destinoId || origemId,
          qtd * (body.sinal === '-' ? -1 : 1)
        );
      }

      // Atualiza custo médio ponderado em entradas (CMV)
      if (tipo === 'entrada' && custo > 0) {
        const item = (
          await client.query('SELECT custo_medio FROM itens_estoque WHERE id = $1', [itemId])
        ).rows[0];
        const saldoTotal = (
          await client.query(
            'SELECT COALESCE(SUM(quantidade), 0) AS s FROM estoque_saldo WHERE item_id = $1',
            [itemId]
          )
        ).rows[0].s;
        // Saldo já foi atualizado acima — saldoAnterior = saldoTotal - qtd
        const saldoAnt = parseFloat(saldoTotal) - qtd;
        const custoMedAnt = parseFloat(item?.custo_medio) || 0;
        const novoCustoMedio =
          saldoTotal > 0 ? (saldoAnt * custoMedAnt + qtd * custo) / parseFloat(saldoTotal) : custo;
        await client.query(
          'UPDATE itens_estoque SET custo_medio = $2, updated_at = NOW() WHERE id = $1',
          [itemId, novoCustoMedio]
        );
      }
      return movRow;
    });

    sendJson(res, db.rowToCamel(result));
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteMovimentacao(id, res) {
  try {
    // Reverte o saldo antes de apagar (transação)
    await db.withTransaction(async (client) => {
      const m = (await client.query('SELECT * FROM estoque_movimentacoes WHERE id = $1', [id]))
        .rows[0];
      if (!m) return;
      const qtd = parseFloat(m.quantidade);
      if (m.tipo === 'entrada')
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      else if (m.tipo === 'saida')
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
      else if (m.tipo === 'transferencia') {
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_origem_id, qtd);
        await _ajustarSaldo(client, m.item_id, m.almoxarifado_destino_id, -qtd);
      } else if (m.tipo === 'ajuste') {
        await _ajustarSaldo(
          client,
          m.item_id,
          m.almoxarifado_destino_id || m.almoxarifado_origem_id,
          -qtd
        );
      }
      await client.query('DELETE FROM estoque_movimentacoes WHERE id = $1', [id]);
    });
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Saldo: matriz item × almoxarifado
async function handleGetSaldoEstoque(query, res) {
  try {
    // 1. Lista TODOS os itens ativos (mesmo os sem saldo ainda)
    const itensAtivos = await db.getMany(
      `SELECT id, codigo, descricao, unidade, categoria, estoque_minimo, custo_medio
       FROM itens_estoque WHERE ativo = TRUE ORDER BY descricao ASC`
    );
    // 2. Pega saldos reais por item × almoxarifado (excluindo almox inativos)
    const saldos = await db.getMany(
      `SELECT s.*, a.nome AS almox_nome, a.contract_id AS almox_contract_id
       FROM estoque_saldo s
       INNER JOIN almoxarifados a ON a.id = s.almoxarifado_id
       WHERE a.ativo = TRUE`
    );
    // 3. Agrupa saldos por item
    const saldosPorItem = new Map();
    for (const s of saldos) {
      if (!saldosPorItem.has(s.itemId)) saldosPorItem.set(s.itemId, []);
      saldosPorItem.get(s.itemId).push({
        almoxarifadoId: s.almoxarifadoId,
        almoxNome: s.almoxNome,
        almoxContractId: s.almoxContractId,
        quantidade: parseFloat(s.quantidade) || 0,
      });
    }
    // 4. Monta lista final — todos os itens ativos, com seus saldos (ou vazio se nunca houve movimentação)
    const itens = itensAtivos.map((i) => {
      const porAlmox = saldosPorItem.get(i.id) || [];
      const totalQtd = porAlmox.reduce((s, a) => s + a.quantidade, 0);
      const custoMedio = parseFloat(i.custoMedio) || 0;
      const estoqueMinimo = parseFloat(i.estoqueMinimo) || 0;
      return {
        itemId: i.id,
        codigo: i.codigo,
        descricao: i.descricao,
        unidade: i.unidade,
        categoria: i.categoria,
        estoqueMinimo,
        custoMedio,
        totalQtd,
        totalValor: totalQtd * custoMedio,
        porAlmox,
        abaixoMinimo: totalQtd < estoqueMinimo,
        semMovimentacao: porAlmox.length === 0,
      };
    });
    sendJson(res, { itens, total: itens.length });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleGetVisaoGeral,
  handleListItensEstoque,
  handlePostItemEstoque,
  handlePutItemEstoque,
  handleDeleteItemEstoque,
  handleListAlmoxarifados,
  handlePostAlmoxarifado,
  handlePutAlmoxarifado,
  handleDeleteAlmoxarifado,
  handleListMovimentacoes,
  handlePostMovimentacao,
  handleDeleteMovimentacao,
  handleGetSaldoEstoque,
  // Helpers compartilhados — usados por Solicitações de Compra e pelo startup,
  // que seguem no server.js.
  ensureAlmoxarifadoCentral,
  ensureAlmoxarifadoObra,
  _resolveAlmoxId,
  _ajustarSaldo,
};
