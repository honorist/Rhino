/**
 * @file Gerador de DOCX timbrado da Proposta Comercial Rhino.
 *
 * Reproduz fielmente o padrão dos 10 modelos atuais:
 *  - Logo no header (canto sup. esquerdo)
 *  - "Três Lagoas, DD de mês de AAAA" na direita superior
 *  - Caixa "PROPOSTA COMERCIAL — PC_NN-AA — Rev.NN"
 *  - 16 seções na ordem fixa (Destinatário, Saudação, Objetivo, Imagens, Escopo,
 *    Exclusões, Obrigações Contratada/Contratante, Cronograma, Investimento HH/Material,
 *    Condições Pagto, Prazo, Garantia, Validade, Comunicação, Anexos, Assinatura)
 *  - Footer com contato + numeração de página
 *  - Tipografia: Trebuchet MS bold #1F497D títulos, Arial corpo, tabelas #4F81BD header
 *
 * Lib `docx` precisa estar instalada (`npm install docx`). Se falhar o require,
 * o handler retorna 500 com mensagem explicativa.
 */
const fs = require('fs');
const cfg = require('./proposta-template-config');

let docxLib = null;
try { docxLib = require('docx'); } catch { /* lib não instalada — handler trata */ }

function isDocxAvailable() { return !!docxLib; }

/**
 * Gera Buffer de DOCX para a proposta.
 *
 * @param {object} p  Proposta completa com anexos (com .data binário p/ imagens, opcional).
 * @returns {Promise<Buffer>}
 */
async function gerarDocx(p) {
  if (!docxLib) throw new Error('Lib `docx` não instalada. Rode `npm install docx` no servidor.');

  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, BorderStyle, ShadingType, HeadingLevel, PageNumber,
    Header, Footer, LevelFormat, convertInchesToTwip, HeightRule,
  } = docxLib;

  const TITULO = cfg.CORES.TITULO;
  const HDR_BG = cfg.CORES.TABELA_HEADER;
  const ALT_BG = cfg.CORES.TABELA_ALT;
  const fontCorpo = cfg.FONTES.CORPO;
  const fontTitulo = cfg.FONTES.TITULO;

  const numeroCompleto = cfg.formatNumeroCompleto(p);
  const dataExt = cfg.formatDataExtenso(p.dataEmissao);
  const cliente = p.clienteEmpresa || p.clienteNome || '—';

  // ── Helpers ──
  const txt = (text, opts = {}) => new TextRun({
    text: text === null || text === undefined ? '' : String(text),
    font: opts.font || fontCorpo,
    size: (opts.size || cfg.TAMANHOS.CORPO_PT) * 2,  // half-points
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || '000000',
  });

  const p_ = (children, opts = {}) => new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: { before: opts.before ?? 0, after: opts.after ?? 100 },
    alignment: opts.alignment || AlignmentType.LEFT,
    indent: opts.indent || undefined,
  });

  const heading = (text) => p_(
    [txt(text.toUpperCase(), { font: fontTitulo, size: cfg.TAMANHOS.TITULO_PT, bold: true, color: TITULO })],
    { before: 280, after: 120 }
  );

  const bullet = (text) => new Paragraph({
    children: [txt(text, { font: cfg.FONTES.BULLET })],
    bullet: { level: 0 },
    indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) },
    spacing: { after: 80 },
  });

  // Tabelas auxiliares
  const cellHeader = (text) => new TableCell({
    shading: { type: ShadingType.SOLID, color: HDR_BG, fill: HDR_BG },
    children: [p_([txt(text, { bold: true, color: 'FFFFFF' })], { alignment: AlignmentType.CENTER, after: 0 })],
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
  const cellBody = (text, opts = {}) => new TableCell({
    shading: opts.alt ? { type: ShadingType.SOLID, color: ALT_BG, fill: ALT_BG } : undefined,
    children: [p_([txt(text, { bold: !!opts.bold })], { alignment: opts.align || AlignmentType.LEFT, after: 0 })],
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  });

  // ── Header (logo + data + número) ──
  const logoChildren = [];
  try {
    if (fs.existsSync(cfg.LOGO.PATH)) {
      const logoData = fs.readFileSync(cfg.LOGO.PATH);
      logoChildren.push(new ImageRun({ data: logoData, transformation: { width: cfg.LOGO.WIDTH_PX, height: cfg.LOGO.HEIGHT_PX } }));
    }
  } catch (e) {
    console.warn('[proposta-docx] logo não encontrado:', e.message);
  }

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top:{style:BorderStyle.NONE,size:0,color:'FFFFFF'}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE}, insideHorizontal:{style:BorderStyle.NONE}, insideVertical:{style:BorderStyle.NONE} },
    rows: [
      new TableRow({ children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: logoChildren, alignment: AlignmentType.LEFT })],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [
            p_([txt(`${cfg.EMPRESA.CIDADE_UF}, ${dataExt}`, { size: cfg.TAMANHOS.PEQUENO_PT, bold: true })], { alignment: AlignmentType.RIGHT, after: 80 }),
            p_([txt(`PROPOSTA COMERCIAL · ${numeroCompleto}`, { size: cfg.TAMANHOS.PEQUENO_PT, bold: true, color: TITULO })], { alignment: AlignmentType.RIGHT, after: 0 }),
          ],
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
      ] }),
    ],
  });

  const header = new Header({ children: [headerTable, p_([txt('')], { after: 60 })] });

  // ── Footer ──
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [txt(`${cfg.EMPRESA.NOME} · ${cfg.EMPRESA.EMAIL} · ${cfg.EMPRESA.TELEFONE} · ${cfg.EMPRESA.CIDADE_UF}`, { size: cfg.TAMANHOS.PEQUENO_PT, color: '666666' })],
        spacing: { before: 0, after: 40 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          txt('Página ', { size: cfg.TAMANHOS.PEQUENO_PT, color: '666666' }),
          new TextRun({ children: [PageNumber.CURRENT], font: fontCorpo, size: cfg.TAMANHOS.PEQUENO_PT * 2, color: '666666' }),
          txt(' de ', { size: cfg.TAMANHOS.PEQUENO_PT, color: '666666' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: fontCorpo, size: cfg.TAMANHOS.PEQUENO_PT * 2, color: '666666' }),
        ],
      }),
    ],
  });

  // ── Corpo ──
  const body = [];

  // Destinatário
  body.push(p_([txt('À: ', { bold: true, color: TITULO }), txt(cliente)]));
  if (p.clienteContato) {
    body.push(p_([
      txt('Att.: ', { bold: true, color: TITULO }),
      txt(p.clienteContato + (p.clienteCargo ? ` / ${p.clienteCargo}` : '')),
    ]));
  }
  if (p.referencia) {
    body.push(p_([txt('Ref.: ', { bold: true, color: TITULO }), txt(p.referencia)]));
  }

  body.push(p_([txt('')], { after: 100 }));
  body.push(p_([txt('Prezado(a):', { bold: true })]));
  body.push(p_([txt(p.saudacao || cfg.PADRAO.SAUDACAO)], { alignment: AlignmentType.JUSTIFIED, after: 200 }));

  // 1. Objetivo
  if (p.objetivo) {
    body.push(heading('Objetivo'));
    body.push(p_([txt(p.objetivo)], { alignment: AlignmentType.JUSTIFIED }));
  }

  // 2. Imagens ilustrativas (se houver com data carregada)
  const imagens = (p.anexos || []).filter(a => a.tipo === 'imagem' && a.secao === 'escopo' && a.data);
  if (imagens.length) {
    body.push(heading('Imagens Ilustrativas'));
    for (const img of imagens) {
      try {
        body.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: img.data, transformation: { width: 380, height: 240 } })],
          spacing: { after: 100 },
        }));
        if (img.legenda) {
          body.push(p_([txt(img.legenda, { italics: true, size: cfg.TAMANHOS.PEQUENO_PT, color: '555555' })], { alignment: AlignmentType.CENTER, after: 200 }));
        }
      } catch (e) {
        console.warn('[proposta-docx] erro ao embutir imagem:', e.message);
      }
    }
  }

  // Escopo
  const escopo = Array.isArray(p.escopo) ? p.escopo : [];
  const inclusos  = escopo.filter(i => i.incluso !== false);
  const exclusoes = escopo.filter(i => i.incluso === false);

  body.push(heading('Escopo'));
  if (inclusos.length === 0) {
    body.push(p_([txt('— Não definido —', { italics: true, color: '888888' })]));
  } else {
    inclusos.forEach(it => body.push(bullet(it.texto || '')));
  }

  // Exclusões
  if (exclusoes.length) {
    body.push(heading('Exclusões / Fora do Escopo'));
    exclusoes.forEach(it => body.push(bullet(it.texto || '')));
  }

  // Obrigações
  const renderClausulas = (lista) => {
    if (!lista.length) {
      body.push(p_([txt('— Não definido —', { italics: true, color: '888888' })]));
      return;
    }
    lista.forEach(c => {
      if (c.titulo) body.push(p_([txt(c.titulo, { bold: true, color: TITULO })]));
      body.push(p_([txt(c.texto || '')], { alignment: AlignmentType.JUSTIFIED, after: 120 }));
    });
  };

  body.push(heading('Obrigações da Contratada'));
  renderClausulas(p.obrigacoesContratada || []);

  body.push(heading('Obrigações da Contratante'));
  renderClausulas(p.obrigacoesContratante || []);

  // Cronograma
  const cronograma = Array.isArray(p.cronograma) ? p.cronograma : [];
  if (cronograma.length) {
    body.push(heading('Cronograma'));
    body.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cellHeader('Fase'), cellHeader('Início'), cellHeader('Fim'), cellHeader('Duração')] }),
        ...cronograma.map((f, i) => new TableRow({ children: [
          cellBody(f.fase || '', { alt: i % 2 === 1 }),
          cellBody(_fmtDate(f.inicio), { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(_fmtDate(f.fim), { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(String(f.duracaoDias || 0) + ' dias', { alt: i % 2 === 1, align: AlignmentType.CENTER }),
        ] })),
      ],
    }));
  }

  // Investimento
  const hh   = Array.isArray(p.investimentoHh)  ? p.investimentoHh  : [];
  const mat  = Array.isArray(p.investimentoMat) ? p.investimentoMat : [];
  const calcHH  = l => (Number(l.qtd)||0) * (Number(l.horas)||0) * (Number(l.valorHora)||0);
  const calcMat = l => (Number(l.qtd)||0) * (Number(l.valorUnit)||0);
  const subtotalHH  = hh.reduce((s,l) => s + calcHH(l), 0);
  const subtotalMat = mat.reduce((s,l) => s + calcMat(l), 0);
  const valorTotal = (p.tipo === 'hh') ? subtotalHH
                    : (p.tipo === 'material') ? subtotalMat
                    : subtotalHH + subtotalMat;

  body.push(heading('Investimento'));

  if ((p.tipo === 'hh' || p.tipo === 'ambos') && hh.length) {
    body.push(p_([txt('Mão de Obra (HH)', { bold: true, size: 11, color: TITULO })], { after: 60 }));
    body.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cellHeader('Cargo / Função'), cellHeader('Qtd'), cellHeader('Horas'), cellHeader('R$ / Hora'), cellHeader('Total')] }),
        ...hh.map((l, i) => new TableRow({ children: [
          cellBody(l.cargo || '', { alt: i % 2 === 1 }),
          cellBody(String(l.qtd || 0), { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(String(l.horas || 0), { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(cfg.fmtBRL(l.valorHora), { alt: i % 2 === 1, align: AlignmentType.RIGHT }),
          cellBody(cfg.fmtBRL(calcHH(l)), { alt: i % 2 === 1, align: AlignmentType.RIGHT, bold: true }),
        ] })),
      ],
    }));
    if (p.tipo === 'ambos') {
      body.push(p_([txt(`Subtotal Mão de Obra: ${cfg.fmtBRL(subtotalHH)}`, { bold: true, color: TITULO })], { alignment: AlignmentType.RIGHT, before: 80, after: 120 }));
    }
  }

  if ((p.tipo === 'material' || p.tipo === 'ambos') && mat.length) {
    body.push(p_([txt('Materiais', { bold: true, size: 11, color: TITULO })], { after: 60 }));
    body.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cellHeader('Item / Descrição'), cellHeader('Qtd'), cellHeader('Unid.'), cellHeader('R$ Unit.'), cellHeader('Total')] }),
        ...mat.map((l, i) => new TableRow({ children: [
          cellBody(l.item || '', { alt: i % 2 === 1 }),
          cellBody(String(l.qtd || 0), { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(l.unid || 'un', { alt: i % 2 === 1, align: AlignmentType.CENTER }),
          cellBody(cfg.fmtBRL(l.valorUnit), { alt: i % 2 === 1, align: AlignmentType.RIGHT }),
          cellBody(cfg.fmtBRL(calcMat(l)), { alt: i % 2 === 1, align: AlignmentType.RIGHT, bold: true }),
        ] })),
      ],
    }));
    if (p.tipo === 'ambos') {
      body.push(p_([txt(`Subtotal Materiais: ${cfg.fmtBRL(subtotalMat)}`, { bold: true, color: TITULO })], { alignment: AlignmentType.RIGHT, before: 80, after: 120 }));
    }
  }

  // Valor Total destacado
  body.push(new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.RIGHT,
    rows: [new TableRow({ children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: TITULO, fill: TITULO },
        children: [p_([txt(`VALOR TOTAL DA PROPOSTA: ${cfg.fmtBRL(valorTotal)}`, { bold: true, color: 'FFFFFF', size: 12 })], { alignment: AlignmentType.RIGHT, after: 0 })],
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
      }),
    ] })],
  }));
  body.push(p_([txt('')], { after: 100 }));

  // Condições de pagamento
  body.push(heading('Condições de Pagamento'));
  body.push(p_([txt(p.condicoesPagamento || cfg.PADRAO.CONDICOES_PAGAMENTO)], { alignment: AlignmentType.JUSTIFIED }));

  // Prazo
  if (p.prazoExecucao) {
    body.push(heading('Prazo de Execução'));
    body.push(p_([txt(p.prazoExecucao)], { alignment: AlignmentType.JUSTIFIED }));
  }

  // Garantia (opcional)
  if (p.garantiaMeses && p.garantiaMeses > 0) {
    body.push(heading('Garantias'));
    body.push(p_([txt(`A Rhino Manutenções oferece garantia de ${p.garantiaMeses} (${_numeroExtenso(p.garantiaMeses)}) meses contra defeitos de fabricação e mão de obra, contados a partir da entrega dos serviços.`)], { alignment: AlignmentType.JUSTIFIED }));
  }

  // Validade
  body.push(heading('Validade da Proposta'));
  body.push(p_([txt(`Esta proposta tem validade de ${p.validadeDias || 15} (${_numeroExtenso(p.validadeDias || 15)}) dias corridos a partir da data de emissão.`)]));

  // Comunicação
  body.push(heading('Comunicação'));
  body.push(p_([txt(`Para quaisquer esclarecimentos: ${cfg.EMPRESA.EMAIL} ou ${cfg.EMPRESA.TELEFONE}.`)]));

  // Anexos
  const pdfs = (p.anexos || []).filter(a => a.tipo === 'pdf');
  if (pdfs.length) {
    body.push(heading('Anexos'));
    pdfs.forEach(a => body.push(bullet(a.nome)));
  }

  // Observações
  if (p.observacoes) {
    body.push(heading('Observações'));
    body.push(p_([txt(p.observacoes)], { alignment: AlignmentType.JUSTIFIED }));
  }

  // Encerramento + assinatura
  body.push(p_([txt('')], { before: 300, after: 100 }));
  body.push(p_([txt(cfg.PADRAO.ENCERRAMENTO)], { alignment: AlignmentType.JUSTIFIED, after: 400 }));

  body.push(p_([txt('________________________________', { color: '333333' })], { alignment: AlignmentType.CENTER, after: 80 }));
  body.push(p_([txt(p.signatario || cfg.SIGNATARIO_PADRAO.NOME, { bold: true, size: 11 })], { alignment: AlignmentType.CENTER, after: 40 }));
  body.push(p_([txt(p.signatarioCargo || cfg.SIGNATARIO_PADRAO.CARGO, { color: '555555' })], { alignment: AlignmentType.CENTER, after: 40 }));
  body.push(p_([txt(cfg.EMPRESA.NOME, { color: '555555' })], { alignment: AlignmentType.CENTER }));

  // ── Documento ──
  const doc = new Document({
    creator: cfg.EMPRESA.NOME,
    title: `${numeroCompleto} - ${p.titulo || ''}`,
    description: `Proposta Comercial ${numeroCompleto}`,
    styles: {
      default: {
        document: { run: { font: fontCorpo, size: cfg.TAMANHOS.CORPO_PT * 2 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(0.9), left: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8) },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children: body,
    }],
  });

  return await Packer.toBuffer(doc);
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

function _numeroExtenso(n) {
  const nomes = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez',
                 'onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove','vinte'];
  if (n >= 0 && n <= 20) return nomes[n];
  return String(n);
}

module.exports = { gerarDocx, isDocxAvailable };
