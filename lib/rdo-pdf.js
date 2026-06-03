'use strict';
/**
 * @file Gerador de PDF do RDO (modelo Passarelli / fornecimento de HH).
 * Server-side com pdfkit, formulário DESENHADO no código (sem imagem de fundo).
 * Espelha o padrão de lib/proposta-pdf.js (Buffer via stream em memória).
 *
 * Entrada: rdo (row camelCase) + contract (para Cliente/datas). Campos JSON são
 * parseados defensivamente (prazo/tempo são TEXT; demais são JSONB já-objeto).
 */
const fs = require('fs');
const cfg = require('./rdo-template-config');
const hh = require('./rdo-hh');

let PDFDocument = null;
try { PDFDocument = require('pdfkit'); } catch { /* lib ausente */ }

function isPdfAvailable() { return !!PDFDocument; }

function asObj(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}
function asArr(v) { const o = asObj(v, []); return Array.isArray(o) ? o : []; }

const M = 32;                    // margem
const C = cfg.CORES;

/**
 * @param {object} rdo
 * @param {object} [contract]
 * @returns {Promise<Buffer>}
 */
function gerarRdoPdf(rdo, contract = {}) {
  if (!PDFDocument) throw new Error('Lib `pdfkit` não instalada.');
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true,
        info: { Title: `RDO ${rdo.numero || ''}`, Author: cfg.EMPRESA.NOME } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const x0 = M;
      const xR = W - M;
      const larg = xR - x0;

      const pass = asObj(rdo.passarelli, {});
      const tempo = asObj(rdo.tempo, {});
      const totais = asObj(rdo.totais, {});
      const detalhe = (Array.isArray(pass.detalhamentoHorario) ? pass.detalhamentoHorario : [])
        .map(hh.normalizarLinha);

      let y = M;

      // ── Cabeçalho ───────────────────────────────────────────────────────
      const logoPath = fs.existsSync(cfg.LOGO.PATH) ? cfg.LOGO.PATH
        : (fs.existsSync(cfg.LOGO.PATH_FALLBACK) ? cfg.LOGO.PATH_FALLBACK : null);
      if (logoPath) {
        try { doc.image(logoPath, x0, y, { fit: [90, 38] }); } catch { /* ignora */ }
      }
      doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(15)
        .text('RELATÓRIO DIÁRIO DE OBRA', x0, y + 4, { width: larg, align: 'center' });
      doc.fillColor(C.CINZA).font('Helvetica').fontSize(8.5)
        .text('Fornecimento de Homem-Hora (HH)', x0, y + 22, { width: larg, align: 'center' });
      doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(16)
        .text('RDO Nº ' + (rdo.numero || ''), x0, y + 2, { width: larg, align: 'right' });
      y += 42;
      doc.moveTo(x0, y).lineTo(xR, y).strokeColor(C.TITULO).lineWidth(1.2).stroke();
      y += 8;

      // ── Identificação ───────────────────────────────────────────────────
      const info = [
        ['Nome do Projeto', rdo.projeto || contract.name || ''],
        ['Contrato / Cliente', contract.client || ''],
        ['Pedido', pass.pedido || rdo.ordemCompra || ''],
        ['Subcontratada', pass.subcontratada || cfg.EMPRESA.NOME],
        ['Localização', pass.localizacao || ''],
        ['Início do Contrato', cfg.fmtData(asObj(rdo.prazo, {}).dataInicial || contract.startDate)],
        ['Dias Corridos', String(pass.diasCorridos != null ? pass.diasCorridos : '')],
        ['Fiscalização', pass.fiscalizacaoNome || ''],
        ['Data', cfg.fmtData(rdo.data)],
        ['Dia da Semana', rdo.diaSemana || ''],
      ];
      y = drawInfoGrid(doc, info, x0, y, larg, 2);
      y += 6;

      // ── Condições climáticas ────────────────────────────────────────────
      y = sectionTitle(doc, 'CONDIÇÕES CLIMÁTICAS', x0, y, larg);
      const periodos = [
        ['Manhã', tempo.manha], ['Tarde', tempo.tarde], ['Noite/Madrugada', tempo.noiteAnt],
      ];
      const climaRows = periodos.map(([nome, p]) => {
        const idx = cfg.climaIndice(p);
        const leg = cfg.CLIMA_LEGENDA.find(x => x.i === idx);
        const horario = p && p.horaIni && p.horaFim ? `${p.horaIni} às ${p.horaFim}` : '';
        return [nome, idx === '' ? '—' : String(idx), leg ? leg.l : 'Sem expediente', horario];
      });
      y = drawTable(doc, {
        x: x0, y, larg,
        cols: [{ t: 'Período', w: .22 }, { t: 'Cond.', w: .12, a: 'center' },
               { t: 'Condição climática', w: .40 }, { t: 'Horário', w: .26, a: 'center' }],
        rows: climaRows,
      });
      doc.fillColor(C.CINZA).font('Helvetica').fontSize(7)
        .text('Legenda: ' + cfg.CLIMA_LEGENDA.map(l => `${l.i}-${l.l}`).join('  ·  '), x0, y + 2, { width: larg });
      y += 14;

      // ── Detalhamento de Horário por Função (HH) ─────────────────────────
      y = sectionTitle(doc, 'DETALHAMENTO DE HORÁRIO POR FUNÇÃO', x0, y, larg);
      if (detalhe.length === 0) {
        y = emptyBox(doc, 'SEM EFETIVO — SEM HH PREVISTO', x0, y, larg);
      } else {
        const rows = detalhe.map(l => [
          l.funcao || '', l.horaTrabalho || '', cfg.fmtNum(l.qtdHoras) + 'h',
          String(l.efetivo || 0), cfg.fmtNum(l.horaTotalHH),
        ]);
        const totalHH = totais.totalHomemHora != null
          ? totais.totalHomemHora : hh.totalHomemHora(detalhe);
        y = drawTable(doc, {
          x: x0, y, larg,
          cols: [{ t: 'Função', w: .30 }, { t: 'Hora de Trabalho', w: .30 },
                 { t: 'Qtd Horas', w: .13, a: 'right' }, { t: 'Efetivo', w: .12, a: 'center' },
                 { t: 'Hora Total (HH)', w: .15, a: 'right' }],
          rows,
          total: { label: 'TOTAL DE HOMEM-HORA (HH)', spanCols: 4, value: cfg.fmtNum(totalHH) },
        });
      }
      y += 8;

      // ── Mão de obra (resumo, se houver) ─────────────────────────────────
      const moi = asArr(rdo.moi), mod = asArr(rdo.mod), terc = asArr(rdo.terc);
      if (moi.length || mod.length || terc.length) {
        y = ensure(doc, y, 60, M);
        y = sectionTitle(doc, 'EFETIVO DE MÃO-DE-OBRA', x0, y, larg);
        const moRows = [];
        const push = (cat, arr) => arr.forEach(e => {
          if ((e.cargo || e.empresa) || e.qtd) moRows.push([cat, e.cargo || e.empresa || '', String(e.qtd || 0)]);
        });
        push('Indireta', moi); push('Direta', mod); push('Subcontratada', terc);
        if (moRows.length) {
          y = drawTable(doc, {
            x: x0, y, larg,
            cols: [{ t: 'Categoria', w: .30 }, { t: 'Cargo / Empresa', w: .50 }, { t: 'Qtd', w: .20, a: 'center' }],
            rows: moRows,
          });
          y += 8;
        }
      }

      // ── Observações / Fiscalização ──────────────────────────────────────
      const seg = asObj(rdo.seguranca, {});
      const obs = [rdo.fiscalizacaoComentarios, seg.comentarios].filter(Boolean).join('\n');
      if (obs) {
        y = ensure(doc, y, 50, M);
        y = sectionTitle(doc, 'OBSERVAÇÕES', x0, y, larg);
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(9).text(obs, x0 + 2, y, { width: larg - 4 });
        y = doc.y + 8;
      }

      // ── Assinaturas (rodapé) ────────────────────────────────────────────
      const yAss = Math.max(y + 10, doc.page.height - M - 64);
      const blocos = [
        { t: 'CONTRATADA', n: pass.subcontratada || cfg.EMPRESA.NOME },
        { t: 'CONTRATANTE', n: contract.client || '' },
        { t: 'FISCALIZAÇÃO', n: pass.fiscalizacaoNome || '' },
      ];
      const cw = larg / 3;
      blocos.forEach((b, i) => {
        const cx = x0 + i * cw + 14;
        const lw = cw - 28;
        doc.moveTo(cx, yAss).lineTo(cx + lw, yAss).strokeColor('#000').lineWidth(0.8).stroke();
        doc.fillColor(C.TEXTO).font('Helvetica-Bold').fontSize(8.5)
          .text(b.t, cx, yAss + 5, { width: lw, align: 'center' });
        doc.fillColor(C.CINZA).font('Helvetica').fontSize(8)
          .text(b.n || ' ', cx, yAss + 17, { width: lw, align: 'center' })
          .text('Data: ' + cfg.fmtData(rdo.data), cx, yAss + 29, { width: lw, align: 'center' });
      });

      doc.end();
    } catch (e) { reject(e); }
  });
}

// ── helpers de layout ───────────────────────────────────────────────────────
function ensure(doc, y, need, margin) {
  if (y + need > doc.page.height - margin) { doc.addPage(); return margin; }
  return y;
}
function sectionTitle(doc, txt, x, y, larg) {
  doc.rect(x, y, larg, 16).fill(C.TITULO);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9.5)
    .text(txt, x + 6, y + 4, { width: larg - 12 });
  return y + 16;
}
function emptyBox(doc, txt, x, y, larg) {
  doc.rect(x, y, larg, 30).fillAndStroke('#FBF2F2', '#E7C9C9');
  doc.fillColor('#B5232A').font('Helvetica-Bold').fontSize(11)
    .text(txt, x, y + 9, { width: larg, align: 'center' });
  return y + 30;
}
function drawInfoGrid(doc, pairs, x, y, larg, cols) {
  const cw = larg / cols;
  const rowH = 24;
  for (let i = 0; i < pairs.length; i += cols) {
    for (let c = 0; c < cols; c++) {
      const pair = pairs[i + c];
      if (!pair) continue;
      const cx = x + c * cw;
      doc.rect(cx, y, cw, rowH).strokeColor(C.LINHA).lineWidth(0.6).stroke();
      doc.fillColor(C.CINZA).font('Helvetica-Bold').fontSize(6.5)
        .text(String(pair[0]).toUpperCase(), cx + 5, y + 3, { width: cw - 10 });
      doc.fillColor(C.TEXTO).font('Helvetica').fontSize(9.5)
        .text(pair[1] || '—', cx + 5, y + 11, { width: cw - 10, lineBreak: false, ellipsis: true });
    }
    y += rowH;
  }
  return y;
}
/**
 * Tabela com header colorido, zebra, bordas e (opcional) linha de total.
 * opts: { x, y, larg, cols:[{t,w,a}], rows:[[...]], total?:{label,spanCols,value} }
 */
function drawTable(doc, opts) {
  const { x, larg, cols, rows } = opts;
  let y = opts.y;
  const hH = 16, rH = 15;
  const colX = []; let acc = x;
  for (const c of cols) { colX.push(acc); acc += c.w * larg; }
  const cellW = (i) => cols[i].w * larg;

  // header
  doc.rect(x, y, larg, hH).fill(C.HEADER_BG);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  cols.forEach((c, i) => doc.text(c.t, colX[i] + 4, y + 4.5, { width: cellW(i) - 8, align: c.a || 'left' }));
  y += hH;

  // linhas
  doc.font('Helvetica').fontSize(8).fillColor(C.TEXTO);
  rows.forEach((r, ri) => {
    if (y + rH > doc.page.height - M) {
      doc.addPage(); y = M;
      doc.rect(x, y, larg, hH).fill(C.HEADER_BG);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      cols.forEach((c, i) => doc.text(c.t, colX[i] + 4, y + 4.5, { width: cellW(i) - 8, align: c.a || 'left' }));
      y += hH;
      doc.font('Helvetica').fontSize(8).fillColor(C.TEXTO);
    }
    if (ri % 2 === 1) doc.rect(x, y, larg, rH).fill(C.ZEBRA);
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8);
    r.forEach((cell, i) => doc.text(String(cell == null ? '' : cell), colX[i] + 4, y + 4, { width: cellW(i) - 8, align: cols[i].a || 'left', lineBreak: false, ellipsis: true }));
    doc.rect(x, y, larg, rH).strokeColor(C.LINHA).lineWidth(0.4).stroke();
    y += rH;
  });

  // total
  if (opts.total) {
    doc.rect(x, y, larg, hH).fill(C.TOTAL_BG);
    const spanW = cols.slice(0, opts.total.spanCols).reduce((s, c) => s + c.w * larg, 0);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(9)
      .text(opts.total.label, x + 4, y + 4, { width: spanW - 8, align: 'right' });
    const lastW = cols.slice(opts.total.spanCols).reduce((s, c) => s + c.w * larg, 0);
    doc.text(String(opts.total.value), x + spanW, y + 4, { width: lastW - 6, align: 'right' });
    y += hH;
  }
  return y;
}

module.exports = { gerarRdoPdf, isPdfAvailable };
