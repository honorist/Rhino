/**
 * @file Renderiza a proposta como HTML timbrado.
 *
 * Usado por:
 *  - Aba "Preview" no editor (frontend faz fetch e injeta HTML).
 *  - Geração de PDF via puppeteer (mesma HTML → page.pdf()).
 *
 * Custos internos NUNCA aparecem no HTML — esta camada é vista pelo cliente.
 */
const fs = require('fs');
const cfg = require('./proposta-template-config');

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _logoDataUri() {
  try {
    const buf = fs.readFileSync(cfg.LOGO.PATH);
    const b64 = buf.toString('base64');
    return `data:image/png;base64,${b64}`;
  } catch {
    return '';
  }
}

/**
 * Renderiza HTML completo da proposta.
 *
 * @param {object} proposta  Proposta com anexos (pré-carregados) e campos camelCase.
 * @param {object} [opts]    { embedImages: boolean — embeda data: URIs ou usa /api/... }
 * @returns {string}  HTML completo (com <html><head><style>).
 */
function renderHtml(proposta, opts = {}) {
  const p = proposta;
  const logo = _logoDataUri();
  const numeroCompleto = cfg.formatNumeroCompleto(p);
  const dataEmissao = cfg.formatDataExtenso(p.dataEmissao);
  const cliente = p.clienteEmpresa || p.clienteNome || '—';

  const escopo = Array.isArray(p.escopo) ? p.escopo : [];
  const inclusos  = escopo.filter(i => i.incluso !== false);
  const exclusoes = escopo.filter(i => i.incluso === false);

  const obContratada  = Array.isArray(p.obrigacoesContratada)  ? p.obrigacoesContratada  : [];
  const obContratante = Array.isArray(p.obrigacoesContratante) ? p.obrigacoesContratante : [];
  const cronograma    = Array.isArray(p.cronograma) ? p.cronograma : [];
  const hh   = Array.isArray(p.investimentoHh)  ? p.investimentoHh  : [];
  const mat  = Array.isArray(p.investimentoMat) ? p.investimentoMat : [];
  const anexos = Array.isArray(p.anexos) ? p.anexos : [];
  const imagens = anexos.filter(a => a.tipo === 'imagem' && a.secao === 'escopo');
  const pdfs    = anexos.filter(a => a.tipo === 'pdf');

  const calcHH  = l => (Number(l.qtd)||0) * (Number(l.horas)||0) * (Number(l.valorHora)||0);
  const calcMat = l => (Number(l.qtd)||0) * (Number(l.valorUnit)||0);

  const subtotalHH  = hh.reduce((s,l) => s + calcHH(l), 0);
  const subtotalMat = mat.reduce((s,l) => s + calcMat(l), 0);
  const valorTotal = (p.tipo === 'hh') ? subtotalHH
                   : (p.tipo === 'material') ? subtotalMat
                   : subtotalHH + subtotalMat;

  const css = `
    @page { size: A4; margin: 25mm 18mm 25mm 18mm; }
    body {
      font-family: '${cfg.FONTES.CORPO}', sans-serif;
      font-size: ${cfg.TAMANHOS.CORPO_PT}pt;
      color: #1a1a1a;
      line-height: 1.45;
      margin: 0;
      padding: 0;
    }
    .header-band {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #${cfg.CORES.TITULO};
      padding-bottom: 10px; margin-bottom: 18px;
    }
    .header-band .logo { max-width: 130px; max-height: 65px; }
    .header-band .meta { text-align: right; font-size: ${cfg.TAMANHOS.PEQUENO_PT}pt; color: #555; }
    .header-band .meta .numero {
      display:inline-block; background:#${cfg.CORES.TITULO}; color:white;
      padding:3px 8px; border-radius:3px; font-weight:600; font-size:${cfg.TAMANHOS.PEQUENO_PT}pt;
      margin-top:4px;
    }
    h1 { color: #${cfg.CORES.TITULO}; font-family: '${cfg.FONTES.TITULO}', sans-serif; font-size: 16pt; margin: 0; }
    h2 {
      color: #${cfg.CORES.TITULO};
      font-family: '${cfg.FONTES.TITULO}', sans-serif;
      font-size: ${cfg.TAMANHOS.TITULO_PT}pt;
      border-bottom: 1.5px solid #${cfg.CORES.TITULO};
      padding-bottom: 4px;
      margin: 22px 0 10px;
      text-transform: uppercase;
      letter-spacing: .5px;
    }
    h3 { color: #${cfg.CORES.TITULO}; font-size: 11pt; margin: 14px 0 6px; }
    .dest-block { margin: 12px 0; line-height: 1.6; }
    .dest-block .label { font-weight: 600; color: #${cfg.CORES.TITULO}; }
    ul { padding-left: 20px; margin: 6px 0; }
    ul li { font-family: '${cfg.FONTES.BULLET}', sans-serif; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    th { background: #${cfg.CORES.TABELA_HEADER}; color: white; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { padding: 5px 8px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #${cfg.CORES.TABELA_ALT}; }
    tfoot td { background: #${cfg.CORES.TITULO} !important; color: white; font-weight: 700; }
    .img-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 10px 0; }
    .img-card { border: 1px solid #ddd; padding: 6px; border-radius: 4px; background: white; }
    .img-card img { max-width: 100%; max-height: 200px; display:block; margin: 0 auto; }
    .img-card .leg { font-size: 9pt; color: #555; text-align: center; margin-top: 4px; font-style: italic; }
    .valor-total {
      background: #${cfg.CORES.TITULO}; color: white;
      padding: 10px 14px; border-radius: 4px; margin-top: 10px;
      font-size: 13pt; text-align: right; font-weight: 700;
    }
    .signature { margin-top: 40px; text-align: center; }
    .signature .line { width: 240px; border-top: 1px solid #333; margin: 0 auto 4px; }
    .signature .nome { font-weight: 600; }
    .signature .cargo { font-size: 10pt; color: #555; }
    .footer-band {
      margin-top: 32px; padding-top: 8px;
      border-top: 1px solid #${cfg.CORES.TITULO};
      font-size: 9pt; color: #555; text-align: center;
    }
    .clausula { margin-bottom: 12px; }
    .clausula .titulo-cl { font-weight: 600; color: #${cfg.CORES.TITULO}; font-size: 10.5pt; }
    .clausula .texto-cl  { margin-top: 2px; }
    p { margin: 6px 0; text-align: justify; }
    .gantt-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 9pt; }
    .gantt-row .nome-fase { width: 130px; flex-shrink: 0; }
    .gantt-row .barra-bg { flex: 1; height: 16px; background: #eee; border-radius: 3px; position: relative; }
    .gantt-row .barra-fg { position: absolute; height: 100%; background: #${cfg.CORES.TABELA_HEADER}; border-radius: 3px; color: white; font-size: 9pt; display:flex; align-items:center; justify-content:center; }
  `;

  // Helpers de seções
  const renderClausulas = (lista) => {
    if (!lista.length) return '<p style="color:#888;font-style:italic;">— Não definido —</p>';
    return lista.map(c => `
      <div class="clausula">
        ${c.titulo ? `<div class="titulo-cl">${esc(c.titulo)}</div>` : ''}
        <div class="texto-cl">${esc(c.texto)}</div>
      </div>
    `).join('');
  };

  const renderCronograma = () => {
    if (!cronograma.length) return '';
    let html = `
      <table>
        <thead><tr><th>Fase</th><th>Início</th><th>Fim</th><th>Duração (dias)</th></tr></thead>
        <tbody>
          ${cronograma.map(f => `
            <tr>
              <td>${esc(f.fase)}</td>
              <td>${esc(_fmtDate(f.inicio))}</td>
              <td>${esc(_fmtDate(f.fim))}</td>
              <td>${f.duracaoDias || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    // Mini Gantt
    const datas = cronograma.flatMap(f => [f.inicio, f.fim]).filter(Boolean).sort();
    if (datas.length >= 2) {
      const min = datas[0], max = datas[datas.length-1];
      const totalDias = _diasEntre(min, max) || 1;
      html += '<div style="margin-top:8px;">';
      cronograma.forEach(f => {
        if (!f.inicio || !f.fim) return;
        const off = _diasEntre(min, f.inicio) - 1;
        const dur = _diasEntre(f.inicio, f.fim);
        const left = (off / totalDias) * 100;
        const w = Math.max((dur / totalDias) * 100, 3);
        html += `
          <div class="gantt-row">
            <div class="nome-fase">${esc(f.fase)}</div>
            <div class="barra-bg">
              <div class="barra-fg" style="left:${left}%;width:${w}%;">${dur}d</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }
    return html;
  };

  const renderInvestimento = () => {
    let html = '';
    if (p.tipo === 'hh' || p.tipo === 'ambos') {
      if (hh.length) {
        html += `
          <h3>Mão de Obra (HH)</h3>
          <table>
            <thead><tr><th>Cargo / Função</th><th>Qtd</th><th>Horas</th><th>R$/h</th><th>Total</th></tr></thead>
            <tbody>
              ${hh.map(l => `
                <tr>
                  <td>${esc(l.cargo)}</td>
                  <td>${l.qtd || 0}</td>
                  <td>${l.horas || 0}</td>
                  <td>${cfg.fmtBRL(l.valorHora)}</td>
                  <td><strong>${cfg.fmtBRL(calcHH(l))}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            ${p.tipo === 'ambos' ? `<tfoot><tr><td colspan="4">Subtotal Mão de Obra</td><td>${cfg.fmtBRL(subtotalHH)}</td></tr></tfoot>` : ''}
          </table>
        `;
      }
    }
    if (p.tipo === 'material' || p.tipo === 'ambos') {
      if (mat.length) {
        html += `
          <h3>Materiais</h3>
          <table>
            <thead><tr><th>Item / Descrição</th><th>Qtd</th><th>Unid.</th><th>R$ Unit</th><th>Total</th></tr></thead>
            <tbody>
              ${mat.map(l => `
                <tr>
                  <td>${esc(l.item)}</td>
                  <td>${l.qtd || 0}</td>
                  <td>${esc(l.unid)}</td>
                  <td>${cfg.fmtBRL(l.valorUnit)}</td>
                  <td><strong>${cfg.fmtBRL(calcMat(l))}</strong></td>
                </tr>
              `).join('')}
            </tbody>
            ${p.tipo === 'ambos' ? `<tfoot><tr><td colspan="4">Subtotal Materiais</td><td>${cfg.fmtBRL(subtotalMat)}</td></tr></tfoot>` : ''}
          </table>
        `;
      }
    }
    html += `<div class="valor-total">VALOR TOTAL DA PROPOSTA: ${cfg.fmtBRL(valorTotal)}</div>`;
    return html;
  };

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${esc(numeroCompleto)} — ${esc(p.titulo)}</title>
<style>${css}</style>
</head>
<body>

<div class="header-band">
  <div>${logo ? `<img class="logo" src="${logo}" alt="Rhino Manutenções">` : `<strong style="font-size:18pt;color:#${cfg.CORES.TITULO};">${cfg.EMPRESA.NOME}</strong>`}</div>
  <div class="meta">
    <div><strong>${cfg.EMPRESA.CIDADE_UF}, ${dataEmissao}</strong></div>
    <div class="numero">PROPOSTA COMERCIAL ${esc(numeroCompleto)}</div>
  </div>
</div>

<div class="dest-block">
  <div><span class="label">À:</span> ${esc(cliente)}</div>
  ${p.clienteContato ? `<div><span class="label">Att.:</span> ${esc(p.clienteContato)}${p.clienteCargo ? ` / ${esc(p.clienteCargo)}` : ''}</div>` : ''}
  ${p.referencia ? `<div><span class="label">Ref.:</span> ${esc(p.referencia)}</div>` : ''}
</div>

<p><strong>Prezado(a):</strong></p>
<p>${esc(p.saudacao || cfg.PADRAO.SAUDACAO)}</p>

${p.objetivo ? `
  <h2>1. Objetivo</h2>
  <p>${esc(p.objetivo)}</p>
` : ''}

${imagens.length ? `
  <h2>${p.objetivo ? '2. ' : ''}Imagens Ilustrativas</h2>
  <div class="img-grid">
    ${imagens.map(img => `
      <div class="img-card">
        <img src="/api/propostas/${esc(p.id)}/anexos/${esc(img.id)}" alt="${esc(img.legenda || img.nome)}">
        ${img.legenda ? `<div class="leg">${esc(img.legenda)}</div>` : ''}
      </div>
    `).join('')}
  </div>
` : ''}

<h2>Escopo</h2>
${inclusos.length === 0 ? '<p style="color:#888;font-style:italic;">— Não definido —</p>' : `
  <ul>${inclusos.map(it => `<li>${esc(it.texto)}</li>`).join('')}</ul>
`}

${exclusoes.length ? `
  <h2>Exclusões / Fora do Escopo</h2>
  <ul>${exclusoes.map(it => `<li>${esc(it.texto)}</li>`).join('')}</ul>
` : ''}

<h2>Obrigações da Contratada</h2>
${renderClausulas(obContratada)}

<h2>Obrigações da Contratante</h2>
${renderClausulas(obContratante)}

<h2>Cronograma</h2>
${renderCronograma() || '<p style="color:#888;font-style:italic;">— Não definido —</p>'}

<h2>Investimento</h2>
${renderInvestimento()}

<h2>Condições de Pagamento</h2>
<p>${esc(p.condicoesPagamento || cfg.PADRAO.CONDICOES_PAGAMENTO)}</p>

${p.prazoExecucao ? `
  <h2>Prazo de Execução</h2>
  <p>${esc(p.prazoExecucao)}</p>
` : ''}

${p.garantiaMeses ? `
  <h2>Garantias</h2>
  <p>A Rhino Manutenções oferece garantia de <strong>${p.garantiaMeses} (${_numeroExtenso(p.garantiaMeses)}) meses</strong> contra defeitos de fabricação e mão de obra, contados a partir da entrega dos serviços, conforme legislação vigente.</p>
` : ''}

<h2>Validade da Proposta</h2>
<p>Esta proposta tem validade de <strong>${p.validadeDias || cfg.PADRAO.VALIDADE_DIAS} (${_numeroExtenso(p.validadeDias || cfg.PADRAO.VALIDADE_DIAS)}) dias corridos</strong> a partir da data de emissão.</p>

<h2>Comunicação</h2>
<p>Para quaisquer esclarecimentos, contate-nos por <strong>${cfg.EMPRESA.EMAIL}</strong> ou pelo telefone <strong>${cfg.EMPRESA.TELEFONE}</strong>.</p>

${pdfs.length ? `
  <h2>Anexos</h2>
  <ul>
    ${pdfs.map(a => `<li>${esc(a.nome)}</li>`).join('')}
  </ul>
` : ''}

${p.observacoes ? `
  <h2>Observações</h2>
  <p>${esc(p.observacoes)}</p>
` : ''}

<p style="margin-top:24px;">${esc(cfg.PADRAO.ENCERRAMENTO)}</p>

<div class="signature">
  <div class="line"></div>
  <div class="nome">${esc(p.signatario || cfg.SIGNATARIO_PADRAO.NOME)}</div>
  <div class="cargo">${esc(p.signatarioCargo || cfg.SIGNATARIO_PADRAO.CARGO)}</div>
  <div class="cargo">${cfg.EMPRESA.NOME}</div>
</div>

<div class="footer-band">
  ${cfg.EMPRESA.NOME} · ${cfg.EMPRESA.EMAIL} · ${cfg.EMPRESA.TELEFONE} · ${cfg.EMPRESA.CIDADE_UF}
</div>

</body>
</html>`;

  return html;
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

function _diasEntre(a, b) {
  if (!a || !b) return 0;
  try {
    const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
    return Math.max(0, Math.round((d2 - d1) / 86400000) + 1);
  } catch { return 0; }
}

function _numeroExtenso(n) {
  const nomes = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez',
                 'onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove','vinte'];
  if (n >= 0 && n <= 20) return nomes[n];
  return String(n);
}

module.exports = { renderHtml };
