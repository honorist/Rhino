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

test('segurança: XSS em campos de texto puro sai escapado, nunca cru', () => {
  // titulo/clienteEmpresa/cronograma[].fase continuam texto puro (defesa =
  // escapar tudo). objetivo/observacoes/escopo[].texto viraram texto rico —
  // cobertos no teste seguinte, com defesa = allowlist de sanitização.
  const html = renderHtml(
    propostaFixture({
      titulo: `Proposta ${XSS}`,
      clienteEmpresa: `Empresa ${XSS}`,
      cronograma: [{ fase: `Fase ${XSS}`, inicio: '2026-08-01', fim: '2026-08-05', duracaoDias: 5 }],
    })
  );
  assert.ok(!html.includes(XSS), 'o <script> cru NÃO pode aparecer no HTML servido ao cliente');
  assert.ok(html.includes(XSS_ESC), 'o payload aparece, porém escapado (prova que foi renderizado)');
});

test('segurança: campos de texto rico (objetivo/observações/escopo) sanitizam por allowlist — <script> nunca sobrevive, <strong> sobrevive sem escapar', () => {
  const html = renderHtml(
    propostaFixture({
      objetivo: `<p>Objetivo com <strong>negrito</strong>.</p>${XSS}`,
      observacoes: `<p>Nota <strong>importante</strong>.</p>${XSS}`,
      escopo: [{ texto: `<p>Item <strong>crítico</strong>.</p>${XSS}`, incluso: true }],
    })
  );
  assert.ok(!html.includes('<script'), '<script> não pode sobreviver em campo de texto rico');
  assert.ok(!html.includes('alert(\'xss\')'), 'conteúdo do script não pode sobrar como texto solto');
  // Prova que é allowlist (sanitiza), não blanket-escape (que tornaria <strong> em &lt;strong&gt;)
  // nem blanket-trust (que deixaria o <script> passar).
  assert.ok(html.includes('<strong>negrito</strong>'), 'negrito do objetivo sobrevive sem escapar');
  assert.ok(html.includes('<strong>importante</strong>'), 'negrito das observações sobrevive sem escapar');
  assert.ok(html.includes('<strong>crítico</strong>'), 'negrito do item de escopo sobrevive sem escapar');
});

test('segurança: style perigoso em campo de texto rico é neutralizado, cor válida sobrevive', () => {
  const html = renderHtml(
    propostaFixture({
      objetivo: '<p><span style="color:#ff0000;background:url(javascript:alert(1))">alerta</span></p>',
    })
  );
  assert.ok(!html.includes('javascript:'), 'style perigoso não pode sobreviver');
  assert.ok(html.includes('color:#ff0000'), 'cor de texto válida sobrevive');
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

test('compatibilidade: objetivo/saudação legados (texto puro, sem tags HTML) continuam com o negrito automático de Contratada/Contratante, igual a hoje', () => {
  const html = renderHtml(
    propostaFixture({
      objetivo: 'A Contratada deve cumprir o escopo.',
    })
  );
  assert.ok(html.includes('<strong>CONTRATADA</strong>'), 'destaque automático de "Contratada" continua ativo em objetivo (campo legado, sem HTML)');
});

test('compatibilidade: observações legadas (texto puro) continuam sem o negrito automático — nunca tiveram esse comportamento', () => {
  const html = renderHtml(
    propostaFixture({
      observacoes: 'A Contratada e a Contratante já assinaram.',
    })
  );
  // observacoes usava esc() puro (sem destaque) antes desta mudança — preserva esse comportamento
  assert.ok(!html.includes('<strong>CONTRATADA</strong>'), 'observações nunca tiveram destaque automático — não deve ganhar um agora');
  assert.ok(html.includes('A Contratada e a Contratante já assinaram.'), 'texto aparece normalmente, só sem o negrito automático');
});

test('texto rico: negrito automático de Contratada/Contratante continua funcionando junto com formatação manual do usuário', () => {
  const html = renderHtml(
    propostaFixture({
      objetivo: '<p>A Contratada deve cumprir o <strong>escopo</strong> combinado.</p>',
    })
  );
  assert.ok(html.includes('<strong>CONTRATADA</strong>'), 'destaque automático continua ativo mesmo em campo com HTML de verdade');
  assert.ok(html.includes('<strong>escopo</strong>'), 'negrito aplicado manualmente pelo usuário também sobrevive');
});

test('texto rico: tabela dentro de um item de escopo é preservada (não escapada)', () => {
  const html = renderHtml(
    propostaFixture({
      escopo: [{ texto: '<table><tbody><tr><td>Coluna A</td></tr></tbody></table>', incluso: true }],
    })
  );
  assert.ok(html.includes('<td>Coluna A</td>'), 'célula da tabela do item de escopo sobrevive, não escapada');
  assert.ok(!html.includes('&lt;table&gt;'), 'a tabela não pode ter sido escapada como texto puro');
});

test('robustez: proposta mínima (campos ausentes) ainda renderiza', () => {
  const html = renderHtml({ id: 'p', titulo: 'Mínima', dataEmissao: '2026-07-20' });
  assert.strictEqual(typeof html, 'string');
  assert.ok(/<\/html>/i.test(html));
});
