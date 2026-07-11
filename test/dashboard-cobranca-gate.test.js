'use strict';
/**
 * Gate de leitura do painel "Cobrança por área" (fix H2 da varredura 2026-07-10):
 * o agregado /api/dashboard/cobranca deriva de folha/recrutamento/contas — um
 * perfil restrito só pode receber as áreas cujas telas ele enxerga, senão o
 * gate de leitura de Folha/Recrutamento seria furado por baixo.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { filtrarAreasVisiveis, AREA_SCREENS } = require('../handlers/dashboard-cobranca');

const AREAS = [
  { id: 'rh', nome: 'RH' },
  { id: 'obras', nome: 'Obras' },
  { id: 'financeiro', nome: 'Financeiro' },
  { id: 'frota', nome: 'Frota' },
];
const ids = (areas) => areas.map((a) => a.id);

test('super admin (abas=null) recebe todas as áreas', () => {
  assert.deepStrictEqual(ids(filtrarAreasVisiveis(null, AREAS)), [
    'rh',
    'obras',
    'financeiro',
    'frota',
  ]);
});

test('perfil sem nenhuma tela relevante (abas=[]) não recebe nenhuma área', () => {
  assert.deepStrictEqual(filtrarAreasVisiveis([], AREAS), []);
});

test('perfil só de Frota recebe apenas a área de Frota', () => {
  assert.deepStrictEqual(ids(filtrarAreasVisiveis(['#/frota'], AREAS)), ['frota']);
});

test('perfil de Contas a Pagar recebe a área Financeiro (mapeamento por tela)', () => {
  assert.deepStrictEqual(ids(filtrarAreasVisiveis(['#/contas-pagar'], AREAS)), ['financeiro']);
});

test('perfil restrito a estoque NÃO recebe RH (salários/candidatos ficam ocultos)', () => {
  const vis = ids(filtrarAreasVisiveis(['#/estoque'], AREAS));
  assert.ok(!vis.includes('rh'), 'RH não deve vazar para perfil sem tela de RH');
  assert.deepStrictEqual(vis, []);
});

test('cada área do painel tem um mapeamento de telas', () => {
  for (const a of AREAS)
    assert.ok(Array.isArray(AREA_SCREENS[a.id]), `área ${a.id} sem mapeamento`);
});
