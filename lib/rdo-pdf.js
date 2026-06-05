'use strict';
/**
 * @file Gerador de PDF do RDO — reproduz o FORMULÁRIO OFICIAL Passarelli
 * (modelo de fornecimento de Homem-Hora) desenhado em PDFKit, e acrescenta as
 * seções próprias do Rhino: PRAZO/CRONOGRAMA, EQUIPAMENTOS e SEGURANÇA (DDS +
 * Meio Ambiente).
 *
 * Layout numa grade de 12 colunas (A–L), espelhando as mesclagens do template
 * Excel oficial. Cabeçalhos de seção centralizados; identificação "rótulo:valor"
 * inline; efetivo de MO em blocos dinâmicos (cresce conforme preenchido); fotos
 * embutidas (reduzidas com jimp para não pesar).
 *
 * Entrada: rdo (row camelCase) + contract. Campos JSON parseados defensivamente.
 */
const fs = require('fs');
const path = require('path');
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

const M = 30;                    // margem
const C = cfg.CORES;
const CLIMA_CORES = { 1: '#2E7D32', 2: '#F9A825', 3: '#C62828', 4: '#37474F' };
const MAX_FOTOS_PDF = 4;

// Carrega até 4 fotos do banco (BYTEA) e reduz com jimp (≈520px, JPEG q55) para não
// inflar o PDF. Falha numa foto → ignora aquela foto, não derruba o PDF.
async function loadFotoBuffers(rdo) {
  const fotos = asArr(rdo.fotos).slice(0, MAX_FOTOS_PDF);
  if (!fotos.length || !rdo.id) return [];
  let Jimp, JimpMime;
  try { ({ Jimp, JimpMime } = require('jimp')); } catch { return []; }
  const db = require('../db');
  const out = [];
  for (const f of fotos) {
    if (!f || !f.id) continue;
    try {
      const row = await db.getOne('SELECT data FROM rdo_fotos WHERE id = $1', [f.id]);
      if (!row || !row.data) continue;
      const img = await Jimp.read(row.data);
      if (img.bitmap.width > 520) img.resize({ w: 520 });
      const buf = await img.getBuffer(JimpMime ? JimpMime.jpeg : 'image/jpeg', { quality: 55 });
      out.push({ buf, legenda: f.legenda || '' });
    } catch { /* ignora foto problemática */ }
  }
  return out;
}

/**
 * @param {object} rdo
 * @param {object} [contract]
 * @returns {Promise<Buffer>}
 */
async function gerarRdoPdf(rdo, contract = {}) {
  if (!PDFDocument) throw new Error('Lib `pdfkit` não instalada.');
  const fotoBuffers = await loadFotoBuffers(rdo);

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
      // grade de 12 colunas (A–L)
      const colX = (i) => x0 + (i / 12) * larg;
      const colW = (a, b) => ((b - a) / 12) * larg;

      const pass    = asObj(rdo.passarelli, {});
      const tempo   = asObj(rdo.tempo, {});
      const prazo   = asObj(rdo.prazo, {});
      const seg     = asObj(rdo.seguranca, {});
      const totais  = asObj(rdo.totais, {});
      const detalhe = (Array.isArray(pass.detalhamentoHorario) ? pass.detalhamentoHorario : []).map(hh.normalizarLinha);
      const moi  = asArr(rdo.moi);
      const mod  = asArr(rdo.mod);
      const terc = asArr(rdo.terc);
      const eqp  = asArr(rdo.equipamentos);
      const atvs = asArr(rdo.atividades);

      let y = M;

      // ── Cabeçalho ───────────────────────────────────────────────────────
      y = drawHeader(doc, rdo, x0, y, larg, colX, colW);
      y += 4;

      // ── Identificação (rótulo: valor inline, 3 colunas × 3 linhas) ──────
      y = drawIdent(doc, [
        [['Nome do Projeto', rdo.projeto || contract.name || ''], ['Contrato / Cliente', contract.client || ''], ['Início Contrato', cfg.fmtData(prazo.dataInicial || contract.startDate)]],
        [['Pedido', pass.pedido || rdo.ordemCompra || ''], ['Subcontratada', pass.subcontratada || cfg.EMPRESA.NOME], ['Dias Corridos', String(pass.diasCorridos != null ? pass.diasCorridos : (prazo.decorrido != null ? prazo.decorrido : ''))]],
        [['Localização', pass.localizacao || ''], ['Fiscalização', pass.fiscalizacaoNome || ''], ['', '']],
      ], x0, y, larg);
      y += 4;

      // ── Condições climáticas ────────────────────────────────────────────
      y = sectionTitle(doc, 'CONDIÇÕES CLIMÁTICAS', x0, y, larg);
      y = drawClima(doc, tempo, x0, y, larg);
      y += 6;

      // ── Informe de efetivo de mão-de-obra (blocos dinâmicos) ────────────
      y = ensure(doc, y, 70, M);
      y = sectionTitle(doc, 'INFORME DE EFETIVO DE MÃO-DE-OBRA', x0, y, larg);
      y = drawEfetivoMO(doc, [
        { titulo: 'MÃO-DE-OBRA INDIRETA', rows: moRows(moi),  totLabel: 'TOTAL M.O. INDIRETA' },
        { titulo: 'MÃO-DE-OBRA DIRETA',   rows: moRows(mod),  totLabel: 'TOTAL M.O. DIRETA' },
        { titulo: 'SUBCONTRATADA',        rows: moRows(terc), totLabel: 'TOTAL SUBCONT.' },
      ], x0, y, larg);
      y += 6;

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
          cols: [{ t: 'FUNÇÃO', w: .30 }, { t: 'HORA DE TRABALHO', w: .30 },
                 { t: 'QTD HORAS', w: .13, a: 'center' }, { t: 'EFETIVO', w: .12, a: 'center' },
                 { t: 'HORA TOTAL (HH)', w: .15, a: 'center' }],
          rows,
          total: { label: 'TOTAL DE HOMEM-HORA (HH)', spanCols: 4, value: cfg.fmtNum(totalHH) },
        });
      }
      y += 6;

      // ── Efetivo por frente de serviço ───────────────────────────────────
      y = ensure(doc, y, 70, M);
      y = sectionTitle(doc, 'EFETIVO POR FRENTE DE SERVIÇO (Inclui MOD e Subcontratadas)', x0, y, larg);
      y = drawFrente(doc, atvs, x0, y, larg);
      y += 6;

      // ── (Extras Rhino) Prazo / Cronograma ───────────────────────────────
      if (temPrazo(prazo)) {
        y = ensure(doc, y, 50, M);
        y = sectionTitle(doc, 'PRAZO / CRONOGRAMA', x0, y, larg);
        y = drawPrazo(doc, prazo, x0, y, larg);
        y += 6;
      }

      // ── (Extras Rhino) Equipamentos ─────────────────────────────────────
      if (eqp.length) {
        const eqRows = eqp.filter(e => (e.tipo || e.nome) || e.qtd).map(e => {
          const q = Number(e.qtd) || 0;
          const h = Number(e.horas != null ? e.horas : e.horasOperando) || 0;
          return [e.tipo || e.nome || '', String(q), cfg.fmtNum(h) + 'h', cfg.fmtNum(q * h)];
        });
        if (eqRows.length) {
          y = ensure(doc, y, 50, M);
          y = sectionTitle(doc, 'EQUIPAMENTOS', x0, y, larg);
          y = drawTable(doc, {
            x: x0, y, larg,
            cols: [{ t: 'EQUIPAMENTO', w: .52 }, { t: 'QTD', w: .14, a: 'center' },
                   { t: 'HORAS', w: .17, a: 'center' }, { t: 'EQP × H', w: .17, a: 'center' }],
            rows: eqRows,
          });
          y += 6;
        }
      }

      // ── (Extras Rhino) Segurança, DDS e Meio Ambiente ───────────────────
      y = ensure(doc, y, 80, M);
      y = sectionTitle(doc, 'SEGURANÇA, DDS E MEIO AMBIENTE', x0, y, larg);
      y = drawSeguranca(doc, seg, x0, y, larg);
      y += 6;

      // ── 1. Serviços (cabeçalho à esquerda, como no modelo) ──────────────
      y = ensure(doc, y, 40, M);
      y = sectionTitle(doc, '1. SERVIÇOS', x0, y, larg, 'left');
      doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5);
      const servItems = atvs
        .map(a => ({ cab: [a.area, a.descricao].filter(Boolean).join(' — '), pct: a.pctConcluida ? `  (${cfg.fmtNum(a.pctConcluida)}%)` : '', ocor: a.ocorrencias || '' }))
        .filter(it => it.cab);
      if (servItems.length) {
        servItems.forEach(it => {
          y = ensure(doc, y, 16, M);
          doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5).text('• ' + it.cab + it.pct, x0 + 4, y, { width: larg - 8 });
          y = doc.y + 1;
          if (it.ocor) { doc.fillColor(C.CINZA).font('Helvetica').fontSize(7.5).text('   Ocorrências: ' + it.ocor, x0 + 4, y, { width: larg - 8 }); y = doc.y + 1; }
        });
      } else {
        doc.fillColor(C.CINZA).font('Helvetica').fontSize(8.5).text('—', x0 + 4, y, { width: larg - 8 });
        y = doc.y;
      }
      y += 8;

      // ── Fotos (embutidas, reduzidas) ────────────────────────────────────
      if (fotoBuffers.length) {
        y = ensure(doc, y, 40, M);
        y = sectionTitle(doc, `FOTOS (${fotoBuffers.length})`, x0, y, larg);
        y = drawFotos(doc, fotoBuffers, x0, y, larg);
        y += 6;
      }

      // ── Observações ─────────────────────────────────────────────────────
      const obs = [rdo.fiscalizacaoComentarios, seg.comentarios].filter(Boolean).join('\n');
      if (obs) {
        y = ensure(doc, y, 40, M);
        y = sectionTitle(doc, 'OBSERVAÇÕES', x0, y, larg);
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.5).text(String(obs), x0 + 4, y, { width: larg - 8 });
        y = doc.y + 8;
      }

      // ── Assinaturas (3 colunas) ─────────────────────────────────────────
      y = ensure(doc, y, 90, M);
      y = sectionTitle(doc, 'ASSINATURAS', x0, y, larg);
      y = drawAssinaturas(doc, [
        { t: 'RHINO CONSTRUÇÕES E MONTAGENS', n: pass.subcontratada || cfg.EMPRESA.NOME },
        { t: (contract.client || 'CONTRATANTE').toUpperCase(),         n: '' },
        { t: 'FISCALIZAÇÃO',                  n: pass.fiscalizacaoNome || '' },
      ], rdo, x0, y, larg);

      doc.end();
    } catch (e) { reject(e); }
  });
}

// ── seções ───────────────────────────────────────────────────────────────────
function drawHeader(doc, rdo, x0, y, larg, colX, colW) {
  const headH = 50;
  const boxX = colX(9), boxW = colW(9, 12);     // caixa RDO Nº/Data/Dia (col J–L)
  const logoW = colW(0, 1.6);

  // contorno geral do cabeçalho
  doc.rect(x0, y, larg, headH).strokeColor(C.TITULO).lineWidth(1).stroke();

  const logoPath = fs.existsSync(cfg.LOGO.PATH) ? cfg.LOGO.PATH
    : (fs.existsSync(cfg.LOGO.PATH_FALLBACK) ? cfg.LOGO.PATH_FALLBACK : null);
  if (logoPath) { try { doc.image(logoPath, x0 + 4, y + 6, { fit: [logoW, headH - 12] }); } catch { /* ignora */ } }

  const tX = x0 + logoW + 8;
  const tW = boxX - tX - 6;
  doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(16)
    .text('RELATÓRIO DIÁRIO DE OBRA', tX, y + 12, { width: tW, align: 'center' });
  doc.fillColor(C.CINZA).font('Helvetica').fontSize(8)
    .text('Fornecimento de Homem-Hora (HH)', tX, y + 32, { width: tW, align: 'center' });

  // caixa direita: 3 linhas (RDO Nº / Data / Dia), rótulo cinza + valor
  const rows = [
    ['RDO Nº:', String(rdo.numero || ''), true],
    ['DATA:', cfg.fmtData(rdo.data) || '—', false],
    ['DIA SEMANA:', rdo.diaSemana || '—', false],
  ];
  const rH = headH / 3, labW = boxW * 0.46;
  doc.moveTo(boxX, y).lineTo(boxX, y + headH).strokeColor(C.TITULO).lineWidth(1).stroke();
  rows.forEach(([l, v, big], i) => {
    const ry = y + i * rH;
    doc.rect(boxX, ry, labW, rH).fill(C.TOTAL_BG);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(7).text(l, boxX + 3, ry + (rH - 7) / 2, { width: labW - 5 });
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(big ? 12 : 8.5)
      .text(v, boxX + labW + 3, ry + (rH - (big ? 12 : 8.5)) / 2, { width: boxW - labW - 6 });
    if (i > 0) doc.moveTo(boxX, ry).lineTo(boxX + boxW, ry).strokeColor(C.LINHA).lineWidth(0.4).stroke();
  });
  return y + headH;
}

function drawIdent(doc, grid, x0, y, larg) {
  const cw = larg / 3, rowH = 16, labW = cw * 0.40;
  grid.forEach((row) => {
    row.forEach((pair, c) => {
      const cx = x0 + c * cw;
      const [l, v] = pair;
      doc.rect(cx, y, cw, rowH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
      if (l) {
        doc.rect(cx, y, labW, rowH).fill(C.TOTAL_BG);
        doc.rect(cx, y, labW, rowH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
        doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.8).text(String(l) + ':', cx + 3, y + 5, { width: labW - 5 });
        doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8.2).text(v || '—', cx + labW + 4, y + 4.5, { width: cw - labW - 8, lineBreak: false, ellipsis: true });
      }
    });
    y += rowH;
  });
  return y;
}

function drawClima(doc, tempo, x0, y, larg) {
  const periodos = [['MANHÃ', tempo.manha], ['TARDE', tempo.tarde], ['NOITE / MADRUGADA', tempo.noiteAnt]];
  const legW = larg * 0.40, perW = (larg - legW) / 3;
  const headH = 14, rowH = 13;
  const blockH = headH + rowH * cfg.CLIMA_LEGENDA.length;

  // header (4 colunas)
  doc.rect(x0, y, larg, headH).fill(C.HEADER_BG);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
  doc.text('LEGENDA', x0, y + 4, { width: legW, align: 'center' });
  periodos.forEach(([nome], i) => doc.text(nome, x0 + legW + i * perW, y + 4, { width: perW, align: 'center' }));

  let yy = y + headH;
  cfg.CLIMA_LEGENDA.forEach((leg, r) => {
    if (r % 2 === 1) doc.rect(x0, yy, larg, rowH).fill(C.ZEBRA);
    doc.rect(x0 + 4, yy + 3, 8, 7).fill(CLIMA_CORES[leg.i] || '#999999');
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(7.3).text(`${leg.i} - ${leg.l}`, x0 + 16, yy + 3.5, { width: legW - 20 });
    periodos.forEach(([nome, p], i) => {
      const cx = x0 + legW + i * perW;
      if (cfg.climaIndice(p) === leg.i) {
        // realça a condição na cor + mostra o horário de trabalho do período
        doc.rect(cx + 1, yy + 1, perW - 2, rowH - 2).fill(tint(CLIMA_CORES[leg.i]));
        const hor = p && p.horaIni && p.horaFim ? `${p.horaIni} às ${p.horaFim}` : (p && p.horario) || '';
        doc.fillColor('#333').font('Helvetica-Bold').fontSize(7).text(hor || '•', cx, yy + 3.5, { width: perW, align: 'center' });
      }
    });
    yy += rowH;
  });

  doc.rect(x0, y, larg, blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  doc.moveTo(x0 + legW, y).lineTo(x0 + legW, y + blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  for (let i = 1; i < 3; i++) { const cx = x0 + legW + i * perW; doc.moveTo(cx, y).lineTo(cx, y + blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke(); }
  return y + blockH;
}

function moRows(arr) {
  return (arr || [])
    .filter(e => (e.cargo || e.empresa) || e.qtd)
    .map(e => ({ desc: e.cargo || e.empresa || '', pres: e.qtd != null ? Number(e.qtd) || 0 : 0, aus: 0 }));
}

function drawEfetivoMO(doc, blocks, x0, y, larg) {
  const n = blocks.length, bw = larg / n;
  const titH = 13, subH = 11, rowH = 11, totH = 12;
  const maxRows = Math.max(1, ...blocks.map(b => b.rows.length));
  const blockH = titH + subH + rowH * maxRows + totH;

  blocks.forEach((b, bi) => {
    const bx = x0 + bi * bw;
    const cDesc = bx, wDesc = bw * 0.58;
    const cPres = bx + bw * 0.58, wPres = bw * 0.21;
    const cAus = bx + bw * 0.79, wAus = bw * 0.21;

    doc.rect(bx, y, bw, titH).fill(C.HEADER_BG);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.8).text(b.titulo, bx, y + 3.5, { width: bw, align: 'center' });

    let yy = y + titH;
    doc.rect(bx, yy, bw, subH).fill(C.TOTAL_BG);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.5);
    doc.text('Descrição', cDesc + 3, yy + 2.5, { width: wDesc - 4 });
    doc.text('Pres.', cPres, yy + 2.5, { width: wPres, align: 'center' });
    doc.text('Aus.', cAus, yy + 2.5, { width: wAus, align: 'center' });
    yy += subH;

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
      // separadores verticais internos
      doc.moveTo(cPres, yy).lineTo(cPres, yy + rowH).strokeColor(C.LINHA).lineWidth(0.3).stroke();
      doc.moveTo(cAus, yy).lineTo(cAus, yy + rowH).strokeColor(C.LINHA).lineWidth(0.3).stroke();
      yy += rowH;
    }

    doc.rect(bx, yy, bw, totH).fill(C.TOTAL_BG);
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(6.3).text(b.totLabel, cDesc + 3, yy + 3, { width: wDesc - 4, lineBreak: false });
    doc.text(String(totPres), cPres, yy + 3, { width: wPres, align: 'center' });
    doc.text(String(totAus), cAus, yy + 3, { width: wAus, align: 'center' });

    doc.rect(bx, y, bw, blockH).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  });
  return y + blockH;
}

function drawFrente(doc, atvs, x0, y, larg) {
  const pares = 4;                 // 4 colunas "Descrição | MO Dir." (como no modelo)
  const pw = larg / pares;
  const wDesc = pw * 0.74, wMo = pw * 0.26;
  const headH = 12, rowH = 13;

  // itens vindos das atividades (descrição + efetivo direto se houver equipes)
  const itens = (atvs || []).map(a => {
    const membros = (a.equipes || []).reduce((s, eq) => s + ((eq.membros || []).length), 0);
    return { desc: a.area || a.descricao || '', mo: membros || '' };
  }).filter(it => it.desc);
  const nLin = Math.max(3, Math.ceil(itens.length / pares));

  // header
  doc.rect(x0, y, larg, headH).fill(C.HEADER_BG);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.5);
  for (let p = 0; p < pares; p++) {
    const px = x0 + p * pw;
    doc.text(p === 0 ? 'Descrição - TSE' : 'Descrição', px + 3, y + 3, { width: wDesc - 4 });
    doc.text('MO Dir.', px + wDesc, y + 3, { width: wMo, align: 'center' });
  }
  let yy = y + headH;
  for (let r = 0; r < nLin; r++) {
    if (r % 2 === 1) doc.rect(x0, yy, larg, rowH).fill(C.ZEBRA);
    for (let p = 0; p < pares; p++) {
      const px = x0 + p * pw;
      const it = itens[r * pares + p];
      doc.fillColor(C.TEXTO).font('Helvetica').fontSize(7);
      if (it) {
        doc.text(it.desc, px + 3, yy + 3, { width: wDesc - 4, lineBreak: false, ellipsis: true });
        doc.text(it.mo !== '' ? String(it.mo) : '-', px + wDesc, yy + 3, { width: wMo, align: 'center', lineBreak: false });
      } else {
        doc.fillColor(C.CINZA).text('-', px + wDesc, yy + 3, { width: wMo, align: 'center' });
      }
      doc.moveTo(px + wDesc, yy).lineTo(px + wDesc, yy + rowH).strokeColor(C.LINHA).lineWidth(0.3).stroke();
      if (p > 0) doc.moveTo(px, yy).lineTo(px, yy + rowH).strokeColor(C.LINHA).lineWidth(0.3).stroke();
    }
    yy += rowH;
  }
  doc.rect(x0, y, larg, headH + rowH * nLin).strokeColor(C.LINHA).lineWidth(0.5).stroke();
  return y + headH + rowH * nLin;
}

function drawFotos(doc, fotos, x0, y, larg) {
  const cols = 2, gap = 8;
  const cw = (larg - gap * (cols - 1)) / cols;
  const ih = 120, capH = 12, cellH = ih + capH + 6;
  let yy = y;
  fotos.forEach((f, i) => {
    const c = i % cols;
    if (c === 0 && i > 0) yy += cellH;
    yy = ensure(doc, yy, cellH, M);
    const cx = x0 + c * (cw + gap);
    doc.rect(cx, yy, cw, ih).strokeColor(C.LINHA).lineWidth(0.5).stroke();
    try { doc.image(f.buf, cx + 1, yy + 1, { fit: [cw - 2, ih - 2], align: 'center', valign: 'center' }); } catch { /* ignora */ }
    if (f.legenda) {
      doc.fillColor(C.CINZA).font('Helvetica').fontSize(7.5).text(f.legenda, cx, yy + ih + 2, { width: cw, align: 'center', lineBreak: false, ellipsis: true });
    }
  });
  return yy + cellH;
}

function drawAssinaturas(doc, blocos, rdo, x0, y, larg) {
  const cw = larg / 3, espaco = 36;
  // áreas para assinar (bordas)
  blocos.forEach((b, i) => {
    const cx = x0 + i * cw;
    doc.rect(cx, y, cw, espaco + 30).strokeColor(C.LINHA).lineWidth(0.5).stroke();
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(7.5).text(b.t, cx + 4, y + 3, { width: cw - 8, align: 'center' });
    const ly = y + espaco;
    doc.moveTo(cx + 12, ly).lineTo(cx + cw - 12, ly).strokeColor('#000').lineWidth(0.8).stroke();
    doc.fillColor(C.TEXTO).font('Helvetica').fontSize(7.5).text(b.n || ' ', cx + 4, ly + 3, { width: cw - 8, align: 'center', lineBreak: false });
    doc.fillColor(C.CINZA).font('Helvetica').fontSize(7).text('Data: ' + cfg.fmtData(rdo.data), cx + 4, ly + 15, { width: cw - 8, align: 'center' });
  });
  return y + espaco + 30;
}

function temPrazo(prazo) {
  return !!(prazo && (prazo.dataInicial || prazo.contratual || prazo.decorrido || prazo.faltante || prazo.pctConcluida || prazo.atraso));
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
  const cw = larg / 2, h = 30;
  [['TEMA DO DDS (DIÁLOGO DIÁRIO DE SEGURANÇA)', seg.temaDds || '—'], ['TEMA DE MEIO AMBIENTE', seg.temaMeioAmbiente || '—']]
    .forEach(([l, v], i) => {
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
  if (seg.diagnostico) { doc.fillColor(C.TEXTO).font('Helvetica').fontSize(8).text('Diagnóstico: ' + seg.diagnostico, x0 + 2, y, { width: larg - 4 }); y = doc.y + 2; }
  return y;
}

// ── helpers genéricos ────────────────────────────────────────────────────────
function tint(hex) {
  // versão clara da cor (mistura com branco ~75%) para realce de fundo
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#EEF3FA';
  const n = parseInt(m[1], 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * 0.72);
  return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}
function ensure(doc, y, need, margin) {
  if (y + need > doc.page.height - margin) { doc.addPage(); return margin; }
  return y;
}
function sectionTitle(doc, txt, x, y, larg, align) {
  doc.rect(x, y, larg, 15).fill(C.TITULO);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
    .text(txt, x + 6, y + 4, { width: larg - 12, align: align || 'center' });
  return y + 15;
}
function emptyBox(doc, txt, x, y, larg) {
  doc.rect(x, y, larg, 28).fillAndStroke('#FBF2F2', '#E7C9C9');
  doc.fillColor('#B5232A').font('Helvetica-Bold').fontSize(11).text(txt, x, y + 8, { width: larg, align: 'center' });
  return y + 28;
}
/** Tabela com header colorido, zebra, bordas e (opcional) linha de total. */
function drawTable(doc, opts) {
  const { x, larg, cols, rows } = opts;
  let y = opts.y;
  const hH = 15, rH = 14;
  const colX = []; let acc = x;
  for (const c of cols) { colX.push(acc); acc += c.w * larg; }
  const cellW = (i) => cols[i].w * larg;
  const drawHead = () => {
    doc.rect(x, y, larg, hH).fill(C.HEADER_BG);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    cols.forEach((c, i) => doc.text(c.t, colX[i] + 4, y + 4, { width: cellW(i) - 8, align: c.a || 'left' }));
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
    doc.fillColor(C.TITULO).font('Helvetica-Bold').fontSize(9).text(opts.total.label, x + 4, y + 4, { width: spanW - 8, align: 'right' });
    const lastW = cols.slice(opts.total.spanCols).reduce((s, c) => s + c.w * larg, 0);
    doc.text(String(opts.total.value), x + spanW, y + 4, { width: lastW - 6, align: 'center' });
    y += hH;
  }
  return y;
}

module.exports = { gerarRdoPdf, isPdfAvailable };
