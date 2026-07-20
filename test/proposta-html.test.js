'use strict';
/**
 * Renderização de proposta em HTML (lib/proposta-html.js) — gerador de ~430
 * linhas que nunca teve teste (item 23 do roadmap; a lacuna é admitida no
 * steering). Este HTML é servido ao CLIENTE (preview + fonte do PDF), então há
 * duas invariantes de segurança que não podem regredir:
 *
 *  1. Todo campo controlado pelo usuário é escapado — sem isso, um título ou
 *     objetivo com <script> vira XSS armazenado no navegador do cliente (o
 *     histórico do projeto já teve correções de XSS stored).
 *  2. Custos internos NUNCA aparecem — esta camada é vista pelo cliente; vazar o
 *     custo/margem interna seria um problema comercial.
 *
 * Função pura (o logo é lido do disco com try/catch → fallback), sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { renderHtml } = require('../lib/proposta-html');

const XSS = `<script>alert('xss')</script>`;
const XSS_ESC = '&lt;script&gt;';

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
    saudacao: 'Prezados,',
    escopo: [
      { texto: 'Solda de tubos', incluso: true },
      { texto: 'Pintura (não incluso)', incluso: false },
    ],
    obrigacoesContratada: [],
    obrigacoesContratante: [],
    cronograma: [{ fase: 'Mobilização', inicio: '2026-08-01', fim: '2026-08-05', duracaoDias: 5 }],
    investimentoHh: [],
    investimentoMat: [{ item: 'Tubo aço', unid: 'm', qtd: 100, valorUnit: 25 }],
    anexos: [],
    condicoesPagamento: '30 dias',
    prazoExecucao: '30 dias corridos',
    observacoes: '',
    signatario: 'Responsável',
    signatarioCargo: 'Engenheiro',
    ...over,
  };
}

test('smoke: renderiza HTML completo sem lançar', () => {
  const html = renderHtml(propostaFixture());
  assert.strictEqual(typeof html, 'string');
  assert.ok(html.length > 500, 'HTML substancial');
  assert.ok(/<html[\s>]/i.test(html), 'tem <html>');
  assert.ok(/<\/html>/i.test(html), 'fecha </html>');
  assert.ok(html.includes('Montagem de tubulação industrial'), 'inclui o título');
  assert.ok(html.includes('Cliente LTDA'), 'inclui o cliente');
});

test('segurança: XSS em campos de usuário sai escapado, nunca cru', () => {
  const html = renderHtml(
    propostaFixture({
      titulo: `Proposta ${XSS}`,
      objetivo: `Objetivo ${XSS}`,
      clienteEmpresa: `Empresa ${XSS}`,
      escopo: [{ texto: `Item ${XSS}`, incluso: true }],
      cronograma: [{ fase: `Fase ${XSS}`, inicio: '2026-08-01', fim: '2026-08-05', duracaoDias: 5 }],
      observacoes: `Obs ${XSS}`,
    })
  );
  assert.ok(!html.includes(XSS), 'o <script> cru NÃO pode aparecer no HTML servido ao cliente');
  assert.ok(html.includes(XSS_ESC), 'o payload aparece, porém escapado (prova que foi renderizado)');
});

test('segurança: título com aspas/ângulos não quebra o atributo <title>', () => {
  const html = renderHtml(propostaFixture({ titulo: `A"B<C>D` }));
  // esc() troca " < > — o <title> permanece bem-formado.
  assert.ok(html.includes('&quot;') && html.includes('&lt;') && html.includes('&gt;'));
  assert.ok(!/<title>[^<]*<C>/.test(html), 'ângulo cru não vaza pro título');
});

test('comercial: custos internos não vazam no HTML do cliente', () => {
  // renderHtml recebe a proposta; mesmo que venham custos internos anexados,
  // eles não fazem parte do template. Marcamos um valor-sentinela e conferimos.
  const html = renderHtml(
    propostaFixture({
      custos: [{ categoria: 'margem', descricao: 'MARGEM_SECRETA_42', valor: 9999 }],
      custoInterno: 'CUSTO_INTERNO_SENTINELA',
    })
  );
  assert.ok(!html.includes('MARGEM_SECRETA_42'), 'descrição de custo interno não pode vazar');
  assert.ok(!html.includes('CUSTO_INTERNO_SENTINELA'), 'custo interno não pode vazar');
  assert.ok(!html.includes('9999'), 'valor de custo interno não pode vazar');
});

test('robustez: proposta mínima (campos ausentes) ainda renderiza', () => {
  const html = renderHtml({ id: 'p', titulo: 'Mínima', dataEmissao: '2026-07-20' });
  assert.strictEqual(typeof html, 'string');
  assert.ok(/<\/html>/i.test(html));
});
