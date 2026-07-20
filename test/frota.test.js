'use strict';
/**
 * Regras de Frota (handlers/frota.js, extraído do server.js).
 *
 * O que vale testar aqui não é o CRUD, é o que já mordeu antes:
 *   1. Abastecimento espelha um lançamento de caixa. A row de caixa precisa
 *      nascer ANTES do abastecimento — a FK `caixa_entry_id` referencia caixa.
 *      Se a ordem inverter, o INSERT estoura em produção e não no teste.
 *   2. Editar/apagar abastecimento tem de estornar o caixa antigo, senão sobra
 *      saída de caixa órfã inflando o custo da obra.
 *   3. O hodômetro do veículo só anda pra frente.
 *   4. O update de veículo é whitelist — body malicioso não pode escrever
 *      coluna que não está na lista.
 *
 * `repos` é substituído por um duplo que grava a ordem das chamadas; nada toca
 * o Postgres.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const repos = require('../db/repos');
const frota = require('../handlers/frota');

// ── Duplo de teste ──────────────────────────────────────────────────────────
let calls; // log ordenado: ['caixa.create', 'veiculoAbastecimentos.create', …]
let store; // linhas devolvidas pelos findById

function rec(name, ret) {
  return async (...args) => {
    calls.push({ name, args });
    return typeof ret === 'function' ? ret(...args) : ret;
  };
}

// Resposta HTTP falsa: guarda status e body sem abrir socket.
function fakeRes() {
  const res = {
    status: null,
    body: null,
    writeHead(s) {
      res.status = s;
    },
    end(payload) {
      res.body = JSON.parse(payload);
    },
  };
  return res;
}

beforeEach(() => {
  calls = [];
  store = {
    veiculo: { id: 'veic1', kmAtual: 1000 },
    abastecimento: {
      id: 'abst1',
      contractId: 'ct1',
      valorTotal: 300,
      data: '2026-07-01',
      litros: 50,
      caixaEntryId: 'cxa-antigo',
    },
  };

  repos.veiculos = {
    getEnvelope: rec('veiculos.getEnvelope', { veiculos: [] }),
    findById: rec('veiculos.findById', () => store.veiculo),
    create: rec('veiculos.create', {}),
    updateById: rec('veiculos.updateById', (id, patch) => ({ id, ...patch })),
    removeById: rec('veiculos.removeById', {}),
  };
  repos.veiculoPlanos = {
    create: rec('veiculoPlanos.create', {}),
    updateById: rec('veiculoPlanos.updateById', {}),
    removeById: rec('veiculoPlanos.removeById', {}),
  };
  repos.veiculoManutencoes = {
    create: rec('veiculoManutencoes.create', {}),
    updateById: rec('veiculoManutencoes.updateById', {}),
    removeById: rec('veiculoManutencoes.removeById', {}),
  };
  repos.veiculoAbastecimentos = {
    findAll: rec('veiculoAbastecimentos.findAll', []),
    findById: rec('veiculoAbastecimentos.findById', () => store.abastecimento),
    create: rec('veiculoAbastecimentos.create', {}),
    updateById: rec('veiculoAbastecimentos.updateById', {}),
    removeById: rec('veiculoAbastecimentos.removeById', {}),
  };
  repos.caixa = {
    create: rec('caixa.create', {}),
    removeById: rec('caixa.removeById', {}),
  };
});

const names = () => calls.map((c) => c.name);
const argsOf = (name) => calls.find((c) => c.name === name)?.args;

// ── 1. Ordem caixa → abastecimento (a FK depende disso) ─────────────────────
test('POST abastecimento cria o lançamento de caixa ANTES do abastecimento', async () => {
  const res = fakeRes();
  await frota.handlePostVeiculoAbastecimento(
    'veic1',
    { data: '2026-07-15', litros: 40, valorTotal: 250, contractId: 'ct1' },
    res
  );
  assert.strictEqual(res.status, 200);
  const ordem = names();
  const iCaixa = ordem.indexOf('caixa.create');
  const iAbast = ordem.indexOf('veiculoAbastecimentos.create');
  assert.ok(iCaixa >= 0, 'devia ter criado o lançamento de caixa');
  assert.ok(iCaixa < iAbast, 'caixa precisa nascer antes do abastecimento (FK caixa_entry_id)');

  const [caixa] = argsOf('caixa.create');
  assert.strictEqual(caixa.type, 'saida');
  assert.strictEqual(caixa.value, 250);
  assert.strictEqual(caixa.category, 'abastecimento');
  assert.strictEqual(caixa.contractId, 'ct1');

  const [abast] = argsOf('veiculoAbastecimentos.create');
  assert.strictEqual(abast.caixaEntryId, caixa.id, 'abastecimento aponta pro caixa criado');
});

test('POST abastecimento sem contrato não gera saída de caixa', async () => {
  await frota.handlePostVeiculoAbastecimento(
    'veic1',
    { data: '2026-07-15', litros: 40, valorTotal: 250 },
    fakeRes()
  );
  assert.ok(!names().includes('caixa.create'), 'sem obra não há custo a apropriar');
  assert.strictEqual(argsOf('veiculoAbastecimentos.create')[0].caixaEntryId, null);
});

test('POST abastecimento com contrato mas sem valor não gera caixa', async () => {
  await frota.handlePostVeiculoAbastecimento(
    'veic1',
    { data: '2026-07-15', litros: 40, contractId: 'ct1' },
    fakeRes()
  );
  assert.ok(!names().includes('caixa.create'));
});

// ── 2. Estorno em edição e exclusão ─────────────────────────────────────────
test('PUT abastecimento estorna o caixa antigo e recria com o valor novo', async () => {
  await frota.handlePutVeiculoAbastecimento('veic1', 'abst1', { valorTotal: 400 }, fakeRes());

  const removidos = calls.filter((c) => c.name === 'caixa.removeById');
  assert.strictEqual(removidos.length, 1, 'estorna exatamente o lançamento anterior');
  assert.strictEqual(removidos[0].args[0], 'cxa-antigo');

  const [novo] = argsOf('caixa.create');
  assert.strictEqual(novo.value, 400);
  assert.notStrictEqual(novo.id, 'cxa-antigo', 'lançamento novo, id novo');
  assert.strictEqual(argsOf('veiculoAbastecimentos.updateById')[1].caixaEntryId, novo.id);
});

test('PUT que tira o contrato estorna e NÃO recria (nada de caixa órfão)', async () => {
  await frota.handlePutVeiculoAbastecimento('veic1', 'abst1', { contractId: '' }, fakeRes());
  assert.ok(names().includes('caixa.removeById'));
  assert.ok(!names().includes('caixa.create'), 'sem obra não deve sobrar lançamento');
  assert.strictEqual(argsOf('veiculoAbastecimentos.updateById')[1].caixaEntryId, null);
});

test('PUT abastecimento inexistente responde 404 sem mexer no caixa', async () => {
  store.abastecimento = null;
  const res = fakeRes();
  await frota.handlePutVeiculoAbastecimento('veic1', 'sumiu', { valorTotal: 10 }, res);
  assert.strictEqual(res.status, 404);
  assert.ok(!names().includes('caixa.removeById'));
  assert.ok(!names().includes('veiculoAbastecimentos.updateById'));
});

test('DELETE abastecimento estorna o lançamento de caixa vinculado', async () => {
  await frota.handleDeleteVeiculoAbastecimento('veic1', 'abst1', fakeRes());
  assert.deepStrictEqual(argsOf('caixa.removeById'), ['cxa-antigo']);
});

test('DELETE de abastecimento sem caixa vinculado não tenta estornar', async () => {
  store.abastecimento = { id: 'abst1', caixaEntryId: null };
  await frota.handleDeleteVeiculoAbastecimento('veic1', 'abst1', fakeRes());
  assert.ok(!names().includes('caixa.removeById'));
});

// ── 3. Hodômetro só anda pra frente ─────────────────────────────────────────
test('abastecimento com KM maior atualiza o hodômetro do veículo', async () => {
  await frota.handlePostVeiculoAbastecimento(
    'veic1',
    { data: '2026-07-15', litros: 40, km: 1500 },
    fakeRes()
  );
  assert.strictEqual(argsOf('veiculos.updateById')[1].kmAtual, 1500);
});

test('abastecimento com KM menor NÃO retrocede o hodômetro', async () => {
  await frota.handlePostVeiculoAbastecimento(
    'veic1',
    { data: '2026-07-15', litros: 40, km: 900 },
    fakeRes()
  );
  assert.ok(!names().includes('veiculos.updateById'), 'hodômetro não pode voltar');
});

test('manutenção com KM maior atualiza o hodômetro e o plano vinculado', async () => {
  await frota.handlePostVeiculoManutencao(
    {},
    'veic1',
    { data: '2026-07-15', km: 2000, planoId: 'plano1' },
    fakeRes()
  );
  const [planoId, patch] = argsOf('veiculoPlanos.updateById');
  assert.strictEqual(planoId, 'plano1');
  assert.strictEqual(patch.ultimoKm, 2000);
  assert.strictEqual(patch.ultimaData, '2026-07-15');
  assert.strictEqual(argsOf('veiculos.updateById')[1].kmAtual, 2000);
});

test('PUT km rejeita valor inválido', async () => {
  const res = fakeRes();
  await frota.handlePutVeiculoKm('veic1', { km: 'abc' }, res);
  assert.strictEqual(res.status, 400);
  assert.ok(!names().includes('veiculos.updateById'));
});

// ── 4. Whitelist de campos do veículo ───────────────────────────────────────
test('PUT veículo ignora campos fora da whitelist', async () => {
  await frota.handlePutVeiculo(
    'veic1',
    { modelo: 'Hilux', id: 'outro', createdAt: '1999-01-01', custoMedio: 999 },
    fakeRes()
  );
  const patch = argsOf('veiculos.updateById')[1];
  assert.deepStrictEqual(Object.keys(patch), ['modelo']);
});

test('POST veículo exige placa', async () => {
  const res = fakeRes();
  await frota.handlePostVeiculo({ modelo: 'Hilux' }, res);
  assert.strictEqual(res.status, 400);
  assert.ok(!names().includes('veiculos.create'));
});

test('POST plano exige descrição e ao menos um intervalo', async () => {
  const semDesc = fakeRes();
  await frota.handlePostVeiculoPlano('veic1', { intervaloKm: 10000 }, semDesc);
  assert.strictEqual(semDesc.status, 400);

  const semIntervalo = fakeRes();
  await frota.handlePostVeiculoPlano('veic1', { descricao: 'Troca de óleo' }, semIntervalo);
  assert.strictEqual(semIntervalo.status, 400);
  assert.ok(!names().includes('veiculoPlanos.create'));
});

// ── 5. Lista de abastecimentos filtra no SQL, não em JS ─────────────────────
test('GET abastecimentos filtra por veículo no repositório', async () => {
  await frota.handleListVeiculoAbastecimentos('veic1', fakeRes());
  assert.deepStrictEqual(argsOf('veiculoAbastecimentos.findAll'), [{ veiculoId: 'veic1' }]);
});
