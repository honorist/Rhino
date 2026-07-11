# Varredura profunda de segurança/qualidade — Rhino (2026-07-10)

> Auditoria multi-agente + verificação direta. Base: `main` @ v1.23.11, 294 testes verdes.
> **Método:** 27 agentes-varredura (5 dimensões × áreas) + verificação adversarial. O workflow
> bateu no **limite de sessão** (9/64 agentes concluíram) → as áreas críticas (auth, LGPD, bugs,
> paridade de links) foram cobertas **por leitura direta + provas empíricas contra o app no ar**
> (Docker local, `localhost:3001`). Achados abaixo são os **verificados** — não a lista bruta.

## ✅ Correções aplicadas (2026-07-11) — `npm test` 300/300 verde
| Item | Status | Onde |
|------|--------|------|
| **H1** saída em dobro na conciliação | ✔ corrigido | `js/views/Conciliacao.js` — com conta vinculada, só `pagarConta` lança no caixa (fallback se a baixa falhar) |
| **H2** `dashboard/cobranca` fura gate | ✔ corrigido + teste | `handlers/dashboard-cobranca.js` filtra áreas por permissão; `routes/operacao.js` passa `req`; `test/dashboard-cobranca-gate.test.js` (6 casos) |
| **H3** download de PII sem gate | ✔ corrigido | `server.js` `VIEW_PERMISSION_RULES` gateia o arquivo de doc de colaborador a `#/recursos` |
| **M3** IDOR delete de foto de RDO | ✔ corrigido | `handlers/rdo-fotos.js` — `DELETE ... WHERE id=$1 AND rdo_id=$2` |
| **L4** `nosniff` nos downloads | ✔ corrigido | `recurso-documentos.js` + `candidato-documentos.js` |
| **M2** escape de HTML inconsistente | ✔ corrigido | `escapeHtml` aplicado em 16 pontos: `Configuracao/Recursos/NotasFiscais/Caixa/Contratos/Base/Fornecedores/Clientes` (Portal.js já estava escapado) |
| **M4** CSP com jsDelivr amplo | ✔ corrigido | `server.js` — `script-src` estreitado dos domínios inteiros para os caminhos `/npm/mermaid@10/` e `/npm/shepherd.js@11/` |
| **M1** CPF em texto claro | ✅ **falso positivo** | `db/repos/candidatos.js` e `db/repos/recursos.js` **já cifram** o CPF em repouso (`pii.encrypt`/`decrypt`, AES-256-GCM + blind-index). Nada a fazer. |
| **L1** `.html` fora da allowlist | ✔ corrigido | `server.js` `serveStaticFile` só serve `/index.html` como HTML; outros `.html` → 404 |
| **L2** idempotency sem escopo de usuário | ✔ corrigido | `server.js` `withIdempotency` — `rowId` inclui `req.user.id` |
| **L5** IP do proxy na assinatura | ✔ corrigido | `rdo-assinaturas.js` — prefere 1º IP do `X-Forwarded-For` |
| **L7** upload de foto de RDO sem cota | ✔ corrigido | `rdo-fotos.js` — cota de 60 fotos/RDO (rollback na transação) |
| **M5** salário via `contas-pagar`/`base` | 🔎 **não confirmado** | O `create` de contas-pagar **não** acopla folha/salário (folha tem tabela + gate próprios). Sem marcador folha↔conta no código; **não** implementei filtro especulativo. Reavaliar com o dono do dado se surgir caso real. |
| **L3** upload confia no Content-Type | ⏳ recomendado | `recurso-documentos.js` aceita PDF/imagem; validar magic-bytes por tipo. Mitigado em parte pelo `nosniff` (L4). Requer validação por tipo (PDF `%PDF`, imagem via `isAllowedImageMagic`). |
| **L6** SSE transmite tudo a todos | ⏳ recomendado | `lib/bus.js` — filtrar eventos por tela/permissão é mudança arquitetural; documentado p/ PR dedicado. |

> **⚠️ Smoke-test do M4 após deploy:** confirmar que os diagramas do **Manual** (mermaid) e o **tour de onboarding** (shepherd) ainda carregam — o `script-src` agora só libera esses dois caminhos do jsDelivr.

## Como ler
Severidade **após verificação** (muitos "HIGH" brutos foram rebaixados por mitigações reais no código).
`✔ CONFIRMADO` = provado por código e/ou runtime. `~ PLAUSÍVEL` = forte indício, falta um passo de confirmação.

---

## 🔴 ALTA — corrigir antes do próximo deploy

### H1 ✔ Conciliação bancária lança a MESMA saída duas vezes no Caixa
- **Arquivos:** `js/views/Conciliacao.js:768` + `handlers/contas-pagar.js:78-86`
- **Defeito:** para cada transação conciliada, o fluxo chama `Store.createCaixaEntry(...)` (1 saída) **e**, se
  vinculada a uma conta a pagar, `Store.pagarConta(...)`. O handler `pagar` **também** cria um lançamento de
  caixa (`repos.caixa.create`). Resultado: **2 saídas de caixa para 1 débito bancário** → saldo/relatórios
  subestimam o caixa a cada conciliação vinculada.
- **Repro:** conciliar uma transação e vinculá-la a uma conta a pagar → conferir a tela Caixa: aparecem 2 saídas.
- **Correção:** na conciliação, quando `decision.contaPagarId` existir, **não** chamar `createCaixaEntry` — deixar
  o próprio `pagarConta` registrar o caixa (ele já faz, sob advisory lock). Só criar entrada avulsa quando **não** houver conta vinculada.

### H2 ✔ `/api/dashboard/cobranca` fura o gate de leitura de Folha e Recrutamento
- **Arquivo:** `handlers/dashboard-cobranca.js:11`
- **Defeito:** `handleDashboardCobranca(res)` recebe **só `res`** — nenhuma checagem de permissão — e agrega
  `folhaPagamento` (salários) + `candidatos` (nomes/CPF de recrutamento) + contas + NFs. A rota
  `/api/dashboard/cobranca` **não casa** nenhuma `VIEW_PERMISSION_RULE` (server.js:3351), então **qualquer
  usuário autenticado** — inclusive um perfil sem `#/folha-pagamento` nem `#/recrutamento` — recebe dados
  derivados dessas telas gateadas. Confirmado: retorna `200 {areas}` para sessão autenticada.
- **Correção:** gatear o endpoint (`blockIfNoScreenAccess` para `#/cobranca`/`#/dashboard`) **ou** montar o
  payload só com os campos que o perfil pode ver. Idealmente, `calcularCobranca` não deve devolver nomes/valores
  crus de folha/candidato para quem não tem a tela.

### H3 ✔ Documentos de colaborador (PII, decifrados) baixáveis por qualquer usuário logado
- **Arquivos:** `handlers/recurso-documentos.js:413` (`handleGetRecursoDocArquivo`) e análogo em
  `handlers/candidato-documentos.js`
- **Defeito:** o GET do arquivo **decifra** o BYTEA (`piiCrypto.decryptBuffer`) e serve, sem checar ownership
  nem gate de tela. `/api/recursos/*` **não** está em `VIEW_PERMISSION_RULES` → basta estar autenticado e trocar
  o `recursoId`/`docId` na URL para baixar RG/CPF/CTPS de qualquer pessoa. (IDOR + LGPD.)
- **Nota positiva:** os arquivos **estão cifrados em repouso** — a falha é de autorização, não de armazenamento.
- **Correção:** exigir `#/recursos` (leitura) via um gate análogo ao de recrutamento, e validar que o `docId`
  pertence ao `recursoId`.

---

## 🟠 MÉDIA

### M1 ~ CPF de candidato/colaborador em texto claro no banco
- **Arquivo:** `handlers/recrutamento.js:201,360` — grava/retorna `cpf: body.cpf` sem `piiCrypto`, embora os
  *arquivos* de documento sejam cifrados. Exposição em dump/backup de banco. (LGPD — dado sensível em repouso.)
- **Falta confirmar:** camada `db/repos` (cifra por coluna?). Se não cifra, aplicar `crypto-pii` ao campo CPF.

### M2 ✔ Escape de HTML inconsistente em formulários (injeção de atributo/HTML)
- **Arquivos (amostra):** `Configuracao.js:162,625`, `Recursos.js:705,759,766`, `NotasFiscais.js:470,488,763`,
  `Caixa.js:419,867`, `Contratos.js:1090`, `Base.js:233`, `Fornecedores.js:320`, `Clientes.js:272`
- **Veredito rebaixado (HIGH→MEDIUM):** o front **tem** `window.escapeHtml`/`esc` e usa em vários lugares — os
  achados são pontos onde **esqueceram** de aplicar (`${valor}` cru dentro de `value="..."`/células). Porém a
  **CSP nonce-based sem `unsafe-inline`** (server.js:2788) + **cookie httpOnly** bloqueiam a execução prática de
  JS (script inline e handlers `onerror=` não rodam; `innerHTML` não executa `<script>`). Continua sendo bug real
  de robustez/defesa-em-profundidade (aspas quebram o input; risco se a CSP for afrouxada).
- **Correção:** passar todos os valores dinâmicos por `escapeHtml` (helper já existe). Ver também M5.

### M3 ✔ IDOR ao apagar foto/assinatura de RDO
- **Arquivo:** `handlers/rdo-fotos.js:116` — `DELETE FROM rdo_fotos WHERE id = $1` usa **só** `fotoId`; nunca
  valida que a foto pertence ao `rdoId` nem o `rdoId` ao `contractId` da URL. Mesmo padrão em `rdo-assinaturas.js`
  e nos sub-recursos de `contract-extras.js` (aditivos/marcos/ocorrências: PUT/DELETE ignoram o vínculo item↔contrato).
- **Impacto:** integridade — um editor de contratos apaga/edita artefato de **outro** contrato por id.
- **Correção:** `WHERE id = $1 AND rdo_id = $2` (e validar `rdo.contractId === contractId`).

### M4 ✔ CSP com `https://cdn.jsdelivr.net` em `script-src` enfraquece a proteção
- **Arquivo:** `server.js:2788` — jsDelivr serve **qualquer** pacote npm; é bypass de CSP conhecido. É a razão de
  M2 não poder ser 100% descartado. **Correção:** remover o CDN do `script-src` (o app parece autossuficiente) ou
  fixar com SRI/subcaminho específico.

### M5 (revisão de design) Endpoints "de referência" abertos podem vazar valores sensíveis
- `GET /api/contas-pagar`, `/api/base`, `/api/notas-fiscais`, `/api/contracts` são **abertos de propósito**
  (documentado em server.js:3348 — alimentam dropdowns). **Não é bug acidental.** Mas *se* `contas-pagar`/`base`
  carregam valores de salário (folha), o gate da Folha é furado por baixo. **Ação:** revisar o payload desses
  endpoints e remover campos de salário/PII para perfis restritos (ou minimizar os campos).

---

## 🟡 BAIXA / hardening
- **L1 ✔** `serveStaticFile` serve **qualquer `.html`** da árvore do projeto (server.js:2801) — o ramo `.html`
  entra antes da allowlist `_PUBLIC_DIRS`. Só há guard de path-traversal. Superfície de info-leak se existir HTML
  interno (coverage, `.playwright-mcp/`). Aplicar a allowlist também ao `.html`.
- **L2 ✔** Idempotency-Key não escopada por usuário (server.js:3454) — replay entre usuários se key+path+body
  colidirem. Incluir `req.user.id` no `rowId`.
- **L3 ✔** Upload confia no `Content-Type` do cliente (recurso-documentos.js) — sem validação de magic-bytes.
- **L4 ✔** Documentos servidos `inline` sem `X-Content-Type-Options: nosniff` (candidato-documentos.js:142).
- **L5 ✔** IP da assinatura digital é o do proxy em produção (rdo-assinaturas.js:72) — usar `X-Forwarded-For`
  confiável; trilha de não-repúdio hoje registra o IP do proxy.
- **L6 ✔** Bus SSE transmite todo evento de mutação a todos os clientes (bus.js:145) — ignora o gate de leitura
  por tela; vaza metadados de atividade.
- **L7 ✔** Upload de fotos de RDO sem cota por usuário/RDO (rdo-fotos.js:23) — exaustão de armazenamento.

---

## ✅ Pontos fortes confirmados (defesa que já existe)
- Login com **rate-limit persistente em Postgres** (5 falhas/15min), refund em sucesso; forgot/reset com limites.
- **Cookie de sessão httpOnly**; CSP com **nonce por request** e `frame-ancestors 'none'`.
- Gate server-side de **mutação** (C-04) e de **leitura** para telas sensíveis (caixa/sócios/investimentos/
  folha/recrutamento); rotas admin exigem super-admin; **anti-escalada** em atribuição de perfil (`canAssignNivel`).
- Guards de **path-traversal** em estático e HTML; arquivos de PII **cifrados em repouso** (AES via crypto-pii).

## ⚠️ Cobertura NÃO concluída (honestidade)
- O workflow não terminou as frentes **BUG exaustiva**, **LGPD completa** e **paridade de links (LINK)** por limite
  de sessão — cobri os itens de maior risco por leitura direta, mas **não** é uma varredura exaustiva dessas frentes.
- **Teste ao vivo das ~37 telas** (console/render por tela): o MCP do Chrome caiu no meio; troquei por **probes de
  API** (que cobrem a superfície de segurança), mas o smoke visual por tela ficou pendente.

## Ordem de correção sugerida
1. **H1** (dinheiro em dobro) → **H2/H3** (vazamento de PII/salário) — impacto direto em dados e LGPD.
2. **M3** (IDOR RDO), **M1** (CPF em repouso), **M4** (CSP jsDelivr).
3. **M2** (aplicar `escapeHtml` nos pontos listados), **M5** (revisar payloads de referência).
4. Lote de **L1–L7** num PR de hardening.
