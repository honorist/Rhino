'use strict';
/**
 * @file lib/bus-entity-routes.js — mapa entidade→rota + regra de filtro do
 * SSE bus (item 7 do plano async-wandering-kite / achado L6 da varredura de
 * segurança: _broadcast mandava mutação pra todo cliente conectado sem
 * checar permissão).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { podeReceberMutacao } = require('../lib/bus-entity-routes');

test('abas null (sem nível atrelado) sempre pode — mesma regra do client podeAcessar', () => {
  assert.strictEqual(podeReceberMutacao('caixa', null), true);
  assert.strictEqual(podeReceberMutacao('qualquer-coisa-inexistente', null), true);
});

test('entidade mapeada: com a rota nas abas, pode; sem, não', () => {
  assert.strictEqual(podeReceberMutacao('caixa', ['#/caixa']), true);
  assert.strictEqual(podeReceberMutacao('caixa', ['#/contratos']), false);
});

test('entidade mapeada pra rota universal sempre pode, mesmo sem a aba explícita', () => {
  // #/solicitacoes-compra é universal — mesmo um perfil sem essa aba explícita
  // já vê a tela (regra de podeAcessar), então o bus não pode ser mais restritivo.
  assert.strictEqual(podeReceberMutacao('solicitacoes-compra', ['#/dashboard']), true);
});

test('entidade não mapeada é tratada como universal (preserva comportamento anterior)', () => {
  assert.strictEqual(podeReceberMutacao('entidade-nova-sem-mapa', ['#/dashboard']), true);
});

test('contracts e organograma apontam pra #/contratos', () => {
  assert.strictEqual(podeReceberMutacao('contracts', ['#/contratos']), true);
  assert.strictEqual(podeReceberMutacao('contracts', ['#/clientes']), false);
  assert.strictEqual(podeReceberMutacao('organograma', ['#/contratos']), true);
  assert.strictEqual(podeReceberMutacao('organograma', ['#/clientes']), false);
});
