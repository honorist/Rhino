'use strict';
/**
 * Helpers puros do gerador de planilha de RDO (lib/rdo-xlsx.js) — parse e
 * formatação que alimentam a planilha entregue na obra (item 23 do roadmap).
 * Se um destes erra, o RDO sai com data em formato errado ou campos JSON
 * (efetivo/atividades) perdidos.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { _fmtBR, _asObj, _asArr, _norm } = require('../lib/rdo-xlsx');

// ── _fmtBR: ISO → DD/MM/AAAA como texto (independe do locale do LibreOffice) ──
test('fmtBR: ISO YYYY-MM-DD vira DD/MM/AAAA', () => {
  assert.strictEqual(_fmtBR('2026-07-20'), '20/07/2026');
});

test('fmtBR: aceita timestamp ISO (ignora a parte de hora)', () => {
  assert.strictEqual(_fmtBR('2026-12-01T13:45:00Z'), '01/12/2026');
});

test('fmtBR: vazio/nulo vira string vazia', () => {
  assert.strictEqual(_fmtBR(''), '');
  assert.strictEqual(_fmtBR(null), '');
  assert.strictEqual(_fmtBR(undefined), '');
});

test('fmtBR: string fora do padrão volta como veio (sem quebrar)', () => {
  assert.strictEqual(_fmtBR('ontem'), 'ontem');
});

// ── _asObj / _asArr: JSONB do Postgres pode vir objeto OU string ─────────────
test('asObj: string JSON válida é parseada', () => {
  assert.deepStrictEqual(_asObj('{"a":1}', {}), { a: 1 });
});

test('asObj: objeto já pronto passa direto', () => {
  const o = { a: 1 };
  assert.strictEqual(_asObj(o, {}), o);
});

test('asObj: nulo e JSON inválido caem no fallback', () => {
  assert.deepStrictEqual(_asObj(null, { f: true }), { f: true });
  assert.deepStrictEqual(_asObj('{quebrado', { f: true }), { f: true });
});

test('asArr: sempre devolve array (string, objeto-não-array, nulo → [])', () => {
  assert.deepStrictEqual(_asArr('[1,2]'), [1, 2]);
  assert.deepStrictEqual(_asArr('{"a":1}'), [], 'objeto não é array');
  assert.deepStrictEqual(_asArr(null), []);
  assert.deepStrictEqual(_asArr([3]), [3]);
});

// ── _norm: casamento de cargo → linha do template (sem acento, minúsculo) ─────
test('norm: remove acento, baixa a caixa e colapsa espaços', () => {
  assert.strictEqual(_norm('  Encarregado  DE   Obra '), 'encarregado de obra');
  assert.strictEqual(_norm('Eletricista'), 'eletricista');
  assert.strictEqual(_norm('SOLDADOR'), 'soldador');
});

test('norm: cargos que só diferem por acento colidem (casam a mesma linha)', () => {
  assert.strictEqual(_norm('Técnico'), _norm('tecnico'));
  assert.strictEqual(_norm('Mecânico'), 'mecanico');
});

test('norm: nulo/undefined vira string vazia', () => {
  assert.strictEqual(_norm(null), '');
  assert.strictEqual(_norm(undefined), '');
});
