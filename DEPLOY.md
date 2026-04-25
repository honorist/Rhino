# Deploy do Rhino

Stack: Node 20 + Postgres 16. Banco é fonte única de verdade.

## Variáveis de ambiente

**Obrigatórias:**
- `DATABASE_URL` — `postgres://user:pass@host:5432/db` (Railway/Render injetam automaticamente)
- `PORT` — porta HTTP (Railway usa `${{PORT}}` automático)

**Recomendadas em produção:**
- `NODE_ENV=production`
- `APP_VERSION=1.0.0` — aparece em `/api/health`
- `ADMIN_EMAIL` + `ADMIN_PASSWORD` — bootstrap do primeiro admin (use uma senha forte!)
- `RESEND_API_KEY` — habilita envio real de email (recuperação de senha). Sem isso, emails só são logados no console.
- `EMAIL_FROM` — endereço remetente, ex: `Rhino <noreply@seudominio.com.br>`
- `PG_POOL_MAX` — tamanho do pool (default 10)

**Endpoints operacionais (públicos):**
- `GET /api/health` — status app + PG (200 ok / 503 down)
- `GET /api/metrics` — contadores HTTP, memória, contagens por tabela

---

## Opção A — Railway (RECOMENDADO p/ você)

### Pré-requisito: conta + crédito
1. Crie conta em [railway.app](https://railway.app) (com GitHub)
2. Adicione método de pagamento ($5 créditos free)

### Passo a passo
1. **Push do código pro GitHub** (privado é ok)
2. No Railway: **New Project → Deploy from GitHub repo**
3. Selecione o repo Rhino
4. Railway detecta `Dockerfile` e `railway.json` → começa o build
5. **Adicione Postgres**: dentro do projeto → "+ New" → Database → PostgreSQL
6. **Variáveis de ambiente** — vá no app → Variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}     ← clique no botão "Reference"
   ADMIN_EMAIL=voce@empresa.com
   ADMIN_PASSWORD=<senha forte 16+ caracteres>
   APP_VERSION=1.0.0
   NODE_ENV=production
   RESEND_API_KEY=re_xxx                       ← opcional, p/ enviar email real
   EMAIL_FROM=Rhino <noreply@seudominio.com.br>
   ```
7. Settings → Networking → **Generate Domain** (gera `rhino-production.up.railway.app`)
8. Aguarde o redeploy → app está online

### Schema inicial
O `schema.sql` é montado como `docker-entrypoint-initdb.d` no docker-compose **local**, mas no Railway o Postgres é gerenciado e não roda esse arquivo. Você precisa rodá-lo manualmente:

```bash
# Conecte com o database URL do Railway via psql:
psql "$DATABASE_URL_DO_RAILWAY" < db/schema.sql
```

Ou pelo console do Railway: copie o conteúdo de `db/schema.sql` e cole no Query Editor do Postgres.

### Migra dados (opcional)
```bash
# Local, apontando pro PG do Railway:
DATABASE_URL="<railway>" node scripts/migrate-json-to-pg.js
# Ou seed realista (descarta dados):
DATABASE_URL="<railway>" node scripts/seed-realistic.js --reset
```

### Pronto
- App: `https://rhino-production.up.railway.app`
- Login com `ADMIN_EMAIL`/`ADMIN_PASSWORD` configurados

### Custo estimado
- App (sleep mode quando ocioso): ~US$ 3–5/mês
- Postgres 1 GB: ~US$ 5/mês
- **Total**: ~US$ 8–10/mês

---

## Opção B — Fly.io

Já configurado em `fly.toml`. Veja README desta pasta no Git.

```bash
flyctl auth login
flyctl postgres create --name rhino-db --region gru
flyctl apps create rhino
flyctl postgres attach --app rhino rhino-db   # injeta DATABASE_URL
flyctl secrets set ADMIN_EMAIL=voce@empresa.com ADMIN_PASSWORD=SenhaForte --app rhino
flyctl deploy --app rhino
```

---

## Opção C — VPS (Hetzner / DigitalOcean)

Use `docker-compose.prod.yml` com Caddy (SSL automático Let's Encrypt). Veja seção dedicada no final.

---

## Cloudflare na frente (proteção DDoS / WAF grátis)

**Recomendado:** colocar Cloudflare antes do Railway/Fly pra DDoS, WAF, cache, e domínio próprio com SSL.

1. Cadastre seu domínio no [Cloudflare](https://cloudflare.com) (free plan)
2. Atualize os nameservers no registrar (registro.br) pros que o Cloudflare indica
3. No Cloudflare DNS:
   - `CNAME rhino → rhino-production.up.railway.app` (proxiado, ícone laranja)
4. **Configure regras grátis:**
   - **SSL/TLS** → "Full (strict)" — força HTTPS
   - **Security → Bot Fight Mode** → On (bloqueia bots automaticamente)
   - **Security → Security Level** → Medium ou High
   - **Rules → WAF → Managed Rules** → Activate (regras OWASP grátis)
   - **Rules → Page Rules** → "Always Use HTTPS"
5. **Rate limiting (gratuito limitado):**
   - Crie regra "Rate limit" pra `/api/auth/login` — 10 req/min/IP (a app já tem 5/15min, isso é defesa em profundidade)

Resultado: app fica em `https://rhino.seudominio.com.br` com proteção DDoS, WAF, e cache de assets estáticos.

---

## Email transacional (Resend)

Pra recuperação de senha funcionar de verdade:

1. Cadastre em [resend.com](https://resend.com) (100 emails/dia grátis)
2. Verifique seu domínio (DNS)
3. Crie API Key
4. Adicione no Railway:
   ```
   RESEND_API_KEY=re_xxx
   EMAIL_FROM=Rhino <noreply@seudominio.com.br>
   ```

Sem `RESEND_API_KEY`, o sistema só loga o email no console (modo dev).

---

## Backup periódico

### Railway
Railway faz snapshot automático do Postgres. Para backups extras:
```bash
# Local, salva snapshot do PG do Railway:
pg_dump "$DATABASE_URL_DO_RAILWAY" | gzip > backup-$(date +%Y%m%d).sql.gz
```

### VPS
Crontab:
```cron
# Backup diário às 03h, mantém 30 dias
0 3 * * * docker exec rhino-db pg_dump -U rhino rhino | gzip > /backup/rhino-$(date +\%Y\%m\%d).sql.gz && find /backup -name 'rhino-*.sql.gz' -mtime +30 -delete

# Endpoint de backup adicional (dump PG → JSON em data/backups/)
0 4 * * * curl -fsS -X POST http://localhost:3001/api/backup -H "Cookie: rhino_sid=xxx"
```

### Restore
```bash
gunzip -c backup-20260425.sql.gz | psql "$DATABASE_URL"
```

---

## Monitoramento (gratuito)

### UptimeRobot (5 endpoints free)
- Adicione check HTTP em `https://rhino.seudominio.com.br/api/health`
- Intervalo: 5 minutos
- Alerta por email se cair

### BetterStack (alternativa)
- Status page público + alerts
- Free: 10 monitors

---

## Segurança (já implementada)

- ✅ **bcrypt** (10 rounds) para senhas
- ✅ **Sessões** server-side em PG (cookie httpOnly + SameSite=Lax + Secure em prod)
- ✅ **Rate limit** login: 5 tentativas falhas / 15 min / (IP+email)
- ✅ **Rate limit** global: 1000 req / min / IP
- ✅ **Reset de senha** via email com token de 1 hora
- ✅ **LGPD**: aceite de termos com versão + timestamp; modal bloqueia uso até aceitar
- ✅ **Logs estruturados** JSON em stdout (encaminhe para CloudWatch/Loki)
- ✅ **Healthcheck** + métricas em `/api/health` e `/api/metrics`

## Segurança (recomendado adicionar)

- [ ] **Cloudflare WAF** na frente (10 minutos de configuração)
- [ ] **2FA / TOTP** (TODO próxima fase)
- [ ] **CSP headers** mais restritivos (`Content-Security-Policy`)
- [ ] **Limitar tamanho de upload** de fotos RDO no Caddy/Cloudflare (já tem 1 MB no app)

---

## Variáveis de exemplo do `.env` em produção

```bash
NODE_ENV=production
APP_VERSION=1.0.0

# Postgres (gerado pelo Railway/Fly)
DATABASE_URL=postgres://...

# Bootstrap do admin (só usado se NÃO houver usuário)
ADMIN_EMAIL=admin@empresa.com.br
ADMIN_PASSWORD=<senha 16+ caracteres>

# Email transacional
RESEND_API_KEY=re_xxx
EMAIL_FROM=Rhino <noreply@empresa.com.br>

# Pool PG (ajuste conforme tamanho do plano)
PG_POOL_MAX=10
```
