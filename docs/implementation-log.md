# Implementation log — Rhino

Registro por fatia entregue (engineering.md §10): o que foi feito, decisões,
regras+testes, endpoints e migrations. Mais recente no topo.

---

## 2026-07-20 — BM estruturado: planilha de serviços + medição por itens (v1.24.0)

**Problema.** O Boletim de Medição não era uma medição de verdade: `saidas.numero_bm`
era só um rótulo de texto (`BM-001`) colado num valor fechado digitado à mão. Não
havia planilha contratual de serviços, não existia quantidade medida × preço
unitário, não havia saldo por serviço, aprovação do cliente nem retenção por BM.
Para uma empresa de montagem industrial isso é o coração do faturamento — era a
lacuna nº 1 do diagnóstico de domínio.

**Entrega (fatia vertical: regra → rota → SQL → migration → UI).**

- **Migration** `db/migrations/20260720120000_bm_estruturado.sql` (idempotente):
  - `contract_servicos` — planilha contratual (bill of quantities): código,
    descrição, unidade, `qtd_contratada`, `preco_unit`, ordem, ativo.
  - `medicao_itens` — itens de uma medição, pendurados na `saida`
    (FK `ON DELETE CASCADE`) com `servico_id` `ON DELETE RESTRICT`. `preco_unit`
    é **snapshot**; `contract_id` denormalizado para acumular sem JOIN.
  - `notas_fiscais` ganha `aprovacao_status/por/em/obs` e `retencao_pct`.
  - Espelhado em `db/schema.sql` (baseline de instalação nova) — DDL conferido
    linha a linha contra a migration.

- **Regra pura** `lib/medicao.js` (sem I/O) + `test/medicao.test.js` (17 testes):
  - `BR-MED-001` medição nunca ultrapassa o saldo contratado do serviço — o
    excedente entra por aditivo (decisão do usuário: **bloquear**, não avisar).
    A mensagem de erro devolve o saldo disponível na unidade do serviço.
  - `BR-MED-002` preço unitário é snapshot no momento da medição (reajuste não
    retroage); o preço do payload é **ignorado**, vem sempre da planilha.
  - `BR-MED-003` retenção é % fixo do contrato aplicado a todo BM. Reusa o campo
    que **já existia** (`contracts.retencao_percent`, editável em `Contratos.js` e
    exibido no `ContratoDetail`); o pct vira snapshot na NF e o **valor retido é
    sempre derivado**, nunca armazenado — não dessincroniza da agregação de saídas.
  - `BR-MED-004` saída com itens tem valor derivado dos itens: PUT de valor é barrado.
  - `BR-MED-005` `qtd_contratada` não desce abaixo do já medido; serviço com
    medição acumulada não é excluído — inativa-se.
  - Comparações de quantidade usam epsilon (`QTD_EPS`), como o resto do projeto já
    faz com dinheiro — drift de IEEE-754 não pode barrar uma medição legítima.

- **Repos.** `db/repos/contract_servicos.js`, `db/repos/medicao_itens.js` (factory
  genérico) + registro no barrel `db/repos/index.js`.

- **Handlers.** `handlers/contract-servicos.js` (CRUD da planilha, devolve sempre a
  planilha com saldo) e `handlers/contract-medicoes.js` (medição, visão de BMs,
  aprovação). `handlers/contract-saidas.js` foi **refatorado**: o trecho
  "cria saída + agrega na NF do dia" virou `criarSaidaAgregandoNf`, exportado e
  reusado pela medição — a mecânica saída→NF→caixa não mudou.

- **Rotas.** 7 novas em `routes/contracts.js` (38 → 45), com
  `test/routes-parity.test.js` atualizado + teste de comportamento das novas
  (inclusive o caso de `ctx.req` ausente na aprovação, que estourava TypeError).

- **UI** `js/views/contrato/medicao.js` (planilha: tabela com saldo, avanço e
  totais; CRUD por modal) e `medicao-bms.js` (lista de BMs com retenção, valor
  líquido e status de aprovação; modal de nova medição com saldo por serviço e
  total ao vivo; aprovar/rejeitar). Aba registrada em `ContratoDetail.js` e no
  `_lazyManifest` de `js/app.js`. Camada de API em `js/store.js` — `_medicaoFetch`
  extrai `{error}` do JSON e propaga a mensagem do servidor verbatim, para que as
  mensagens de regra (ex.: saldo disponível) cheguem ao usuário.

**Defeitos encontrados em revisão adversarial e corrigidos antes do merge.**
Uma revisão em 3 lentes (regressão, concorrência, dados/regras) levantou 18
achados; 9 críticos/altos foram submetidos a refutação e **5 sobreviveram**:

1. **Lock ausente no PUT/DELETE de serviço** — uma medição em voo já tinha lido
   `qtd_contratada=100` quando um PUT concorrente baixava para 10; o INSERT
   gravava 100 medidos sobre 10 contratados (saldo −90, avanço 1000%), furando
   BR-MED-001 e BR-MED-005. Ambos passaram a tomar o advisory lock do contrato.
2. **Corrida com a emissão de NF** (pré-existente, não introduzido aqui):
   `handleEmitirNotaFiscal` serializa por outra chave (`'nf:'+id`), então o BM
   podia ser emitido entre a leitura e a agregação — a entrada de caixa ficava
   com o valor antigo (a diferença sumia da projeção) e a saída ficava presa.
   `criarSaidaAgregandoNf` agora relê `emitida` imediatamente antes do update e
   responde 409 em vez de produzir o rombo.
3. **Exclusão de contrato dependente da ordem de triggers** — a FK
   `medicao_itens.servico_id ON DELETE RESTRICT` sob o CASCADE de
   `contract_servicos` podia abortar por violação de FK conforme os OIDs (funciona
   em dev, quebra em prod). `removeByIdCascade` apaga os dois explicitamente.
4. **Preço-snapshot ignorado na leitura** — `saldoPorServico` recalculava
   `valorMedido` pelo preço ATUAL: após um reajuste, a tela mostraria medição que
   não existe em BM nenhum (violando BR-MED-002). Agora recebe a Σ dos snapshots.
   Teste novo prova a regra: mede a 50, reajusta para 60, medido segue 5.000.
5. **Cap silencioso de 5000 linhas** — o acumulado vinha de `findAll`, que trunca
   no `DEFAULT_LIMIT` do factory; acima disso o medido era sub-contado e
   BR-MED-001 deixava de bloquear (~2 anos de operação num contrato típico). Novo
   `medicaoItens.somarPorServico` agrega no banco (`SUM ... GROUP BY`), o que
   resolve o cap, o tráfego de linhas e o item 4 de uma vez.

**Decisões.**
1. *Não* criar entidade "medição" separada. A medição reusa `saidas` (que já agrega
   em NF por data) e só acrescenta os itens — assim contratos sem planilha seguem
   funcionando por valor fechado, sem migração de dados nem bifurcação do fluxo
   financeiro. Convivência, não substituição.
2. *Compensação manual* no POST de medição: os repos usam o pool e commitam fora da
   transação (ver `db/index.js`), então se o INSERT dos itens falhar, a saída/NF
   recém-criadas são desfeitas explicitamente. O `pg_advisory_xact_lock` do contrato
   — o mesmo já usado pelas saídas — é o que serializa medições concorrentes.
3. Retenção reusa `contracts.retencao_percent` em vez de criar campo novo (a
   primeira versão inventou `metadata.retencaoPct`, que ninguém preenchia — a
   retenção nasceria sempre nula).

**Verificação.** `npm run lint` limpo (gate `--max-warnings 0`), `node --check
server.js` OK, suíte completa 320 testes / 298 passando / 22 falhas — as 22 são
`headers`+`healthz` por ECONNREFUSED (exigem app no ar), pré-existentes e
inalteradas: **zero regressões**.
**Não verificado:** a migration não foi aplicada contra Postgres real (sem Docker na
máquina) — o mapeamento camelCase→snake_case foi conferido executando
`db.camelToSnake` de verdade, mas o DDL só será exercido no deploy. Os testes
`headers`/`healthz` (22) falham por ECONNREFUSED, sem app no ar — pré-existente.

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
