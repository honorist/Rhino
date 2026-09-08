'use strict';
/**
 * @file lib/rich-text-sanitize.js — allowlist de HTML para os campos de
 * texto rico da Proposta (Objetivo, Saudação, Observações, itens de Escopo e
 * de Obrigações). Único ponto de confiança que decide o que sobrevive de
 * conteúdo digitado no editor (Jodit) antes de virar HTML servido de volta.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeRichText,
  sanitizeItemArrayTexto,
} = require('../lib/rich-text-sanitize');

test('mantém tags permitidas (negrito, itálico, sublinhado, parágrafo, quebra de linha)', () => {
  const html = '<p>Um <strong>negrito</strong>, <em>itálico</em> e <u>sublinhado</u>.<br>Outra linha.</p>';
  const out = sanitizeRichText(html);
  // sanitize-html normaliza <br> para <br /> — equivalente, não é regressão
  assert.equal(out, html.replace('<br>', '<br />'));
});

test('mantém listas com marcador e numeradas', () => {
  const html = '<ul><li>Item 1</li><li>Item 2</li></ul><ol><li>Primeiro</li></ol>';
  assert.equal(sanitizeRichText(html), html);
});

test('mantém tabela completa (table/thead/tbody/tr/th/td)', () => {
  const html = '<table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>';
  assert.equal(sanitizeRichText(html), html);
});

test('remove <script> e não deixa o conteúdo sobrar como texto', () => {
  const html = '<p>ok</p><script>alert(1)</script>';
  const out = sanitizeRichText(html);
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('alert(1)'));
});

test('remove <iframe> e <style>', () => {
  const out = sanitizeRichText('<iframe src="//evil"></iframe><style>body{display:none}</style><p>ok</p>');
  assert.ok(!out.includes('<iframe'));
  assert.ok(!out.includes('<style'));
  assert.ok(out.includes('<p>ok</p>'));
});

test('remove atributo onerror/onclick (event handlers)', () => {
  const out = sanitizeRichText('<p onclick="alert(1)">clique</p>');
  assert.ok(!out.includes('onclick'));
  assert.ok(!out.includes('alert'));
});

test('span com cor de texto/fundo válida sobrevive', () => {
  const html = '<span style="color:#ff0000;background-color:#00ff00;">colorido</span>';
  const out = sanitizeRichText(html);
  assert.ok(out.includes('color:#ff0000'));
  assert.ok(out.includes('background-color:#00ff00'));
});

test('span com style perigoso (javascript:/expression/url) tem o style removido, não a tag inteira', () => {
  const out = sanitizeRichText('<span style="color:red;background:url(javascript:alert(1))">x</span>');
  assert.ok(!out.includes('javascript:'));
  assert.ok(out.includes('>x<'));
});

test('img com src same-origin /api/propostas/:id/anexos/:id sobrevive', () => {
  const html = '<img src="/api/propostas/prop_123/anexos/anx_456" alt="foto">';
  const out = sanitizeRichText(html);
  assert.ok(out.includes('src="/api/propostas/prop_123/anexos/anx_456"'));
});

test('img com width/height (redimensionamento do editor) sobrevive', () => {
  const html = '<img src="/api/propostas/prop_1/anexos/anx_1" width="250" height="120">';
  const out = sanitizeRichText(html);
  assert.ok(out.includes('width="250"'));
  assert.ok(out.includes('height="120"'));
});

test('img com src externo é removida', () => {
  const out = sanitizeRichText('<img src="https://evil.example/x.png" alt="x">');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('evil.example'));
});

test('img com src protocolo-relativo (//) é removida', () => {
  const out = sanitizeRichText('<img src="//evil.example/x.png">');
  assert.ok(!out.includes('<img'));
});

test('img com src data: é removida (não é o esquema same-origin esperado)', () => {
  const out = sanitizeRichText('<img src="data:image/png;base64,AAAA">');
  assert.ok(!out.includes('<img'));
});

test('link <a> não está na allowlist — tag cai mas texto permanece', () => {
  const out = sanitizeRichText('<a href="https://x.com">clique aqui</a>');
  assert.ok(!out.includes('<a '));
  assert.ok(out.includes('clique aqui'));
});

test('HTML malformado não lança exceção', () => {
  assert.doesNotThrow(() => sanitizeRichText('<p>sem fechar<strong>aninhado'));
  assert.doesNotThrow(() => sanitizeRichText('<div><<>>'));
});

test('texto legado sem nenhuma tag HTML passa direto (idempotente)', () => {
  const legado = 'Texto simples de proposta antiga.\nSegunda linha.';
  assert.equal(sanitizeRichText(legado), legado);
});

test('idempotente: sanitizar duas vezes dá o mesmo resultado', () => {
  const html = '<p>Um <strong>teste</strong> com <span style="color:#123456;">cor</span>.</p>';
  const once = sanitizeRichText(html);
  const twice = sanitizeRichText(once);
  assert.equal(once, twice);
});

test('entradas vazias/nulas não lançam e devolvem string vazia', () => {
  assert.equal(sanitizeRichText(''), '');
  assert.equal(sanitizeRichText(null), '');
  assert.equal(sanitizeRichText(undefined), '');
});

// ---------------- sanitizeItemArrayTexto ----------------

test('sanitizeItemArrayTexto sanitiza só o campo texto, preserva os demais campos', () => {
  const arr = [
    { id: 'e1', texto: '<p>ok</p><script>alert(1)</script>', incluso: true, ordem: 1 },
    { id: 'e2', titulo: 'Item <b>2</b>', texto: '<strong>bold</strong>' },
  ];
  const out = sanitizeItemArrayTexto(arr);
  assert.equal(out[0].texto, '<p>ok</p>');
  assert.equal(out[0].id, 'e1');
  assert.equal(out[0].incluso, true);
  assert.equal(out[0].ordem, 1);
  // titulo NUNCA é sanitizado como rich text — é campo de texto puro (input simples)
  assert.equal(out[1].titulo, 'Item <b>2</b>');
  assert.equal(out[1].texto, '<strong>bold</strong>');
});

test('sanitizeItemArrayTexto com array vazio/indefinido não lança', () => {
  assert.deepEqual(sanitizeItemArrayTexto([]), []);
  assert.deepEqual(sanitizeItemArrayTexto(undefined), []);
  assert.deepEqual(sanitizeItemArrayTexto(null), []);
});

test('sanitizeItemArrayTexto tolera item sem campo texto', () => {
  const out = sanitizeItemArrayTexto([{ id: 'x' }]);
  assert.equal(out[0].id, 'x');
  assert.equal(out[0].texto, undefined);
});
