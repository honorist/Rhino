/**
 * Boletim de Medição (BM) em PDF — porte de js/bm.js.
 *
 * Modelo CMPC (703-F-CRG-0129 Anexo V) com marca Rhino na contratada.
 * jsPDF/autotable via dynamic import (code-split) — só entram no bundle
 * quando o usuário clica "Gerar BM".
 *
 * Lógica de cálculo separada em bmCalc.ts (testável).
 */
import { bmFileName, calcBm, fmtBRL, fmtPct } from './bmCalc';
import type { Contract } from './types';

/** Item de saída/serviço executado. */
export interface BmSaidaItem {
  description?: string;
  value?: number | string;
  date?: string;
  numeroBm?: string;
}

/** Nota fiscal (mesma forma usada em exportContractPdf). */
export interface BmNf {
  id?: string;
  numero?: string;
  valor?: number | string;
  dataEmissaoReal?: string;
  dataLimite?: string;
  contractId?: string;
}

/** Entrada da emissão do BM. */
export interface BmInput {
  contract: Contract;
  /** Saída principal (a clicada pelo usuário). */
  saida: BmSaidaItem;
  /** NF associada — autoridade do valor quando presente. */
  nf?: BmNf | null;
  /** NFs emitidas anteriormente neste contrato. */
  nfsAnteriores?: readonly BmNf[];
  /** Todas as NFs do contrato em ordem cronológica (até 12 são impressas). */
  nfsContrato?: readonly BmNf[];
  /** Itens (1+) do BM (todas as saídas que entram na mesma NF). */
  saidasDoDia?: readonly BmSaidaItem[];
  /** Nome da contratante p/ rodapé de assinatura. Default: contract.client. */
  empresaCliente?: string;
}

const VERDE: [number, number, number] = [29, 107, 63];
const VERDE_CLARO: [number, number, number] = [230, 242, 235];
const PRETO: [number, number, number] = [20, 20, 20];
const CINZA_ESC: [number, number, number] = [60, 60, 60];
const CINZA: [number, number, number] = [130, 130, 130];
const CINZA_CLARO: [number, number, number] = [235, 235, 235];
const BRANCO: [number, number, number] = [255, 255, 255];
const VERMELHO: [number, number, number] = [180, 0, 0];

/** finalY exposto pelo jspdf-autotable. */
interface ComAutoTable {
  lastAutoTable: { finalY: number };
}

async function loadLogo(): Promise<string | null> {
  try {
    const resp = await fetch('/assets/logo.png');
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Gera e baixa o PDF do Boletim de Medição. */
export async function exportBmPdf(input: BmInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const { contract, saida, nf, nfsAnteriores = [], nfsContrato = [] } = input;
  const itens: readonly BmSaidaItem[] =
    input.saidasDoDia && input.saidasDoDia.length ? input.saidasDoDia : [saida];

  const valorTotal = itens.reduce((s, it) => s + (parseFloat(String(it.value)) || 0), 0);
  const valor = nf ? parseFloat(String(nf.valor)) || 0 : valorTotal;
  const valorAnterior = nfsAnteriores.reduce(
    (s, n) => s + (parseFloat(String(n.valor)) || 0),
    0,
  );
  const totals = calcBm({
    contractValue: Number(contract.value) || 0,
    thisMedicaoValor: valor,
    valorAnterior,
  });

  const osNum = contract.contractNumber || contract.id.slice(-6).toUpperCase();
  const descServico =
    itens.length > 1
      ? `Serviços executados em ${new Date((saida.date ?? '') + 'T12:00:00').toLocaleDateString('pt-BR')} (${itens.length} itens)`
      : saida.description || 'Serviço executado';
  const numBm = nf?.numero || saida.numeroBm || 'BM-001';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const finalY = () => (doc as unknown as ComAutoTable).lastAutoTable.finalY;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const mgn = 10;
  const W = pw - 2 * mgn;
  let y = mgn;

  // ═══════════ Cabeçalho ═══════════
  const logo = await loadLogo();
  const headerH = 22;
  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.3);
  doc.rect(mgn, y, W, headerH);

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', mgn + 2, y + 2, 34, 18);
    } catch (e) {
      console.warn('[BM] addImage logo:', e);
    }
  }

  doc.setTextColor(...PRETO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BOLETIM DE MEDIÇÃO DOS SERVIÇOS', pw / 2, y + 10, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Rhino Manutenções', pw / 2, y + 16, { align: 'center' });

  doc.setFillColor(...VERDE);
  doc.setDrawColor(...VERDE);
  doc.roundedRect(pw - mgn - 34, y + 4, 32, 14, 2, 2, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(9);
  doc.text('Nº DO BM', pw - mgn - 18, y + 8, { align: 'center' });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(String(numBm), pw - mgn - 18, y + 15, { align: 'center' });

  y += headerH + 2;

  // ═══════════ Linha OS ═══════════
  doc.setFillColor(...VERDE);
  doc.rect(mgn, y, W, 8, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`OS ${osNum} — ${(contract.name || '').toUpperCase()}`, mgn + 3, y + 5.5);
  y += 10;

  // ═══════════ Descrição ═══════════
  doc.setFillColor(...VERDE_CLARO);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, W, 6, 'F');
  doc.rect(mgn, y, W, 6);
  doc.setTextColor(...VERDE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIÇÃO DO SERVIÇO', mgn + 2, y + 4);
  y += 6;

  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.2);
  doc.rect(mgn, y, W, 10);
  doc.setTextColor(...CINZA_ESC);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(descServico, W - 4);
  doc.text(descLines.slice(0, 3), mgn + 2, y + 4);
  y += 12;

  // ═══════════ Tabela Contratado na OS ═══════════
  doc.setFillColor(...VERDE_CLARO);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, W, 6, 'F');
  doc.rect(mgn, y, W, 6);
  doc.setTextColor(...VERDE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CONTRATADO NA OS — ORDEM DE SERVIÇO', mgn + 2, y + 4);
  y += 6;

  const linhasItens = itens.map((it, i) => [
    `1.${i + 1}`,
    it.description || 'Serviço',
    'un',
    fmtBRL(it.value || 0),
    '1,00',
    fmtBRL(it.value || 0),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Item', 'Descrição', 'Unid.', 'Valor Unitário', 'Qtd.', 'Valor Total']],
    body: linhasItens,
    foot: [
      [
        { content: 'Subtotal', colSpan: 4, styles: { halign: 'right' } },
        String(itens.length).replace('.', ',') + ',00',
        fmtBRL(valor),
      ],
      [
        {
          content: 'TOTAL CONTRATADO NA OS',
          colSpan: 5,
          styles: { halign: 'right', fontStyle: 'bold' },
        },
        { content: fmtBRL(valor), styles: { fontStyle: 'bold' } },
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: VERDE,
      textColor: BRANCO,
      fontSize: 9,
      halign: 'center',
      fontStyle: 'bold',
      cellPadding: 1.8,
    },
    footStyles: {
      fillColor: CINZA_CLARO,
      textColor: PRETO,
      fontSize: 9,
      cellPadding: 1.8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 1.8,
      textColor: PRETO,
      lineColor: CINZA,
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: mgn, right: mgn },
    tableLineColor: PRETO,
    tableLineWidth: 0.3,
  });
  y = finalY() + 3;

  // ═══════════ Valor cobrado nesta medição ═══════════
  doc.setFillColor(...VERDE);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, W, 12, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('VALOR COBRADO NESTA MEDIÇÃO', mgn + 3, y + 5);
  doc.setFontSize(15);
  doc.text(fmtBRL(valor), pw - mgn - 3, y + 8, { align: 'right' });
  y += 14;

  // ═══════════ Dados Contratuais | Avanço do Projeto ═══════════
  const halfW = W / 2;
  doc.setFillColor(...VERDE_CLARO);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, halfW, 6, 'F');
  doc.rect(mgn, y, halfW, 6);
  doc.rect(mgn + halfW, y, halfW, 6, 'F');
  doc.rect(mgn + halfW, y, halfW, 6);
  doc.setTextColor(...VERDE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS CONTRATUAIS', mgn + 2, y + 4);
  doc.text('AVANÇO DO PROJETO', mgn + halfW + 2, y + 4);
  y += 6;

  const linhas: Array<[string, string, string, string]> = [
    ['VALOR CONTRATUAL', fmtBRL(contract.value || 0), '% Avanço Anterior', fmtPct(totals.pctAnterior)],
    ['VALOR ACUMULADO', fmtBRL(totals.valorAcumulado), '% Avanço do Mês', fmtPct(totals.pctMes)],
    ['SALDO CONTRATUAL', fmtBRL(totals.saldo), '% Avanço Total', fmtPct(totals.pctTotal)],
  ];
  const rowH = 7;
  doc.setDrawColor(...PRETO);
  doc.setLineWidth(0.2);
  linhas.forEach((l, i) => {
    const ry = y + i * rowH;
    doc.rect(mgn, ry, halfW * 0.55, rowH);
    doc.rect(mgn + halfW * 0.55, ry, halfW * 0.45, rowH);
    doc.rect(mgn + halfW, ry, halfW * 0.55, rowH);
    doc.rect(mgn + halfW + halfW * 0.55, ry, halfW * 0.45, rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PRETO);
    doc.text(l[0], mgn + 2, ry + 4.5);
    doc.text(l[2], mgn + halfW + 2, ry + 4.5);

    doc.setFont('helvetica', 'bold');
    const corValor: [number, number, number] =
      i === 2 && totals.saldo <= 0 ? VERMELHO : i === 2 ? VERDE : PRETO;
    doc.setTextColor(...corValor);
    doc.text(l[1], mgn + halfW - 2, ry + 4.5, { align: 'right' });
    const corPct: [number, number, number] = i === 2 ? VERDE : PRETO;
    doc.setTextColor(...corPct);
    doc.text(l[3], mgn + W - 2, ry + 4.5, { align: 'right' });
  });
  y += linhas.length * rowH + 3;

  // ═══════════ Acompanhamento por Medição ═══════════
  doc.setFillColor(...VERDE_CLARO);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, W, 6, 'F');
  doc.rect(mgn, y, W, 6);
  doc.setTextColor(...VERDE);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('ACOMPANHAMENTO POR MEDIÇÃO', mgn + 2, y + 4);
  y += 6;

  const colsPorLinha = 4;
  const linhasMed = 3;
  const cellW = W / colsPorLinha;
  const medRowH = 12;
  doc.setLineWidth(0.2);
  doc.setDrawColor(...PRETO);
  for (let r = 0; r < linhasMed; r++) {
    for (let c = 0; c < colsPorLinha; c++) {
      const idx = r * colsPorLinha + c;
      const x = mgn + c * cellW;
      const ry = y + r * medRowH;
      const medNum = String(idx + 1).padStart(2, '0');
      const nfDoMes = nfsContrato[idx];

      doc.rect(x, ry, cellW, medRowH);
      doc.setFillColor(...CINZA_CLARO);
      doc.rect(x, ry, 18, medRowH, 'F');
      doc.rect(x, ry, 18, medRowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...PRETO);
      doc.text(`MED ${medNum}`, x + 9, ry + medRowH / 2 + 1, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      if (nfDoMes) {
        doc.text(fmtBRL(nfDoMes.valor || 0), x + 20, ry + 5);
        if (nfDoMes.dataEmissaoReal) {
          doc.setTextColor(...CINZA);
          const d = new Date(nfDoMes.dataEmissaoReal + 'T12:00:00').toLocaleDateString('pt-BR');
          doc.text(d, x + 20, ry + 9);
        }
      } else {
        doc.setTextColor(...CINZA);
        doc.text('—', x + 20, ry + medRowH / 2 + 1);
      }
    }
  }
  y += linhasMed * medRowH + 6;

  // ═══════════ Aprovações ═══════════
  if (y > ph - 60) {
    doc.addPage();
    y = mgn + 5;
  }
  doc.setFillColor(...VERDE);
  doc.setDrawColor(...VERDE);
  doc.rect(mgn, y, W, 7, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('APROVAÇÕES', mgn + 3, y + 5);
  y += 12;

  const colW = (W - 4) / 2;
  const empresaCliente = (input.empresaCliente || contract.client || 'CONTRATANTE').toUpperCase();
  const aprovacoes = [
    { titulo: 'CONTRATADA', subt: 'Gestor / Rhino Manutenções' },
    { titulo: `${empresaCliente} — FISCAL`, subt: 'Fiscal do Contrato' },
  ];
  aprovacoes.forEach((a, i) => {
    const x = mgn + i * (colW + 4);
    doc.setDrawColor(...PRETO);
    doc.setLineWidth(0.2);
    doc.rect(x, y, colW, 34);
    doc.setTextColor(...PRETO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(a.titulo, x + 3, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_ESC);
    doc.text(a.subt, x + 3, y + 9);
    doc.setDrawColor(...CINZA);
    doc.line(x + 6, y + 25, x + colW - 6, y + 25);
    doc.setFontSize(8);
    doc.setTextColor(...CINZA);
    doc.text('Assinatura', x + colW / 2, y + 29, { align: 'center' });
    doc.text('Data: ___/___/______', x + colW / 2, y + 32, { align: 'center' });
  });
  y += 38;

  // ═══════════ Rodapé ═══════════
  const total = doc.internal.pages.length - 1; // jsPDF começa em 1
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    doc.text(
      `Gerado por Rhino em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR').slice(0, 5)}`,
      mgn,
      ph - 5,
    );
    doc.text(`Pág. ${i}/${total}`, pw - mgn, ph - 5, { align: 'right' });
  }

  doc.save(bmFileName(String(numBm), contract.name, saida.date));
}
