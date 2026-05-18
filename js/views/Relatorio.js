/* Rhino · Relatório Gerencial PDF
   Geração de relatório executivo em PDF usando jsPDF + autoTable.
   Estética sóbria estilo auditoria/consultoria: paleta neutra, tipografia
   com hierarquia, espaço em branco generoso, capa minimalista.
   Exposto como window.RhinoRelatorio.gerar().
*/

(function () {
  'use strict';

  // ── Paleta sóbria (consultoria/auditoria) ────────────────────
  // Um único cor de destaque (navy), restante em escala de cinza.
  // Evita visual "PowerPoint colorido".
  const INK       = [17, 24, 39];     // quase-preto p/ texto
  const NAVY      = [11, 37, 69];     // único accent — títulos e linhas
  const GREY_900  = [55, 65, 81];     // headers de tabela
  const GREY_700  = [75, 85, 99];     // labels secundárias
  const GREY_500  = [107, 114, 128];  // texto auxiliar
  const GREY_300  = [209, 213, 219];  // bordas
  const GREY_100  = [243, 244, 246];  // fundo sutil
  const PAPER     = [252, 252, 250];  // off-white p/ fundo de capa
  const POS       = [21, 94, 78];     // verde escuro sóbrio (positivo)
  const NEG       = [136, 19, 55];    // bordô (negativo, sem alarme)

  const FONT      = 'helvetica';
  const PAGE_W    = 210;
  const PAGE_H    = 297;
  const MARGIN    = 22;               // margens generosas (Big4 padrão)
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  // ── Logo (cacheada após primeira leitura) ────────────────────
  let _logoDataUrl = null;
  let _logoRatio   = 2.67; // largura/altura (fallback caso falhe a leitura)

  async function _loadLogo() {
    if (_logoDataUrl) return _logoDataUrl;
    try {
      const resp = await fetch('assets/logo.png');
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      if (!dataUrl) return null;
      // Lê dimensões reais pra preservar proporção no PDF
      const ratio = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
        img.onerror = () => resolve(_logoRatio);
        img.src = dataUrl;
      });
      _logoDataUrl = dataUrl;
      _logoRatio = ratio || _logoRatio;
      return _logoDataUrl;
    } catch (e) {
      console.warn('[RhinoRelatorio] falha ao carregar logo:', e?.message || e);
      return null;
    }
  }

  // Embute logo mantendo proporção. Recebe altura desejada (mm).
  function _drawLogo(doc, x, y, heightMm) {
    if (!_logoDataUrl) return 0;
    const w = heightMm * _logoRatio;
    try {
      doc.addImage(_logoDataUrl, 'PNG', x, y, w, heightMm);
      return w;
    } catch (e) {
      console.warn('[RhinoRelatorio] addImage falhou:', e?.message || e);
      return 0;
    }
  }

  // Guard: alguns hooks do autoTable passam coords undefined em foot/spans.
  // Sem isso, jsPDF.line lança "Invalid arguments" e mata a geração inteira.
  function _hline(doc, x1, y1, x2, y2) {
    if (![x1, y1, x2, y2].every(Number.isFinite)) return;
    doc.line(x1, y1, x2, y2);
  }

  // ── Header minimalista (letterhead com logo) ─────────────────
  function _drawLetterhead(doc, secaoNum, secaoTitulo) {
    // Logo pequeno top-left + label discreta ao lado
    const logoH = 7; // mm — bem discreto no header
    const logoW = _drawLogo(doc, MARGIN, 5, logoH);

    if (logoW > 0) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY_500);
      doc.text('RELATÓRIO GERENCIAL', MARGIN + logoW + 4, 10);
    } else {
      // Fallback: só texto se a logo não carregar
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text('RHINO', MARGIN, 10);
      doc.setFont(FONT, 'normal');
      doc.setTextColor(...GREY_500);
      doc.text('RELATÓRIO GERENCIAL', MARGIN + 18, 10);
    }

    // Linha fina abaixo do letterhead
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, 15, PAGE_W - MARGIN, 15);

    if (secaoNum) {
      const txt = String(secaoNum).padStart(2, '0') + '  ·  ' + (secaoTitulo || '').toUpperCase();
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY_500);
      doc.text(txt, PAGE_W - MARGIN, 10, { align: 'right' });
    }
    doc.setTextColor(...INK);
  }

  // ── Footer corporativo (versão, página, confidencial, data) ──
  function _drawFooter(doc, pageNum, totalPages, periodoLabel) {
    const hoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const versao = (window.__APP_VERSION__ || 'dev');

    doc.setDrawColor(...GREY_300);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY_500);

    // Left: confidencial + versão
    doc.text('DOCUMENTO CONFIDENCIAL', MARGIN, PAGE_H - 9);
    doc.text('Sistema Rhino v' + versao, MARGIN, PAGE_H - 5.5);

    // Center: período de referência
    if (periodoLabel) {
      doc.text(periodoLabel, PAGE_W / 2, PAGE_H - 9, { align: 'center' });
    }
    doc.text('Emitido em ' + hoje, PAGE_W / 2, PAGE_H - 5.5, { align: 'center' });

    // Right: paginação
    const pg = (pageNum != null && totalPages != null)
      ? 'Página ' + pageNum + ' de ' + totalPages
      : 'Página ' + pageNum;
    doc.text(pg, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });

    doc.setTextColor(...INK);
  }

  // ── Título de seção numerado (01. Sumário Executivo) ─────────
  function _drawSectionTitle(doc, numero, titulo, subtitulo, y) {
    const yTitle = y || 32;

    // Número grande em cinza claro decorativo
    doc.setFont(FONT, 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...GREY_300);
    doc.text(String(numero).padStart(2, '0'), MARGIN, yTitle);

    // Título principal
    doc.setFontSize(16);
    doc.setTextColor(...NAVY);
    doc.text(titulo, MARGIN + 18, yTitle - 1);

    // Subtítulo opcional
    if (subtitulo) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GREY_500);
      doc.text(subtitulo, MARGIN + 18, yTitle + 5);
    }

    // Linha de accent
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, yTitle + 9, MARGIN + 14, yTitle + 9);

    doc.setTextColor(...INK);
    return yTitle + 18;
  }

  // ── Bloco de KPI minimalista (sem caixa colorida) ────────────
  function _drawKpi(doc, x, y, w, label, value, hint, valueColor) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY_500);
    doc.text(label.toUpperCase(), x, y);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...(valueColor || INK));
    doc.text(value, x, y + 9);

    if (hint) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GREY_500);
      doc.text(hint, x, y + 15);
    }

    // Linha fina abaixo (separador sutil)
    doc.setDrawColor(...GREY_300);
    doc.setLineWidth(0.2);
    doc.line(x, y + 20, x + w - 6, y + 20);

    doc.setTextColor(...INK);
  }

  // ── Parágrafo justificado ────────────────────────────────────
  function _drawParagrafo(doc, texto, y, opts) {
    const o = opts || {};
    doc.setFont(FONT, o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size || 10);
    doc.setTextColor(...(o.color || INK));
    const lines = doc.splitTextToSize(texto, CONTENT_W);
    doc.text(lines, MARGIN, y, { lineHeightFactor: 1.5 });
    return y + lines.length * (o.size || 10) * 0.45;
  }

  // ── Cálculos ─────────────────────────────────────────────────
  function _calcSaldoCaixa(entries) {
    return (entries || []).reduce((s, e) => {
      const v = parseFloat(e.value) || 0;
      return s + (e.type === 'entrada' ? v : -v);
    }, 0);
  }

  function _saidasByContract(saidas) {
    const map = {};
    (saidas || []).forEach(s => {
      const id = s.contractId || s.contract_id;
      if (!id) return;
      map[id] = (map[id] || 0) + (parseFloat(s.value) || 0);
    });
    return map;
  }

  function _calcFluxoMensal(entries) {
    const meses = [];
    const hoje = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({
        ano: d.getFullYear(),
        mes: d.getMonth() + 1,
        label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          .replace('.', '').replace(' de ', '/'),
        entradas: 0,
        saidas: 0,
      });
    }
    (entries || []).forEach(e => {
      if (!e.date) return;
      const [ano, mes] = e.date.split('-').map(Number);
      const bucket = meses.find(m => m.ano === ano && m.mes === mes);
      if (!bucket) return;
      const v = parseFloat(e.value) || 0;
      if (e.type === 'entrada') bucket.entradas += v;
      else bucket.saidas += v;
    });
    return meses;
  }

  function _calcConcentracaoReceita(contracts, saidasMap) {
    const ativos = (contracts || []).filter(c => c.status === 'ativo' && c.value > 0);
    const totalContratado = ativos.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);
    const ordenado = ativos
      .map(c => ({
        nome: c.name || '—',
        cliente: c.client || '—',
        valor: parseFloat(c.value) || 0,
        medido: saidasMap[c.id] || 0,
        pct: totalContratado > 0 ? (parseFloat(c.value) / totalContratado * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor);
    const top5 = ordenado.slice(0, 5);
    const cr5 = top5.reduce((s, c) => s + c.pct, 0);
    return { totalContratado, top5, cr5, totalContratos: ordenado.length };
  }

  function _calcAgingARecever(nfsList) {
    const hoje = new Date();
    const buckets = [
      { label: 'A vencer',         min: -9999, max: 0,    valor: 0, qtd: 0 },
      { label: 'Vencidas 1–30d',   min: 1,     max: 30,   valor: 0, qtd: 0 },
      { label: 'Vencidas 31–60d',  min: 31,    max: 60,   valor: 0, qtd: 0 },
      { label: 'Vencidas 61–90d',  min: 61,    max: 90,   valor: 0, qtd: 0 },
      { label: 'Vencidas >90d',    min: 91,    max: 99999, valor: 0, qtd: 0 },
    ];
    (nfsList || []).forEach(n => {
      if (n.emitida || n.status === 'emitida') return;
      const venc = n.dataLimite || n.data_limite;
      if (!venc) return;
      const dVenc = new Date(venc + 'T12:00:00');
      const diasAtraso = Math.floor((hoje - dVenc) / 86400000);
      const valor = parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0;
      const b = buckets.find(b => diasAtraso >= b.min && diasAtraso <= b.max);
      if (b) { b.valor += valor; b.qtd += 1; }
    });
    const total = buckets.reduce((s, b) => s + b.valor, 0);
    return { buckets, total };
  }

  function _calcRiscos(contracts, nfsList, cpList, saidasMap) {
    const hojeStr = new Date().toISOString().split('T')[0];
    const riscos = [];

    // NFs vencidas há mais de 60d
    const nfsAntigas = (nfsList || []).filter(n => {
      if (n.emitida) return false;
      const v = n.dataLimite || n.data_limite;
      if (!v) return false;
      const dias = Math.floor((new Date() - new Date(v + 'T12:00:00')) / 86400000);
      return dias > 60;
    });
    if (nfsAntigas.length > 0) {
      const total = nfsAntigas.reduce((s, n) => s + (parseFloat(n.valor || n.totalLiquido) || 0), 0);
      riscos.push({
        sev: 'Alta', cat: 'A Receber',
        desc: nfsAntigas.length + ' NFs vencidas há mais de 60 dias',
        impacto: total,
      });
    }

    // Contratos com margem negativa
    const margemNeg = (contracts || []).filter(c => {
      if (c.status !== 'ativo' || !c.value) return false;
      const s = saidasMap[c.id] || 0;
      return ((c.value - s) / c.value) < 0;
    });
    if (margemNeg.length > 0) {
      riscos.push({
        sev: 'Alta', cat: 'Margem',
        desc: margemNeg.length + ' contrato(s) ativo(s) com margem negativa',
        impacto: 0,
      });
    }

    // Contratos próximos do término (30d)
    const em30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    const proxFim = (contracts || []).filter(c => c.status === 'ativo' && c.endDate && c.endDate <= em30 && c.endDate >= hojeStr);
    if (proxFim.length > 0) {
      riscos.push({
        sev: 'Média', cat: 'Renovação',
        desc: proxFim.length + ' contrato(s) ativo(s) com término nos próximos 30 dias',
        impacto: proxFim.reduce((s, c) => s + (parseFloat(c.value) || 0), 0),
      });
    }

    // Contas vencidas
    const cpVenc = (cpList || []).filter(c => {
      const v = c.dataVencimento || c.data_vencimento;
      return (c.status === 'pendente' || c.status === 'aberto') && v && v < hojeStr;
    });
    if (cpVenc.length > 0) {
      riscos.push({
        sev: 'Alta', cat: 'A Pagar',
        desc: cpVenc.length + ' conta(s) a pagar vencida(s)',
        impacto: cpVenc.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0),
      });
    }

    return riscos;
  }

  function _brl(v) {
    if (window.Store && typeof Store.formatBRL === 'function') return Store.formatBRL(v);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }

  function _pct(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  // ── PÁGINA 1: Capa minimalista com logo ──────────────────────
  function _paginaCapa(doc, periodoLabel) {
    // Fundo off-white sutil
    doc.setFillColor(...PAPER);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    // Logo no topo da capa — alta proeminência (altura 22mm)
    const logoH = 22;
    const logoW = _drawLogo(doc, MARGIN, 18, logoH);
    if (logoW === 0) {
      // Fallback se a logo não carregar
      doc.setFont(FONT, 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text('RHINO', MARGIN, 22);
      doc.setFont(FONT, 'normal');
      doc.setTextColor(...GREY_500);
      doc.text('GESTÃO EMPRESARIAL', MARGIN + 18, 22);
    }

    // Faixa accent fina vertical à esquerda do bloco do título
    doc.setFillColor(...NAVY);
    doc.rect(MARGIN, 60, 1.2, 40, 'F');

    // Bloco principal — título à direita da faixa accent
    doc.setFont(FONT, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GREY_500);
    doc.text('RELATÓRIO', MARGIN + 8, 70);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(36);
    doc.setTextColor(...INK);
    doc.text('Gerencial', MARGIN + 8, 84);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(14);
    doc.setTextColor(...GREY_700);
    doc.text('Análise consolidada da operação', MARGIN + 8, 96);

    // Bloco metadados — meio da página
    const yMeta = 130;
    doc.setDrawColor(...GREY_300);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, yMeta, PAGE_W - MARGIN, yMeta);

    const hoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    const versao = (window.__APP_VERSION__ || 'dev');

    const metaItens = [
      ['PERÍODO DE REFERÊNCIA', periodoLabel || 'Acumulado até a data'],
      ['DATA DE EMISSÃO',       hoje],
      ['VERSÃO DO SISTEMA',     'Rhino v' + versao],
      ['CLASSIFICAÇÃO',         'Documento Confidencial'],
    ];

    let y = yMeta + 14;
    metaItens.forEach(([k, v]) => {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY_500);
      doc.text(k, MARGIN, y);

      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(v, MARGIN + 60, y);
      y += 11;
    });

    // Bloco rodapé da capa
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 28, MARGIN + 18, PAGE_H - 28);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY_500);
    doc.text('Este documento contém informações confidenciais. A distribuição é restrita aos', MARGIN, PAGE_H - 22);
    doc.text('destinatários autorizados. Reprodução ou divulgação requer autorização prévia.', MARGIN, PAGE_H - 18);
  }

  // ── PÁGINA 2: Sumário ────────────────────────────────────────
  function _paginaSumario(doc, secoes, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, null, null);

    let y = _drawSectionTitle(doc, 0, 'Sumário', 'Estrutura do documento');

    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK);

    secoes.forEach(s => {
      const num = String(s.num).padStart(2, '0');
      doc.setFont(FONT, 'bold');
      doc.setTextColor(...NAVY);
      doc.text(num, MARGIN, y);

      doc.setFont(FONT, 'normal');
      doc.setTextColor(...INK);
      doc.text(s.titulo, MARGIN + 12, y);

      // Linha pontilhada até página
      const xStart = MARGIN + 12 + doc.getTextWidth(s.titulo) + 3;
      const xEnd = PAGE_W - MARGIN - 8;
      doc.setDrawColor(...GREY_300);
      doc.setLineWidth(0.15);
      // setLineDashPattern só existe em jsPDF 2.x — guarda o estado original
      try { doc.setLineDashPattern && doc.setLineDashPattern([0.6, 0.6], 0); } catch {}
      _hline(doc, xStart, y - 1, xEnd, y - 1);
      try { doc.setLineDashPattern && doc.setLineDashPattern([], 0); } catch {}

      doc.setTextColor(...GREY_500);
      doc.text(String(s.pagina), PAGE_W - MARGIN, y, { align: 'right' });

      y += 9;
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA 3: Resumo Executivo ──────────────────────────────
  function _paginaResumo(doc, dados, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 1, 'Sumário Executivo');

    let y = _drawSectionTitle(doc, 1, 'Sumário Executivo',
      'Visão consolidada dos principais indicadores e fatos do período');

    // Narrativa
    const narrativa = _gerarNarrativa(dados);
    y = _drawParagrafo(doc, narrativa, y, { size: 10 });
    y += 6;

    // Indicadores em linha (4 colunas, sem caixa colorida)
    const colW = CONTENT_W / 4;
    const saldoColor = dados.saldoCaixa >= 0 ? POS : NEG;
    const margemColor = dados.margemMedia > 15 ? POS : dados.margemMedia > 0 ? GREY_900 : NEG;

    _drawKpi(doc, MARGIN,             y, colW, 'Saldo em caixa',     _brl(dados.saldoCaixa),
      dados.varSaldoPct != null ? _pct(dados.varSaldoPct) + ' vs mês ant.' : null, saldoColor);
    _drawKpi(doc, MARGIN + colW,      y, colW, 'Contratos ativos',   String(dados.contratosAtivos),
      dados.contratosAtivos + ' em execução', NAVY);
    _drawKpi(doc, MARGIN + colW * 2,  y, colW, 'Carteira contratada',_brl(dados.totalContratado),
      'Soma dos contratos ativos', INK);
    _drawKpi(doc, MARGIN + colW * 3,  y, colW, 'Margem média',       dados.margemMedia.toFixed(1) + '%',
      'Média simples dos contratos', margemColor);

    y += 30;

    // Segunda linha de indicadores
    _drawKpi(doc, MARGIN,             y, colW, 'A receber (NFs)',    _brl(dados.totalAReceber),
      dados.qtdNFsPend + ' NF(s) pendente(s)', INK);
    _drawKpi(doc, MARGIN + colW,      y, colW, 'A pagar (contas)',   _brl(dados.totalAPagar),
      dados.qtdCpPend + ' conta(s) em aberto', INK);
    _drawKpi(doc, MARGIN + colW * 2,  y, colW, 'Faturamento (mês)',  _brl(dados.faturamentoMes),
      dados.varFatPct != null ? _pct(dados.varFatPct) + ' vs mês ant.' : null,
      dados.varFatPct >= 0 ? POS : NEG);
    _drawKpi(doc, MARGIN + colW * 3,  y, colW, 'Runway (caixa)',     dados.runwayMeses + ' meses',
      'Cobertura do gasto mensal', INK);

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  function _gerarNarrativa(d) {
    const partes = [];
    partes.push('No período analisado, a empresa apresenta ' + d.contratosAtivos +
      ' contrato(s) em execução, totalizando uma carteira contratada de ' + _brl(d.totalContratado) +
      '. O saldo consolidado em caixa é de ' + _brl(d.saldoCaixa) +
      (d.saldoCaixa >= 0 ? ', em posição positiva.' : ', em posição negativa que requer atenção.'));

    if (d.margemMedia > 15) {
      partes.push('A margem operacional média situa-se em ' + d.margemMedia.toFixed(1) +
        '%, em patamar saudável.');
    } else if (d.margemMedia > 0) {
      partes.push('A margem operacional média de ' + d.margemMedia.toFixed(1) +
        '% encontra-se apertada e merece monitoramento.');
    } else {
      partes.push('A margem operacional média negativa de ' + d.margemMedia.toFixed(1) +
        '% indica que os contratos ativos, em conjunto, estão consumindo mais do que o contratado.');
    }

    if (d.cr5 > 70) {
      partes.push('Há concentração relevante de receita: os 5 maiores contratos respondem por ' +
        d.cr5.toFixed(1) + '% da carteira (CR5), elevando o risco de cliente.');
    }

    if (d.riscosAlta > 0) {
      partes.push('Foram identificados ' + d.riscosAlta + ' risco(s) classificado(s) como de alta severidade, ' +
        'detalhados na seção dedicada deste relatório.');
    }

    return partes.join(' ');
  }

  // ── PÁGINA: Portfólio de Contratos ───────────────────────────
  function _paginaContratos(doc, contracts, saidasMap, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 2, 'Portfólio de Contratos');

    let y = _drawSectionTitle(doc, 2, 'Portfólio de Contratos',
      'Contratos ativos, valores executados e margens');

    const ativos = (contracts || []).filter(c => c.status === 'ativo');

    const body = ativos.map(c => {
      const saidas = saidasMap[c.id] || 0;
      const margemPct = c.value > 0 ? ((c.value - saidas) / c.value * 100) : null;
      return [
        (c.name || '—').slice(0, 40),
        (c.client || '—').slice(0, 28),
        _brl(parseFloat(c.value) || 0),
        _brl(saidas),
        margemPct != null ? margemPct.toFixed(1) + '%' : '—',
        c.endDate ? new Date(c.endDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
      ];
    });

    doc.autoTable({
      head: [['Contrato', 'Cliente', 'Valor', 'Executado', 'Margem', 'Término']],
      body: body.length > 0 ? body : [['Sem contratos ativos', '', '', '', '', '']],
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: {
        font: FONT, fontSize: 8.5, cellPadding: 3, textColor: INK,
        lineColor: GREY_300, lineWidth: 0,
      },
      headStyles: {
        fillColor: [255, 255, 255], textColor: GREY_500,
        fontStyle: 'bold', fontSize: 7.5,
        lineColor: NAVY, lineWidth: 0,
      },
      bodyStyles: { lineColor: GREY_300, lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 38 },
        2: { cellWidth: 26, halign: 'right' },
        3: { cellWidth: 26, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
      },
      didDrawCell(data) {
        // Linha sob header
        if (data.section === 'head' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        // Linha sutil entre linhas do corpo
        if (data.section === 'body' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...GREY_300);
          doc.setLineWidth(0.1);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = (data.cell.raw || '').toString().replace('%', '');
          const v = parseFloat(raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v < 0 ? NEG : v < 10 ? GREY_900 : POS;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA: Concentração de Receita ──────────────────────────
  function _paginaConcentracao(doc, conc, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 3, 'Concentração de Receita');

    let y = _drawSectionTitle(doc, 3, 'Concentração de Receita',
      'Top 5 contratos e índice de concentração CR5');

    // Indicador CR5 em destaque
    const cr5Color = conc.cr5 > 70 ? NEG : conc.cr5 > 50 ? GREY_900 : POS;
    _drawKpi(doc, MARGIN, y, 60, 'CR5 — top 5 / carteira',
      conc.cr5.toFixed(1) + '%',
      conc.cr5 > 70 ? 'Concentração elevada (risco de cliente)' :
      conc.cr5 > 50 ? 'Concentração moderada' :
      'Concentração saudável', cr5Color);

    _drawKpi(doc, MARGIN + 75, y, 60, 'Total de contratos',
      String(conc.totalContratos), 'Ativos com valor', INK);

    _drawKpi(doc, MARGIN + 130, y, 35, 'Carteira',
      _brl(conc.totalContratado).replace('R$', '').trim(), 'em R$', INK);

    y += 32;

    // Tabela top 5
    const body = conc.top5.map((c, i) => [
      String(i + 1),
      c.nome.slice(0, 45),
      c.cliente.slice(0, 25),
      _brl(c.valor),
      c.pct.toFixed(1) + '%',
    ]);

    doc.autoTable({
      head: [['#', 'Contrato', 'Cliente', 'Valor', '% Carteira']],
      body: body.length > 0 ? body : [['—', 'Sem contratos ativos', '', '', '']],
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { font: FONT, fontSize: 9, cellPadding: 3, textColor: INK },
      headStyles: {
        fillColor: [255, 255, 255], textColor: GREY_500,
        fontStyle: 'bold', fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: GREY_500 },
        1: { cellWidth: 70 },
        2: { cellWidth: 40 },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell(data) {
        if (data.section === 'head' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'body' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...GREY_300);
          doc.setLineWidth(0.1);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
      },
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA: Fluxo de Caixa ───────────────────────────────────
  function _paginaFluxo(doc, fluxo, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 4, 'Fluxo de Caixa');

    let y = _drawSectionTitle(doc, 4, 'Fluxo de Caixa',
      'Movimentação dos últimos 6 meses · entradas, saídas e saldo do período');

    const totE = fluxo.reduce((s, m) => s + m.entradas, 0);
    const totS = fluxo.reduce((s, m) => s + m.saidas, 0);

    const body = fluxo.map(m => [
      m.label,
      _brl(m.entradas),
      _brl(m.saidas),
      _brl(m.entradas - m.saidas),
    ]);

    doc.autoTable({
      head: [['Mês', 'Entradas', 'Saídas', 'Saldo do período']],
      body,
      foot: [['Acumulado', _brl(totE), _brl(totS), _brl(totE - totS)]],
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { font: FONT, fontSize: 9.5, cellPadding: 4, textColor: INK },
      headStyles: {
        fillColor: [255, 255, 255], textColor: GREY_500,
        fontStyle: 'bold', fontSize: 7.5,
      },
      footStyles: {
        fillColor: [255, 255, 255], textColor: INK,
        fontStyle: 'bold', fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 42, halign: 'right' },
        2: { cellWidth: 42, halign: 'right' },
        3: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell(data) {
        if (data.section === 'head' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'body' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...GREY_300);
          doc.setLineWidth(0.1);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'foot' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y, PAGE_W - MARGIN, r.y);
        }
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = (data.cell.raw || '').toString().replace(/[R$\s.]/g, '').replace(',', '.');
          const v = parseFloat(raw);
          if (!isNaN(v)) data.cell.styles.textColor = v < 0 ? NEG : POS;
        }
      },
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA: Aging de Contas a Receber ────────────────────────
  function _paginaAging(doc, aging, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 5, 'Aging — Contas a Receber');

    let y = _drawSectionTitle(doc, 5, 'Aging — Contas a Receber',
      'Distribuição das NFs em aberto por faixa de atraso');

    const body = aging.buckets.map(b => [
      b.label,
      String(b.qtd),
      _brl(b.valor),
      aging.total > 0 ? (b.valor / aging.total * 100).toFixed(1) + '%' : '0,0%',
    ]);

    doc.autoTable({
      head: [['Faixa', 'NFs', 'Valor', '% do total']],
      body,
      foot: [['Total em aberto',
        String(aging.buckets.reduce((s, b) => s + b.qtd, 0)),
        _brl(aging.total),
        '100,0%']],
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { font: FONT, fontSize: 9.5, cellPadding: 4, textColor: INK },
      headStyles: {
        fillColor: [255, 255, 255], textColor: GREY_500,
        fontStyle: 'bold', fontSize: 7.5,
      },
      footStyles: {
        fillColor: [255, 255, 255], textColor: INK,
        fontStyle: 'bold', fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 25, halign: 'right' },
        2: { cellWidth: 50, halign: 'right' },
        3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      didDrawCell(data) {
        if (data.section === 'head' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'body' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...GREY_300);
          doc.setLineWidth(0.1);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'foot' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y, PAGE_W - MARGIN, r.y);
        }
        // Destaque visual nas linhas críticas (>90d)
        if (data.section === 'body' && data.row.raw && data.row.raw[0] === 'Vencidas >90d') {
          data.cell.styles.textColor = NEG;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA: Riscos e Alertas ─────────────────────────────────
  function _paginaRiscos(doc, riscos, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 6, 'Riscos e Alertas');

    let y = _drawSectionTitle(doc, 6, 'Riscos e Alertas',
      'Itens que demandam atenção da gestão · ordenados por severidade');

    if (!riscos || riscos.length === 0) {
      doc.setFont(FONT, 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...GREY_500);
      doc.text('Nenhum risco material identificado no período analisado.', MARGIN, y);
      _drawFooter(doc, pageNum, totalPages, periodoLabel);
      return;
    }

    const body = riscos.map(r => [
      r.sev,
      r.cat,
      r.desc,
      r.impacto > 0 ? _brl(r.impacto) : '—',
    ]);

    doc.autoTable({
      head: [['Severidade', 'Categoria', 'Descrição', 'Impacto financeiro']],
      body,
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: { font: FONT, fontSize: 9.5, cellPadding: 4, textColor: INK },
      headStyles: {
        fillColor: [255, 255, 255], textColor: GREY_500,
        fontStyle: 'bold', fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        1: { cellWidth: 28, textColor: GREY_700 },
        2: { cellWidth: 80 },
        3: { cellWidth: 36, halign: 'right' },
      },
      didDrawCell(data) {
        if (data.section === 'head' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...NAVY);
          doc.setLineWidth(0.4);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
        if (data.section === 'body' && data.column.index === 0) {
          const r = data.row;
          doc.setDrawColor(...GREY_300);
          doc.setLineWidth(0.1);
          _hline(doc, MARGIN, r.y + r.height, PAGE_W - MARGIN, r.y + r.height);
        }
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 0) {
          const sev = (data.cell.raw || '').toString();
          if (sev === 'Alta') data.cell.styles.textColor = NEG;
          else if (sev === 'Média') data.cell.styles.textColor = GREY_900;
          else data.cell.styles.textColor = GREY_500;
        }
      },
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── PÁGINA: Notas Metodológicas ──────────────────────────────
  function _paginaNotas(doc, pageNum, totalPages, periodoLabel) {
    doc.addPage();
    _drawLetterhead(doc, 7, 'Notas Metodológicas');

    let y = _drawSectionTitle(doc, 7, 'Notas Metodológicas',
      'Definições, fórmulas e ressalvas aplicáveis a este relatório');

    const notas = [
      ['Saldo em caixa', 'Σ(entradas) − Σ(saídas) sobre todos os lançamentos do módulo Caixa, sem corte de período. Reflete posição patrimonial bruta.'],
      ['Margem média', 'Média aritmética simples das margens dos contratos ativos. Margem do contrato = (valor − saídas) ÷ valor × 100. Cada contrato pesa igual, independentemente do tamanho.'],
      ['CR5 (concentração de receita)', 'Soma do percentual da carteira contratada que os 5 maiores contratos ativos representam. Acima de 70% indica concentração elevada e risco de cliente material.'],
      ['Aging — A receber', 'NFs em aberto (não emitidas/recebidas) classificadas pelo número de dias entre a data limite e a data de emissão deste relatório. Buckets padrão: 0, 1–30, 31–60, 61–90 e >90 dias.'],
      ['Runway de caixa', 'Saldo atual ÷ gasto mensal médio dos últimos 90 dias. Estima quantos meses a operação se sustenta sem novas entradas.'],
      ['Variações vs. mês anterior', 'Calculadas sobre o fechamento do mês civil imediatamente anterior. Variações apresentadas em pontos percentuais ou em porcentagem absoluta conforme o indicador.'],
      ['Fonte dos dados', 'Sistema Rhino — base Postgres consolidada na data de emissão. Lançamentos posteriores não estão refletidos neste documento.'],
    ];

    notas.forEach(([titulo, texto]) => {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(titulo, MARGIN, y);
      y += 5;

      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GREY_700);
      const lines = doc.splitTextToSize(texto, CONTENT_W);
      doc.text(lines, MARGIN, y, { lineHeightFactor: 1.4 });
      y += lines.length * 4.5 + 4;
    });

    _drawFooter(doc, pageNum, totalPages, periodoLabel);
  }

  // ── Pinta numerações totais "X de Y" depois de tudo gerado ───
  function _atualizarNumeracaoTotal(doc, periodoLabel) {
    const total = doc.internal.getNumberOfPages();
    // Capa não tem footer — começa da página 2
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      // Apaga o footer com retângulo branco e redesenha com total
      doc.setFillColor(255, 255, 255);
      doc.rect(0, PAGE_H - 16, PAGE_W, 16, 'F');
      _drawFooter(doc, i - 1, total - 1, periodoLabel);
    }
  }

  // ── API pública ──────────────────────────────────────────────
  window.RhinoRelatorio = {
    async gerar() {
      window.showToast('Gerando relatório executivo…', 'info');
      try {
        await RhinoLazy.ensure(['jspdf', 'jspdf-autotable']);
        await Promise.all([Store.loadAll(), _loadLogo()]);

        const nfsList = Store.state.notas_fiscais || [];
        const cpList  = Store.state.contas_pagar  || [];
        const contracts = Store.state.contracts   || [];
        const saidas    = Store.state.saidas      || [];
        const caixaRaw  = Store.state.caixa;
        const caixaEntries = Array.isArray(caixaRaw) ? caixaRaw : (caixaRaw?.entries || []);

        const { jsPDF } = window.jspdf;
        if (!window.jsPDF) window.jsPDF = jsPDF;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // ── Cálculos ──
        const saidasMap = _saidasByContract(saidas);
        const saldoCaixa = _calcSaldoCaixa(caixaEntries);
        const ativos = contracts.filter(c => c.status === 'ativo');
        const totalContratado = ativos.reduce((s, c) => s + (parseFloat(c.value) || 0), 0);
        const margens = ativos.filter(c => c.value > 0).map(c => {
          const s = saidasMap[c.id] || 0;
          return (c.value - s) / c.value * 100;
        });
        const margemMedia = margens.length > 0 ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;

        const fluxo = _calcFluxoMensal(caixaEntries);
        const mesAtual = fluxo[fluxo.length - 1] || { entradas: 0, saidas: 0 };
        const mesAnt   = fluxo[fluxo.length - 2] || { entradas: 0, saidas: 0 };
        const faturamentoMes = mesAtual.entradas;
        const varFatPct = mesAnt.entradas > 0
          ? ((mesAtual.entradas - mesAnt.entradas) / mesAnt.entradas * 100) : null;

        // Variação saldo: comparar com saldo do mês anterior (fechamento)
        const hoje = new Date();
        const ultimoDiaMesAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
          .toISOString().split('T')[0];
        const saldoMesAnt = _calcSaldoCaixa(caixaEntries.filter(e => e.date && e.date <= ultimoDiaMesAnt));
        const varSaldoPct = saldoMesAnt > 0
          ? ((saldoCaixa - saldoMesAnt) / saldoMesAnt * 100) : null;

        // Runway: saldo / (gasto médio mensal dos últimos 90d)
        const d90 = new Date(); d90.setDate(d90.getDate() - 90);
        const d90Str = d90.toISOString().split('T')[0];
        const gasto90 = caixaEntries
          .filter(e => e.type === 'saida' && e.date && e.date >= d90Str)
          .reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
        const gastoMensal = gasto90 / 3;
        const runwayMeses = gastoMensal > 0 ? (saldoCaixa / gastoMensal).toFixed(1) : '—';

        const totalAReceber = (nfsList || []).filter(n => !n.emitida && n.status !== 'emitida')
          .reduce((s, n) => s + (parseFloat(n.valor || n.totalLiquido || n.valorTotal) || 0), 0);
        const qtdNFsPend = (nfsList || []).filter(n => !n.emitida && n.status !== 'emitida').length;
        const totalAPagar = (cpList || []).filter(c => c.status === 'pendente' || c.status === 'aberto')
          .reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
        const qtdCpPend = (cpList || []).filter(c => c.status === 'pendente' || c.status === 'aberto').length;

        const conc = _calcConcentracaoReceita(contracts, saidasMap);
        const aging = _calcAgingARecever(nfsList);
        const riscos = _calcRiscos(contracts, nfsList, cpList, saidasMap);
        const riscosAlta = riscos.filter(r => r.sev === 'Alta').length;

        const dados = {
          saldoCaixa, varSaldoPct,
          contratosAtivos: ativos.length, totalContratado, margemMedia,
          totalAReceber, qtdNFsPend, totalAPagar, qtdCpPend,
          faturamentoMes, varFatPct,
          runwayMeses, cr5: conc.cr5, riscosAlta,
        };

        const periodoLabel = 'Acumulado · Posição em ' +
          new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

        // ── Geração ──
        _paginaCapa(doc, periodoLabel);

        const secoes = [
          { num: 1, titulo: 'Sumário Executivo',     pagina: 3 },
          { num: 2, titulo: 'Portfólio de Contratos', pagina: 4 },
          { num: 3, titulo: 'Concentração de Receita', pagina: 5 },
          { num: 4, titulo: 'Fluxo de Caixa',         pagina: 6 },
          { num: 5, titulo: 'Aging — Contas a Receber', pagina: 7 },
          { num: 6, titulo: 'Riscos e Alertas',       pagina: 8 },
          { num: 7, titulo: 'Notas Metodológicas',    pagina: 9 },
        ];

        _paginaSumario(doc, secoes, 1, null, periodoLabel);
        _paginaResumo(doc, dados, 2, null, periodoLabel);
        _paginaContratos(doc, contracts, saidasMap, 3, null, periodoLabel);
        _paginaConcentracao(doc, conc, 4, null, periodoLabel);
        _paginaFluxo(doc, fluxo, 5, null, periodoLabel);
        _paginaAging(doc, aging, 6, null, periodoLabel);
        _paginaRiscos(doc, riscos, 7, null, periodoLabel);
        _paginaNotas(doc, 8, null, periodoLabel);

        // Re-escreve footers com numeração "X de Y" agora que sabemos o total
        _atualizarNumeracaoTotal(doc, periodoLabel);

        const nomeArquivo = 'rhino-relatorio-gerencial-' +
          new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(nomeArquivo);
        window.showToast('Relatório gerado com sucesso', 'success');

      } catch (e) {
        console.error('[RhinoRelatorio]', e);
        window.showToast('Erro ao gerar relatório: ' + e.message, 'error');
      }
    },
  };
})();
