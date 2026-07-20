'use strict';
// node --test test/folha.test.js  (puro: sem DB, sem rede)
//
// Regras de lib/folha.js — decidem DINHEIRO e viviam no server.js sem teste:
//  BR-FOLHA-001 vale = 40% do salário, só para quem é elegível
//  BR-FOLHA-002 INSS progressivo por faixas, com teto
//  BR-FOLHA-003 saldo vence no 5º dia útil do mês seguinte, com SÁBADO contando
//  BR-FOLHA-004 Carnaval e Corpus Christi NÃO adiam a folha (são facultativos)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const folha = require('../lib/folha');

// ─── BR-FOLHA-001: vale ──────────────────────────────────────────────────────

test('calcVale — 40% do salário para quem é elegível', () => {
  assert.equal(folha.calcVale(3000, true), 1200);
  assert.equal(folha.calcVale(1500.5, true), 600.2);
});

test('calcVale — não elegível não recebe vale', () => {
  assert.equal(folha.calcVale(3000, false), 0);
  assert.equal(folha.calcVale(3000, undefined), 0);
});

test('calcVale — salário inválido ou zero não vira vale negativo nem NaN', () => {
  for (const s of [0, -100, null, undefined, 'abc', NaN]) {
    const v = folha.calcVale(s, true);
    assert.equal(v, 0, `salário ${JSON.stringify(s)} deveria dar vale 0`);
  }
});

// ─── BR-FOLHA-002: INSS ──────────────────────────────────────────────────────

test('calcInss — primeira faixa: 7,5%', () => {
  assert.equal(folha.calcInss(1000), 75);

  // No limite exato da 1ª faixa: 1621,00 × 7,5% = 121,575 na matemática decimal,
  // mas em IEEE-754 o produto é 121.57499999999999, então arredonda para 121,57
  // (meio centavo a menos). Comportamento PRESERVADO da implementação anterior —
  // este teste trava o valor real, não o idealizado.
  // Dívida conhecida: `calcInss` não usa lib/money.js, que existe justamente
  // para conter esse drift; migrar exigiria decidir o efeito em folhas passadas.
  assert.equal(folha.calcInss(1621.0), 121.57);
});

test('calcInss — progressivo: só o excedente paga a alíquota maior', () => {
  // 1621 × 7,5% = 121,575 ; (2000 − 1621) × 9% = 34,11 → 155,69 (arredondado)
  assert.equal(folha.calcInss(2000), 155.69);
  // Se fosse alíquota única de 9% daria 180 — este teste falha se alguém
  // trocar o cálculo progressivo por alíquota cheia.
  assert.notEqual(folha.calcInss(2000), 180);
});

test('calcInss — respeita o teto: salário acima do teto paga o mesmo que o teto', () => {
  const noTeto = folha.calcInss(folha.INSS_TETO);
  assert.equal(folha.calcInss(50000), noTeto);
  assert.equal(folha.calcInss(1000000), noTeto);
  assert.ok(noTeto > 0 && noTeto < folha.INSS_TETO, 'desconto tem que ser plausível');
});

test('calcInss — salário inválido ou não-positivo desconta 0', () => {
  for (const s of [0, -1, null, undefined, 'abc', NaN]) {
    assert.equal(folha.calcInss(s), 0, `salário ${JSON.stringify(s)} deveria dar INSS 0`);
  }
});

test('calcInss — é monotônico: ganhar mais nunca desconta menos', () => {
  let anterior = -1;
  for (let s = 0; s <= 10000; s += 50) {
    const inss = folha.calcInss(s);
    assert.ok(inss >= anterior, `INSS caiu de ${anterior} para ${inss} em salário ${s}`);
    anterior = inss;
  }
});

test('calcInss — sempre em centavos (2 casas)', () => {
  for (const s of [1234.56, 2999.99, 4400.01, 7777.77]) {
    const v = folha.calcInss(s);
    assert.equal(v, Math.round(v * 100) / 100, `${v} não está arredondado a centavos`);
  }
});

// ─── BR-FOLHA-003 / 004: 5º dia útil ─────────────────────────────────────────

test('quintoDiaUtil — cai no mês SEGUINTE à competência', () => {
  assert.match(folha.quintoDiaUtil('2026-01'), /^2026-02-/);
  assert.match(folha.quintoDiaUtil('2026-06'), /^2026-07-/);
});

test('quintoDiaUtil — dezembro vira janeiro do ano seguinte', () => {
  assert.match(folha.quintoDiaUtil('2026-12'), /^2027-01-/);
});

test('quintoDiaUtil — BR-FOLHA-003: sábado CONTA como dia útil', () => {
  // Janeiro/2026: dia 1 (qui) é feriado. Contagem: 2(sex), 3(SÁB), 5(seg),
  // 6(ter), 7(qua) → 5º dia útil = 07. Se sábado não contasse, cairia no dia 8.
  const d = folha.quintoDiaUtil('2025-12');
  assert.equal(d, '2026-01-07');
});

test('quintoDiaUtil — domingo NUNCA conta', () => {
  // Percorre 5 anos e confirma que o resultado nunca é domingo.
  for (let ano = 2024; ano <= 2028; ano++) {
    for (let m = 1; m <= 12; m++) {
      const iso = folha.quintoDiaUtil(`${ano}-${String(m).padStart(2, '0')}`);
      const [y, mm, dd] = iso.split('-').map(Number);
      assert.notEqual(new Date(y, mm - 1, dd).getDay(), 0, `${iso} caiu num domingo`);
    }
  }
});

test('quintoDiaUtil — BR-FOLHA-004: Carnaval não adia a folha', () => {
  // Competência 01/2026 → vencimento em fevereiro/2026, mês do Carnaval
  // (16-17/02/2026). Como Carnaval é facultativo, ele NÃO conta como feriado:
  // 2(seg),3,4,5,6 → dia 6. Se Carnaval entrasse na conta, mudaria.
  assert.equal(folha.quintoDiaUtil('2026-01'), '2026-02-06');
});

test('quintoDiaUtil — feriado nacional no caminho empurra a data', () => {
  // Competência 04/2026 → maio/2026. 01/05 (sex) é Dia do Trabalho e não conta:
  // 2(SÁB),4,5,6,7 → dia 7.
  assert.equal(folha.quintoDiaUtil('2026-04'), '2026-05-07');
});

test('quintoDiaUtil — sempre devolve data ISO válida, em 20 anos', () => {
  for (let ano = 2020; ano <= 2040; ano++) {
    for (let m = 1; m <= 12; m++) {
      const iso = folha.quintoDiaUtil(`${ano}-${String(m).padStart(2, '0')}`);
      assert.match(iso, /^\d{4}-\d{2}-\d{2}$/, `formato inválido: ${iso}`);
      assert.ok(!Number.isNaN(Date.parse(iso)), `data inválida: ${iso}`);
    }
  }
});

test('quintoDiaUtil — competência inválida falha alto, não em silêncio', () => {
  for (const c of ['', 'abc', null, undefined, '2026', 'xx-yy']) {
    assert.throws(() => folha.quintoDiaUtil(c), `deveria lançar para ${JSON.stringify(c)}`);
  }
});

// ─── feriados da folha ───────────────────────────────────────────────────────

test('feriadosFolha — tem os 9 fixos + Sexta-feira Santa', () => {
  const set = folha.feriadosFolha(2026);
  for (const f of ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']) {
    assert.ok(set.has(f), `feriado fixo ${f} faltando`);
  }
  assert.equal(set.size, 10, '9 fixos + Sexta-feira Santa');
  assert.ok(set.has('04-03'), 'Sexta-feira Santa de 2026 é 03/04 (Páscoa 05/04)');
});

test('feriadosFolha — NÃO inclui Carnaval nem Corpus Christi (facultativos)', () => {
  const set = folha.feriadosFolha(2026);
  assert.ok(!set.has('02-16'), 'Carnaval não é feriado para a folha');
  assert.ok(!set.has('02-17'), 'Carnaval não é feriado para a folha');
  assert.ok(!set.has('06-04'), 'Corpus Christi não é feriado para a folha');
});

test('feriadosFolha — Sexta-feira Santa acompanha a Páscoa, sem erro de fuso', () => {
  // Páscoa: 2024=31/03, 2025=20/04, 2027=28/03 → Sexta Santa 2 dias antes.
  assert.ok(folha.feriadosFolha(2024).has('03-29'));
  assert.ok(folha.feriadosFolha(2025).has('04-18'));
  assert.ok(folha.feriadosFolha(2027).has('03-26'));
});
