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

// ---- Item 12: módulos novos que ainda não tinham entrada no mapa ----

test('equipamentos/ferramentas/composicoes/subcontratados exigem a aba específica', () => {
  assert.strictEqual(podeReceberMutacao('equipamentos', ['#/equipamentos']), true);
  assert.strictEqual(podeReceberMutacao('equipamentos', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('ferramentas', ['#/ferramentaria']), true);
  assert.strictEqual(podeReceberMutacao('ferramentas', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('composicoes', ['#/composicoes']), true);
  assert.strictEqual(podeReceberMutacao('composicoes', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('subcontratados', ['#/subcontratados']), true);
  assert.strictEqual(podeReceberMutacao('subcontratados', ['#/dashboard']), false);
});

test('cotacoes e ordens-compra apontam pra #/mapa-cotacoes', () => {
  assert.strictEqual(podeReceberMutacao('cotacoes', ['#/mapa-cotacoes']), true);
  assert.strictEqual(podeReceberMutacao('cotacoes', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('ordens-compra', ['#/mapa-cotacoes']), true);
  assert.strictEqual(podeReceberMutacao('ordens-compra', ['#/dashboard']), false);
});

test('users e niveis-acesso apontam pra #/usuarios (rota não-universal — exige a aba)', () => {
  assert.strictEqual(podeReceberMutacao('users', ['#/usuarios']), true);
  assert.strictEqual(podeReceberMutacao('users', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('niveis-acesso', ['#/usuarios']), true);
  assert.strictEqual(podeReceberMutacao('niveis-acesso', ['#/dashboard']), false);
});

test('case-logos e app-settings apontam pra #/apresentacao, que é universal', () => {
  assert.strictEqual(podeReceberMutacao('case-logos', ['#/dashboard']), true);
  assert.strictEqual(podeReceberMutacao('app-settings', ['#/dashboard']), true);
});

test('doc-templates e tipos-base apontam pra #/configuracao', () => {
  assert.strictEqual(podeReceberMutacao('doc-templates', ['#/configuracao']), true);
  assert.strictEqual(podeReceberMutacao('doc-templates', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('tipos-base', ['#/configuracao']), true);
  assert.strictEqual(podeReceberMutacao('tipos-base', ['#/dashboard']), false);
});

test('cobranca-mensal aponta pra #/cobranca; saidas aponta pra #/contratos', () => {
  assert.strictEqual(podeReceberMutacao('cobranca-mensal', ['#/cobranca']), true);
  assert.strictEqual(podeReceberMutacao('cobranca-mensal', ['#/dashboard']), false);
  assert.strictEqual(podeReceberMutacao('saidas', ['#/contratos']), true);
  assert.strictEqual(podeReceberMutacao('saidas', ['#/dashboard']), false);
});
