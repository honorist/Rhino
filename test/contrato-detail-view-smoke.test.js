'use strict';
/**
 * @file Smoke test de runtime da tela de detalhe de contrato — o core
 * (js/views/ContratoDetail.js) mais os 19 mixins de js/views/contrato/*.js que
 * o estendem via Object.assign.
 *
 * Existe para ser a REDE DE SEGURANÇA da repaginação da tela (plano
 * cozy-churning-fog): o core tem 1.378 linhas e vai ser fatiado em mixins, e o
 * despacho de aba (ContratoDetail.js:578-614) é uma cadeia de ternários que
 * chama `this.renderXSection(...)` — se um refactor mover um método para o
 * arquivo errado, esquecer de registrá-lo no `_lazyManifest` de js/app.js, ou
 * perdê-lo no caminho, nada quebra até alguém abrir aquela aba em produção.
 *
 * A lista de scripts é lida do PRÓPRIO manifest de js/app.js (não duplicada
 * aqui) — assim o teste também pega "mixin novo não registrado no manifest" e
 * "manifest aponta para arquivo que não existe".
 *
 * Mesmo padrão de test/dashboard-view-smoke.test.js e
 * test/audit-view-smoke.test.js: sandbox `vm` com stubs, sem DOM real.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');

/** Extrai do _lazyManifest de js/app.js a lista de scripts da rota do contrato. */
function scriptsDoManifest() {
  const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const bloco = appJs.match(/'#\/contratos\/:id':\s*\{[\s\S]*?scripts:\s*\[([\s\S]*?)\]/);
  assert.ok(bloco, 'não achei o bloco #/contratos/:id no _lazyManifest de js/app.js');
  return [...bloco[1].matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
}

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** Elemento DOM burro o bastante para o corpo dos render* não estourar. */
function fakeEl() {
  const el = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    children: [],
    appendChild() {},
    removeChild() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getContext: () => null,
    focus() {},
    click() {},
  };
  return el;
}

function carregarView() {
  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => fakeEl(),
      addEventListener() {},
      removeEventListener() {},
      body: fakeEl(),
      documentElement: fakeEl(),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    escapeHtml,
    console,
    Date,
    Intl,
    Math,
    JSON,
    setTimeout: () => 0,
    clearTimeout() {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    Store: {
      state: {
        caixa: [],
        contas_pagar: [],
        notas_fiscais: [],
        recursos: [],
        contracts: [],
        base: [],
        tipos_base: [],
        docTemplates: [],
      },
      formatBRL: (v) => 'R$ ' + Number(v || 0).toFixed(2),
      formatBRLk: (v) => 'R$ ' + Number(v || 0).toFixed(1) + 'k',
      getSaidasByContract: () => [],
      getSaidasByType: () => ({}),
      getBaseAllocationsForContract: () => [],
      getTotalSaidasByContract: () => 0,
      getContractById: () => null,
    },
  };

  // Globais que os mixins tocam durante o render (todos no-op: o smoke só
  // garante que a montagem do HTML não estoura, não que a UI funcione).
  sandbox.window.escapeHtml = escapeHtml;
  sandbox.window.rhIcon = () => '<svg></svg>';
  sandbox.window.rhStatusPill = () => '<span></span>';
  sandbox.window.showToast = () => {};
  sandbox.window.perfil = {
    podeEditar: () => true,
    podeContractTab: () => true,
    podeVerValores: () => true,
    primeiraContractTab: () => 'visao',
    abas: () => null,
  };
  sandbox.window.UIKit = {
    smartBack: () => '',
    breadcrumb: () => '',
    pageHeader: () => '',
    chips: () => '',
    downloadCsv: () => {},
    paginate: (itens) => ({ page: 1, pageSize: 25, total: (itens || []).length, totalPages: 1, start: 0, end: (itens || []).length, slice: itens || [] }),
    pagination: () => '',
    wirePagination: () => {},
  };
  sandbox.window.RhinoLazy = { ensure: () => Promise.resolve() };
  sandbox.window.RhinoExport = { csv: () => {}, tablePdf: () => Promise.resolve() };
  sandbox.window.BRLInput = { attach: () => {} };
  sandbox.window.viewLifecycle = { onCleanup: () => {} };
  sandbox.window.OrgChartLayout = { layout: () => ({ nodes: [], links: [], width: 0, height: 0 }) };
  sandbox.window.Store = sandbox.Store;
  sandbox.window.innerWidth = 1440;
  sandbox.window.innerHeight = 900;
  sandbox.window.devicePixelRatio = 1;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);

  // Carregado EAGER no index.html (fora do _lazyManifest) porque o gate de
  // permissão precisa dele no boot — então entra aqui antes dos mixins.
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/lib/contrato-tabs.js'), 'utf8'),
    sandbox,
    { filename: 'js/lib/contrato-tabs.js' }
  );

  const scripts = scriptsDoManifest();
  for (const rel of scripts) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `manifest de js/app.js aponta para arquivo inexistente: ${rel}`);
    vm.runInContext(fs.readFileSync(abs, 'utf8'), sandbox, { filename: rel });
  }
  return { CD: sandbox.window.ContratoDetail, scripts, sandbox };
}

const { CD, scripts, sandbox } = carregarView();

/** Troca o tema lido por document.documentElement.getAttribute('data-theme'). */
function comTema(tema, fn) {
  const orig = sandbox.document.documentElement.getAttribute;
  sandbox.document.documentElement.getAttribute = (attr) =>
    attr === 'data-theme' ? tema : null;
  try {
    return fn();
  } finally {
    sandbox.document.documentElement.getAttribute = orig;
  }
}

/** Contrato "recém-criado": tudo zerado/vazio — o pior caso de render. */
function contratoZerado() {
  return {
    id: 'ctr_smoke',
    name: 'Obra Smoke',
    client: 'Cliente Smoke',
    contractNumber: '001',
    status: 'ativo',
    value: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    rdos: [],
    organograma: [],
    aditivos: [],
    marcos: [],
    ocorrencias: [],
    budget: [],
  };
}

// Os render* despachados pela cadeia de abas em ContratoDetail.js:578-614.
const SECOES = [
  'renderMedicaoSection',
  'renderDreSection',
  'renderEvmSection',
  'renderPunchSection',
  'renderSsmaSection',
  'renderDatabookSection',
  'renderCronogramaSection',
  'renderOrganogramaSection',
  'renderRdoSection',
  'renderAditivosSection',
  'renderMarcosSection',
  'renderOcorrenciasSection',
  'renderTimelineSection',
];

test('manifest carrega o core + todos os mixins sem lançar', () => {
  assert.ok(scripts.length >= 20, `manifest com ${scripts.length} scripts — esperava ao menos 20`);
  assert.ok(scripts.includes('js/views/ContratoDetail.js'), 'core ausente do manifest');
  assert.ok(CD && typeof CD.render === 'function', 'window.ContratoDetail.render não existe');
});

test('todo render* despachado pela barra de abas existe depois dos mixins', () => {
  const faltando = SECOES.filter((m) => typeof CD[m] !== 'function');
  assert.deepStrictEqual(
    faltando,
    [],
    `método(s) despachado(s) pela barra de abas mas inexistente(s) — mixin não registrado no _lazyManifest de js/app.js, ou método perdido num refactor: ${faltando.join(', ')}`
  );
});

test('cada seção renderiza string com contrato zerado (sem lançar)', () => {
  for (const metodo of SECOES) {
    const c = contratoZerado();
    let html;
    assert.doesNotThrow(() => {
      html = CD[metodo](c, c.id);
    }, `${metodo} lançou com contrato zerado`);
    assert.strictEqual(typeof html, 'string', `${metodo} não devolveu string`);
  }
});

test('_podeEditar responde sem perfil carregado', () => {
  assert.strictEqual(typeof CD._podeEditar(), 'boolean');
});

// ── P0#1: os CTAs da Visão Geral chamavam render() com string ───────────────
// `render(params)` lê `params?.id` (ContratoDetail.js:75-77); recebendo a
// string o id vira undefined e a tela cai em "Contrato não encontrado"
// (:89-92) — e o event.preventDefault() do próprio onclick impede o href de
// salvar o usuário. charts.js:339 sempre fez certo (`render({id:...})`), o que
// mostra que era regressão, não intenção.
test('CTAs da Visão Geral chamam render({id}), nunca render(string)', () => {
  const c = contratoZerado();
  const html = [
    CD._renderEquipeAlocadaTable(c),
    CD._renderSidebarVisao(c, [], []),
  ].join('\n');

  const chamadasQuebradas = html.match(/ContratoDetail\.render\('/g) || [];
  assert.deepStrictEqual(
    chamadasQuebradas,
    [],
    `${chamadasQuebradas.length} CTA(s) chamando render('id') com string — cai em "Contrato não encontrado"`
  );
  assert.ok(
    /ContratoDetail\.render\(\s*\{/.test(html),
    'esperava ao menos um CTA chamando render({ id: ... })'
  );
});

// ── P0#3: a Timeline nunca mostrava RDO ────────────────────────────────────
// O laço lia `r.date` e `r.condition`, mas o modelo do RDO usa `data` e não
// tem `condition` (handlers/contract-rdos.js, js/views/contrato/rdos.js:9,93).
// `r.date` era sempre undefined → o `if` nunca passava → a aba que promete a
// cronologia da obra omitia justamente a fonte mais densa de eventos.
test('Timeline inclui os RDOs do contrato', () => {
  const c = contratoZerado();
  c.rdos = [
    { id: 'rdo1', numero: 7, data: '2026-03-10', tempo: { manha: { tempo: 'bom' } } },
    { id: 'rdo2', numero: 8, data: '2026-03-11' },
  ];
  const html = CD.renderTimelineSection(c, c.id);

  assert.ok(
    !html.includes('Nenhum evento registrado'),
    'contrato com 2 RDOs caiu no estado vazio da Timeline'
  );
  assert.ok(html.includes('2026'), 'esperava a data do RDO na timeline');
  assert.ok(/RDO/.test(html), 'esperava o rótulo RDO na timeline');
  assert.ok(html.includes('#7') && html.includes('#8'), 'esperava o número de cada RDO');
});

// ── P0#6: o badge da aba RDO premiava quem trabalha certo ──────────────────
// O badge era `(contract.rdos||[]).length` — o TOTAL de RDOs — pintado com
// var(--color-danger). Obra de 10 meses com RDO em dia exibia "213" vermelho
// de alarme: quanto melhor a compliance, mais forte o alerta.
//
// A conta de dias úteis sem RDO já existia inline dentro de renderRdoSection;
// virou `_rdoCompliance(contract, hojeISO)` para que badge e seção usem a
// MESMA conta (uma só, não duas), com o relógio injetável para ser testável.
// Na Fase 3 essa conta migra pro servidor (lib/feriados.js já trata feriado,
// que esta versão cliente ignora) — e aí há um único ponto de troca.
test('_rdoCompliance: obra em dia não gera alarme', () => {
  const c = contratoZerado();
  // 2026-03-11 é uma quarta; RDO lançado na terça (último dia útil).
  c.rdos = [{ id: 'r1', numero: 1, data: '2026-03-10' }];
  const comp = CD._rdoCompliance(c, '2026-03-11');
  assert.strictEqual(comp.atrasado, false, 'RDO do último dia útil não é atraso');
  assert.strictEqual(comp.badge, 0, 'obra em dia não pode exibir badge vermelho');
});

test('_rdoCompliance: conta dias ÚTEIS sem RDO e ignora fim de semana', () => {
  const c = contratoZerado();
  // RDO na sexta 2026-03-06; hoje é quarta 2026-03-11.
  // Úteis desde então: seg 9, ter 10, qua 11 = 3 (sáb/dom não contam).
  c.rdos = [{ id: 'r1', numero: 1, data: '2026-03-06' }];
  const comp = CD._rdoCompliance(c, '2026-03-11');
  assert.strictEqual(comp.diasUteisSem, 3);
  assert.strictEqual(comp.atrasado, true);
  assert.strictEqual(comp.badge, 3, 'badge deve contar dias em atraso, não RDOs totais');
});

test('_rdoCompliance: obra sem nenhum RDO é atraso, não zero', () => {
  const comp = CD._rdoCompliance(contratoZerado(), '2026-03-11');
  assert.strictEqual(comp.ultimoRdo, null);
  assert.strictEqual(comp.atrasado, true);
  assert.ok(comp.badge > 0, 'obra sem RDO nenhum precisa sinalizar');
});

test('_rdoCompliance: fim de semana não acusa atraso (RDO é ocasional)', () => {
  const c = contratoZerado();
  c.rdos = [{ id: 'r1', numero: 1, data: '2026-03-06' }]; // sexta
  const comp = CD._rdoCompliance(c, '2026-03-08'); // domingo
  assert.strictEqual(comp.ehFimDeSemana, true);
  assert.strictEqual(comp.badge, 0, 'domingo não pode acusar atraso de RDO');
});

// ── P0#4: gráficos do contrato não seguiam o tema ──────────────────────────
// renderBarrasOrcado cravava ticks '#FFFFFF' e grade branca (charts.js:123-134)
// — o canvas fica sobre --color-surface-2 (#F9FAFB no tema claro, que é o
// PADRÃO do app), então "Orçado × Realizado" tinha eixos brancos sobre
// quase-branco: ilegível para todo usuário em tema claro. E renderCurvaS fazia
// o oposto (grade 'rgba(0,0,0,.06)', assumindo claro). Agora ambos leem a
// mesma fonte de cor.
test('_chartTheme: cores de eixo seguem o tema ativo', () => {
  const claro = comTema(null, () => CD._chartTheme());
  const escuro = comTema('dark', () => CD._chartTheme());

  assert.ok(claro.text && escuro.text, 'esperava cor de texto nos dois temas');
  assert.notStrictEqual(
    claro.text,
    escuro.text,
    'cor de texto do eixo tem que mudar entre claro e escuro'
  );
  assert.notStrictEqual(claro.grid, escuro.grid, 'cor da grade tem que mudar entre os temas');

  // O bug era exatamente este: branco no tema claro.
  assert.ok(
    !/^#f{3,6}$/i.test(String(claro.text).replace(/\s/g, '')),
    `tema claro não pode usar texto branco no eixo (veio ${claro.text})`
  );
});

test('nenhum gráfico do contrato crava cor de eixo fixa no fonte', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/views/contrato/charts.js'), 'utf8');
  const eixosFixos = src
    .split('\n')
    .filter((l) => /ticks:|grid:/.test(l))
    .filter((l) => /#FFFFFF|rgba\(255,255,255|rgba\(0,0,0/.test(l))
    // A linha do próprio _chartTheme() cita as duas cores de propósito — é ela
    // que ESCOLHE conforme o tema, então não é cor cravada.
    .filter((l) => !/isDark/.test(l));
  assert.deepStrictEqual(
    eixosFixos,
    [],
    `eixo com cor fixa (não segue tema):\n${eixosFixos.join('\n')}`
  );
});

// ── P0#2: salvou, mas a tela mostrava o dado velho ─────────────────────────
// Store.loadAll() tem TTL de 60s e retorna sem fazer nada se o cache está
// fresco (js/store.js:113-120). Os handlers de mutação chamavam loadAll() logo
// depois do POST/PUT/DELETE — dentro da janela do TTL, virava no-op: o usuário
// criava o Aditivo 04, o modal fechava e a tabela continuava com 3. Ele criava
// de novo → duplicidade.
//
// Store.invalidate() (js/store.js:195) já era o idioma da casa pra isso
// (store.js:1263,1272,1281 usam exatamente assim, com o mesmo comentário de
// "força rebusca"). A regra: todo loadAll() que vem DEPOIS de uma mutação
// precisa ser precedido de invalidate().
test('todo loadAll() pós-mutação é precedido de invalidate()', () => {
  const arquivos = ['js/views/ContratoDetail.js', 'js/views/contrato/modais-extra.js'];
  const violacoes = [];

  for (const rel of arquivos) {
    const linhas = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (!/Store\.loadAll\(/.test(linha)) return;
      // O loadAll do carregamento inicial da tela deve MANTER o TTL — é ele que
      // evita refetch a cada troca de aba. Só os pós-mutação entram na regra.
      const ehCargaInicial = /^\s*await Store\.loadAll\(\);\s*$/.test(linha)
        && linhas.slice(Math.max(0, i - 6), i).some((l) => /try \{/.test(l));
      if (ehCargaInicial) return;

      const janela = linhas.slice(Math.max(0, i - 4), i + 1).join('\n');
      if (!/invalidate\(\)|loadAll\(\s*\{[^}]*force/.test(janela)) {
        violacoes.push(`${rel}:${i + 1}  ${linha.trim()}`);
      }
    });

    // O recarregamento pós-mutação preferido é `loadContract(id, {force:true})`
    // — recarrega SÓ a obra aberta em vez de baixar a base inteira de novo.
    // Sem o `force` ele cai no mesmo TTL e o problema volta.
    linhas.forEach((linha, i) => {
      if (!/Store\.loadContract\(/.test(linha)) return;
      const ehCargaInicial = /await Store\.loadContract\(contractId\);\s*$/.test(linha.trim());
      if (ehCargaInicial) return;
      if (!/force/.test(linha)) {
        violacoes.push(`${rel}:${i + 1}  loadContract sem force: ${linha.trim()}`);
      }
    });
  }

  assert.deepStrictEqual(
    violacoes,
    [],
    `loadAll() pós-mutação sem invalidate() — o TTL de 60s faz virar no-op e a tela fica com dado velho:\n${violacoes.join('\n')}`
  );
});

// ── P0#8: cinco modais disputando o mesmo id="modalOverlay" ────────────────
// modais.js:12, modais-extra.js:112 e :215, organograma.js:781 e :915 criam
// overlays com o MESMO id, e cada um recuperava o nó com
// document.getElementById('modalOverlay') — que devolve sempre o PRIMEIRO do
// DOM. Com dois modais empilhados (detalhe do colaborador → editar membro), o
// ✕ e o overlay.remove() agiam no modal errado.
//
// Como todos inserem com body.insertAdjacentHTML('beforeend', ...), o nó
// recém-criado é body.lastElementChild — referência exata, imune a empilhamento.
test('nenhum modal do contrato recupera o overlay por id compartilhado', () => {
  const arquivos = [
    'js/views/contrato/modais.js',
    'js/views/contrato/modais-extra.js',
    'js/views/contrato/organograma.js',
  ];
  const violacoes = [];
  for (const rel of arquivos) {
    fs.readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        if (/getElementById\(['"]modalOverlay['"]\)/.test(linha)) {
          violacoes.push(`${rel}:${i + 1}  ${linha.trim()}`);
        }
      });
  }
  assert.deepStrictEqual(
    violacoes,
    [],
    `overlay recuperado por id compartilhado (pega o primeiro do DOM, não o recém-aberto):\n${violacoes.join('\n')}`
  );
});

// ── Fase 1: navegação em 2 níveis ──────────────────────────────────────────
test('_renderNavAbas monta os 5 grupos e as folhas do grupo ativo', () => {
  const c = contratoZerado();
  CD._tab = 'painel';
  const html = CD._renderNavAbas(c, { passagensPendentes: [] });

  for (const g of ['Painel', 'Execução', 'Financeiro', 'Qualidade &amp; Segurança', 'Equipe']) {
    // O rótulo do grupo Qualidade tem & literal no registry; comparo os dois.
    const alvo = g.replace('&amp;', '&');
    assert.ok(html.includes(alvo) || html.includes(g), `grupo ausente da navegação: ${alvo}`);
  }
  assert.ok(html.includes('data-ctd-group='), 'esperava botões de grupo');
});

test('navegação mostra as folhas do grupo ativo, não as dos outros', () => {
  const c = contratoZerado();
  CD._tab = 'dre'; // grupo financeiro
  const html = CD._renderNavAbas(c, { passagensPendentes: [] });
  assert.ok(html.includes('DRE / Margem'), 'folha do grupo ativo tem que aparecer');
  assert.ok(!html.includes('Organograma'), 'folha de outro grupo não pode aparecer');
});

test('badge do grupo soma as pendências das folhas (some quando é zero)', () => {
  const c = contratoZerado();
  c.marcos = [{ id: 'm1', titulo: 'X', concluido: false }, { id: 'm2', titulo: 'Y', concluido: false }];
  CD._tab = 'painel';
  const comBadge = CD._renderNavAbas(c, { passagensPendentes: [] });
  assert.ok(/ctd-tab-badge/.test(comBadge), 'marcos abertos deveriam gerar badge no grupo Execução');

  // Obra que ainda não começou não deve nada a ninguém: nenhum badge.
  const futuro = contratoZerado();
  futuro.startDate = '2099-01-01';
  const limpo = CD._renderNavAbas(futuro, { passagensPendentes: [] });
  const badgesLimpo = (limpo.match(/ctd-tab-badge/g) || []).length;
  assert.strictEqual(badgesLimpo, 0, 'obra que nem começou não pode exibir badge');
});

test('_rdoCompliance: obra que ainda não começou não é cobrada', () => {
  const c = contratoZerado();
  c.startDate = '2099-01-01';
  const comp = CD._rdoCompliance(c, '2026-03-11');
  assert.strictEqual(comp.atrasado, false, 'contrato futuro não pode nascer em atraso');
  assert.strictEqual(comp.badge, 0);
});

test('_badgesAbas nunca conta acervo, só o que espera ação', () => {
  const c = contratoZerado();
  c.marcos = [{ id: 'm1', concluido: true }, { id: 'm2', concluido: false }];
  c.aditivos = [{ id: 'a1', aprovado: true }, { id: 'a2', aprovado: false }];
  c.ocorrencias = [{ id: 'o1', encerrada: true }];
  const b = CD._badgesAbas(c, { passagensPendentes: [] });
  assert.strictEqual(b.marcosAbertos, 1, 'marco concluído não é pendência');
  assert.strictEqual(b.aditivosAbertos, 1, 'aditivo aprovado não é pendência');
  assert.strictEqual(b.ocorrenciasAbertas, 0, 'ocorrência encerrada não é pendência');
});

// ── Fase 3: Painel da obra ─────────────────────────────────────────────────
test('Painel sem pendência nenhuma é estado de SUCESSO, não tela vazia', () => {
  const html = CD._renderPainel({ acoes: [], obra: {} });
  assert.ok(/Nada pendente/i.test(html), 'obra em dia precisa dizer que está em dia');
  assert.ok(!/atenção/i.test(html), 'sem ação não faz sentido pedir atenção');
});

test('Painel lista as ações com link pra aba e filtro certos', () => {
  const html = CD._renderPainel({
    acoes: [
      { id: 'punch', area: 'qualidade', severidade: 'alta', titulo: '3 itens de punch vencidos',
        detalhe: 'o mais antigo há 12 dias', href: '#/contratos/ctr1?tab=punch&f=vencidos' },
      { id: 'rdo', area: 'execucao', severidade: 'media', titulo: '2 dias úteis sem RDO',
        href: '#/contratos/ctr1?tab=rdo' },
    ],
    obra: {},
  });
  assert.ok(html.includes('Precisa da sua atenção'));
  assert.ok(html.includes('3 itens de punch vencidos'));
  assert.ok(html.includes('tab=punch&amp;f=vencidos') || html.includes('tab=punch&f=vencidos'),
    'a ação tem que levar à aba JÁ filtrada, não à aba genérica');
});

test('Painel: avanço não medido aparece como "—", nunca como 0%', () => {
  // Cronograma sem etapas cadastradas não é obra parada em 0%.
  const html = CD._renderKpisObra({ avancoFisico: { pct: null, base: 'sem_dados' }, prazo: {} });
  assert.ok(html.includes('—'));
  assert.ok(/não cadastrado/i.test(html));
  assert.ok(!/0\.0%/.test(html), 'não pode inventar 0% onde não há medição');
});

test('Painel: avanço por média simples se identifica como tal', () => {
  const html = CD._renderKpisObra({ avancoFisico: { pct: 50, base: 'media' }, prazo: {} });
  assert.ok(html.includes('50.0%'));
  assert.ok(/sem peso/i.test(html), 'a tela precisa dizer que os pesos não foram preenchidos');
});

test('Painel: contrato sem movimento não exibe alarme de meta', () => {
  const html = CD._renderKpisObra({
    avancoFisico: { pct: 0, base: 'peso' },
    prazo: {},
    margem: { valor: 0, pct: 0, status: 'sem_movimento' },
  });
  assert.ok(/sem movimento/i.test(html));
  assert.ok(!/faltam/i.test(html), 'contrato recém-criado não pode abrir cobrando meta');
});

test('Painel: sem permissão financeira, nenhum número de margem na tela', () => {
  // O endpoint omite `obra.margem` pra quem não tem contrato-tab:financeiro/dre.
  const html = CD._renderKpisObra({ avancoFisico: { pct: 40, base: 'peso' }, prazo: {} });
  assert.ok(!/[Mm]argem/.test(html), 'sem o bloco no payload, o card não pode aparecer');
  assert.ok(html.includes('40.0%'), 'o resto do painel continua funcionando');
});

test('Painel: atraso de prazo aparece em vermelho e em dias', () => {
  const html = CD._renderKpisObra({
    avancoFisico: { pct: 10, base: 'peso' },
    prazo: { fim: '2026-01-31', atrasoDias: 12, diasRestantes: -12 },
  });
  assert.ok(html.includes('12 dias de atraso'));
  assert.ok(html.includes('var(--color-danger)'));
});

// ── Contrato entre backend e view: severidade das ações ────────────────────
// Bug real pego aqui: lib/contrato-painel.js emite 'critico/alto/medio/baixo'
// (masculino) e a view tinha um mapa de cores com 'critica/alta/media/baixa'.
// Nenhum dos dois lados quebrava — as ações simplesmente caíam todas na cor
// default, e um acidente com afastamento ficava visualmente igual a um aviso
// de documento vencendo. Este teste amarra os dois lados.
test('toda severidade que o backend emite tem cor na view', () => {
  const backend = fs.readFileSync(path.join(ROOT, 'lib/contrato-painel.js'), 'utf8');
  const emitidas = [
    ...new Set([...backend.matchAll(/severidade:\s*'([a-z_]+)'/g)].map((m) => m[1])),
  ];
  assert.ok(emitidas.length >= 3, `esperava várias severidades, achei: ${emitidas.join(', ')}`);

  // Cada severidade tem que produzir uma cor DIFERENTE da severidade vizinha —
  // se o mapa não conhece a chave, todas saem idênticas.
  const cores = new Set(
    emitidas.map((sev) => {
      const html = CD._renderAcoes([{ id: 'x', severidade: sev, titulo: 't', href: '#' }]);
      return (html.match(/border-left:3px solid ([^;]+);/) || [])[1];
    })
  );
  assert.strictEqual(
    cores.size,
    emitidas.length,
    `${emitidas.length} severidades (${emitidas.join(', ')}) mas só ${cores.size} cor(es) distinta(s) — a view não conhece as chaves do backend`
  );
});

// A aba de Qualidade usa a escala no FEMININO (baixa/media/alta/critica), ao
// contrário do Painel, que usa o masculino. Os dois convivem de propósito
// (vocabulários de origens diferentes), mas cada view precisa conhecer o seu —
// foi assim que o mapa do Painel ficou dessincronizado sem ninguém ver.
test('toda severidade de item que o backend de qualidade emite tem cor na view', () => {
  const lib = fs.readFileSync(path.join(ROOT, 'lib/ocorrencias-obra.js'), 'utf8');
  const escala = [...new Set([...lib.matchAll(/'(baixa|media|alta|critica)'/g)].map((m) => m[1]))];
  assert.ok(escala.length >= 3, `esperava a escala de severidade, achei: ${escala.join(', ')}`);

  const cores = new Set(
    escala.map((sev) => {
      const html = CD._renderTabelaQualidade([
        { id: 'x', origem: 'punch', titulo: 't', severidade: sev, statusGrupo: 'aberto' },
      ]);
      return (html.match(/background:(#[0-9A-Fa-f]{6});color:(#[0-9A-Fa-f]{6})/) || []).join('|');
    })
  );
  assert.ok(cores.size > 1, `${escala.length} severidades mas ${cores.size} cor(es) — a view não conhece a escala do backend`);
});

test('Qualidade distingue "não há nada" de "o filtro não achou nada"', () => {
  const semNada = CD._renderQualidadeVazio(0);
  const semFiltro = CD._renderQualidadeVazio(12);
  assert.ok(/Nenhum registro de qualidade/i.test(semNada));
  assert.ok(/filtro/i.test(semFiltro), 'lista filtrada vazia tem que oferecer limpar o filtro');
  assert.notStrictEqual(semNada, semFiltro, 'os dois vazios não podem ser a mesma tela');
});

test('Qualidade destaca acidente com afastamento na linha', () => {
  const html = CD._renderTabelaQualidade([
    { id: 'a', origem: 'ssma', descricao: 'Queda de nível', severidade: 'critica',
      statusGrupo: 'aberto', meta: { comAfastamento: true, diasPerdidos: 15 } },
  ]);
  assert.ok(/com afastamento/i.test(html));
  assert.ok(html.includes('15'), 'dias perdidos precisam aparecer');
});

// ── O buraco que quase foi pro ar ──────────────────────────────────────────
// Ao fundir punch/ssma/ocorrências na folha `qualidade`, o registry passou a
// apontar pra ela mas o corpo da tela (a cadeia de ternários do render) não
// tinha branch nenhum pra essa chave — a aba abriria VAZIA, sem erro. Enquanto
// o corpo não vira dispatch pelo registry (fatia final da Fase 5), este teste
// é o que garante que registry e corpo não se separem de novo.
test('toda folha do registry tem tratamento no corpo da tela', () => {
  const CT = sandbox.window.ContratoTabs;
  const core = fs.readFileSync(path.join(ROOT, 'js/views/ContratoDetail.js'), 'utf8');
  const semCorpo = CT.TABS.filter((t) => {
    // Tem que ser o branch de RENDERIZAÇÃO (`${aba === 'x' ? ...}` dentro do
    // template), não qualquer menção à chave: o bloco de listeners também usa
    // `if (aba === 'x')`, e foi por isso que a primeira versão deste teste
    // passou com a aba abrindo vazia.
    // `${aba === 'x'` (interpolação do template) e não `if (aba === 'x')`
    // (listener). A condição pode ser composta — `pendencias`, por exemplo, é
    // `${aba === 'pendencias' && passagensPendentes.length > 0 ? ...}`.
    const temBranchRender = new RegExp(`\\$\\{\\s*aba === '${t.k}'`).test(core);
    // Uma folha também pode ser servida por um render declarado no registry e
    // despachado por outro caminho.
    const temRender = t.render && typeof CD[t.render] === 'function' && core.includes(t.render);
    return !temBranchRender && !temRender;
  }).map((t) => t.k);

  // join() em vez de deepStrictEqual: TABS vem do sandbox `vm`, e arrays
  // derivados dele são de outro realm — deepStrictEqual reprova por prototype.
  assert.strictEqual(
    semCorpo.join(', '),
    '',
    `folha(s) do registry sem nada que as renderize — a aba abre vazia e em silêncio: ${semCorpo.join(', ')}`
  );
});
