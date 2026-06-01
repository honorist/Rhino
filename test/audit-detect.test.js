'use strict';
/**
 * @file Testes do detector de entidade/ação do audit log (lib/audit.detectEntity).
 * Função pura — não toca no banco. Cobre raiz, sub-recursos, ações especiais,
 * operações de coleção e o namespace de recrutamento.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { detectEntity, sanitizeBody, maskSensitive } = require('../lib/audit');

test('raiz: /api/clientes/:id', () => {
  assert.deepStrictEqual(detectEntity('/api/clientes/cli_123'), {
    entity: 'clientes', entityId: 'cli_123', action: undefined,
  });
});

test('coleção sem id: /api/clientes (POST create)', () => {
  const r = detectEntity('/api/clientes');
  assert.strictEqual(r.entity, 'clientes');
  assert.strictEqual(r.entityId, null);
});

test('sub-recurso: /api/contracts/:id/saidas/:sid → contracts.saidas com id da saída', () => {
  assert.deepStrictEqual(detectEntity('/api/contracts/ctr_1/saidas/sai_9'), {
    entity: 'contracts.saidas', entityId: 'sai_9', action: undefined,
  });
});

test('sub-recurso create (sem id de filho): usa id do pai', () => {
  const r = detectEntity('/api/contracts/ctr_1/saidas');
  assert.strictEqual(r.entity, 'contracts.saidas');
  assert.strictEqual(r.entityId, 'ctr_1');
});

test('ação especial pagar: /api/contas-pagar/:id/pagar', () => {
  assert.deepStrictEqual(detectEntity('/api/contas-pagar/cp_5/pagar'), {
    entity: 'contas-pagar', entityId: 'cp_5', action: 'pagar',
  });
});

test('ação especial aprovar (compra): /api/solicitacoes-compra/:id/aprovar', () => {
  assert.deepStrictEqual(detectEntity('/api/solicitacoes-compra/sc_2/aprovar'), {
    entity: 'solicitacoes-compra', entityId: 'sc_2', action: 'aprovar',
  });
});

test('ação especial em manutenção: /api/manutencoes/:id/avaliar', () => {
  assert.deepStrictEqual(detectEntity('/api/manutencoes/mnt_3/avaliar'), {
    entity: 'manutencoes', entityId: 'mnt_3', action: 'avaliar',
  });
});

test('ação especial em proposta: /api/propostas/:id/enviar', () => {
  assert.deepStrictEqual(detectEntity('/api/propostas/prop_7/enviar'), {
    entity: 'propostas', entityId: 'prop_7', action: 'enviar',
  });
});

test('emitir nota fiscal: /api/notas-fiscais/:id/emitir', () => {
  assert.strictEqual(detectEntity('/api/notas-fiscais/nf_1/emitir').action, 'emitir');
});

test('cancelar-emissao (verbo composto): /api/notas-fiscais/:id/cancelar-emissao', () => {
  assert.strictEqual(detectEntity('/api/notas-fiscais/nf_1/cancelar-emissao').action, 'cancelar-emissao');
});

test('operação de coleção: /api/folha-pagamento/gerar (sem id)', () => {
  assert.deepStrictEqual(detectEntity('/api/folha-pagamento/gerar'), {
    entity: 'folha-pagamento', entityId: null, action: 'gerar',
  });
});

test('operação de coleção: /api/contas-pagar/processar-recorrencias', () => {
  assert.deepStrictEqual(detectEntity('/api/contas-pagar/processar-recorrencias'), {
    entity: 'contas-pagar', entityId: null, action: 'processar-recorrencias',
  });
});

test('passagem de folga aponta para o COLABORADOR (recurso raiz)', () => {
  // /api/recursos/:id/folgas/:folgaId/passagem → entity recursos, id do recurso
  assert.deepStrictEqual(detectEntity('/api/recursos/rec_1/folgas/folga_2/passagem'), {
    entity: 'recursos', entityId: 'rec_1', action: 'passagem',
  });
});

test('namespace recrutamento: /api/recrutamento/candidatos/:id → candidatos', () => {
  assert.deepStrictEqual(detectEntity('/api/recrutamento/candidatos/cand_4'), {
    entity: 'candidatos', entityId: 'cand_4', action: undefined,
  });
});

test('namespace recrutamento + ação: /api/recrutamento/candidatos/:id/aprovar', () => {
  assert.deepStrictEqual(detectEntity('/api/recrutamento/candidatos/cand_4/aprovar'), {
    entity: 'candidatos', entityId: 'cand_4', action: 'aprovar',
  });
});

test('base allocate: /api/base/:id/allocate', () => {
  assert.deepStrictEqual(detectEntity('/api/base/base_1/allocate'), {
    entity: 'base', entityId: 'base_1', action: 'allocate',
  });
});

test('path não-/api retorna entidade nula via segmentos vazios', () => {
  const r = detectEntity('/api/');
  assert.strictEqual(r.entity, null);
});

// ── sanitizeBody recursivo ──
test('sanitizeBody redacta senha aninhada', () => {
  const out = sanitizeBody({ nome: 'X', user: { email: 'a@b.com', senha: '123' } });
  assert.strictEqual(out.user.senha, '[REDACTED]');
  assert.strictEqual(out.user.email, 'a@b.com');
  assert.strictEqual(out.nome, 'X');
});

test('sanitizeBody redacta passwordHash e token no topo', () => {
  const out = sanitizeBody({ passwordHash: 'abc', token: 'xyz', valor: 10 });
  assert.strictEqual(out.passwordHash, '[REDACTED]');
  assert.strictEqual(out.token, '[REDACTED]');
  assert.strictEqual(out.valor, 10);
});

test('sanitizeBody trunca string longa', () => {
  const long = 'a'.repeat(600);
  const out = sanitizeBody({ obs: long });
  assert.ok(out.obs.endsWith('...[truncated]'));
  assert.ok(out.obs.length < 600);
});

test('sanitizeBody de não-objeto no topo retorna null', () => {
  assert.strictEqual(sanitizeBody('texto'), null);
  assert.strictEqual(sanitizeBody(null), null);
});

// ── maskSensitive (leitura da auditoria — nunca em claro) ──
test('maskSensitive: cpf/cnpj/token viram *** (só não-nulos)', () => {
  const out = maskSensitive({ nome: 'X', cpf: '12345678900', cnpj: null, token: 'abc', valor: 10 });
  assert.strictEqual(out.cpf, '***');
  assert.strictEqual(out.token, '***');
  assert.strictEqual(out.cnpj, null);   // nulo permanece nulo
  assert.strictEqual(out.nome, 'X');
  assert.strictEqual(out.valor, 10);
});

test('maskSensitive recursivo (campo aninhado)', () => {
  const out = maskSensitive({ user: { cpf: '111', email: 'a@b.com' } });
  assert.strictEqual(out.user.cpf, '***');
  assert.strictEqual(out.user.email, 'a@b.com');
});

test('sanitizeBody (gravação) também redacta cpf/cnpj', () => {
  const out = sanitizeBody({ cpf: '12345678900', cnpj: '11222333000144', nome: 'Y' });
  assert.strictEqual(out.cpf, '[REDACTED]');
  assert.strictEqual(out.cnpj, '[REDACTED]');
  assert.strictEqual(out.nome, 'Y');
});
