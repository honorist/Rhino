# Plano de Migração para React — Rhino

> Documento de planejamento. Big-bang (reescrita completa do frontend).
> Gerado em 2026-05-22 · base: Rhino v1.2.75 · motivação declarada: modernizar a stack.

---

## 1. Situação atual

O frontend do Rhino é um micro-framework próprio, funcional e em produção:

| Item | Hoje |
|---|---|
| Padrão de view | Objeto global em `window` com `render()` → monta HTML em template string → `innerHTML` |
| Estado | `window.Store` — pub/sub com `subscribe`/`notify`/`setState`, slices por domínio |
| Router | Próprio (`app.js`), hash routes `#/rota`, lazy-load por rota via `_lazyManifest` |
| Build | **Nenhum** — edita arquivo, recarrega o browser |
| CSS | 3.792 linhas em 4 arquivos (`main`, `components`, `theme-v2`, `polish`) — design já maduro |
| PWA | `sw.js` manual, manifest, push, offline |
| Segurança | CSP sem `unsafe-inline` (SEC-06) |
| Backend serve frontend | `server.js` static server, `STATIC_ROOT = __dirname`, fallback SPA já existe (linha 4722) |
| Testes | Playwright e2e (`test/e2e/api.spec.js`) |

**Volume a migrar:** ~34.600 linhas de frontend (29.163 em 54 views + ~5.400 em libs transversais; `apiMock.js` de 3.015 linhas é dev-only e será descartado).

---

## 2. Stack-alvo

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | **React 19** | Estável, padrão de mercado |
| Build | **Vite 6** | Build rápido, HMR, plugin PWA |
| Linguagem | **TypeScript** *(decisão D1)* | "Modernizar a stack" sem TS é meia modernização |
| Router | **React Router 7** | Substitui o router próprio e o `_lazyManifest` |
| Estado cliente | **Zustand** | Mais próximo do `Store` pub/sub atual → port direto |
| Estado servidor | **TanStack Query** | Substitui `Store.loadFor` / cache / invalidação |
| Componentes | **CSS atual reaproveitado** *(decisão D3)* | 3.792 linhas de CSS polido — jogar fora seria desperdício |
| PWA | **vite-plugin-pwa** (Workbox) | Substitui `sw.js` manual |
| Testes unit | **Vitest + Testing Library** | Integra com Vite |
| Testes e2e | **Playwright** (mantém) | Já existe; só corrigir seletores |

---

## 3. Decisões a fechar antes de começar

| # | Decisão | Recomendação | Impacto se mudar |
|---|---|---|---|
| D1 | TypeScript ou JS puro? | **TypeScript** | +~30% de esforço; se JS, −40 dias |
| D2 | Coexistência (React + vanilla na mesma app) ou branch paralelo? | **Branch paralelo** — big-bang puro, cutover único no fim | Coexistência reduz risco mas dobra o tooling |
| D3 | Reaproveitar CSS atual ou adotar shadcn/MUI? | **Reaproveitar CSS** | Adotar lib nova: +15-20 dias e re-tematização |
| D4 | `apiMock.js` (3.015 linhas) | **Descartar** (era fallback de dev) | Virar MSW: +1 dia |
| D5 | Versão do PWA durante a migração | sw.js antigo continua até o cutover | — |

---

## 4. Fases

### Fase 0 — Fundação · ~13 dias

- Scaffold Vite + React + TS, ESLint/Prettier
- Estrutura de pastas (`src/`, `routes/`, `components/`, `stores/`, `lib/`, `hooks/`)
- Pipeline de build → deploy: `vite build` gera `dist/`; ajustar `server.js` para `STATIC_ROOT = dist/` (o fallback SPA já existe)
- Importar os 4 CSS atuais sem alteração
- App shell: layout, sidebar, topbar, React Router 7 com rotas vazias (placeholder) para as 37 rotas
- Pipeline no Railway: adicionar etapa de build

### Fase 1 — Núcleo de estado e dados · ~11 dias

- `store.js` (1.551 linhas) → Zustand, slice por slice (contracts, caixa, clientes, …)
- `Store.loadFor` / `invalidate` / `_sliceLoadedAt` → TanStack Query (queries + invalidação)
- Camada de API client tipada (substitui chamadas diretas)
- Helpers `formatBRL`, `getContractById`, etc. → utils puros + selectors

### Fase 2 — Biblioteca de componentes · ~11 dias

Construída sobre o CSS atual (mesmas classes):
- Layout: Shell, Sidebar, Topbar, PageHeader
- Primitivos: Button, Card, Table, Modal, Toast, FormControl, Select, Tabs, EmptyState
- Wrappers de lib: `<Chart>` (chart.js), `<Map>` (leaflet/geo), ícones (`icons.js`), `recurrence.js`

### Fase 3 — Migração das 54 views · ~106 dias

Feita em ondas por domínio. Ordem escolhida para **validar os padrões nas views simples antes de atacar o subsistema de contratos** (o mais acoplado e maior). Detalhe na seção 5.

### Fase 4 — Transversais e PWA · ~10 dias

- `themer.js`, `polish.js`, `onboarding.js`, `realtime.js` (SSE), `offline.js`, `push.js`, `bm.js`, `exports.js` → hooks/effects React
- `vite-plugin-pwa` substitui `sw.js`; revalidar cache e push

### Fase 5 — Testes e cutover · ~8 dias

- Vitest + Testing Library nos componentes críticos
- Corrigir seletores dos testes Playwright onde o DOM mudou
- Deploy em staging, smoke test das 37 rotas
- Cutover: `server.js` passa a servir `dist/`; remover `js/` antigo

---

## 5. Ordem das views (Fase 3)

### Onda A — Cadastros simples (validar padrões) · ~8 dias
Baixa dependência, CRUD direto. Aqui a biblioteca de componentes é estressada e ajustada.

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| Usuarios | 195 | trivial | 0,5d |
| Socios | 202 | small | 1d |
| Fornecedores | 263 | small | 1d |
| Obras | 369 | small | 1d |
| Clientes | 416 | medium | 2d |
| Base | 615 | medium | 2d |

### Onda B — Financeiro · ~20 dias

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| CobrancaMensal | 266 | small | 1d |
| Investimentos | 534 | medium | 2d |
| FolhaPagamento | 549 | medium | 2d |
| ContasPagar | 597 | medium | 2d |
| NotasFiscais | 749 | large | 3d |
| Caixa | 769 | large | 3d |
| Conciliacao | 797 | large | 3d |

### Onda C — Comercial · ~13 dias

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| proposta/acoes | 7 | trivial | 0,5d |
| proposta/preview | 42 | trivial | 0,5d |
| proposta/escopo | 160 | trivial | 0,5d |
| proposta/obrigacoes | 163 | trivial | 0,5d |
| proposta/anexos | 167 | trivial | 0,5d |
| proposta/dados-gerais | 186 | trivial | 0,5d |
| proposta/custo-interno | 193 | trivial | 0,5d |
| proposta/cronograma | 194 | trivial | 0,5d |
| proposta/investimento | 268 | small | 1d |
| PropostaDetail | 289 | small | 1d |
| Clausulas | 292 | small | 1d |
| Propostas | 366 | small | 1d |

### Onda D — Operação · ~21 dias

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| RDOs | 402 | medium | 2d |
| Manutencao | 529 | medium | 2d |
| Auditoria | 561 | medium | 2d |
| Frota | 755 | large | 3d |
| Documentos | 771 | large | 3d |
| SolicitacoesCompra | 900 | large | 3d |
| Estoque | 980 | large | 3d |
| Recursos | 1.410 | XL | 4,5d |

### Onda E — Subsistema de Contratos (o maior nó) · ~31 dias
Mais acoplado e maior. Feito por último, com a biblioteca de componentes já madura.

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| contrato/export-pdf | 119 | trivial | 0,5d |
| contrato/modais | 292 | small | 1d |
| contrato/visao-geral | 324 | small | 1d |
| contrato/charts | 406 | medium | 2d |
| contrato/cronograma | 475 | medium | 2d |
| contrato/rdo-pdf | 523 | medium | 2d |
| contrato/modais-extra | 538 | medium | 2d |
| contrato/rdos | 706 | large | 3d |
| contrato/rdo-form | 767 | large | 3d |
| contrato/organograma | 1.311 | XL | 4,5d ⚠ SVG |
| ContratoDetail | 1.312 | XL | 4,5d |
| Contratos | 1.318 | XL | 4,5d |

### Onda F — Dashboards e transversais · ~24 dias

| View | Linhas | Tier | Est. |
|---|--:|---|--:|
| AiChat | 127 | trivial | 0,5d |
| Previsao | 175 | trivial | 0,5d |
| Comparativo | 212 | small | 1d |
| Apresentacao | 230 | small | 1d |
| Portal | 311 | small | 1d |
| Relatorio | 1.098 | XL | 4,5d |
| Manual | 1.192 | XL | 4,5d ⚠ mermaid |
| Configuracao | 1.381 | XL | 4,5d |
| Dashboard | 1.390 | XL | 4,5d ⚠ charts |

**Critérios de tier:** trivial <200 (0,5d) · small 200-400 (1d) · medium 400-700 (2d) · large 700-1000 (3d) · XL >1000 (4,5d).

---

## 6. Estimativa total

| Fase | Person-days |
|---|--:|
| Fase 0 — Fundação | 13 |
| Fase 1 — Estado e dados | 11 |
| Fase 2 — Componentes | 11 |
| Fase 3 — 54 views | 106 |
| Fase 4 — Transversais e PWA | 10 |
| Fase 5 — Testes e cutover | 8 |
| **Subtotal (JS puro)** | **159** |
| + TypeScript (D1, ~+30% nas fases de código) | ~+40 |
| **Total com TypeScript** | **~199 person-days** |

### Tradução em calendário

| Cenário | Calendário |
|---|---|
| Full-time solo (JS) | ~7-8 meses |
| Full-time solo (TS) | ~9-10 meses |
| Part-time ~12h/semana (TS) | ~12-16 meses |
| Com Claude Code intensivo nas conversões repetitivas | conversão de views acelera ~2x; total ~−25-30% |

> Conversão de view é trabalho repetitivo — é onde o Claude Code mais ajuda.
> Fundação, estado e o subsistema de contratos quase não aceleram.

---

## 7. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| **Freeze de features** durante a migração big-bang | ALTA | Cutover por ondas em staging; ou aceitar coexistência (D2) |
| Regressão nas 37 rotas no cutover | ALTA | Smoke test obrigatório de todas as rotas; manter `js/` antigo até validação |
| `organograma.js` — org chart em SVG | MÉDIA | Avaliar lib (react-flow) vs porte manual cedo, na Onda E |
| Geração de PDF client-side (`rdo-pdf`, `export-pdf`) | MÉDIA | Testar a lib de PDF dentro de React isoladamente na Fase 2 |
| Seletores dos testes Playwright quebram | MÉDIA | Adotar `data-testid` estável já na Fase 2 |
| PWA: cache antigo servindo bundle novo | MÉDIA | Versionar SW; `skipWaiting` controlado no cutover |
| CSP quebrar com Vite | BAIXA | Vite em produção não usa inline; build estático respeita a CSP atual |

---

## 8. Recomendação

O usuário optou pelo big-bang com motivação "modernizar a stack". Este plano atende a isso, mas registra:

1. **Big-bang tem custo de oportunidade alto** — ~7-10 meses sem features novas. Se aparecer demanda de negócio no meio, o plano trava.
2. **A alternativa incremental** (D2 = coexistência) entrega valor desde a 1ª view e é reversível — recomendada se a continuidade do produto importa mais que ter "100% React" rápido.
3. **TypeScript (D1) é o que de fato moderniza** — migrar para React mantendo JS puro entrega metade do benefício pretendido.
4. **Reaproveitar o CSS (D3)** economiza ~3 semanas e preserva o design já validado em produção.

Próximo passo sugerido: fechar as decisões D1-D5 e executar a Fase 0 como prova de conceito (13 dias) — ao fim dela já dá para medir o ritmo real antes de comprometer os 7+ meses.
