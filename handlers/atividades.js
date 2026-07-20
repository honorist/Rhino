'use strict';
/**
 * @file Handlers do Cronograma físico-financeiro (atividades) — CRUD das etapas
 * do contrato + Curva S baseada nas atividades reais. Extraído do server.js
 * (desmembramento), sem alteração de lógica.
 *
 * Fala SQL direto (db.getMany/getOne/query) contra a tabela `atividades`; sem
 * repositório em db/repos. `peso_pct`/`exec_pct`/`custo_plan` alimentam a
 * Curva S (a de atividades substitui a linear quando há etapas cadastradas).
 */
const db = require('../db');
const { sendJson, sendError } = require('../lib/http-respond');
const { generateId } = require('../lib/id');
const money = require('../lib/money');

async function handleListAtividades(contractId, res) {
  try {
    const rows = await db.getMany(
      `SELECT * FROM atividades WHERE contract_id = $1 ORDER BY ordem ASC, created_at ASC`,
      [contractId]
    );
    sendJson(res, { atividades: rows });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

async function handlePostAtividade(contractId, body, res) {
  try {
    const id = generateId('ativ');
    const row = await db.getOne(
      `INSERT INTO atividades
        (id, contract_id, parent_id, ordem, nome, data_inicio_plan, data_fim_plan,
         data_inicio_real, data_fim_real, peso_pct, exec_pct, custo_plan, predecessoras, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id,
        contractId,
        body.parentId || null,
        parseInt(body.ordem) || 0,
        String(body.nome || '').slice(0, 200),
        body.dataInicioPlan || null,
        body.dataFimPlan || null,
        body.dataInicioReal || null,
        body.dataFimReal || null,
        parseFloat(body.pesoPct) || 0,
        parseFloat(body.execPct) || 0,
        money.parse(body.custoPlan),
        Array.isArray(body.predecessoras) ? body.predecessoras : [],
        body.notas || null,
      ]
    );
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handlePutAtividade(contractId, atvId, body, res) {
  try {
    const fields = [
      'parent_id',
      'ordem',
      'nome',
      'data_inicio_plan',
      'data_fim_plan',
      'data_inicio_real',
      'data_fim_real',
      'peso_pct',
      'exec_pct',
      'custo_plan',
      'predecessoras',
      'notas',
    ];
    const map = {
      parent_id: body.parentId ?? null,
      ordem: parseInt(body.ordem) || 0,
      nome: String(body.nome || '').slice(0, 200),
      data_inicio_plan: body.dataInicioPlan || null,
      data_fim_plan: body.dataFimPlan || null,
      data_inicio_real: body.dataInicioReal || null,
      data_fim_real: body.dataFimReal || null,
      peso_pct: parseFloat(body.pesoPct) || 0,
      exec_pct: parseFloat(body.execPct) || 0,
      custo_plan: money.parse(body.custoPlan),
      predecessoras: Array.isArray(body.predecessoras) ? body.predecessoras : [],
      notas: body.notas ?? null,
    };
    const set = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const vals = fields.map((f) => map[f]);
    vals.push(atvId, contractId);
    const row = await db.getOne(
      `UPDATE atividades SET ${set}, updated_at = NOW()
       WHERE id = $${fields.length + 1} AND contract_id = $${fields.length + 2}
       RETURNING *`,
      vals
    );
    if (!row) return sendError(res, 404, 'Atividade não encontrada');
    sendJson(res, row);
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleDeleteAtividade(contractId, atvId, res) {
  try {
    await db.query('DELETE FROM atividades WHERE id = $1 AND contract_id = $2', [
      atvId,
      contractId,
    ]);
    sendJson(res, { ok: true });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

// Curva S baseada nas atividades reais (substitui a linear quando há etapas cadastradas)
async function handleGetCurvaS(contractId, res) {
  try {
    const ativs = await db.getMany(
      `SELECT id, nome, data_inicio_plan, data_fim_plan, data_inicio_real, data_fim_real,
              peso_pct, exec_pct, custo_plan
       FROM atividades WHERE contract_id = $1 AND parent_id IS NULL
       ORDER BY data_inicio_plan ASC, ordem ASC`,
      [contractId]
    );
    sendJson(res, { atividades: ativs });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = {
  handleListAtividades,
  handlePostAtividade,
  handlePutAtividade,
  handleDeleteAtividade,
  handleGetCurvaS,
};
