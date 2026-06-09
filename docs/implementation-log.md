# Implementation log — Rhino

Registro por fatia entregue (engineering.md §10): o que foi feito, decisões,
regras+testes, endpoints e migrations. Mais recente no topo.

---

## 2026-06-09 — Etapa 4.3: documentos de candidato (BYTEA) + aprovação (v1.17.0)

**Problema.** No recrutamento, `anexarDocumento` (handlers/recrutamento.js) só
guardava metadados (`{filename, storagePath}`) no JSONB `candidatos.documentos`
— o binário nunca era persistido (mesmo bug das fotos de RDO antes do BYTEA).
A aprovação (`aprovarCandidato`) exigia 4 docs, mas conferia o JSONB-fantasma, e
a UI mostrava os documentos só-leitura, sem upload nem botão de aprovar.

**Entrega (fatia vertical: regra → rota → SQL → migration → UI).**

- **Migration** `db/migrations/20260609000000_candidato_doc_arquivos.sql` (+`.down`):
  tabela `candidato_doc_arquivos` (BYTEA cifrado em repouso, FK→candidatos
  `ON DELETE CASCADE`, índices), espelhando `recurso_doc_arquivos`. Migration-only
  (não vai pro `schema.sql`, que é baseline aplicado antes das migrations e não
  tem a tabela `candidatos`).
- **Regra pura** `lib/recrutamento-docs.js`: `validarUploadDoc` (tipo, mime,
  tamanho, gate de antecedentes) e `podeAprovar` (antecedentes OK + 4 docs com
  arquivo real). Resultado como objeto `{ok, motivo}`, não exceção (§5).
- **Handler** `handlers/candidato-documentos.js`: `handlePost/Get/Delete
  CandidatoDocArquivo` + `tiposComArquivo`. Upload cifra com `lib/crypto-pii`
  (LGPD), substitui o arquivo do mesmo tipo, referencia no JSONB. Sem validação
  por IA (decisão: candidatos não têm template; KISS/YAGNI).
- **Rotas.** `routes/recrutamento.js`: `POST|GET|DELETE
  /api/recrutamento/candidatos/:id/documentos/:tipo/arquivo`. O POST é
  interceptado no `createServer` (multipart, pula o body parser JSON), igual aos
  uploads de recurso/RDO. Permissão já coberta pelas regras `^/api/recrutamento`.
- **Aprovação** (`aprovarCandidato`): passa a usar `podeAprovar` checando os
  arquivos REAIS (`candidato_doc_arquivos`), e **migra os bytes** do candidato
  para `recurso_doc_arquivos` do novo colaborador (cópia do BYTEA já cifrado),
  com `doc id` próprio no JSONB `recursos.documentos` — assim os docs ficam
  baixáveis na ficha do colaborador.
- **UI** `js/views/Recrutamento.js` (`_showModalTriagem`): upload por documento
  (input file escondido + botão Enviar/Substituir), link "Ver", e botão
  **Aprovar candidato** (habilita só com antecedentes OK + 4 docs). Refresh do
  modal após upload (`_reabrirTriagem`).

**Decisão.** A rota JSON legada `POST .../documentos/:tipo` (`anexarDocumento`)
foi mantida por compat (inofensiva); a UI nova usa só o upload binário. Como o
gate de aprovação passou a exigir arquivo real, metadado-fantasma legado não
libera mais a aprovação — comportamento correto.

**Regras + testes.** `test/recrutamento-docs.test.js` (14 casos: `validarUploadDoc`
e `podeAprovar`, cada regra provando que vale e que falharia se violada).
`test/routes-parity.test.js`: bloco `routes/recrutamento.js` (14 rotas + dispatch
das rotas de arquivo). Suíte pura: **247 passando, 0 falhas**. Lint limpo
(`--max-warnings 0`).

**Verificado end-to-end** (2026-06-09) contra app local + Postgres efêmero:
login → solicitação → candidato → triagem → antecedentes → upload dos 4 docs →
GET do doc → aprovar → download do doc JÁ no recurso criado (migração de bytes).
Negativos OK: aprovar sem docs → 400; upload HTML → 400. Também: migration +
schema + BYTEA round-trip + FK cascade validados em Postgres.

**3 bugs latentes achados e corrigidos na verificação** (estavam escondidos
porque o fluxo nunca rodava completo):
1. **`server.js`** — o body parser só tratava `POST`/`PUT`; `PATCH` recebia body
   `null` → 500 em triagem/antecedentes (e em `PATCH` de propostas/contratos).
   Fix: incluir `PATCH` no parser.
2. **`js/views/Recrutamento.js`** — "Salvar triagem" mandava `{antecedentesStatus}`,
   mas o endpoint espera `{resultado}`; além disso fazia as 2 chamadas em paralelo
   (corrida com a regra "precisa estar interessado"). Fix: campo `resultado` +
   chamadas sequenciais.
3. **`handlers/recrutamento.js`** — `recursos.documentos` (JSONB) recebia array JS;
   o `pg` serializa array como array Postgres, não JSON → "invalid input syntax for
   type json". Fix: `JSON.stringify(recursoDocs)`.
