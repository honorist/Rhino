# Arquitetura do Rhino

## Visão geral

```
┌─────────────────────┐
│  Browser (SPA JS)   │  ← polling Store + EventSource /api/stream
└──────────┬──────────┘
           │ HTTPS
┌──────────▼──────────┐
│  server.js (Node)   │  ← HTTP nativo, auth via cookie, audit em PG
│   ├ /api/* (CRUD)   │
│   ├ /api/stream     │  ← SSE: bus.publish a cada mutação
│   ├ /api/search     │
│   ├ /api/health     │
│   └ static files    │
└──────────┬──────────┘
           │ pg pool
┌──────────▼──────────┐
│ Postgres 16         │  ← fonte ÚNICA de verdade em produção
└─────────────────────┘
```

## Camadas

### Frontend (`/js`, `/css`)
- **SPA puro** (sem bundler), módulos via `defer` no `index.html`
- **Roteamento** por `location.hash` em `js/app.js`
- **Estado global** em `window.Store` (`js/store.js`) — fetcha das APIs
- **Views** em `js/views/*.js`, cada uma como `window.X = { render(), ... }`
- **PWA** com manifest + service worker (`sw.js`)
- **Realtime** via SSE em `js/realtime.js` — escuta mutações e re-renderiza

### Backend (`server.js` + `lib/` + `db/repos/`)
- **HTTP nativo** (sem Express) — roteamento via `if/match` em `routeRequest()`
- **Auth** com cookies de sessão server-side, bcrypt, rate limit (`lib/auth.js`, `lib/rate-limit.js`)
- **Audit** automático em todas as mutações (`lib/audit.js`)
- **Bus de eventos** in-memory (`lib/bus.js`) — feed do `/api/stream`
- **Repos** abstraem queries do Postgres (`db/repos/*.js`)

### Banco (`db/`)
- **Schema** declarativo em `db/schema.sql`
- **Repos** específicos por entidade — sem ORM, queries SQL diretas
- **Migrations** via scripts em `scripts/migrate-json-to-pg.js`

## Status da migração JSON → Postgres

**Concluído** (todos os reads/writes em runtime passam pelo PG):

| Domínio | Repo | Status |
|---|---|---|
| Contracts | `db/repos/contracts.js` | ✅ |
| Saídas | `db/repos/saidas.js` | ✅ |
| Caixa | `db/repos/caixa.js` | ✅ |
| Contas a pagar | `db/repos/contas_pagar.js` | ✅ |
| Notas fiscais | `db/repos/notas_fiscais.js` | ✅ |
| Clientes | `db/repos/clientes.js` | ✅ |
| Fornecedores | `db/repos/fornecedores.js` | ✅ |
| Recursos | `db/repos/recursos.js` | ✅ |
| Sócios | `db/repos/socios.js` | ✅ |
| Investimentos | `db/repos/investimentos.js` | ✅ |
| BASE / Tipos | `db/repos/base_items.js`, `tipos_base.js` | ✅ |
| RDOs | `db/repos/rdos.js` | ✅ |
| Organograma | `db/repos/organograma.js` | ✅ |
| Doc templates | `db/repos/doc_templates.js` | ✅ |
| Níveis de acesso | `db/repos/niveis_acesso.js` | ✅ |
| Users | `db/repos/users.js` | ✅ |

**Vestígios (não afetam runtime):**

- `data/*.json` (10 arquivos no git) — snapshot histórico, nunca lidos pelo `server.js`. Pode-se remover do git via `git rm --cached data/*.json` se quiser.
- `data/backups/` — usado ativamente por `handleBackup`/`handleBackupDownload` para gerar dumps periódicos do PG. Manter.
- Parâmetro `filename` em `readCollection(filename, repoName, arrayKey)` — vestígio da época JSON, mantido para não editar 12 call sites; ignorado pela função.

**Não há fallback automático JSON→PG.** Em desenvolvimento local, sem `DATABASE_URL` configurada, o `server.js` falha cedo. Para rodar local, use `docker compose up -d` (sobe app + Postgres juntos).

## Observabilidade

| Endpoint | Conteúdo |
|---|---|
| `GET /api/health` | `app/db: ok`, `uptime_s`, `version` (do package.json), `node`, `db_version` |
| `GET /api/metrics` | Contadores HTTP por status/método, memória, contagens por tabela |
| `GET /api/audit` | Histórico de mutações com filtros (auth obrigatório) |
| `GET /api/stream` | SSE de mutações em tempo real (auth obrigatório) |
| `GET /api/online` | Lista de usuários conectados ao stream agora |

Logs estruturados em JSON via stdout — encaminhe pra CloudWatch / Loki / Vector.

## Performance

- **Pool PG**: padrão 10 conexões; ajuste com `PG_POOL_MAX`
- **Bundle inicial**: ~250 KB (Chart.js + ícones + lazy.js core); Mermaid/jsPDF/SignaturePad carregam sob demanda
- **Cache estático**: service worker faz SWR de css/js/svg

## Próximos passos sugeridos

- [ ] Rate limit por usuário (não só IP) em rotas pesadas
- [ ] Read replicas no Postgres se chegar a 100k+ contratos
- [ ] Migrar `data/*.json` legados pra fora do git (`git rm --cached`)
- [ ] Bundler opcional (esbuild) se o número de arquivos JS passar de 50
