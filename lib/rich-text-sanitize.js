'use strict';
/**
 * Allowlist de HTML para os campos de texto rico da Proposta.
 *
 * Único ponto de confiança para conteúdo digitado no editor (Jodit) antes de
 * ser persistido/servido de volta como HTML de verdade — substitui, só para
 * estes campos, a estratégia antiga de "escapar tudo" (lib/proposta-html.js).
 *
 * `ALLOWED_TAGS`/`ALLOWED_ATTRIBUTES` são exportados para os tradutores de
 * DOCX/PDF nunca encontrarem uma tag que este sanitizador não teria permitido.
 */
const sanitizeHtml = require('sanitize-html');

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u',
  'span',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
];

const ALLOWED_ATTRIBUTES = {
  span: ['style'],
  // width/height: puramente cosméticos (não executam nada), o editor os usa
  // pra lembrar o tamanho que o usuário redimensionou a imagem pra.
  img: ['src', 'alt', 'width', 'height'],
};

// Só cor de texto/fundo — nada de position/url()/expression, etc.
const COLOR_RE = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]+)$/;
const ALLOWED_STYLES = {
  span: {
    color: [COLOR_RE],
    'background-color': [COLOR_RE],
  },
};

// Imagem embutida só pode apontar pro próprio endpoint de anexos da proposta
// (mesma origem) — bloqueia URL externa (hotlink) e, mais importante, SSRF
// quando o gerador de DOCX/PDF for buscar essa imagem no servidor.
const ALLOWED_IMG_SRC_RE = /^\/api\/propostas\/[A-Za-z0-9_-]+\/anexos\/[A-Za-z0-9_-]+$/;

function sanitizeRichText(html) {
  if (!html) return '';
  return sanitizeHtml(String(html), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe'],
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img') {
        const src = frame.attribs && frame.attribs.src;
        return !src || !ALLOWED_IMG_SRC_RE.test(src);
      }
      return false;
    },
  });
}

function sanitizeItemArrayTexto(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => (
    item && Object.prototype.hasOwnProperty.call(item, 'texto')
      ? { ...item, texto: sanitizeRichText(item.texto) }
      : { ...item }
  ));
}

module.exports = {
  sanitizeRichText,
  sanitizeItemArrayTexto,
  ALLOWED_TAGS,
  ALLOWED_ATTRIBUTES,
  ALLOWED_STYLES,
};
