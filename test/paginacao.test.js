'use strict';
// node --test test/paginacao.test.js  (puro: sem DOM real, sem rede)
//
// Regras de paginação do UIKit (js/lib/ui-kit.js). O arquivo é um IIFE de
// browser (window.UIKit = ...), então é carregado num vm com stub mínimo de
// window — mesmo caminho usado para testar view sem bundler.
//
//  BR-PAG-001 clamp: página além do fim cai na última existente, nunca em vazio
//  BR-PAG-002 lista vazia continua navegável (1 página, fatia vazia)
//  BR-PAG-003 a última página parcial devolve só o que resta
//  BR-PAG-004 a janela de páginas acompanha a página atual sem sair do intervalo
//  BR-PAG-005 o controle some quando tudo cabe numa página

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregarUIKit() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lib', 'ui-kit.js'), 'utf8');
  const janela = { addEventListener() {} };
  const sandbox = {
    window: janela,
    document: { documentElement: { setAttribute() {}, removeAttribute() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { hash: '' },
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'ui-kit.js' });
  return janela.UIKit;
}

const UIKit = carregarUIKit();
const lista = (n) => Array.from({ length: n }, (_, i) => `item-${i + 1}`);

// Array criado DENTRO do vm tem outro prototype (outro realm), e deepEqual
// estrito compara prototype. Copiar para um array deste realm antes de comparar.
const mesmoRealm = (a) => [...a];

test('UIKit expõe os helpers de paginação', () => {
  for (const fn of ['paginate', 'pageWindow', 'pagination', 'wirePagination']) {
    assert.equal(typeof UIKit[fn], 'function', `${fn} deveria existir`);
  }
});

// ─── paginate ────────────────────────────────────────────────────────────────

test('paginate — primeira página devolve o começo da lista', () => {
  const r = UIKit.paginate(lista(100), 1, 25);
  assert.equal(r.page, 1);
  assert.equal(r.total, 100);
  assert.equal(r.totalPages, 4);
  assert.equal(r.start, 0);
  assert.equal(r.end, 25);
  assert.equal(r.slice.length, 25);
  assert.equal(r.slice[0], 'item-1');
});

test('paginate — página do meio fatia o intervalo certo', () => {
  const r = UIKit.paginate(lista(100), 3, 25);
  assert.equal(r.slice[0], 'item-51');
  assert.equal(r.slice.at(-1), 'item-75');
  assert.equal(r.start, 50);
  assert.equal(r.end, 75);
});

test('paginate — BR-PAG-003: última página parcial devolve só o resto', () => {
  const r = UIKit.paginate(lista(23), 3, 10);
  assert.equal(r.totalPages, 3);
  assert.equal(r.slice.length, 3);
  assert.equal(r.slice[0], 'item-21');
  assert.equal(r.end, 23);
});

test('paginate — BR-PAG-001: página além do fim cai na última, não em vazio', () => {
  const r = UIKit.paginate(lista(30), 99, 10);
  assert.equal(r.page, 3, 'deveria ter feito clamp para a última página');
  assert.equal(r.slice.length, 10);
  assert.notEqual(r.slice.length, 0, 'o usuário nunca pode cair numa tela vazia por causa da página');
});

test('paginate — página inválida ou menor que 1 volta para a 1', () => {
  for (const pg of [0, -5, null, undefined, NaN, 'abc']) {
    const r = UIKit.paginate(lista(30), pg, 10);
    assert.equal(r.page, 1, `página ${JSON.stringify(pg)} deveria virar 1`);
    assert.equal(r.slice[0], 'item-1');
  }
});

test('paginate — BR-PAG-002: lista vazia continua coerente', () => {
  const r = UIKit.paginate([], 1, 25);
  assert.equal(r.total, 0);
  assert.equal(r.totalPages, 1, 'nunca 0 páginas — a tela precisa renderizar algo');
  assert.equal(r.page, 1);
  assert.deepEqual(mesmoRealm(r.slice), []);
  assert.equal(r.start, 0);
  assert.equal(r.end, 0);
});

test('paginate — entrada não-array não quebra', () => {
  for (const v of [null, undefined, 'texto', 42, {}]) {
    const r = UIKit.paginate(v, 1, 10);
    assert.deepEqual(mesmoRealm(r.slice), []);
    assert.equal(r.total, 0);
  }
});

test('paginate — pageSize inválido cai no default em vez de dividir por zero', () => {
  for (const tam of [0, -1, null, undefined, 'abc']) {
    const r = UIKit.paginate(lista(30), 1, tam);
    assert.equal(r.pageSize, UIKit.DEFAULT_PAGE_SIZE);
    assert.ok(Number.isFinite(r.totalPages) && r.totalPages >= 1);
  }
});

test('paginate — pageSize maior que a lista devolve tudo numa página', () => {
  const r = UIKit.paginate(lista(7), 1, 100);
  assert.equal(r.totalPages, 1);
  assert.equal(r.slice.length, 7);
  assert.equal(r.end, 7);
});

test('paginate — nenhum item some nem repete ao percorrer todas as páginas', () => {
  const dados = lista(97);
  const vistos = [];
  const tam = 10;
  const total = UIKit.paginate(dados, 1, tam).totalPages;
  for (let p = 1; p <= total; p++) vistos.push(...UIKit.paginate(dados, p, tam).slice);
  assert.equal(vistos.length, 97, 'a soma das páginas tem que dar a lista inteira');
  assert.equal(new Set(vistos).size, 97, 'nenhum item pode aparecer em duas páginas');
  assert.deepEqual(mesmoRealm(vistos), dados, 'a ordem tem que ser preservada');
});

// ─── pageWindow (BR-PAG-004) ─────────────────────────────────────────────────

test('pageWindow — poucas páginas: mostra todas', () => {
  assert.deepEqual(mesmoRealm(UIKit.pageWindow(1, 3)), [1, 2, 3]);
  assert.deepEqual(mesmoRealm(UIKit.pageWindow(2, 1)), [1]);
});

test('pageWindow — muitas páginas: janela de 7 acompanha a atual', () => {
  const inicio = UIKit.pageWindow(1, 50);
  assert.equal(inicio.length, 7);
  assert.equal(inicio[0], 1);

  const meio = UIKit.pageWindow(25, 50);
  assert.equal(meio.length, 7);
  assert.ok(meio.includes(25), 'a página atual precisa estar visível');

  const fim = UIKit.pageWindow(50, 50);
  assert.equal(fim.length, 7);
  assert.equal(fim.at(-1), 50);
});

test('pageWindow — nunca sai do intervalo válido', () => {
  for (const pg of [1, 2, 7, 25, 44, 49, 50]) {
    for (const n of UIKit.pageWindow(pg, 50)) {
      assert.ok(n >= 1 && n <= 50, `página ${n} fora do intervalo 1..50`);
    }
  }
});

// ─── pagination (BR-PAG-005) ─────────────────────────────────────────────────

test('pagination — some quando tudo cabe numa página', () => {
  assert.equal(UIKit.pagination(UIKit.paginate(lista(10), 1, 25)), '');
  assert.equal(UIKit.pagination(UIKit.paginate([], 1, 25)), '');
  assert.equal(UIKit.pagination(null), '');
});

test('pagination — aparece com intervalo, total e acessibilidade', () => {
  const html = UIKit.pagination(UIKit.paginate(lista(100), 2, 25), { label: 'colaboradores' });
  assert.match(html, /26–50 de 100/);
  assert.match(html, /aria-current="page"/, 'a página atual precisa ser anunciada');
  assert.match(html, /aria-label="Página anterior"/);
  assert.match(html, /aria-label="Próxima página"/);
  assert.match(html, /aria-label="Paginação de colaboradores"/);
});

test('pagination — desabilita anterior na 1ª e próxima na última', () => {
  const primeira = UIKit.pagination(UIKit.paginate(lista(100), 1, 25));
  assert.match(primeira, /data-pg-prev[^>]*disabled/);
  assert.doesNotMatch(primeira, /data-pg-next[^>]*disabled/);

  const ultima = UIKit.pagination(UIKit.paginate(lista(100), 4, 25));
  assert.match(ultima, /data-pg-next[^>]*disabled/);
  assert.doesNotMatch(ultima, /data-pg-prev[^>]*disabled/);
});

test('pagination — o label do usuário é escapado (não injeta HTML)', () => {
  const html = UIKit.pagination(UIKit.paginate(lista(100), 1, 25), {
    label: '<img src=x onerror=alert(1)>',
  });
  assert.doesNotMatch(html, /<img/, 'label não pode virar tag');
});
