'use strict';
// node --test test/pdf-render.test.js  (sem servidor, sem DB — usa pdf-to-img de verdade)
//
// lib/pdf-render.js isola a lib externa de conversão PDF→imagem. Achado da
// varredura 2026-09-08 (1.1): pdf-to-img v7 corrige a CVE de execução
// arbitrária de JS via PDF malicioso (GHSA-hq66-cqwq-w95j, pdfjs-dist), mas
// muda a API — não aceita mais Buffer direto, só path ou data URL. Este
// teste prova que a conversão renderiza páginas de verdade com a API nova.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderPdfPages } = require('../lib/pdf-render');
const { VALID_PDF_BYTES } = require('./helpers/multipart');

test('renderPdfPages — converte um PDF de 1 página válido em 1 imagem PNG', async () => {
  const pages = await renderPdfPages(VALID_PDF_BYTES);
  assert.equal(pages.length, 1);
  assert.ok(Buffer.isBuffer(pages[0]));
  // Assinatura PNG (\x89PNG\r\n\x1a\n) — confirma que é imagem de verdade, não eco do input.
  assert.deepEqual(pages[0].subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});

test('renderPdfPages — PDF corrompido/ilegível rejeita (não trava, não retorna vazio silenciosamente)', async () => {
  await assert.rejects(() => renderPdfPages(Buffer.from('não é um pdf')));
});
