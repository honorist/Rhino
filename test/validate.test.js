'use strict';
// node --test test/validate.test.js  (sem servidor, sem DB)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBody, schemas, ValidationError, parseOptionalMoney, parsePositiveMoney } = require('../lib/validate');

// ─── helpers ─────────────────────────────────────────────────────────────────

function expectError(fn, fieldPattern) {
  try {
    fn();
    assert.fail('Deveria ter lançado ValidationError');
  } catch (e) {
    assert.ok(e instanceof ValidationError, `Esperava ValidationError, recebeu ${e.constructor.name}: ${e.message}`);
    if (fieldPattern) {
      assert.match(e.message, fieldPattern, `Mensagem de erro não menciona o campo esperado: ${e.message}`);
    }
  }
}

// ─── schemas.saidaPost ───────────────────────────────────────────────────────

test('saidaPost — body válido retorna parsed sem erros', () => {
  const out = validateBody(schemas.saidaPost, { value: 1500, date: '2026-05-10', type: 'material', description: 'Cimento' });
  assert.equal(out.value, 1500);
  assert.equal(out.date, '2026-05-10');
  assert.equal(out.type, 'material');
  assert.equal(out.description, 'Cimento');
});

test('saidaPost — value string numérica é aceita e convertida', () => {
  const out = validateBody(schemas.saidaPost, { value: '2500.50', date: '2026-05-10' });
  assert.equal(out.value, 2500.50);
});

test('saidaPost — value string não-numérica lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPost, { value: 'abc', date: '2026-05-10' }), /value/);
});

test('saidaPost — value negativo lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPost, { value: -100, date: '2026-05-10' }), /value/);
});

test('saidaPost — value zero lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPost, { value: 0, date: '2026-05-10' }), /value/);
});

test('saidaPost — date inválida lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPost, { value: 100, date: 'nao-e-data' }), /date/);
});

test('saidaPost — date ausente usa hoje (sem erro)', () => {
  const out = validateBody(schemas.saidaPost, { value: 100 });
  assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('saidaPost — type inválido lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPost, { value: 100, date: '2026-05-10', type: 'inventado' }), /type/);
});

test('saidaPost — type ausente usa "material" como default', () => {
  const out = validateBody(schemas.saidaPost, { value: 100, date: '2026-05-10' });
  assert.equal(out.type, 'material');
});

// ─── schemas.saidaPut ────────────────────────────────────────────────────────

test('saidaPut — body parcial (só description) é aceito', () => {
  const out = validateBody(schemas.saidaPut, { description: 'Nova desc' });
  assert.equal(out.description, 'Nova desc');
  assert.equal(out.value, undefined);
});

test('saidaPut — value string inválida lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPut, { value: 'cem reais' }), /value/);
});

test('saidaPut — date formato inválido lança ValidationError', () => {
  expectError(() => validateBody(schemas.saidaPut, { date: '05/10/2026' }), /date/);
});

// ─── schemas.notaFiscalPost ──────────────────────────────────────────────────

test('notaFiscalPost — body válido é aceito', () => {
  const out = validateBody(schemas.notaFiscalPost, {
    numero: 'NF-001', contractId: 'ctr_abc', dataLimite: '2026-06-01', valor: 10000, prazoRecebimento: 30
  });
  assert.equal(out.numero, 'NF-001');
  assert.equal(out.valor, 10000);
  assert.equal(out.prazoRecebimento, 30);
});

test('notaFiscalPost — numero ausente lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, { contractId: 'x', dataLimite: '2026-06-01' }),
    /numero/
  );
});

test('notaFiscalPost — contractId ausente lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, { numero: 'NF-1', dataLimite: '2026-06-01' }),
    /contractId/
  );
});

test('notaFiscalPost — dataLimite inválida lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, { numero: 'NF-1', contractId: 'x', dataLimite: '01/06/2026' }),
    /dataLimite/
  );
});

test('notaFiscalPost — prazoRecebimento string lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, {
      numero: 'NF-1', contractId: 'x', dataLimite: '2026-06-01', prazoRecebimento: 'trinta'
    }),
    /prazoRecebimento/
  );
});

test('notaFiscalPost — prazoRecebimento negativo lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, {
      numero: 'NF-1', contractId: 'x', dataLimite: '2026-06-01', prazoRecebimento: -5
    }),
    /prazoRecebimento/
  );
});

test('notaFiscalPost — valor ausente usa 0 (NF sem valor ainda é válida)', () => {
  const out = validateBody(schemas.notaFiscalPost, {
    numero: 'NF-1', contractId: 'x', dataLimite: '2026-06-01'
  });
  assert.equal(out.valor, 0);
});

test('notaFiscalPost — valor string não-numérica lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.notaFiscalPost, {
      numero: 'NF-1', contractId: 'x', dataLimite: '2026-06-01', valor: 'mil reais'
    }),
    /valor/
  );
});

// ─── schemas.notaFiscalPut ───────────────────────────────────────────────────

test('notaFiscalPut — body parcial aceito', () => {
  const out = validateBody(schemas.notaFiscalPut, { prazoRecebimento: 45 });
  assert.equal(out.prazoRecebimento, 45);
});

test('notaFiscalPut — dataEmissaoReal null é aceito (cancelar data)', () => {
  const out = validateBody(schemas.notaFiscalPut, { dataEmissaoReal: null });
  assert.equal(out.dataEmissaoReal, null);
});

test('notaFiscalPut — dataEmissaoReal inválida lança ValidationError', () => {
  expectError(() => validateBody(schemas.notaFiscalPut, { dataEmissaoReal: '2026/05/01' }), /dataEmissaoReal/);
});

// ─── schemas.contaPagarPost ──────────────────────────────────────────────────

test('contaPagarPost — body válido é aceito', () => {
  const out = validateBody(schemas.contaPagarPost, {
    descricao: 'Conta luz', valor: 500, dataEmissao: '2026-04-01', dataVencimento: '2026-04-20'
  });
  assert.equal(out.descricao, 'Conta luz');
  assert.equal(out.valor, 500);
});

test('contaPagarPost — descricao ausente lança ValidationError', () => {
  expectError(() => validateBody(schemas.contaPagarPost, { valor: 100 }), /descricao/);
});

test('contaPagarPost — valor ausente lança ValidationError', () => {
  expectError(() => validateBody(schemas.contaPagarPost, { descricao: 'X' }), /valor/);
});

test('contaPagarPost — valor negativo lança ValidationError', () => {
  expectError(() => validateBody(schemas.contaPagarPost, { descricao: 'X', valor: -1 }), /valor/);
});

test('contaPagarPost — valor zero lança ValidationError', () => {
  expectError(() => validateBody(schemas.contaPagarPost, { descricao: 'X', valor: 0 }), /valor/);
});

test('contaPagarPost — dataVencimento inválida lança ValidationError', () => {
  expectError(
    () => validateBody(schemas.contaPagarPost, { descricao: 'X', valor: 100, dataVencimento: 'amanha' }),
    /dataVencimento/
  );
});

test('contaPagarPost — body completamente vazio lança ValidationError com múltiplos campos', () => {
  try {
    validateBody(schemas.contaPagarPost, {});
    assert.fail('Deveria ter lançado');
  } catch (e) {
    assert.ok(e instanceof ValidationError);
    assert.ok(e.fields.length >= 2, `Esperava >=2 erros, recebeu ${e.fields.length}: ${e.message}`);
  }
});

test('ValidationError tem statusCode 400', () => {
  try {
    validateBody(schemas.contaPagarPost, {});
  } catch (e) {
    assert.equal(e.statusCode, 400);
    assert.equal(e.name, 'ValidationError');
  }
});

// ─── schemas.fornecedorPost / fornecedorPut ──────────────────────────────────

test('fornecedorPost — body mínimo válido (só nome) retorna parsed sem erros', () => {
  const out = validateBody(schemas.fornecedorPost, { nome: 'Acme Materiais' });
  assert.equal(out.nome, 'Acme Materiais');
  assert.equal(out.cnpj, '');
  assert.equal(out.email, '');
});

test('fornecedorPost — sem nome lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPost, {}), /nome/);
});

test('fornecedorPost — nome só com espaços lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPost, { nome: '   ' }), /nome/);
});

test('fornecedorPost — CNPJ com 14 dígitos (formatado) é aceito', () => {
  const out = validateBody(schemas.fornecedorPost, { nome: 'X', cnpj: '12.345.678/0001-90' });
  assert.equal(out.cnpj, '12.345.678/0001-90');
});

test('fornecedorPost — CNPJ com número errado de dígitos lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPost, { nome: 'X', cnpj: '123' }), /cnpj/);
});

test('fornecedorPost — email vazio é aceito (campo opcional)', () => {
  const out = validateBody(schemas.fornecedorPost, { nome: 'X', email: '' });
  assert.equal(out.email, '');
});

test('fornecedorPost — email com formato inválido lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPost, { nome: 'X', email: 'nao-e-email' }), /email/);
});

test('fornecedorPost — email válido é aceito e trimado', () => {
  const out = validateBody(schemas.fornecedorPost, { nome: 'X', email: '  contato@acme.com  ' });
  assert.equal(out.email, 'contato@acme.com');
});

test('fornecedorPut — atualiza só os campos presentes', () => {
  const out = validateBody(schemas.fornecedorPut, { telefone: '(11) 99999-0000' });
  assert.equal(out.telefone, '(11) 99999-0000');
  assert.ok(!('nome' in out));
});

test('fornecedorPut — nome vazio explícito lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPut, { nome: '' }), /nome/);
});

test('fornecedorPut — cnpj inválido lança ValidationError', () => {
  expectError(() => validateBody(schemas.fornecedorPut, { cnpj: 'abc' }), /cnpj/);
});

// ─── parseOptionalMoney / parsePositiveMoney ─────────────────────────────────
// Antes: handlers/contracts.js, propostas.js e investimentos.js usavam
// money.parse(v) direto na escrita — que é deliberadamente "lenient" (documentado
// em lib/money.js) e zera QUALQUER entrada inválida em silêncio. Isso é o
// comportamento certo pra leitura/agregação, mas errado na escrita: um payload
// malformado zerava o valor de um contrato/proposta/aporte sem erro nenhum.
// Estes dois helpers dão o mesmo parse+arredondamento de money.js, mas REJEITAM
// entrada inválida em vez de zerar — só pros pontos de escrita.

test('parseOptionalMoney — ausente devolve o fallback (default 0), sem lançar', () => {
  assert.equal(parseOptionalMoney(undefined, 'value'), 0);
  assert.equal(parseOptionalMoney(null, 'value'), 0);
  assert.equal(parseOptionalMoney('', 'value'), 0);
});

test('parseOptionalMoney — ausente com fallback customizado', () => {
  assert.equal(parseOptionalMoney(undefined, 'value', 15), 15);
});

test('parseOptionalMoney — número válido é aceito e arredondado a 2 casas', () => {
  assert.equal(parseOptionalMoney(1234.567, 'value'), 1234.57);
  assert.equal(parseOptionalMoney('2500.5', 'value'), 2500.5);
});

test('parseOptionalMoney — zero explícito é aceito (não é "ausente")', () => {
  assert.equal(parseOptionalMoney(0, 'value'), 0);
  assert.equal(parseOptionalMoney('0', 'value'), 0);
});

test('parseOptionalMoney — string não-numérica lança ValidationError (não zera em silêncio)', () => {
  expectError(() => parseOptionalMoney('abc', 'value'), /value/);
});

test('parseOptionalMoney — negativo lança ValidationError', () => {
  expectError(() => parseOptionalMoney(-100, 'value'), /value/);
});

test('parsePositiveMoney — número positivo é aceito', () => {
  assert.equal(parsePositiveMoney(500, 'valor'), 500);
});

test('parsePositiveMoney — zero lança ValidationError (aporte de R$0 não faz sentido)', () => {
  expectError(() => parsePositiveMoney(0, 'valor'), /valor/);
});

test('parsePositiveMoney — ausente lança ValidationError (é obrigatório)', () => {
  expectError(() => parsePositiveMoney(undefined, 'valor'), /valor/);
});

test('parsePositiveMoney — string não-numérica lança ValidationError', () => {
  expectError(() => parsePositiveMoney('abc', 'valor'), /valor/);
});
