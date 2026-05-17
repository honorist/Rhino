# Rhino

Sistema de gestão empresarial para empresas de construção e serviços industriais: contratos de obras, propostas comerciais, financeiro, RDOs, frota, estoque e cadastros. SPA em JavaScript puro com backend Node.js + Postgres.

Em produção: <https://rhino.up.railway.app>

## Módulos

**Operação**
- **Dashboard** — indicadores consolidados
- **Contratos** — cadastro, detalhamento, saídas e cobrança mensal
- **Propostas** — editor completo com geração de PDF e DOCX usando timbrado oficial Rhino, anexos PDF concatenados, galeria de logos de cases
- **Apresentação** — tela global com textos institucionais (Apresentação, Cases, Segurança) aplicados automaticamente em todas as propostas
- **Cláusulas** — biblioteca reutilizável
- **RDOs** — relatórios diários de obra com fotos
- **Obras / Mapa de Obras** — visualização geográfica (Leaflet)
- **Frota** — veículos e manutenções
- **Estoque** — itens, movimentação e solicitações de compra
- **Recursos** — alocação de equipe e equipamentos

**Comercial e cadastros**
- **Clientes** e **Fornecedores**
- **BASE** — itens base e tipos

**Financeiro**
- Caixa, Contas a Pagar, Contas a Receber (Notas Fiscais), Sócios, Aportes, Investimentos, Conciliação, Previsão, Comparativo

**Plataforma**
- **Usuários** — gestão de contas com bcrypt + sessões em Postgres
- **Configuração** — níveis de acesso por recurso (`view`/`edit`/`admin` por aba)
- **Auditoria** — log de ações
- **Documentos** — repositório de arquivos
- **AI Chat** — assistente integrado
- **Portal** — área externa
- **Manual** — documentação in-app

## Stack

- **Frontend**: HTML + CSS + JS sem bundler, Chart.js, Leaflet, Service Worker com cache-busting por versão
- **Backend**: Node.js >= 18 (`server.js`, HTTP nativo), pool `pg`
- **Banco**: Postgres 16 (fonte única de verdade)
- **PDF/DOCX**: pdfkit, pdf-lib, pdf-to-img, docx, jimp
- **Notificações**: web-push (VAPID)
- **Deploy**: Railway (Docker) — alternativas Fly.io e VPS (Caddy) prontas
- **Testes**: `node --test` + Playwright (E2E de API)

## Estrutura

```
.
├── index.html              # shell da SPA
├── css/                    # estilos (main, components)
├── js/
│   ├── app.js              # roteamento, sidebar, perfil de acesso
│   ├── store.js            # estado global e chamadas à API
│   ├── lib/                # bibliotecas vendorizadas
│   └── views/              # uma view por módulo (Propostas, Contratos, ...)
├── server.js               # API HTTP + estáticos
├── lib/                    # módulos de servidor (permissions, auth, pdf, docx, ...)
├── db/
│   ├── schema.sql          # schema inicial
│   ├── migrations/         # migrations idempotentes (rodadas no deploy)
│   ├── repos/              # camada de acesso ao Postgres
│   └── seed_niveis.sql
├── scripts/                # CLIs (migrações, seed, backup, smoke test, bump-version)
├── functions/              # legado Firebase (não usado em produção)
├── test/                   # unit + Playwright E2E
├── data/                   # JSONs do modo legacy local (fallback)
├── Dockerfile
├── docker-compose.yml      # dev local (app + Postgres)
├── docker-compose.prod.yml # VPS com Caddy
├── railway.json
├── fly.toml
└── DEPLOY.md               # guia completo de deploy
```

## Desenvolvimento local

Requer Node.js >= 18.

```bash
npm install
npm start            # http://localhost:3001
```

O `server.js` serve os estáticos e expõe `/api/*`. Por padrão usa Postgres via `DATABASE_URL`; sem ela, cai no modo arquivo (`data/*.json`) com backups automáticos em `data/backups/`.

### Docker (app + Postgres)

```bash
cp .env.example .env
docker compose up -d --build
# App:    http://localhost:3001
# Banco:  postgres://rhino:<senha>@localhost:5432/rhino
docker compose down       # para sem apagar dados
docker compose down -v    # apaga volume do banco
```

O schema inicial (`db/schema.sql`) é aplicado no primeiro `up` via `docker-entrypoint-initdb.d`.

## Testes

```bash
npm test                 # unit (node --test)
npm run test:e2e         # Playwright (API)
npm run test:headers     # headers de segurança
npm run test:validate    # validação de payload
npm run test:healthz     # /api/health
```

## Migrações e seed

```bash
npm run db:migrate              # roda migrations idempotentes
npm run db:migrate-json         # importa data/*.json para o Postgres
node scripts/seed-realistic.js  # dataset de demonstração (--reset apaga antes)
```

## Deploy

Guia completo em [DEPLOY.md](./DEPLOY.md). Resumo:

- **Railway** (recomendado): build via Dockerfile, `preDeployCommand` roda `npm run db:migrate`, healthcheck em `/api/health`. Custo estimado ~US$ 8–10/mês.
- **Fly.io**: `fly.toml` pronto, ver DEPLOY.md.
- **VPS** (Hetzner/DO): `docker-compose.prod.yml` com Caddy + SSL Let's Encrypt automático.
- **Cloudflare** na frente (DDoS, WAF, cache) — instruções no DEPLOY.md.

### Variáveis de ambiente principais

| Var | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Postgres connection string |
| `PORT` | sim | porta HTTP (Railway injeta) |
| `NODE_ENV` | recomendada | `production` em prod |
| `APP_VERSION` | recomendada | aparece em `/api/health` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | recomendada | bootstrap do primeiro admin |
| `RESEND_API_KEY`, `EMAIL_FROM` | opcional | email transacional (reset de senha) |
| `PG_POOL_MAX` | opcional | tamanho do pool (default 10) |

## Endpoints operacionais

- `GET /api/health` — status app + Postgres (200/503)
- `GET /api/metrics` — contadores HTTP, memória, contagens por tabela

## Segurança

Já implementado:
- bcrypt (10 rounds) para senhas
- Sessões server-side em Postgres (cookie httpOnly + SameSite=Lax + Secure)
- Rate limit login: 5 tentativas falhas / 15 min / (IP+email)
- Rate limit global: 1000 req/min/IP
- Reset de senha via email com token de 1 hora
- LGPD: aceite de termos com versão + timestamp
- Logs estruturados (JSON) em stdout
- Anti-escalada de privilégio em `/api/users` (super-admin é o único que cria/promove admins)

## Permissões

Modelo por recurso (`view:#/rota` e `edit:#/rota`), centralizado em `lib/permissions.js`. Cada perfil em `niveis_acesso` carrega o conjunto de permissões; `/api/auth/login` e `/api/auth/me` devolvem o objeto `permissions` resolvido pelo servidor como fonte autoritativa. A sidebar e as rotas no frontend respeitam essas permissões.

## Versionamento

Versão atual em `package.json` + `changelog.json`. Use `node scripts/bump-version.js <patch|minor|major> "mensagem"` para subir versão e registrar a entrada no changelog.
