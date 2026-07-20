'use strict';
// node --test test/medicao.test.js  (sem servidor, sem DB)
//
// Regras do BM estruturado (lib/medicao.js):
//  BR-MED-001 medição não ultrapassa o saldo contratado do serviço
//  BR-MED-002 preço unitário é snapshot no momento da medição
//  BR-MED-003 retenção = % fixo do contrato, valor sempre derivado
//  BR-MED-004 saída estruturada não admite edição direta de valor
//  BR-MED-005 qtd contratada não pode ficar abaixo do já medido

const { test } = require('node:test');
const assert = require('node:assert/strict');
const med = require('../lib/medicao');

const SERVICOS = [
  { id: 'srv_a', descricao: 'Solda de tubulação', unidade: 'm', qtdContratada: 100, precoUnit: 50, ativo: true },
  { id: 'srv_b', descricao: 'Montagem de estrutura', unidade: 'kg', qtdContratada: 2000, precoUnit: 8.5, ativo: true },
  { id: 'srv_c', descricao: 'Serviço encerrado', unidade: 'un', qtdContratada: 10, precoUnit: 100, ativo: false },
];

// ─── computeMedicao ──────────────────────────────────────────────────────────

test('computeMedicao — fluxo feliz calcula qtd × preço e total', () => {
  const r = med.computeMedicao({
    itens: [
      { servicoId: 'srv_a', qtd: 10 },
      { servicoId: 'srv_b', qtd: 500 },
    ],
    servicos: SERVICOS,
  });
  assert.equal(r.ok, true);
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens[0].valor, 500); // 10 × 50
  assert.equal(r.itens[1].valor, 4250); // 500 × 8,5
  assert.equal(r.total, 4750);
});

test('computeMedicao — BR-MED-002: preço vem da planilha (snapshot), não do payload', () => {
  const r = med.computeMedicao({
    itens: [{ servicoId: 'srv_a', qtd: 1, precoUnit: 999999 }],
    servicos: SERVICOS,
  });
  assert.equal(r.ok, true);
  assert.equal(r.itens[0].precoUnit, 50);
  assert.equal(r.itens[0].valor, 50);
});

test('computeMedicao — BR-MED-001: bloqueia medição acima do saldo, com saldo na mensagem', () => {
  const r = med.computeMedicao({
    itens: [{ servicoId: 'srv_a', qtd: 10 }],
    servicos: SERVICOS,
    medidoPorServico: { srv_a: 95 },
  });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].msg, /saldo disponível: 5 m/);
  assert.match(r.errors[0].msg, /aditivo/);
});

test('computeMedicao — BR-MED-001: medir exatamente o saldo restante passa', () => {
  const r = med.computeMedicao({
    itens: [{ servicoId: 'srv_a', qtd: 5 }],
    servicos: SERVICOS,
    medidoPorServico: { srv_a: 95 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.itens[0].qtd, 5);
});

test('computeMedicao — drift de float não bloqueia falsamente (0.1+0.2 …)', () => {
  const servicos = [{ id: 's', descricao: 'x', unidade: 'un', qtdContratada: 0.3, precoUnit: 10, ativo: true }];
  const r = med.computeMedicao({
    itens: [{ servicoId: 's', qtd: 0.1 }],
    servicos,
    medidoPorServico: { s: 0.2 },
  });
  assert.equal(r.ok, true);
});

test('computeMedicao — rejeita: vazio, serviço inexistente, inativo, qtd inválida, duplicado', () => {
  assert.equal(med.computeMedicao({ itens: [], servicos: SERVICOS }).ok, false);

  const inexistente = med.computeMedicao({ itens: [{ servicoId: 'nope', qtd: 1 }], servicos: SERVICOS });
  assert.equal(inexistente.ok, false);
  assert.match(inexistente.errors[0].msg, /não encontrado/);

  const inativo = med.computeMedicao({ itens: [{ servicoId: 'srv_c', qtd: 1 }], servicos: SERVICOS });
  assert.equal(inativo.ok, false);
  assert.match(inativo.errors[0].msg, /inativo/);

  for (const qtd of [0, -1, 'abc', null, undefined]) {
    const r = med.computeMedicao({ itens: [{ servicoId: 'srv_a', qtd }], servicos: SERVICOS });
    assert.equal(r.ok, false, `qtd inválida deveria falhar: ${JSON.stringify(qtd)}`);
  }

  const dup = med.computeMedicao({
    itens: [
      { servicoId: 'srv_a', qtd: 1 },
      { servicoId: 'srv_a', qtd: 2 },
    ],
    servicos: SERVICOS,
  });
  assert.equal(dup.ok, false);
  assert.match(dup.errors[0].msg, /repetido/);
});

test('computeMedicao — um item inválido invalida a medição inteira (sem medição parcial)', () => {
  const r = med.computeMedicao({
    itens: [
      { servicoId: 'srv_a', qtd: 1 },
      { servicoId: 'srv_b', qtd: 0 },
    ],
    servicos: SERVICOS,
  });
  assert.equal(r.ok, false);
});

// ─── acumularMedido + saldoPorServico ────────────────────────────────────────

test('acumularMedido — soma qtd por serviço, ignorando lixo', () => {
  const acc = med.acumularMedido([
    { servicoId: 'srv_a', qtd: 10 },
    { servicoId: 'srv_a', qtd: '2.5' },
    { servicoId: 'srv_b', qtd: 100 },
    { servicoId: null, qtd: 5 },
    null,
  ]);
  assert.equal(acc.srv_a, 12.5);
  assert.equal(acc.srv_b, 100);
});

test('saldoPorServico — enriquece com medido, saldo, valores e avanço %', () => {
  const [a] = med.saldoPorServico([SERVICOS[0]], { srv_a: 25 });
  assert.equal(a.qtdMedida, 25);
  assert.equal(a.saldoQtd, 75);
  assert.equal(a.valorContratado, 5000);
  assert.equal(a.valorMedido, 1250);
  assert.equal(a.saldoValor, 3750);
  assert.equal(a.avancoPct, 25);
});

test('saldoPorServico — BR-MED-002: reajuste de preço NÃO reescreve o já medido', () => {
  // Mediu 100 m a R$ 50 → R$ 5.000 já faturados num BM. Depois veio reajuste
  // para R$ 60. O valor medido tem que continuar 5.000 (soma dos snapshots),
  // senão a tela mostra R$ 1.000 de medição que não existe em BM nenhum.
  const reajustado = [{ ...SERVICOS[0], precoUnit: 60 }];
  const [s] = med.saldoPorServico(reajustado, { srv_a: 100 }, { srv_a: 5000 });
  assert.equal(s.valorMedido, 5000);
  // Já o contratado/saldo A EXECUTAR reprecifica no preço novo — isso é correto.
  assert.equal(s.valorContratado, 6000);
  assert.equal(s.saldoValor, 1000);

  // Sem o Σ dos snapshots o valor medido seria recalculado no preço novo (6.000)
  // — exatamente o defeito que este teste existe para impedir.
  const [semSnapshot] = med.saldoPorServico(reajustado, { srv_a: 100 });
  assert.equal(semSnapshot.valorMedido, 6000);
});

test('saldoPorServico — serviço sem medição zera o valor medido', () => {
  const [s] = med.saldoPorServico([SERVICOS[1]], { srv_a: 10 }, { srv_a: 500 });
  assert.equal(s.qtdMedida, 0);
  assert.equal(s.valorMedido, 0);
  assert.equal(s.saldoValor, s.valorContratado);
});

test('saldoPorServico — qtd contratada zero não divide por zero', () => {
  const [s] = med.saldoPorServico(
    [{ id: 'z', descricao: 'x', unidade: 'un', qtdContratada: 0, precoUnit: 10 }],
    {}
  );
  assert.equal(s.avancoPct, 0);
});

// ─── computeRetencao (BR-MED-003) ────────────────────────────────────────────

test('computeRetencao — 5% de 10.000 = 500 retido, 9.500 líquido', () => {
  const r = med.computeRetencao(10000, 5);
  assert.deepEqual(r, { pct: 5, retencao: 500, liquido: 9500 });
});

test('computeRetencao — pct inválido/fora da faixa vira 0 (sem retenção)', () => {
  for (const pct of [null, undefined, 'abc', -1, 101]) {
    const r = med.computeRetencao(1000, pct);
    assert.equal(r.retencao, 0, `pct ${JSON.stringify(pct)} deveria zerar`);
    assert.equal(r.liquido, 1000);
  }
});

test('computeRetencao — arredonda a 2 casas (centavos)', () => {
  const r = med.computeRetencao(333.33, 10);
  assert.equal(r.retencao, 33.33);
  assert.equal(r.liquido, 300);
});

// ─── podeEditarSaida (BR-MED-004) ────────────────────────────────────────────

test('podeEditarSaida — sem itens: qualquer edição passa', () => {
  assert.equal(med.podeEditarSaida({ value: 999 }, 100, false).ok, true);
});

test('podeEditarSaida — com itens: mudar valor é bloqueado; mesma data/descrição passa', () => {
  const bloqueado = med.podeEditarSaida({ value: 999 }, 100, true);
  assert.equal(bloqueado.ok, false);
  assert.match(bloqueado.msg, /calculado pelos itens/);

  assert.equal(med.podeEditarSaida({ date: '2026-08-01' }, 100, true).ok, true);
  assert.equal(med.podeEditarSaida({ value: 100.0005 }, 100, true).ok, true); // drift ≠ mudança
});

// ─── validarServicoUpdate (BR-MED-005) + podeExcluirServico ──────────────────

test('validarServicoUpdate — qtd contratada não desce abaixo do medido', () => {
  const servico = SERVICOS[0];
  const r = med.validarServicoUpdate(servico, 40, { qtdContratada: 30 });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].msg, /abaixo do já medido \(40 m\)/);

  assert.equal(med.validarServicoUpdate(servico, 40, { qtdContratada: 40 }).ok, true);
  assert.equal(med.validarServicoUpdate(servico, 40, { descricao: 'novo nome' }).ok, true);
});

test('podeExcluirServico — só sem medição acumulada', () => {
  assert.equal(med.podeExcluirServico(0), true);
  assert.equal(med.podeExcluirServico(undefined), true);
  assert.equal(med.podeExcluirServico(0.001), false);
  assert.equal(med.podeExcluirServico(10), false);
});
