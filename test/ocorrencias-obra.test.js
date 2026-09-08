'use strict';
/**
 * @file lib/ocorrencias-obra.js — leitura unificada de Punch List + SSMA +
 * Ocorrências da obra.
 *
 * Por que unificar só a LEITURA (decisão registrada no plano cozy-churning-fog):
 * as três tabelas têm vocabulários divergentes (`severidade` vs `gravidade`,
 * status de 4 / 3 valores / booleano) e `ssma_ocorrencias` carrega os campos
 * legais `com_afastamento` e `dias_perdidos`, que alimentam TF/TG. Fundir tudo
 * numa tabela só exigiria colunas nullable ou um JSONB, e a query de TF/TG
 * passaria a precisar de `WHERE origem='ssma'` — justamente o discriminador que
 * manter as três tabelas já dá de graça. Então: uma aba, três tabelas, zero
 * migration.
 *
 * O teste que mais importa aqui é o BR-QSMS-002: o resumo unificado tem que
 * PRESERVAR, byte a byte, os agregados que já existiam. É ele que impede que
 * TF/TG sejam degradados por acidente numa refatoração futura.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { unificar, STATUS_GRUPO, statusGrupoDe } = require('../lib/ocorrencias-obra');
const punch = require('../lib/punch');
const ssma = require('../lib/ssma');

const HOJE = '2026-07-21';

/** Um item de cada origem, com os campos que o repo entrega em camelCase. */
function cenario() {
  return {
    punchItens: [
      { id: 'p1', tipo: 'pendencia', titulo: 'Solda fora de spec', descricao: 'refazer',
        localizacao: 'Eixo 4', severidade: 'alta', status: 'aberto',
        responsavelId: 'rec1', prazo: '2026-07-10', fotos: ['f1'] },      // vencido
      { id: 'p2', tipo: 'rnc', titulo: 'RNC pintura', severidade: 'media',
        status: 'verificado', prazo: '2026-07-01' },                        // encerrado
    ],
    ssmaOcorrencias: [
      { id: 's1', tipo: 'acidente', gravidade: 'critica', descricao: 'Queda de nível',
        causa: 'sem guarda-corpo', acaoCorretiva: 'instalar', status: 'aberto',
        data: '2026-07-18', prazo: '2026-07-30', responsavelId: 'rec2',
        comAfastamento: true, diasPerdidos: 15 },
      { id: 's2', tipo: 'desvio', gravidade: 'baixa', descricao: 'EPI incompleto',
        status: 'encerrado', data: '2026-07-05', comAfastamento: false, diasPerdidos: 0 },
    ],
    contractOcorrencias: [
      { id: 'o1', tipo: 'qualidade', severidade: 'media', descricao: 'Atraso de material',
        data: '2026-07-15', encerrada: false },
    ],
    hojeISO: HOJE,
    hht: 50000,
  };
}

// ── BR-QSMS-001: mapa de status por origem ─────────────────────────────────

test('BR-QSMS-001: todo status nativo cai num grupo comum válido', () => {
  const casos = [
    ...punch.STATUS.map((s) => ['punch', s]),
    ...ssma.STATUS.map((s) => ['ssma', s]),
    ['geral', true],
    ['geral', false],
  ];
  for (const [origem, status] of casos) {
    const g = statusGrupoDe(origem, status);
    assert.ok(
      STATUS_GRUPO.includes(g),
      `${origem}/${status} produziu grupo inválido: ${g}`
    );
  }
});

test('BR-QSMS-001: nenhum grupo é inventado além dos três', () => {
  assert.deepEqual(STATUS_GRUPO, ['aberto', 'em_andamento', 'encerrado']);
});

test('BR-QSMS-001: "resolvido" do punch ainda NÃO é encerrado', () => {
  // O punch só considera encerrado o que a qualidade verificou — `resumo.abertos`
  // do lib/punch conta tudo que não é 'verificado'. Se 'resolvido' virasse
  // 'encerrado' aqui, a aba unificada contradiria o próprio resumo do punch.
  assert.equal(statusGrupoDe('punch', 'resolvido'), 'em_andamento');
  assert.equal(statusGrupoDe('punch', 'verificado'), 'encerrado');
});

test('BR-QSMS-001: booleano de contract_ocorrencias vira grupo', () => {
  assert.equal(statusGrupoDe('geral', true), 'encerrado');
  assert.equal(statusGrupoDe('geral', false), 'aberto');
});

test('status desconhecido não quebra: cai em aberto', () => {
  assert.equal(statusGrupoDe('punch', 'zumbi'), 'aberto');
  assert.equal(statusGrupoDe('ssma', undefined), 'aberto');
});

// ── BR-QSMS-002: paridade dos agregados (o teste que protege TF/TG) ────────

test('BR-QSMS-002: resumo.seguranca é IDÊNTICO ao lib/ssma.resumo', () => {
  const c = cenario();
  const { resumo } = unificar(c);
  assert.deepEqual(resumo.seguranca, ssma.resumo(c.ssmaOcorrencias, c.hht));
  // E as taxas legais realmente saíram (não é objeto vazio passando no deepEqual).
  assert.ok(resumo.seguranca.tf > 0, 'TF precisa ter sido calculada');
  assert.equal(resumo.seguranca.comAfastamento, 1);
  assert.equal(resumo.seguranca.diasPerdidos, 15);
});

test('BR-QSMS-002: resumo.qualidade é IDÊNTICO ao lib/punch.resumo', () => {
  const c = cenario();
  const { resumo } = unificar(c);
  assert.deepEqual(resumo.qualidade, punch.resumo(c.punchItens, c.hojeISO));
  assert.equal(resumo.qualidade.vencidos, 1);
});

test('BR-QSMS-002: HHT zero mantém a paridade (TF/TG caem para 0 nos dois)', () => {
  const c = { ...cenario(), hht: 0 };
  const { resumo } = unificar(c);
  assert.deepEqual(resumo.seguranca, ssma.resumo(c.ssmaOcorrencias, 0));
  assert.equal(resumo.seguranca.tf, 0);
});

// ── Normalização dos itens ─────────────────────────────────────────────────

test('reúne as três origens numa lista só, marcando a procedência', () => {
  const { itens } = unificar(cenario());
  assert.equal(itens.length, 5);
  assert.deepEqual(
    [...new Set(itens.map((i) => i.origem))].sort(),
    ['geral', 'punch', 'ssma']
  );
});

test('severidade sai normalizada: SSMA usa "gravidade", as outras "severidade"', () => {
  const { itens } = unificar(cenario());
  const s1 = itens.find((i) => i.id === 's1');
  const p1 = itens.find((i) => i.id === 'p1');
  assert.equal(s1.severidade, 'critica', 'o campo do SSMA se chama gravidade');
  assert.equal(p1.severidade, 'alta');
});

test('status NATIVO é preservado (o formulário precisa dele para escrever de volta)', () => {
  const { itens } = unificar(cenario());
  const s1 = itens.find((i) => i.id === 's1');
  assert.equal(s1.status, 'aberto');
  assert.equal(s1.statusGrupo, 'aberto');

  const p2 = itens.find((i) => i.id === 'p2');
  assert.equal(p2.status, 'verificado', 'o status nativo não pode virar o do grupo');
  assert.equal(p2.statusGrupo, 'encerrado');
});

test('campos legais do SSMA sobrevivem em meta', () => {
  const { itens } = unificar(cenario());
  const s1 = itens.find((i) => i.id === 's1');
  assert.equal(s1.meta.comAfastamento, true);
  assert.equal(s1.meta.diasPerdidos, 15);
  assert.equal(s1.meta.causa, 'sem guarda-corpo');
  assert.equal(s1.meta.acaoCorretiva, 'instalar');
});

test('campos próprios do punch sobrevivem em meta', () => {
  const { itens } = unificar(cenario());
  const p1 = itens.find((i) => i.id === 'p1');
  assert.equal(p1.meta.localizacao, 'Eixo 4');
  assert.deepEqual(p1.meta.fotos, ['f1']);
});

test('vencido: prazo no passado e não encerrado, em qualquer origem', () => {
  const { itens } = unificar(cenario());
  assert.equal(itens.find((i) => i.id === 'p1').vencido, true, 'punch com prazo vencido');
  assert.equal(itens.find((i) => i.id === 'p2').vencido, false, 'encerrado não vence');
  assert.equal(itens.find((i) => i.id === 's1').vencido, false, 'prazo ainda no futuro');
});

test('resumo agrega as três origens', () => {
  const { resumo } = unificar(cenario());
  assert.equal(resumo.total, 5);
  assert.deepEqual(resumo.porOrigem, { punch: 2, ssma: 2, geral: 1 });
  // Abertos = tudo que não está encerrado: p1, s1, o1 (p2 e s2 estão encerrados).
  assert.equal(resumo.abertos, 3);
  assert.equal(resumo.vencidos, 1);
});

test('aceita snake_case (dado cru) além de camelCase', () => {
  const { itens } = unificar({
    punchItens: [],
    ssmaOcorrencias: [
      { id: 's9', tipo: 'acidente', gravidade: 'alta', descricao: 'x', status: 'aberto',
        com_afastamento: true, dias_perdidos: 3, acao_corretiva: 'y', responsavel_id: 'r9' },
    ],
    contractOcorrencias: [],
    hojeISO: HOJE,
    hht: 1000,
  });
  const s9 = itens[0];
  assert.equal(s9.meta.comAfastamento, true);
  assert.equal(s9.meta.diasPerdidos, 3);
  assert.equal(s9.meta.acaoCorretiva, 'y');
  assert.equal(s9.responsavelId, 'r9');
});

test('entradas vazias/ausentes não quebram', () => {
  const vazio = unificar({ hojeISO: HOJE });
  assert.deepEqual(vazio.itens, []);
  assert.equal(vazio.resumo.total, 0);
  assert.equal(vazio.resumo.abertos, 0);
  assert.deepEqual(vazio.resumo.porOrigem, { punch: 0, ssma: 0, geral: 0 });
  // Mesmo vazio, os agregados legais existem (a aba sempre mostra TF/TG).
  assert.equal(vazio.resumo.seguranca.tf, 0);
});

test('ordena o que precisa de ação primeiro: vencido, depois severidade', () => {
  const { itens } = unificar(cenario());
  assert.equal(itens[0].id, 'p1', 'o vencido vem primeiro');
  // Entre os não vencidos, a crítica em aberto vem antes da média.
  const naoVencidos = itens.filter((i) => !i.vencido).map((i) => i.id);
  assert.ok(
    naoVencidos.indexOf('s1') < naoVencidos.indexOf('o1'),
    'crítica deve vir antes de média'
  );
});

// ═══════════ 2. Handler (handlers/qualidade-seguranca.js) ═══════════
// Mesma estrutura de test/data-book.test.js: regra pura + handler no mesmo
// arquivo, porque a feature é enxuta. `repos` dublado — nada toca o Postgres.

const repos = require('../db/repos');
const hq = require('../handlers/qualidade-seguranca');

function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) { res.status = s; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

const _orig = {
  contracts: repos.contracts, punchItens: repos.punchItens,
  ssmaOcorrencias: repos.ssmaOcorrencias, ocorrencias: repos.ocorrencias, rdos: repos.rdos,
};

function dublar(c) {
  repos.contracts = { findById: async () => ({ id: 'ctr1', name: 'Obra' }) };
  repos.punchItens = { findAll: async () => c.punchItens };
  repos.ssmaOcorrencias = { findAll: async () => c.ssmaOcorrencias };
  repos.ocorrencias = { findAll: async () => c.contractOcorrencias };
  // 2 RDOs × 25.000 HH = 50.000, o mesmo hht do cenário puro.
  repos.rdos = { findAll: async () => [
    { totais: { totalHomemHora: 25000 } }, { totais: { totalHomemHora: 25000 } },
  ] };
}
function restaurar() { Object.assign(repos, _orig); }

test('handler: contrato inexistente devolve 404', async () => {
  repos.contracts = { findById: async () => null };
  const res = fakeRes();
  await hq.handleGetQualidade('naoexiste', res, {});
  assert.equal(res.status, 404);
  restaurar();
});

test('handler: sem filtro devolve as três origens', async () => {
  dublar(cenario());
  const res = fakeRes();
  await hq.handleGetQualidade('ctr1', res, {});
  assert.equal(res.status, 200);
  assert.equal(res.body.itens.length, 5);
  assert.equal(res.body.origem, 'todos');
  restaurar();
});

test('handler: filtro por origem recorta os itens', async () => {
  dublar(cenario());
  const res = fakeRes();
  await hq.handleGetQualidade('ctr1', res, { origem: 'ssma' });
  assert.equal(res.body.itens.length, 2);
  assert.ok(res.body.itens.every((i) => i.origem === 'ssma'));
  restaurar();
});

test('handler: TF/TG NÃO mudam quando o usuário filtra a lista', async () => {
  // O ponto mais importante deste handler. TF e TG são indicadores da OBRA
  // (exigência legal de SST); se fossem recalculados sobre o recorte, a taxa
  // mudaria só porque alguém clicou num chip de filtro.
  dublar(cenario());
  const semFiltro = fakeRes();
  await hq.handleGetQualidade('ctr1', semFiltro, {});

  dublar(cenario());
  const soPunch = fakeRes();
  await hq.handleGetQualidade('ctr1', soPunch, { origem: 'punch' });

  assert.deepEqual(soPunch.body.resumo.seguranca, semFiltro.body.resumo.seguranca);
  assert.ok(soPunch.body.resumo.seguranca.tf > 0, 'TF continua valendo mesmo filtrando fora o SSMA');
  assert.equal(soPunch.body.itens.length, 2, 'mas a LISTA foi recortada');
  restaurar();
});

test('handler: origem inválida cai em "todos" em vez de listar vazio', async () => {
  dublar(cenario());
  const res = fakeRes();
  await hq.handleGetQualidade('ctr1', res, { origem: 'lixo' });
  assert.equal(res.body.origem, 'todos');
  assert.equal(res.body.itens.length, 5);
  restaurar();
});

test('handler: HHT vem dos RDOs, e ?hht= sobrescreve', async () => {
  dublar(cenario());
  const auto = fakeRes();
  await hq.handleGetQualidade('ctr1', auto, {});
  assert.equal(auto.body.hht, 50000, 'somou o totalHomemHora dos RDOs');

  dublar(cenario());
  const manual = fakeRes();
  await hq.handleGetQualidade('ctr1', manual, { hht: '100000' });
  assert.equal(manual.body.hht, 100000);
  // Dobrar o HHT com o mesmo nº de acidentes tem que reduzir a TF pela metade.
  assert.ok(manual.body.resumo.seguranca.tf < auto.body.resumo.seguranca.tf);
  restaurar();
});

test('handler: uma origem quebrada degrada só ela, a aba continua de pé', async () => {
  dublar(cenario());
  repos.punchItens = { findAll: async () => { throw new Error('relation "punch_itens" does not exist'); } };
  const res = fakeRes();
  await hq.handleGetQualidade('ctr1', res, {});
  assert.equal(res.status, 200, 'a aba não pode cair porque uma tabela falhou');
  assert.equal(res.body.resumo.porOrigem.punch, 0);
  assert.ok(res.body.itens.some((i) => i.origem === 'ssma'), 'as outras origens continuam');
  restaurar();
});
