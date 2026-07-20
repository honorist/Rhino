# Arquitetura do Rhino

Doc técnica profunda. Para visão executiva e instruções de uso, ver [`../README.md`](../README.md).

## Sumário

- [Visão geral](#visão-geral)
- [Camadas](#camadas)
- [Modelo de dados (ER)](#modelo-de-dados-er)
- [Fluxos principais (sequence)](#fluxos-principais-sequence)
  - [Login e bootstrap](#login-e-bootstrap)
  - [Saída → BM → NF → Caixa](#saída--bm--nf--caixa)
  - [RDO com assinatura digital](#rdo-com-assinatura-digital)
  - [Solicitação de compra (5 etapas)](#solicitação-de-compra-5-etapas)
  - [Realtime via SSE](#realtime-via-sse)
- [Autorização](#autorização)
- [Status da migração JSON → Postgres](#status-da-migração-json--postgres)
- [Observabilidade](#observabilidade)
- [Performance](#performance)
- [Próximos passos sugeridos](#próximos-passos-sugeridos)

---

## Visão geral

```mermaid
flowchart LR
    spa[Browser SPA<br/>vanilla JS] -- HTTPS --> srv[server.js<br/>Node 18 · HTTP nativo]
    spa -. EventSource .-> stream[/api/stream<br/>SSE/]
    srv --> pool[pg pool<br/>max=10 default]
    pool --> pg[(Postgres 16)]
    srv --> bus[lib/bus<br/>EventBus in-memory]
    bus -. publish .-> stream
    srv --> audit[lib/audit<br/>audit_log async]
    audit --> pg
```

- **Sem framework** no backend. `server.js` faz roteamento `if (pathname === ... && method === ...)` em ~7.200 linhas.
- **Sem bundler** no frontend. `<script defer>` no `index.html` e `js/lazy.js` para libs pesadas (mermaid, chart, signaturepad, jspdf).
- **Postgres é a fonte única**. Diretório `data/*.json` é vestígio do modo legacy e nunca é lido em produção.

---

## Camadas

### Frontend (`/js`, `/css`)

- **SPA puro** (sem bundler), módulos via `<script defer>` no `index.html`
- **Roteamento** por `location.hash` em `js/app.js`
- **Estado global** em `window.Store` (`js/store.js`) — fetcha das APIs e dispara eventos
- **Views** em `js/views/*.js`, cada uma como `window.X = { render(), ... }`
- **PWA** com manifest + service worker (`sw.js`) e cache-busting `?v=APP_VERSION`
- **Realtime** via SSE em `js/realtime.js` — escuta mutações e re-renderiza
- **Lazy loading** em `js/lazy.js`: mermaid, chart.js, leaflet, signature_pad, jspdf carregam só quando a view precisa

### Backend (`server.js` + `lib/` + `db/repos/`)

- **HTTP nativo** (sem Express) — roteamento via `if/match` em `routeRequest()` (linha ~3960)
- **Auth** com cookies de sessão server-side, bcrypt, rate limit persistente em PG (`lib/auth.js`, `lib/pg-rate-limit.js`)
- **Audit** automático em toda mutação POST/PUT/DELETE com status < 500 (`lib/audit.js`, registra `before_state` + `entity_label`)
- **Bus de eventos** in-memory (`lib/bus.js`) — feed do `/api/stream`
- **Repos** abstraem queries do Postgres (`db/repos/*.js`) — sem ORM, SQL direto

### Banco (`db/`)

- **Schema** declarativo em `db/schema.sql` (~980 linhas)
- **Migrations** idempotentes em `db/migrations/` aplicadas via `scripts/run-migrations.js` no `preDeployCommand` do Railway
- **Triggers PG**:
  - `set_updated_at()` BEFORE UPDATE em todas as tabelas mutáveis
  - `log_contract_status_change()` AFTER UPDATE em `contracts` → grava em `contract_status_history` (usado pela cobrança mensal pra calcular dias ativos)
  - `log_contract_status_insert()` AFTER INSERT em `contracts` → primeira linha do histórico

---

## Modelo de dados (ER)

### Núcleo operacional + financeiro

```mermaid
erDiagram
    CLIENTES ||--o{ CONTRACTS              : "fatura para"
    CONTRACTS ||--o{ SAIDAS                : "consome orçamento"
    CONTRACTS ||--o{ NOTAS_FISCAIS         : "emite"
    CONTRACTS ||--o{ ATIVIDADES            : "tem cronograma"
    CONTRACTS ||--o{ RDOS                  : "registra diário"
    CONTRACTS ||--o{ ORGANOGRAMA_MEMBROS   : "aloca equipe"
    CONTRACTS ||--o{ CONTRACT_ADITIVOS     : "recebe aditivos"
    CONTRACTS ||--o{ CONTRACT_STATUS_HISTORY : "muda status"
    CONTRACTS ||--o{ CONTRACT_MARCOS       : "checkpoints"
    CONTRACTS ||--o{ CONTRACT_OCORRENCIAS  : "registra ocorrências"
    CONTRACTS ||--o{ CAIXA                 : "movimenta"
    CONTRACTS ||--o{ CONTAS_PAGAR          : "rateia despesas"
    CONTRACTS ||--o{ CONTRACT_SERVICOS     : "planilha de serviços"
    SAIDAS    }o--|| NOTAS_FISCAIS         : "compõe BM"
    SAIDAS    ||--o{ MEDICAO_ITENS         : "detalha medição"
    CONTRACT_SERVICOS ||--o{ MEDICAO_ITENS : "é medido em"
    NOTAS_FISCAIS ||--o{ CAIXA             : "vira entrada"
    CONTAS_PAGAR ||--o{ CAIXA              : "vira saída"
    RDOS ||--o{ RDO_ASSINATURAS            : "é assinado por"
    RECURSOS ||--o{ ORGANOGRAMA_MEMBROS    : "atua em"
    FORNECEDORES ||--o{ CONTAS_PAGAR       : "cobra"

    CONTRACTS {
        text id PK
        text client_id FK
        numeric value
        date start_date
        date end_date
        text status
        numeric retencao_percent
        jsonb budget
    }
    NOTAS_FISCAIS {
        text id PK
        text contract_id FK
        text numero
        numeric valor
        boolean emitida
        date data_emissao_real
        integer prazo_recebimento
        text caixa_entry_id
    }
    SAIDAS {
        text id PK
        text contract_id FK
        text nf_id FK
        text numero_bm
        numeric value
        date date
    }
    CONTRACT_SERVICOS {
        text id PK
        text contract_id FK
        text codigo
        text descricao
        text unidade
        numeric qtd_contratada
        numeric preco_unit
        boolean ativo
    }
    MEDICAO_ITENS {
        text id PK
        text saida_id FK
        text servico_id FK
        text contract_id FK
        numeric qtd
        numeric preco_unit "snapshot"
        numeric valor
    }
    CAIXA {
        text id PK
        text type "entrada|saida"
        numeric value
        date date
        text contract_id FK
        text nf_id FK
        text conta_pagar_id FK
    }
    CONTAS_PAGAR {
        text id PK
        text fornecedor_id FK
        text contract_id FK
        numeric valor
        date data_vencimento
        text status
        boolean recorrente
    }
    RDOS {
        text id PK
        text contract_id FK
        date data
        jsonb moi
        jsonb mod
        jsonb atividades
    }
    RDO_ASSINATURAS {
        text id PK
        text rdo_id FK
        text papel
        text nome
        bytea imagem
    }
```

### Plataforma · auth, permissões, auditoria

```mermaid
erDiagram
    USERS ||--o{ SESSIONS                  : "tem sessão"
    USERS }o--|| NIVEIS_ACESSO             : "tem perfil"
    USERS ||--o{ PASSWORD_RESET_TOKENS     : "pede reset"
    USERS ||--o{ DASHBOARD_LAYOUTS         : "personaliza"
    USERS ||--o{ AUDIT_LOG                 : "produz"
    NIVEIS_ACESSO {
        text id PK
        text label
        jsonb abas "lista de #/rotas e ações"
    }
    USERS {
        text id PK
        text email UK
        text password_hash
        text nivel_acesso_id FK
        text socio_id FK
        boolean is_active
        timestamptz accepted_terms_at
        text accepted_terms_version
    }
    SESSIONS {
        text id PK
        text user_id FK
        timestamptz expires_at
    }
    AUDIT_LOG {
        bigserial id PK
        timestamptz ts
        text user_email
        text method
        text path
        text entity
        text entity_id
        text action
        jsonb body
        jsonb before_state
    }
```

### Suprimentos · estoque e solicitações de compra

```mermaid
erDiagram
    ITENS_ESTOQUE ||--o{ ESTOQUE_SALDO        : "tem saldo em"
    ALMOXARIFADOS ||--o{ ESTOQUE_SALDO        : "armazena"
    ITENS_ESTOQUE ||--o{ ESTOQUE_MOVIMENTACOES : "movimenta"
    ALMOXARIFADOS }o--o| CONTRACTS            : "vinculado a"
    SOLICITACOES_COMPRA }o--|| CONTRACTS      : "alocada em"
    SOLICITACOES_COMPRA }o--|| ALMOXARIFADOS  : "destino"
    SOLICITACOES_COMPRA }o--|| FORNECEDORES   : "comprada de"
    SOLICITACOES_COMPRA }o--o| CONTAS_PAGAR   : "gera conta"
    ESTOQUE_MOVIMENTACOES }o--o| CONTRACTS    : "custeia"

    ITENS_ESTOQUE {
        text id PK
        text codigo
        text descricao
        text unidade
        numeric estoque_minimo
        numeric custo_medio "média ponderada"
    }
    ESTOQUE_MOVIMENTACOES {
        text id PK
        text item_id FK
        text almoxarifado_origem_id FK
        text almoxarifado_destino_id FK
        text tipo "entrada|saida|transferencia|ajuste"
        numeric quantidade
        numeric custo_unit
    }
    SOLICITACOES_COMPRA {
        text id PK
        serial numero
        text status "5 etapas"
        jsonb itens
        numeric valor_total
    }
```

### Comercial · propostas

```mermaid
erDiagram
    PROPOSTAS }o--|| CLIENTES          : "destinada a"
    PROPOSTAS ||--o{ PROPOSTA_ANEXOS   : "anexa PDFs"
    PROPOSTAS ||--o{ PROPOSTA_CUSTOS   : "rateia custos"
    PROPOSTAS }o--o| PROPOSTAS         : "revisão de"
    PROPOSTAS }o--o| CONTRACTS         : "convertida em"
    CLAUSULAS {
        text id PK
        text titulo
        text texto
        text categoria
        text_array tags
    }
    PROPOSTAS {
        text id PK
        text numero
        integer ano
        integer revisao
        text cliente_id FK
        text status "rascunho|enviada|aceita|rejeitada|expirada"
        jsonb escopo
        jsonb investimento_hh
        jsonb investimento_mat
        numeric valor_total
    }
```

### Frota

```mermaid
erDiagram
    VEICULOS ||--o{ VEICULO_PLANOS         : "tem plano"
    VEICULOS ||--o{ VEICULO_MANUTENCOES    : "passa por"
    VEICULOS }o--o| CONTRACTS              : "alocado em"
    VEICULO_PLANOS ||--o{ VEICULO_MANUTENCOES : "gera"
    VEICULOS {
        text id PK
        text placa UK
        integer km_atual
        text contract_id FK
        text status "ativo|manutencao|inativo"
    }
    VEICULO_PLANOS {
        text id PK
        text veiculo_id FK
        integer intervalo_km
        integer intervalo_meses
        integer ultimo_km
        date ultima_data
    }
```

---

## Fluxos principais (sequence)

### Login e bootstrap

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant SPA as SPA (index.html)
    participant API as server.js
    participant RL as pgRateLimit
    participant DB as Postgres
    U->>SPA: abre /
    SPA->>API: POST /api/auth/login (email, senha)
    API->>RL: check(IP+email, max=5/15min)
    RL->>DB: SELECT/UPDATE rate_limit
    DB-->>RL: ok | bloqueado
    alt rate-limit bloqueia
        RL-->>API: 429
        API-->>SPA: 429 Retry-After
    else passa
        API->>DB: SELECT users WHERE email=$1
        DB-->>API: user + password_hash
        API->>API: bcrypt.verify(senha, hash)
        alt senha inválida
            API-->>SPA: 401 (consumiu slot do rate-limit)
        else ok
            API->>RL: refund (sucesso não conta)
            API->>DB: INSERT sessions
            API-->>SPA: Set-Cookie sid · {user, permissions}
            SPA->>API: GET /api/auth/me (cookie httpOnly)
            API->>DB: SELECT session + niveis_acesso
            DB-->>API: perfil resolvido
            API-->>SPA: 200 {user, permissions}
            SPA->>SPA: monta sidebar conforme permissions
            SPA->>API: GET /api/stream (SSE)
            API-->>SPA: stream aberto
        end
    end
```

### Saída → BM → NF → Caixa

O fluxo financeiro central. Uma saída cadastrada num contrato vira BM, depois NF, depois entrada de caixa quando o cliente paga.

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operador
    participant V as View Contrato
    participant API as server.js
    participant R as repos/saidas
    participant N as repos/notas_fiscais
    participant C as repos/caixa
    participant Bus as lib/bus
    Op->>V: + Adicionar saída (valor, data, prazo)
    V->>API: POST /api/contracts/:id/saidas
    API->>R: insert saida
    R->>N: existe NF mesmo dia não emitida?
    alt sim
        R->>N: soma valor à NF existente
    else não
        R->>N: cria nova NF (BM) emitida=false
    end
    R-->>API: {saida, nf}
    API->>Bus: publish {entity:"saidas", action:"create"}
    API-->>V: 201
    Note over Op,V: Fim do mês
    Op->>V: marcar NF como Emitida (data real)
    V->>API: PUT /api/notas-fiscais/:id (emitida=true, data_emissao_real)
    API->>N: update emitida + caixa_entry_id
    API->>C: cria entrada prevista (date = emissao + prazo_recebimento)
    C-->>API: caixa entry id
    API->>Bus: publish {entity:"notas-fiscais", action:"update"}
    API-->>V: 200
    Note over Op,V: Cliente paga
    Op->>V: marcar entrada como recebida
    V->>API: PUT /api/caixa/:id (data efetiva)
    API->>C: atualiza date efetiva
    API->>Bus: publish {entity:"caixa", action:"update"}
    API-->>V: 200 → saldo atualiza em tempo real
```

### Medição estruturada (BM por itens)

Convive com o fluxo acima, sem substituí-lo. Contratos **sem** planilha de serviços
seguem medindo por valor fechado (`POST /saidas`); contratos **com** planilha medem
por quantidade × preço unitário (`POST /medicoes`). Nos dois casos o resultado é uma
`saida` agregada numa NF/BM — daí pra frente (emissão, caixa) o caminho é o mesmo.

```mermaid
sequenceDiagram
    autonumber
    actor Eng as Engenharia
    participant V as View Contrato
    participant API as server.js
    participant H as handlers/contract-medicoes
    participant M as lib/medicao
    participant S as repos/contract_servicos
    participant I as medicao_itens
    participant SA as handlers/contract-saidas
    Note over Eng,V: Uma vez por contrato
    Eng->>V: cadastra planilha (serviço, unidade, qtd, preço)
    V->>API: POST /api/contracts/:id/servicos
    Note over Eng,V: A cada medição
    Eng->>V: informa qtd medida por serviço
    V->>API: POST /api/contracts/:id/medicoes
    API->>H: {date, itens:[{servicoId, qtd}]}
    H->>H: pg_advisory_xact_lock(contrato)
    H->>S: planilha do contrato
    H->>I: qtd já medida (acumulado)
    H->>M: computeMedicao(itens, servicos, medido)
    alt qtd > saldo contratado (BR-MED-001)
        M-->>H: {ok:false, errors}
        H-->>V: 400 "saldo disponível: X un — excedente entra via aditivo"
    else dentro do saldo
        M-->>H: {ok:true, itens com preço snapshot, total}
        H->>SA: criarSaidaAgregandoNf(total) → saída + BM (com retencao_pct)
        H->>I: INSERT dos itens (se falhar, compensa desfazendo saída/NF)
        H-->>V: 200 → envelope do contrato
    end
```

O preço unitário é **snapshot** (reajuste da planilha não retroage a medições
passadas). A retenção é o `%` do contrato (`contracts.retencao_percent`) gravado
como snapshot na NF, com o **valor retido sempre derivado**, nunca armazenado. O BM
aceita aprovação/rejeição do cliente (`POST /bms/:nfId/aprovacao`; rejeição exige
motivo). Regras e testes em `lib/medicao.js` / `test/medicao.test.js`
(`BR-MED-001..005`).

### RDO com assinatura digital

```mermaid
sequenceDiagram
    autonumber
    actor E as Encarregado
    actor F as Fiscal/Cliente
    participant V as View RDO
    participant API as server.js
    participant R as repos/rdos
    participant A as repos/rdo_assinaturas
    E->>V: abre RDO do dia
    V->>API: POST /api/contracts/:id/rdos
    API->>R: insert rdos (moi, mod, atividades, fotos)
    R-->>API: rdo criado
    API-->>V: 201
    E->>V: + adicionar assinatura
    V->>V: lazy load signature_pad
    V->>V: SignaturePad sobre canvas
    F->>V: desenha assinatura com dedo
    V->>V: canvas.toDataURL() → base64
    V->>API: POST /api/contracts/:id/rdos/:rdo/assinaturas<br/>{papel, nome, imagem(base64)}
    API->>A: decode base64 → BYTEA<br/>INSERT rdo_assinaturas
    A-->>API: id
    API-->>V: 201 {id, url}
    V->>API: GET /api/contracts/:id/rdos/:rdo/assinaturas/:sid
    API->>A: SELECT imagem
    A-->>API: BYTEA
    API-->>V: image/png inline
    V->>V: renderiza no PDF do RDO
```

### Solicitação de compra (5 etapas)

```mermaid
sequenceDiagram
    autonumber
    actor S as Solicitante
    actor F as Financeiro
    actor G as Gerente
    actor C as Comprador
    actor R as Recebedor
    participant API as server.js
    S->>API: POST /api/solicitacoes-compra<br/>(itens, justificativa, contrato)
    Note over API: status = pendente_avaliacao
    F->>API: PUT /precificar (preços, fornecedor)
    Note over API: status = pendente_aprovacao
    G->>API: PUT /aprovar
    Note over API: status = aprovada
    alt rejeição em qualquer ponto
        G->>API: PUT /rejeitar (motivo)
        Note over API: status = rejeitada
    end
    C->>API: PUT /comprar (numero_pedido, previsão)
    Note over API: status = comprada
    R->>API: PUT /receber (nf, data, qtds)
    Note over API: status = recebida<br/>gera ESTOQUE_MOVIMENTACOES + CONTAS_PAGAR
```

### Realtime via SSE

```mermaid
sequenceDiagram
    autonumber
    participant SPA as SPA (qualquer tela)
    participant RT as js/realtime.js
    participant API as server.js
    participant Bus as lib/bus
    SPA->>RT: init() no load
    RT->>API: GET /api/stream (EventSource)
    API-->>RT: data: {"type":"hello"}
    Note over RT,API: conexão aberta · keep-alive 25s
    actor X as Outro usuário
    X->>API: POST /api/contracts (cria contrato)
    API->>Bus: publish {entity, action, id, by}
    Bus-->>API: fan-out p/ subscribers
    API-->>RT: data: {"entity":"contracts","action":"create",...}
    RT->>RT: dispara CustomEvent em window
    SPA->>SPA: view atual escuta e re-fetcha se relevante
```

---

## Autorização

```mermaid
flowchart LR
    req[Request com cookie sid] --> mw[withAuth wrapper]
    mw --> sess{Session<br/>válida?}
    sess -- não --> r401[401]
    sess -- expirada --> rm[DELETE session] --> r401
    sess -- sim --> user[load user + nivel_acesso.abas]
    user --> match{Rota exige<br/>permission?}
    match -- não --> handler[handler de rota]
    match -- sim --> chk{permissions<br/>contém X?}
    chk -- sim --> handler
    chk -- não --> r403[403]
    handler --> audit[setImmediate<br/>audit.log async]
    audit --> bus[bus.publish<br/>se mutação 2xx]
```

A resolução de `permissions` é feita pelo servidor em `lib/permissions.js#summary(user)`. O frontend recebe o objeto pronto e usa para filtrar sidebar/rotas — **mas o servidor é a verdade**, nunca confia no que o cliente envia.

Exemplo de `niveis_acesso.abas` para perfil `financeiro`:

```json
[
  "#/caixa", "view:#/caixa", "edit:#/caixa",
  "#/contas-pagar", "view:#/contas-pagar", "edit:#/contas-pagar",
  "#/notas-fiscais", "view:#/notas-fiscais", "edit:#/notas-fiscais",
  "#/cobranca",
  "#/solicitacoes-compra", "solicitacoes-compra:avaliar", "solicitacoes-compra:receber"
]
```

---

## Status da migração JSON → Postgres

**Concluído** (todos os reads/writes em runtime passam pelo PG):

| Domínio | Repo | Status |
|---|---|---|
| Contracts + aditivos/marcos/ocorrências | `db/repos/contracts.js` | ✅ |
| Saídas | `db/repos/saidas.js` | ✅ |
| Caixa | `db/repos/caixa.js` | ✅ |
| Contas a pagar | `db/repos/contas_pagar.js` | ✅ |
| Notas fiscais | `db/repos/notas_fiscais.js` | ✅ |
| Clientes (+ portal) | `db/repos/clientes.js` | ✅ |
| Fornecedores | `db/repos/fornecedores.js` | ✅ |
| Recursos + documentos (BYTEA) | `db/repos/recursos.js` | ✅ |
| Sócios | `db/repos/socios.js` | ✅ |
| Investimentos / aportes | `db/repos/investimentos.js` | ✅ |
| BASE / Tipos | `db/repos/base_items.js`, `tipos_base.js` | ✅ |
| RDOs + assinaturas (BYTEA) | `db/repos/rdos.js` | ✅ |
| Organograma | `db/repos/organograma.js` | ✅ |
| Cronograma / atividades | `db/repos/atividades.js` | ✅ |
| Doc templates | `db/repos/doc_templates.js` | ✅ |
| Níveis de acesso | `db/repos/niveis_acesso.js` | ✅ |
| Users + sessions | `db/repos/users.js` | ✅ |
| Estoque (itens, almox, mov, saldo) | `db/repos/estoque*.js` | ✅ |
| Solicitações de compra | `db/repos/solicitacoes_compra.js` | ✅ |
| Frota (veículos, planos, manutenções) | `db/repos/veiculos*.js` | ✅ |
| Propostas + cláusulas + anexos | `db/repos/propostas*.js` | ✅ |
| Cobrança mensal (via trigger PG) | `contract_status_history` | ✅ |

**Vestígios (não afetam runtime):**

- `data/*.json` (~10 arquivos no git) — snapshot histórico, nunca lidos pelo `server.js`. Pode-se remover do git via `git rm --cached data/*.json`.
- `data/backups/` — usado ativamente pelos endpoints de backup pra gerar dumps periódicos do PG. **Manter.**
- Parâmetro `filename` em `readCollection(filename, repoName, arrayKey)` — vestígio JSON, mantido para não editar 12 call sites; ignorado pela função.

**Não há fallback automático JSON→PG.** Em desenvolvimento local sem `DATABASE_URL` configurada, o `server.js` falha cedo. Para rodar local, use `docker compose up -d` (sobe app + Postgres juntos).

---

## Observabilidade

| Endpoint | Conteúdo |
|---|---|
| `GET /api/health` | `app/db: ok`, `uptime_s`, `version` (do package.json), `node`, `db_version` |
| `GET /api/metrics` | Contadores HTTP por status/método, memória, contagens por tabela |
| `GET /api/audit` | Histórico de mutações com filtros (auth obrigatório) |
| `GET /api/stream` | SSE de mutações em tempo real (auth obrigatório) |
| `GET /api/online` | Usuários conectados ao stream agora |
| `GET /healthz`, `/readyz` | Liveness/readiness simples para balanceador |

Logs estruturados em JSON via stdout — encaminhar para CloudWatch / Loki / Vector.

```mermaid
flowchart LR
    req[Cada request /api/*] --> log[logEvent JSON]
    log --> stdout[stdout]
    stdout --> railway[Railway logs]
    req --> metr[increment counters<br/>by_status / by_method]
    metr -. exposto em .-> mep[/api/metrics]
    mut[POST/PUT/DELETE 2xx] -.-> audit[setImmediate audit.log]
    audit --> al[(audit_log)]
    mut -.-> bus[bus.publish]
    bus --> sub[stream subscribers]
```

---

## Performance

- **Pool PG**: padrão 10 conexões; ajuste com `PG_POOL_MAX`
- **Bundle inicial**: ~250 KB (Chart.js + ícones + lazy.js core); Mermaid/jsPDF/SignaturePad carregam sob demanda
- **Cache estático**: service worker faz SWR de css/js/svg, invalidado por `?v=APP_VERSION`
- **BYTEA** para assinaturas, documentos de recursos e anexos de proposta — backup do PG já cobre tudo, sem dependência de volume
- **Triggers PG** em vez de batch — `contract_status_history` se mantém sozinho

---

## Próximos passos sugeridos

- [ ] Rate limit por usuário (não só IP+email) em rotas pesadas
- [ ] Read replicas no Postgres se chegar a 100k+ contratos
- [ ] Migrar `data/*.json` legados pra fora do git (`git rm --cached`)
- [ ] Bundler opcional (esbuild) se o número de arquivos JS passar de 50
- [ ] Anexos PDF muito grandes (>2 MB) → considerar S3-compatible ao invés de BYTEA
- [ ] Cache de `permissions.summary(user)` por sessão (hoje resolve a cada `/api/auth/me`)
