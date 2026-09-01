'use strict';
/**
 * @file Gerador de PDF do Data Book de entrega (F20 — fase 2 do item 12, ver
 * handlers/data-book.js). Documento simples desenhado em PDFKit: capa, índice,
 * seção de prontidão (KPIs + pendências) e a punch list como evidência.
 *
 * Reaproveita paleta/logo/formatação de lib/rdo-template-config.js (mesmo
 * padrão visual dos outros PDFs do Rhino) — sem template Excel/background
 * próprio, ao contrário de RDO/Proposta: o data book não tem um formulário
 * OFICIAL externo a replicar, então é desenhado direto.
 */
const fs = require('fs');
const cfg = require('./rdo-template-config');

let PDFDocument = null;
try { PDFDocument = require('pdfkit'); } catch { /* lib ausente */ }

function isPdfAvailable() { return !!PDFDocument; }

const M = 40; // margem
const C = cfg.CORES;

const STATUS_LABEL = { aberto: 'Aberto', em_verificacao: 'Em verificação', verificado: 'Verificado' };

function ensure(doc, need) {
  if (doc.y + need > doc.page.height - M) doc.addPage();
}

function sectionTitle(doc, txt) {
  ensure(doc, 30);
  const larg = doc.page.width - 2 * M;
  doc.rect(M, doc.y, larg, 20).fill(C.TITULO);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
    .text(txt, M + 8, doc.y + 5, { width: larg - 16 });
  doc.y += 8;
  doc.fillColor(C.TEXTO).font('Helvetica').fontSize(10);
}

// Ordem invertida da usada em lib/rdo-pdf.js (que quer LOGO.PATH primeiro):
// LOGO.PATH (logo-rhino.jpg) é um brand mark em retrato (1654×2339) — bom pra
// uma faixa estreita de cabeçalho, mas encolhido demais numa capa larga.
// LOGO.PATH_FALLBACK (logo.png) é o lockup horizontal (8067×3227) — a forma
// certa pra ocupar largura na capa.
function logoPath() {
  if (fs.existsSync(cfg.LOGO.PATH_FALLBACK)) return cfg.LOGO.PATH_FALLBACK;
  if (fs.existsSync(cfg.LOGO.PATH)) return cfg.LOGO.PATH;
  return null;
}

function drawCapa(doc, contract, resumo) {
  const larg = doc.page.width - 2 * M;
  const logo = logoPath();
  doc.y = 60;
  if (logo) {
    try { doc.image(logo, M, doc.y, { fit: [140, 70] }); } catch { /* logo corrompido — segue sem */ }
  }
  doc.y = 160;

  doc.fillColor(C.CINZA).font('Helvetica').fontSize(12).text(cfg.EMPRESA.NOME, M, doc.y, { width: larg, align: 'center' });
  doc.moveDown(1.5);
  doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(28).text('DATA BOOK', M, doc.y, { width: larg, align: 'center' });
  doc.fontSize(14).font('Helvetica').fillColor(C.TEXTO).moveDown(0.5)
    .text('Documentação de entrega da obra', M, doc.y, { width: larg, align: 'center' });
  doc.moveDown(2);

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.TEXTO).text(contract.name || '', M, doc.y, { width: larg, align: 'center' });
  if (contract.client) {
    doc.font('Helvetica').fontSize(12).fillColor(C.CINZA).moveDown(0.3).text(contract.client, M, doc.y, { width: larg, align: 'center' });
  }
  doc.moveDown(2);

  const pronto = resumo.pronto;
  const badgeCor = pronto ? '#0F7B3F' : '#B5232A';
  // Helvetica/WinAnsi (fonte padrão do PDFKit) não tem glifo pra ✓/⚠ — o texto
  // sozinho + cor já comunica o status, sem depender de símbolo fora do WinAnsi.
  const badgeTxt = pronto ? 'OBRA PRONTA PARA ENTREGA' : 'ENTREGA COM PENDÊNCIAS';
  const badgeW = 320, badgeH = 34;
  const badgeX = M + (larg - badgeW) / 2;
  doc.rect(badgeX, doc.y, badgeW, badgeH).fill(badgeCor);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12)
    .text(badgeTxt, badgeX, doc.y + 11, { width: badgeW, align: 'center' });
  doc.y += badgeH + 30;

  doc.fillColor(C.CINZA).font('Helvetica').fontSize(9)
    .text(`Gerado em ${cfg.fmtData(new Date().toISOString())}`, M, doc.page.height - M - 20, { width: larg, align: 'center' });
}

function drawIndice(doc, itens) {
  sectionTitle(doc, 'ÍNDICE');
  doc.moveDown(0.5);
  itens.forEach((t, i) => {
    ensure(doc, 18);
    doc.font('Helvetica').fontSize(11).fillColor(C.TEXTO).text(`${i + 1}. ${t}`, M + 10, doc.y);
    doc.moveDown(0.4);
  });
}

function kpiRow(doc, label, valor) {
  ensure(doc, 16);
  const larg = doc.page.width - 2 * M;
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(C.CINZA).text(label, M, y, { width: larg * 0.6 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.TEXTO).text(String(valor), M + larg * 0.6, y, { width: larg * 0.4, align: 'right' });
  doc.y = y + 16;
}

function drawProntidao(doc, resumo) {
  sectionTitle(doc, 'PRONTIDÃO PARA COMISSIONAMENTO');
  doc.moveDown(0.3);
  kpiRow(doc, 'Itens de punch list', resumo.punch.total);
  kpiRow(doc, 'Verificados', `${resumo.punch.verificados} (${resumo.punch.pctVerificado}%)`);
  kpiRow(doc, 'Em aberto', resumo.punch.abertos);
  kpiRow(doc, 'Avanço físico médio', `${resumo.fisico.execMedio}%`);
  doc.moveDown(0.5);

  if (resumo.pendencias.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#0F7B3F').text('Nenhuma pendência — obra pronta para entrega.', M, doc.y);
  } else {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.TEXTO).text('Pendências:', M, doc.y);
    doc.moveDown(0.3);
    resumo.pendencias.forEach((p) => {
      ensure(doc, 16);
      doc.font('Helvetica').fontSize(10).fillColor('#B5232A').text(`• ${p}`, M + 8, doc.y, { width: doc.page.width - 2 * M - 8 });
      doc.moveDown(0.2);
    });
  }
  doc.moveDown(1);
}

/** Tabela simples com header colorido e zebra (mesmo padrão de lib/rdo-pdf.js). */
function drawTable(doc, cols, rows) {
  const larg = doc.page.width - 2 * M;
  const hH = 18, rH = 16;
  const colX = []; let acc = M;
  for (const c of cols) { colX.push(acc); acc += c.w * larg; }
  const cellW = (i) => cols[i].w * larg;
  // Cada linha usa uma variável `rowY` capturada ANTES de qualquer .text() e
  // reaplicada em doc.y no final — .text() com width pode quebrar em mais de
  // uma linha e empurrar o cursor interno do PDFKit, o que desalinhava a
  // borda/zebra da linha seguinte (elas liam doc.y DEPOIS do texto mutar).
  const drawHead = () => {
    const rowY = doc.y;
    doc.rect(M, rowY, larg, hH).fill(C.HEADER_BG);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
    const yTxt = rowY + 5;
    cols.forEach((c, i) => doc.text(c.t, colX[i] + 4, yTxt, { width: cellW(i) - 8, align: c.a || 'left', lineBreak: false }));
    doc.y = rowY + hH;
  };
  drawHead();
  doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXTO);
  rows.forEach((r, ri) => {
    if (doc.y + rH > doc.page.height - M) { doc.addPage(); doc.y = M; drawHead(); doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXTO); }
    const rowY = doc.y;
    if (ri % 2 === 1) doc.rect(M, rowY, larg, rH).fill(C.ZEBRA);
    doc.fillColor(C.TEXTO);
    const yTxt = rowY + 4;
    r.forEach((val, i) => doc.text(String(val ?? ''), colX[i] + 4, yTxt, { width: cellW(i) - 8, align: cols[i].a || 'left', lineBreak: false }));
    doc.rect(M, rowY, larg, rH).stroke(C.LINHA);
    doc.y = rowY + rH;
  });
}

function drawPunchList(doc, punchItens, recursos) {
  sectionTitle(doc, 'PUNCH LIST — EVIDÊNCIAS');
  doc.moveDown(0.3);
  if (punchItens.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.CINZA).text('Nenhum item de punch list registrado.', M, doc.y);
    return;
  }
  const rows = punchItens.map((it) => {
    const resp = recursos.find((r) => r.id === it.responsavelId);
    return [
      it.titulo || '',
      STATUS_LABEL[it.status] || it.status || '',
      resp ? resp.nome : '—',
      it.prazo ? cfg.fmtData(it.prazo) : '—',
      it.resolvidoEm ? cfg.fmtData(it.resolvidoEm) : '—',
    ];
  });
  drawTable(
    doc,
    [
      { t: 'Item', w: 0.40 },
      { t: 'Status', w: 0.15 },
      { t: 'Responsável', w: 0.20 },
      { t: 'Prazo', w: 0.125, a: 'center' },
      { t: 'Resolvido em', w: 0.125, a: 'center' },
    ],
    rows
  );
}

/**
 * @param {object} contract
 * @param {{punch:object, fisico:object, pronto:boolean, pendencias:string[]}} resumo  saída de lib/data-book.js › prontidao
 * @param {Array<object>} punchItens
 * @param {Array<object>} [recursos]
 * @returns {Promise<Buffer>}
 */
async function gerarDataBookPdf(contract, resumo, punchItens, recursos = []) {
  if (!PDFDocument) throw new Error('Lib `pdfkit` não instalada.');
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', margin: M, bufferPages: true,
        info: { Title: `Data Book — ${contract.name || ''}`, Author: cfg.EMPRESA.NOME },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawCapa(doc, contract, resumo);
      doc.addPage();
      drawIndice(doc, ['Prontidão para comissionamento', 'Punch list — evidências']);
      doc.moveDown(1.5);
      drawProntidao(doc, resumo);
      doc.addPage();
      drawPunchList(doc, punchItens, recursos);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { gerarDataBookPdf, isPdfAvailable };
