# Cutover — modo SERVE_REACT

A migração big-bang vanilla → React permite ativar o frontend novo via env flag,
sem deletar o legacy. Útil para validar em staging antes do go-live.

## Como funciona

`server.js` agora tem duas branches no `serveStaticFile`:

| Env | Comportamento |
|---|---|
| `SERVE_REACT` ausente / `0` (default) | Modo legacy: serve `/index.html`, `/js/*`, `/css/*` da raiz com CSP + bootstrap inline |
| `SERVE_REACT=1` | Modo React: serve `web/dist/` com cache imutável para assets, no-store para HTML, SPA fallback para qualquer path desconhecido |

A guarda `fs.existsSync(web/dist/index.html)` é defensiva: se a build do React
não estiver presente, o flag é ignorado silenciosamente e o servidor cai no
modo legacy. Mensagem no boot: `[server] SERVE_REACT=1 — servindo bundle React de …`.

## SPA fallback

No modo cutover, qualquer requisição que não bata num arquivo físico e não
seja `/api/*` devolve `index.html`. Isso é necessário porque o React usa
`BrowserRouter` (path-based) — `/contratos/abc-123` precisa servir o shell HTML
para que o JS leia o pathname e renderize a tela certa.

Asset com hash que não existe (`/assets/index-abcdef.js` antigo após deploy)
ainda devolve 404 — é o comportamento certo, evita servir HTML com mime errado.

## Deploy / Railway

O `Dockerfile` agora é multi-stage:

```
Stage 1 (web-builder)  : node:20-alpine + web/  → web/dist/
Stage 2 (runtime)      : node:20-alpine + server.js + COPY --from=web-builder
```

Para promover o cutover em prod, basta setar `SERVE_REACT=1` nas variáveis do
Railway. Para reverter: remover a env. **Não precisa redeploy** — só restart.

## Validação local

```bash
# 1. Build do bundle
cd Rino/web && npm run build

# 2. Voltar para raiz e rodar com flag
cd ..
SERVE_REACT=1 DATABASE_URL=... npm start

# 3. Conferir
curl -I http://localhost:3001/
# Esperado: 200 com Content-Security-Policy + Cache-Control: no-store
curl http://localhost:3001/dashboard | head -5
# Esperado: HTML do index.html (SPA fallback)
curl -I http://localhost:3001/assets/index-<hash>.js
# Esperado: 200 + Cache-Control: public, max-age=31536000, immutable
```

## Pré-cutover (BLOQUEADOR)

A UI de auth (`#loginForm`, `#btnAceitarTermos`, `.perfil-card`) ainda vive em
`js/app.js`. No modo `SERVE_REACT=1` o bundle React assume que existe uma
sessão (cookie). **Antes do flag ir para prod**:

- F5-1b — portar Login + LGPD + ProfilePicker para React (`features/auth/`)
- Roteamento condicional na raiz: renderiza `<Login />` quando `useCurrentUser` retorna 401

Sem F5-1b, usuários sem sessão ativa caem direto numa tela em branco do React
(o redirect para a tela legada não existe mais).

## Cleanup final (F5-6)

Após confirmação em prod (smoke das 37 rotas + 1 semana sem regressão):

- Remover `index.html`, `sw.js`, `manifest.webmanifest`, `css/`, `js/` da raiz
- Limpar as `COPY` correspondentes do Dockerfile
- Remover o branch legacy de `serveStaticFile` (deixa só `_serveReactDist`)
- Eliminar a allowlist `_PUBLIC_DIRS` (não há mais `/js/`, `/css/` separados)
- Atualizar memoria `project_rhino_react_migration.md` para refletir Fase 5 fechada
