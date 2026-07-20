# Runbook — Rhino

Procedimentos de operação e resposta a incidentes. O "você do futuro" agradece.

- **Produção:** <https://rhino.up.railway.app>
- **Hospedagem:** Railway (Docker, Node 18+) · **Banco:** Postgres 16 (Railway)
- **Repositório:** <https://github.com/honorist/Rhino> · deploy automático no push para `main`

---

## 1. Está no ar?

| Endpoint | O que diz |
|---|---|
| `GET /api/health` | `app`, `db`, `version`, `uptime_s` — **200** ok, **503** com problema |
| `GET /healthz` · `GET /readyz` | Liveness / readiness (usados pelo balanceador) |
| `GET /api/metrics` | Contadores HTTP, memória, contagens por tabela (exige login) |

Check rápido: `curl -s https://rhino.up.railway.app/api/health`

O campo `observability` do `/api/health` mostra o sink ativo — serve para conferir
a configuração **antes** de precisar dela (descobrir que estava em `console` só
depois de um incidente é tarde).

---

## 1.1 Captura de erro (lib/observability.js)

Erro não tratado (`uncaughtException`, `unhandledRejection`) e **todo 5xx** da API
viram um evento estruturado. Onde ele sai depende de `OBSERVABILITY_SINK`:

| Sink | Comportamento | Quando usar |
|---|---|---|
| `console` (default) | Linha JSON no stdout | Sempre — Railway/Docker já coletam |
| `webhook` | POST em `OBSERVABILITY_WEBHOOK_URL` | Produção, para receber alerta ativo |
| `noop` | Silêncio (default sob `NODE_ENV=test`) | Testes |

**Ligar alerta em produção:** crie um Incoming Webhook (Slack/Discord), e no Railway
defina `OBSERVABILITY_SINK=webhook` e `OBSERVABILITY_WEBHOOK_URL=<url>` (é secret —
não versione). Confirme com `curl -s .../api/health | grep observability`.

**Garantias, para você confiar no que vê:**
- Segredo e PII (senha, token, cookie, CPF, hash) são mascarados antes de sair.
- Erro em laço não vira enxurrada: no máximo `OBSERVABILITY_MAX_PER_KEY` (5) eventos
  do mesmo erro por janela de `OBSERVABILITY_WINDOW_MS` (60s). O primeiro evento da
  janela seguinte traz `suprimidosNaJanelaAnterior` — se esse número estiver alto,
  o erro está em laço, não resolvido.
- Falha do coletor **nunca** derruba o request; vira log local e a requisição segue.

**O que ainda NÃO existe:** uptime check externo. `/api/health` só é útil se alguém
o consultar de fora — configure um monitor (Better Stack, UptimeRobot, Cloudflare
Health Check) apontando para ele, senão um app fora do ar continua invisível.

---

## 2. App fora do ar

1. `curl /api/health` — se responder `503` com `db` ruim, o problema é o **banco** (ver §5). Se não responder nada, é a **aplicação**.
2. Railway → projeto → serviço `rhino` → aba **Deployments** e **Logs**.
3. Erro recente no deploy? Ver §3 (reverter).
4. App de pé mas com erro: ler os **Logs** (JSON estruturado em stdout) — procurar `5xx` e stack.
5. Sem causa óbvia: **Restart** do serviço no Railway.

## 3. Reverter um deploy

O Railway faz **rollback automático** se o healthcheck (`/api/health`) falhar após o deploy. Para reverter manualmente:

- Railway → **Deployments** → escolher o último deploy bom → **Redeploy** / **Rollback**.
- Ou via git: `git revert <commit>` + push → dispara um novo deploy com a reversão.

> Builds do Railway já falharam por **falta de disco no builder** (transitório). Sintoma: produção fica numa versão antiga. Solução: `git commit --allow-empty -m "chore: re-trigger deploy" && git push`.

## 4. Migrations

```bash
npm run db:migrate              # aplica as pendentes (roda no preDeploy do Railway)
npm run db:rollback -- --yes    # reverte a ÚLTIMA migration aplicada
```

- Migrations ficam em `db/migrations/AAAAMMDDHHMMSS_nome.sql`, idempotentes (`IF NOT EXISTS`).
- **Convenção de rollback:** toda migration nova deve vir com um par `..._nome.down.sql` contendo o SQL que a desfaz. Sem ele, `db:rollback` aborta (não adivinha).
- `*.down.sql` é ignorado pelo `run-migrations.js` — só o `rollback-migration.js` o usa.

## 5. Banco e backups

### Backups que existem

- **Backup da aplicação (JSON):** `npm run backup:prod` → loga em produção e baixa via `/api/backup/download` para `deploy-backups/<data>/full_backup.json`. Há também um agendador interno (`BACKUP_HOUR`, `BACKUP_EMAIL`).
- **Recomendado adicionar — dump do Postgres (DR real):**
  ```bash
  pg_dump "$DATABASE_URL" -Fc -f rhino_$(date +%F).dump
  ```

### Restaurar (procedimento de DR)

> ⚠️ Nunca restaure direto sobre produção sem antes ter um dump atual dela.

1. Provisionar um Postgres limpo (Railway ou local via Docker).
2. Restaurar o dump:
   ```bash
   pg_restore --clean --if-exists -d "$DATABASE_URL_DESTINO" rhino_AAAA-MM-DD.dump
   ```
   (ou `psql "$DATABASE_URL_DESTINO" < schema.sql` + importar o JSON.)
3. Subir o app apontando para esse banco e validar `/api/health` + telas-chave.

### Drill mensal (obrigatório)

Backup que nunca foi restaurado **não existe**. Uma vez por mês:
1. Restaurar o backup mais recente num banco descartável.
2. Cronometrar e conferir integridade (contagens de `contracts`, `caixa`, `recursos`).
3. Registrar data e resultado abaixo.

| Data do drill | Backup usado | Tempo de restore | Resultado |
|---|---|---|---|
| _(preencher)_ | | | |

## 6. Secrets

- Secrets de runtime ficam em **variáveis de ambiente** (Railway): `DATABASE_URL`, `RESEND_API_KEY`, `VAPID_*`, `ANTHROPIC_API_KEY`, `ADMIN_*`.
- `.env` e `.rhino-deploy-creds` estão no `.gitignore` — **não vão para o git**.
- ⚠️ `.rhino-deploy-creds` (credenciais de admin usadas pelo `backup:prod`) fica numa pasta sincronizada pelo OneDrive. **Rotacione essa senha periodicamente** e prefira usar as env vars `RHINO_ADMIN_EMAIL` / `RHINO_ADMIN_PASSWORD` no lugar do arquivo.
- Se um secret vazar: rotacionar imediatamente no provedor e atualizar a env var no Railway.

## 7. Usuário preso em versão antiga (cache)

O app é PWA com Service Worker. A partir da v1.2.37 os JS/CSS são versionados (`?v=`), então um reload normal já atualiza. Se mesmo assim travar:

- Oriente o usuário a abrir **`/reset-sw`** — página que desregistra o Service Worker e limpa o cache do navegador.

## 8. Versionamento de API

- Contrato público estável: **`/api/v1/*`** (use este para integradores externos).
- `/api/*` (sem versão) continua funcionando — é o que o front interno usa; ambos roteiam para os mesmos handlers.
- Ao mudar contrato de forma incompatível, criar `/api/v2/*` e manter `/api/v1/*` por um período de depreciação.
