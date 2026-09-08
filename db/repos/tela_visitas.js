/**
 * @file Repositório de `tela_visitas` — contador agregado (tela, dia) de
 * visitas de tela (achado 6.3 da varredura 2026-09-08: zero instrumentação
 * de uso — 13 módulos novos foram ao ar sem nenhum sinal de adoção real).
 *
 * De propósito o mínimo possível: sem PII, sem uma linha por clique (cresce
 * O(telas × dias), não O(cliques)), incrementado por UPSERT.
 */
const db = require('../index');
const { createRepo } = require('./_factory');
const { generateId } = require('../../lib/id');

const base = createRepo('tela_visitas', { orderBy: 'data DESC' });

/**
 * Incrementa em 1 o contador de visitas de uma tela no dia informado.
 * @param {string} tela  Rota/hash da tela (ex.: '#/ssma').
 * @param {string} data  Data ISO (YYYY-MM-DD).
 */
async function incrementar(tela, data) {
  await db.query(
    `INSERT INTO tela_visitas (id, tela, data, visitas)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (tela, data) DO UPDATE SET visitas = tela_visitas.visitas + 1, updated_at = NOW()`,
    [generateId('telv'), tela, data]
  );
}

/**
 * Resumo agregado: total de visitas por tela, somando os últimos N dias.
 * @param {number} desdeDias
 * @returns {Promise<Array<{tela: string, total: number, ultimaVisita: string}>>}
 */
async function resumoPorTela(desdeDias) {
  return db.getMany(
    `SELECT tela, SUM(visitas)::int AS total, MAX(data) AS ultima_visita
       FROM tela_visitas
      WHERE data >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY tela
      ORDER BY total DESC`,
    [String(desdeDias)]
  );
}

module.exports = { ...base, incrementar, resumoPorTela };
