'use strict';
/**
 * @file Preenche o template OFICIAL Passarelli (assets/rdo-template.xlsx) com os
 * dados de um RDO, preservando todo o layout/estilo. O .xlsx resultante é
 * convertido em PDF idêntico ao modelo por lib/office-convert.js (LibreOffice).
 *
 * Mapa de células espelha o template (grade A–L). Só os valores de DADOS são
 * escritos; rótulos, bordas, cores, merges e fórmulas vêm do template.
 */
const path = require('path');
const ExcelJS = require('exceljs');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'rdo-template.xlsx');
const MAX_FOTOS = 4;
// Área de FOTOS do template: linhas 45–54 (0-based 44–53), 12 colunas.
const FOTO_SLOTS_COL = [0.1, 3.05, 6.05, 9.05]; // 4 slots horizontais (A-C/D-F/G-I/J-L)
const FOTO_ROW = 44.3;        // logo abaixo do cabeçalho "FOTOS" (linha 44)
const FOTO_BOX = { w: 290, h: 225 };

// Lê até 4 fotos do banco (BYTEA) e reduz com jimp; devolve {buf, w, h} já dimensionado.
async function carregarFotos(rdo) {
  const fotos = asArr(rdo.fotos).slice(0, MAX_FOTOS);
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
      if (img.bitmap.width > 600) img.resize({ w: 600 });
      const buf = await img.getBuffer(JimpMime ? JimpMime.jpeg : 'image/jpeg', { quality: 60 });
      out.push({ buf, w: img.bitmap.width, h: img.bitmap.height });
    } catch { /* ignora foto problemática */ }
  }
  return out;
}

function asObj(v, f) { if (v == null) return f; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return f; } } return v; }
function asArr(v) { const o = asObj(v, []); return Array.isArray(o) ? o : []; }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
// Data formatada DD/MM/AAAA como TEXTO — independente do locale do LibreOffice
// (gravar Date renderizava em en-US "M/D/YYYY" no servidor).
function fmtBR(iso) { if (!iso) return ''; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso); }

// Blocos do quadro de efetivo: cada um tem as linhas fixas e as colunas pres/aus.
const MO_BLOCOS = {
  indireta: { nameCol: 'A', presCol: 'B', ausCol: 'C', rows: [17, 18, 19, 20], totalCell: 'B22' },
  direta:   { nameCol: 'D', presCol: 'E', ausCol: 'F', rows: [17, 18, 19, 20], totalCell: 'E22' },
  sub1:     { nameCol: 'G', presCol: 'H', ausCol: 'I', rows: [17, 18, 19, 20, 21], totalCell: 'H22' },
  sub2:     { nameCol: 'J', presCol: 'K', ausCol: 'L', rows: [17], totalCell: 'K22' },
};

// Preenche um conjunto de blocos com os itens (casando cargo → linha fixa).
// Itens não casados entram nas primeiras linhas livres do bloco (que tenham nome
// em branco) — senão são ignorados (o template tem funções fixas).
function fillMOBlocks(ws, blocos, itens) {
  let total = 0;
  // índice nome-normalizado → {bloco, row}
  const idx = new Map();
  for (const b of blocos) {
    for (const r of b.rows) {
      const nome = ws.getCell(b.nameCol + r).value;
      if (nome) idx.set(norm(nome), { b, r });
      ws.getCell(b.presCol + r).value = '-';
      ws.getCell(b.ausCol + r).value = '-';
    }
  }
  const livres = [];
  for (const b of blocos) for (const r of b.rows) { if (!ws.getCell(b.nameCol + r).value) livres.push({ b, r }); }

  for (const it of itens) {
    const cargo = it.cargo || it.empresa || '';
    const qtd = Number(it.qtd) || 0;
    if (!cargo && !qtd) continue;
    let alvo = idx.get(norm(cargo));
    if (!alvo && livres.length) { alvo = livres.shift(); ws.getCell(alvo.b.nameCol + alvo.r).value = cargo; }
    if (!alvo) continue;
    ws.getCell(alvo.b.presCol + alvo.r).value = qtd || '-';
    total += qtd;
  }
  return total;
}

/**
 * @param {object} rdo  row do RDO (camelCase)
 * @param {object} [contract]
 * @returns {Promise<Buffer>}  o .xlsx preenchido (com fotos embutidas)
 */
async function preencherRdoXlsx(rdo, contract = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.worksheets[0];

  const pass    = asObj(rdo.passarelli, {});
  const prazo   = asObj(rdo.prazo, {});
  const _seg     = asObj(rdo.seguranca, {});
  const detalhe = asArr(pass.detalhamentoHorario);
  const moi = asArr(rdo.moi), mod = asArr(rdo.mod), terc = asArr(rdo.terc);
  const atvs = asArr(rdo.atividades);

  const set = (addr, v) => { ws.getCell(addr).value = (v === '' || v == null) ? null : v; };

  // ── Cabeçalho ──
  set('K1', rdo.numero != null ? Number(rdo.numero) || rdo.numero : null);
  set('K3', fmtBR(rdo.data));
  set('K4', rdo.diaSemana || '');

  // ── Identificação ──
  set('B5', rdo.projeto || contract.name || '');
  set('G5', contract.client || '');
  set('J5', fmtBR(prazo.dataInicial || contract.startDate));
  set('B6', pass.pedido || rdo.ordemCompra || '');
  set('G6', pass.subcontratada || 'Rhino Construções e Montagens');
  set('J6', pass.diasCorridos != null ? pass.diasCorridos : (prazo.decorrido != null ? prazo.decorrido : ''));
  set('B7', pass.localizacao || '');
  set('G7', pass.fiscalizacaoNome || '-');

  // ── Efetivo de mão-de-obra (casa cargo → função fixa do template) ──
  const totInd = fillMOBlocks(ws, [MO_BLOCOS.indireta], moi);
  const totDir = fillMOBlocks(ws, [MO_BLOCOS.direta], mod);
  const totSub = fillMOBlocks(ws, [MO_BLOCOS.sub1, MO_BLOCOS.sub2], terc);
  set('B22', totInd); set('E22', totDir); set('H22', totSub); set('K22', 0);

  // ── Detalhamento de horário por função (linhas dinâmicas) ──
  // Template: header=24, dados a partir de 25 (2 linhas), total logo abaixo.
  const DET_START = 25, DET_TEMPLATE_ROWS = 2;
  const n = detalhe.length;
  if (n > DET_TEMPLATE_ROWS) ws.duplicateRow(DET_START, n - DET_TEMPLATE_ROWS, true);
  else if (n < DET_TEMPLATE_ROWS && n >= 1) ws.spliceRows(DET_START + n, DET_TEMPLATE_ROWS - n);
  // (se n === 0, mantém as 2 linhas em branco)
  let totHH = 0;
  detalhe.forEach((l, i) => {
    const r = DET_START + i;
    const horas = l.horaIni && l.horaFim ? `${l.horaIni} às ${l.horaFim}` : (l.horaTrabalho || '');
    const qtdH = Number(l.qtdHoras != null ? l.qtdHoras : l.horas) || 0;
    const ef = Number(l.efetivo) || 0;
    const hh = l.horaTotalHH != null ? Number(l.horaTotalHH) : ef * qtdH;
    set('A' + r, l.funcao || '');
    set('E' + r, horas);
    set('H' + r, qtdH ? qtdH + 'h' : '');
    set('J' + r, ef || 0);
    set('K' + r, hh || 0);
    totHH += hh;
  });
  const totRow = DET_START + Math.max(n, n === 0 ? DET_TEMPLATE_ROWS : n);
  set('K' + totRow, totHH || 0);

  // ── 1. Serviços (texto) ──
  const serv = atvs.map(a => [a.area, a.descricao].filter(Boolean).join(' — ')).filter(Boolean).join('  ·  ');
  if (serv) set('A36', serv);

  // ── Assinaturas (nome + datas) ──
  // `&& false` desabilita de propósito o branch de blanking (mantém assinanteRhino); manter o efeito.
  // eslint-disable-next-line no-constant-condition
  set('B64', pass.fiscalizacaoNome && false ? '' : (contract.assinanteRhino || ''));
  const d = fmtBR(rdo.data);
  set('B65', d); set('F65', d); set('J65', d);

  // ── Fotos (embutidas na área de FOTOS, reduzidas) ──
  const fotos = await carregarFotos(rdo);
  fotos.forEach((f, i) => {
    const scale = Math.min(FOTO_BOX.w / f.w, FOTO_BOX.h / f.h, 1);
    const dw = Math.round(f.w * scale), dh = Math.round(f.h * scale);
    const imgId = wb.addImage({ buffer: f.buf, extension: 'jpeg' });
    ws.addImage(imgId, { tl: { col: FOTO_SLOTS_COL[i], row: FOTO_ROW }, ext: { width: dw, height: dh } });
  });

  return await wb.xlsx.writeBuffer();
}

module.exports = { preencherRdoXlsx };
