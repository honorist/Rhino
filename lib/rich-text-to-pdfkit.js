'use strict';
/**
 * Traduz HTML sanitizado (allowlist de lib/rich-text-sanitize.js) em desenhos
 * sobre um `doc` do pdfkit, usado nos campos ricos da Proposta
 * (objetivo/saudação/observações/itens de escopo/obrigações) —
 * lib/proposta-pdf.js chama `renderRichTextPdf(doc, html, opts)` no lugar de
 * `_paraDestaque`/`_bullet` quando o campo já é HTML de verdade.
 *
 * Verificado ao vivo (spike) que o pdfkit tem suporte NATIVO a sublinhado
 * (`doc.text(str, {underline:true})`), incluindo quebra de linha automática
 * — não precisou da medição manual de largura que se imaginava inicialmente.
 *
 * Simplificações aceitas (documentadas, não são bugs):
 *  - Tabela usa colunas de largura igual (mesma simplificação do tradutor
 *    DOCX), com altura de linha dinâmica via `doc.heightOfString`.
 *  - `<br>` força nova linha (novo `doc.text()`), não quebra estritamente no
 *    meio do mesmo parágrafo fluido do pdfkit — visualmente equivalente.
 */
const cfg = require('./proposta-template-config');
const { parseRichText } = require('./rich-text-parse');

const ANEXO_URL_RE = /^\/api\/propostas\/[^/]+\/anexos\/([^/]+)$/;
const CELL_PAD = 5;

// ---- Parte pura: HTML → lista plana de runs formatados (sem pdfkit) ----

function cssColorToHexPdf(v) {
  v = String(v).trim();
  if (/^#[0-9a-fA-F]{3}$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(v);
  if (m) return '#' + [1, 2, 3].map(i => Math.min(255, Number(m[i])).toString(16).padStart(2, '0')).join('');
  return null;
}

function extractColorPdf(style) {
  if (!style) return null;
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  return m ? cssColorToHexPdf(m[1]) : null;
}

/**
 * @returns {Array<{text,bold?,italic?,underline?,color?}|{break:true}|{img:node}>}
 */
function flattenInlineRuns(nodes, fmt, destaque) {
  const runs = [];
  for (const node of nodes || []) {
    if (node.type === 'text') {
      const text = node.data;
      if (!text) continue;
      if (!destaque) {
        runs.push({ text, ...fmt });
      } else {
        cfg.segmentarComDestaque(text).forEach(seg => {
          runs.push({ text: seg.text, ...fmt, bold: fmt.bold || seg.highlight });
        });
      }
    } else if (node.type === 'tag') {
      switch (node.name) {
        case 'br':
          runs.push({ break: true });
          break;
        case 'strong': case 'b':
          runs.push(...flattenInlineRuns(node.children, { ...fmt, bold: true }, destaque));
          break;
        case 'em': case 'i':
          runs.push(...flattenInlineRuns(node.children, { ...fmt, italic: true }, destaque));
          break;
        case 'u':
          runs.push(...flattenInlineRuns(node.children, { ...fmt, underline: true }, destaque));
          break;
        case 'span': {
          const color = extractColorPdf(node.attribs && node.attribs.style);
          runs.push(...flattenInlineRuns(node.children, color ? { ...fmt, color } : fmt, destaque));
          break;
        }
        case 'img':
          runs.push({ img: node });
          break;
        default:
          runs.push(...flattenInlineRuns(node.children, fmt, destaque));
      }
    }
  }
  return runs;
}

// ---- Parte imperativa: desenha runs/blocos no `doc` do pdfkit ----

function fontFor(run) {
  if (run.bold && run.italic) return 'Helvetica-BoldOblique';
  if (run.bold) return 'Helvetica-Bold';
  if (run.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

// Desenha uma sequência de runs (já sem <br>/<img>, ver splitLines) como um
// único parágrafo fluido — cada run muda fonte/cor/sublinhado via
// `continued:true`, igual ao padrão já usado em _paraDestaque/_bullet.
function drawRunLine(doc, runs, { x, y, width, align, fontSize = 10, headerColor } = {}) {
  if (!runs.length) return;
  doc.fontSize(fontSize);
  runs.forEach((run, i) => {
    const last = i === runs.length - 1;
    doc.font(fontFor(run)).fillColor(headerColor || run.color || '#000');
    const opts = { continued: !last, underline: !!run.underline, align: last ? align : undefined };
    if (i === 0 && x !== undefined) {
      // Só a 1ª chamada da cadeia continued: posiciona explicitamente (uso em
      // célula de tabela); as seguintes continuam de onde a anterior parou.
      doc.text(run.text, x, y, { ...opts, width });
    } else {
      doc.text(run.text, opts);
    }
  });
  doc.font('Helvetica').fillColor('#000');
}

function splitLines(runs) {
  const lines = [[]];
  for (const r of runs) {
    if (r.break) lines.push([]);
    else if (!r.img) lines[lines.length - 1].push(r);
  }
  return lines;
}

function drawParagraph(doc, runs, { align = 'justify' } = {}) {
  const lines = splitLines(runs);
  lines.forEach(line => { if (line.length) drawRunLine(doc, line, { align }); });
}

function drawImage(doc, node, anexoMap) {
  const src = node.attribs && node.attribs.src;
  const m = src && ANEXO_URL_RE.exec(src);
  if (!m) return;
  const anexo = anexoMap && anexoMap[m[1]];
  if (!anexo || !anexo.data) return;
  try {
    if (doc.y > 650) doc.addPage();
    const width = Math.min(460, parseInt(node.attribs.width, 10) || 300);
    doc.image(anexo.data, { width, align: 'center' });
    doc.moveDown(0.4);
  } catch (e) {
    console.warn('[rich-text-to-pdfkit] imagem falhou:', e.message);
  }
}

function drawBullet(doc, runs, prefix) {
  if (doc.y > 720) doc.addPage();
  const startX = doc.page.margins.left;
  doc.x = startX;
  const lines = splitLines(runs);
  const first = lines[0] || [];
  doc.fontSize(10).font('Helvetica').fillColor('#000');
  doc.text(prefix, { continued: first.length > 0 });
  drawRunLine(doc, first, {});
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].length) drawRunLine(doc, lines[i], {});
  }
  doc.font('Helvetica').fillColor('#000');
  doc.x = startX;
  doc.moveDown(0.2);
}

function collectTableRows(node) {
  const rows = [];
  function walk(nodes, headerSection) {
    for (const n of nodes || []) {
      if (n.type !== 'tag') continue;
      if (n.name === 'thead' || n.name === 'tbody') { walk(n.children, n.name === 'thead'); continue; }
      if (n.name === 'tr') {
        const cells = (n.children || []).filter(c => c.type === 'tag' && (c.name === 'td' || c.name === 'th'));
        rows.push({ cells: cells.map(c => ({ header: headerSection || c.name === 'th', node: c })) });
      }
    }
  }
  walk(node.children, false);
  return rows;
}

function drawTable(doc, node) {
  const rows = collectTableRows(node);
  if (!rows.length) return;
  const xStart = doc.page.margins.left;
  const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const nCols = Math.max(...rows.map(r => r.cells.length));
  if (nCols === 0) return;
  const colWidth = totalWidth / nCols;
  const headerBg = '#' + cfg.CORES.TABELA_HEADER;

  rows.forEach(row => {
    const cellRuns = row.cells.map(c => flattenInlineRuns(c.node.children, {}, false).filter(r => !r.img && !r.break));
    const isHeader = row.cells.some(c => c.header);
    doc.fontSize(9).font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
    const heights = cellRuns.map(runs => {
      const text = runs.map(r => r.text).join('') || ' ';
      return doc.heightOfString(text, { width: colWidth - CELL_PAD * 2 });
    });
    const rowHeight = Math.max(18, ...heights) + CELL_PAD * 2;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const yRow = doc.y;

    if (isHeader) {
      doc.save();
      doc.rect(xStart, yRow, colWidth * row.cells.length, rowHeight).fill(headerBg);
      doc.restore();
    }
    doc.save();
    doc.strokeColor('#d0d0d0').lineWidth(0.5);
    doc.moveTo(xStart, yRow + rowHeight).lineTo(xStart + colWidth * row.cells.length, yRow + rowHeight).stroke();
    for (let i = 1; i < row.cells.length; i++) {
      doc.moveTo(xStart + colWidth * i, yRow).lineTo(xStart + colWidth * i, yRow + rowHeight).stroke();
    }
    doc.restore();

    row.cells.forEach((cell, i) => {
      const runs = cellRuns[i];
      if (!runs.length) return;
      drawRunLine(doc, runs, {
        x: xStart + colWidth * i + CELL_PAD,
        y: yRow + CELL_PAD,
        width: colWidth - CELL_PAD * 2,
        fontSize: 9,
        headerColor: isHeader ? '#fff' : undefined,
      });
    });
    doc.y = yRow + rowHeight;
    doc.x = xStart;
  });
  doc.fillColor('#000').font('Helvetica').fontSize(10);
  doc.moveDown(0.4);
}

function renderBlocks(doc, nodes, opts) {
  for (const node of nodes || []) {
    if (node.type !== 'tag') continue;
    if (node.name === 'p') {
      const runs = flattenInlineRuns(node.children, {}, opts.destaque);
      const hasText = runs.some(r => !r.img && !r.break && r.text);
      if (hasText) { drawParagraph(doc, runs, { align: opts.align }); doc.moveDown(0.3); }
      runs.filter(r => r.img).forEach(r => drawImage(doc, r.img, opts.anexoMap));
    } else if (node.name === 'ul' || node.name === 'ol') {
      const ordered = node.name === 'ol';
      const items = (node.children || []).filter(n => n.type === 'tag' && n.name === 'li');
      items.forEach((li, i) => {
        const runs = flattenInlineRuns(li.children, {}, opts.destaque);
        drawBullet(doc, runs, ordered ? `${i + 1}. ` : '•  ');
      });
    } else if (node.name === 'table') {
      drawTable(doc, node);
    } else if (node.name === 'img') {
      drawImage(doc, node, opts.anexoMap);
    } else {
      const runs = flattenInlineRuns(node.children, {}, opts.destaque);
      if (runs.some(r => r.text)) drawParagraph(doc, runs, { align: opts.align });
    }
  }
}

/**
 * @param {import('pdfkit')} doc
 * @param {string} html                HTML já sanitizado (lib/rich-text-sanitize.js).
 * @param {object} [opts]
 * @param {object} [opts.anexoMap]      { [anexoId]: { data: Buffer, mimeType } }.
 * @param {boolean} [opts.destaque]     Aplica o negrito automático de Contratada/Contratante.
 * @param {string} [opts.align='justify']
 */
function renderRichTextPdf(doc, html, opts = {}) {
  if (!html) return;
  const { anexoMap = {}, destaque = false, align = 'justify' } = opts;
  const nodes = parseRichText(html);
  renderBlocks(doc, nodes, { anexoMap, destaque, align });
}

module.exports = {
  renderRichTextPdf,
  _internal: { flattenInlineRuns, cssColorToHexPdf, extractColorPdf },
};
