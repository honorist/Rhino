'use strict';
/**
 * @file lib/rich-text-parse.js — parse de HTML já sanitizado (allowlist de
 * lib/rich-text-sanitize.js) numa árvore de nós {type, name, attribs,
 * children, data}, reaproveitada pelos tradutores de DOCX e PDF.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseRichText } = require('../lib/rich-text-parse');

test('parseia um parágrafo simples', () => {
  const nodes = parseRichText('<p>Olá</p>');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'tag');
  assert.equal(nodes[0].name, 'p');
  assert.equal(nodes[0].children.length, 1);
  assert.equal(nodes[0].children[0].type, 'text');
  assert.equal(nodes[0].children[0].data, 'Olá');
});

test('parseia tags aninhadas (negrito dentro de parágrafo)', () => {
  const nodes = parseRichText('<p>Um <strong>negrito</strong> aqui.</p>');
  const p = nodes[0];
  assert.equal(p.children.length, 3);
  assert.equal(p.children[1].name, 'strong');
  assert.equal(p.children[1].children[0].data, 'negrito');
});

test('parseia lista com itens', () => {
  const nodes = parseRichText('<ul><li>A</li><li>B</li></ul>');
  const ul = nodes[0];
  const items = ul.children.filter(n => n.type === 'tag' && n.name === 'li');
  assert.equal(items.length, 2);
});

test('parseia tabela com atributos de célula', () => {
  const nodes = parseRichText('<table><tbody><tr><td>X</td></tr></tbody></table>');
  const table = nodes[0];
  assert.equal(table.name, 'table');
});

test('parseia atributos de img (src/width/height)', () => {
  const nodes = parseRichText('<p><img src="/api/propostas/p1/anexos/a1" width="300" height="200"></p>');
  const img = nodes[0].children[0];
  assert.equal(img.name, 'img');
  assert.equal(img.attribs.src, '/api/propostas/p1/anexos/a1');
  assert.equal(img.attribs.width, '300');
});

test('entrada vazia/nula devolve lista vazia sem lançar', () => {
  assert.deepEqual(parseRichText(''), []);
  assert.deepEqual(parseRichText(null), []);
  assert.deepEqual(parseRichText(undefined), []);
});

test('HTML malformado não lança', () => {
  assert.doesNotThrow(() => parseRichText('<p>sem fechar<strong>aninhado'));
});
