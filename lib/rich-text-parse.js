'use strict';
/**
 * Parse de HTML já sanitizado (lib/rich-text-sanitize.js) numa árvore de nós
 * simples — reaproveitada por lib/rich-text-to-docx.js e
 * lib/rich-text-to-pdfkit.js pra não duplicar a lógica de parse em cada um.
 *
 * Nó: { type: 'tag'|'text', name?, attribs?, children?, data? }
 */
const { parseDocument } = require('htmlparser2');

function parseRichText(html) {
  if (!html) return [];
  const doc = parseDocument(String(html));
  return doc.children || [];
}

module.exports = { parseRichText };
