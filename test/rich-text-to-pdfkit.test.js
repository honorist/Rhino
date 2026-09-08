'use strict';
/**
 * @file lib/rich-text-to-pdfkit.js — traduz HTML sanitizado (allowlist de
 * lib/rich-text-sanitize.js) para desenhos no pdfkit, usado nos campos ricos
 * da Proposta em lib/proposta-pdf.js.
 *
 * `flattenInlineRuns` é a parte pura (HTML → lista de runs formatados) e é
 * testada isoladamente, sem pdfkit. `renderRichTextPdf` desenha de fato num
 * `doc` do pdfkit — só dá pra "fumaça testar" (não lança, produz PDF válido),
 * mesmo racional de test/proposta-pdf.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');

const { renderRichTextPdf, _internal } = require('../lib/rich-text-to-pdfkit');
const { flattenInlineRuns, extractColorPdf } = _internal;
const { parseRichText } = require('../lib/rich-text-parse');

function flatten(html, destaque) {
  const nodes = parseRichText(html);
  return flattenInlineRuns(nodes[0].children, {}, !!destaque);
}

// ---------------- flattenInlineRuns (parte pura) ----------------

test('texto simples vira um run sem formatação', () => {
  const runs = flatten('<p>Olá mundo</p>');
  assert.deepEqual(runs, [{ text: 'Olá mundo' }]);
});

test('negrito/itálico/sublinhado aninhados acumulam no mesmo run', () => {
  const runs = flatten('<p><strong><em><u>tudo</u></em></strong></p>');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'tudo');
  assert.equal(runs[0].bold, true);
  assert.equal(runs[0].italic, true);
  assert.equal(runs[0].underline, true);
});

test('span com cor extrai a cor em hex', () => {
  const runs = flatten('<p><span style="color:#ff0000;">vermelho</span></p>');
  assert.equal(runs[0].color, '#ff0000');
});

test('<br> vira um run de quebra ({break:true}), sem texto', () => {
  const runs = flatten('<p>Linha um<br>Linha dois</p>');
  const breakRun = runs.find(r => r.break);
  assert.ok(breakRun, 'deveria ter um run de quebra');
  assert.equal(runs[0].text, 'Linha um');
  assert.equal(runs[runs.length - 1].text, 'Linha dois');
});

test('<img> vira um run com o nó original em .img', () => {
  const runs = flatten('<p><img src="/api/propostas/p1/anexos/a1" width="100"></p>');
  const imgRun = runs.find(r => r.img);
  assert.ok(imgRun);
  assert.equal(imgRun.img.attribs.src, '/api/propostas/p1/anexos/a1');
});

test('destaque:true segmenta Contratada/Contratante em runs separados com bold', () => {
  const runs = flatten('<p>A Contratada deve cumprir.</p>', true);
  const destaqueRun = runs.find(r => r.text === 'CONTRATADA');
  assert.ok(destaqueRun, 'deveria isolar "Contratada" como segmento em maiúsculo');
  assert.equal(destaqueRun.bold, true);
});

test('destaque:false não segmenta nem força bold em Contratada/Contratante', () => {
  const runs = flatten('<p>A Contratada deve cumprir.</p>', false);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'A Contratada deve cumprir.');
  assert.ok(!runs[0].bold);
});

test('extractColorPdf reconhece hex curto, hex longo e rgb()', () => {
  assert.equal(extractColorPdf('color:#f00;'), '#f00');
  assert.equal(extractColorPdf('color: #ff0000 ;'), '#ff0000');
  assert.equal(extractColorPdf('color:rgb(255, 0, 0);'), '#ff0000');
  assert.equal(extractColorPdf('background-color:#ff0000;'), null);
  assert.equal(extractColorPdf(''), null);
  assert.equal(extractColorPdf(null), null);
});

// ---------------- renderRichTextPdf (desenho — fumaça) ----------------

function fakeDoc() {
  const doc = new PDFDocument({ bufferPages: true, margins: { top: 40, bottom: 40, left: 40, right: 40 } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  return { doc, chunks };
}

test('renderRichTextPdf: parágrafo simples não lança e produz PDF válido', async () => {
  const { doc, chunks } = fakeDoc();
  const done = new Promise(res => doc.on('end', res));
  renderRichTextPdf(doc, '<p>Um parágrafo <strong>com negrito</strong>.</p>');
  doc.end();
  await done;
  const buf = Buffer.concat(chunks);
  assert.ok(buf.slice(0, 4).toString('latin1').startsWith('%PDF'));
});

test('renderRichTextPdf: lista e tabela não lançam', async () => {
  const { doc, chunks } = fakeDoc();
  const done = new Promise(res => doc.on('end', res));
  renderRichTextPdf(doc, '<ul><li>Item A</li><li>Item B</li></ul>');
  renderRichTextPdf(doc, '<table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>Val</td></tr></tbody></table>');
  doc.end();
  await done;
  const buf = Buffer.concat(chunks);
  assert.ok(buf.length > 500);
});

test('renderRichTextPdf: tabela com texto longo numa célula não lança (altura dinâmica)', async () => {
  const { doc, chunks } = fakeDoc();
  const done = new Promise(res => doc.on('end', res));
  const longo = 'Texto bem longo que deveria ocupar mais de uma linha dentro da célula da tabela para testar o cálculo de altura dinâmica por linha.';
  renderRichTextPdf(doc, `<table><tbody><tr><td>${longo}</td><td>Curto</td></tr></tbody></table>`);
  doc.end();
  await done;
  const buf = Buffer.concat(chunks);
  assert.ok(buf.length > 500);
});

test('renderRichTextPdf: imagem sem anexo correspondente não lança (ignora silenciosamente)', async () => {
  const { doc, chunks } = fakeDoc();
  const done = new Promise(res => doc.on('end', res));
  renderRichTextPdf(doc, '<p><img src="/api/propostas/p1/anexos/naoexiste"></p>', { anexoMap: {} });
  doc.end();
  await done;
  assert.ok(Buffer.concat(chunks).length > 0);
});

test('renderRichTextPdf: entrada vazia não lança', async () => {
  const { doc, chunks } = fakeDoc();
  const done = new Promise(res => doc.on('end', res));
  renderRichTextPdf(doc, '');
  doc.text('depois');
  doc.end();
  await done;
  assert.ok(Buffer.concat(chunks).length > 0);
});
