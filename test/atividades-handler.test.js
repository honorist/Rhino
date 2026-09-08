'use strict';
/**
 * @file handlers/atividades.js — listagem das etapas do cronograma.
 *
 * O endpoint passou a devolver o `avanco` já calculado (lib/avanco-fisico.js)
 * junto com as linhas. Antes cada tela fazia a própria conta em cima das linhas
 * cruas — o Cronograma ponderava por peso (js/views/contrato/cronograma.js:60),
 * o Data book fazia média simples — e a mesma obra exibia dois "avanço físico"
 * diferentes conforme a aba. Servidor calcula, view só formata
 * (steering/engineering.md §6).
 *
 * `db` dublado — nada toca o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const h = require('../handlers/atividades');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const orig = { getMany: db.getMany };
let linhas;

beforeEach(() => {
  linhas = [];
  db.getMany = async () => linhas;
});

function restore() { db.getMany = orig.getMany; }

test('GET devolve as atividades e o avanço já calculado', async () => {
  // Etapa pesada quase pronta + etapa leve parada: ponderado 80, média simples 50.
  linhas = [
    { id: 'a1', peso_pct: 80, exec_pct: 100 },
    { id: 'a2', peso_pct: 20, exec_pct: 0 },
  ];
  const res = fakeRes();
  await h.handleListAtividades('ctr1', res);

  assert.equal(res.status, 200);
  assert.equal(res.body.atividades.length, 2);
  assert.ok(res.body.avanco, 'endpoint precisa devolver o avanço calculado');
  assert.equal(res.body.avanco.pct, 80, 'esperava o ponderado por peso, não a média');
  assert.equal(res.body.avanco.base, 'peso');
});

test('sem peso preenchido cai na média simples, e diz isso', async () => {
  linhas = [{ id: 'a1', exec_pct: 100 }, { id: 'a2', exec_pct: 0 }];
  const res = fakeRes();
  await h.handleListAtividades('ctr1', res);
  assert.equal(res.body.avanco.pct, 50);
  assert.equal(res.body.avanco.base, 'media');
});

test('cronograma vazio devolve avanço não medido (null), não zero', async () => {
  linhas = [];
  const res = fakeRes();
  await h.handleListAtividades('ctr1', res);
  assert.equal(res.body.avanco.pct, null, '"não medido" é diferente de "0% executado"');
  assert.equal(res.body.avanco.base, 'sem_dados');
  restore();
});
