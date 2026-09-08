'use strict';
// node --test test/mutation-permissions.test.js  (sem servidor, sem DB)
//
// Regra: C-04 — mutação (POST/PUT/DELETE/PATCH) numa rota mapeada exige
// permissão de edição na tela correspondente. Sem isso, a UI esconde a aba
// mas a API aceita de qualquer usuário autenticado (curl direto).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const mp = require('../lib/mutation-permissions');

test('rotas legadas continuam mapeadas (regressão)', () => {
  const casos = [
    ['/api/contracts/c1', '#/contratos'],
    ['/api/saidas/s1', '#/contratos'],
    ['/api/caixa', '#/caixa'],
    ['/api/socios/s1', '#/socios'],
    ['/api/investimentos', '#/investimentos'],
    ['/api/recursos/r1', '#/recursos'],
    ['/api/folha-pagamento/f1', '#/folha-pagamento'],
    ['/api/recrutamento/vagas', '#/recrutamento'],
  ];
  for (const [pathname, screen] of casos) {
    const r = mp.rulesFor(pathname);
    assert.ok(r, `esperava regra para ${pathname}`);
    assert.ok(r.screens.includes(screen), `${pathname} deveria exigir ${screen}, tinha ${r.screens}`);
  }
});

// ─── módulos novos (achado da varredura: sem regra, mutação passava livre) ───

test('cotações e ordens de compra exigem #/mapa-cotacoes', () => {
  for (const p of ['/api/cotacoes', '/api/cotacoes/c1', '/api/cotacoes/c1/itens', '/api/cotacoes/c1/precos',
                    '/api/cotacoes/c1/gerar-ordem', '/api/ordens-compra/o1']) {
    const r = mp.rulesFor(p);
    assert.ok(r, `esperava regra para ${p}`);
    assert.deepEqual(r.screens, ['#/mapa-cotacoes']);
  }
});

test('cotacoes-historico (GET-only, universal) NÃO tem regra de mutação', () => {
  // Rota de leitura, tela universal — não deve casar com o prefixo /api/cotacoes.
  assert.equal(mp.rulesFor('/api/cotacoes-historico'), null);
});

test('subcontratados (+ medições) exigem #/subcontratados', () => {
  for (const p of ['/api/subcontratados', '/api/subcontratados/s1', '/api/subcontratados/s1/medicoes']) {
    const r = mp.rulesFor(p);
    assert.ok(r, `esperava regra para ${p}`);
    assert.deepEqual(r.screens, ['#/subcontratados']);
  }
});

test('ferramentas (+ calibrações) exigem #/ferramentaria', () => {
  for (const p of ['/api/ferramentas', '/api/ferramentas/f1', '/api/ferramentas/f1/calibracoes']) {
    const r = mp.rulesFor(p);
    assert.ok(r, `esperava regra para ${p}`);
    assert.deepEqual(r.screens, ['#/ferramentaria']);
  }
});

test('equipamentos (+ locações) exigem #/equipamentos', () => {
  for (const p of ['/api/equipamentos', '/api/equipamentos/e1', '/api/equipamentos/e1/locacoes']) {
    const r = mp.rulesFor(p);
    assert.ok(r, `esperava regra para ${p}`);
    assert.deepEqual(r.screens, ['#/equipamentos']);
  }
});

// ─── resolve() — decisão final (bloqueia/libera) ────────────────────────────

test('resolve — rota não mapeada nunca bloqueia', () => {
  const r = mp.resolve({ pathname: '/api/algo-nao-mapeado', abas: [], isSuperAdmin: false });
  assert.equal(r.blocked, false);
});

test('resolve — super admin sempre passa, mesmo sem a aba', () => {
  const r = mp.resolve({ pathname: '/api/subcontratados', abas: [], isSuperAdmin: true });
  assert.equal(r.blocked, false);
});

test('resolve — abas null (sem restrição de perfil) sempre passa', () => {
  const r = mp.resolve({ pathname: '/api/subcontratados', abas: null, isSuperAdmin: false });
  assert.equal(r.blocked, false);
});

test('resolve — sem a permissão de edição na tela, bloqueia', () => {
  const r = mp.resolve({ pathname: '/api/subcontratados', abas: ['#/subcontratados'], isSuperAdmin: false });
  assert.equal(r.blocked, true);
});

test('resolve — com "view:" mas sem "edit:", ainda bloqueia (mutação exige edição)', () => {
  const r = mp.resolve({ pathname: '/api/subcontratados', abas: ['view:#/subcontratados'], isSuperAdmin: false });
  assert.equal(r.blocked, true);
});

test('resolve — com "edit:" na tela certa, libera', () => {
  const r = mp.resolve({ pathname: '/api/subcontratados', abas: ['edit:#/subcontratados'], isSuperAdmin: false });
  assert.equal(r.blocked, false);
});

test('resolve — cotações libera com edit na tela combinada #/mapa-cotacoes', () => {
  const r = mp.resolve({ pathname: '/api/ordens-compra/o1', abas: ['edit:#/mapa-cotacoes'], isSuperAdmin: false });
  assert.equal(r.blocked, false);
});

// ─── checklist estrutural — todo prefixo de API restrito na UI precisa de regra ───
//
// Espelha a lista `universais` de js/app.js: telas de módulo (não-universais,
// não-portal) que existem hoje. Se um módulo novo entrar aqui sem virar uma
// entrada em MUTATION_PERMISSION_RULES, este teste falha — é o checklist que
// substitui "lembrar de adicionar a regra".
test('checklist — todo prefixo de API de tela restrita tem regra de mutação', () => {
  const prefixosRestritos = [
    '/api/contracts', '/api/saidas', '/api/base', '/api/tipos-base', '/api/caixa',
    '/api/socios', '/api/investimentos', '/api/clientes', '/api/fornecedores',
    '/api/notas-fiscais', '/api/contas-pagar', '/api/recursos', '/api/folha-pagamento',
    '/api/recrutamento', '/api/cotacoes', '/api/ordens-compra', '/api/subcontratados',
    '/api/ferramentas', '/api/equipamentos',
  ];
  const semRegra = prefixosRestritos.filter((p) => !mp.rulesFor(`${p}/x`) && !mp.rulesFor(p));
  assert.deepEqual(semRegra, [], `prefixos sem regra de mutação: ${semRegra.join(', ')}`);
});
