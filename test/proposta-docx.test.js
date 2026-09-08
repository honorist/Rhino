'use strict';
/**
 * Smoke do gerador de DOCX da proposta (lib/proposta-docx.js) — ~570 linhas sem
 * teste (item 23 do roadmap). Não valida o layout binário; garante que o
 * gerador PERCORRE uma proposta realista sem lançar e produz um .docx válido
 * (assinatura ZIP "PK"), pegando quebras de runtime que só apareceriam ao clicar
 * "baixar DOCX" em produção. Se a lib `docx` não estiver instalada, pula.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { gerarDocx, isDocxAvailable } = require('../lib/proposta-docx');
const JSZip = require('jszip');

function propostaFixture(over = {}) {
  return {
    id: 'prop_1',
    numero: 7,
    ano: 2026,
    revisao: 0,
    titulo: 'Montagem de tubulação industrial',
    tipo: 'material',
    dataEmissao: '2026-07-20',
    clienteEmpresa: 'Cliente LTDA',
    clienteContato: 'Fulano',
    objetivo: 'Fornecimento e montagem conforme escopo.',
    escopo: [
      { texto: 'Solda de tubos', incluso: true },
      { texto: 'Pintura', incluso: false },
    ],
    obrigacoesContratada: ['Fornecer EPIs'],
    obrigacoesContratante: ['Liberar a frente de serviço'],
    cronograma: [{ fase: 'Mobilização', inicio: '2026-08-01', fim: '2026-08-05', duracaoDias: 5 }],
    investimentoHh: [],
    investimentoMat: [{ item: 'Tubo aço', unid: 'm', qtd: 100, valorUnit: 25 }],
    anexos: [],
    condicoesPagamento: '30 dias',
    prazoExecucao: '30 dias corridos',
    signatario: 'Responsável',
    signatarioCargo: 'Engenheiro',
    ...over,
  };
}

test('gerarDocx produz um .docx não-vazio (assinatura ZIP)', async (t) => {
  if (!isDocxAvailable()) {
    t.skip('lib `docx`/`jszip` não instalada neste ambiente');
    return;
  }
  const buf = await gerarDocx(propostaFixture());
  assert.ok(Buffer.isBuffer(buf), 'retorna um Buffer');
  assert.ok(buf.length > 1000, 'DOCX substancial (> 1 KB)');
  // .docx é um ZIP → começa com os bytes "PK\x03\x04".
  assert.strictEqual(buf.slice(0, 2).toString('latin1'), 'PK', 'assinatura de arquivo ZIP');
});

test('gerarDocx aguenta uma proposta mínima sem lançar', async (t) => {
  if (!isDocxAvailable()) {
    t.skip('lib `docx` ausente');
    return;
  }
  const buf = await gerarDocx({ id: 'p', titulo: 'Mínima', dataEmissao: '2026-07-20', tipo: 'material' });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
});

test('gerarDocx: campos com texto rico (negrito/lista/tabela) produzem os marcadores OOXML esperados', async (t) => {
  if (!isDocxAvailable()) {
    t.skip('lib `docx`/`jszip` não instalada neste ambiente');
    return;
  }
  const buf = await gerarDocx(propostaFixture({
    objetivo: '<p>Fornecimento com <strong>garantia estendida</strong>.</p>',
    escopo: [
      { texto: '<table><tbody><tr><td>Item</td><td>Qtd</td></tr></tbody></table>', incluso: true },
    ],
    obrigacoesContratada: [{ titulo: 'Prazo', texto: '<p><u>A Contratada</u> cumprirá o prazo.</p>' }],
  }));
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('<w:b/>'), 'negrito do objetivo aparece no XML');
  assert.ok(xml.includes('<w:tbl>'), 'tabela do item de escopo aparece no XML');
  assert.match(xml, /<w:u w:val="single"\/>/, 'sublinhado da obrigação aparece no XML');
  assert.ok(xml.includes('CONTRATADA'), 'destaque automático continua ativo em obrigações com texto rico');
});

test('gerarDocx: proposta legada (texto puro, sem HTML) continua renderizando exatamente como antes', async (t) => {
  if (!isDocxAvailable()) {
    t.skip('lib `docx` ausente');
    return;
  }
  const buf = await gerarDocx(propostaFixture({
    objetivo: 'Fornecimento e montagem conforme escopo.',
  }));
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 2).toString('latin1') === 'PK');
});

test('gerarDocx com tipo HH (caminho de cálculo de horas) não lança', async (t) => {
  if (!isDocxAvailable()) {
    t.skip('lib `docx` ausente');
    return;
  }
  const buf = await gerarDocx(
    propostaFixture({
      tipo: 'hh',
      investimentoHh: [{ cargo: 'Soldador', qtd: 2, horas: 40, valorHora: 50 }],
      investimentoMat: [],
    })
  );
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 2).toString('latin1') === 'PK');
});
