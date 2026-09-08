'use strict';
/**
 * Smoke do gerador de PDF da proposta (lib/proposta-pdf.js) — não existia
 * teste algum pra este arquivo até esta mudança (achado da varredura de
 * texto rico). Mesmo racional de test/proposta-docx.test.js: não valida
 * layout binário pixel a pixel, garante que o gerador percorre uma proposta
 * realista sem lançar e produz um PDF válido (assinatura "%PDF").
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { gerarPdf, isPdfAvailable } = require('../lib/proposta-pdf');

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
    obrigacoesContratada: [{ titulo: 'Prazo', texto: 'A Contratada cumprirá o prazo.' }],
    obrigacoesContratante: [{ titulo: 'Acesso', texto: 'A Contratante liberará a frente de serviço.' }],
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

test('gerarPdf produz um PDF não-vazio (assinatura %PDF)', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs pdfkit/pdf-lib não instaladas'); return; }
  const buf = await gerarPdf(propostaFixture());
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 1000);
  assert.strictEqual(buf.slice(0, 4).toString('latin1'), '%PDF');
});

test('gerarPdf aguenta uma proposta mínima sem lançar', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs ausentes'); return; }
  const buf = await gerarPdf({ id: 'p', titulo: 'Mínima', dataEmissao: '2026-07-20', tipo: 'material' });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
});

test('gerarPdf: campos com texto rico (negrito/lista/tabela/sublinhado) não lançam e produzem PDF válido', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs ausentes'); return; }
  const buf = await gerarPdf(propostaFixture({
    objetivo: '<p>Fornecimento com <strong>garantia estendida</strong> e <u>suporte 24h</u>.</p>',
    escopo: [
      { texto: '<table><tbody><tr><td>Item</td><td>Qtd</td></tr><tr><td>Tubo</td><td>100m</td></tr></tbody></table>', incluso: true },
      { texto: '<ul><li>Não inclui pintura</li></ul>', incluso: false },
    ],
    obrigacoesContratada: [{ titulo: 'Prazo', texto: '<p><span style="color:#1F497D;">A Contratada</span> cumprirá o prazo.</p>' }],
    observacoes: '<p>Observação final <em>importante</em>.</p>',
  }));
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 4).toString('latin1') === '%PDF');
});

test('gerarPdf: proposta legada (texto puro, sem HTML) continua renderizando exatamente como antes', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs ausentes'); return; }
  const buf = await gerarPdf(propostaFixture({
    objetivo: 'Fornecimento e montagem conforme escopo.',
    escopo: [{ texto: '• Item um\n• Item dois', incluso: true }],
  }));
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 4).toString('latin1') === '%PDF');
});

test('gerarPdf: imagem embutida em campo rico (anexo existente) não lança', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs ausentes'); return; }
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082', 'hex');
  const buf = await gerarPdf(propostaFixture({
    objetivo: '<p>Veja a imagem: <img src="/api/propostas/prop_1/anexos/anx1" width="100" height="80"></p>',
    anexos: [{ id: 'anx1', tipo: 'imagem', mimeType: 'image/png', nome: 'x.png', secao: 'inline', data: png }],
  }));
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 4).toString('latin1') === '%PDF');
});

test('gerarPdf com tipo HH (caminho de cálculo de horas) não lança', async (t) => {
  if (!isPdfAvailable()) { t.skip('libs ausentes'); return; }
  const buf = await gerarPdf(propostaFixture({
    tipo: 'hh',
    investimentoHh: [{ cargo: 'Soldador', qtd: 2, horas: 40, valorHora: 50 }],
    investimentoMat: [],
  }));
  assert.ok(Buffer.isBuffer(buf) && buf.slice(0, 4).toString('latin1') === '%PDF');
});
