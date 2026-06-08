# Engineering Steering — Rhino (produção Node)

Manual de engenharia **deste** projeto (a produção Node em `server.js`). Adaptado do
*Portable Engineering Steering* para o stack real do Rhino. **Tudo aqui é guia, não lei**: os
**princípios** (costuras modulares, camadas, SOLID, disciplina de teste, processo de entrega) são a
parte durável; as **tecnologias** são defaults deste projeto — trocáveis com uma decisão registrada.

> Existe uma reescrita Java/Spring desenhada com o documento-base original, guardada na branch
> `feat/rewrite-java` (a "caixinha"). Ela segue a versão *stack-Java* destes mesmos princípios. Este
> arquivo é a versão **stack-Node**, para a produção atual. Os dois compartilham os princípios.

---

## 1. Stack real (defaults deste projeto)

- **Runtime:** Node.js ≥ 18, **sem framework** — `http` nativo + roteador próprio (`lib/router.js`).
- **Banco:** PostgreSQL via `pg`. Fila assíncrona com `pg-boss` (`lib/queue.js`). Sync/util em `lib/pg-sync.js`.
- **Frontend:** SPA em JS vanilla (`js/`, ~59 views em `js/views/`) + **design system próprio em CSS**
  (`css/main.css`, `components.css`, `theme-v2.css`, `ui-kit.css`, `polish.css`) — tokens são a fonte
  única da verdade. Fontes self-hosted/pinadas, sem request de terceiros em runtime.
- **Auth:** sessão server-side + `bcryptjs` (`lib/auth.js`); autorização fina em `lib/permissions.js`
  (papéis/abas). Rate-limit de login em `lib/pg-rate-limit.js` / `lib/rate-limit.js`.
- **Migrations:** SQL versionado e **forward-only** em `db/migrations/AAAAMMDDHHMMSS_*.sql`, aplicado
  por `scripts/run-migrations.js` (`npm run db:migrate`); rollback em `scripts/rollback-migration.js`.
  **A migration é dona do schema** — nada de alterar tabela "na mão" fora de migration.
- **Documentos:** geração de DOCX/PDF/XLSX em `lib/` (`proposta-docx.js`, `proposta-pdf.js`,
  `rdo-pdf.js`, `rdo-xlsx.js`, `office-convert.js`).
- **Sem infra prematura:** nada de microserviços/Redis/K8s/cluster de busca até a métrica justificar.
  É um **monólito modular**, um deployable. Deploy: Railway a partir do `main` (migrations no preDeploy).

## 2. Monólito modular — pronto pra extrair

Um deployable, fatiado por **capacidade de negócio** em `handlers/`:

```
handlers/   ← um arquivo por capacidade: auth, clientes, contracts, contract-rdos,
              caixa, contas-pagar, notas-fiscais, recursos, recrutamento, socios,
              investimentos, sugestoes, fornecedores, doc-templates, …
lib/        ← transversal/serviços: audit, permissions, auth, crypto-pii, money,
              validate, router, queue, email, bus (eventos), recorrencia, *-pdf/docx/xlsx
routes/     ← montagem das rotas
db/migrations/ ← schema (forward-only)
```

Costuras a manter desde já:

- **Cada handler é uma capacidade.** Não enfie lógica de um domínio dentro do handler de outro;
  publique uma função em `lib/` ou emita um evento (`lib/bus.js`) em vez de acoplar.
- **Sem regra de negócio crua espalhada nas rotas** — o handler orquestra; a regra mora numa função
  testável de `lib/`.
- **Referências entre capacidades por ID** (coluna simples), não por acoplamento de código.
- **Dependências acíclicas:** `handlers/*` pode usar `lib/*`; `lib/*` não depende de `handlers/*`.
  Ciclo é cheiro de design — inverta com uma interface ou um evento no `bus`.
- **Comunicação substituível:** chamada em processo hoje, atrás de função/evento que poderia virar
  fila/HTTP amanhã. Prefira `lib/queue.js`/`lib/bus.js` para efeitos colaterais entre capacidades.

Se uma mudança acoplar capacidades através dessas costuras, **pare e sinalize**.

## 3. Camadas (alvo, por capacidade)

Dependências apontam pra dentro; a regra de negócio não conhece HTTP nem driver de banco.

```
rota/handler   → só HTTP: parse, validação de entrada, resposta (lib/http-respond.js, lib/validate.js)
serviço (lib)  → caso de uso: orquestração, transação, regra de negócio (testável sem HTTP)
acesso a dados → SQL via pg (parametrizado, sempre)
```

Onde estamos: hoje handler+serviço+SQL às vezes convivem num arquivo. **Alvo:** ao mexer numa
capacidade, extraia a regra para uma função pura em `lib/` (testável com `node:test`) e deixe o
handler só com HTTP. Migração incremental, não big-bang.

## 4. SOLID

- **S** — handler faz só HTTP; cada função de `lib/` faz um caso de uso; nada de "god handler".
- **O/L** — variação nova (tipo, papel, provedor) entra como **nova implementação atrás de uma
  função/interface**, não editando um `switch` existente.
- **I** — interfaces estreitas por papel (`hashSenha`, `enviarEmail`, `guardarArquivo`), não um contrato gordo.
- **D** — a regra depende de abstração; o detalhe (driver, SDK) implementa.

## 5. Padrões testados (use por padrão)

- **Port + adapter:** toda dependência externa atrás de uma função de `lib/` com o **stub local como
  default em dev/CI** e o real por configuração (e-mail `log|smtp`, fila `noop|pg-boss`, storage local|S3).
- **Jobs agendados:** a lógica num serviço puro (com o "agora" **injetado**, não `Date.now()` solto) +
  um gatilho fino separado. Serviço testável com relógio fixo.
- **Invariante concorrente vive no banco** (lock/constraint), com **teste multi-thread real**, não mock.
- **Resultado de negócio como objeto/enum, não exceção** (`COMPRADO | SEM_SALDO | …`); exceção é pra
  violação, não pra ramo esperado.
- **Webhook/settlement assíncrono:** nunca confie no payload — verifique no provedor; handler
  **idempotente** (retry acontece); responda 200 uma vez processado.
- **Auditoria como capacidade transversal** (`lib/audit.js`): ator + IP + user-agent + timestamp em
  toda ação sensível, com purga de retenção (dado pessoal!). Transições de estado **com motivo
  registrado**, não flip de status cru.
- **PII criptografada** (`lib/crypto-pii.js`) — nunca em claro no banco/log.
- **Páginas críticas de SEO** server-rendered com canonical/slug/sitemap/OG quando aplicável.

## 6. Disciplina de frontend (mantenha a escolha reversível)

Um futuro replace de framework deve ser rewrite **só do front**:

- **Nenhuma regra de negócio na view/SPA** — a regra vive no backend (`handlers/`+`lib/`); a view só
  orquestra e renderiza.
- **API-first:** o caso de uso devolve dado; a renderização é camada fina por cima. Um endpoint JSON
  pro mesmo caso de uso deve ser barato de adicionar.
- **Design system com fonte única de tokens** (o CSS): **sem emoji como ícone**, sem glifo unicode no
  lugar de ícone — use o set de ícones. Sentence case; cores de acento contidas.
- Chrome compartilhado (nav, footer) em um lugar só; metadado por página passado como dado opcional.

## 7. Convenções de código

- **Validação na borda** (`lib/validate.js`): valide toda entrada antes de processar; falhe rápido e claro.
- **SQL sempre parametrizado** (`$1,$2…`) — nunca concatenar entrada em query.
- **Constantes nomeadas, não literais mágicos**: limiares/algoritmos viram `const` com nome de intenção.
- **Config por env var** com default são em um lugar; segredo **nunca** no repo; `.env.example`
  documenta as chaves sem valores.
- **Imutabilidade** onde fizer sentido; nada de mutar objeto compartilhado escondido.
- **Erros tratados explicitamente** em todo nível; nunca engolir erro em silêncio.
- Arquivos coesos (~200–400 linhas, 800 máx) — extraia utilitário de módulo grande.

## 8. Testes (a disciplina é obrigatória; as ferramentas são os defaults deste projeto)

> **Estado atual (verificado em 2026-06-08):** `npm test` → **236 testes, 236 passando, 0 falhas,
> ~1,4 s**, todos **puros (sem banco/I-O)**. A base de teste é real e verde — manter assim é
> Definition of Done (§10).

- **Unitário: `node --test`** (`test/*.test.js`) — rápido, sem I/O; regras puras de `lib/`. Cobre
  dinheiro (`money`), permissões (`permissions`), validação de payload (`validate`, e os
  `ValidationError` de POST/PUT de NF e contas-a-pagar), recorrência (`recorrencia`), feriados
  (`feriados`), homem-hora de RDO (`rdo-hh`), cripto de PII (`crypto-pii`), auditoria
  (`audit-detect`), fluxo de compra (`fluxo-compra`), roteador (`router`).
- **E2E/comportamental: Playwright** (`test/e2e/*.spec.js`, `npm run test:e2e`) — fluxo de usuário
  sobre o app rodando (`smoke`, `bm_rules`, `fluxos-compostos`, `ui-features`). **Nunca** chame
  serviço externo real no teste.
- **Parity/contrato:** `routes-parity.test.js` (rotas batem com o esperado), `headers.test.js`
  (headers de segurança), `healthz.test.js` (probe). São a rede de segurança contra regressão de contrato.
- **Toda regra de negócio tem teste.** Ao adicionar/alterar regra, escreva um teste que **prove que
  vale *e* que falharia se violada** — no mesmo commit (DoD §10.2). Nenhuma regra entra sem teste.
- **Alvo (gap aberto):** catalogar as regras com id (`BR-CAIXA-001`, `BR-FOLHA-002`…) e citar o id no
  teste, para rastreabilidade regra↔teste. Hoje os testes existem mas não são etiquetados por id.
- Teste função pública que carrega comportamento; getter trivial não precisa. Erre pro lado da cobertura.
- **Antes de qualquer entrega:** `npm test` verde é obrigatório; `npm run test:e2e` nos fluxos tocados.

## 9. Quality gates (CI verde, não-negociável)

Pipeline: instalar → testes unit (`npm test`) → e2e (`npm run test:e2e`) → análise estática → artefato.
- **Gate forte que já existe:** `npm test` (236 testes) verde é pré-condição de merge.
- **A adotar (gaps):**
  - **ESLint + Prettier** que **quebram o build** — o projeto ainda não tem; é o próximo gate natural.
    Rodar o formatter antes de cada commit.
  - **Cobertura:** o Node tem cobertura nativa (`node --test --experimental-test-coverage`) — ligar e
    fixar um piso (ex.: 80% em `lib/`) sem dependência nova.
- O `.github/` já existe — pendurar os gates ali (rodar `npm test` + e2e a cada push/PR).

## 10. Processo de entrega

- **Fatias verticais pequenas, um entregável cada** — rota→serviço→SQL→migration, não em camadas
  horizontais. ~400 linhas significativas por fatia; quebre o que for maior.
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`…).
- **Changelog obrigatório a cada bump de versão** (regra deste repo — ver `.claude/CLAUDE.md`):
  entrada no topo de `changelog.json` em linguagem de usuário final; `package.json.version` casa com a
  entrada mais recente. Use `node scripts/bump-version.js patch "resumo leigo"`.
- **Branch:** fase solo commita direto no `main`; vira branch curta + PR quando entra um segundo dev.
- **Clientes se atualizam sozinhos** após deploy (regra do repo) — nunca instrua refresh/limpar cache manual.
- **Aprovação antes de codar — ESTRITO.** Antes de qualquer mudança de código: enuncie o plano
  (entregável, arquivos, regras, testes, migration), **espere o ok explícito**, então construa.
  Exploração read-only não precisa de aprovação; escrever código precisa.
- **Documente ao entregar:** cada fatia atualiza um `doc/implementation-log.md` (o que foi feito,
  decisões, regras+testes, endpoints, migrations) no mesmo commit.

### Definition of Done (todo entregável)
1. Segue camadas / SOLID / costuras modulares acima.
2. Testes do §8 — toda regra de negócio com teste rastreável.
3. Migration incluída quando o schema muda (forward-only).
4. `changelog.json` + `package.json` atualizados se houve bump.
5. Sem segredo no código.
6. Implicação legal/privacidade considerada (auditoria é dado pessoal; consentimento versionado — §12).
7. CI verde.

## 11. Ambientes, segredos, configuração

- **Local:** Docker Compose (Postgres + substitutos locais), um comando pra subir; externos stub/sandbox.
  Backup automático já existe (`npm run backup:prod` / GitHub Actions → OneDrive).
- **12-factor:** toda config por env var; segredo em gerenciador de segredo, **nunca no repo**;
  `.env.example` documenta as chaves.
- **Produção:** Railway (deploy do `main`, migrations no preDeploy). Cuidado com custo de storage,
  banda, logs explodindo, container grande.

## 12. Compliance (LGPD)

Já é parte do projeto — manter desde o início, não como remendo (ver `docs/LGPD.md`):
consentimento de Termos/Privacidade versionado; export + apagamento de dados pessoais; retenção de
auditoria/IP com purga automática; PII criptografada (`lib/crypto-pii.js`); sem enumeração de conta no
login; login com rate-limit.

---

### Como usar este doc
- É a referência de engenharia da **produção Node**. Conflito com algo do código → o **princípio**
  ganha; ajuste o código ou registre a decisão de divergir.
- A reescrita Java (`feat/rewrite-java`) segue a versão *stack-Java* destes princípios — se um dia for
  retomada, os dois ficam coerentes.
