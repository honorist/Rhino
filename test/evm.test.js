'use strict';
/**
 * Regras puras de EVM (lib/evm.js). Um teste por regra (BR-EVM-001..008), com
 * asserts mutação-verificados: cada valor esperado falharia se a regra estivesse
 * errada. A orquestração HTTP do handler não é coberta aqui (precisa de db).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const evmLib = require('../lib/evm');

// Janela padrão: 10 dias (01→11 jan). Referência no meio (06 jan) → 50%.
const JAN01 = '2026-01-01';
const JAN06 = '2026-01-06';
const JAN11 = '2026-01-11';

// ── BR-EVM-002: progresso planejado linear ──────────────────────────────────
test('BR-EVM-002: progressoPlanejado: 0 antes do início', () => {
  assert.equal(evmLib.progressoPlanejado(JAN01, '2026-01-31', '2025-12-01'), 0);
});
test('BR-EVM-002: progressoPlanejado: 1 depois do fim', () => {
  assert.equal(evmLib.progressoPlanejado(JAN01, '2026-01-31', '2026-03-01'), 1);
});
test('BR-EVM-002: progressoPlanejado: 50% no meio da janela', () => {
  assert.equal(evmLib.progressoPlanejado(JAN01, JAN11, JAN06), 0.5);
});
test('BR-EVM-002: progressoPlanejado: sem data de início → 0', () => {
  assert.equal(evmLib.progressoPlanejado(null, '2026-01-31', '2026-01-15'), 0);
});
test('BR-EVM-002: progressoPlanejado: sem data de fim → 0', () => {
  assert.equal(evmLib.progressoPlanejado(JAN01, null, '2026-01-15'), 0);
});

// ── BR-EVM-001/003/004/005/006/007/008: adiantado (SPI>1) ───────────────────
test('BR-EVM-001/003/004/005/006/007/008: evm: adiantado — EV>PV → SPI>1 e SV positivo', () => {
  const ativs = [
    { id: 'a1', nome: 'Fundação', custoPlan: 1000, execPct: 80, dataInicioPlan: JAN01, dataFimPlan: JAN11 },
  ];
  // PV = 1000 × 0.5 = 500; EV = 1000 × 0.80 = 800; AC = 800 (CPI exatamente 1).
  const r = evmLib.evm(ativs, 800, JAN06);
  assert.equal(r.bac, 1000); // BR-EVM-001
  assert.equal(r.pv, 500); // BR-EVM-003
  assert.equal(r.ev, 800); // BR-EVM-004
  assert.equal(r.ac, 800);
  assert.equal(r.sv, 300); // BR-EVM-005: EV−PV
  assert.equal(r.cv, 0); // EV−AC
  assert.equal(r.spi, 1.6); // BR-EVM-006: EV/PV = 800/500
  assert.equal(r.cpi, 1); // EV/AC = 800/800
  assert.equal(r.eac, 1000); // BR-EVM-007: BAC/CPI = 1000/1
  assert.equal(r.etc, 200); // BR-EVM-008: EAC−AC
  assert.equal(r.vac, 0); // BAC−EAC
  // porAtividade espelha as parcelas da etapa.
  assert.equal(r.porAtividade.length, 1);
  assert.deepEqual(r.porAtividade[0], {
    id: 'a1', nome: 'Fundação', pv: 500, ev: 800, custoPlan: 1000, execPct: 80,
  });
});

// ── BR-EVM-006: atrasado (SPI<1) ────────────────────────────────────────────
test('BR-EVM-006: evm: atrasado — EV<PV → SPI<1 e SV negativo', () => {
  const ativs = [{ custoPlan: 1000, execPct: 30, dataInicioPlan: JAN01, dataFimPlan: JAN11 }];
  // PV = 500; EV = 300; AC = 250.
  const r = evmLib.evm(ativs, 250, JAN06);
  assert.equal(r.pv, 500);
  assert.equal(r.ev, 300);
  assert.equal(r.spi, 0.6); // 300/500
  assert.equal(r.sv, -200); // 300−500
  assert.equal(r.cpi, 1.2); // 300/250 (abaixo do custo)
});

// ── BR-EVM-006/007/008: estouro de custo (CPI<1) ────────────────────────────
test('BR-EVM-006/007/008: evm: estouro — AC>EV → CPI<1, EAC>BAC e VAC negativo', () => {
  const ativs = [{ custoPlan: 1000, execPct: 50, dataInicioPlan: JAN01, dataFimPlan: JAN11 }];
  // EV = 500; AC = 1000 → CPI = 0.5.
  const r = evmLib.evm(ativs, 1000, JAN11);
  assert.equal(r.ev, 500);
  assert.equal(r.cpi, 0.5); // 500/1000
  assert.equal(r.cv, -500); // 500−1000
  assert.equal(r.eac, 2000); // BAC/CPI = 1000/0.5
  assert.equal(r.etc, 1000); // 2000−1000
  assert.equal(r.vac, -1000); // 1000−2000 (estouro projetado)
});

// ── BR-EVM-006/007: AC=0 protegido ──────────────────────────────────────────
test('BR-EVM-006/007: evm: AC=0 → CPI=0 e EAC cai no BAC (sem divisão por zero)', () => {
  const ativs = [{ custoPlan: 1000, execPct: 50, dataInicioPlan: JAN01, dataFimPlan: JAN11 }];
  const r = evmLib.evm(ativs, 0, JAN11);
  assert.equal(r.ev, 500);
  assert.equal(r.ac, 0);
  assert.equal(r.cpi, 0); // protegido
  assert.equal(r.cv, 500); // 500−0
  assert.equal(r.eac, 1000); // = BAC, pois CPI não é > 0
  assert.equal(r.etc, 1000); // EAC−AC
  assert.equal(r.vac, 0); // BAC−EAC
});

// ── BR-EVM-006: PV=0 protegido (referência antes de qualquer início) ────────
test('BR-EVM-006: evm: PV=0 → SPI=0 (sem divisão por zero)', () => {
  const ativs = [{ custoPlan: 1000, execPct: 40, dataInicioPlan: JAN01, dataFimPlan: JAN11 }];
  // Referência antes do início: progresso planejado 0 → PV = 0.
  const r = evmLib.evm(ativs, 100, '2025-12-01');
  assert.equal(r.pv, 0);
  assert.equal(r.ev, 400); // EV independe da data de referência
  assert.equal(r.spi, 0); // protegido
  assert.equal(r.sv, 400); // 400−0
});

// ── BR-EVM-002/003: data antes do início e depois do fim entre etapas ───────
test('BR-EVM-002/003: evm: etapa concluída (PV=1) e etapa futura (PV=0) na mesma data', () => {
  const ativs = [
    { id: 'a1', custoPlan: 1000, execPct: 100, dataInicioPlan: JAN01, dataFimPlan: JAN11 },
    { id: 'a2', custoPlan: 500, execPct: 0, dataInicioPlan: '2026-03-01', dataFimPlan: '2026-03-11' },
  ];
  // Referência 01/fev: a1 já terminou (PV=1000), a2 ainda não começou (PV=0).
  const r = evmLib.evm(ativs, 0, '2026-02-01');
  assert.equal(r.bac, 1500); // BR-EVM-001: soma dos dois custos
  assert.equal(r.pv, 1000); // 1000×1 + 500×0
  assert.equal(r.ev, 1000); // 1000×1 + 500×0
  assert.equal(r.porAtividade[0].pv, 1000);
  assert.equal(r.porAtividade[1].pv, 0);
  assert.equal(r.porAtividade[1].ev, 0);
});

// ── BR-EVM-002: atividade sem datas contribui BAC/EV mas PV=0 ────────────────
test('BR-EVM-002: evm: atividade sem datas → PV=0, mas conta no BAC e no EV', () => {
  const ativs = [{ custoPlan: 800, execPct: 25 }]; // sem dataInicioPlan/dataFimPlan
  const r = evmLib.evm(ativs, 0, '2026-06-01');
  assert.equal(r.bac, 800);
  assert.equal(r.pv, 0); // sem datas, progresso planejado = 0
  assert.equal(r.ev, 200); // 800 × 0.25
});

// ── Robustez de entrada ─────────────────────────────────────────────────────
test('evm: custo/exec como string (rows crus) são convertidos', () => {
  const ativs = [{ custoPlan: '1000', execPct: '50', dataInicioPlan: JAN01, dataFimPlan: JAN11 }];
  const r = evmLib.evm(ativs, '250', JAN06);
  assert.equal(r.bac, 1000);
  assert.equal(r.pv, 500);
  assert.equal(r.ev, 500);
  assert.equal(r.ac, 250);
});

test('evm: entrada vazia/ inválida devolve zeros', () => {
  const r = evmLib.evm(null, 0, JAN06);
  assert.equal(r.bac, 0);
  assert.equal(r.pv, 0);
  assert.equal(r.ev, 0);
  assert.equal(r.ac, 0);
  assert.equal(r.sv, 0);
  assert.equal(r.cv, 0);
  assert.equal(r.spi, 0);
  assert.equal(r.cpi, 0);
  assert.equal(r.eac, 0); // CPI não > 0 → BAC (0)
  assert.equal(r.etc, 0);
  assert.equal(r.vac, 0);
  assert.deepEqual(r.porAtividade, []);
});
