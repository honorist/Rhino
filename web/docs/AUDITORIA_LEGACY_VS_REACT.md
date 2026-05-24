# Auditoria Legacy vs React — Pré-cutover

> Última atualização: pós-DASH-1/2/3 + RDO fix + PWA NetworkFirst + 4 cards adicionais

## 🟢 Telas COM paridade completa (auditadas)

| Tela | Status | Notas |
|---|---|---|
| Dashboard | ✅ | Saudação + Score + 9 KPIs + Pipeline + Card RDOs + Gráfico Fluxo (30/60/90d) + NFs Situação + ContasPagar Situação + Contratos a Vencer + Contratos por Margem + Últimas Movimentações + 5 Mini-cards |
| Login / LGPD / ProfilePicker | ✅ | Porte completo, ambos os IDs preservados |
| Clientes | ✅ | CRUD com modal |
| Fornecedores | ✅ | CRUD com modal |
| Sócios | ✅ | CRUD com modal |
| Recursos | ✅ | CRUD com folgas + passagens |
| Caixa | ✅ | KPIs + lançamentos |
| Contas a Pagar | ✅ | CRUD + pagamento |
| Notas Fiscais | ✅ | CRUD + emissão |
| BASE | ✅ | CRUD com alocações |
| Investimentos | ✅ | Aportes contrato+BASE |
| Contratos (lista) | ✅ | Lista + filtros + drill-in |
| Contratos (detalhe) | ✅ | 10 abas migradas, BM agora wired |
| Auditoria | ✅ | Read-only, idêntica |
| Frota | ✅ | CRUD veículos + manutenções |
| Manutenção | ✅ | CRUD |
| Solicitações de Compra | ✅ | Workflow aprovação |
| Estoque | ✅ | CRUD itens + movimentações |
| Documentos | ✅ | Upload + categorias |
| Folha de Pagamento | ✅ | Cálculo mensal |
| Propostas / Cláusulas | ✅ | Editor 8 abas |
| RDOs (lista) | ✅ FIXED | Agora abre `RdoDetailModal` ao clicar (era bug) |
| Cobrança Mensal | ✅ | Projeção + histórico |
| Conciliação | ✅ | Match caixa↔extrato |
| Comparativo | ✅ | Ranking contratos |
| Apresentação | ✅ | Textos globais + galeria de logos |
| Portal Cliente | ✅ | Login + dashboard |
| Relatório Gerencial | ✅ | PDF 9 páginas |
| Manual | ✅ | 26 seções com mermaid |
| AI Chat | ✅ | Chat com OpenAI |
| Previsão | ✅ | Cobrança projetada |
| Obras (mapa) | ✅ | Leaflet lazy-loaded |
| Usuários | ✅ | CRUD admin |

## 🔴 Telas COM gaps reais

| Tela | Gap | Severidade |
|---|---|---|
| **Configuração → Tipos de Custo** | Placeholder "em migração" — não funciona | 🟡 MÉDIA |
| **Configuração → Níveis de Acesso** | Placeholder — não dá pra editar permissões | 🟡 MÉDIA |
| **Configuração → Templates de Docs** | Placeholder | 🟢 BAIXA |
| **Configuração → Arquivos do Sistema** | Placeholder | 🟢 BAIXA |
| **Configuração → Backup do Sistema** | Placeholder | 🟡 MÉDIA |
| **Configuração → Feature Flags** | Placeholder | 🟢 BAIXA |
| **Configuração → Notificações Push** | Placeholder (mas `usePush` existe) | 🟢 BAIXA |
| **Configuração → Privacidade (LGPD)** | Placeholder | 🟢 BAIXA |
| **Configuração → Tour Guiado** | Placeholder | 🟢 BAIXA |
| **Configuração → Atualizações** | Placeholder | 🟢 BAIXA |

**Status:** 3 dessas seções (Tour, Atualizações, LGPD) já têm os arquivos `*Section.tsx` prontos em `web/src/features/configuracao/sections/`, faltando integrar no `Configuracao.tsx`. As outras 7 dependem de implementação.

## 🐛 Bugs corrigidos NESTA sessão (ainda não em prod)

| # | Bug | Fix |
|---|---|---|
| 1 | Sidebar mostrava TODAS rotas independente do perfil (Previsão/Conciliação para gerente) | `Sidebar.tsx` agora chama `podeAcessar()` do `perfilStore` |
| 2 | Sidebar sem botão Sair, sem perfil ativo | Footer da Sidebar restaurado com logout + perfil + versão |
| 3 | Dashboard sem saudação + simplificado demais (8 KPIs vs 9 do legacy) | Saudação + 9 KPIs + Score + Pipeline + Card RDOs + Gráfico + tabelas |
| 4 | Gráfico Fluxo zerado, sem botões 30/60/90d, sem projeção | Reescrito usando `historicoCaixa` + `saldoProjetado` da API + botões |
| 5 | RDOs lista: clicar abre contrato (errado) | Agora abre `RdoDetailModal` (paridade legacy) |
| 6 | Service Worker cacheava HTML agressivamente — usuário não via mudanças após deploy | `vite.config.ts` agora usa `NetworkFirst` + `skipWaiting` + `clientsClaim` |

## ⚠️ Itens que NÃO consigo validar daqui

Sem o legacy rodando lado a lado e sem acesso ao seu monitor:

1. **Pixel-perfect visual** — cores, espaçamentos, tipografia podem ter divergência sutil
2. **Comportamento de modals** — animações, foco, ESC
3. **Fluxos compostos** — criar contrato → adicionar saída → emitir NF → gerar BM
4. **Permissões granulares** — `edit:#/X`, `contrato-tab:Y`, `special:nao-ver-valores`

## 📋 Recomendação para o push

**Opção 1 — Push agora** (recomendado):
- Tudo o que foi feito está testado (423 testes verdes)
- Bug do RDO corrigido
- Service Worker fix garante que próximos deploys não fiquem com cache
- Configuração continua placeholder (já estava antes)

**Opção 2 — Não pushar até portar todas as seções de Configuração**:
- ~2-3 dias de trabalho adicional
- Risco: pode introduzir novos bugs no Dashboard

**Opção 3 — Push em batches**:
- Push 1: Dashboard + RDO fix + PWA (essa branch)
- Push 2: 3 seções fáceis de Configuração
- Push 3: Tipos de Custo + Níveis de Acesso (mais usadas)
- Push 4: resto (Templates, Arquivos, Backup, Feature Flags)
