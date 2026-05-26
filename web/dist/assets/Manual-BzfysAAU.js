const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/mermaid.core-DKDTiW_k.js","assets/index-BhQicYSI.js","assets/index-BEQF00H3.css","assets/purify.es-8E279hYE.js"])))=>i.map(i=>d[i]);
import{aa as i,_ as p,a6 as a}from"./index-BhQicYSI.js";const f=`
<pre class="mermaid">
flowchart TD
    A[Acesso ao app]:::start --> B[Tela de login<br/>email + senha]
    B --> C{Credenciais<br/>válidas?}
    C -- sim --> D[Sessão criada<br/>cookie httpOnly]:::ok
    C -- não --> E[Erro 401<br/>não autenticado]:::bad
    D --> F[App carrega<br/>perfil de acesso]:::ok
    F --> G[Cookie dura 30 dias.<br/>Logout limpa tudo.]:::note
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`,u=`
<pre class="mermaid">
flowchart TD
    A[Adicionar saída<br/>no contrato]:::start --> B[Informa valor,<br/>data e prazo]
    B --> C{Já existe NF<br/>mesmo dia<br/>não emitida?}
    C -- não --> D[Cria nova NF/BM<br/>separada]
    C -- sim --> E[Soma valor à NF<br/>existente]
    D --> F[Saída vinculada à NF<br/>numeroBM, nfId]:::ok
    E --> F
    F --> G[Quando NF for emitida:<br/>entrada agendada no caixa<br/>data emissão + prazo]:::note
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`,h=`
<pre class="mermaid">
flowchart TD
    A[NF criada<br/>BM pendente]:::warn --> B[Editar prazo<br/>se necessário]
    B --> C[Marcar Emitida<br/>informa data real]:::start
    C --> D[Cria entrada<br/>no caixa - prevista]:::ok
    D --> E[Receber NF<br/>caixa lança]:::ok
    E --> F[Saldo entra<br/>efetivamente]:::ok
    C -. opcional .-> G[Cancelar emissão<br/>estorno]:::bad
    G --> H[Remove entrada do caixa<br/>volta a BM]:::bad
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
</pre>`,g=`
<pre class="mermaid">
flowchart TD
    A[Lançar conta a pagar]:::start --> B[Status: Pendente<br/>valor + vencimento]
    B --> C{Vencimento<br/>passou?}
    C -- sim --> D[Vencida<br/>alerta vermelho]:::bad
    C -- não --> E[Botão Pagar<br/>data, valor, forma]:::start
    D --> E
    E --> F[Cria saída no caixa<br/>marca Pago]:::ok
    F -. estorno .-> G[Volta a Pendente<br/>remove entrada do caixa]:::warn
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
</pre>`,b=`
<pre class="mermaid">
flowchart TD
    A[Recurso alocado<br/>no contrato]:::start --> B[Próxima folga<br/>calculada pelo ciclo]
    B --> C[Cadastrar folga<br/>início + fim]
    C --> D[Folga registrada]:::ok
    D --> E[Comprar passagem<br/>ida e/ou volta]:::start
    E --> F{Quem paga?}
    F -- empresa --> G[Caixa empresa<br/>sem contrato]
    F -- contrato --> H[Contrato específico<br/>reduz margem]
    E --> I{Como lançar?}
    I -- à vista --> J[Saída direta no caixa<br/>saldo cai já]:::ok
    I -- a prazo --> K[Conta a pagar pendente<br/>saldo só cai depois]:::warn
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
</pre>`,C=`
<pre class="mermaid">
flowchart TD
    A[Aporte criado]:::start --> B{Origem?}
    B -- sócio --> C{Destino?}
    B -- caixa --> C
    C -- sócio --> D[Histórico de aportes<br/>sem caixa]
    C -- caixa --> E[Saída contábil<br/>automática no caixa]:::bad
    C -- contrato --> F[Marca contractId<br/>não cria item BASE]
    C -- BASE --> G[Cria item BASE<br/>rastreável]:::ok
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
</pre>`,A=`
<pre class="mermaid">
flowchart TD
    A[Contrato ativo]:::start --> B[Diariamente<br/>em dia útil]
    B --> C{É feriado<br/>nacional?}
    C -- não --> D[Criar RDO do dia<br/>MOI / MOD / equip. / atividades]:::ok
    C -- sim --> E[RDO opcional<br/>não conta]:::note
    D --> F[Anexar fotos<br/>opcional]
    F --> G[Aba RDOs alerta obras ativas<br/>sem RDO no último dia útil]:::note
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`,D=`
<pre class="mermaid">
flowchart TD
    A[Abrir Contrato]:::start --> B[Aba Cronograma]
    B --> C[Adicionar etapa]:::start
    C --> D[Definir nome, datas plan,<br/>peso % e custo planejado]
    D --> E[Atualizar % executado<br/>conforme avanço da obra]:::ok
    E --> F[Gantt mostra:<br/>planejado x real x atraso]:::ok
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
</pre>`,v=`
<pre class="mermaid">
flowchart TD
    A[Abrir RDO concluído]:::start --> B[Seção Assinaturas]
    B --> C[+ Adicionar assinatura]:::start
    C --> D[Escolher papel<br/>encarregado / cliente / fiscal]
    D --> E[Desenhar no canvas<br/>com mouse ou dedo]
    E --> F[Salvar]:::ok
    F --> G[Aparece no PDF do RDO<br/>com data e papel]:::ok
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
</pre>`,k=`
<pre class="mermaid">
flowchart TD
    A[Cadastrar Item]:::start --> B[🟢 Comprei — entra no Central]:::ok
    B --> C[🔵 Enviar pra obra]:::start
    C --> D{Na obra...}
    D -- usou --> E[🔴 Usei — custo no contrato]:::bad
    D -- sobrou --> F[🟡 Voltou pro Central]:::warn
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
</pre>`,O=`
<pre class="mermaid">
flowchart TD
    A[Abrir Dashboard]:::start --> B[Botão Personalizar]
    B --> C[Modal com seções]
    C --> D[Marcar/desmarcar]
    D --> E[Salvar]:::ok
    E --> F[Cada usuário vê seu layout]:::ok
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
</pre>`,E=`
<pre class="mermaid">
erDiagram
    CONTRATO ||--o{ SAIDA          : "tem medições"
    CONTRATO ||--o{ NF             : "fatura"
    CONTRATO ||--o{ CONTA_A_PAGAR  : "rateia despesas"
    SAIDA    }o--|| NF             : "compõe BM"
    NF       ||--o{ CAIXA          : "vira entrada quando recebida"
    CONTA_A_PAGAR ||--o{ CAIXA     : "vira saída quando paga"
    FORNECEDOR ||--o{ CONTA_A_PAGAR : "cobra"
    CLIENTE  ||--o{ CONTRATO       : "é faturado em"
</pre>`,F=`
<pre class="mermaid">
journey
    title Mês operacional de um contrato típico
    section Dia-a-dia
      Lançar RDO em obras ativas: 5: Operador
      Encarregado assina RDO: 4: Encarregado
      Lançar contas a pagar: 4: Financeiro
    section Final do mês
      Consolidar saídas em BM: 5: Encarregado
      Emitir nota fiscal: 4: Financeiro
    section Recebimento
      Conciliar extrato bancário: 4: Financeiro
      Marcar entrada no caixa: 5: Financeiro
</pre>`,x=`
<pre class="mermaid">
gantt
    title Cronograma típico — obra de 6 meses
    dateFormat YYYY-MM-DD
    axisFormat %b/%y
    section Comercial
    Proposta enviada           :done,    p1, 2026-01-05, 10d
    Assinatura do contrato     :done,    p2, after p1, 5d
    section Execução
    Etapa 1 - Desmontagem      :         e1, 2026-02-03, 30d
    Etapa 2 - Estrutura        :         e2, after e1, 45d
    Etapa 3 - Acabamento       :         e3, after e2, 30d
    section Financeiro
    BM 1 + NF                  :crit,    f1, 2026-02-28, 3d
    BM 2 + NF                  :crit,    f2, 2026-03-31, 3d
    BM 3 + NF                  :crit,    f3, 2026-04-30, 3d
</pre>`,S=[{k:"inicio",icon:"🏠",label:"Início"},{k:"dashboard",icon:"📊",label:"Dashboard / Indicadores"},{k:"auth",icon:"🔐",label:"Login e Acesso"},{k:"contratos",icon:"📋",label:"Contratos"},{k:"cronograma",icon:"📅",label:"Cronograma / Gantt"},{k:"rdos",icon:"📝",label:"RDOs"},{k:"assinaturas",icon:"✍️",label:"Assinatura no RDO"},{k:"saidas-bm",icon:"🧾",label:"Saídas e BMs"},{k:"nfs",icon:"✅",label:"NFs / Faturamento"},{k:"contas-pg",icon:"💸",label:"Contas a Pagar"},{k:"caixa",icon:"💰",label:"Caixa"},{k:"recursos",icon:"👥",label:"Recursos e Folgas"},{k:"folha",icon:"💵",label:"Folha de Pagamento"},{k:"estoque",icon:"📦",label:"Almoxarifado / Estoque"},{k:"compras",icon:"🛒",label:"Solicitações de Compra"},{k:"manutencao",icon:"🔧",label:"Manutenção"},{k:"frota",icon:"🚚",label:"Frota"},{k:"conciliacao",icon:"🔁",label:"Conciliação Bancária"},{k:"previsao",icon:"📈",label:"Previsão de Caixa"},{k:"aichat",icon:"🤖",label:"Assistente IA"},{k:"cobranca",icon:"💳",label:"Cobrança do app"},{k:"aportes",icon:"⬆️",label:"Aportes / Investimentos"},{k:"base",icon:"🏢",label:"BASE"},{k:"usuarios",icon:"🛡️",label:"Usuários e Permissões"},{k:"personalizar",icon:"🎨",label:"Personalizar Dashboard"},{k:"glossario",icon:"📚",label:"Glossário"}],n={inicio:`
    <h1 class="man-h1">Bem-vindo ao Rhino</h1>
    <p class="man-p">Sistema de gestão para empresas de manutenção industrial. Gerencia contratos, equipe, medições, faturamento e fluxo de caixa.</p>
    <div class="man-grid">
      <div class="man-card"><h3>📋 Operação</h3><p>Cada <strong>contrato</strong> tem orçamento, equipe e RDOs diários. As <strong>medições mensais (BMs)</strong> viram NFs que entram no caixa quando emitidas.</p></div>
      <div class="man-card"><h3>👥 Pessoas</h3><p>Cadastre <strong>recursos</strong> com documentos e folgas. Aloque-os em contratos via organograma.</p></div>
      <div class="man-card"><h3>💰 Financeiro</h3><p>Lançamentos de <strong>caixa</strong>, <strong>contas a pagar</strong>, <strong>NFs/BMs</strong> e aportes de sócios — tudo amarrado por contrato.</p></div>
      <div class="man-card"><h3>📊 Visibilidade</h3><p>Dashboard com fluxo de caixa + projeção (30/60/90 dias), aderência de RDOs, contratos a vencer e contas atrasadas.</p></div>
    </div>
    <h2 class="man-h2">🧭 Como tudo se conecta</h2>
    <p class="man-p">O sistema gira em torno do <strong>contrato</strong>. Tudo o que acontece — saídas, NFs, contas, RDOs — é amarrado a ele.</p>
    ${E}
    <h2 class="man-h2">📅 O mês operacional típico</h2>
    ${F}
  `,dashboard:`
    <h1 class="man-h1">📊 Dashboard / Indicadores</h1>
    <p class="man-p">O Dashboard concentra os indicadores-chave da operação.</p>
    <h2 class="man-h2">💰 Saldo em caixa</h2>
    <p class="man-p">Σ(entradas) − Σ(saídas) sobre todos os lançamentos.</p>
    <h2 class="man-h2">📊 Margem média</h2>
    <p class="man-p"><strong>margem = (valor − saídas) ÷ valor × 100</strong>, média simples dos contratos ativos.</p>
    <h2 class="man-h2">📅 Aderência RDO</h2>
    <p class="man-p">% de RDOs lançados nos últimos N dias úteis (default 7).</p>
  `,auth:`
    <h1 class="man-h1">🔐 Login e Acesso</h1>
    <p class="man-p">Acesso por email + senha. Sessão dura 30 dias em cookie httpOnly.</p>
    ${f}
    <h2 class="man-h2">Criar usuários</h2>
    <ol class="man-ol">
      <li>Configuração → Usuários e Logins</li>
      <li>Botão "+ Novo Usuário" — email, senha (≥ 6 caracteres), nome, nível</li>
      <li>Permissões por nível: Configuração → Níveis de Acesso</li>
    </ol>
  `,contratos:`
    <h1 class="man-h1">📋 Contratos</h1>
    <p class="man-p">A entidade central. Tudo gira em torno do contrato.</p>
    <h2 class="man-h2">Estrutura</h2>
    <table class="man-table">
      <tr><th>Aba</th><th>O que contém</th></tr>
      <tr><td><strong>Visão Geral</strong></td><td>Resumo financeiro, prazo, status, orçamento</td></tr>
      <tr><td><strong>Financeiro</strong></td><td>Saídas/BMs, valor medido vs valor do contrato, margem</td></tr>
      <tr><td><strong>Equipe</strong></td><td>Organograma: encarregado, líderes, profissionais</td></tr>
      <tr><td><strong>RDO</strong></td><td>Relatórios diários de obra</td></tr>
    </table>
    <h2 class="man-h2">Fluxo recomendado</h2>
    <ol class="man-ol">
      <li>Cadastre o cliente (Clientes)</li>
      <li>Crie o contrato com valor e prazo</li>
      <li>Adicione orçamento + organograma</li>
      <li>Lance RDOs diariamente em dias úteis</li>
      <li>No final do mês, lance saídas (BMs) que viram NFs</li>
    </ol>
  `,cronograma:`
    <h1 class="man-h1">📅 Cronograma físico-financeiro</h1>
    <p class="man-p">Planejamento de etapas com peso, datas, custo e % executado. Aba dentro de cada contrato.</p>
    <h2 class="man-h2">Exemplo</h2>
    ${x}
    <h2 class="man-h2">Como construir</h2>
    ${D}
    <h2 class="man-h2">Conceitos</h2>
    <ul class="man-ul">
      <li><strong>Peso %</strong> — soma das etapas deve dar 100%</li>
      <li><strong>% Executado</strong> — 0 a 100, atualizado pela engenharia</li>
      <li><strong>Avanço físico ponderado</strong> — Σ(peso × execução) ÷ 100</li>
    </ul>
  `,rdos:`
    <h1 class="man-h1">📝 RDO — Relatório Diário de Obra</h1>
    <p class="man-p">Obrigatório em dias úteis para todo contrato ativo.</p>
    ${A}
    <h2 class="man-h2">O que entra num RDO</h2>
    <ul class="man-ul">
      <li><strong>MOI</strong> — encarregado, técnicos</li>
      <li><strong>MOD</strong> — mecânicos, soldadores, eletricistas</li>
      <li><strong>Terceiros</strong> — subcontratados</li>
      <li><strong>Equipamentos</strong> — munck, andaime, gerador (com horas)</li>
      <li><strong>Atividades</strong> — descrição + % executado</li>
      <li><strong>Tempo</strong>, <strong>Segurança</strong>, <strong>Fotos</strong></li>
    </ul>
  `,assinaturas:`
    <h1 class="man-h1">✍️ Assinatura digital no RDO</h1>
    <p class="man-p">Encarregado, cliente e fiscal podem assinar o RDO direto no celular ou tablet.</p>
    ${v}
    <h2 class="man-h2">Por que usar</h2>
    <ul class="man-ul">
      <li>Comprovação legal de quem aprovou cada dia</li>
      <li>Engajamento do fiscal</li>
      <li>Substitui assinatura em papel</li>
    </ul>
  `,"saidas-bm":`
    <h1 class="man-h1">🧾 Saídas e BMs</h1>
    <p class="man-p"><strong>Saída</strong> é uma medição parcial no contrato. O sistema agrupa em uma <strong>NF/BM</strong> (Boletim de Medição).</p>
    ${u}
    <h2 class="man-h2">Regras</h2>
    <ul class="man-ul">
      <li>Saída precisa de valor + data + tipo</li>
      <li>Sistema busca NF do mesmo dia (não emitida) — soma; senão cria nova</li>
      <li>Soma de saídas não pode ultrapassar o valor do contrato</li>
    </ul>
  `,nfs:`
    <h1 class="man-h1">✅ NFs e Faturamento</h1>
    <p class="man-p">As NFs (BMs) são geradas automaticamente pelas saídas.</p>
    ${h}
    <h2 class="man-h2">Estados de uma NF</h2>
    <table class="man-table">
      <tr><th>Status</th><th>Descrição</th></tr>
      <tr><td>Pendente</td><td>BM criado, aguardando emissão fiscal</td></tr>
      <tr><td>Vencida</td><td>Pendente cuja data limite já passou</td></tr>
      <tr><td>Emitida</td><td>NF lançada, entrada de caixa agendada</td></tr>
    </table>
  `,"contas-pg":`
    <h1 class="man-h1">💸 Contas a Pagar</h1>
    <p class="man-p">Despesas com fornecedor. Pode estar vinculada a contrato (reduz margem).</p>
    ${g}
    <h2 class="man-h2">Como funciona</h2>
    <ol class="man-ol">
      <li>Crie a conta (descrição, fornecedor, valor, vencimento)</li>
      <li>Status inicial: Pendente</li>
      <li>Ao pagar: data/valor/forma — cria saída no caixa</li>
      <li>Estornar volta para Pendente</li>
    </ol>
  `,caixa:`
    <h1 class="man-h1">💰 Caixa</h1>
    <p class="man-p">Livro-caixa unificado. Todas as entradas e saídas passam aqui.</p>
    <h2 class="man-h2">Origens</h2>
    <table class="man-table">
      <tr><th>Origem</th><th>Quando</th></tr>
      <tr><td>NF emitida</td><td>Em data_emissão + prazo_recebimento</td></tr>
      <tr><td>Conta paga</td><td>Saída na data informada</td></tr>
      <tr><td>Aporte (caixa)</td><td>Saída automática</td></tr>
      <tr><td>Manual</td><td>Lançamento direto</td></tr>
    </table>
  `,recursos:`
    <h1 class="man-h1">👥 Recursos, Folgas e Passagens</h1>
    <p class="man-p">Recurso = colaborador. Status candidato → funcionário → desligado.</p>
    <h2 class="man-h2">Cadastro</h2>
    <ul class="man-ul">
      <li>Dados pessoais, trabalhistas, documentos com validade</li>
      <li>Folgas + passagens (ida/volta)</li>
      <li>Alocação: contrato + data início + ciclo (15/21/28 dias)</li>
    </ul>
    ${b}
  `,folha:`
    <h1 class="man-h1">💵 Folha de Pagamento</h1>
    <p class="man-p">Controle mensal do pagamento dos colaboradores: salário, vale e lançamentos.</p>
    <h2 class="man-h2">Como funciona</h2>
    <ol class="man-ol">
      <li>Clique em "Gerar folha" — sistema cria linha por colaborador ativo</li>
      <li><strong>Vale</strong>: adiantamento 40% no dia 20</li>
      <li><strong>Saldo</strong>: 60% no 5º dia útil do mês seguinte</li>
      <li>Lançamentos: descontos (INSS, faltas) e proventos (HE, VA)</li>
      <li>Líquido recalculado vira lançamentos em Contas a Pagar</li>
    </ol>
  `,estoque:`
    <h1 class="man-h1">📦 Almoxarifado / Estoque</h1>
    <p class="man-p">Almox Central + Almox de Obra (criado automaticamente).</p>
    ${k}
    <h2 class="man-h2">Os 4 botões principais</h2>
    <ul class="man-ul">
      <li>🟢 <strong>Comprei</strong> — mercadoria entra no Central, pede custo unitário</li>
      <li>🔵 <strong>Enviar pra obra</strong> — Central → Almox da Obra</li>
      <li>🔴 <strong>Usei na obra</strong> — lança o custo no contrato</li>
      <li>🟡 <strong>Voltou da obra</strong> — devolve ao Central</li>
    </ul>
    <h2 class="man-h2">Custo médio ponderado (CMV)</h2>
    <p class="man-p">A cada compra: <strong>(saldo·custo + qtd·custo_novo) ÷ total</strong>.</p>
  `,compras:`
    <h1 class="man-h1">🛒 Solicitações de Compra</h1>
    <p class="man-p">Pedido de materiais/equipamentos da solicitação ao recebimento.</p>
    <h2 class="man-h2">Etapas</h2>
    <ol class="man-ol">
      <li><strong>Solicitar</strong> — itens, destino, justificativa</li>
      <li><strong>Avaliar</strong> — cotações, fornecedor</li>
      <li><strong>Aprovar</strong> — gerência aprova o valor</li>
      <li><strong>Receber</strong> — gera estoque + conta a pagar</li>
    </ol>
  `,manutencao:`
    <h1 class="man-h1">🔧 Manutenção de Equipamentos</h1>
    <p class="man-p">Equipamentos enviados para reparo — fluxo similar ao de Solicitação de Compra.</p>
    <h2 class="man-h2">Etapas</h2>
    <ol class="man-ol">
      <li><strong>Solicitar</strong> — equipamento + defeito</li>
      <li><strong>Avaliar</strong> — oficina, prazo, custo estimado</li>
      <li><strong>Aprovar</strong> — gerência</li>
      <li><strong>Registrar retorno</strong> — data e custo final</li>
    </ol>
  `,frota:`
    <h1 class="man-h1">🚚 Frota</h1>
    <p class="man-p">Cadastro e acompanhamento dos veículos.</p>
    <ul class="man-ul">
      <li><strong>+ Novo Veículo</strong> — placa, modelo, dados</li>
      <li>Atualizar quilometragem e localização</li>
      <li>Planos de manutenção preventiva (por km ou período)</li>
      <li>Histórico de manutenções feitas</li>
    </ul>
  `,conciliacao:`
    <h1 class="man-h1">🔁 Conciliação Bancária</h1>
    <p class="man-p">Importe o extrato do banco e cruze com as contas a pagar.</p>
    <ol class="man-ol">
      <li>Exporte o extrato em OFX ou CSV</li>
      <li>Importe na tela de Conciliação</li>
      <li>Sistema sugere correspondências</li>
      <li>Confirme os pares para reconciliar</li>
    </ol>
  `,previsao:`
    <h1 class="man-h1">📈 Previsão de Caixa</h1>
    <p class="man-p">Projeta o saldo nos próximos 30/60/90/180 dias.</p>
    <h2 class="man-h2">O que entra</h2>
    <ul class="man-ul">
      <li>Entradas — NFs emitidas a receber</li>
      <li>Saídas — contas a pagar</li>
      <li>Recorrências — lançamentos que se repetem</li>
    </ul>
    <p class="man-p">Alerta quando o caixa fica negativo no período.</p>
  `,aichat:`
    <h1 class="man-h1">🤖 Assistente IA</h1>
    <p class="man-p">Perguntas sobre os dados em linguagem natural.</p>
    <h2 class="man-h2">Exemplos</h2>
    <ul class="man-ul">
      <li>"Qual o saldo de caixa hoje?"</li>
      <li>"Quais contas vencem essa semana?"</li>
      <li>"Quanto foi faturado no último mês?"</li>
    </ul>
  `,cobranca:`
    <h1 class="man-h1">💳 Cobrança do app</h1>
    <p class="man-p">Valor mensal do Rhino (assinatura do sistema). Apenas administradores enxergam.</p>
  `,aportes:`
    <h1 class="man-h1">⬆️ Aportes / Investimentos</h1>
    <p class="man-p">Aportes capitalizam contratos ou a BASE da empresa.</p>
    ${C}
    <h2 class="man-h2">Combinações</h2>
    <table class="man-table">
      <tr><th>Origem × Destino</th><th>Efeito</th></tr>
      <tr><td>Sócio → Contrato</td><td>Capital no contrato (sem mexer no caixa)</td></tr>
      <tr><td>Sócio → BASE</td><td>Sócio compra item da base (rastreável)</td></tr>
      <tr><td>Caixa → Contrato</td><td>Empresa transfere capital (cria saída)</td></tr>
    </table>
  `,base:`
    <h1 class="man-h1">🏢 BASE — Custos Administrativos</h1>
    <p class="man-p">Catálogo de custos fixos/variáveis. Podem ser alocados parcialmente a um contrato.</p>
    <h2 class="man-h2">Alocação</h2>
    <ol class="man-ol">
      <li>Cada item tem um valor mensal</li>
      <li>Aloque parcelas para contratos</li>
      <li>Total alocado ≤ valor do item</li>
      <li>Cada alocação cria saída no caixa (category = base)</li>
    </ol>
  `,usuarios:`
    <h1 class="man-h1">🛡️ Usuários e Níveis de Acesso</h1>
    <p class="man-p">Cada usuário recebe um nível que define quais telas vê.</p>
    <h2 class="man-h2">Matriz de Níveis</h2>
    <ul class="man-ul">
      <li><strong>Ver</strong> — a tela aparece no menu</li>
      <li><strong>Ed.</strong> — pode criar/editar/excluir</li>
      <li>Sub-permissões (abas internas) têm um único interruptor</li>
    </ul>
  `,personalizar:`
    <h1 class="man-h1">🎨 Personalizar Dashboard</h1>
    <p class="man-p">Cada usuário escolhe quais seções aparecem no seu dashboard.</p>
    ${O}
    <h2 class="man-h2">Como personalizar</h2>
    <ol class="man-ol">
      <li>Vá no Dashboard</li>
      <li>Botão 🎨 Personalizar</li>
      <li>Marque/desmarque as seções</li>
      <li>Salve</li>
    </ol>
  `,glossario:`
    <h1 class="man-h1">📚 Glossário</h1>
    <table class="man-table">
      <tr><th>Termo</th><th>Significado</th></tr>
      <tr><td><strong>BM</strong></td><td>Boletim de Medição — NF gerada pelas saídas</td></tr>
      <tr><td><strong>MOI</strong></td><td>Mão de Obra Indireta</td></tr>
      <tr><td><strong>MOD</strong></td><td>Mão de Obra Direta</td></tr>
      <tr><td><strong>RDO</strong></td><td>Relatório Diário de Obra</td></tr>
      <tr><td><strong>Aderência</strong></td><td>RDOs feitos ÷ esperados nos últimos N dias úteis</td></tr>
      <tr><td><strong>Margem</strong></td><td>Valor do contrato − total medido nas saídas</td></tr>
      <tr><td><strong>BASE</strong></td><td>Catálogo de custos administrativos</td></tr>
      <tr><td><strong>Organograma</strong></td><td>Estrutura hierárquica da equipe num contrato</td></tr>
      <tr><td><strong>Ciclo</strong></td><td>Dias trabalhados antes de uma folga (15/21/28)</td></tr>
      <tr><td><strong>ASO</strong></td><td>Atestado de Saúde Ocupacional</td></tr>
      <tr><td><strong>ART</strong></td><td>Anotação de Responsabilidade Técnica</td></tr>
    </table>
  `};function N(){const[s,c]=i.useState("inicio"),r=i.useRef(null);i.useEffect(()=>{let o=!1;return(async()=>{if(r.current)try{const m=(await p(async()=>{const{default:t}=await import("./mermaid.core-DKDTiW_k.js").then(l=>l.aH);return{default:t}},__vite__mapDeps([0,1,2,3]))).default;if(o)return;const e=r.current.querySelectorAll("pre.mermaid:not([data-processed])");if(e.length===0)return;e.forEach((t,l)=>{t.id=`mmd-${s}-${l}-${Date.now()}`,t.removeAttribute("data-processed")}),await m.run({nodes:e})}catch{}})(),()=>{o=!0}},[s]);const d=n[s]??n.inicio;return a.jsxs("div",{className:"man-root",children:[a.jsx("div",{className:"page-header",children:a.jsxs("div",{children:[a.jsx("h1",{className:"page-title",children:"📖 Manual do Usuário"}),a.jsx("p",{className:"page-subtitle",children:"Guia completo do sistema com fluxogramas"})]})}),a.jsxs("div",{className:"man-layout",children:[a.jsx("div",{className:"man-menu",children:S.map(o=>a.jsxs("button",{type:"button",className:`man-menu-item${s===o.k?" active":""}`,onClick:()=>c(o.k),children:[a.jsx("span",{children:o.icon}),a.jsx("span",{children:o.label})]},o.k))}),a.jsx("div",{ref:r,className:"man-content",dangerouslySetInnerHTML:{__html:d}})]})]})}export{N as default};
//# sourceMappingURL=Manual-BzfysAAU.js.map
