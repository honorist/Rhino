'use strict';
/**
 * Regras puras de Solicitação de Compra (handlers/compras.js) que o
 * desmembramento do server.js tornou testáveis (item 23 do roadmap).
 *
 * Foco no que vira dinheiro: `_normalizaItensComCotacoes` calcula o TOTAL que
 * alimenta a Conta a Pagar (handleComprarSolicitacao) e escolhe o fornecedor da
 * cotação vencedora. Um erro aqui = valor errado a pagar ou fornecedor errado.
 * `_normalizaItensInicial` blinda a criação (encarregado não define preço).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { _normalizaItensInicial, _normalizaItensComCotacoes } = require('../handlers/compras');

// ── _normalizaItensInicial ──────────────────────────────────────────────────
test('criação: descarta itens sem descrição ou com qtd <= 0', () => {
  const out = _normalizaItensInicial([
    { descricao: 'Cimento', qtd: 10 },
    { descricao: '', qtd: 5 }, // sem descrição
    { descricao: 'Areia', qtd: 0 }, // qtd zero
    { descricao: 'Brita', qtd: -3 }, // qtd negativa
  ]);
  assert.deepStrictEqual(
    out.map((i) => i.descricao),
    ['Cimento']
  );
});

test('criação: zera preço/cotações e normaliza tipo (aluguel vs compra)', () => {
  const [aluguel, compra] = _normalizaItensInicial([
    { descricao: 'Betoneira', qtd: 1, tipo: 'aluguel', precoUnit: 999, cotacoes: [{}] },
    { descricao: 'Prego', qtd: 100, tipo: 'qualquer-coisa' },
  ]);
  assert.strictEqual(aluguel.tipo, 'aluguel');
  assert.strictEqual(aluguel.precoUnit, 0, 'encarregado não define preço');
  assert.deepStrictEqual(aluguel.cotacoes, []);
  assert.strictEqual(aluguel.cotacaoEscolhidaIdx, null);
  assert.strictEqual(compra.tipo, 'compra', 'tipo desconhecido vira compra');
});

test('criação: entrada não-array vira lista vazia', () => {
  assert.deepStrictEqual(_normalizaItensInicial(null), []);
  assert.deepStrictEqual(_normalizaItensInicial(undefined), []);
  assert.deepStrictEqual(_normalizaItensInicial('x'), []);
});

// ── _normalizaItensComCotacoes ──────────────────────────────────────────────
test('avaliação: total = soma(qtd × preço da cotação escolhida)', () => {
  const { total } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 10, cotacoes: [{ precoUnit: 30 }], cotacaoEscolhidaIdx: 0 },
    { descricao: 'Areia', qtd: 5, cotacoes: [{ precoUnit: 8 }], cotacaoEscolhidaIdx: 0 },
  ]);
  assert.strictEqual(total, 10 * 30 + 5 * 8); // 340
});

test('avaliação: sem cotacaoEscolhidaIdx, usa a primeira cotação (idx 0)', () => {
  const { itens, total } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 2, cotacoes: [{ precoUnit: 25 }, { precoUnit: 40 }] },
  ]);
  assert.strictEqual(itens[0].cotacaoEscolhidaIdx, 0);
  assert.strictEqual(itens[0].precoUnit, 25);
  assert.strictEqual(total, 50);
});

test('avaliação: idx inválido cai na primeira cotação', () => {
  const { itens } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 1, cotacoes: [{ precoUnit: 25 }], cotacaoEscolhidaIdx: 9 },
  ]);
  assert.strictEqual(itens[0].cotacaoEscolhidaIdx, 0);
  assert.strictEqual(itens[0].precoUnit, 25);
});

test('avaliação: escolhe a cotação apontada quando o índice é válido', () => {
  const { itens } = _normalizaItensComCotacoes([
    {
      descricao: 'Cimento',
      qtd: 1,
      cotacoes: [{ precoUnit: 25 }, { precoUnit: 40 }, { precoUnit: 33 }],
      cotacaoEscolhidaIdx: 2,
    },
  ]);
  assert.strictEqual(itens[0].precoUnit, 33);
});

test('avaliação: item sem cotações fica com preço 0 e idx null (não some)', () => {
  const { itens, total } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 10, cotacoes: [] },
  ]);
  assert.strictEqual(itens.length, 1, 'o item permanece — o handler é quem barra sem cotação');
  assert.strictEqual(itens[0].cotacaoEscolhidaIdx, null);
  assert.strictEqual(itens[0].precoUnit, 0);
  assert.strictEqual(total, 0);
});

test('avaliação: fornecedorIdEscolhido = fornecedor da 1ª cotação escolhida', () => {
  const { fornecedorIdEscolhido } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 1, cotacoes: [{ precoUnit: 30, fornecedorId: 'forn-A' }] },
    { descricao: 'Areia', qtd: 1, cotacoes: [{ precoUnit: 8, fornecedorId: 'forn-B' }] },
  ]);
  assert.strictEqual(fornecedorIdEscolhido, 'forn-A', 'pega o primeiro item com cotação escolhida');
});

test('avaliação: fornecedorIdEscolhido pula itens sem fornecedor até achar um', () => {
  const { fornecedorIdEscolhido } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: 1, cotacoes: [{ precoUnit: 30 }] }, // sem fornecedorId
    { descricao: 'Areia', qtd: 1, cotacoes: [{ precoUnit: 8, fornecedorId: 'forn-B' }] },
  ]);
  assert.strictEqual(fornecedorIdEscolhido, 'forn-B');
});

test('avaliação: descarta itens inválidos e coage preços de string', () => {
  const { itens, total } = _normalizaItensComCotacoes([
    { descricao: 'Cimento', qtd: '4', cotacoes: [{ precoUnit: '12,5'.replace(',', '.') }] },
    { descricao: '', qtd: 5, cotacoes: [{ precoUnit: 10 }] }, // sem descrição → fora
  ]);
  assert.strictEqual(itens.length, 1);
  assert.strictEqual(total, 4 * 12.5); // 50
});

test('avaliação: entrada não-array retorna envelope vazio', () => {
  assert.deepStrictEqual(_normalizaItensComCotacoes(null), {
    itens: [],
    total: 0,
    fornecedorIdEscolhido: null,
  });
});
