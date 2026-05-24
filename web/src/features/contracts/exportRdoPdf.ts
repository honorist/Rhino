/**
 * Exportação de um RDO em PDF (modelo Usiminas) — porte de contrato/rdo-pdf.js.
 * jsPDF carregado via import dinâmico (code-split).
 *
 * SIMPLIFICAÇÕES vs. vanilla: sem logo em imagem (usa texto "RHINO") e sem as
 * páginas de fotos (exigiriam carregar imagens externas via canvas/CORS).
 */
import { CONTRATANTE_NOME } from '../../lib/empresa';
import type { Contract, Rdo } from './types';
import { rdoTotais, type RdoFormData } from './rdoForm';

type Registro = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;

interface ComAutoTable {
  lastAutoTable: { finalY: number };
}

const TEMPO_LABEL: Record<string, string> = {
  bom: 'BOM',
  chuva: 'CHUVA',
  nao_houve: 'NÃO HOUVE',
  sem_expediente: 'S/ EXPEDIENTE',
};
const COND_LABEL: Record<string, string> = {
  operavel: 'OPERÁVEL',
  parcial: 'OP. PARCIAL',
  inoperavel: 'INOPERÁVEL',
};

const fmtData = (d: unknown): string => {
  const s = String(d ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

function parseTempo(raw: unknown): Registro {
  let t = raw;
  for (let i = 0; i < 3 && typeof t === 'string'; i++) {
    try {
      t = JSON.parse(t);
    } catch {
      t = {};
    }
  }
  return t && typeof t === 'object' ? (t as Registro) : {};
}

function periodo(t: Registro, k: string): Registro {
  return (t[k] as Registro) ?? {};
}

/** Gera e baixa o PDF de um RDO. */
export async function exportRdoPdf(rdo: Rdo, contract: Contract): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const finalY = () => (doc as unknown as ComAutoTable).lastAutoTable.finalY;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const contentW = pageW - 2 * margin;
  let y = margin;

  // ── Cabeçalho ──
  const headerH = 16;
  const logoW = 28;
  const rightW = 28;
  const titleX = margin + logoW;
  const titleW = contentW - logoW - rightW;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, logoW, headerH);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('RHINO', margin + logoW / 2, y + headerH / 2 + 1, { align: 'center' });

  doc.setFillColor(240, 240, 240);
  doc.rect(titleX, y, titleW, headerH, 'F');
  doc.rect(titleX, y, titleW, headerH);
  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.text('RELATÓRIO DIÁRIO DE OBRA', titleX + titleW / 2, y + 7, {
    align: 'center',
  });
  doc.setFontSize(10);
  doc.text('RDO', titleX + titleW / 2, y + 12.5, { align: 'center' });

  doc.rect(titleX + titleW, y, rightW, headerH);
  doc.setFontSize(7);
  doc.text('Nº RDO', titleX + titleW + rightW / 2, y + 4, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`#${rdo.numero ?? ''}`, titleX + titleW + rightW / 2, y + 9.5, {
    align: 'center',
  });
  y += headerH;

  // ── Linhas de identificação ──
  const rowH = 7;
  const c1 = contentW * 0.5;
  const c2 = contentW * 0.28;
  const c3 = contentW * 0.22;
  const fit = (txt: unknown, w: number, size: number): string => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(txt || '—'), w - 2);
    return lines[0] + (lines.length > 1 ? '…' : '');
  };
  const linhaIdent = (
    cols: { label: string; valor: unknown; w: number }[],
  ) => {
    let x = margin;
    for (const col of cols) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.rect(x, y, col.w, rowH);
      doc.text(col.label, x + 1, y + 3);
      doc.setFont('helvetica', 'normal');
      doc.text(fit(col.valor, col.w, 9), x + 1, y + 5.8);
      x += col.w;
    }
    y += rowH;
  };
  linhaIdent([
    { label: 'OBRA:', valor: contract.name, w: c1 },
    { label: 'N° DO CONTRATO:', valor: contract.contractNumber, w: c2 },
    { label: 'Nº ORDEM DE SERVIÇO:', valor: rdo.osNumero, w: c3 },
  ]);
  linhaIdent([
    { label: 'PROJETO:', valor: contract.name, w: c1 },
    { label: 'ORDEM DE COMPRA:', valor: rdo.ordemCompra, w: c2 },
    {
      label: 'DATA:',
      valor: `${fmtData(rdo.data)} (${rdo.diaSemana ?? ''})`,
      w: c3,
    },
  ]);
  y += 1;

  // ── Prazo ──
  const prazo = (rdo.prazo ?? {}) as Registro;
  const atraso = n(prazo.atraso);
  doc.setFillColor(230, 230, 240);
  doc.rect(margin, y, contentW, 5, 'F');
  doc.rect(margin, y, contentW, 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text('PRAZO DO CONTRATO', margin + contentW / 2, y + 3.5, {
    align: 'center',
  });
  y += 5;

  const prazoCels = [
    { l: 'DATA INICIAL', v: fmtData(prazo.dataInicial) || '—' },
    { l: 'DATA FINAL', v: fmtData(prazo.dataFinal) || '—' },
    { l: 'TENDÊNCIA', v: fmtData(prazo.dataTendencia) || '—' },
    { l: 'DECORRIDO', v: `${n(prazo.decorrido)} dias` },
    {
      l: atraso > 0 ? 'ATRASO' : 'FALTANTE',
      v: atraso > 0 ? `${atraso} dias` : `${n(prazo.faltante)} dias`,
    },
    { l: '% CONCLUÍDA', v: `${n(prazo.pctConcluida)}%` },
  ];
  const pw = contentW / 3;
  prazoCels.forEach((cel, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = margin + col * pw;
    const cy = y + row * 10;
    doc.rect(cx, cy, pw, 4);
    doc.rect(cx, cy + 4, pw, 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(cel.l, cx + pw / 2, cy + 2.8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(cel.v), cx + pw / 2, cy + 8, { align: 'center' });
  });
  y += 20 + 1;

  // ── Tempo ──
  const tempo = parseTempo(rdo.tempo);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        {
          content: 'TEMPO / CONDIÇÕES DA ÁREA',
          colSpan: 4,
          styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255 },
        },
      ],
      ['PERÍODO', 'TEMPO', 'CONDIÇÕES', 'PRECIP. (mm)'],
    ],
    body: (['manha', 'tarde', 'noiteAnt'] as const).map((k, i) => {
      const p = periodo(tempo, k);
      return [
        ['Manhã', 'Tarde', 'Noite Ant.'][i],
        TEMPO_LABEL[String(p.tempo ?? '')] ?? '—',
        COND_LABEL[String(p.condicoes ?? '')] ?? '—',
        i === 2 ? String(n(tempo.precipitacao)) : '',
      ];
    }),
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'center' },
    headStyles: { fontSize: 7, fillColor: [240, 240, 240], textColor: 0 },
    theme: 'grid',
  });
  y = finalY() + 2;

  // ── Período de trabalho ──
  doc.setTextColor(0);
  doc.rect(margin, y, contentW, 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PERÍODO DE TRABALHO:', margin + 1, y + 3.3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(String(rdo.periodoTrabalho ?? '—'), margin + 42, y + 3.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('HORA EXTRA:', margin + contentW - 40, y + 3.3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(rdo.horaExtra ? 'SIM' : 'NÃO', margin + contentW - 16, y + 3.5);
  y += 6;

  // ── Mão de obra (MOI / MOD / Terceiros) ──
  const moRows = (arr: Registro[], terc: boolean) => {
    const linhas = arr.map((x) => [
      terc
        ? `${x.cargo ?? '—'} (${x.empresa ?? ''})`
        : String(x.cargo ?? '—'),
      String(n(x.qtd ?? x.quantidade)),
    ]);
    const total = arr.reduce((s, x) => s + n(x.qtd ?? x.quantidade), 0);
    linhas.push([
      { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
      { content: String(total), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
    ] as unknown as string[]);
    return linhas;
  };
  const colMo = (contentW - 4) / 3;
  const moBlocos: { titulo: string; arr: Registro[]; terc: boolean }[] = [
    { titulo: 'MÃO DE OBRA INDIRETA', arr: (rdo.moi ?? []) as Registro[], terc: false },
    { titulo: 'MÃO DE OBRA DIRETA', arr: (rdo.mod ?? []) as Registro[], terc: false },
    { titulo: 'TERCEIRIZADOS', arr: (rdo.terc ?? []) as Registro[], terc: true },
  ];
  let moEnd = y;
  moBlocos.forEach((b, i) => {
    autoTable(doc, {
      startY: y,
      margin: { left: margin + i * (colMo + 2) },
      tableWidth: colMo,
      head: [
        [
          {
            content: b.titulo,
            colSpan: 2,
            styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255 },
          },
        ],
        ['CARGO', 'QTD.'],
      ],
      body: moRows(b.arr, b.terc),
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { fontSize: 7, fillColor: [240, 240, 240], textColor: 0 },
      columnStyles: { 1: { cellWidth: 12, halign: 'center' } },
      theme: 'grid',
    });
    moEnd = Math.max(moEnd, finalY());
  });
  y = moEnd + 2;

  // ── Equipamentos ──
  const eqp = (rdo.equipamentos ?? []) as Registro[];
  if (eqp.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          {
            content: 'EQUIPAMENTOS',
            colSpan: 3,
            styles: { halign: 'center', fillColor: [109, 148, 128], textColor: 255 },
          },
        ],
        ['EQUIPAMENTO', 'QTD.', 'HORAS'],
      ],
      body: eqp.map((e) => [
        String(e.nome ?? e.tipo ?? '—'),
        String(n(e.qtd ?? e.quantidade)),
        String(n(e.horasOperando ?? e.horas)),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { fontSize: 7, fillColor: [240, 240, 240], textColor: 0 },
      columnStyles: {
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 20, halign: 'center' },
      },
      theme: 'grid',
    });
    y = finalY() + 2;
  }

  // ── Totais de horas ──
  const totais =
    (rdo.totais as Registro | undefined) ??
    (rdoTotais({
      moi: (rdo.moi ?? []) as RdoFormData['moi'],
      mod: (rdo.mod ?? []) as RdoFormData['mod'],
      terc: (rdo.terc ?? []) as RdoFormData['terc'],
      equipamentos: (rdo.equipamentos ?? []) as RdoFormData['equipamentos'],
    } as RdoFormData) as unknown as Registro);
  doc.setTextColor(0);
  const totH = contentW / 3;
  for (let i = 0; i < 3; i++) {
    doc.setFillColor(240, 240, 240);
    doc.rect(margin + i * totH, y, totH, 6, 'F');
    doc.rect(margin + i * totH, y, totH, 6);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(
    `HOMENS HORA: ${n(totais.homensHora).toFixed(1)}`,
    margin + 2,
    y + 4,
  );
  doc.text(
    `HORAS PARADAS: ${n(totais.horasParadas)}`,
    margin + totH + 2,
    y + 4,
  );
  doc.text(
    `EQUIPAMENTO HORA: ${n(totais.equipamentoHora).toFixed(1)}`,
    margin + 2 * totH + 2,
    y + 4,
  );
  y += 7;

  // ── Atividades ──
  const atividades = (rdo.atividades ?? []) as Registro[];
  if (atividades.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          {
            content: 'DESCRIÇÃO DE ATIVIDADES',
            colSpan: 4,
            styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255 },
          },
        ],
        ['ÁREA', 'DESCRIÇÃO', '% CONCL.', 'OCORRÊNCIAS / ALERTAS'],
      ],
      body: atividades.map((a) => [
        String(a.area ?? '—'),
        String(a.descricao ?? a.nome ?? '—'),
        `${n(a.pctConcluida ?? a.pctExecutado ?? a.pct)}%`,
        String(a.ocorrencias ?? '—'),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.5, valign: 'top' },
      headStyles: { fontSize: 7, fillColor: [240, 240, 240], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { cellWidth: 16, halign: 'center' },
      },
      theme: 'grid',
    });
    y = finalY() + 2;
  }

  // ── Segurança ──
  const seg = (rdo.seguranca ?? {}) as Registro;
  const acid = String(seg.acidente ?? 'nao_houve');
  const chk = (ok: boolean) => (ok ? '[X]' : '[ ]');
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        {
          content: 'SEGURANÇA DO TRABALHO',
          colSpan: 2,
          styles: { halign: 'center', fillColor: [220, 38, 38], textColor: 255 },
        },
      ],
    ],
    body: [
      [
        { content: 'Acidente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } },
        `${chk(acid === 'nao_houve')} Não Houve   ${chk(acid === 'sem_afastamento')} Sem Afastamento   ${chk(acid === 'com_afastamento')} Com Afastamento`,
      ],
      [
        { content: 'Tema do DDS', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } },
        String(seg.temaDds ?? '—'),
      ],
      [
        { content: 'Tema de Meio Ambiente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } },
        String(seg.temaMeioAmbiente ?? '—'),
      ],
      [
        { content: 'Comentários', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } },
        String(seg.comentarios ?? '—'),
      ],
    ],
    styles: { fontSize: 8, cellPadding: 1.8, valign: 'top', overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 42 } },
    theme: 'grid',
  });
  y = finalY() + 2;

  // ── Fiscalização ──
  if (rdo.fiscalizacaoComentarios) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [
        [
          {
            content: 'COMENTÁRIOS DA FISCALIZAÇÃO',
            styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255 },
          },
        ],
      ],
      body: [[rdo.fiscalizacaoComentarios]],
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      theme: 'grid',
    });
    y = finalY() + 2;
  }

  // ── Assinaturas ──
  // US-04: o bloco "CONTRATANTE" é fixo como "Rhino Construções e Montagens".
  // Hardcoded por decisão do cliente — padronização da contratante no doc.
  if (y + 26 > pageH - margin) {
    doc.addPage();
    y = margin;
  }
  doc.setTextColor(0);
  const assinW = contentW / 3;
  const blocos: Array<{ papel: string; nome?: string }> = [
    { papel: 'CONTRATADA' },
    { papel: 'CONTRATANTE', nome: CONTRATANTE_NOME },
    { papel: 'FISCALIZAÇÃO' },
  ];
  blocos.forEach(({ papel, nome }, i) => {
    const ax = margin + i * assinW;
    doc.rect(ax, y, assinW, 20);
    doc.setDrawColor(150);
    doc.line(ax + 5, y + 12, ax + assinW - 5, y + 12);
    doc.setDrawColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(papel, ax + assinW / 2, y + 16, { align: 'center' });
    if (nome) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(nome, ax + assinW / 2, y + 19, { align: 'center' });
    }
  });

  doc.save(`RDO-${rdo.numero ?? ''}-${rdo.data ?? ''}.pdf`);
}
