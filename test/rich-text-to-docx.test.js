'use strict';
/**
 * @file lib/rich-text-to-docx.js — traduz HTML sanitizado (allowlist de
 * lib/rich-text-sanitize.js) para construtos da lib `docx` (Paragraph/Table/
 * TextRun/ImageRun), usado nos campos ricos da Proposta em lib/proposta-docx.js.
 *
 * Verificação por conteúdo: cada bloco é empacotado (Packer.toBuffer) e o
 * document.xml resultante é inspecionado por marcadores OOXML reais — "não
 * lançou" não é evidência suficiente pra lógica de tradução de formatação
 * (mesmo racional do steering: test/proposta-docx.test.js hoje só faz fumaça,
 * este arquivo cobre o que aquele deliberadamente não cobre).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Document, Packer } = require('docx');
const JSZip = require('jszip');

const { richTextToDocxParagraphs } = require('../lib/rich-text-to-docx');

async function packToXml(blocks) {
  const doc = new Document({ sections: [{ children: blocks }] });
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml').async('string');
}

test('parágrafo simples vira um Paragraph com o texto', async () => {
  const blocks = richTextToDocxParagraphs('<p>Olá mundo</p>');
  assert.equal(blocks.length, 1);
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('Olá mundo'));
});

test('negrito produz <w:b/>', async () => {
  const blocks = richTextToDocxParagraphs('<p>Um <strong>negrito</strong> aqui.</p>');
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:b/>'));
});

test('itálico produz <w:i/>', async () => {
  const blocks = richTextToDocxParagraphs('<p>Um <em>itálico</em> aqui.</p>');
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:i/>'));
});

test('sublinhado produz <w:u .../>', async () => {
  const blocks = richTextToDocxParagraphs('<p>Um <u>sublinhado</u> aqui.</p>');
  const xml = await packToXml(blocks);
  assert.match(xml, /<w:u w:val="single"\/>/);
});

test('cor de texto (span style) produz <w:color w:val="FF0000"/>', async () => {
  const blocks = richTextToDocxParagraphs('<p><span style="color:#ff0000;">vermelho</span></p>');
  const xml = await packToXml(blocks);
  assert.match(xml, /<w:color w:val="FF0000"\/>/);
});

test('lista com marcador produz <w:numPr> por item', async () => {
  const blocks = richTextToDocxParagraphs('<ul><li>Item A</li><li>Item B</li></ul>');
  assert.equal(blocks.length, 2);
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:numPr>'));
  assert.ok(xml.includes('Item A') && xml.includes('Item B'));
});

test('lista numerada prefixa "1. "/"2. " (sem numbering.config próprio)', async () => {
  const blocks = richTextToDocxParagraphs('<ol><li>Primeiro</li><li>Segundo</li></ol>');
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('1. ') && xml.includes('Primeiro'));
  assert.ok(xml.includes('2. ') && xml.includes('Segundo'));
});

test('tabela vira <w:tbl> com as células', async () => {
  const blocks = richTextToDocxParagraphs('<table><tbody><tr><td>Coluna A</td><td>Coluna B</td></tr></tbody></table>');
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:tbl>'));
  assert.ok(xml.includes('Coluna A') && xml.includes('Coluna B'));
});

test('tabela com <thead>/<th> destaca o cabeçalho', async () => {
  const blocks = richTextToDocxParagraphs('<table><thead><tr><th>Cabeçalho</th></tr></thead><tbody><tr><td>Corpo</td></tr></tbody></table>');
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('Cabeçalho') && xml.includes('Corpo'));
  // header vira <w:shd> preenchido — corpo não
  assert.ok(xml.includes('<w:shd'));
});

test('imagem embutida vira ImageRun quando o anexo está no anexoMap', async () => {
  // PNG mínimo válido (1x1) só pra a lib `docx` aceitar o buffer
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  const blocks = richTextToDocxParagraphs('<p><img src="/api/propostas/prop1/anexos/anx1" width="100" height="80"></p>', {
    anexoMap: { anx1: { data: png, mimeType: 'image/png' } },
  });
  assert.equal(blocks.length, 1);
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:drawing>'), 'imagem embutida gera um elemento <w:drawing>');
});

test('imagem sem correspondência no anexoMap é ignorada silenciosamente (não lança, não quebra o parágrafo)', () => {
  assert.doesNotThrow(() => {
    const blocks = richTextToDocxParagraphs('<p>Antes<img src="/api/propostas/prop1/anexos/naoexiste">Depois</p>', { anexoMap: {} });
    assert.ok(blocks.length >= 1);
  });
});

test('destaque automático de Contratada/Contratante (destaque:true) aplica <w:b/> na palavra', async () => {
  const blocks = richTextToDocxParagraphs('<p>A Contratada deve cumprir o prazo.</p>', { destaque: true });
  const xml = await packToXml(blocks);
  assert.ok(xml.includes('<w:b/>'));
  assert.ok(xml.includes('CONTRATADA'));
});

test('sem destaque (destaque:false, padrão) não força negrito em Contratada/Contratante', async () => {
  const blocks = richTextToDocxParagraphs('<p>A Contratada deve cumprir o prazo.</p>');
  const xml = await packToXml(blocks);
  assert.ok(!xml.includes('<w:b/>'));
  assert.ok(xml.includes('Contratada')); // mantém capitalização original — não força upper nem bold
});

test('entrada vazia devolve lista vazia', () => {
  assert.deepEqual(richTextToDocxParagraphs(''), []);
  assert.deepEqual(richTextToDocxParagraphs(null), []);
});

test('parágrafo vazio (sem texto) não gera bloco', () => {
  const blocks = richTextToDocxParagraphs('<p></p>');
  assert.equal(blocks.length, 0);
});
