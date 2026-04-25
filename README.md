# Rhino

Aplicação de gestão empresarial focada em contratos de obras, financeiro e cadastros. SPA em JavaScript puro, com backend em Node.js local (arquivos JSON) ou Firebase Functions + Firestore em produção.

## Módulos

- **Dashboard** — indicadores consolidados
- **Contratos** — cadastro, detalhamento e saídas
- **Mapa de Obras** — visualização geográfica (Leaflet)
- **Clientes** e **Fornecedores**
- **Financeiro** — Caixa, Contas a Pagar, Contas a Receber (Notas Fiscais), Sócios, Aportes
- **BASE** — itens base e tipos
- **Configuração** — níveis de acesso e perfis

## Stack

- Frontend: HTML + CSS + JS (sem bundler), Chart.js, Leaflet
- Backend local: `server.js` (HTTP nativo, persistência em `data/*.json` com backups automáticos)
- Backend produção: Firebase Functions (`functions/index.js`) + Firestore
- Hosting: Firebase Hosting

## Estrutura

```
.
├── index.html          # shell da SPA
├── css/                # estilos (main, components)
├── js/
│   ├── app.js          # roteamento, perfil de acesso, sidebar
│   ├── store.js        # estado global e chamadas à API
│   ├── lib/            # bibliotecas vendorizadas (chart.js)
│   └── views/          # uma view por módulo
├── data/               # JSONs de dados (modo local)
├── server.js           # API HTTP local
├── functions/          # Firebase Functions (API em produção)
├── firebase.json
└── .firebaserc
```

## Desenvolvimento local

Requer Node.js >= 18.

```bash
npm install
npm start                    # sobe o server em http://localhost:3001
```

O `server.js` serve os arquivos estáticos e expõe `/api/*` lendo/gravando em `data/`. Backups automáticos ficam em `data/backups/` (mantém 10 por arquivo).

## Docker (app + Postgres)

A configuração Docker prepara o terreno pra migrar a persistência de JSON para Postgres e pra deploy em VPS.

**Pré-requisitos**: Docker Desktop instalado.

```bash
# 1) Copie .env.example pra .env (já vem com senha gerada se você usou o setup)
cp .env.example .env

# 2) Suba o stack (app + banco)
docker compose up -d --build

# 3) Acesse
# App:    http://localhost:3001
# Banco:  postgres://rhino:<senha>@localhost:5432/rhino

# 4) Logs / parar
docker compose logs -f
docker compose down            # para sem apagar dados
docker compose down -v         # apaga volume do banco (CUIDADO)
```

**O que o stack inclui hoje**:
- `rhino` — app Node atual (ainda usando JSON via volume `./data`)
- `db` — Postgres 16 com schema inicial em `db/schema.sql` aplicado no primeiro `up`

**Próximos passos** (não feitos ainda):
- Refatorar `server.js` pra usar Postgres no lugar de JSON
- Script `migrate-json-to-pg.js` pra importar os dados atuais
- Remover montagem do volume `./data` quando a migração concluir

## Deploy (Firebase)

```bash
cd functions && npm install && cd ..
firebase deploy
```

O `firebase.json` publica a raiz como Hosting e roteia `/api/**` para a function `api`. O projeto padrão é `gestao-projetos-cmpc` (ver `.firebaserc`).

Para migrar dados locais (`data/*.json`) para o Firestore use:

```bash
node functions/migrate-data.js
```

## Perfis de acesso

O controle de abas é feito por perfil via `/api/niveis-acesso`. O perfil selecionado é guardado em `sessionStorage` (`rhino-perfil`) e restringe as rotas visíveis na sidebar.
