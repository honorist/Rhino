# Rhino — Frontend React

Migração da SPA vanilla do Rhino para **React 19 + TypeScript + Vite**.
Construído em paralelo ao frontend antigo (`../js`, `../css`, `../index.html`),
que permanece intacto até o cutover (Fase 5).

Plano completo: [`../docs/PLANO_MIGRACAO_REACT.md`](../docs/PLANO_MIGRACAO_REACT.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 19 |
| Build | Vite 6 |
| Linguagem | TypeScript (strict) |
| Router | React Router 7 (path-based, não hash) |
| Estado cliente | Zustand *(Fase 1)* |
| Estado servidor | TanStack Query *(Fase 1)* |
| Ícones | lucide-react |
| Testes | Vitest + Testing Library |

## Comandos

```bash
npm install        # instala dependências
npm run dev        # dev server em http://localhost:5173 (proxy /api → :3001)
npm run build      # typecheck + build de produção em dist/
npm run typecheck  # só checagem de tipos
npm run lint       # ESLint
npm test           # Vitest
```

> O dev server faz proxy de `/api` para o backend (`server.js`, porta 3001).
> Rode o backend em paralelo: na raiz do projeto, `npm start`.

## Estrutura

```
src/
  main.tsx              entry point
  App.tsx               <Routes> + layout
  routes/
    config.ts           definição tipada de todas as rotas + grupos do menu
  components/layout/     Shell, Sidebar, Topbar, PageHeader
  pages/                 uma página por rota (placeholders até a Fase 3)
  stores/                Zustand (Fase 1)
  lib/                   API client, utils (Fase 1)
  hooks/                 hooks transversais (Fase 4)
  styles/                CSS reaproveitado do app antigo
```

## Status das fases

- [x] **Fase 0** — Fundação: scaffold, shell, router, placeholders
- [x] **Fase 1** — Estado e dados: API client, TanStack Query, Zustand,
  16 slices do `store.js` + dashboard portados (`createResource` + `features/`)
- [x] **Fase 2** — Biblioteca de componentes: Button, Card, Badge, Spinner,
  EmptyState, Modal, FormField, Input/Select/Textarea, DataTable, Toast
- [~] **Fase 3** — Migração das 54 views (6 ondas) — **6/54**.
  **Onda A completa:** Usuários, Sócios, Fornecedores, Clientes, Base, Obras ✅
- [ ] Fase 4 — Transversais e PWA
- [ ] Fase 5 — Testes e cutover

67 testes passando. Componente `MapView` (Leaflet) criado. Pendência de
otimização: Leaflet hoje entra no bundle eager (~150 KB) — lazy-load a rota
Obras na Fase 4. `npm run typecheck && npm run lint && npm test && npm run build` — tudo verde.

### Padrões estabelecidos

- **Dados** (`src/features/<dominio>/queries.ts`): 1 query + 3 mutations por
  recurso. Recursos CRUD padrão via `lib/createResource`; `clientes` é a
  referência explícita; `contracts`/`dashboard` têm lógica própria.
- **UI** (`src/components/ui/`): primitivos sobre o CSS atual.
- **Wrappers Chart/Map**: serão criados na Fase 3 junto da 1ª view que os usa
  (Dashboard, Obras) — evita dependência especulativa.

### Como migrar uma view (Fase 3)

1. Ler a view antiga em `../js/views/<Nome>.js`.
2. Tipar o domínio em `features/<dominio>/types.ts` (campos reais).
3. Criar o componente em `features/<dominio>/<Nome>.tsx` usando os hooks de
   `queries.ts` e os componentes de `components/ui/`.
4. Trocar o `Placeholder` pela view real em `src/App.tsx`.
5. Testar (Vitest) e validar a rota.

## Notas de migração

- **Roteamento path-based** (`/dashboard`) em vez de hash (`#/dashboard`).
  O `server.js` já tem fallback SPA (linha ~4722). Bookmarks antigos com `#`
  serão tratados no cutover.
- O CSS antigo é reaproveitado sem alteração (`styles/`). Os componentes
  React emitem os mesmos IDs/classes (`#shell`, `#sidebar`, `.nav-item`...).
- Topbar mobile + drawer e colapso da sidebar: comportamento completo na Fase 4.
