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
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 70, bottom: 60, left: 60, right: 50 },
        bufferPages: true,
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

      _renderConteudo(doc, p);

      // Footer + page numbers em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        _renderFooter(doc, i + 1, range.count);
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function _renderConteudo(doc, p) {
  // ── HEADER (logo + meta) ──
  _renderHeader(doc, p);

  // ── Destinatário ──
  doc.y = 130;
  _h(doc, '', 0); // resetar pos
  const cliente = p.clienteEmpresa || p.clienteNome || '—';
  _label(doc, 'À: ', cliente, TITULO);
  if (p.clienteContato) _label(doc, 'Att.: ', `${p.clienteContato}${p.clienteCargo ? ' / ' + p.clienteCargo : ''}`, TITULO);
  if (p.referencia) _label(doc, 'Ref.: ', p.referencia, TITULO);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Prezado(a):');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10);
  _paraDestaque(doc, p.saudacao || cfg.PADRAO.SAUDACAO);

  const md = (p.metadata && typeof p.metadata === 'object') ? p.metadata : {};
  if (md.apresentacao)   { _h(doc, 'Apresentação'); _textoMultilinha(doc, md.apresentacao); }
  if (md.casesSucesso)   { _h(doc, 'Cases de Sucesso Recentes'); _textoMultilinha(doc, md.casesSucesso); }
  if (md.segurancaSaude) { _h(doc, 'Segurança e Saúde'); _textoMultilinha(doc, md.segurancaSaude); }

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
  const startX = (doc.page.width - 240) / 2;
  doc.moveTo(startX, doc.y).lineTo(startX + 240, doc.y).stroke('#333');
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(11).text(p.signatario || cfg.SIGNATARIO_PADRAO.NOME, { align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#555')
     .text(p.signatarioCargo || cfg.SIGNATARIO_PADRAO.CARGO, { align: 'center' })
     .text(cfg.EMPRESA.NOME, { align: 'center' });
}

// ── Helpers de renderização ──

function _renderHeader(doc, p) {
  const logoPath = fs.existsSync(cfg.LOGO.PATH) ? cfg.LOGO.PATH
                  : fs.existsSync(cfg.LOGO.PATH_FALLBACK) ? cfg.LOGO.PATH_FALLBACK
                  : null;
  if (logoPath) {
    try { doc.image(logoPath, 60, 30, { width: 110 }); } catch {}
  }
  const numero = cfg.formatNumeroCompleto(p);
  const data = cfg.formatDataExtenso(p.dataEmissao);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555')
     .text(`${cfg.EMPRESA.CIDADE_UF}, ${data}`, 0, 35, { align: 'right', width: doc.page.width - 60 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TITULO)
     .text(`PROPOSTA COMERCIAL · ${numero}`, 0, 50, { align: 'right', width: doc.page.width - 60 });
  doc.moveTo(60, 95).lineTo(doc.page.width - 50, 95).strokeColor(TITULO).lineWidth(1.5).stroke();
  doc.fillColor('#000').strokeColor('#000');
}

function _renderFooter(doc, page, total) {
  const y = doc.page.height - 50;
  doc.fontSize(8).fillColor('#555').font('Helvetica');
  doc.moveTo(60, y - 6).lineTo(doc.page.width - 50, y - 6).strokeColor(TITULO).lineWidth(0.5).stroke();
  doc.text(
    `${cfg.EMPRESA.NOME} · ${cfg.EMPRESA.EMAIL} · ${cfg.EMPRESA.TELEFONE} · ${cfg.EMPRESA.CIDADE_UF}`,
    60, y, { align: 'center', width: doc.page.width - 110 }
  );
  doc.text(`Página ${page} de ${total}`, 60, y + 12, { align: 'center', width: doc.page.width - 110 });
  doc.fillColor('#000').strokeColor('#000');
}

function _h(doc, titulo, before) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(before === 0 ? 0 : 0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TITULO).text((titulo || '').toUpperCase());
  doc.moveTo(60, doc.y + 1).lineTo(doc.page.width - 50, doc.y + 1).strokeColor(TITULO).lineWidth(1).stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica').fillColor('#000').fontSize(10);
}

function _label(doc, label, value, color) {
  if (!value) return;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(color || '#000').text(label, { continued: true });
  doc.font('Helvetica').fillColor('#000').text(value);
}

// Renderiza um texto em parágrafo, destacando CONTRATADA/CONTRATANTE em NEGRITO MAIÚSCULO
function _paraDestaque(doc, texto) {
  if (!texto) return;
  const segs = cfg.segmentarComDestaque(texto);
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg.highlight) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.text(seg.text, { continued: !last, align: 'justify' });
  });
  doc.font('Helvetica');
  doc.moveDown(0.4);
}

function _bullet(doc, texto) {
  if (doc.y > 720) doc.addPage();
  const startX = doc.x;
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  doc.text('•  ', { continued: true });
  const segs = cfg.segmentarComDestaque(texto);
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg.highlight) doc.font('Helvetica-Bold');
    else doc.font('Helvetica');
    doc.text(seg.text, { continued: !last });
  });
  doc.font('Helvetica');
  doc.x = startX;
  doc.moveDown(0.15);
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
      const segs = cfg.segmentarComDestaque(c.titulo);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TITULO);
      segs.forEach((seg, i) => {
        const last = i === segs.length - 1;
        doc.text(seg.text, { continued: !last });
      });
      doc.fillColor('#000').font('Helvetica');
    }
    _paraDestaque(doc, c.texto || '');
  });
}

function _tabela(doc, rows, colWidths) {
  if (!rows.length) return;
  if (doc.y > 650) doc.addPage();
  const xStart = doc.x;
  const rowHeight = 22;

  // Header
  let x = xStart;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
  doc.rect(xStart, doc.y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(HDR_BG);
  rows[0].forEach((cell, i) => {
    doc.fillColor('#fff').text(String(cell), x + 5, doc.y - rowHeight + 6, { width: colWidths[i] - 10, height: rowHeight - 8 });
    x += colWidths[i];
  });

  // Body
  doc.font('Helvetica').fontSize(9).fillColor('#000');
  for (let r = 1; r < rows.length; r++) {
    const alt = r % 2 === 0;
    x = xStart;
    if (alt) doc.rect(xStart, doc.y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(ALT_BG);
    doc.fillColor('#000');
    rows[r].forEach((cell, i) => {
      doc.text(String(cell), x + 5, doc.y - rowHeight + 6, { width: colWidths[i] - 10, height: rowHeight - 8 });
      x += colWidths[i];
    });
    if (doc.y > 720) doc.addPage();
  }
  doc.x = xStart;
  doc.moveDown(0.5);
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
  const w = doc.page.width - 110;
  doc.rect(60, doc.y, w, 30).fill(TITULO);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12)
     .text(`VALOR TOTAL: ${cfg.fmtBRL(total)}`, 60, doc.y - 30 + 9, { width: w - 10, align: 'right' });
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
