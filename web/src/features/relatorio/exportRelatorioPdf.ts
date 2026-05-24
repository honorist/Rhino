/**
 * Geração do Relatório Gerencial em PDF — porte de js/views/Relatorio.js.
 * jsPDF + jspdf-autotable carregados via import dinâmico (code-split).
 *
 * SIMPLIFICAÇÃO vs. vanilla: sem logo PNG (usa texto "RHINO") — evita o
 * passo assíncrono de fetch+canvas e mantém o PDF "letterhead" minimalista.
 */
import type { jsPDF } from 'jspdf';
import type { CellHookData } from 'jspdf-autotable';
import type { Contract } from '../contracts/types';
import type { RelatorioDados } from './calculations';

type RGB = readonly [number, number, number];

const INK: RGB = [17, 24, 39];
const NAVY: RGB = [11, 37, 69];
const GREY_900: RGB = [55, 65, 81];
const GREY_700: RGB = [75, 85, 99];
const GREY_500: RGB = [107, 114, 128];
const GREY_300: RGB = [209, 213, 219];
const PAPER: RGB = [252, 252, 250];
const POS: RGB = [21, 94, 78];
const NEG: RGB = [136, 19, 55];
const WHITE: RGB = [255, 255, 255];

const FONT = 'helvetica';
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 22;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const setFill = (doc: jsPDF, c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
const setText = (doc: jsPDF, c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

/** Converte tupla readonly em mutável (jspdf-autotable exige `[r,g,b]`). */
const mut = (c: RGB): [number, number, number] => [c[0], c[1], c[2]];

const brl = (v: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v) || 0);

const pct = (v: number): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/** Linha segura: ignora coordenadas inválidas (autoTable às vezes passa NaN). */
function hline(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  if (![x1, y1, x2, y2].every(Number.isFinite)) return;
  doc.line(x1, y1, x2, y2);
}

function drawLetterhead(doc: jsPDF, secaoNum: number | null, secaoTit?: string) {
  setText(doc, NAVY);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.text('RHINO', MARGIN, 10);
  doc.setFont(FONT, 'normal');
  setText(doc, GREY_500);
  doc.text('RELATÓRIO GERENCIAL', MARGIN + 18, 10);

  setDraw(doc, NAVY);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 15, PAGE_W - MARGIN, 15);

  if (secaoNum) {
    const txt = `${String(secaoNum).padStart(2, '0')}  ·  ${(secaoTit ?? '').toUpperCase()}`;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    setText(doc, GREY_500);
    doc.text(txt, PAGE_W - MARGIN, 10, { align: 'right' });
  }
  setText(doc, INK);
}

function drawFooter(
  doc: jsPDF,
  pageNum: number,
  totalPages: number | null,
  periodo: string,
) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  setDraw(doc, GREY_300);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  setText(doc, GREY_500);

  doc.text('DOCUMENTO CONFIDENCIAL', MARGIN, PAGE_H - 9);
  doc.text('Sistema Rhino', MARGIN, PAGE_H - 5.5);
  if (periodo) {
    doc.text(periodo, PAGE_W / 2, PAGE_H - 9, { align: 'center' });
  }
  doc.text(`Emitido em ${hoje}`, PAGE_W / 2, PAGE_H - 5.5, {
    align: 'center',
  });
  const pg =
    totalPages != null
      ? `Página ${pageNum} de ${totalPages}`
      : `Página ${pageNum}`;
  doc.text(pg, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });
  setText(doc, INK);
}

function drawSectionTitle(
  doc: jsPDF,
  numero: number,
  titulo: string,
  subtitulo?: string,
  y = 32,
): number {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(28);
  setText(doc, GREY_300);
  doc.text(String(numero).padStart(2, '0'), MARGIN, y);

  doc.setFontSize(16);
  setText(doc, NAVY);
  doc.text(titulo, MARGIN + 18, y - 1);

  if (subtitulo) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    setText(doc, GREY_500);
    doc.text(subtitulo, MARGIN + 18, y + 5);
  }

  setDraw(doc, NAVY);
  doc.setLineWidth(0.6);
  hline(doc, MARGIN, y + 9, MARGIN + 14, y + 9);

  setText(doc, INK);
  return y + 18;
}

function drawKpi(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
  hint: string | null,
  valueColor: RGB = INK,
) {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  setText(doc, GREY_500);
  doc.text(label.toUpperCase(), x, y);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(18);
  setText(doc, valueColor);
  doc.text(value, x, y + 9);

  if (hint) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    setText(doc, GREY_500);
    doc.text(hint, x, y + 15);
  }

  setDraw(doc, GREY_300);
  doc.setLineWidth(0.2);
  hline(doc, x, y + 20, x + w - 6, y + 20);
  setText(doc, INK);
}

function drawParagrafo(doc: jsPDF, texto: string, y: number, size = 10): number {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(size);
  setText(doc, INK);
  const lines = doc.splitTextToSize(texto, CONTENT_W);
  doc.text(lines, MARGIN, y, { lineHeightFactor: 1.5 });
  return y + lines.length * size * 0.45;
}

function gerarNarrativa(d: RelatorioDados): string {
  const partes: string[] = [];
  partes.push(
    `No período analisado, a empresa apresenta ${d.contratosAtivos} contrato(s) em execução, totalizando carteira contratada de ${brl(d.totalContratado)}. O saldo consolidado em caixa é de ${brl(d.saldoCaixa)}${
      d.saldoCaixa >= 0
        ? ', em posição positiva.'
        : ', em posição negativa que requer atenção.'
    }`,
  );
  if (d.margemMedia > 15) {
    partes.push(
      `A margem operacional média situa-se em ${d.margemMedia.toFixed(1)}%, em patamar saudável.`,
    );
  } else if (d.margemMedia > 0) {
    partes.push(
      `A margem operacional média de ${d.margemMedia.toFixed(1)}% encontra-se apertada e merece monitoramento.`,
    );
  } else {
    partes.push(
      `A margem operacional média negativa de ${d.margemMedia.toFixed(1)}% indica que os contratos ativos consomem mais do que o contratado.`,
    );
  }
  if (d.cr5 > 70) {
    partes.push(
      `Há concentração relevante: os 5 maiores contratos respondem por ${d.cr5.toFixed(1)}% da carteira (CR5).`,
    );
  }
  if (d.riscosAlta > 0) {
    partes.push(
      `Foram identificados ${d.riscosAlta} risco(s) classificado(s) como de alta severidade.`,
    );
  }
  return partes.join(' ');
}

function paginaCapa(doc: jsPDF, periodo: string) {
  setFill(doc, PAPER);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  setText(doc, NAVY);
  doc.text('RHINO', MARGIN, 22);
  doc.setFont(FONT, 'normal');
  setText(doc, GREY_500);
  doc.text('GESTÃO EMPRESARIAL', MARGIN + 18, 22);

  setFill(doc, NAVY);
  doc.rect(MARGIN, 60, 1.2, 40, 'F');

  doc.setFont(FONT, 'normal');
  doc.setFontSize(11);
  setText(doc, GREY_500);
  doc.text('RELATÓRIO', MARGIN + 8, 70);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(36);
  setText(doc, INK);
  doc.text('Gerencial', MARGIN + 8, 84);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(14);
  setText(doc, GREY_700);
  doc.text('Análise consolidada da operação', MARGIN + 8, 96);

  setDraw(doc, GREY_300);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 130, PAGE_W - MARGIN, 130);

  const hoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const itens: [string, string][] = [
    ['PERÍODO DE REFERÊNCIA', periodo || 'Acumulado até a data'],
    ['DATA DE EMISSÃO', hoje],
    ['SISTEMA', 'Rhino'],
    ['CLASSIFICAÇÃO', 'Documento Confidencial'],
  ];
  let y = 144;
  for (const [k, v] of itens) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    setText(doc, GREY_500);
    doc.text(k, MARGIN, y);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    setText(doc, INK);
    doc.text(v, MARGIN + 60, y);
    y += 11;
  }
}

function paginaSumario(
  doc: jsPDF,
  secoes: { num: number; titulo: string; pagina: number }[],
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, null);
  let y = drawSectionTitle(doc, 0, 'Sumário', 'Estrutura do documento');

  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  for (const s of secoes) {
    setText(doc, NAVY);
    doc.setFont(FONT, 'bold');
    doc.text(String(s.num).padStart(2, '0'), MARGIN, y);
    doc.setFont(FONT, 'normal');
    setText(doc, INK);
    doc.text(s.titulo, MARGIN + 12, y);
    setText(doc, GREY_500);
    doc.text(String(s.pagina), PAGE_W - MARGIN, y, { align: 'right' });
    y += 9;
  }
  drawFooter(doc, pageNum, null, periodo);
}

function paginaResumo(
  doc: jsPDF,
  d: RelatorioDados,
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 1, 'Sumário Executivo');
  let y = drawSectionTitle(
    doc,
    1,
    'Sumário Executivo',
    'Visão consolidada dos principais indicadores',
  );
  y = drawParagrafo(doc, gerarNarrativa(d), y);
  y += 6;

  const colW = CONTENT_W / 4;
  const saldoColor = d.saldoCaixa >= 0 ? POS : NEG;
  const margemColor = d.margemMedia > 15 ? POS : d.margemMedia > 0 ? GREY_900 : NEG;

  drawKpi(
    doc,
    MARGIN,
    y,
    colW,
    'Saldo em caixa',
    brl(d.saldoCaixa),
    d.varSaldoPct != null ? `${pct(d.varSaldoPct)} vs mês ant.` : null,
    saldoColor,
  );
  drawKpi(
    doc,
    MARGIN + colW,
    y,
    colW,
    'Contratos ativos',
    String(d.contratosAtivos),
    `${d.contratosAtivos} em execução`,
    NAVY,
  );
  drawKpi(
    doc,
    MARGIN + colW * 2,
    y,
    colW,
    'Carteira contratada',
    brl(d.totalContratado),
    'Soma dos contratos ativos',
  );
  drawKpi(
    doc,
    MARGIN + colW * 3,
    y,
    colW,
    'Margem média',
    `${d.margemMedia.toFixed(1)}%`,
    'Média simples dos contratos',
    margemColor,
  );
  y += 30;

  drawKpi(
    doc,
    MARGIN,
    y,
    colW,
    'A receber (NFs)',
    brl(d.totalAReceber),
    `${d.qtdNFsPend} NF(s) pendente(s)`,
  );
  drawKpi(
    doc,
    MARGIN + colW,
    y,
    colW,
    'A pagar (contas)',
    brl(d.totalAPagar),
    `${d.qtdCpPend} conta(s) em aberto`,
  );
  drawKpi(
    doc,
    MARGIN + colW * 2,
    y,
    colW,
    'Faturamento (mês)',
    brl(d.faturamentoMes),
    d.varFatPct != null ? `${pct(d.varFatPct)} vs mês ant.` : null,
    d.varFatPct != null && d.varFatPct >= 0 ? POS : NEG,
  );
  drawKpi(
    doc,
    MARGIN + colW * 3,
    y,
    colW,
    'Runway (caixa)',
    `${d.runwayMeses} meses`,
    'Cobertura do gasto mensal',
  );

  drawFooter(doc, pageNum, null, periodo);
}

/** Estilos comuns das tabelas plain do relatório. */
const TABELA_BASE = {
  theme: 'plain' as const,
  styles: {
    font: FONT,
    fontSize: 9,
    cellPadding: 3,
    textColor: mut(INK),
  },
  headStyles: {
    fillColor: mut(WHITE),
    textColor: mut(GREY_500),
    fontStyle: 'bold' as const,
    fontSize: 7.5,
  },
  margin: { left: MARGIN, right: MARGIN },
};

/** Hook didDrawCell padrão — linha sob o header e separadores no corpo. */
function tabelaLinhas(doc: jsPDF) {
  return (data: CellHookData) => {
    if (data.section === 'head' && data.column.index === 0) {
      const c = data.cell;
      setDraw(doc, NAVY);
      doc.setLineWidth(0.4);
      hline(doc, MARGIN, c.y + c.height, PAGE_W - MARGIN, c.y + c.height);
    }
    if (data.section === 'body' && data.column.index === 0) {
      const c = data.cell;
      setDraw(doc, GREY_300);
      doc.setLineWidth(0.1);
      hline(doc, MARGIN, c.y + c.height, PAGE_W - MARGIN, c.y + c.height);
    }
  };
}

function paginaContratos(
  doc: jsPDF,
  autoTable: (doc: jsPDF, opts: Record<string, unknown>) => void,
  contracts: readonly Contract[],
  saidasMap: Record<string, number>,
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 2, 'Portfólio de Contratos');
  const y = drawSectionTitle(
    doc,
    2,
    'Portfólio de Contratos',
    'Contratos ativos, valores executados e margens',
  );
  const ativos = contracts.filter((c) => c.status === 'ativo');
  const body = ativos.map((c) => {
    const s = saidasMap[c.id] ?? 0;
    const v = Number(c.value) || 0;
    const margemPct = v > 0 ? ((v - s) / v) * 100 : null;
    return [
      (c.name || '—').slice(0, 40),
      (c.client || '—').slice(0, 28),
      brl(v),
      brl(s),
      margemPct != null ? `${margemPct.toFixed(1)}%` : '—',
      c.endDate
        ? new Date(`${c.endDate}T12:00:00`).toLocaleDateString('pt-BR')
        : '—',
    ];
  });

  autoTable(doc, {
    ...TABELA_BASE,
    head: [['Contrato', 'Cliente', 'Valor', 'Executado', 'Margem', 'Término']],
    body: body.length > 0 ? body : [['Sem contratos ativos', '', '', '', '', '']],
    startY: y,
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 38 },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
    didDrawCell: tabelaLinhas(doc),
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 4) {
        const raw = String(data.cell.raw ?? '').replace('%', '');
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) {
          data.cell.styles.textColor = mut(v < 0 ? NEG : v < 10 ? GREY_900 : POS);
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  drawFooter(doc, pageNum, null, periodo);
}

function paginaConcentracao(
  doc: jsPDF,
  autoTable: (doc: jsPDF, opts: Record<string, unknown>) => void,
  conc: RelatorioDados['concentracao'],
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 3, 'Concentração de Receita');
  let y = drawSectionTitle(
    doc,
    3,
    'Concentração de Receita',
    'Top 5 contratos e índice CR5',
  );
  const cr5Color = conc.cr5 > 70 ? NEG : conc.cr5 > 50 ? GREY_900 : POS;
  drawKpi(
    doc,
    MARGIN,
    y,
    60,
    'CR5 — top 5 / carteira',
    `${conc.cr5.toFixed(1)}%`,
    conc.cr5 > 70
      ? 'Concentração elevada (risco)'
      : conc.cr5 > 50
        ? 'Concentração moderada'
        : 'Concentração saudável',
    cr5Color,
  );
  drawKpi(
    doc,
    MARGIN + 75,
    y,
    60,
    'Total de contratos',
    String(conc.totalContratos),
    'Ativos com valor',
  );
  drawKpi(
    doc,
    MARGIN + 130,
    y,
    35,
    'Carteira',
    brl(conc.totalContratado).replace('R$', '').trim(),
    'em R$',
  );
  y += 32;

  const body = conc.top5.map((c, i) => [
    String(i + 1),
    c.nome.slice(0, 45),
    c.cliente.slice(0, 25),
    brl(c.valor),
    `${c.pct.toFixed(1)}%`,
  ]);
  autoTable(doc, {
    ...TABELA_BASE,
    head: [['#', 'Contrato', 'Cliente', 'Valor', '% Carteira']],
    body: body.length > 0 ? body : [['—', 'Sem contratos ativos', '', '', '']],
    startY: y,
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: mut(GREY_500) },
      1: { cellWidth: 70 },
      2: { cellWidth: 40 },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: tabelaLinhas(doc),
  });
  drawFooter(doc, pageNum, null, periodo);
}

function paginaFluxo(
  doc: jsPDF,
  autoTable: (doc: jsPDF, opts: Record<string, unknown>) => void,
  fluxo: RelatorioDados['fluxo'],
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 4, 'Fluxo de Caixa');
  const y = drawSectionTitle(
    doc,
    4,
    'Fluxo de Caixa',
    'Movimentação dos últimos 6 meses',
  );
  const totE = fluxo.reduce((s, m) => s + m.entradas, 0);
  const totS = fluxo.reduce((s, m) => s + m.saidas, 0);
  const body = fluxo.map((m) => [
    m.label,
    brl(m.entradas),
    brl(m.saidas),
    brl(m.entradas - m.saidas),
  ]);
  autoTable(doc, {
    ...TABELA_BASE,
    head: [['Mês', 'Entradas', 'Saídas', 'Saldo do período']],
    body,
    foot: [['Acumulado', brl(totE), brl(totS), brl(totE - totS)]],
    startY: y,
    footStyles: {
      fillColor: mut(WHITE),
      textColor: mut(INK),
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 42, halign: 'right' },
      2: { cellWidth: 42, halign: 'right' },
      3: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: tabelaLinhas(doc),
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 3) {
        const raw = String(data.cell.raw ?? '')
          .replace(/[R$\s.]/g, '')
          .replace(',', '.');
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) {
          data.cell.styles.textColor = mut(v < 0 ? NEG : POS);
        }
      }
    },
  });
  drawFooter(doc, pageNum, null, periodo);
}

function paginaAging(
  doc: jsPDF,
  autoTable: (doc: jsPDF, opts: Record<string, unknown>) => void,
  aging: RelatorioDados['aging'],
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 5, 'Aging — Contas a Receber');
  const y = drawSectionTitle(
    doc,
    5,
    'Aging — Contas a Receber',
    'NFs em aberto por faixa de atraso',
  );
  const body = aging.buckets.map((b) => [
    b.label,
    String(b.qtd),
    brl(b.valor),
    aging.total > 0
      ? `${((b.valor / aging.total) * 100).toFixed(1)}%`
      : '0,0%',
  ]);
  autoTable(doc, {
    ...TABELA_BASE,
    head: [['Faixa', 'NFs', 'Valor', '% do total']],
    body,
    foot: [[
      'Total em aberto',
      String(aging.buckets.reduce((s, b) => s + b.qtd, 0)),
      brl(aging.total),
      '100,0%',
    ]],
    startY: y,
    footStyles: {
      fillColor: mut(WHITE),
      textColor: mut(INK),
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 50, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    didDrawCell: tabelaLinhas(doc),
    didParseCell: (data: CellHookData) => {
      if (
        data.section === 'body' &&
        Array.isArray(data.row.raw) &&
        data.row.raw[0] === 'Vencidas >90d'
      ) {
        data.cell.styles.textColor = mut(NEG);
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  drawFooter(doc, pageNum, null, periodo);
}

function paginaRiscos(
  doc: jsPDF,
  autoTable: (doc: jsPDF, opts: Record<string, unknown>) => void,
  riscos: RelatorioDados['riscos'],
  pageNum: number,
  periodo: string,
) {
  doc.addPage();
  drawLetterhead(doc, 6, 'Riscos e Alertas');
  const y = drawSectionTitle(
    doc,
    6,
    'Riscos e Alertas',
    'Itens que demandam atenção da gestão',
  );
  if (riscos.length === 0) {
    doc.setFont(FONT, 'italic');
    doc.setFontSize(10);
    setText(doc, GREY_500);
    doc.text(
      'Nenhum risco material identificado no período analisado.',
      MARGIN,
      y,
    );
    drawFooter(doc, pageNum, null, periodo);
    return;
  }
  const body = riscos.map((r) => [
    r.sev,
    r.cat,
    r.desc,
    r.impacto > 0 ? brl(r.impacto) : '—',
  ]);
  autoTable(doc, {
    ...TABELA_BASE,
    head: [['Severidade', 'Categoria', 'Descrição', 'Impacto financeiro']],
    body,
    startY: y,
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' },
      1: { cellWidth: 28, textColor: mut(GREY_700) },
      2: { cellWidth: 80 },
      3: { cellWidth: 36, halign: 'right' },
    },
    didDrawCell: tabelaLinhas(doc),
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === 0) {
        const sev = String(data.cell.raw ?? '');
        const cor = sev === 'Alta' ? NEG : sev === 'Média' ? GREY_900 : GREY_500;
        data.cell.styles.textColor = mut(cor);
      }
    },
  });
  drawFooter(doc, pageNum, null, periodo);
}

function paginaNotas(doc: jsPDF, pageNum: number, periodo: string) {
  doc.addPage();
  drawLetterhead(doc, 7, 'Notas Metodológicas');
  let y = drawSectionTitle(
    doc,
    7,
    'Notas Metodológicas',
    'Definições, fórmulas e ressalvas',
  );
  const notas: [string, string][] = [
    [
      'Saldo em caixa',
      'Σ(entradas) − Σ(saídas) sobre todos os lançamentos do módulo Caixa, sem corte de período.',
    ],
    [
      'Margem média',
      'Média aritmética simples das margens dos contratos ativos. Cada contrato pesa igual.',
    ],
    [
      'CR5 (concentração de receita)',
      'Soma do percentual da carteira contratada que os 5 maiores contratos ativos representam. >70% = risco.',
    ],
    [
      'Aging — A receber',
      'NFs em aberto classificadas pelos dias entre a data limite e a data de emissão deste relatório.',
    ],
    [
      'Runway de caixa',
      'Saldo atual ÷ gasto mensal médio dos últimos 90 dias.',
    ],
    [
      'Fonte dos dados',
      'Sistema Rhino — base consolidada na data de emissão. Lançamentos posteriores não estão refletidos.',
    ],
  ];
  for (const [titulo, texto] of notas) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    setText(doc, NAVY);
    doc.text(titulo, MARGIN, y);
    y += 5;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    setText(doc, GREY_700);
    const lines = doc.splitTextToSize(texto, CONTENT_W);
    doc.text(lines, MARGIN, y, { lineHeightFactor: 1.4 });
    y += lines.length * 4.5 + 4;
  }
  drawFooter(doc, pageNum, null, periodo);
}

/** Reescreve os footers com numeração "X de Y" depois de tudo gerado. */
function atualizarNumeracaoTotal(doc: jsPDF, periodo: string) {
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    setFill(doc, WHITE);
    doc.rect(0, PAGE_H - 16, PAGE_W, 16, 'F');
    drawFooter(doc, i - 1, total - 1, periodo);
  }
}

/** Gera e baixa o Relatório Gerencial em PDF. */
export async function exportRelatorioPdf(d: RelatorioDados): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodo = `Acumulado · Posição em ${new Date().toLocaleDateString(
    'pt-BR',
    { day: '2-digit', month: 'short', year: 'numeric' },
  )}`;

  paginaCapa(doc, periodo);

  const secoes = [
    { num: 1, titulo: 'Sumário Executivo', pagina: 3 },
    { num: 2, titulo: 'Portfólio de Contratos', pagina: 4 },
    { num: 3, titulo: 'Concentração de Receita', pagina: 5 },
    { num: 4, titulo: 'Fluxo de Caixa', pagina: 6 },
    { num: 5, titulo: 'Aging — Contas a Receber', pagina: 7 },
    { num: 6, titulo: 'Riscos e Alertas', pagina: 8 },
    { num: 7, titulo: 'Notas Metodológicas', pagina: 9 },
  ];

  paginaSumario(doc, secoes, 1, periodo);
  paginaResumo(doc, d, 2, periodo);
  paginaContratos(doc, autoTable, d.contracts, d.saidasMap, 3, periodo);
  paginaConcentracao(doc, autoTable, d.concentracao, 4, periodo);
  paginaFluxo(doc, autoTable, d.fluxo, 5, periodo);
  paginaAging(doc, autoTable, d.aging, 6, periodo);
  paginaRiscos(doc, autoTable, d.riscos, 7, periodo);
  paginaNotas(doc, 8, periodo);
  atualizarNumeracaoTotal(doc, periodo);

  const nome = `rhino-relatorio-gerencial-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nome);
}

/** Sentinela `unknown` usado nas tabelas — mantém TS satisfeito. */
export const _ContractType: Contract | undefined = undefined;
