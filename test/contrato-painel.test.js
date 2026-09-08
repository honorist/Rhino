'use strict';
/**
 * @file lib/contrato-painel.js — o "o que precisa de mim agora" da obra.
 *
 * A inteligência dos seis sinais JÁ existia, mas espalhada em seis abas
 * diferentes (RDO, Punch, SSMA, EVM, Data book, Equipe) — cada uma calculando
 * a sua e nenhuma agregando. Esta lib junta tudo num lugar só, pura e com o
 * relógio injetado (`hojeISO`), no molde de lib/pendencias.js#calcularCobranca.
 *
 * Nenhum teste aqui usa `new Date()`: data fixa sempre, senão o teste muda de
 * resultado conforme o dia em que roda.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { calcularPainel } = require('../lib/contrato-painel');

// Quarta-feira comum, sem feriado por perto.
const HOJE = '2026-03-11';

function contratoBase(over) {
  return Object.assign(
    {
      id: 'ctr1',
      name: 'Obra Teste',
      value: 100000,
      status: 'ativo',
      startDate: '2026-01-05',
      endDate: '2026-12-18',
    },
    over
  );
}

/** Entrada "tudo em ordem": nenhuma pendência em nenhum dos seis sinais. */
function entradaSaudavel(over) {
  return Object.assign(
    {
      contract: contratoBase(),
      rdos: [{ id: 'r1', data: '2026-03-10' }], // último dia útil
      punchResumo: { total: 3, abertos: 0, vencidos: 0, aVencer7d: 0 },
      ssmaResumo: { total: 0, comAfastamento: 0, diasPerdidos: 0, tf: 0, tg: 0 },
      evm: { spi: 1.02, cpi: 1.05, porAtividade: [{ nome: 'Etapa 1' }] },
      dataBook: { pronto: true, pendencias: [] },
      avanco: { pct: 42, base: 'peso' },
      dre: {
        margem: { valor: 25000, pct: 25 },
        receita: { recebida: 100000, medida: 100000 },
        custoTotal: 75000,
        contractValue: 100000,
        saldoAMedir: { valor: 0, pct: 0 },
      },
      organograma: [],
      recursos: [],
      hojeISO: HOJE,
    },
    over
  );
}

// ── Estado de sucesso ───────────────────────────────────────────────────────

test('obra em ordem não inventa pendência: acoes vazio', () => {
  const p = calcularPainel(entradaSaudavel());
  assert.deepStrictEqual(p.acoes, [], `esperava nenhuma ação, veio: ${JSON.stringify(p.acoes)}`);
});

test('obra em ordem ainda devolve o retrato (avanço, prazo, margem)', () => {
  const p = calcularPainel(entradaSaudavel());
  assert.strictEqual(p.obra.avancoFisico.pct, 42);
  assert.strictEqual(p.obra.avancoFisico.base, 'peso');
  assert.strictEqual(p.obra.margem.pct, 25);
  assert.strictEqual(p.obra.margem.status, 'ok');
  assert.ok(p.obra.prazo, 'esperava o bloco de prazo');
});

// ── BR-PAINEL-001: RDO ──────────────────────────────────────────────────────

test('BR-PAINEL-001: RDO em dia (último dia útil) não gera ação', () => {
  const p = calcularPainel(entradaSaudavel({ rdos: [{ id: 'r1', data: '2026-03-10' }] }));
  assert.ok(!p.acoes.some((a) => a.area === 'rdo'));
});

test('BR-PAINEL-001: dias úteis sem RDO viram ação, ignorando fim de semana', () => {
  // Último RDO na sexta 06/03; hoje quarta 11/03 → seg/ter/qua = 3 dias úteis.
  const p = calcularPainel(entradaSaudavel({ rdos: [{ id: 'r1', data: '2026-03-06' }] }));
  const acao = p.acoes.find((a) => a.area === 'rdo');
  assert.ok(acao, 'esperava ação de RDO atrasado');
  assert.strictEqual(acao.quantidade, 3);
  assert.match(acao.href, /tab=rdo/);
});

test('BR-PAINEL-001: FERIADO não conta como dia útil (a versão do cliente errava isso)', () => {
  // 2026: Sexta-feira Santa cai em 03/04. Último RDO na quarta 01/04, hoje
  // segunda 06/04. Dias úteis desde então: 02/04 (qui) e 06/04 (seg) = 2.
  // Uma conta que só pula fim de semana — como a do cliente — diria 3,
  // contando o feriado.
  const p = calcularPainel(
    entradaSaudavel({
      rdos: [{ id: 'r1', data: '2026-04-01' }],
      hojeISO: '2026-04-06',
    })
  );
  const acao = p.acoes.find((a) => a.area === 'rdo');
  assert.ok(acao, 'esperava ação de RDO');
  assert.strictEqual(acao.quantidade, 2, 'o feriado de 03/04 não pode ser contado como dia útil');
});

test('BR-PAINEL-001: RDO no último dia útil ANTES de um feriado conta como em dia', () => {
  // Quinta 02/04 é o último dia útil antes de segunda 06/04 (03/04 é feriado).
  // Quem lançou o RDO na quinta está em dia, não devendo nada.
  const p = calcularPainel(
    entradaSaudavel({
      rdos: [{ id: 'r1', data: '2026-04-02' }],
      hojeISO: '2026-04-06',
    })
  );
  assert.ok(!p.acoes.some((a) => a.area === 'rdo'), 'não pode cobrar quem lançou no último dia útil');
});

test('BR-PAINEL-001: obra que ainda não começou não é cobrada de RDO', () => {
  const p = calcularPainel(
    entradaSaudavel({
      contract: contratoBase({ startDate: '2099-01-01' }),
      rdos: [],
    })
  );
  assert.ok(!p.acoes.some((a) => a.area === 'rdo'), 'obra futura não deve RDO');
});

test('BR-PAINEL-001: obra encerrada não é cobrada de RDO', () => {
  const p = calcularPainel(
    entradaSaudavel({
      contract: contratoBase({ status: 'concluido' }),
      rdos: [],
    })
  );
  assert.ok(!p.acoes.some((a) => a.area === 'rdo'), 'obra concluída não deve RDO');
});

// ── Punch ───────────────────────────────────────────────────────────────────

test('punch vencido vira ação, e aponta pra aba já filtrada', () => {
  const p = calcularPainel(
    entradaSaudavel({ punchResumo: { total: 5, abertos: 4, vencidos: 2, aVencer7d: 1 } })
  );
  const acao = p.acoes.find((a) => a.area === 'punch');
  assert.ok(acao);
  assert.strictEqual(acao.quantidade, 2);
  assert.match(acao.href, /tab=punch/);
  assert.match(acao.href, /f=vencidos/);
});

test('punch só "a vencer" é aviso, não urgência', () => {
  const comVencido = calcularPainel(
    entradaSaudavel({ punchResumo: { total: 5, abertos: 4, vencidos: 2, aVencer7d: 0 } })
  ).acoes.find((a) => a.area === 'punch');
  const soAVencer = calcularPainel(
    entradaSaudavel({ punchResumo: { total: 5, abertos: 4, vencidos: 0, aVencer7d: 3 } })
  ).acoes.find((a) => a.area === 'punch');

  assert.ok(soAVencer, 'a vencer em 7 dias também merece aparecer');
  assert.notStrictEqual(
    comVencido.severidade,
    soAVencer.severidade,
    'vencido e a-vencer não podem ter a mesma severidade'
  );
});

// ── SSMA ────────────────────────────────────────────────────────────────────

test('acidente com afastamento vira ação e as taxas seguem nos indicadores', () => {
  const p = calcularPainel(
    entradaSaudavel({
      ssmaResumo: { total: 4, comAfastamento: 1, diasPerdidos: 12, tf: 3.4, tg: 41 },
    })
  );
  const acao = p.acoes.find((a) => a.area === 'ssma');
  assert.ok(acao);
  assert.strictEqual(acao.quantidade, 1);
  // TF/TG são indicadores legais — não podem se perder na agregação.
  assert.strictEqual(p.indicadores.tf, 3.4);
  assert.strictEqual(p.indicadores.tg, 41);
});

// ── BR-PAINEL-002: EVM ──────────────────────────────────────────────────────

test('BR-PAINEL-002: SPI baixo vira ação de prazo', () => {
  const p = calcularPainel(
    entradaSaudavel({ evm: { spi: 0.8, cpi: 1.0, porAtividade: [{ nome: 'E1' }] } })
  );
  const acao = p.acoes.find((a) => a.area === 'prazo');
  assert.ok(acao, 'SPI 0,80 deveria gerar ação');
  assert.match(acao.href, /tab=evm/);
});

test('BR-PAINEL-002: CPI baixo vira ação de custo', () => {
  const p = calcularPainel(
    entradaSaudavel({ evm: { spi: 1.0, cpi: 0.7, porAtividade: [{ nome: 'E1' }] } })
  );
  assert.ok(p.acoes.some((a) => a.area === 'custo'));
});

test('BR-PAINEL-002: obra SEM etapas não gera alarme de SPI/CPI', () => {
  // Sem cronograma o EVM devolve zeros — alarmar aqui seria repetir o erro do
  // "0,00 vermelho" que a aba EVM já aprendeu a não cometer.
  const p = calcularPainel(
    entradaSaudavel({ evm: { spi: 0, cpi: 0, porAtividade: [] } })
  );
  assert.ok(
    !p.acoes.some((a) => a.area === 'prazo' || a.area === 'custo'),
    'obra sem cronograma não pode ser acusada de atraso/estouro'
  );
});

// ── Data book ───────────────────────────────────────────────────────────────

test('data book pendente só cobra perto da entrega', () => {
  const longe = calcularPainel(
    entradaSaudavel({
      contract: contratoBase({ endDate: '2026-12-18' }), // ~9 meses à frente
      dataBook: { pronto: false, pendencias: ['3 itens de punch em aberto'] },
    })
  );
  assert.ok(
    !longe.acoes.some((a) => a.area === 'databook'),
    'obra no meio da execução não tem pendência de entrega'
  );

  const perto = calcularPainel(
    entradaSaudavel({
      contract: contratoBase({ endDate: '2026-03-25' }), // 14 dias
      dataBook: { pronto: false, pendencias: ['3 itens de punch em aberto'] },
    })
  );
  assert.ok(perto.acoes.some((a) => a.area === 'databook'), 'perto da entrega, sim');
});

// ── BR-PAINEL-003: documentos da equipe ─────────────────────────────────────

test('BR-PAINEL-003: documento vencido de quem está NESTA obra vira ação', () => {
  const p = calcularPainel(
    entradaSaudavel({
      organograma: [{ id: 'm1', recursoId: 'rec1' }],
      recursos: [
        {
          id: 'rec1',
          nome: 'João',
          documentos: [{ tipo: 'aso', nome: 'ASO', dataVencimento: '2026-02-01' }],
        },
      ],
    })
  );
  const acao = p.acoes.find((a) => a.area === 'equipe');
  assert.ok(acao, 'documento vencido deveria gerar ação');
  assert.strictEqual(acao.quantidade, 1);
  assert.match(acao.href, /tab=equipe/);
});

test('BR-PAINEL-003: documento de quem NÃO está nesta obra é ignorado', () => {
  const p = calcularPainel(
    entradaSaudavel({
      organograma: [{ id: 'm1', recursoId: 'rec1' }],
      recursos: [
        { id: 'rec1', nome: 'João', documentos: [] },
        {
          id: 'rec9',
          nome: 'Outro',
          documentos: [{ tipo: 'aso', dataVencimento: '2020-01-01' }],
        },
      ],
    })
  );
  assert.ok(!p.acoes.some((a) => a.area === 'equipe'), 'o painel é da obra, não da empresa');
});

test('BR-PAINEL-003: documento vencendo em 30 dias avisa, com severidade menor', () => {
  const vencido = calcularPainel(
    entradaSaudavel({
      organograma: [{ id: 'm1', recursoId: 'rec1' }],
      recursos: [{ id: 'rec1', documentos: [{ tipo: 'aso', dataVencimento: '2026-02-01' }] }],
    })
  ).acoes.find((a) => a.area === 'equipe');

  const vencendo = calcularPainel(
    entradaSaudavel({
      organograma: [{ id: 'm1', recursoId: 'rec1' }],
      recursos: [{ id: 'rec1', documentos: [{ tipo: 'aso', dataVencimento: '2026-03-25' }] }],
    })
  ).acoes.find((a) => a.area === 'equipe');

  assert.ok(vencendo, 'vencendo em 30 dias precisa aparecer');
  assert.notStrictEqual(vencido.severidade, vencendo.severidade);
});

// ── Margem / faturamento ────────────────────────────────────────────────────

test('contrato zerado: margem sem_movimento, sem alarme falso', () => {
  const p = calcularPainel(
    entradaSaudavel({
      contract: contratoBase({ value: 0 }),
      dre: {
        margem: { valor: 0, pct: 0 },
        receita: { recebida: 0, medida: 0 },
        custoTotal: 0,
        contractValue: 0,
        saldoAMedir: { valor: 0, pct: 0 },
      },
    })
  );
  assert.strictEqual(p.obra.margem.status, 'sem_movimento');
  assert.strictEqual(p.obra.margem.faltamPp, null, 'não se cobra meta de quem não se moveu');
});

test('faturamento traz contratado/medido/emitido/recebido/aMedir', () => {
  const p = calcularPainel(entradaSaudavel());
  for (const k of ['contratado', 'medido', 'recebido', 'aMedir']) {
    assert.ok(k in p.obra.faturamento, `faltou ${k} no faturamento`);
  }
});

// ── Ordenação e robustez ────────────────────────────────────────────────────

test('ações vêm ordenadas por severidade, crítico primeiro', () => {
  const p = calcularPainel(
    entradaSaudavel({
      rdos: [{ id: 'r1', data: '2026-03-06' }],
      punchResumo: { total: 5, abertos: 4, vencidos: 0, aVencer7d: 2 },
      ssmaResumo: { total: 1, comAfastamento: 1, diasPerdidos: 5, tf: 1, tg: 2 },
    })
  );
  assert.ok(p.acoes.length >= 3);
  const ordem = { critico: 0, alto: 1, medio: 2, baixo: 3 };
  const sevs = p.acoes.map((a) => ordem[a.severidade] ?? 99);
  assert.deepStrictEqual(sevs, sevs.slice().sort((a, b) => a - b), 'ações fora de ordem');
});

test('entrada vazia/undefined não derruba o painel', () => {
  const p = calcularPainel({ contract: contratoBase(), hojeISO: HOJE });
  assert.ok(Array.isArray(p.acoes));
  assert.ok(p.obra);
  assert.ok(p.indicadores);
});

test('toda ação tem id, título e href navegável', () => {
  const p = calcularPainel(
    entradaSaudavel({
      rdos: [{ id: 'r1', data: '2026-03-06' }],
      punchResumo: { total: 5, abertos: 4, vencidos: 2, aVencer7d: 0 },
    })
  );
  for (const a of p.acoes) {
    assert.ok(a.id, 'ação sem id');
    assert.ok(a.titulo, `ação ${a.id} sem título`);
    assert.match(a.href, /^#\/contratos\/ctr1\?tab=/, `href inválido em ${a.id}: ${a.href}`);
  }
});
