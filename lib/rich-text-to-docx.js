'use strict';
/**
 * Traduz HTML sanitizado (allowlist de lib/rich-text-sanitize.js) em
 * construtos da lib `docx` (Paragraph/Table/TextRun/ImageRun), usado nos
 * campos ricos da Proposta (objetivo/saudação/observações/itens de
 * escopo/obrigações) — lib/proposta-docx.js espalha o array devolvido no
 * `body` que já constrói.
 *
 * Simplificações aceitas (documentadas, não são bugs):
 *  - Lista numerada usa prefixo textual "1. "/"2. " em vez de numbering.config
 *    real do Word — evita ter que plugar uma referência de numeração global
 *    no Document que chama este módulo; visualmente idêntico num documento
 *    gerado (não editado depois).
 *  - Tabela usa larguras de coluna iguais (WidthType.PERCENTAGE 100% dividido
 *    automaticamente pela lib `docx`), sem largura por conteúdo.
 */
const { Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, ShadingType, AlignmentType, convertInchesToTwip } = require('docx');
const cfg = require('./proposta-template-config');
const { parseRichText } = require('./rich-text-parse');

const ANEXO_URL_RE = /^\/api\/propostas\/[^/]+\/anexos\/([^/]+)$/;

function cssColorToHex(v) {
  v = String(v).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.slice(1).toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return v.slice(1).split('').map(c => c + c).join('').toUpperCase();
  const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(v);
  if (m) return [1, 2, 3].map(i => Math.min(255, Number(m[i])).toString(16).padStart(2, '0')).join('').toUpperCase();
  return null; // nome de cor CSS (ex: "red") — docx exige hex; ignorado (sem cor) em vez de adivinhar
}

function extractColorHex(style) {
  if (!style) return null;
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  return m ? cssColorToHex(m[1]) : null;
}

function makeRun(text, fmt) {
  const opts = { text, bold: !!fmt.bold, italics: !!fmt.italic };
  if (fmt.underline) opts.underline = {};
  if (fmt.color) opts.color = fmt.color;
  return new TextRun(opts);
}

// Igual ao destaque automático de Contratada/Contratante do HTML
// (lib/proposta-html.js) — aplicado por trecho de texto folha, combinável
// com negrito/itálico/cor/sublinhado que o usuário já tenha aplicado.
function emitTextRuns(text, fmt, destaque) {
  if (!text) return [];
  if (!destaque) return [makeRun(text, fmt)];
  const segs = cfg.segmentarComDestaque(text);
  return segs.map(seg => makeRun(seg.text, { ...fmt, bold: fmt.bold || seg.highlight }));
}

function imageRunFromNode(node, anexoMap) {
  const src = node.attribs && node.attribs.src;
  const m = src && ANEXO_URL_RE.exec(src);
  if (!m) return null;
  const anexo = anexoMap && anexoMap[m[1]];
  if (!anexo || !anexo.data) return null;
  let type = 'jpg';
  if (anexo.mimeType) {
    if (anexo.mimeType.includes('png')) type = 'png';
    else if (anexo.mimeType.includes('webp')) type = 'gif'; // docx não tem webp; gif é o fallback usado no resto do arquivo
  }
  const width = parseInt(node.attribs.width, 10) || 300;
  const height = parseInt(node.attribs.height, 10) || Math.round(width * 0.65);
  try {
    return new ImageRun({ data: anexo.data, type, transformation: { width, height } });
  } catch {
    return null; // buffer inválido/corrompido — ignora a imagem, não quebra o parágrafo
  }
}

function inlineRunsFromNodes(nodes, fmt, destaque, anexoMap) {
  const runs = [];
  for (const node of nodes || []) {
    if (node.type === 'text') {
      runs.push(...emitTextRuns(node.data, fmt, destaque));
    } else if (node.type === 'tag') {
      switch (node.name) {
        case 'br':
          runs.push(new TextRun({ text: '', break: 1 }));
          break;
        case 'strong': case 'b':
          runs.push(...inlineRunsFromNodes(node.children, { ...fmt, bold: true }, destaque, anexoMap));
          break;
        case 'em': case 'i':
          runs.push(...inlineRunsFromNodes(node.children, { ...fmt, italic: true }, destaque, anexoMap));
          break;
        case 'u':
          runs.push(...inlineRunsFromNodes(node.children, { ...fmt, underline: true }, destaque, anexoMap));
          break;
        case 'span': {
          const color = extractColorHex(node.attribs && node.attribs.style);
          runs.push(...inlineRunsFromNodes(node.children, color ? { ...fmt, color } : fmt, destaque, anexoMap));
          break;
        }
        case 'img': {
          const run = imageRunFromNode(node, anexoMap);
          if (run) runs.push(run);
          break;
        }
        default:
          runs.push(...inlineRunsFromNodes(node.children, fmt, destaque, anexoMap));
      }
    }
  }
  return runs;
}

function buildTable(node, anexoMap) {
  const rows = [];
  function collectRows(nodes, headerSection) {
    for (const n of nodes || []) {
      if (n.type !== 'tag') continue;
      if (n.name === 'thead' || n.name === 'tbody') { collectRows(n.children, n.name === 'thead'); continue; }
      if (n.name === 'tr') {
        const cells = (n.children || []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
        rows.push(new TableRow({
          children: cells.map(c => {
            const isHeader = headerSection || c.name === 'th';
            return new TableCell({
              shading: isHeader ? { type: ShadingType.SOLID, color: cfg.CORES.TABELA_HEADER, fill: cfg.CORES.TABELA_HEADER } : undefined,
              children: [new Paragraph({ children: inlineRunsFromNodes(c.children, isHeader ? { bold: true, color: 'FFFFFF' } : {}, false, anexoMap) })],
              margins: { top: 70, bottom: 70, left: 100, right: 100 },
            });
          }),
        }));
      }
    }
  }
  collectRows(node.children, false);
  if (!rows.length) return null;
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function blocksFromNodes(nodes, destaque, anexoMap) {
  const blocks = [];
  for (const node of nodes || []) {
    if (node.type !== 'tag') continue;
    if (node.name === 'p') {
      const runs = inlineRunsFromNodes(node.children, {}, destaque, anexoMap);
      if (runs.length) blocks.push(new Paragraph({ children: runs, spacing: { after: 100 } }));
    } else if (node.name === 'ul' || node.name === 'ol') {
      const ordered = node.name === 'ol';
      const items = (node.children || []).filter(n => n.type === 'tag' && n.name === 'li');
      items.forEach((li, i) => {
        const runs = inlineRunsFromNodes(li.children, {}, destaque, anexoMap);
        blocks.push(new Paragraph({
          children: ordered ? [new TextRun(`${i + 1}. `), ...runs] : runs,
          bullet: ordered ? undefined : { level: 0 },
          indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) },
          spacing: { after: 80 },
        }));
      });
    } else if (node.name === 'table') {
      const table = buildTable(node, anexoMap);
      if (table) blocks.push(table);
    } else if (node.name === 'img') {
      const run = imageRunFromNode(node, anexoMap);
      if (run) blocks.push(new Paragraph({ children: [run], alignment: AlignmentType.CENTER, spacing: { after: 100 } }));
    } else {
      const runs = inlineRunsFromNodes(node.children, {}, destaque, anexoMap);
      if (runs.length) blocks.push(new Paragraph({ children: runs }));
    }
  }
  return blocks;
}

/**
 * @param {string} html                HTML já sanitizado (lib/rich-text-sanitize.js).
 * @param {object} [opts]
 * @param {object} [opts.anexoMap]      { [anexoId]: { data: Buffer, mimeType } } — anexos já carregados com binário.
 * @param {boolean} [opts.destaque]     Aplica o negrito automático de Contratada/Contratante.
 * @returns {Array<Paragraph|Table>}
 */
function richTextToDocxParagraphs(html, opts = {}) {
  if (!html) return [];
  const { anexoMap = {}, destaque = false } = opts;
  const nodes = parseRichText(html);
  return blocksFromNodes(nodes, destaque, anexoMap);
}

module.exports = { richTextToDocxParagraphs };
