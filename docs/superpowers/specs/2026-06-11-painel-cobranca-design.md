# Painel "Cobrança por área" — Design

**Data:** 2026-06-11
**Status:** aprovado pelo usuário (brainstorming concluído)
**Motivação:** "Sou um empresário que quero ver como está o andamento de todos os
processos da empresa para poder cobrar as respectivas áreas."

## Objetivo

Dar ao dono uma visão imediata, no topo do Dashboard, do que está **parado** em cada
área da empresa — com há quantos dias e qual a próxima ação — para que ele saiba
exatamente quem cobrar e do quê.

## Decisões de produto (respondidas pelo usuário)

| Decisão | Escolha |
|---|---|
| Formato | Painel em 2 níveis: resumo por área + drill-down de pendências |
| Áreas | RH (recrutamento + folha), Obras (NFs/medições + RDOs), Financeiro, Frota. **Compras/Estoque ficam de fora** (já cobertos pelo "Apanhado geral do mês") |
| Semáforo | Por dias parado: pendência mais antiga define a cor da área — ≥7 dias = vermelho, 3–6 = amarelo, senão verde |
| Corte de entrada | Itens com <3 dias parados não aparecem (o painel é fila de cobrança, não inventário) |
| Posição | Topo absoluto do Dashboard, acima do "Apanhado geral do mês" |
| UI | Cards por área em grade (estilo dos KPIs atuais) |
| Implementação | Endpoint novo `/api/dashboard/cobranca` + regra pura em `lib/pendencias.js` (abordagem A). Nome `pendencias` (e não `cobranca`) para não colidir com a view existente `CobrancaMensal` (#/cobranca, mensalidade de clientes) |

## UI

Card "Cobrança por área" no topo do Dashboard, contendo uma grade de 4 cards
(RH, Obras, Financeiro, Frota), no estilo visual dos KPIs existentes (`rh-kpi`):

```
┌─ COBRANÇA POR ÁREA ──────────────────────────┐
│ ┌🔴 OBRAS──────┐ ┌🟡 RH─────────┐            │
│ │ NF 132   12d │ │ Cand. doc  4d │            │
│ │ RDO Sul   8d │ │               │            │
│ │ +1 → ver     │ │               │            │
│ └──────────────┘ └───────────────┘            │
│ ┌🟢 FINANCEIRO─┐ ┌🟢 FROTA───────┐            │
│ │ em dia ✓     │ │ em dia ✓      │            │
│ └──────────────┘ └───────────────┘            │
└──────────────────────────────────────────────┘
```

- Cada card: borda/cabeçalho na cor do semáforo + contagem de pendências.
- Dentro do card: as **3 pendências mais antigas** (descrição + dias parado).
- Mais de 3: link "+N ver todas" expande o card no lugar.
- Cada linha de pendência é um link para a tela onde se resolve
  (`#/recrutamento`, `#/frota`, `#/notas-fiscais`, ...).
- Área sem pendência: card verde com "em dia ✓".
- Acessibilidade: cor nunca é o único sinal — sempre acompanhada de texto/emoji
  (coerente com as sprints de a11y já feitas).

## Regras de negócio (lib/pendencias.js)

Tudo em **dias corridos**, calculado contra a data de "hoje" recebida por parâmetro
(função pura, testável). Constantes nomeadas:

```js
const DIAS_VERMELHO = 7;  // pendência mais antiga ≥7 dias → área vermelha
const DIAS_AMARELO  = 3;  // 3–6 dias → amarela; itens <3 dias não entram na lista
```

### Pendências por área

| Área | Pendência | Data-base ("parado desde") | Próxima ação / link |
|---|---|---|---|
| RH | Vaga aberta **sem candidato em andamento** | `createdAt` da vaga | Avançar recrutamento → `#/recrutamento` |
| RH | Candidato parado no funil | `updatedAt` do candidato | Triagem/antecedentes/docs → `#/recrutamento` |
| RH | Doc de candidato pendente | `updatedAt` do candidato | Cobrar/validar documento → `#/recrutamento` |

> Dedup: cada candidato gera **no máximo uma** pendência — a mais específica vence
> (doc pendente > parado no funil). Vaga com candidatos em andamento não é
> pendência por si só (os candidatos é que são).
| RH | Parcela de folha vencida não paga | `dataVencimento` da parcela | Pagar folha → `#/folha-pagamento` |
| Obras | NF (medição/BM) não emitida com prazo vencido | `dataLimite` da NF | Emitir NF → `#/notas-fiscais` |
| Obras | NF emitida com recebimento previsto vencido | `dataEmissaoReal + prazoRecebimento` | Cobrar cliente → `#/notas-fiscais` |
| Obras | RDOs em atraso por obra | dia útil mais antigo sem RDO (aderência diária) | Preencher RDO → `#/contratos/:id` |
| Financeiro | Conta a pagar vencida não paga | `data_vencimento` | Pagar/renegociar → `#/contas-pagar` |
| Frota | Manutenção de equipamento aguardando avaliação/aprovação (`status` solicitada/pendente_aprovacao) | `updatedAt` da manutenção | Avaliar/aprovar → `#/manutencao` |
| Frota | Plano de revisão de veículo vencido (`veiculo_planos`: `ultima_data + intervalo_meses` no passado) | data de vencimento do plano | Agendar revisão → `#/frota` |

- Ordenação: dentro de cada área, da pendência mais antiga para a mais nova.
- Cor da área = faixa da pendência mais antiga; sem pendências = verde.

## Arquitetura

```
GET /api/dashboard/cobranca
  routes/operacao.js  → registra a rota (padrão deps.handle*)
  handlers/dashboard-cobranca.js → busca dados via repos/db e chama a lib
  lib/pendencias.js   → funções puras: listas + hoje → { areas: [...] }
  js/views/Dashboard.js → fetch no Promise.all existente + _renderCobranca(cob)
```

Payload de resposta (exemplo sintético):

```json
{
  "areas": [
    {
      "id": "obras", "nome": "Obras", "cor": "vermelho",
      "pendencias": [
        { "titulo": "NF 132 sem emissão", "diasParado": 12,
          "proximaAcao": "Emitir NF", "href": "#/notas-fiscais" }
      ]
    }
  ]
}
```

## Erros e estados

- Falha na API → a seção simplesmente não aparece (padrão null-safe do
  `_renderOperacional`); o resto do Dashboard renderiza normal.
- Área sem dados cadastrados (ex.: nenhum veículo) → card verde "em dia ✓".
- Todos os campos do payload lidos com null-safety no front.

## Testes

`test/pendencias.test.js` (node:test, padrão do projeto):

- Cor por dias parado, incluindo os limiares exatos (3 e 7 dias).
- Corte de entrada: item com <3 dias não aparece.
- Ordenação por antiguidade dentro da área.
- Área vazia → verde, lista vazia.
- Entradas nulas/ausentes → não quebra (devolve estrutura válida).

Regra do steering: toda regra com teste; `npm test` verde obrigatório.

## Fora de escopo

- Compras e Estoque (cobertos pelo "Apanhado geral do mês").
- Notificações/push de pendências (o sino de notificações já existe e é outro fluxo).
- Configuração de limiares pela UI (constantes na lib por enquanto).
