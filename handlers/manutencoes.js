'use strict';
/**
 * @file Manutenção de Equipamentos — fluxo solicitada → pendente_aprovacao →
 * aprovada → retornado (+ rejeitada / cancelada). O solicitante abre com o
 * equipamento e o problema; a equipe de compras avalia (oficina/prazo/custo);
 * a gerência aprova ou rejeita; o retorno registra o custo real. Extraído do
 * server.js (desmembramento), sem alteração de lógica.
 *
 * Os gates (avaliar/aprovar) usam permissions.temAba — antes o helper inline
 * _temPermissao, agora a função compartilhada em lib/permissions (comportamento
 * idêntico: nível nulo libera, 'admin' cai na consulta do perfil).
 */
const repos = require('../db/repos');
const db = require('../db');
const money = require('../lib/money');
const { generateId } = require('../lib/id');
const { temAba } = require('../lib/permissions');
const { sendJson, sendError } = require('../lib/http-respond');

// ============ Manutenção de Equipamentos ============
// Fluxo: solicitada → pendente_aprovacao → aprovada → retornado
//        (+ rejeitada / cancelada).
// O solicitante só solicita; a equipe de compras avalia (oficina/prazo/custo);
// a gerência aprova ou rejeita.

async function handleListManutencoes(query, res) {
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
    const sql = `SELECT * FROM manutencoes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`;
    const rows = await db.getMany(sql, params);
    sendJson(res, { manutencoes: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// 1ª etapa — solicitante: apenas o equipamento e o problema.
// Normaliza a lista de materiais do romaneio: { descricao, patrimonio, qtd }.
// Mantém só linhas com descrição; qtd default 1.
function _normalizaItensManutencao(itens) {
  if (!Array.isArray(itens)) return [];
  return itens
    .map((it) => ({
      descricao: (it?.descricao || '').trim(),
      patrimonio: (it?.patrimonio || '').trim(),
      qtd: parseFloat(it?.qtd) || 0,
    }))
    .filter((it) => it.descricao);
}

async function handlePostManutencao(req, body, res) {
  try {
    const equipamento = (body.equipamento || '').trim();
    if (!equipamento) return sendError(res, 400, 'Informe o equipamento');
    // Número do romaneio: sequencial por ano de criação, gravado no pedido
    // (RM-NNN-AAAA). max(ano corrente)+1 — corrida é improvável nesta escala.
    const seqRow = await db.getOne(
      `SELECT COALESCE(MAX(romaneio_numero), 0) + 1 AS next
         FROM manutencoes
        WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`
    );
    const romaneioNumero = (seqRow && seqRow.next) || 1;
    const data = {
      id: generateId('man'),
      equipamento,
      contractId: body.contractId || null,
      problema: (body.problema || '').trim(),
      status: 'solicitada',
      custo: 0,
      custoEstimado: 0,
      observacoes: (body.observacoes || '').trim(),
      itens: JSON.stringify(_normalizaItensManutencao(body.itens)),
      romaneioNumero,
      solicitanteUserId: req.user?.id || null,
      solicitanteNome: req.user?.name || req.user?.email || null,
    };
    const created = await repos.manutencoes.create(data);
    sendJson(res, { manutencao: created });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Solicitante edita enquanto ainda está 'solicitada'.
async function handlePutManutencao(id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'solicitada') {
      return sendError(res, 400, 'Só é possível editar enquanto a manutenção está como solicitada');
    }
    const allowed = {};
    if (body.equipamento !== undefined) {
      const eq = (body.equipamento || '').trim();
      if (!eq) return sendError(res, 400, 'Informe o equipamento');
      allowed.equipamento = eq;
    }
    if (body.contractId !== undefined) allowed.contractId = body.contractId || null;
    if (body.problema !== undefined) allowed.problema = (body.problema || '').trim();
    if (body.observacoes !== undefined) allowed.observacoes = (body.observacoes || '').trim();
    if (body.itens !== undefined)
      allowed.itens = JSON.stringify(_normalizaItensManutencao(body.itens));
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 2ª etapa — equipe de compras: define oficina, prazo e custo estimado.
async function handleAvaliarManutencao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'manutencao:avaliar'))) {
      return sendError(res, 403, 'Sem permissão para avaliar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'solicitada') {
      return sendError(res, 400, `Esta manutenção já está ${atual.status}`);
    }
    const oficina = (body.oficina || '').trim();
    if (!oficina) return sendError(res, 400, 'Informe a oficina / empresa que vai reparar');
    const allowed = {
      oficina,
      custoEstimado: money.parse(body.custoEstimado),
      dataEnvio: body.dataEnvio || null,
      dataRetornoPrevista: body.dataRetornoPrevista || null,
      avaliadorUserId: req.user?.id || null,
      avaliadorNome: req.user?.name || req.user?.email || null,
      avaliadoEm: new Date(),
      status: 'pendente_aprovacao',
    };
    if (body.observacoes != null && String(body.observacoes).trim()) {
      allowed.observacoes = String(body.observacoes).trim();
    }
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 3ª etapa — gerência aprova.
async function handleAprovarManutencao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'manutencao:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para aprovar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'pendente_aprovacao') {
      return sendError(res, 400, 'Só é possível aprovar manutenções aguardando aprovação');
    }
    const result = await repos.manutencoes.updateById(id, {
      status: 'aprovada',
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// 3ª etapa — gerência rejeita.
async function handleRejeitarManutencao(req, id, body, res) {
  try {
    if (!(await temAba(req, 'manutencao:aprovar'))) {
      return sendError(res, 403, 'Sem permissão para rejeitar manutenções');
    }
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'pendente_aprovacao') {
      return sendError(res, 400, 'Só é possível rejeitar manutenções aguardando aprovação');
    }
    const result = await repos.manutencoes.updateById(id, {
      status: 'rejeitada',
      motivoRejeicao: (body.motivo || '').trim() || null,
      aprovadorUserId: req.user?.id || null,
      aprovadorNome: req.user?.name || req.user?.email || null,
      aprovadoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Encerramento — registra o retorno do equipamento.
async function handleRetornoManutencao(req, id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status !== 'aprovada') {
      return sendError(res, 400, 'Só é possível registrar retorno de manutenções aprovadas');
    }
    const allowed = {
      status: 'retornado',
      dataRetorno: body.dataRetorno || new Date().toISOString().slice(0, 10),
      custo: money.parse(body.custo),
    };
    if (body.observacoes != null && String(body.observacoes).trim()) {
      allowed.observacoes = String(body.observacoes).trim();
    }
    const result = await repos.manutencoes.updateById(id, allowed);
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleCancelarManutencao(req, id, body, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    if (atual.status === 'retornado')
      return sendError(res, 400, 'Manutenção concluída não pode ser cancelada');
    if (atual.status === 'cancelada') return sendError(res, 400, 'Manutenção já cancelada');
    const result = await repos.manutencoes.updateById(id, {
      status: 'cancelada',
      motivoCancelamento: (body?.motivo || '').trim() || null,
      canceladoEm: new Date(),
    });
    sendJson(res, { manutencao: result });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteManutencao(id, res) {
  try {
    const atual = await repos.manutencoes.findById(id);
    if (!atual) return sendError(res, 404, 'Manutenção não encontrada');
    await repos.manutencoes.removeById(id);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

module.exports = {
  handleListManutencoes,
  handlePostManutencao,
  handlePutManutencao,
  handleAvaliarManutencao,
  handleAprovarManutencao,
  handleRejeitarManutencao,
  handleRetornoManutencao,
  handleCancelarManutencao,
  handleDeleteManutencao,
  _normalizaItensManutencao,
};
