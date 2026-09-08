'use strict';
/**
 * @file Renderiza páginas de um PDF em imagens PNG. Isola a lib externa
 * (pdf-to-img) num único ponto — troca de versão/API fica confinada aqui,
 * em vez de espalhada pelo handler que consome o resultado.
 *
 * pdf-to-img v7 corrige GHSA-hq66-cqwq-w95j (pdfjs-dist < 6.2.108 —
 * execução arbitrária de JS ao abrir um PDF malicioso), relevante aqui
 * porque o buffer de entrada vem de upload do usuário (não confiável) em
 * handlers/recurso-documentos.js. A v7 também muda a API: não aceita mais
 * Buffer direto — só path em disco ou data URL — daí a conversão abaixo.
 */

/**
 * Converte um Buffer de PDF em um array de Buffers PNG, um por página, na
 * ordem das páginas do documento.
 *
 * @param {Buffer} pdfBuffer
 * @param {{scale?: number}} [opts]
 * @returns {Promise<Buffer[]>}
 */
async function renderPdfPages(pdfBuffer, opts = {}) {
  const { pdf } = require('pdf-to-img');
  const scale = opts.scale || 1.2;
  const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  const pages = [];
  for await (const page of await pdf(dataUrl, { scale })) {
    pages.push(page);
  }
  return pages;
}

module.exports = { renderPdfPages };
