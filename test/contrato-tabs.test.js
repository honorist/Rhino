'use strict';
/**
 * @file js/lib/contrato-tabs.js — registry das abas do detalhe de contrato.
 *
 * Por que um registry (plano cozy-churning-fog, Fase 1): hoje a lista de abas
 * é um array literal dentro de um template string de 1.378 linhas
 * (ContratoDetail.js:253-269) e o corpo de cada aba é uma cadeia de ternários
 * no MESMO template (:280-614). Duas consequências:
 *
 *  1. O filtro de permissão roda no BOTÃO (:270) mas o corpo renderiza sem
 *     checar (:280) — um perfil sem acesso a `visao` não vê a aba e mesmo
 *     assim recebe o resumo financeiro completo. Com um dispatch único, botão
 *     e corpo passam pelo mesmo portão e o vazamento morre por construção.
 *  2. `?tab=` desconhecido (typo, link antigo, aba renomeada) não casa nenhum
 *     ternário → cabeçalho + barra de abas + NADA, sem erro e sem fallback.
 *
 * O módulo é puro (sem DOM, sem Store, sem fetch) pelo mesmo motivo de
 * js/lib/hash-route.js: ser testável sem carregar app.js, que tem efeito
 * colateral de boot no top-level.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

function carregar() {
  const code = fs.readFileSync(
    path.join(__dirname, '../js/lib/contrato-tabs.js'),
    'utf8'
  );
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.ContratoTabs;
}

const CT = carregar();

// Todas as chaves que a tela tem hoje (ContratoDetail.js:253-269). A Fase 1 é
// puramente estrutural: agrupa sem renomear nem remover nenhuma.
const CHAVES_ATUAIS = [
  'visao', 'financeiro', 'dre', 'evm', 'punch', 'ssma', 'databook', 'medicao',
  'cronograma', 'equipe', 'rdo', 'pendencias', 'aditivos', 'marcos',
  'ocorrencias', 'timeline',
];

test('expõe grupos e folhas', () => {
  assert.ok(Array.isArray(CT.GRUPOS) && CT.GRUPOS.length === 5, 'esperava 5 grupos');
  // Não travo a contagem de folhas: abas podem se fundir (punch+ssma+ocorrências
  // viraram uma) ou nascer. O invariante que protege o usuário é o de baixo —
  // toda chave que já circulou em link continua resolvendo.
  assert.ok(Array.isArray(CT.TABS) && CT.TABS.length >= 10);
});

test('toda chave de hoje ainda RESOLVE para uma folha válida', () => {
  // Invariante que de fato importa: não é "a chave continua existindo" (uma
  // aba pode ser renomeada ou fundida), é "o link que já circula por aí
  // continua abrindo alguma coisa certa". Chave viva resolve nela mesma;
  // chave renomeada resolve via alias. O que não pode é cair no padrão por
  // acidente — isso seria o link antigo levando pra tela errada.
  const semDestino = [];
  for (const k of CHAVES_ATUAIS) {
    const r = CT.resolveTab(k);
    const ehElaMesma = r.k === k;
    const temAlias = Object.prototype.hasOwnProperty.call(CT.ALIASES, k);
    if (!ehElaMesma && !temAlias) semDestino.push(k);
  }
  assert.deepStrictEqual(
    semDestino,
    [],
    `chave(s) sem folha nem alias — link antigo cai no padrão silenciosamente: ${semDestino.join(', ')}`
  );
});

test('toda folha aponta para um grupo que existe', () => {
  const grupos = CT.GRUPOS.map((g) => g.k);
  for (const t of CT.TABS) {
    assert.ok(grupos.includes(t.grupo), `folha ${t.k} aponta pro grupo inexistente ${t.grupo}`);
  }
});

test('toda folha declara rótulo e o método de render', () => {
  for (const t of CT.TABS) {
    assert.ok(t.l && typeof t.l === 'string', `folha ${t.k} sem rótulo`);
    // `render` é o NOME do método (string), não a função — é isso que mantém o
    // registry puro e carregável fora do browser.
    assert.ok(
      t.render === null || typeof t.render === 'string',
      `folha ${t.k}: render deve ser nome de método (string) ou null`
    );
  }
});

// ── resolveTab: a única porta de entrada ───────────────────────────────────

test('resolveTab devolve a própria folha quando a chave existe', () => {
  const r = CT.resolveTab('cronograma');
  assert.strictEqual(r.k, 'cronograma');
  assert.strictEqual(r.grupo, 'execucao');
  assert.strictEqual(r.viaAlias, false);
});

test('resolveTab cai no painel quando a chave é desconhecida', () => {
  // Era a tela em branco silenciosa: nenhum ternário casava.
  for (const ruim of ['medicoes', 'lixo', '', null, undefined, 'PUNCH; drop']) {
    const r = CT.resolveTab(ruim);
    assert.strictEqual(r.k, CT.TAB_PADRAO, `"${ruim}" deveria cair no padrão`);
  }
});

test('resolveTab traduz alias e sinaliza viaAlias', () => {
  // A tabela de aliases é o que mantém link antigo de WhatsApp funcionando
  // quando uma chave é renomeada (Fases 3 e 4).
  CT.ALIASES.visao = 'painel';
  if (CT.TABS.some((t) => t.k === 'painel')) {
    const r = CT.resolveTab('visao');
    assert.strictEqual(r.k, 'painel');
    assert.strictEqual(r.viaAlias, true);
  }
  delete CT.ALIASES.visao;
});

// ── permissão ──────────────────────────────────────────────────────────────

test('perfil sem nenhuma contrato-tab: enxerga tudo (válvula legada)', () => {
  // js/app.js:740 — remover isso trancaria gente pra fora.
  const pode = CT.fazerPodeTab([]);
  for (const t of CT.TABS) {
    assert.strictEqual(pode(t.k), true, `folha ${t.k} deveria estar liberada`);
  }
});

test('perfil sem perfil algum (abas null = admin) enxerga tudo', () => {
  const pode = CT.fazerPodeTab(null);
  assert.strictEqual(pode('dre'), true);
});

test('abas universais passam mesmo com perfil restrito', () => {
  // cronograma/timeline/medicao eram hardcoded em js/app.js:738.
  const pode = CT.fazerPodeTab(['contrato-tab:financeiro']);
  assert.strictEqual(pode('cronograma'), true);
  assert.strictEqual(pode('timeline'), true);
  assert.strictEqual(pode('medicao'), true);
});

test('perfil restrito só enxerga a folha que tem na aba', () => {
  const pode = CT.fazerPodeTab(['contrato-tab:financeiro']);
  assert.strictEqual(pode('financeiro'), true);
  assert.strictEqual(pode('equipe'), false);
  assert.strictEqual(pode('rdo'), false);
});

test('alias vale pra permissão também, e só SOMA acesso', () => {
  // Perfil gravado com a chave antiga não pode perder acesso quando a chave
  // é renomeada — a tradução tem que valer nos dois sentidos.
  CT.ALIASES.visao = 'painel';
  if (CT.TABS.some((t) => t.k === 'painel')) {
    const pode = CT.fazerPodeTab(['contrato-tab:visao']);
    assert.strictEqual(pode('painel'), true, 'perfil com a chave antiga tem que ver a nova');
  }
  delete CT.ALIASES.visao;
});

test('grupo aparece se ALGUMA folha dele estiver liberada', () => {
  const pode = CT.fazerPodeTab(['contrato-tab:financeiro']);
  const grupos = CT.gruposVisiveis(pode).map((g) => g.k);
  assert.ok(grupos.includes('financeiro'));
  // execucao entra porque cronograma/medicao são universais.
  assert.ok(grupos.includes('execucao'));
});

test('primeiraTabPermitida percorre TODAS as folhas, não uma lista fixa', () => {
  // js/app.js:745-748 só conhecia 7 das 16 chaves e caía em `|| 'visao'` —
  // um perfil liberado só pra `dre` caía numa aba bloqueada, e a barra ficava
  // sem nenhuma aba ativa.
  const pode = CT.fazerPodeTab(['contrato-tab:dre']);
  const primeira = CT.primeiraTabPermitida(pode);
  assert.strictEqual(pode(primeira), true, `primeiraTabPermitida devolveu ${primeira}, que está bloqueada`);
});

test('tabsDoGrupo devolve as folhas na ordem declarada', () => {
  const exec = CT.tabsDoGrupo('execucao').map((t) => t.k);
  assert.ok(exec.length >= 2);
  assert.ok(exec.includes('rdo') && exec.includes('cronograma'));
});

// ── Fase 4: as três abas de qualidade viraram uma ──────────────────────────
test('link antigo de punch/ssma/ocorrências abre a aba nova JÁ filtrada', () => {
  // Sem o filtro o link "funcionaria" mas mostraria outra coisa — quem recebeu
  // um link de SSMA precisa ver SSMA, não a lista inteira.
  const casos = [
    ['punch', 'punch'],
    ['ssma', 'ssma'],
    ['ocorrencias', 'geral'],
  ];
  for (const [antiga, origemEsperada] of casos) {
    const r = CT.resolveTab(antiga);
    assert.strictEqual(r.k, 'qualidade', `${antiga} deveria resolver pra qualidade`);
    assert.strictEqual(r.viaAlias, true);
    // Campo a campo: o objeto vem do sandbox `vm` (outro realm), então
    // deepStrictEqual reprova por prototype mesmo com estrutura idêntica.
    assert.strictEqual(r.filtro && r.filtro.origem, origemEsperada);
  }
});

test('perfil com QUALQUER uma das 3 permissões antigas enxerga a aba nova', () => {
  // Ninguém pode perder acesso porque as abas se fundiram.
  for (const antiga of ['punch', 'ssma', 'ocorrencias']) {
    const pode = CT.fazerPodeTab([`contrato-tab:${antiga}`]);
    assert.strictEqual(pode('qualidade'), true, `quem tinha ${antiga} precisa ver a aba unificada`);
  }
});
