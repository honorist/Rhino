'use strict';
/**
 * @file js/lib/org-chart-layout.js — layout puro (sem DOM) do organograma
 * visual em SVG: monta a árvore a partir de supervisorId, posiciona os
 * cards sem sobreposição e gera os caminhos dos conectores (desce do pai →
 * trilho horizontal → sobe no filho).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

function load() {
  const code = fs.readFileSync(path.join(__dirname, '../js/lib/org-chart-layout.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.OrgChartLayout;
}

const { buildOrgChartLayout, CARD_W, CARD_H, H_GAP, V_GAP } = load();

function membro(id, nivel, supervisorId, nome) {
  return { id, nivel, supervisorId: supervisorId || null, nome, recursoId: `r_${id}` };
}

test('nó único (só encarregado): um card, sem conectores', () => {
  const membros = [membro('e1', 'encarregado', null, 'Ana')];
  const { nodes, connectors } = buildOrgChartLayout(membros);
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(connectors.length, 0);
  assert.strictEqual(nodes[0].id, 'e1');
  assert.strictEqual(nodes[0].y, 0);
});

test('2 níveis: encarregado + 2 líderes, um conector para cada', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
    membro('l2', 'lider_area', 'e1', 'Carlos'),
  ];
  const { nodes, connectors } = buildOrgChartLayout(membros);
  assert.strictEqual(nodes.length, 3);
  assert.strictEqual(connectors.length, 2);
  assert.ok(connectors.every(c => c.fromId === 'e1'));
  // Nota: array vem do realm do vm → comparar via join, não deepStrictEqual
  // (prototype diferente do Array do realm principal faz deepStrictEqual falhar
  // mesmo com conteúdo idêntico — mesmo motivo documentado em hash-route.test.js).
  assert.strictEqual(Array.from(connectors.map(c => c.toId)).sort().join(','), 'l1,l2');

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.strictEqual(byId.l1.y, CARD_H + V_GAP);
  assert.strictEqual(byId.l2.y, CARD_H + V_GAP);
});

test('encarregado fica centralizado sobre os 2 líderes', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
    membro('l2', 'lider_area', 'e1', 'Carlos'),
  ];
  const { nodes } = buildOrgChartLayout(membros);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const meioFilhos = (byId.l1.x + byId.l2.x) / 2;
  assert.strictEqual(byId.e1.x, meioFilhos);
});

test('3 níveis completos: nenhum card se sobrepõe no mesmo nível', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
    membro('l2', 'lider_area', 'e1', 'Carlos'),
    membro('p1', 'profissional', 'l1', 'Diego'),
    membro('p2', 'profissional', 'l1', 'Elis'),
    membro('p3', 'profissional', 'l2', 'Felipe'),
  ];
  const { nodes } = buildOrgChartLayout(membros);
  assert.strictEqual(nodes.length, 6);

  const porNivelY = {};
  nodes.forEach(n => { (porNivelY[n.y] = porNivelY[n.y] || []).push(n); });
  Object.values(porNivelY).forEach(linha => {
    const xs = linha.map(n => n.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] - xs[i - 1] >= CARD_W + H_GAP,
        `cards sobrepostos ou muito próximos: ${xs[i - 1]} vs ${xs[i]}`);
    }
  });

  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.strictEqual(byId.p1.y, 2 * (CARD_H + V_GAP));
});

test('líder sem irmãos fica alinhado diretamente sob o pai (sem filhos, não centraliza)', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
  ];
  const { nodes } = buildOrgChartLayout(membros);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.strictEqual(byId.e1.x, byId.l1.x);
});

test('membros órfãos (sem supervisor válido) viram raízes lado a lado, sem sobreposição', () => {
  const membros = [
    membro('l1', 'lider_area', null, 'Bruno'),
    membro('l2', 'lider_area', null, 'Carlos'),
  ];
  const { nodes, connectors } = buildOrgChartLayout(membros);
  assert.strictEqual(nodes.length, 2);
  assert.strictEqual(connectors.length, 0);
  const xs = nodes.map(n => n.x).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] >= CARD_W + H_GAP);
});

test('conector é um path SVG que desce do pai e sobe no filho (formato bus)', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
  ];
  const { connectors } = buildOrgChartLayout(membros);
  assert.strictEqual(connectors.length, 1);
  const d = connectors[0].path;
  assert.match(d, /^M\s*-?\d/);
  // pelo menos 3 segmentos (desce, trilho horizontal, sobe) além do ponto inicial
  const comandos = d.match(/[ML]/g) || [];
  assert.ok(comandos.length >= 3, `path com poucos segmentos: ${d}`);
});

test('lista vazia devolve estrutura vazia sem lançar', () => {
  const { nodes, connectors, width, height } = buildOrgChartLayout([]);
  assert.strictEqual(nodes.length, 0);
  assert.strictEqual(connectors.length, 0);
  assert.strictEqual(width, 0);
  assert.strictEqual(height, 0);
});

test('aceita tamanhos customizados de card/gap via opts', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
  ];
  const { nodes } = buildOrgChartLayout(membros, { cardWidth: 240, cardHeight: 200, hGap: 24, vGap: 64 });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.strictEqual(byId.l1.y, 200 + 64);
  assert.strictEqual(byId.l1.width, 240);
  assert.strictEqual(byId.l1.height, 200);
});

test('ordena irmãos por nome (determinístico, mesmo cargo)', () => {
  const membros = [
    membro('e1', 'encarregado', null, 'Ana'),
    membro('l2', 'lider_area', 'e1', 'Zeca'),
    membro('l1', 'lider_area', 'e1', 'Bruno'),
  ];
  const { nodes } = buildOrgChartLayout(membros);
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.ok(byId.l1.x < byId.l2.x, 'Bruno (l1) deveria vir antes de Zeca (l2)');
});
