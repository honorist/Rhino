'use strict';
/**
 * @file Gerador de PDF do RDO — reproduz a IDENTIDADE VISUAL do formulário
 * oficial Passarelli (modelo de fornecimento de Homem-Hora), desenhado em
 * PDFKit, e acrescenta as seções próprias do Rhino que o modelo não tem:
 * PRAZO/CRONOGRAMA, EQUIPAMENTOS e SEGURANÇA (com DDS e Meio Ambiente).
 *
 * Espelha o padrão de lib/proposta-pdf.js (Buffer via stream em memória).
 * Entrada: rdo (row camelCase) + contract. Campos JSON são parseados
 * defensivamente (prazo/tempo podem vir como TEXT; demais como JSONB objeto).
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
// Cores da legenda de clima 1–4 (mesma escala do formulário Passarelli).
const CLIMA_CORES = { 1: '#2E7D32', 2: '#F9A825', 3: '#C62828', 4: '#37474F' };

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
      const larg = W - 2 * M;

      const pass    = asObj(rdo.passarelli, {});
      const tempo   = asObj(rdo.tempo, {});
      const prazo   = asObj(rdo.prazo, {});
      const seg     = asObj(rdo.seguranca, {});
      const totais  = asObj(rdo.totais, {});
      const detalhe = (Array.isArray(pass.detalhamentoHorario) ? pass.detalhamentoHorario : [])
        .map(hh.normalizarLinha);
      const moi  = asArr(rdo.moi);
      const mod  = asArr(rdo.mod);
      const terc = asArr(rdo.terc);
      const eqp  = asArr(rdo.equipamentos);
      const atvs = asArr(rdo.atividades);

      let y = M;

      // ── Cabeçalho (logo · título · caixa RDO Nº/Data/Dia) ───────────────
      y = drawHeader(doc, rdo, x0, y, larg);

      // ── Identificação ───────────────────────────────────────────────────
      const info = [
        ['Nome do Projeto', rdo.projeto || contract.name || ''],
        ['Contrato / Cliente', contract.client || ''],
        ['Pedido', pass.pedido || rdo.ordemCompra || ''],
        ['Subcontratada', pass.subcontratada || cfg.EMPRESA.NOME],
        ['Localização', pass.localizacao || ''],
        ['Início do Contrato', cfg.fmtData(prazo.dataInicial || contract.startDate)],
        ['Dias Corridos', String(pass.diasCorridos != null ? pass.diasCorridos : (prazo.decorrido != null ? prazo.decorrido : ''))],
        ['Fiscalização', pass.fiscalizacaoNome || ''],
      ];
      y = drawInfoGrid(doc, info, x0, y, larg, 2);
      y += 6;

      // ── Condições climáticas (legenda colorida + 3 períodos) ────────────
      y = sectionTitle(doc, 'CONDIÇÕES CLIMÁTICAS', x0, y, larg);
      y = drawClima(doc, tempo, x0, y, larg);
      y += 8;

      // ── Informe de efetivo de mão-de-obra (grade 3 blocos) ──────────────
      if (moi.length || mod.length || terc.length) {
        y = ensure(doc, y, 90, M);
        y = sectionTitle(doc, 'INFORME DE EFETIVO DE MÃO-DE-OBRA', x0, y, larg);
        y = drawEfetivoMO(doc, [
          { titulo: 'MÃO-DE-OBRA INDIRETA', rows: moRows(moi),  totLabel: 'TOTAL M.O. INDIRETA' },
          { titulo: 'MÃO-DE-OBRA DIRETA',   rows: moRows(mod),  totLabel: 'TOTAL M.O. DIRETA' },
          { titulo: 'SUBCONTRATADA',        rows: moRows(terc), totLabel: 'TOTAL SUBCONT.' },
        ], x0, y, larg);
        y += 8;
      }

      // ── Detalhamento de horário por função (HH) ─────────────────────────
      y = ensure(doc, y, 60, M);
      y = sectionTitle(doc, 'DETALHAMENTO DE HORÁRIO POR FUNÇÃO', x0, y, larg);
      if (detalhe.length === 0) {
        y = emptyBox(doc, 'SEM EFETIVO — SEM HH PREVISTO', x0, y, larg);
      } else {
        const rows = detalhe.map(l => [
          l.funcao || '', l.horaTrabalho || '', cfg.fmtNum(l.qtdHoras) + 'h',
          String(l.efetivo || 0), cfg.fmtNum(l.horaTotalHH),
        ]);
        const totalHH = totais.totalHomemHora != null ? totais.totalHomemHora : hh.totalHomemHora(detalhe);
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

      // ── Prazo / Cronograma (seção própria do Rhino) ─────────────────────
      if (temPrazo(prazo)) {
        y = ensure(doc, y, 50, M);
        y = sectionTitle(doc, 'PRAZO / CRONOGRAMA', x0, y, larg);
        y = drawPrazo(doc, prazo, x0, y, larg);
        y += 8;
      }

      // ── Equipamentos (seção própria do Rhino) ───────────────────────────
      if (eqp.length) {
        y = ensure(doc, y, 50, M);
        y = sectionTitle(doc, 'EQUIPAMENTOS', x0, y, larg);
        const eqRows = eqp
          .filter(e => (e.tipo || e.nome) || e.qtd)
          .map(e => {
            const q = Number(e.qtd) || 0;
            const h = Number(e.horas != null ? e.horas : e.horasOperando) || 0;
            return [e.tipo || e.nome || '', String(q), cfg.fmtNum(h) + 'h', cfg.fmtNum(q * h)];
          });
        if (eqRows.length) {
          y = drawTable(doc, {
            x: x0, y, larg,
            cols: [{ t: 'Equipamento', w: .52 }, { t: 'Qtd', w: .14, a: 'center' },
                   { t: 'Horas', w: .17, a: 'right' }, { t: 'Eqp × H', w: .17, a: 'right' }],
            rows: eqRows,
          });
          y += 8;
        }
      }

      // ── Segurança, DDS e Meio Ambiente (seção própria do Rhino) ─────────
      y = ensure(doc, y, 80, M);
      y = sectionTitle(doc, 'SEGURANÇA, DDS E MEIO AMBIENTE', x0, y, larg);
      y = drawSeguranca(doc, seg, x0, y, larg);
      y += 8;

      // ── 1. Serviços (atividades do dia, em texto) ───────────────────────
      const servLinhas = atvs
        .map(a => {
          const cab = [a.area, a.descricao].filter(Boolean).join(' — ');
          const pct = a.pctConcluida ? `  (${cfg.fmtNum(a.pctConcluida)}%)` : '';
          return cab ? (cab + pct) : '';
        })
        .filter(Boolean);
      if (servLinhas.length) {
        y = ensure(doc, y, 50, M);
        y = sectionTitle(doc, '1. SERVIÇOS', x0, y, larg);
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5);
        atvs.forEach(a => {
          const cab = [a.area, a.descricao].filter(Boolean).join(' — ');
          if (!cab) return;
          const pct = a.pctConcluida ? `  (${cfg.fmtNum(a.pctConcluida)}%)` : '';
          y = ensure(doc, y, 16, M);
          doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5).text('• ' + cab + pct, x0 + 4, y, { width: larg - 8 });
          y = doc.y + 1;
          if (a.ocorrencias) {
            doc.fillColor(C.CINZA).font('Helvetica').fontSize(7.5).text('   Ocorrências: ' + a.ocorrencias, x0 + 4, y, { width: larg - 8 });
            y = doc.y + 1;
          }
        });
        y += 8;
      }

      // ── Observações (fiscalização) ──────────────────────────────────────
      if (rdo.fiscalizacaoComentarios) {
        y = ensure(doc, y, 40, M);
        y = sectionTitle(doc, 'OBSERVAÇÕES', x0, y, larg);
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5)
          .text(String(rdo.fiscalizacaoComentarios), x0 + 4, y, { width: larg - 8 });
        y = doc.y + 8;
      }

      // ── Fotos (legendas / contagem) ─────────────────────────────────────
      const fotos = asArr(rdo.fotos);
      if (fotos.length) {
        y = ensure(doc, y, 34, M);
        y = sectionTitle(doc, `FOTOS (${fotos.length})`, x0, y, larg);
        const legs = fotos.map(f => f.legenda).filter(Boolean);
        const txt = legs.length
          ? legs.map((l, i) => `${i + 1}. ${l}`).join('   ·   ')
          : `${fotos.length} foto(s) anexada(s) no sistema.`;
        doc.fillColor(C.CINZA).font('Helvetica').fontSize(8).text(txt, x0 + 4, y, { width: larg - 8 });
        y = doc.y + 8;
      }

      // ── Assinaturas (3 colunas) ─────────────────────────────────────────
      y = ensure(doc, y, 80, M);
      y = sectionTitle(doc, 'ASSINATURAS', x0, y, larg);
      y += 26;
      const blocos = [
        { t: 'RHINO CONSTRUÇÕES E MONTAGENS', n: pass.subcontratada || cfg.EMPRESA.NOME },
        { t: (contract.client || 'CONTRATANTE').toUpperCase(),       n: '' },
        { t: 'FISCALIZAÇÃO',                  n: pass.fiscalizacaoNome || '' },
      ];
      const cw = larg / 3;
      blocos.forEach((b, i) => {
        const cx = x0 + i * cw + 12;
        const lw = cw - 24;
        doc.moveTo(cx, y).lineTo(cx + lw, y).strokeColor('#000').lineWidth(0.8).stroke();
        doc.fillColor(C.TEXTO).font('Helvetica-Bold').fontSize(7.5)
          .text(b.t, cx, y + 4, { width: lw, align: 'center' });
        doc.fillColor(C.CINZA).font('Helvetica').fontSize(7.5)
          .text(b.n || ' ', cx, y + 15, { width: lw, align: 'center' })
          .text('Data: ' + cfg.fmtData(rdo.data), cx, y + 26, { width: lw, align: 'center' });
      });

      doc.end();
    } catch (e) { reject(e); }
  });
}

// ── helpers de seção ─────────────────────────────────────────────────────────
function drawHeader(doc, rdo, x0, y, larg) {
  const xR = x0 + larg;
  const boxW = 150, boxH = 48, boxX = xR - boxW;
  const logoPath = fs.existsSync(cfg.LOGO.PATH) ? cfg.LOGO.PATH
    : (fs.existsSync(cfg.LOGO.PATH_FALLBACK) ? cfg.LOGO.PATH_FALLBACK : null);
  if (logoPath) { try { doc.image(logoPath, x0, y, { fit: [86, 42] }); } catch { /* ignora */ } }

  const tX = x0 + 92;
  const tW = boxX - tX - 8;
  doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(15)
    .text('RELATÓRIO DIÁRIO DE OBRA', tX, y + 8, { width: tW, align: 'center' });
  doc.fillColor(C.CINZA).font('Helvetica').fontSize(8)
    .text('Fornecimento de Homem-Hora (HH)', tX, y + 28, { width: tW, align: 'center' });

  doc.rect(boxX, y, boxW, boxH).strokeColor(C.TITULO).lineWidth(1).stroke();
  doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(11)
    .text('RDO Nº ' + (rdo.numero || ''), boxX + 6, y + 5, { width: boxW - 12 });
  doc.fillColor(C.CINZA).font('Helvetica-Bold').fontSize(7).text('DATA', boxX + 6, y + 22);
  doc.fillColor('#000').font('Helvetica').fontSize(8.5)
    .text(cfg.fmtData(rdo.data) || '—', boxX + 48, y + 21, { width: boxW - 54 });
  doc.fillColor(C.CINZA).font('Helvetica-Bold').fontSize(7).text('DIA', boxX + 6, y + 34);
  doc.fillColor('#000').font('Helvetica').fontSize(8.5)
    .text(rdo.diaSemana || '—', boxX + 48, y + 33, { width: boxW - 54 });

  y += boxH + 4;
  doc.moveTo(x0, y).lineTo(xR, y).strokeColor(C.TITULO).lineWidth(1.2).stroke();
  return y + 8;
}

function drawClima(doc, tempo, x0, y, larg) {
  const periodos = [['MANHÃ', tempo.manha], ['TARDE', tempo.tarde], ['NOITE / MADRUGADA', tempo.noiteAnt]];
  const legW = larg * 0.40;
  const perW = (larg - legW) / 3;
  const headH = 22, rowH = 12;
  const blockH = headH + rowH * cfg.CLIMA_LEGENDA.length;

  // header
  doc.rect(x0, y, larg, headH).fill(C.HEADER_BG);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('LEGENDA', x0 + 4, y + 7, { width: legW - 8 });
  periodos.forEach(([nome, p], i) => {
    const cx = x0 + legW + i * perW;
    const hor = p && p.horaIni && p.horaFim ? `${p.horaIni} às ${p.horaFim}` : '';
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(nome, cx + 2, y + 3, { width: perW - 4, align: 'center' });
    if (hor) doc.font('Helvetica').fontSize(6.5).text(hor, cx + 2, y + 13, { width: perW - 4, align: 'center' });
  });

  // linhas da legenda + marcação por período
  let yy = y + headH;
  cfg.CLIMA_LEGENDA.forEach((leg, r) => {
    if (r % 2 === 1) doc.rect(x0, yy, larg, rowH).fill(C.ZEBRA);
    doc.rect(x0 + 4, yy + 2.5, 7, 7).fill(CLIMA_CORES[leg.i] || '#999999');
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(7.5).text(`${leg.i} - ${leg.l}`, x0 + 15, yy + 3, { width: legW - 20 });
    periodos.forEach(([nome, p], i) => {
      const cx = x0 + legW + i * perW;
      if (cfg.climaIndice(p) === leg.i) {
        doc.fillColor(CLIMA_CORES[leg.i] || '#000000').font('Helvetica-Bold').fontSize(10)
          .text('•', cx, yy + 1.5, { width: perW, align: 'center' });
      }
    });
    yy += rowH;
  });

  // bordas (contorno + separadores verticais)
  doc.rect(x0, y, larg, blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  doc.moveTo(x0 + legW, y).lineTo(x0 + legW, y + blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  for (let i = 1; i < 3; i++) {
    const cx = x0 + legW + i * perW;
    doc.moveTo(cx, y).lineTo(cx, y + blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  }
  return y + blockH;
}

function moRows(arr) {
  return (arr || [])
    .filter(e => (e.cargo || e.empresa) || e.qtd)
    .map(e => ({
      desc: e.cargo || e.empresa || '',
      pres: e.qtd != null ? Number(e.qtd) || 0 : 0,
      aus: 0,
    }));
}

function drawEfetivoMO(doc, blocks, x0, y, larg) {
  const n = blocks.length;
  const bw = larg / n;
  const titH = 13, subH = 11, rowH = 11, totH = 12;
  const maxRows = Math.max(1, ...blocks.map(b => b.rows.length));
  const blockH = titH + subH + rowH * maxRows + totH;

  blocks.forEach((b, bi) => {
    const bx = x0 + bi * bw;
    const cDesc = bx, wDesc = bw * 0.58;
    const cPres = bx + bw * 0.58, wPres = bw * 0.21;
    const cAus = bx + bw * 0.79, wAus = bw * 0.21;

    // título do bloco
    doc.rect(bx, y, bw, titH).fill(C.HEADER_BG);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.8).text(b.titulo, bx + 2, y + 3.5, { width: bw - 4, align: 'center' });

    // sub-cabeçalho
    let yy = y + titH;
    doc.rect(bx, yy, bw, subH).fill(C.TOTAL_BG);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.5);
    doc.text('Descrição', cDesc + 3, yy + 2.5, { width: wDesc - 4 });
    doc.text('Pres.', cPres, yy + 2.5, { width: wPres, align: 'center' });
    doc.text('Aus.', cAus, yy + 2.5, { width: wAus, align: 'center' });
    yy += subH;

    // linhas
    let totPres = 0, totAus = 0;
    for (let r = 0; r < maxRows; r++) {
      const row = b.rows[r];
      if (r % 2 === 1) doc.rect(bx, yy, bw, rowH).fill(C.ZEBRA);
      if (row) {
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(6.8);
        doc.text(row.desc, cDesc + 3, yy + 2.5, { width: wDesc - 4, lineBreak: false, ellipsis: true });
        doc.text(row.pres ? String(row.pres) : '-', cPres, yy + 2.5, { width: wPres, align: 'center', lineBreak: false });
        doc.text(row.aus ? String(row.aus) : '-', cAus, yy + 2.5, { width: wAus, align: 'center', lineBreak: false });
        totPres += row.pres; totAus += row.aus;
      }
      yy += rowH;
    }

    // total do bloco
    doc.rect(bx, yy, bw, totH).fill(C.TOTAL_BG);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.3).text(b.totLabel, cDesc + 3, yy + 3, { width: wDesc - 4, lineBreak: false });
    doc.text(String(totPres), cPres, yy + 3, { width: wPres, align: 'center' });
    doc.text(String(totAus), cAus, yy + 3, { width: wAus, align: 'center' });

    doc.rect(bx, y, bw, blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  });
  return y + blockH;
}

function temPrazo(prazo) {
  return !!(prazo && (prazo.dataInicial || prazo.contratual || prazo.decorrido ||
    prazo.faltante || prazo.pctConcluida || prazo.atraso));
}

function drawPrazo(doc, prazo, x0, y, larg) {
  const cells = [
    ['Início', cfg.fmtData(prazo.dataInicial) || '—'],
    ['Contratual', (Number(prazo.contratual) || 0) + ' d'],
    ['Decorrido', (Number(prazo.decorrido) || 0) + ' d'],
    ['Faltante', (Number(prazo.faltante) || 0) + ' d'],
    ['% Concluído', cfg.fmtNum(prazo.pctConcluida || 0) + '%'],
    ['Atraso', (Number(prazo.atraso) || 0) + ' d'],
  ];
  const n = cells.length, cw = larg / n, h = 26;
  cells.forEach(([l, v], i) => {
    const cx = x0 + i * cw;
    if (i % 2 === 1) doc.rect(cx, y, cw, h).fill(C.ZEBRA);
    doc.rect(cx, y, cw, h).strokeColor(C.LINHA).lineWidth(0.5).stroke();
    doc.fillColor(C.CINZA).font('Helvetica-Bold').fontSize(6).text(String(l).toUpperCase(), cx + 2, y + 4, { width: cw - 4, align: 'center' });
    doc.fillColor(C.TEXTO).font('Helvetica-Bold').fontSize(9).text(v, cx + 2, y + 13, { width: cw - 4, align: 'center' });
  });
  return y + h;
}

function drawSeguranca(doc, seg, x0, y, larg) {
  // DDS + Meio Ambiente em destaque (2 caixas)
  const cw = larg / 2, h = 30;
  const boxes = [
    ['TEMA DO DDS (DIÁLOGO DIÁRIO DE SEGURANÇA)', seg.temaDds || '—'],
    ['TEMA DE MEIO AMBIENTE', seg.temaMeioAmbiente || '—'],
  ];
  boxes.forEach(([l, v], i) => {
    const cx = x0 + i * cw;
    doc.rect(cx, y, cw, h).fillAndStroke('#EEF3FA', C.LINHA);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.5).text(l, cx + 5, y + 4, { width: cw - 10 });
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(9).text(String(v), cx + 5, y + 15, { width: cw - 10, lineBreak: false, ellipsis: true });
  });
  y += h + 6;

  const acLabel = { nao_houve: 'Sem acidentes', sem_afastamento: 'Acidente SEM afastamento', com_afastamento: 'Acidente COM afastamento' }[seg.acidente || 'nao_houve'] || (seg.acidente || '—');
  const acCor = seg.acidente === 'com_afastamento' ? '#C62828' : seg.acidente === 'sem_afastamento' ? '#F9A825' : '#2E7D32';
  doc.fillColor(acCor).font('Helvetica-Bold').fontSize(8.5).text('Acidente: ' + acLabel, x0 + 2, y, { width: larg - 4 });
  y = doc.y + 3;
  if (seg.diagnostico) {
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8).text('Diagnóstico: ' + seg.diagnostico, x0 + 2, y, { width: larg - 4 });
    y = doc.y + 2;
  }
  if (seg.comentarios) {
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8).text('Comentários: ' + seg.comentarios, x0 + 2, y, { width: larg - 4 });
    y = doc.y + 2;
  }
  return y;
}

// ── helpers de layout (genéricos) ────────────────────────────────────────────
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

  const drawHead = () => {
    doc.rect(x, y, larg, hH).fill(C.HEADER_BG);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    cols.forEach((c, i) => doc.text(c.t, colX[i] + 4, y + 4.5, { width: cellW(i) - 8, align: c.a || 'left' }));
    y += hH;
  };
  drawHead();

  doc.font('Helvetica').fontSize(8).fillColor(C.TEXTO);
  rows.forEach((r, ri) => {
    if (y + rH > doc.page.height - M) { doc.addPage(); y = M; drawHead(); doc.font('Helvetica').fontSize(8).fillColor(C.TEXTO); }
    if (ri % 2 === 1) doc.rect(x, y, larg, rH).fill(C.ZEBRA);
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8);
    r.forEach((cell, i) => doc.text(String(cell == null ? '' : cell), colX[i] + 4, y + 4, { width: cellW(i) - 8, align: cols[i].a || 'left', lineBreak: false, ellipsis: true }));
    doc.rect(x, y, larg, rH).strokeColor(C.LINHA).lineWidth(0.4).stroke();
    y += rH;
  });

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
