/**
 * @file Gerador de DOCX timbrado da Proposta Comercial Rhino.
 *
 * Estratégia: gera o body programaticamente via lib `docx` e injeta dentro do
 * Template.dotx oficial Rhino (assets/proposta-template-base.docx) — preservando
 * header/footer corporativos, estilos, theme e fontes do template.
 *
 * Pipeline:
 *  1. Gera Document via lib `docx` (mesma lógica antiga)
 *  2. Extrai apenas o conteúdo entre <w:body>...</w:body> do document.xml gerado
 *  3. Abre o template-base.docx como ZIP
 *  4. Substitui o body do template (mantendo o <w:sectPr> que aponta pros
 *     headers/footers corretos do template)
 *  5. Re-zipa e devolve Buffer
 *
 * Se o template-base não existir, faz fallback pro DOCX programático antigo.
 */
const fs = require('fs');
const cfg = require('./proposta-template-config');

let docxLib = null;
try { docxLib = require('docx'); } catch { /* lib não instalada — handler trata */ }

let JSZip = null;
try { JSZip = require('jszip'); } catch { /* jszip vem com docx, mas defesa */ }

function isDocxAvailable() { return !!docxLib && !!JSZip; }

/**
 * Gera Buffer de DOCX para a proposta.
 *
 * @param {object} p  Proposta completa com anexos (com .data binário p/ imagens, opcional).
 * @param {object} [opts]
 * @param {boolean} [opts.skipHeaderFooter=false]  Não gera header/footer (usar quando vai injetar dentro de template que já tem)
 * @param {boolean} [opts.skipImages=false]        Não embute imagens (evita rId conflicts ao injetar em template)
 * @returns {Promise<Buffer>}
 */
async function gerarDocx(p, opts = {}) {
  const skipHeaderFooter = !!opts.skipHeaderFooter;
  const skipImages = !!opts.skipImages;
  if (!docxLib) throw new Error('Lib `docx` não instalada. Rode `npm install docx` no servidor.');

  const {
    Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, ShadingType, PageNumber,
    Header, Footer, convertInchesToTwip,
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
  // Para corpo: usa Arial MT (fonte do template) com fallback para Arial.
  // Lib `docx` aceita objeto { ascii, hAnsi, eastAsia, cs } para definir
  // fontes diferentes por charset. Aqui passamos uma string; o Word interpreta
  // como nome único — Arial MT é variação do Arial e renderiza idêntica.
  const txt = (text, opts = {}) => new TextRun({
    text: text === null || text === undefined ? '' : String(text),
    font: opts.font || fontCorpo,
    size: (opts.size || cfg.TAMANHOS.CORPO_PT) * 2,  // half-points
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || '000000',
  });

  /**
   * Quebra um texto e retorna array de TextRun, com "Contratada"/"Contratante"
   * em NEGRITO MAIÚSCULO (padrão jurídico/comercial Rhino).
   */
  const txtDestaque = (text, opts = {}) => {
    const segs = cfg.segmentarComDestaque(text || '');
    return segs.map(seg => txt(seg.text, { ...opts, bold: opts.bold || seg.highlight }));
  };

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

  // ── Header: imagem de fundo full-page (timbrado oficial Rhino) ──
  // Usa floating + behindDocument para ficar ATRÁS do texto, ocupando a
  // página inteira (A4 = 595×842 pt = 11906×16838 EMU = 1654×2339 px @ 200dpi)
  const bgChildren = [];
  if (!skipHeaderFooter) {
    try {
      const bgPath = cfg.PAGINA_BG && fs.existsSync(cfg.PAGINA_BG.PATH) ? cfg.PAGINA_BG.PATH : null;
      if (bgPath) {
        const bgData = fs.readFileSync(bgPath);
        const bgType = bgPath.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        bgChildren.push(new ImageRun({
          data: bgData,
          type: bgType,
          // A4 = 21cm × 29.7cm = 794 × 1123 pixels @ 96 dpi.
          // A lib `docx` interpreta transformation.width/height em pixels e
          // converte internamente para EMU. Valores menores deixariam a
          // imagem encolhida no canto superior esquerdo.
          transformation: { width: 794, height: 1123 },
          floating: {
            horizontalPosition: { relative: 'page', offset: 0 },
            verticalPosition:   { relative: 'page', offset: 0 },
            behindDocument: true,
            wrap: { type: 'none' },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        }));
      }
    } catch (e) {
      console.warn('[proposta-docx] background não pôde ser carregado:', e.message);
    }
  }

  // Header só com o bg (sem mais nada — cidade/data/número vão no body)
  const header = new Header({
    children: [new Paragraph({ children: bgChildren })],
  });

  // ── Footer: apenas numeração de página (rodapé do timbrado já está na imagem) ──
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
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

  // Cidade + data + número no topo do corpo (alinhado à direita)
  body.push(p_([txt(`${cfg.EMPRESA.CIDADE_UF}, ${dataExt}`, { bold: true, size: cfg.TAMANHOS.PEQUENO_PT, color: '555555' })],
    { alignment: AlignmentType.RIGHT, after: 60 }));
  body.push(p_([txt(`PROPOSTA COMERCIAL · ${numeroCompleto}`, { bold: true, size: cfg.TAMANHOS.PEQUENO_PT, color: TITULO })],
    { alignment: AlignmentType.RIGHT, after: 240 }));

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
  body.push(p_(txtDestaque(p.saudacao || cfg.PADRAO.SAUDACAO), { alignment: AlignmentType.JUSTIFIED, after: 200 }));

  // Seções de apresentação opcionais (configuração GLOBAL, igual em todas as propostas)
  const apr = (p._apresentacao && typeof p._apresentacao === 'object') ? p._apresentacao : {};
  const caseLogos = !skipImages && Array.isArray(p._caseLogos) ? p._caseLogos : [];
  const renderTextoComBullets = (texto) => {
    if (!texto) return;
    const linhas = String(texto).split('\n').map(l => l.trim()).filter(Boolean);
    const isBullet = (l) => /^[•\-*]\s/.test(l);
    if (linhas.every(isBullet)) {
      linhas.forEach(l => body.push(bullet(l.replace(/^[•\-*]\s+/, ''))));
    } else {
      linhas.forEach(l => {
        if (isBullet(l)) body.push(bullet(l.replace(/^[•\-*]\s+/, '')));
        else body.push(p_(txtDestaque(l), { alignment: AlignmentType.JUSTIFIED, after: 80 }));
      });
    }
  };

  if (apr.apresentacao) {
    body.push(heading('Apresentação'));
    renderTextoComBullets(apr.apresentacao);
  }
  if (apr.casesSucesso || caseLogos.length > 0) {
    body.push(heading('Cases de Sucesso Recentes'));
    if (apr.casesSucesso) renderTextoComBullets(apr.casesSucesso);
    // Logos em linha (sem grid avançado no DOCX; coloca em paragraph centralizado)
    if (caseLogos.length > 0) {
      const logoChildren = caseLogos.map((lg) => {
        try {
          let imgType = 'jpg';
          if (lg.mimeType) {
            if (lg.mimeType.includes('png')) imgType = 'png';
            else if (lg.mimeType.includes('webp')) imgType = 'gif';
            else if (lg.mimeType.includes('jpeg') || lg.mimeType.includes('jpg')) imgType = 'jpg';
          }
          return new ImageRun({
            data: lg.data,
            type: imgType,
            transformation: { width: 90, height: 50 },
          });
        } catch (e) {
          console.warn('[proposta-docx] logo case erro:', lg.nome, e.message);
          return null;
        }
      }).filter(Boolean);
      if (logoChildren.length > 0) {
        body.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: logoChildren.flatMap((img, i) => i === 0 ? [img] : [txt('  '), img]),
          spacing: { before: 100, after: 200 },
        }));
      }
    }
  }
  if (apr.segurancaSaude) {
    body.push(heading('Segurança e Saúde'));
    renderTextoComBullets(apr.segurancaSaude);
  }

  // Objetivo
  if (p.objetivo) {
    body.push(heading('Objetivo'));
    body.push(p_(txtDestaque(p.objetivo), { alignment: AlignmentType.JUSTIFIED }));
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

  // Imagens ilustrativas (DEPOIS do Escopo, antes das Exclusões)
  const imagens = skipImages
    ? []
    : (p.anexos || []).filter(a => a.tipo === 'imagem' && a.secao === 'escopo' && a.data);
  if (imagens.length) {
    body.push(heading('Imagens Ilustrativas'));
    for (const img of imagens) {
      try {
        // Identifica tipo (png/jpg/webp) pelo mime_type para a lib `docx`
        let imgType = 'jpg';
        if (img.mimeType) {
          if (img.mimeType.includes('png')) imgType = 'png';
          else if (img.mimeType.includes('webp')) imgType = 'gif'; // docx não tem webp; gif funciona
          else if (img.mimeType.includes('jpeg') || img.mimeType.includes('jpg')) imgType = 'jpg';
        }
        body.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            data: img.data,
            type: imgType,
            transformation: { width: 380, height: 240 },
          })],
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

  // Exclusões
  if (exclusoes.length) {
    body.push(heading('Exclusões / Fora do Escopo'));
    exclusoes.forEach(it => body.push(bullet(it.texto || '')));
  }

  // Obrigações — sempre destacamos CONTRATADA/CONTRATANTE em negrito maiúsculo
  const renderClausulas = (lista) => {
    if (!lista.length) {
      body.push(p_([txt('— Não definido —', { italics: true, color: '888888' })]));
      return;
    }
    lista.forEach(c => {
      if (c.titulo) body.push(p_(txtDestaque(c.titulo, { bold: true, color: TITULO })));
      body.push(p_(txtDestaque(c.texto || ''), { alignment: AlignmentType.JUSTIFIED, after: 120 }));
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
  body.push(p_(txtDestaque(p.condicoesPagamento || cfg.PADRAO.CONDICOES_PAGAMENTO), { alignment: AlignmentType.JUSTIFIED }));

  // Prazo
  if (p.prazoExecucao) {
    body.push(heading('Prazo de Execução'));
    body.push(p_(txtDestaque(p.prazoExecucao), { alignment: AlignmentType.JUSTIFIED }));
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
    body.push(p_(txtDestaque(p.observacoes), { alignment: AlignmentType.JUSTIFIED }));
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
          // Left 2.3" = ~165pt = ~5.8cm: conteúdo bem deslocado pra direita,
          // longe da logo/decoração vermelha do timbrado. Mesma proporção do PDF.
          margin: {
            top:    convertInchesToTwip(1.4),
            bottom: convertInchesToTwip(0.9),
            left:   convertInchesToTwip(2.3),
            right:  convertInchesToTwip(0.8),
          },
        },
      },
      ...(skipHeaderFooter ? {} : { headers: { default: header }, footers: { default: footer } }),
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

/**
 * Gera DOCX usando o Template oficial Rhino como base.
 *
 * Substitui o body do template por conteúdo gerado, preservando:
 *  - Headers (com logo + meta) e footers (com numeração) do template
 *  - styles.xml, theme1.xml, fontTable.xml originais
 *  - Configurações de página (margens, tamanho)
 *
 * Fallback: se o template não existir, usa gerarDocx() programático.
 *
 * @param {object} p  Proposta com anexos.
 * @returns {Promise<Buffer>}
 */
async function gerarDocxComTemplate(p) {
  if (!docxLib || !JSZip) {
    throw new Error('Libs `docx` e/ou `jszip` não instaladas.');
  }
  const templatePath = cfg.TEMPLATE_BASE_PATH;
  if (!templatePath || !fs.existsSync(templatePath)) {
    console.warn('[proposta-docx] template-base.docx não encontrado — fallback p/ gerador programático');
    return gerarDocx(p);
  }

  // 1. Gera doc programático SEM header/footer/imagens (template provê esses)
  const meuBuffer = await gerarDocx(p, { skipHeaderFooter: true, skipImages: true });

  // 2. Extrai meu document.xml
  const meuZip = await JSZip.loadAsync(meuBuffer);
  const meuDocXml = await meuZip.file('word/document.xml').async('string');

  // 3. Extrai a parte interna do <w:body> do meu doc (entre <w:body> e o </w:body>
  //    final, REMOVENDO o último <w:sectPr> — esse vem do template)
  const meuBodyMatch = meuDocXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!meuBodyMatch) {
    console.warn('[proposta-docx] não consegui extrair body — fallback');
    return meuBuffer;
  }
  // Remove o último <w:sectPr> do meu body (configuração de seção do gerador)
  let meuBodyXml = meuBodyMatch[1].replace(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g, '');

  // 4. Abre o template e pega seu document.xml
  const templateBuffer = fs.readFileSync(templatePath);
  const templateZip = await JSZip.loadAsync(templateBuffer);
  const tplDocXml = await templateZip.file('word/document.xml').async('string');

  // 5. Pega o <w:sectPr> do template (último filho de <w:body>) — mantém para
  //    preservar referência aos headers/footers do template
  const tplSectPrMatch = tplDocXml.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/);
  const tplSectPr = tplSectPrMatch ? tplSectPrMatch[0] : '';

  // 6. Compõe novo document.xml: cabeçalho do template + meu body + sectPr do template
  // Preserva os atributos da tag <w:document ...> do template (XML namespaces)
  const tplDocOpenMatch = tplDocXml.match(/<w:document[^>]*>/);
  const tplDocOpen = tplDocOpenMatch ? tplDocOpenMatch[0] : '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';

  const novoDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${tplDocOpen}<w:body>${meuBodyXml}${tplSectPr}</w:body></w:document>`;

  // 7. Substitui o document.xml no template
  templateZip.file('word/document.xml', novoDocXml);

  // 8. Retorna como Buffer
  return await templateZip.generateAsync({
    type: 'nodebuffer',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

module.exports = { gerarDocx, gerarDocxComTemplate, isDocxAvailable };
