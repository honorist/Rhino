// Layout puro (sem DOM) do organograma visual em SVG.
// Monta a árvore a partir de supervisorId (mesmo padrão do CMPC_ORGANOGRAMA,
// mas com profundidade fixa de 3 níveis: encarregado → lider_area → profissional),
// calcula posições x/y sem sobreposição (tidy tree) e gera os caminhos dos
// conectores em estilo "barramento" (desce do pai → trilho horizontal → sobe no filho).
window.OrgChartLayout = (function () {
  const CARD_W = 200;
  const CARD_H = 76;
  const H_GAP = 32;
  const V_GAP = 56;

  function buildTree(membros) {
    const byId = new Map(membros.map(m => [m.id, m]));
    const filhosDe = new Map();
    const raizes = [];

    membros.forEach(m => {
      const supervisorValido = m.supervisorId && byId.has(m.supervisorId);
      if (supervisorValido) {
        if (!filhosDe.has(m.supervisorId)) filhosDe.set(m.supervisorId, []);
        filhosDe.get(m.supervisorId).push(m);
      } else {
        raizes.push(m);
      }
    });

    const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '');
    raizes.sort(porNome);
    filhosDe.forEach(lista => lista.sort(porNome));

    return { raizes, filhosDe };
  }

  // Tidy tree simples: folha ocupa cardW; nó interno ocupa a soma dos filhos
  // (com hGap entre eles), no mínimo cardW. x devolvido é relativo ao início
  // do subtree (offset 0); é deslocado para posição absoluta em posicionar().
  function calcularLargura(membro, filhosDe, larguras, cfg) {
    const filhos = filhosDe.get(membro.id) || [];
    if (filhos.length === 0) {
      larguras.set(membro.id, cfg.cardW);
      return cfg.cardW;
    }
    let total = 0;
    filhos.forEach((f, i) => {
      if (i > 0) total += cfg.hGap;
      total += calcularLargura(f, filhosDe, larguras, cfg);
    });
    const largura = Math.max(cfg.cardW, total);
    larguras.set(membro.id, largura);
    return largura;
  }

  function posicionar(membro, filhosDe, larguras, offsetX, depth, nodes, cfg) {
    const largura = larguras.get(membro.id);
    const filhos = filhosDe.get(membro.id) || [];

    let x;
    if (filhos.length === 0) {
      x = offsetX + largura / 2;
    } else {
      let cursor = offsetX;
      const centrosFilhos = [];
      filhos.forEach((f, i) => {
        if (i > 0) cursor += cfg.hGap;
        const larguraFilho = larguras.get(f.id);
        posicionar(f, filhosDe, larguras, cursor, depth + 1, nodes, cfg);
        centrosFilhos.push(cursor + larguraFilho / 2);
        cursor += larguraFilho;
      });
      x = (centrosFilhos[0] + centrosFilhos[centrosFilhos.length - 1]) / 2;
    }

    nodes.push({
      id: membro.id,
      membro,
      x,
      y: depth * (cfg.cardH + cfg.vGap),
      width: cfg.cardW,
      height: cfg.cardH,
    });
  }

  function conectorPath(pai, filho, cfg) {
    const px = pai.x;
    const py = pai.y + cfg.cardH;
    const cx = filho.x;
    const cy = filho.y;
    const trunkY = py + (cy - py) / 2;
    return `M ${px} ${py} L ${px} ${trunkY} L ${cx} ${trunkY} L ${cx} ${cy}`;
  }

  function buildOrgChartLayout(membros, opts) {
    if (!membros || membros.length === 0) {
      return { nodes: [], connectors: [], width: 0, height: 0 };
    }
    opts = opts || {};
    const cfg = {
      cardW: opts.cardWidth || CARD_W,
      cardH: opts.cardHeight || CARD_H,
      hGap: opts.hGap != null ? opts.hGap : H_GAP,
      vGap: opts.vGap != null ? opts.vGap : V_GAP,
    };

    const { raizes, filhosDe } = buildTree(membros);
    const larguras = new Map();
    membros.forEach(m => calcularLargura(m, filhosDe, larguras, cfg));

    const nodes = [];
    let cursor = 0;
    raizes.forEach((raiz, i) => {
      if (i > 0) cursor += cfg.hGap;
      posicionar(raiz, filhosDe, larguras, cursor, 0, nodes, cfg);
      cursor += larguras.get(raiz.id);
    });

    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const connectors = [];
    filhosDe.forEach((filhos, paiId) => {
      filhos.forEach(f => {
        connectors.push({
          fromId: paiId,
          toId: f.id,
          path: conectorPath(byId[paiId], byId[f.id], cfg),
        });
      });
    });

    const width = Math.max(...nodes.map(n => n.x + n.width / 2));
    const height = Math.max(...nodes.map(n => n.y + n.height));

    return { nodes, connectors, width, height };
  }

  return { buildOrgChartLayout, CARD_W, CARD_H, H_GAP, V_GAP };
})();
