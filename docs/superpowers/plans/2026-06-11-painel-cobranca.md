# Painel "Cobrança por área" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel no topo do Dashboard com semáforo por área (RH, Obras, Financeiro, Frota) mostrando o que está parado, há quantos dias e qual a próxima ação.

**Architecture:** Regra de negócio pura em `lib/pendencias.js` (testada com node:test), handler fino `handlers/dashboard-cobranca.js` que busca via `db/repos` e chama a lib, rota `GET /api/dashboard/cobranca` em `routes/operacao.js`, e render null-safe `_renderCobranca()` em `js/views/Dashboard.js` acima do "Apanhado geral do mês".

**Tech Stack:** Node.js puro (sem framework), node:test + assert/strict, Postgres via `db/repos` (factory camelCase), SPA vanilla (views em `js/views/`).

**Spec:** `docs/superpowers/specs/2026-06-11-painel-cobranca-design.md`

---

## Contexto essencial do codebase (leia antes de começar)

- **Testes**: `npm test` roda `node --test test/`. Padrão: `test/fluxo-compra.test.js` — `const { test } = require('node:test'); const assert = require('node:assert/strict');`. Sem servidor, sem DB.
- **Repos**: `db/repos/index.js` expõe `repos.solicitacoesContratacao`, `repos.vagas`, `repos.candidatos`, `repos.folhaPagamento`, `repos.notasFiscais`, `repos.contracts`, `repos.rdos` (tem `lastRdoDateByContract()` → `{ [contractId]: 'YYYY-MM-DD' }`), `repos.contasPagar`, `repos.manutencoes`, `repos.veiculos`, `repos.veiculoPlanos`. Todos têm `findAll()` e devolvem campos em **camelCase** (`data_limite` → `dataLimite`).
- **Campos relevantes** (todos verificados no schema):
  - `solicitacoes_contratacao`: `status` (aberta|preenchida|cancelada), `createdAt`.
  - `vagas`: `solicitacaoId`, `cargo`. `candidatos`: `vagaId`, `nome`, `status` (contatado|interessado|sem_interesse|reprovado_antecedentes|aprovado), `antecedentesStatus` (pendente|ok|reprovado), `documentos` (JSONB `{rg,cpf,...}`), `updatedAt`.
  - `folha_pagamento`: `competencia` ('YYYY-MM'), `valorVale`, `valePago`, `valorSaldo`, `saldoPago`.
  - `notas_fiscais`: `numero`, `dataLimite`, `emitida`, `dataEmissaoReal`, `prazoRecebimento` (dias).
  - `contracts`: `status` ('ativo' = obra ativa), `name`, `createdAt`.
  - `contas_pagar`: `descricao`, `dataVencimento`, `status` ('pendente'|'pago').
  - `manutencoes`: `equipamento`, `status` (solicitada → pendente_aprovacao → aprovada → retornado; + rejeitada/cancelada), `updatedAt`.
  - `veiculos`: `placa`, `modelo`. `veiculo_planos`: `veiculoId`, `descricao`, `intervaloMeses`, `ultimaData`, `ativo`.
- **`lib/feriados.js`** exporta `isFeriado(date)`, `diasUteisEntre(fromISO, toISO)`, `toISO(date)` (entre outros).
- **`lib/recrutamento-docs.js`** exporta `DOCS_OBRIGATORIOS = ['rg','cpf','residencia','ctps']`.
- **Nome `pendencias` e não `cobranca`**: já existe a view `CobrancaMensal` (`#/cobranca`, mensalidade de clientes) — conceito diferente.
- **`test/routes-parity.test.js`** valida a lista EXATA de rotas de cada `routes/*.js` — nova rota exige atualizar o teste (Task 5).
- **Regra do projeto**: bump de versão exige entrada no `changelog.json` (o script `scripts/bump-version.js` faz os dois).

---

### Task 1: `lib/pendencias.js` — núcleo (dias, vencimento de folha, montagem das áreas)

**Files:**
- Create: `lib/pendencias.js`
- Create: `test/pendencias.test.js`

- [ ] **Step 1: Escrever os testes do núcleo (devem falhar)**

Criar `test/pendencias.test.js`:

```js
'use strict';
// node --test test/pendencias.test.js  (sem servidor, sem DB)
//
// Regra: painel "Cobrança por área" — pendências por área com semáforo
// por dias parado (≥7 vermelho, 3–6 amarelo, <3 não entra).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../lib/pendencias');

const HOJE = '2026-06-11'; // quinta-feira

test('calcularCobranca — entrada vazia devolve 4 áreas verdes', () => {
  const r = p.calcularCobranca({ hojeISO: HOJE });
  assert.equal(r.areas.length, 4);
  assert.deepEqual(r.areas.map((a) => a.id), ['rh', 'obras', 'financeiro', 'frota']);
  for (const a of r.areas) {
    assert.equal(a.cor, 'verde');
    assert.deepEqual(a.pendencias, []);
  }
});

test('calcularCobranca — entrada null não quebra', () => {
  const r = p.calcularCobranca(null);
  assert.equal(r.areas.length, 4);
});

test('diasCorridos — conta dias entre datas ISO', () => {
  assert.equal(p.diasCorridos('2026-06-01', HOJE), 10);
  assert.equal(p.diasCorridos(HOJE, HOJE), 0);
  assert.equal(p.diasCorridos('2026-06-04T15:30:00.000Z', HOJE), 7); // aceita timestamp
  assert.equal(p.diasCorridos(null, HOJE), null);
  assert.equal(p.diasCorridos('lixo', HOJE), null);
});

test('vencimentoSaldoFolha — 5º dia útil do mês seguinte (sábado conta, domingo não)', () => {
  // Maio/2026 → junho/2026: 1=seg(út1) 2=ter(út2) 3=qua(út3) 4=qui[Corpus Christi,
  // feriado nacional] 5=sex(út4) 6=sáb(út5) → 2026-06-06
  assert.equal(p.vencimentoSaldoFolha('2026-05'), '2026-06-06');
  assert.equal(p.vencimentoSaldoFolha('inválida'), null);
});

test('semáforo — limiares exatos: 7 dias = vermelho, 3 = amarelo, <3 não entra', () => {
  // contas vencidas: 7, 3 e 2 dias atrás
  const contas = [
    { descricao: 'A', dataVencimento: '2026-06-04', status: 'pendente' }, // 7d → vermelho
    { descricao: 'B', dataVencimento: '2026-06-08', status: 'pendente' }, // 3d → entra
    { descricao: 'C', dataVencimento: '2026-06-09', status: 'pendente' }, // 2d → NÃO entra
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, contas });
  const fin = r.areas.find((a) => a.id === 'financeiro');
  assert.equal(fin.cor, 'vermelho');
  assert.equal(fin.pendencias.length, 2);
  // ordenado da mais antiga para a mais nova
  assert.equal(fin.pendencias[0].diasParado, 7);
  assert.equal(fin.pendencias[1].diasParado, 3);
});

test('semáforo — só pendências de 3–6 dias = amarelo', () => {
  const contas = [{ descricao: 'B', dataVencimento: '2026-06-07', status: 'pendente' }]; // 4d
  const r = p.calcularCobranca({ hojeISO: HOJE, contas });
  assert.equal(r.areas.find((a) => a.id === 'financeiro').cor, 'amarelo');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/pendencias.test.js`
Expected: FAIL — `Cannot find module '../lib/pendencias'`

- [ ] **Step 3: Implementar o núcleo em `lib/pendencias.js`**

```js
'use strict';
/**
 * @file Regra do painel "Cobrança por área" do Dashboard — o que está parado
 * em cada área (RH, Obras, Financeiro, Frota), há quantos dias e qual a
 * próxima ação. Funções puras: recebem listas + hoje, sem DB e sem relógio.
 *
 * Nome `pendencias` (e não `cobranca`) para não colidir com a view
 * CobrancaMensal (#/cobranca — mensalidade de clientes).
 */
const feriados = require('./feriados');
const { DOCS_OBRIGATORIOS } = require('./recrutamento-docs');

// Semáforo por dias parado: a pendência mais antiga define a cor da área.
const DIAS_VERMELHO = 7; // ≥7 dias → vermelho
const DIAS_AMARELO = 3; // 3–6 → amarelo; itens com <3 dias nem entram na lista

const CANDIDATO_EM_ANDAMENTO = ['contatado', 'interessado'];
const MANUTENCAO_PARADA = {
  solicitada: 'aguardando avaliação',
  pendente_aprovacao: 'aguardando aprovação',
};

// Dias corridos entre uma data-base (ISO ou timestamp) e hoje ('YYYY-MM-DD').
function diasCorridos(baseISO, hojeISO) {
  if (!baseISO || !hojeISO) return null;
  const base = new Date(String(baseISO).slice(0, 10) + 'T12:00:00');
  const hoje = new Date(hojeISO + 'T12:00:00');
  if (Number.isNaN(base.getTime()) || Number.isNaN(hoje.getTime())) return null;
  return Math.floor((hoje - base) / 86400000);
}

// 5º dia útil do mês seguinte à competência 'YYYY-MM' — vencimento do saldo
// da folha. Sábado conta como útil; domingo e feriado nacional não (mesma
// regra do quintoDiaUtil do server.js).
function vencimentoSaldoFolha(competencia) {
  const [ano, mes] = String(competencia || '').split('-').map(Number);
  if (!ano || !mes) return null;
  const d = new Date(ano, mes, 1); // mes é 1-12 → índice = mês seguinte
  let uteis = 0;
  for (;;) {
    if (d.getDay() !== 0 && !feriados.isFeriado(d)) {
      uteis++;
      if (uteis === 5) break;
    }
    d.setDate(d.getDate() + 1);
  }
  return feriados.toISO(d);
}

function addDias(iso, dias) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + (dias || 0));
  return feriados.toISO(d);
}

function addMeses(iso, meses) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  d.setMonth(d.getMonth() + (meses || 0));
  return feriados.toISO(d);
}

// Monta a pendência se já estiver parada há ≥ DIAS_AMARELO; senão null.
function montarPendencia({ titulo, base, hojeISO, proximaAcao, href }) {
  const dias = diasCorridos(base, hojeISO);
  if (dias === null || dias < DIAS_AMARELO) return null;
  return { titulo, diasParado: dias, proximaAcao, href };
}

function fecharArea(id, nome, pendencias) {
  const lista = pendencias.slice().sort((a, b) => b.diasParado - a.diasParado);
  let cor = 'verde';
  if (lista.length) cor = lista[0].diasParado >= DIAS_VERMELHO ? 'vermelho' : 'amarelo';
  return { id, nome, cor, pendencias: lista };
}

function pendenciasRH() {
  return []; // Task 2
}

function pendenciasObras() {
  return []; // Task 3
}

function pendenciasFinanceiro({ hojeISO, contas = [] }) {
  const out = [];
  for (const c of contas) {
    if (c.status !== 'pendente' || !c.dataVencimento || c.dataVencimento >= hojeISO) continue;
    const p = montarPendencia({
      titulo: `Conta "${c.descricao}" vencida`,
      base: c.dataVencimento,
      hojeISO,
      proximaAcao: 'Pagar ou renegociar',
      href: '#/contas-pagar',
    });
    if (p) out.push(p);
  }
  return out;
}

function pendenciasFrota() {
  return []; // Task 4
}

function calcularCobranca(input) {
  const i = Object.assign({}, input);
  if (!i.hojeISO) i.hojeISO = new Date().toISOString().slice(0, 10);
  return {
    areas: [
      fecharArea('rh', 'RH', pendenciasRH(i)),
      fecharArea('obras', 'Obras', pendenciasObras(i)),
      fecharArea('financeiro', 'Financeiro', pendenciasFinanceiro(i)),
      fecharArea('frota', 'Frota', pendenciasFrota(i)),
    ],
  };
}

module.exports = {
  DIAS_VERMELHO,
  DIAS_AMARELO,
  diasCorridos,
  vencimentoSaldoFolha,
  calcularCobranca,
};
```

> Nota: `pendenciasFinanceiro` já entra completa nesta task porque os testes do
> semáforo usam contas vencidas como fixture (entrada mais simples).
> Atenção ao teste de `vencimentoSaldoFolha('2026-05')`: se falhar, verifique
> se `lib/feriados.js` considera Corpus Christi (2026-06-04) feriado nacional —
> se não considerar, ajuste o valor esperado do teste para `'2026-06-05'`
> conforme o comportamento real de `isFeriado`, e documente no teste.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/pendencias.test.js`
Expected: PASS (6 testes)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo verde (nenhum teste existente quebra)

- [ ] **Step 6: Commit**

```bash
git add lib/pendencias.js test/pendencias.test.js
git commit -m "feat(pendencias): nucleo da regra de cobranca por area (semaforo por dias parado)"
```

---

### Task 2: Área RH — candidatos, vagas e folha

**Files:**
- Modify: `lib/pendencias.js` (substituir o stub `pendenciasRH`)
- Modify: `test/pendencias.test.js` (acrescentar testes)

- [ ] **Step 1: Escrever os testes (devem falhar)**

Acrescentar ao final de `test/pendencias.test.js`:

```js
// ─── Área RH ──────────────────────────────────────────────────────────────────

test('RH — candidato parado no funil entra com updatedAt como base', () => {
  const candidatos = [
    { id: 'c1', vagaId: 'v1', nome: 'João', status: 'contatado', antecedentesStatus: 'pendente', documentos: {}, updatedAt: '2026-06-01T10:00:00Z' }, // 10d
    { id: 'c2', vagaId: 'v1', nome: 'Ana', status: 'aprovado', documentos: {}, updatedAt: '2026-05-01T10:00:00Z' }, // aprovado → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /João/);
  assert.equal(rh.pendencias[0].diasParado, 10);
  assert.equal(rh.cor, 'vermelho');
});

test('RH — dedup: candidato aguardando documentos gera UMA pendência (a de docs)', () => {
  const candidatos = [{
    id: 'c1', vagaId: 'v1', nome: 'Bia', status: 'interessado',
    antecedentesStatus: 'ok', documentos: { rg: { filename: 'rg.pdf' } }, // faltam cpf/residencia/ctps
    updatedAt: '2026-06-05T10:00:00Z', // 6d
  }];
  const r = p.calcularCobranca({ hojeISO: HOJE, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /aguardando documentos/);
});

test('RH — vaga aberta sem candidato em andamento entra; com candidato não', () => {
  const solicitacoes = [
    { id: 's1', status: 'aberta', createdAt: '2026-06-01T08:00:00Z' }, // 10d, sem candidato
    { id: 's2', status: 'aberta', createdAt: '2026-06-01T08:00:00Z' }, // tem candidato → fora
    { id: 's3', status: 'preenchida', createdAt: '2026-01-01T08:00:00Z' }, // fechada → fora
  ];
  const vagas = [
    { id: 'v1', solicitacaoId: 's1', cargo: 'Pedreiro' },
    { id: 'v2', solicitacaoId: 's2', cargo: 'Mestre' },
  ];
  const candidatos = [
    { id: 'c1', vagaId: 'v2', nome: 'Ze', status: 'contatado', documentos: {}, updatedAt: '2026-06-10T08:00:00Z' }, // 1d → não vira pendência própria
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, solicitacoes, vagas, candidatos });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /Pedreiro/);
});

test('RH — folha vencida agrega por competência', () => {
  // competência 2026-04 → saldo venceu ~2026-05-07 (>7d atrás) → vermelho
  const folha = [
    { competencia: '2026-04', valorVale: 0, valePago: false, saldoPago: false },
    { competencia: '2026-04', valorVale: 500, valePago: false, saldoPago: true },
    { competencia: '2026-04', valorVale: 0, valePago: false, saldoPago: true }, // sem vale e saldo pago → ok
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, folha });
  const rh = r.areas.find((a) => a.id === 'rh');
  assert.equal(rh.pendencias.length, 1);
  assert.match(rh.pendencias[0].titulo, /Folha 2026-04: 2 pagamento/);
  assert.equal(rh.cor, 'vermelho');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/pendencias.test.js`
Expected: FAIL nos 4 testes novos (`rh.pendencias.length` = 0)

- [ ] **Step 3: Implementar `pendenciasRH`**

Substituir o stub em `lib/pendencias.js`:

```js
function pendenciasRH({ hojeISO, solicitacoes = [], vagas = [], candidatos = [], folha = [] }) {
  const out = [];

  // Candidatos parados no funil. Dedup: no máximo UMA pendência por candidato —
  // a mais específica vence (aguardando documentos > parado no funil).
  for (const c of candidatos) {
    if (!CANDIDATO_EM_ANDAMENTO.includes(c.status)) continue;
    const docs = c.documentos || {};
    const faltamDocs = DOCS_OBRIGATORIOS.some((t) => !docs[t]);
    const aguardaDoc = c.status === 'interessado' && c.antecedentesStatus === 'ok' && faltamDocs;
    const pend = montarPendencia({
      titulo: aguardaDoc
        ? `Candidato ${c.nome} aguardando documentos`
        : `Candidato ${c.nome} parado no funil (${c.status})`,
      base: c.updatedAt,
      hojeISO,
      proximaAcao: aguardaDoc ? 'Cobrar/validar documentos' : 'Avançar triagem/antecedentes',
      href: '#/recrutamento',
    });
    if (pend) out.push(pend);
  }

  // Vaga (solicitação de contratação) aberta sem nenhum candidato em andamento.
  // Vaga com candidato andando não é pendência por si só — o candidato é que é.
  const vagasPorSolicitacao = {};
  for (const v of vagas) {
    (vagasPorSolicitacao[v.solicitacaoId] = vagasPorSolicitacao[v.solicitacaoId] || []).push(v);
  }
  const vagasComCandidato = new Set();
  for (const c of candidatos) {
    if (CANDIDATO_EM_ANDAMENTO.includes(c.status)) vagasComCandidato.add(c.vagaId);
  }
  for (const s of solicitacoes) {
    if (s.status !== 'aberta') continue;
    const vs = vagasPorSolicitacao[s.id] || [];
    if (vs.some((v) => vagasComCandidato.has(v.id))) continue;
    const cargo = vs[0] && vs[0].cargo ? ` (${vs[0].cargo})` : '';
    const pend = montarPendencia({
      titulo: `Vaga aberta sem candidato${cargo}`,
      base: s.createdAt,
      hojeISO,
      proximaAcao: 'Buscar candidatos',
      href: '#/recrutamento',
    });
    if (pend) out.push(pend);
  }

  // Folha vencida: agregada por competência (cobrança é em lote, não por pessoa).
  const pendentesPorCompetencia = {};
  for (const f of folha) {
    const valePendente = (parseFloat(f.valorVale) || 0) > 0 && !f.valePago;
    if (!f.saldoPago || valePendente) {
      pendentesPorCompetencia[f.competencia] = (pendentesPorCompetencia[f.competencia] || 0) + 1;
    }
  }
  for (const [comp, n] of Object.entries(pendentesPorCompetencia)) {
    const pend = montarPendencia({
      titulo: `Folha ${comp}: ${n} pagamento(s) pendente(s)`,
      base: vencimentoSaldoFolha(comp),
      hojeISO,
      proximaAcao: 'Pagar folha',
      href: '#/folha-pagamento',
    });
    if (pend) out.push(pend);
  }

  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/pendencias.test.js`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/pendencias.js test/pendencias.test.js
git commit -m "feat(pendencias): area RH — candidatos, vagas abertas e folha vencida"
```

---

### Task 3: Área Obras — NFs (medições) e RDOs

**Files:**
- Modify: `lib/pendencias.js` (substituir o stub `pendenciasObras`)
- Modify: `test/pendencias.test.js`

- [ ] **Step 1: Escrever os testes (devem falhar)**

Acrescentar ao final de `test/pendencias.test.js`:

```js
// ─── Área Obras ───────────────────────────────────────────────────────────────

test('Obras — NF não emitida com prazo vencido entra; emitida em dia não', () => {
  const nfs = [
    { numero: 132, emitida: false, dataLimite: '2026-06-01' }, // 10d vencida
    { numero: 133, emitida: false, dataLimite: '2026-06-20' }, // prazo futuro → fora
    { numero: 134, emitida: true, dataEmissaoReal: '2026-06-10', prazoRecebimento: 30 }, // em dia → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, nfs });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /NF 132 não emitida/);
  assert.equal(obras.pendencias[0].diasParado, 10);
});

test('Obras — NF emitida com recebimento previsto vencido entra', () => {
  const nfs = [
    // emitida 2026-04-30 + 30 dias = previsto 2026-05-30 → 12d vencido
    { numero: 140, emitida: true, dataEmissaoReal: '2026-04-30', prazoRecebimento: 30 },
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, nfs });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /NF 140 — recebimento previsto vencido/);
  assert.equal(obras.pendencias[0].diasParado, 12);
});

test('Obras — obra ativa sem RDO há ≥3 dias úteis entra (dias parado = dias úteis)', () => {
  const contratos = [
    { id: 'ct1', name: 'Obra Sul', status: 'ativo', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'ct2', name: 'Obra Norte', status: 'ativo', createdAt: '2026-01-01T08:00:00Z' },
    { id: 'ct3', name: 'Obra Encerrada', status: 'encerrado', createdAt: '2026-01-01T08:00:00Z' },
  ];
  const ultimoRdoPorContrato = {
    ct1: '2026-06-03', // vários dias úteis sem RDO até 2026-06-11
    ct2: '2026-06-10', // ontem → em dia
  };
  const r = p.calcularCobranca({ hojeISO: HOJE, contratos, ultimoRdoPorContrato });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /Obra Sul sem RDO/);
  assert.ok(obras.pendencias[0].diasParado >= 3);
  assert.equal(obras.pendencias[0].href, '#/contratos/ct1');
});

test('Obras — obra ativa que NUNCA fez RDO usa createdAt como base', () => {
  const contratos = [{ id: 'ct9', name: 'Obra Nova', status: 'ativo', createdAt: '2026-05-01T08:00:00Z' }];
  const r = p.calcularCobranca({ hojeISO: HOJE, contratos, ultimoRdoPorContrato: {} });
  const obras = r.areas.find((a) => a.id === 'obras');
  assert.equal(obras.pendencias.length, 1);
  assert.match(obras.pendencias[0].titulo, /Obra Nova sem RDO/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/pendencias.test.js`
Expected: FAIL nos 4 testes novos

- [ ] **Step 3: Implementar `pendenciasObras`**

Substituir o stub em `lib/pendencias.js`:

```js
function pendenciasObras({ hojeISO, nfs = [], contratos = [], ultimoRdoPorContrato = {} }) {
  const out = [];

  // NFs (medições/BM): não emitida com prazo vencido, ou emitida cujo
  // recebimento previsto (dataEmissaoReal + prazoRecebimento) já passou.
  for (const nf of nfs) {
    if (!nf.emitida && nf.dataLimite && nf.dataLimite < hojeISO) {
      const pend = montarPendencia({
        titulo: `NF ${nf.numero} não emitida (prazo vencido)`,
        base: nf.dataLimite,
        hojeISO,
        proximaAcao: 'Emitir NF',
        href: '#/notas-fiscais',
      });
      if (pend) out.push(pend);
    } else if (nf.emitida && nf.dataEmissaoReal && nf.prazoRecebimento != null) {
      const prevista = addDias(nf.dataEmissaoReal, nf.prazoRecebimento);
      if (prevista < hojeISO) {
        const pend = montarPendencia({
          titulo: `NF ${nf.numero} — recebimento previsto vencido`,
          base: prevista,
          hojeISO,
          proximaAcao: 'Cobrar o cliente',
          href: '#/notas-fiscais',
        });
        if (pend) out.push(pend);
      }
    }
  }

  // RDO é diário por obra ativa. Aqui diasParado é em DIAS ÚTEIS (mesma régua
  // do painel de aderência) — limiares 3/7 aplicam igual.
  for (const c of contratos) {
    if (c.status !== 'ativo') continue;
    const base = ultimoRdoPorContrato[c.id] || (c.createdAt ? String(c.createdAt).slice(0, 10) : null);
    if (!base) continue;
    const diasUteis = feriados.diasUteisEntre(base, hojeISO);
    if (diasUteis == null || diasUteis < DIAS_AMARELO) continue;
    out.push({
      titulo: `Obra ${c.name} sem RDO há ${diasUteis} dia(s) útil(eis)`,
      diasParado: diasUteis,
      proximaAcao: 'Preencher RDO',
      href: `#/contratos/${c.id}`,
    });
  }

  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/pendencias.test.js`
Expected: PASS (14 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/pendencias.js test/pendencias.test.js
git commit -m "feat(pendencias): area Obras — NFs vencidas e RDOs em atraso por obra"
```

---

### Task 4: Área Frota — manutenções paradas e revisões vencidas

**Files:**
- Modify: `lib/pendencias.js` (substituir o stub `pendenciasFrota`)
- Modify: `test/pendencias.test.js`

- [ ] **Step 1: Escrever os testes (devem falhar)**

Acrescentar ao final de `test/pendencias.test.js`:

```js
// ─── Área Frota ───────────────────────────────────────────────────────────────

test('Frota — manutenção solicitada/pendente_aprovacao parada entra; aprovada não', () => {
  const manutencoes = [
    { id: 'm1', equipamento: 'Betoneira', status: 'solicitada', updatedAt: '2026-06-03T10:00:00Z' }, // 8d
    { id: 'm2', equipamento: 'Gerador', status: 'pendente_aprovacao', updatedAt: '2026-06-07T10:00:00Z' }, // 4d
    { id: 'm3', equipamento: 'Serra', status: 'aprovada', updatedAt: '2026-05-01T10:00:00Z' }, // fluindo → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, manutencoes });
  const frota = r.areas.find((a) => a.id === 'frota');
  assert.equal(frota.pendencias.length, 2);
  assert.equal(frota.cor, 'vermelho');
  assert.match(frota.pendencias[0].titulo, /Betoneira aguardando avaliação/);
  assert.match(frota.pendencias[1].titulo, /Gerador aguardando aprovação/);
});

test('Frota — plano de revisão com prazo vencido entra, com a placa do veículo', () => {
  const veiculos = [{ id: 'vh1', placa: 'ABC1D23', modelo: 'Caminhão' }];
  const veiculoPlanos = [
    // última revisão 2025-12-01 + 6 meses = venceu 2026-06-01 → 10d
    { id: 'p1', veiculoId: 'vh1', descricao: 'Troca de óleo', intervaloMeses: 6, ultimaData: '2025-12-01', ativo: true },
    { id: 'p2', veiculoId: 'vh1', descricao: 'Correia', intervaloMeses: 12, ultimaData: '2026-01-01', ativo: true }, // vence 2027 → fora
    { id: 'p3', veiculoId: 'vh1', descricao: 'Plano inativo', intervaloMeses: 1, ultimaData: '2025-01-01', ativo: false }, // inativo → fora
  ];
  const r = p.calcularCobranca({ hojeISO: HOJE, veiculos, veiculoPlanos });
  const frota = r.areas.find((a) => a.id === 'frota');
  assert.equal(frota.pendencias.length, 1);
  assert.match(frota.pendencias[0].titulo, /Troca de óleo.*ABC1D23/);
  assert.equal(frota.pendencias[0].diasParado, 10);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test test/pendencias.test.js`
Expected: FAIL nos 2 testes novos

- [ ] **Step 3: Implementar `pendenciasFrota`**

Substituir o stub em `lib/pendencias.js`:

```js
function pendenciasFrota({ hojeISO, manutencoes = [], veiculos = [], veiculoPlanos = [] }) {
  const out = [];

  // Manutenções de equipamento paradas no fluxo de aprovação.
  for (const m of manutencoes) {
    const situacao = MANUTENCAO_PARADA[m.status];
    if (!situacao) continue;
    const pend = montarPendencia({
      titulo: `Manutenção de ${m.equipamento} ${situacao}`,
      base: m.updatedAt,
      hojeISO,
      proximaAcao: situacao === 'aguardando avaliação' ? 'Avaliar (compras)' : 'Aprovar (gerência)',
      href: '#/manutencao',
    });
    if (pend) out.push(pend);
  }

  // Planos de revisão por prazo (intervaloMeses). Planos só por km ficam fora:
  // km não se converte em "dias parado".
  const placaPorVeiculo = {};
  for (const v of veiculos) placaPorVeiculo[v.id] = v.placa || v.modelo || v.id;
  for (const pl of veiculoPlanos) {
    if (pl.ativo === false || !pl.intervaloMeses || !pl.ultimaData) continue;
    const vencimento = addMeses(pl.ultimaData, pl.intervaloMeses);
    if (vencimento >= hojeISO) continue;
    const pend = montarPendencia({
      titulo: `Revisão "${pl.descricao}" vencida — ${placaPorVeiculo[pl.veiculoId] || 'veículo'}`,
      base: vencimento,
      hojeISO,
      proximaAcao: 'Agendar revisão',
      href: '#/frota',
    });
    if (pend) out.push(pend);
  }

  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/pendencias.test.js`
Expected: PASS (16 testes)

- [ ] **Step 5: Rodar a suíte inteira e commitar**

Run: `npm test`
Expected: tudo verde

```bash
git add lib/pendencias.js test/pendencias.test.js
git commit -m "feat(pendencias): area Frota — manutencoes paradas e revisoes vencidas"
```

---

### Task 5: Endpoint `GET /api/dashboard/cobranca` (handler + rota + parity)

**Files:**
- Create: `handlers/dashboard-cobranca.js`
- Modify: `routes/operacao.js` (após a linha do `/api/dashboard/operacional`, ~linha 90)
- Modify: `server.js` (import ~linha 67; spread no `registerOperacao(apiRouter, {...})` ~linha 3463)
- Modify: `test/routes-parity.test.js` (bloco do operacao.js, ~linha 611)

- [ ] **Step 1: Atualizar o teste de paridade (deve falhar)**

Em `test/routes-parity.test.js`, no teste `'routes/operacao.js — registra exatamente as 73 rotas de operação'` (~linha 611):
1. Renomear para `'routes/operacao.js — registra exatamente as 74 rotas de operação'`.
2. Na lista esperada (array ordenado), inserir `'GET /api/dashboard/cobranca',` imediatamente ANTES de `'GET /api/dashboard/operacional',` (ordem alfabética: c < o).

Run: `node --test test/routes-parity.test.js`
Expected: FAIL no teste do operacao.js (rota ainda não registrada)

- [ ] **Step 2: Criar o handler**

Criar `handlers/dashboard-cobranca.js`:

```js
'use strict';
/**
 * @file Handler do painel "Cobrança por área" do Dashboard.
 * GET /api/dashboard/cobranca — pendências de RH/Obras/Financeiro/Frota com
 * semáforo por dias parado. Regra de negócio em lib/pendencias.js (pura).
 */
const repos = require('../db/repos');
const { sendJson, sendError } = require('../lib/http-respond');
const { calcularCobranca } = require('../lib/pendencias');

async function handleDashboardCobranca(res) {
  try {
    const [
      solicitacoes,
      vagas,
      candidatos,
      folha,
      nfs,
      contratos,
      ultimoRdoPorContrato,
      contas,
      manutencoes,
      veiculos,
      veiculoPlanos,
    ] = await Promise.all([
      repos.solicitacoesContratacao.findAll(),
      repos.vagas.findAll(),
      repos.candidatos.findAll(),
      repos.folhaPagamento.findAll(),
      repos.notasFiscais.findAll(),
      repos.contracts.findAll(),
      repos.rdos.lastRdoDateByContract(),
      repos.contasPagar.findAll(),
      repos.manutencoes.findAll(),
      repos.veiculos.findAll(),
      repos.veiculoPlanos.findAll(),
    ]);
    const hojeISO = new Date().toISOString().slice(0, 10);
    sendJson(
      res,
      calcularCobranca({
        hojeISO,
        solicitacoes,
        vagas,
        candidatos,
        folha,
        nfs,
        contratos,
        ultimoRdoPorContrato,
        contas,
        manutencoes,
        veiculos,
        veiculoPlanos,
      })
    );
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

module.exports = { handleDashboardCobranca };
```

- [ ] **Step 3: Registrar a rota**

Em `routes/operacao.js`, logo após a linha
`router.get('/api/dashboard/operacional', (ctx) => deps.handleDashboardOperacional(ctx.res));` (~linha 90), adicionar:

```js
  router.get('/api/dashboard/cobranca',     (ctx) => deps.handleDashboardCobranca(ctx.res));
```

- [ ] **Step 4: Ligar no server.js**

1. Perto dos outros imports de handlers (~linha 67), adicionar:

```js
const dashboardCobrancaHandlers = require('./handlers/dashboard-cobranca'); // painel "Cobrança por área"
```

2. Dentro do objeto de deps de `registerOperacao(apiRouter, {` (~linha 3463),
   adicionar junto dos outros spreads:

```js
  ...dashboardCobrancaHandlers, // handleDashboardCobranca (handlers/dashboard-cobranca.js)
```

- [ ] **Step 5: Rodar a suíte e confirmar que passa**

Run: `npm test`
Expected: tudo verde, incluindo o parity de 74 rotas

Run: `node --check server.js && node --check handlers/dashboard-cobranca.js && node --check routes/operacao.js`
Expected: sem saída (sintaxe ok)

- [ ] **Step 6: Commit**

```bash
git add handlers/dashboard-cobranca.js routes/operacao.js server.js test/routes-parity.test.js
git commit -m "feat(api): GET /api/dashboard/cobranca — pendencias por area p/ o painel de cobranca"
```

---

### Task 6: Front — `_renderCobranca` no topo do Dashboard

**Files:**
- Modify: `js/views/Dashboard.js` — 3 pontos: Promise.all (~linha 69-93), inserção no HTML (~linha 403-406), novo método `_renderCobranca` (colar antes de `_renderOperacional`, ~linha 1037)

- [ ] **Step 1: Acrescentar o fetch ao Promise.all**

Em `js/views/Dashboard.js` (~linha 69), trocar a desestruturação:

```js
      const [, , rdoJson, anomJson, , opJson, cobJson] = await Promise.all([
```

E após o fetch de `/api/dashboard/operacional` (~linha 90-92), acrescentar como
7º elemento do array:

```js
        fetch('/api/dashboard/cobranca')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
```

- [ ] **Step 2: Inserir a seção no HTML, ACIMA do Apanhado geral**

Logo antes do comentário `<!-- APANHADO GERAL ... -->` (~linha 403), inserir:

```js
        <!-- COBRANÇA POR ÁREA — semáforo do que está parado, há quantos dias e
             onde resolver. Topo absoluto: é a fila de cobrança do dono. -->
        ${this._renderCobranca(cobJson)}
```

- [ ] **Step 3: Adicionar o método `_renderCobranca`**

Colar imediatamente antes de `_renderOperacional(op) {` (~linha 1037):

```js
  // Painel "Cobrança por área": 4 cards (RH/Obras/Financeiro/Frota) com
  // semáforo por dias parado. `cob` vem de /api/dashboard/cobranca
  // (null-safe: se faltar, a seção some). "+N ver todas" usa <details> nativo
  // — sem bind de JS. Cor nunca é o único sinal (emoji + rótulo junto).
  _renderCobranca(cob) {
    if (!cob || !Array.isArray(cob.areas) || cob.areas.length === 0) return '';
    const COR = {
      vermelho: { css: 'var(--rh-neg-strong)', icone: '🔴', rotulo: 'crítico' },
      amarelo: { css: 'var(--rh-warn-strong)', icone: '🟡', rotulo: 'atenção' },
      verde: { css: 'var(--rh-pos-strong)', icone: '🟢', rotulo: 'em dia' },
    };
    const linha = (pend) => `
      <a href="${pend.href}" class="rh-row" style="justify-content:space-between;text-decoration:none;color:inherit;padding:2px 0;" title="${escapeHtml(pend.proximaAcao || '')}">
        <span style="font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(pend.titulo)}</span>
        <b style="white-space:nowrap;margin-left:8px;">${pend.diasParado}d</b>
      </a>`;
    const card = (area) => {
      const cor = COR[area.cor] || COR.verde;
      const pend = Array.isArray(area.pendencias) ? area.pendencias : [];
      const top3 = pend.slice(0, 3);
      const resto = pend.slice(3);
      return `
        <div class="rh-kpi" style="border-left:4px solid ${cor.css};">
          <div class="rh-kpi-label">${cor.icone} ${escapeHtml(area.nome)}
            <span class="rh-meta-xs">· ${cor.rotulo}${pend.length ? ` · ${pend.length} pendência(s)` : ''}</span>
          </div>
          ${pend.length === 0 ? '<div class="rh-kpi-meta">em dia ✓</div>' : top3.map(linha).join('')}
          ${
            resto.length
              ? `<details><summary style="cursor:pointer;font-size:12px;color:var(--rh-ink-500);">+${resto.length} ver todas</summary>${resto.map(linha).join('')}</details>`
              : ''
          }
        </div>`;
    };
    return `
      <div class="card mb-md">
        <div class="card-header">
          <h3 class="card-title">Cobrança por área</h3>
          <span class="rh-meta">o que está parado e há quantos dias — clique para resolver</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-md);">
          ${cob.areas.map(card).join('')}
        </div>
      </div>`;
  },
```

- [ ] **Step 4: Verificar sintaxe e suíte**

Run: `node --check js/views/Dashboard.js && npm test`
Expected: sem erro de sintaxe; suíte verde

- [ ] **Step 5: Verificação visual (stack Docker local)**

```bash
docker compose up -d --build
```

Abrir `http://localhost:3001`, logar e conferir no Dashboard:
- Painel "Cobrança por área" aparece ACIMA do "Apanhado geral do mês".
- 4 cards com cor + emoji + contagem; áreas sem pendência mostram "em dia ✓".
- "+N ver todas" expande via `<details>`; cada linha navega para a tela certa.
- Bloquear `/api/dashboard/cobranca` no DevTools (Network → block request URL)
  e recarregar: o painel some e o resto do Dashboard renderiza normal.

- [ ] **Step 6: Commit**

```bash
git add js/views/Dashboard.js
git commit -m "feat(dashboard): painel Cobranca por area no topo (semaforo por dias parado)"
```

---

### Task 7: Versão + changelog

**Files:**
- Modify: `package.json`, `changelog.json` (via script)

- [ ] **Step 1: Bump minor com changelog (regra do projeto)**

```bash
node scripts/bump-version.js minor "Painel de cobrança por área no topo do Dashboard"
```

Conferir que `changelog.json` ganhou a entrada no topo e que a versão bate com
`package.json`. Ajustar `changes` para algo como:

```json
[
  "Novo painel \"Cobrança por área\" no topo do Dashboard: RH, Obras, Financeiro e Frota com semáforo (verde/amarelo/vermelho)",
  "Cada área mostra o que está parado, há quantos dias e leva direto para a tela onde se resolve",
  "Itens com menos de 3 dias parados não aparecem — o painel é a fila de cobrança do dono"
]
```

- [ ] **Step 2: Suíte final + commit**

Run: `npm test`
Expected: tudo verde

```bash
git add package.json changelog.json
git commit -m "chore: bump versao — painel de cobranca por area"
```

> Deploy: push para o remoto dispara o Railway (migrations no preDeploy; este
> feature não tem migration). Os clientes se atualizam sozinhos — não instruir
> refresh manual.

---

## Self-review (executado na escrita do plano)

- **Cobertura do spec:** UI em grade (Task 6), semáforo/corte (Task 1), RH (Task 2), Obras (Task 3), Financeiro (Task 1), Frota (Task 4), endpoint+arquitetura (Task 5), null-safe (Tasks 5/6), testes (Tasks 1-5), posição acima do Apanhado (Task 6). Dedup de candidato e vaga-sem-candidato (Task 2) conforme spec.
- **Desvios conscientes do spec:** RDO usa dias ÚTEIS como `diasParado` (mesma régua do painel de aderência; documentado no código). Revisão de veículo: apenas planos por prazo (`intervaloMeses`); planos só por km ficam fora (km não vira dias). NF "recebimento previsto vencido" usa só a data (o caixa não tem flag de baixa).
- **Tipos consistentes:** `calcularCobranca(input)` com as mesmas chaves em lib, handler e testes; payload `{ areas: [{ id, nome, cor, pendencias: [{ titulo, diasParado, proximaAcao, href }] }] }` idêntico em todas as tasks.
- **Risco conhecido:** o valor esperado de `vencimentoSaldoFolha('2026-05')` depende de `lib/feriados.js` reconhecer Corpus Christi — instrução de ajuste está na Task 1, Step 3.
