# Plano: Próximos Passos do Dashboard

## Contexto

O Dashboard do Rhino ganhou duas seções principais:
- **Apanhado geral do mês** — KPIs de custo com comparativo mês anterior
- **Situação atual** (v1.23.9) — 9 indicadores operacionais em tempo real

Este plano cobre os próximos incrementos prioritários.

---

## Step 1 — Testes para os novos indicadores do dashboard

**Intent**: Cobrir com testes as 7 novas queries de `handleDashboardOperacional` e o método `_renderSituacaoAtual` do Dashboard.js. Atualmente não há testes para as queries de `manutEquip`, `docsKpi`, `propostasKpi`, `candidatosParados`, `revisoes`, `folgasKpi` e `comprasParadas`.

**Escopo**:
- Criar `test/dashboard-operacional.test.js` — unit tests para cada query usando mocks de db
- Criar `test/dashboard-view-smoke.test.js` para cobrir `_renderSituacaoAtual` num sandbox vm
- Garantir que todos os fallbacks `safe()` funcionam (retornam zeros sem lançar)

**Arquivos afetados**: `server.js` (linhas 430–570), `js/views/Dashboard.js` (`_renderSituacaoAtual`), novo `test/dashboard-operacional.test.js`

**Critérios de aceite**:
- `npm test` verde com os novos testes
- Cobertura das 7 queries novas e do render da seção "Situação atual"
- Testar caso onde todas as tabelas retornam zero (zero-state)

---

## Step 2 — Notificações push para indicadores críticos

**Intent**: Quando um indicador passa para estado crítico (documento vencido, manutenção atrasada, revisão vencida), disparar uma notificação push para o usuário logado. O sistema de push já existe (`web-push` instalado).

**Escopo**:
- Criar `lib/dashboard-alertas.js` com lógica de threshold e disparo
- Threshold padrão: `docsKpi.vencidos > 0`, `manutEquip.atrasadas > 0`, `revisoes.vencidas > 0`
- Usar o mecanismo de notificação já existente (`/api/notificacoes`)
- Não duplicar notificações — marcar como notificado no dia

**Arquivos afetados**: novo `lib/dashboard-alertas.js`, `server.js` (registrar job diário)

**Critérios de aceite**:
- Notificação aparece no sino quando há documento vencido
- Não re-notifica no mesmo dia para o mesmo indicador
- Testes unitários para a lógica de threshold

---

## Step 3 — Drill-down: deep-links com filtros pré-aplicados nos cards

**Intent**: Os cards de "Situação atual" linkam para rotas genéricas. Adicionar query params para filtros pré-aplicados ao clicar: "Manutenções atrasadas" → `#/manutencoes?filtro=atrasadas`.

**Escopo**:
- Adicionar suporte a query params nas rotas existentes
- Nas views de destino, ler o param e aplicar filtro inicial
- Cobrir: `#/manutencoes?filtro=atrasadas`, `#/recursos?docs=vencidos`, `#/recrutamento?filtro=parados`
- Não criar novas rotas — estender as existentes

**Arquivos afetados**: `js/views/Dashboard.js` (hrefs nos cards), views de Manutenções e Recursos

**Critérios de aceite**:
- Clicar no card abre lista já filtrada
- Limpar o filtro volta à lista completa
- URL com o param pode ser bookmarkada

---

## Step 4 — Índices de banco para as novas queries do dashboard

**Intent**: As 7 novas queries de `handleDashboardOperacional` fazem table scans em tabelas que crescem com o tempo. Adicionar índices cirúrgicos.

**Escopo**:
- `manutencoes(status)`, `manutencoes(data_retorno_prevista)` WHERE status = 'aprovada'
- `candidatos(status, updated_at)`
- `propostas(status)`
- `solicitacoes_compra(status, updated_at)`
- `veiculo_planos(ativo, ultima_data)` WHERE ativo = TRUE
- Forward-only migration (sem rollback destrutivo)

**Arquivos afetados**: novo `db/migrations/YYYYMMDD_dashboard_indexes.sql`

**Critérios de aceite**:
- Migration roda limpa em banco vazio e em produção
- EXPLAIN mostra Index Scan para as queries do dashboard
- Sem índice duplicado com os já existentes

---

## Step 5 — Refatorar handleDashboardOperacional em módulo separado

**Intent**: `handleDashboardOperacional` cresceu para ~180 linhas. Extrair para `lib/dashboard-operacional.js` seguindo o padrão dos outros handlers.

**Escopo**:
- Mover queries + formatação para `lib/dashboard-operacional.js`
- Expor `async function getDashboardOperacional(db)` retornando o JSON
- `server.js` chama `sendJson(res, await getDashboardOperacional(db))`
- Manter todos os `safe()` wrappers
- Testes unitários com db mockado

**Arquivos afetados**: novo `lib/dashboard-operacional.js`, `server.js` (simplificar endpoint), `test/dashboard-operacional.test.js`

**Critérios de aceite**:
- `server.js` fica com ≤ 20 linhas para o endpoint operacional
- Testes cobrem happy path e todos os `safe()` fallbacks
- Comportamento idêntico ao atual (sem regressões)
