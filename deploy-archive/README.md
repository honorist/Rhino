# Alvos de deploy arquivados

O deploy canônico do Rhino é o **Railway** (`railway.json` na raiz, build via
`Dockerfile`, `preDeployCommand: npm run db:migrate`, healthcheck `/api/health`).

Os configs abaixo eram alvos alternativos que **não são mais usados** — ficam
aqui só como referência histórica (faxina, item 25 do roadmap):

- `fly.toml` — Fly.io
- `render.yaml` — Render
- `firebase.json` — Firebase Hosting

Se algum dia voltarem a ser usados, mover de volta para a raiz e revisar (as
variáveis de ambiente e o comando de start podem ter divergido do Railway).
