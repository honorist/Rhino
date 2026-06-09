'use strict';
// node --test test/recrutamento-docs.test.js  (sem servidor, sem DB)
//
// Regras puras dos documentos de candidato (Etapa 4.3 — US-08/US-09):
//   - validarUploadDoc: gate de tipo, mime, tamanho e antecedentes.
//   - podeAprovar: antecedentes OK + os 4 documentos obrigatórios anexados.
// Toda regra abaixo PROVA que vale E que falharia se violada (DoD §8).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DOC_TIPOS,
  DOCS_OBRIGATORIOS,
  MAX_BYTES,
  validarUploadDoc,
  podeAprovar,
} = require('../lib/recrutamento-docs');

// ─── validarUploadDoc ──────────────────────────────────────────────────────────

test('validarUploadDoc — aceita PDF dentro do limite quando antecedentes OK', () => {
  const r = validarUploadDoc({ tipo: 'rg', mimeType: 'application/pdf', sizeBytes: 1024, antecedentesStatus: 'ok' });
  assert.deepEqual(r, { ok: true });
});

test('validarUploadDoc — rejeita tipo de documento desconhecido', () => {
  const r = validarUploadDoc({ tipo: 'passaporte', mimeType: 'application/pdf', sizeBytes: 10, antecedentesStatus: 'ok' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Tipo inválido/);
});

test('validarUploadDoc — bloqueia docs (exceto antecedentes) antes de antecedentes OK', () => {
  const r = validarUploadDoc({ tipo: 'cpf', mimeType: 'application/pdf', sizeBytes: 10, antecedentesStatus: 'pendente' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /antecedentes/i);
});

test('validarUploadDoc — antecedentes pode subir mesmo com status pendente', () => {
  const r = validarUploadDoc({ tipo: 'antecedentes', mimeType: 'image/png', sizeBytes: 10, antecedentesStatus: 'pendente' });
  assert.deepEqual(r, { ok: true });
});

test('validarUploadDoc — rejeita mime não permitido (ex.: HTML com script)', () => {
  const r = validarUploadDoc({ tipo: 'rg', mimeType: 'text/html', sizeBytes: 10, antecedentesStatus: 'ok' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /PDF, JPG ou PNG/);
});

test('validarUploadDoc — rejeita arquivo vazio', () => {
  const r = validarUploadDoc({ tipo: 'rg', mimeType: 'application/pdf', sizeBytes: 0, antecedentesStatus: 'ok' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /vazio/i);
});

test('validarUploadDoc — rejeita arquivo acima do limite de tamanho', () => {
  const r = validarUploadDoc({ tipo: 'rg', mimeType: 'application/pdf', sizeBytes: MAX_BYTES + 1, antecedentesStatus: 'ok' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /MB/);
});

// ─── podeAprovar ────────────────────────────────────────────────────────────────

const candOk = { status: 'interessado', antecedentesStatus: 'ok' };

test('podeAprovar — aprova quando antecedentes OK e os 4 docs obrigatórios presentes', () => {
  const r = podeAprovar(candOk, ['rg', 'cpf', 'residencia', 'ctps', 'antecedentes']);
  assert.deepEqual(r, { ok: true });
});

test('podeAprovar — recusa candidato já aprovado', () => {
  const r = podeAprovar({ status: 'aprovado', antecedentesStatus: 'ok' }, DOCS_OBRIGATORIOS);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /já está aprovado/i);
});

test('podeAprovar — recusa quando antecedentes não estão OK', () => {
  const r = podeAprovar({ status: 'interessado', antecedentesStatus: 'pendente' }, DOCS_OBRIGATORIOS);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /antecedentes/i);
});

test('podeAprovar — lista os documentos faltantes', () => {
  const r = podeAprovar(candOk, ['rg', 'cpf']);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Documentos faltando/);
  assert.deepEqual(r.faltando, ['residencia', 'ctps']);
});

test('podeAprovar — antecedentes anexado não substitui um doc obrigatório faltante', () => {
  const r = podeAprovar(candOk, ['rg', 'cpf', 'residencia', 'antecedentes']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltando, ['ctps']);
});

test('podeAprovar — candidato inexistente é recusado sem quebrar', () => {
  const r = podeAprovar(null, []);
  assert.equal(r.ok, false);
});

// Sanidade das constantes exportadas (contrato com o handler).
test('constantes — DOC_TIPOS inclui os 4 obrigatórios + antecedentes', () => {
  assert.deepEqual(DOCS_OBRIGATORIOS, ['rg', 'cpf', 'residencia', 'ctps']);
  for (const t of DOCS_OBRIGATORIOS) assert.ok(DOC_TIPOS.includes(t));
  assert.ok(DOC_TIPOS.includes('antecedentes'));
});
