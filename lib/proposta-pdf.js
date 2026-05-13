/**
 * @file Gerador de PDF da Proposta Comercial Rhino — pure-JS sem Chromium.
 *
 * Stack:
 *   - pdfkit: gera o PDF da proposta do zero
 *   - pdf-lib: concatena PDFs anexos no final do documento gerado
 *
 * Ao final do PDF principal:
 *   1. Página "Anexos" lista todos os anexos (PDFs e imagens) da proposta
 *   2. PDFs anexos são concatenados na ordem (cada um continua suas páginas)
 *
 * Imagens anexas (escopo) já entram inline no body do PDF principal.
 */
const fs = require('fs');
const cfg = require('./proposta-template-config');

let PDFDocument = null;
let PDFLib = null;
try { PDFDocument = require('pdfkit'); } catch { /* lib não instalada */ }
try { PDFLib = require('pdf-lib'); } catch { /* lib não instalada */ }

function isPdfAvailable() { return !!PDFDocument && !!PDFLib; }

const TITULO = '#' + cfg.CORES.TITULO;
const HDR_BG = '#' + cfg.CORES.TABELA_HEADER;
const ALT_BG = '#' + cfg.CORES.TABELA_ALT;

/**
 * Gera Buffer de PDF para a proposta.
 *
 * @param {object} p  Proposta completa com anexos (com `.data` Buffer p/ PDFs e imagens).
 * @returns {Promise<Buffer>}
 */
async function gerarPdf(p) {
  if (!PDFDocument || !PDFLib) {
    throw new Error('Libs `pdfkit` e/ou `pdf-lib` não instaladas.');
  }

  // 1) Gera o PDF principal com pdfkit
  const principalBuf = await _gerarPdfPrincipal(p);

  // 2) Concatena PDFs anexos
  const anexos = (p.anexos || []).filter(a => a.tipo === 'pdf' && a.data);
  if (anexos.length === 0) return principalBuf;

  const { PDFDocument: PDFLibDoc } = PDFLib;
  const final = await PDFLibDoc.load(principalBuf);
  for (const a of anexos) {
    try {
      const externo = await PDFLibDoc.load(a.data, { ignoreEncryption: true });
      const paginas = await final.copyPages(externo, externo.getPageIndices());
      paginas.forEach(pg => final.addPage(pg));
    } catch (e) {
      console.warn(`[proposta-pdf] anexo "${a.nome}" não concatenado:`, e.message);
    }
  }
  return Buffer.from(await final.save());
}

function _gerarPdfPrincipal(p) {
  return new Promise((resolve, reject) => {
    try {
      // Margens: top/bottom amplos pra não cobrir header/footer do timbrado;
      // LEFT bem largo (165pt ≈ 5.8cm) pra abrir espaço pra logo Rhino
      // vermelha que está desenhada no FUNDO da página (lado esquerdo).
      // Conteúdo todo fica deslocado pra direita.
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 105, bottom: 80, left: 165, right: 55 },
        // bufferPages=false: páginas só existem se forem REALMENTE adicionadas
        // por nós. Evita páginas fantasma no final do documento.
        bufferPages: false,
        info: {
          Title: `Proposta ${cfg.formatNumeroCompleto(p)}`,
          Author: cfg.EMPRESA.NOME,
          Subject: p.titulo || '',
        },
      });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let pageIndex = 0;
      const drawBackground = () => {
        if (!fs.existsSync(cfg.PAGINA_BG.PATH)) return;
        try {
          doc.save();
          doc.image(cfg.PAGINA_BG.PATH, 0, 0, { width: doc.page.width, height: doc.page.height });
          doc.restore();
        } catch (e) {
          console.warn('[proposta-pdf] erro ao desenhar fundo:', e.message);
        }
      };
      const drawPageNumber = (idx) => {
        const yPosFooter = doc.page.height - 40;
        const savedX = doc.x, savedY = doc.y;
        doc.font('Helvetica').fontSize(8).fillColor('#555')
           .text(`Página ${idx + 1}`,
                 doc.page.width - 130, yPosFooter,
                 { width: 80, align: 'right', lineBreak: false });
        doc.x = savedX;
        doc.y = savedY;
        doc.fillColor('#000');
      };

      // Página inicial
      drawBackground();
      drawPageNumber(0);

      doc.on('pageAdded', () => {
        pageIndex += 1;
        drawBackground();
        drawPageNumber(pageIndex);
      });

      _renderConteudo(doc, p);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function _renderConteudo(doc, p) {
  // Header não é renderizado — o timbrado da imagem de fundo já tem logo + decoração.
  // Cidade + data + número da proposta vão no início do corpo, alinhados à direita.

  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;

  // Cidade + data (direita) + número (direita)
  const numero = cfg.formatNumeroCompleto(p);
  const data = cfg.formatDataExtenso(p.dataEmissao);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#555')
     .text(`${cfg.EMPRESA.CIDADE_UF}, ${data}`, { align: 'right' });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TITULO)
     .text(`PROPOSTA COMERCIAL · ${numero}`, { align: 'right' });
  doc.fillColor('#000');
  doc.moveDown(1);

  // ── Destinatário ──
  const cliente = p.clienteEmpresa || p.clienteNome || '—';
  _label(doc, 'À: ', cliente, TITULO);
  if (p.clienteContato) _label(doc, 'Att.: ', `${p.clienteContato}${p.clienteCargo ? ' / ' + p.clienteCargo : ''}`, TITULO);
  if (p.referencia) _label(doc, 'Ref.: ', p.referencia, TITULO);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Prezado(a):');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10);
  _paraDestaque(doc, p.saudacao || cfg.PADRAO.SAUDACAO);

  // Apresentação global (#/apresentacao) — comum a todas as propostas
  const apr = (p._apresentacao && typeof p._apresentacao === 'object') ? p._apresentacao : {};
  const caseLogos = Array.isArray(p._caseLogos) ? p._caseLogos : [];
  if (apr.apresentacao) { _h(doc, 'Apresentação'); _textoMultilinha(doc, apr.apresentacao); }
  if (apr.casesSucesso || caseLogos.length > 0) {
    _h(doc, 'Cases de Sucesso Recentes');
    if (apr.casesSucesso) _textoMultilinha(doc, apr.casesSucesso);
    if (caseLogos.length > 0) _renderCaseLogos(doc, caseLogos);
  }
  if (apr.segurancaSaude) { _h(doc, 'Segurança e Saúde'); _textoMultilinha(doc, apr.segurancaSaude); }

  if (p.objetivo) { _h(doc, 'Objetivo'); _paraDestaque(doc, p.objetivo); }

  // Imagens ilustrativas (anexos secao=escopo)
  const imagens = (p.anexos || []).filter(a => a.tipo === 'imagem' && a.secao === 'escopo' && a.data);
  if (imagens.length > 0) {
    _h(doc, 'Imagens Ilustrativas');
    imagens.forEach(img => {
      try {
        if (doc.y > 650) doc.addPage();
        doc.image(img.data, { fit: [460, 280], align: 'center' });
        if (img.legenda) {
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555')
             .text(img.legenda, { align: 'center' });
          doc.fillColor('#000');
        }
        doc.moveDown(0.6);
      } catch (e) {
        console.warn('[proposta-pdf] imagem falhou:', e.message);
      }
    });
  }

  // Escopo
  const escopo = Array.isArray(p.escopo) ? p.escopo : [];
  const inclusos = escopo.filter(i => i.incluso !== false);
  const exclusoes = escopo.filter(i => i.incluso === false);
  _h(doc, 'Escopo');
  if (inclusos.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#888').text('— Não definido —');
    doc.fillColor('#000');
  } else {
    inclusos.forEach(it => _bullet(doc, it.texto || ''));
  }
  if (exclusoes.length > 0) {
    _h(doc, 'Exclusões / Fora do Escopo');
    exclusoes.forEach(it => _bullet(doc, it.texto || ''));
  }

  // Obrigações
  _h(doc, 'Obrigações da Contratada');
  _renderClausulas(doc, p.obrigacoesContratada);

  _h(doc, 'Obrigações da Contratante');
  _renderClausulas(doc, p.obrigacoesContratante);

  // Cronograma
  const cronograma = Array.isArray(p.cronograma) ? p.cronograma : [];
  if (cronograma.length > 0) {
    _h(doc, 'Cronograma');
    _tabela(doc, [
      ['Fase', 'Início', 'Fim', 'Duração (dias)'],
      ...cronograma.map(f => [f.fase || '', _fmtDate(f.inicio), _fmtDate(f.fim), String(f.duracaoDias || 0)]),
    ], [220, 90, 90, 90]);
  }

  // Investimento
  _h(doc, 'Investimento');
  _renderInvestimento(doc, p);

  // Condições, Prazo, Garantia, Validade, Comunicação
  _h(doc, 'Condições de Pagamento');
  _paraDestaque(doc, p.condicoesPagamento || cfg.PADRAO.CONDICOES_PAGAMENTO);
  if (p.prazoExecucao) { _h(doc, 'Prazo de Execução'); _paraDestaque(doc, p.prazoExecucao); }
  if (p.garantiaMeses && p.garantiaMeses > 0) {
    _h(doc, 'Garantias');
    _paraDestaque(doc, `A Rhino Manutenções oferece garantia de ${p.garantiaMeses} (${_numExt(p.garantiaMeses)}) meses contra defeitos de fabricação e mão de obra, contados a partir da entrega dos serviços.`);
  }
  _h(doc, 'Validade da Proposta');
  doc.font('Helvetica').fontSize(10).fillColor('#000')
     .text(`Esta proposta tem validade de ${p.validadeDias || 15} (${_numExt(p.validadeDias || 15)}) dias corridos a partir da data de emissão.`,
           { align: 'justify' });
  doc.moveDown(0.4);

  _h(doc, 'Comunicação');
  doc.text(`Para esclarecimentos: ${cfg.EMPRESA.EMAIL} ou ${cfg.EMPRESA.TELEFONE}.`);
  doc.moveDown(0.4);

  // Lista de anexos
  const todosAnexos = p.anexos || [];
  if (todosAnexos.length > 0) {
    _h(doc, 'Anexos');
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    const pdfs = todosAnexos.filter(a => a.tipo === 'pdf');
    const imgs = todosAnexos.filter(a => a.tipo === 'imagem');
    if (pdfs.length > 0) {
      doc.font('Helvetica-Bold').text('Documentos PDF:').font('Helvetica');
      pdfs.forEach((a, i) => doc.text(`  ${i + 1}. ${a.nome}`));
      doc.moveDown(0.3);
    }
    if (imgs.length > 0) {
      doc.font('Helvetica-Bold').text('Imagens:').font('Helvetica');
      imgs.forEach((a, i) => doc.text(`  ${i + 1}. ${a.nome}${a.legenda ? ' — ' + a.legenda : ''}`));
      doc.moveDown(0.3);
    }
    if (pdfs.length > 0) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555')
         .text(`Os ${pdfs.length} documento(s) PDF acima seguem anexados nas próximas páginas deste documento.`);
      doc.fillColor('#000');
    }
  }

  // Observações
  if (p.observacoes) {
    _h(doc, 'Observações');
    _paraDestaque(doc, p.observacoes);
  }

  // Encerramento + Assinatura
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(10).fillColor('#000')
     .text(cfg.PADRAO.ENCERRAMENTO, { align: 'justify' });
  doc.moveDown(2);
  // Linha de assinatura centralizada dentro da área de conteúdo (não da página inteira)
  const conteudoLargura = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const linhaLargura = Math.min(240, conteudoLargura - 20);
  const startX = doc.page.margins.left + (conteudoLargura - linhaLargura) / 2;
  doc.moveTo(startX, doc.y).lineTo(startX + linhaLargura, doc.y).stroke('#333');
  doc.moveDown(0.3);
  // Para alinhamento center funcionar com as margens corretas, escreve usando largura da área de conteúdo
  doc.font('Helvetica-Bold').fontSize(11)
     .text(p.signatario || cfg.SIGNATARIO_PADRAO.NOME, doc.page.margins.left, doc.y,
           { align: 'center', width: conteudoLargura });
  doc.font('Helvetica').fontSize(9).fillColor('#555')
     .text(p.signatarioCargo || cfg.SIGNATARIO_PADRAO.CARGO, doc.page.margins.left, doc.y,
           { align: 'center', width: conteudoLargura })
     .text(cfg.EMPRESA.NOME, doc.page.margins.left, doc.y,
           { align: 'center', width: conteudoLargura });
}

// ── Helpers de renderização ──
// (Header/footer customizados removidos — timbrado vem da imagem de fundo)

function _h(doc, titulo, before) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(before === 0 ? 0 : 0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TITULO).text((titulo || '').toUpperCase());
  // Linha decorativa abaixo do título, ocupa só a largura do corpo (após margem)
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  doc.moveTo(x1, doc.y + 1).lineTo(x2, doc.y + 1).strokeColor(TITULO).lineWidth(1).stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica').fillColor('#000').fontSize(10);
}

function _label(doc, label, value, color) {
  if (!value) return;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(color || '#000').text(label, { continued: true });
  doc.font('Helvetica').fillColor('#000').text(value);
}

// Renderiza um texto em parágrafo, destacando CONTRATADA/CONTRATANTE em NEGRITO MAIÚSCULO.
// Usa write() para os segmentos intermediários e text() apenas para o último —
// isso evita o quebra-linha automático que pdfkit aplica entre text() chamadas e
// preserva os espaços corretamente entre segmentos com fonte diferente.
function _paraDestaque(doc, texto) {
  if (!texto) return;
  const segs = cfg.segmentarComDestaque(texto);
  // Apenas 1 segmento (texto sem CONTRATADA/CONTRATANTE) → caminho simples
  if (segs.length === 1) {
    doc.font('Helvetica').fontSize(10).fillColor('#000')
       .text(segs[0].text, { align: 'justify' });
    doc.moveDown(0.4);
    return;
  }
  doc.fontSize(10).fillColor('#000');
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    doc.font(seg.highlight ? 'Helvetica-Bold' : 'Helvetica');
    if (last) {
      doc.text(seg.text, { align: 'justify' });
    } else {
      doc.text(seg.text, { continued: true });
    }
  });
  doc.font('Helvetica');
  doc.moveDown(0.4);
}

function _bullet(doc, texto) {
  if (doc.y > 720) doc.addPage();
  const startX = doc.page.margins.left;
  doc.x = startX;
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  const segs = cfg.segmentarComDestaque(texto);
  // Bullet + texto
  if (segs.length === 1) {
    doc.text('•  ' + segs[0].text, { align: 'justify' });
  } else {
    doc.text('•  ', { continued: true });
    segs.forEach((seg, i) => {
      const last = i === segs.length - 1;
      doc.font(seg.highlight ? 'Helvetica-Bold' : 'Helvetica');
      if (last) {
        doc.text(seg.text);
      } else {
        doc.text(seg.text, { continued: true });
      }
    });
  }
  doc.font('Helvetica');
  doc.x = startX;
  doc.moveDown(0.2);
}

/**
 * Renderiza logos de cases em grade horizontal (até 5 por linha).
 * Cada logo limitada a 90x50 pt, com 8pt de gap.
 */
function _renderCaseLogos(doc, logos) {
  if (!logos || logos.length === 0) return;
  const LOGO_W = 90, LOGO_H = 50, GAP = 12;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const perLine = Math.max(1, Math.floor((contentW + GAP) / (LOGO_W + GAP)));
  let i = 0;
  while (i < logos.length) {
    if (doc.y + LOGO_H + 10 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const fila = logos.slice(i, i + perLine);
    const usedW = fila.length * LOGO_W + (fila.length - 1) * GAP;
    let x = doc.page.margins.left + (contentW - usedW) / 2;
    const y = doc.y;
    fila.forEach(lg => {
      try {
        if (lg.data) {
          doc.image(lg.data, x, y, { fit: [LOGO_W, LOGO_H], align: 'center', valign: 'center' });
        }
      } catch (e) {
        console.warn('[proposta-pdf] logo case erro:', lg.nome, e.message);
      }
      x += LOGO_W + GAP;
    });
    doc.y = y + LOGO_H + GAP;
    doc.x = doc.page.margins.left;
    i += perLine;
  }
  doc.moveDown(0.4);
}

function _textoMultilinha(doc, texto) {
  if (!texto) return;
  const linhas = String(texto).split('\n').map(l => l.trim()).filter(Boolean);
  const isBullet = (l) => /^[•\-*]\s/.test(l);
  linhas.forEach(l => {
    if (isBullet(l)) _bullet(doc, l.replace(/^[•\-*]\s+/, ''));
    else _paraDestaque(doc, l);
  });
}

function _renderClausulas(doc, lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#888').text('— Não definido —');
    doc.fillColor('#000').font('Helvetica');
    return;
  }
  lista.forEach(c => {
    if (c.titulo) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TITULO).text(c.titulo);
      doc.fillColor('#000').font('Helvetica');
    }
    _paraDestaque(doc, c.texto || '');
    doc.moveDown(0.2);
  });
}

function _tabela(doc, rows, colWidths) {
  if (!rows.length) return;
  if (doc.y > 650) doc.addPage();
  const xStart = doc.page.margins.left;
  const rowHeight = 22;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Helper: desenha uma linha (header ou body) e avança doc.y
  const drawRow = (cells, opts = {}) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
    const yRow = doc.y;
    // Fundo
    if (opts.bgColor) {
      doc.save();
      doc.rect(xStart, yRow, totalWidth, rowHeight).fill(opts.bgColor);
      doc.restore();
    }
    // Borda inferior sutil (cinza)
    doc.save();
    doc.strokeColor('#d0d0d0').lineWidth(0.5);
    doc.moveTo(xStart, yRow + rowHeight).lineTo(xStart + totalWidth, yRow + rowHeight).stroke();
    doc.restore();
    // Texto de cada célula
    let cx = xStart;
    doc.fontSize(9).fillColor(opts.textColor || '#000')
       .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((cell, i) => {
      const align = (i === 0) ? 'left' : (typeof cell === 'string' && cell.match(/^R?\$|^\d/)) ? 'right' : 'center';
      doc.text(String(cell ?? ''), cx + 5, yRow + 7, {
        width: colWidths[i] - 10,
        height: rowHeight - 10,
        ellipsis: true,
        align,
      });
      cx += colWidths[i];
    });
    // Avança Y manualmente — text() com x,y absoluto NÃO avança doc.y
    doc.y = yRow + rowHeight;
    doc.x = xStart;
  };

  // Header
  drawRow(rows[0], { bgColor: HDR_BG, textColor: '#fff', bold: true });
  // Body
  for (let r = 1; r < rows.length; r++) {
    const alt = r % 2 === 0;
    drawRow(rows[r], { bgColor: alt ? ALT_BG : null });
  }
  doc.x = xStart;
  doc.moveDown(0.5);
  doc.fillColor('#000').strokeColor('#000');
}

function _renderInvestimento(doc, p) {
  const hh = Array.isArray(p.investimentoHh) ? p.investimentoHh : [];
  const mat = Array.isArray(p.investimentoMat) ? p.investimentoMat : [];
  const calcHH = l => (Number(l.qtd) || 0) * (Number(l.horas) || 0) * (Number(l.valorHora) || 0);
  const calcMat = l => (Number(l.qtd) || 0) * (Number(l.valorUnit) || 0);
  const subHH = hh.reduce((s, l) => s + calcHH(l), 0);
  const subMat = mat.reduce((s, l) => s + calcMat(l), 0);
  const total = (p.tipo === 'hh') ? subHH : (p.tipo === 'material') ? subMat : subHH + subMat;

  if ((p.tipo === 'hh' || p.tipo === 'ambos') && hh.length > 0) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TITULO).text('Mão de Obra (HH)');
    doc.fillColor('#000').font('Helvetica');
    _tabela(doc, [
      ['Cargo', 'Qtd', 'Horas', 'R$/h', 'Total'],
      ...hh.map(l => [l.cargo || '', String(l.qtd || 0), String(l.horas || 0), cfg.fmtBRL(l.valorHora), cfg.fmtBRL(calcHH(l))]),
    ], [200, 50, 60, 90, 90]);
  }
  if ((p.tipo === 'material' || p.tipo === 'ambos') && mat.length > 0) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TITULO).text('Materiais');
    doc.fillColor('#000').font('Helvetica');
    _tabela(doc, [
      ['Item', 'Qtd', 'Unid.', 'R$ Unit', 'Total'],
      ...mat.map(l => [l.item || '', String(l.qtd || 0), l.unid || 'un', cfg.fmtBRL(l.valorUnit), cfg.fmtBRL(calcMat(l))]),
    ], [200, 50, 60, 90, 90]);
  }

  // Valor total destacado
  doc.moveDown(0.5);
  if (doc.y > 700) doc.addPage();
  const xL = doc.page.margins.left;
  const w = doc.page.width - xL - doc.page.margins.right;
  doc.rect(xL, doc.y, w, 30).fill(TITULO);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12)
     .text(`VALOR TOTAL: ${cfg.fmtBRL(total)}`, xL, doc.y - 30 + 9, { width: w - 10, align: 'right' });
  doc.fillColor('#000').font('Helvetica').moveDown(1);
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

function _numExt(n) {
  const nomes = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
                 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
  if (n >= 0 && n <= 20) return nomes[n];
  return String(n);
}

module.exports = { gerarPdf, isPdfAvailable };
