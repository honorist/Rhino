/**
 * Exportação do resumo executivo do contrato em PDF — porte de
 * contrato/export-pdf.js. jsPDF é carregado via import dinâmico (code-split):
 * a lib só entra no bundle quando o usuário exporta.
 */
import type { Contract } from './types';
import type { VisaoGeralData } from './visaoGeral';

/** Registro cru de nota fiscal usado na tabela de BMs. */
interface NfRegistro {
  numero?: unknown;
  dataLimite?: unknown;
  valor?: unknown;
  emitida?: unknown;
}

interface ExportExtra {
  nfsContrato: readonly NfRegistro[];
  tipoLabel: (key: string) => string;
}

/** finalY exposto pelo jspdf-autotable após cada tabela. */
interface ComAutoTable {
  lastAutoTable: { finalY: number };
}

const fmtBRL = (v: unknown): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v) || 0);

const fmtData = (s: unknown): string =>
  s ? new Date(`${String(s)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

/** Gera e baixa o PDF de resumo executivo do contrato. */
export async function exportContractPdf(
  contract: Contract,
  data: VisaoGeralData,
  extra: ExportExtra,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const finalY = () => (pdf as unknown as ComAutoTable).lastAutoTable.finalY;

  // Cabeçalho verde.
  pdf.setFillColor(29, 107, 63);
  pdf.rect(0, 0, 210, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Resumo Executivo do Contrato', 14, 13);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 21);

  let y = 38;
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text(contract.name || 'Contrato', 14, y);
  y += 6;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(`Cliente: ${contract.client || '—'}`, 14, y);
  y += 5;
  if (contract.contractNumber) {
    pdf.text(`Contrato nº: ${contract.contractNumber}`, 14, y);
    y += 5;
  }
  pdf.text(
    `Período: ${fmtData(contract.startDate)} a ${fmtData(contract.endDate)}`,
    14,
    y,
  );
  y += 5;
  pdf.text(`Status: ${(contract.status || '—').toUpperCase()}`, 14, y);
  y += 8;

  pdf.setDrawColor(220, 220, 220);
  pdf.line(14, y, 196, y);
  y += 6;
  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Indicadores Financeiros', 14, y);
  y += 6;

  autoTable(pdf, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: [
      ['Valor do Contrato', fmtBRL(contract.value)],
      ['Já faturado (NFs emitidas)', fmtBRL(data.totalEmitido)],
      ['Total medido (BMs lançadas)', fmtBRL(data.totalMedido)],
      ['Disponível para BM', fmtBRL(data.totalAMedir)],
      ['Total realizado (custos)', fmtBRL(data.totalRealizado)],
      [
        'Resultado parcial',
        `${fmtBRL(data.margemAtual)} (${data.pctMargem.toFixed(1)}% do contrato)`,
      ],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [29, 107, 63],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  y = finalY() + 8;

  const tipos = Object.entries(data.realizadoPorTipo).filter(([, v]) => v > 0);
  if (tipos.length > 0) {
    pdf.setTextColor(20, 20, 20);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Composição do gasto realizado', 14, y);
    autoTable(pdf, {
      startY: y + 4,
      head: [['Categoria', 'Realizado']],
      body: tipos.map(([k, v]) => [extra.tipoLabel(k), fmtBRL(v)]),
      theme: 'striped',
      headStyles: {
        fillColor: [60, 60, 60],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = finalY() + 8;
  }

  if (extra.nfsContrato.length > 0 && y < 240) {
    pdf.setTextColor(20, 20, 20);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Boletins de Medição (${extra.nfsContrato.length})`, 14, y);
    autoTable(pdf, {
      startY: y + 4,
      head: [['Nº BM', 'Data', 'Valor', 'Status']],
      body: extra.nfsContrato.slice(0, 12).map((nf) => [
        String(nf.numero ?? '—'),
        fmtData(nf.dataLimite),
        fmtBRL(nf.valor),
        nf.emitida ? 'Emitida' : 'Rascunho',
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: [60, 60, 60],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
  }

  pdf.setTextColor(150, 150, 150);
  pdf.setFontSize(8);
  pdf.text(`Rhino — Gestão Empresarial · ${contract.name || 'Contrato'}`, 14, 290);

  const nomeArquivo = `Contrato_${(contract.name || 'sem_nome').replace(
    /[^a-zA-Z0-9]+/g,
    '_',
  )}_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(nomeArquivo);
}
