// Manual do Usuário — versão 3.1 com diagramas Mermaid (declarativos, sempre alinhados).
// Tipos usados: flowchart (operações), erDiagram (modelo de dados), journey (UX de processos),
// gantt (cronograma). Todos renderizados pelo mesmo runner em _renderMermaid().
window.Manual = {
  _secao: 'inicio',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = this._buildHtml();
    this._attachListeners();
    this._renderMermaid();
  },

  // Renderiza qualquer .mermaid recém-inserido no DOM.
  // Cada bloco recebe ID único pra evitar colisão entre re-renderizações.
  async _renderMermaid() {
    if (!window.mermaid) {
      try { await window.RhinoLazy.ensure('mermaid'); }
      catch { console.warn('[Manual] falha ao carregar mermaid'); return; }
    }
    try {
      const blocks = document.querySelectorAll('.mermaid:not([data-processed])');
      blocks.forEach((el, i) => {
        el.id = `mmd-${this._secao}-${i}-${Date.now()}`;
        el.removeAttribute('data-processed');
      });
      await window.mermaid.run({ nodes: blocks });
    } catch (e) {
      console.warn('[Manual] erro ao renderizar mermaid:', e.message);
    }
  },

  // ═════════════ Fluxogramas (Mermaid) ═════════════
  // Convenções de classe:
  //   start  — caixa azul (ponto de entrada)
  //   ok     — caixa verde (estado positivo / sucesso)
  //   warn   — caixa amarela (atenção / opcional)
  //   bad    — caixa vermelha (erro / negativo)
  //   note   — caixa cinza (anotação)

  _flowAuth() {
    return `
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
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  _flowSaida() {
    return `
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
</pre>`;
  },

  _flowNF() {
    return `
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
</pre>`;
  },

  _flowContaPagar() {
    return `
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
</pre>`;
  },

  _flowFolga() {
    return `
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
</pre>`;
  },

  _flowAporte() {
    return `
<pre class="mermaid">
flowchart TD
    A[Aporte criado]:::start --> B{Origem?}
    B -- sócio --> C{Destino?}
    B -- caixa --> C
    C -- sócio --> D[Histórico de aportes<br/>sem caixa]
    C -- caixa --> E[Saída contábil<br/>automática no caixa]:::bad
    C -- contrato --> F[Marca contractId<br/>não cria item BASE]
    C -- BASE --> G[Cria item BASE<br/>rastreável]:::ok
    D --> Z[Aporte preserva referências:<br/>caixaEntryId, baseItemId, contractId]:::note
    E --> Z
    F --> Z
    G --> Z
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  _flowRDO() {
    return `
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
</pre>`;
  },

  // ═════════════ Conteúdo ═════════════
  _secoes() {
    return [
      { k: 'inicio',     icon: '🏠', label: 'Início', },
      { k: 'dashboard',  icon: '📊', label: 'Dashboard / Indicadores' },
      { k: 'auth',       icon: '🔐', label: 'Login e Acesso' },
      { k: 'contratos',  icon: '📋', label: 'Contratos' },
      { k: 'cronograma', icon: '📅', label: 'Cronograma / Gantt' },
      { k: 'rdos',       icon: '📝', label: 'RDOs' },
      { k: 'assinaturas',icon: '✍️', label: 'Assinatura no RDO' },
      { k: 'saidas-bm',  icon: '🧾', label: 'Saídas e BMs' },
      { k: 'nfs',        icon: '✅', label: 'NFs / Faturamento' },
      { k: 'contas-pg',  icon: '💸', label: 'Contas a Pagar' },
      { k: 'caixa',      icon: '💰', label: 'Caixa' },
      { k: 'recursos',   icon: '👥', label: 'Recursos e Folgas' },
      { k: 'folha',      icon: '💵', label: 'Folha de Pagamento' },
      { k: 'estoque',    icon: '📦', label: 'Almoxarifado / Estoque' },
      { k: 'compras',    icon: '🛒', label: 'Solicitações de Compra' },
      { k: 'manutencao', icon: '🔧', label: 'Manutenção' },
      { k: 'aportes',    icon: '⬆️', label: 'Aportes / Investimentos' },
      { k: 'base',       icon: '🏢', label: 'BASE' },
      { k: 'usuarios',   icon: '🛡️', label: 'Usuários e Permissões' },
      { k: 'personalizar',icon: '🎨', label: 'Personalizar Dashboard' },
      { k: 'glossario',  icon: '📚', label: 'Glossário' },
    ];
  },

  // ═════════════ Fluxogramas das novas features ═════════════
  _flowCronograma() {
    return `
<pre class="mermaid">
flowchart TD
    A[Abrir Contrato]:::start --> B[Aba Cronograma]
    B --> C[Adicionar etapa]:::start
    C --> D[Definir nome, datas plan,<br/>peso % e custo planejado]
    D --> E[Atualizar % executado<br/>conforme avanço da obra]:::ok
    E --> F[Gantt mostra:<br/>planejado x real x atraso]:::ok
    F --> G[Soma de pesos das etapas<br/>deve fechar 100%]:::note
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  _flowAssinatura() {
    return `
<pre class="mermaid">
flowchart TD
    A[Abrir RDO concluído]:::start --> B[Seção Assinaturas]
    B --> C[+ Adicionar assinatura]:::start
    C --> D[Escolher papel<br/>encarregado / cliente / fiscal]
    D --> E[Informar nome<br/>de quem assina]
    E --> F[Desenhar no canvas<br/>com mouse ou dedo]
    F --> G[Salvar]:::ok
    G --> H[PNG armazenado no banco<br/>BYTEA, sem disco externo]:::note
    H --> I[Aparece no PDF do RDO<br/>com data e papel]:::ok
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  _flowEstoque() {
    return `
<pre class="mermaid">
flowchart TD
    A[Cadastrar Item<br/>código, descrição, unidade]:::start --> B[🟢 Comprei / Recebi<br/>Mercadoria entra no Central]:::ok
    B --> C[🔵 Enviar pra obra<br/>Central → Almox da Obra]:::start
    C --> D{O que aconteceu<br/>na obra?}
    D -- usou --> E[🔴 Usei na obra<br/>Saída + custo no contrato]:::bad
    D -- sobrou --> F[🟡 Voltou da obra<br/>Almox da Obra → Central]:::warn
    F --> C
    G[🟠 Corrigir saldo<br/>contagem / perda / quebra]:::warn -.-> H[Saldo atualizado]:::ok
    E --> H
    H --> I[Alerta vermelho<br/>se < estoque mínimo]:::bad

    Z[💡 Almox Central e<br/>Almox de Obra são criados<br/>automaticamente pelo sistema]:::note

    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef warn  fill:#92400e,stroke:#f59e0b,color:#fff;
    classDef bad   fill:#7f1d1d,stroke:#dc2626,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  _flowPersonalizar() {
    return `
<pre class="mermaid">
flowchart TD
    A[Abrir Dashboard]:::start --> B[Botão Personalizar<br/>no canto superior direito]
    B --> C[Modal com lista de seções]
    C --> D[Marcar/desmarcar<br/>seções desejadas]
    D --> E[Salvar]:::ok
    E --> F[Preferência salva por usuário<br/>banco + localStorage]:::ok
    F --> G[Cada usuário vê<br/>seu próprio dashboard]:::note
    classDef start fill:#1d4ed8,stroke:#3b82f6,color:#fff,font-weight:bold;
    classDef ok    fill:#065f46,stroke:#10b981,color:#fff;
    classDef note  fill:#1e293b,stroke:#475569,color:#cbd5e1,font-style:italic;
</pre>`;
  },

  // ═════════════ Diagramas de panorama (overview) ═════════════

  // Journey do mês operacional — mostra quem faz o quê e quando.
  // Os números são satisfação (1=ruim, 5=ótimo) — útil pra identificar
  // pontos de fricção que vale a pena automatizar/treinar.
  _journeyMes() {
    return `
<pre class="mermaid">
journey
    title Mês operacional de um contrato típico
    section Dia-a-dia
      Lançar RDO em obras ativas: 5: Operador
      Encarregado assina RDO: 4: Encarregado
      Cliente/fiscal assina no app: 4: Cliente
      Lançar contas a pagar: 4: Financeiro
    section Final do mês
      Consolidar saídas em BM: 5: Encarregado
      Emitir nota fiscal: 4: Financeiro
      Enviar BM ao cliente: 3: Comercial
    section Recebimento
      Conciliar extrato bancário: 4: Financeiro
      Marcar entrada no caixa: 5: Financeiro
      Saldo atualiza no Dashboard: 5: Diretoria
</pre>`;
  },

  // ER simplificado do núcleo financeiro — ajuda novo usuário a entender
  // como Saída, BM, NF e Caixa se conectam. Não tem campo de tabela, é
  // só pra mostrar o "esqueleto" das relações.
  _erFinanceiro() {
    return `
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
</pre>`;
  },

  // Gantt típico de uma obra de 6 meses — dá expectativa de prazo
  // pro usuário entender em que fase do ciclo ele está.
  _ganttObra() {
    return `
<pre class="mermaid">
gantt
    title Cronograma típico — obra de 6 meses
    dateFormat YYYY-MM-DD
    axisFormat %b/%y

    section Comercial
    Proposta enviada           :done,    p1, 2026-01-05, 10d
    Assinatura do contrato     :done,    p2, after p1, 5d

    section Mobilização
    Organograma + ARTs         :active,  m1, 2026-01-22, 7d
    Almoxarifado de obra       :         m2, after m1, 5d

    section Execução
    Etapa 1 - Desmontagem      :         e1, 2026-02-03, 30d
    Etapa 2 - Estrutura        :         e2, after e1, 45d
    Etapa 3 - Acabamento       :         e3, after e2, 30d

    section Financeiro
    BM 1 + NF                  :crit,    f1, 2026-02-28, 3d
    BM 2 + NF                  :crit,    f2, 2026-03-31, 3d
    BM 3 + NF                  :crit,    f3, 2026-04-30, 3d
    Recebimento (prazo 30d)    :         f4, after f3, 30d

    section Encerramento
    Comissionamento + TR       :         z1, after e3, 7d
    Encerramento contratual    :milestone, z2, after z1, 0d
</pre>`;
  },

  _conteudo() {
    return {
      inicio: `
        <h1 class="man-h1">Bem-vindo ao Rhino</h1>
        <p class="man-p">Sistema de gestão para empresas de manutenção industrial. Gerencia contratos, equipe, medições, faturamento e fluxo de caixa.</p>

        <div class="man-grid">
          <div class="man-card">
            <h3>📋 Operação</h3>
            <p>Cada <strong>contrato</strong> tem orçamento, equipe (organograma) e RDOs diários. As <strong>medições mensais (BMs)</strong> viram NFs que entram no caixa quando emitidas.</p>
          </div>
          <div class="man-card">
            <h3>👥 Pessoas</h3>
            <p>Cadastre <strong>recursos</strong> (colaboradores) com documentos e folgas. Aloque-os em contratos via organograma.</p>
          </div>
          <div class="man-card">
            <h3>💰 Financeiro</h3>
            <p>Lançamentos de <strong>caixa</strong>, <strong>contas a pagar</strong> (com pagar/estornar), <strong>NFs/BMs</strong> e aportes de sócios. Tudo amarrado por contrato.</p>
          </div>
          <div class="man-card">
            <h3>📊 Visibilidade</h3>
            <p>Dashboard com fluxo de caixa real + projeção (30/60/90 dias), aderência de RDOs, contratos a vencer e contas atrasadas.</p>
          </div>
        </div>

        <div class="man-tip">
          <strong>Atalho rápido:</strong> use o menu lateral (esquerda) ou os ícones nas seções para navegar. Cada tela tem botões "+ Novo" no canto superior direito.
        </div>

        <h2 class="man-h2">🧭 Como tudo se conecta</h2>
        <p class="man-p">O sistema gira em torno do <strong>contrato</strong>. Tudo o que acontece — saídas, NFs, contas, RDOs — é amarrado a ele. O esquema abaixo mostra o esqueleto do fluxo financeiro:</p>
        ${this._erFinanceiro()}

        <h2 class="man-h2">📅 O mês operacional típico</h2>
        <p class="man-p">Quem faz o quê, e quando. Use isso pra mapear sua rotina nas funcionalidades do sistema:</p>
        ${this._journeyMes()}
      `,

      dashboard: `
        <h1 class="man-h1">📊 Dashboard / Indicadores</h1>
        <p class="man-p">O Dashboard concentra os indicadores-chave da operação. Cada card mostra um valor atual + variação + mini-gráfico dos últimos 45 dias. Abaixo está como cada indicador é calculado.</p>

        <h2 class="man-h2">🎯 Score de saúde financeira (0–100)</h2>
        <p class="man-p">Pontuação consolidada da saúde do negócio. Começa em <strong>100 pontos</strong> e perde pontos conforme indicadores entram em zona de risco:</p>
        <table class="man-table">
          <thead><tr><th>Condição</th><th>Penalidade</th></tr></thead>
          <tbody>
            <tr><td>Taxa de despesa &gt; 80%</td><td>−40 pontos</td></tr>
            <tr><td>Taxa de despesa entre 60% e 80%</td><td>−20 pontos</td></tr>
            <tr><td>Margem média negativa (&lt; 0%)</td><td>−30 pontos</td></tr>
            <tr><td>Margem média entre 0% e 10%</td><td>−15 pontos</td></tr>
            <tr><td>Saldo em caixa negativo</td><td>−20 pontos</td></tr>
          </tbody>
        </table>
        <p class="man-p">Classificação por faixa:</p>
        <ul class="man-ol">
          <li><strong style="color:#16A34A;">Saudável (≥ 80)</strong> — operação no azul, margens confortáveis</li>
          <li><strong style="color:#D97706;">Atenção (60–79)</strong> — algum indicador em alerta, monitorar</li>
          <li><strong style="color:#DC2626;">Crítico (&lt; 60)</strong> — múltiplos sinais de risco simultâneos</li>
        </ul>
        <p class="man-p">As 3 barras abaixo do score quebram o cálculo:</p>
        <ul class="man-ol">
          <li><strong>Margem operacional</strong> — média da margem dos contratos ativos (mesmo cálculo de "Margem média" abaixo)</li>
          <li><strong>Taxa de despesa</strong> — total de saídas dos contratos ÷ valor total contratado, em %</li>
          <li><strong>Cobertura de caixa</strong> — quantos meses o saldo atual cobre, dado o gasto médio mensal dos últimos 90 dias. Indicador de runway.</li>
        </ul>

        <h2 class="man-h2">💰 Saldo em caixa</h2>
        <p class="man-p">Soma de todos os lançamentos de caixa: <code>Σ(entradas) − Σ(saídas)</code>. Independe do mês — é o saldo bruto histórico até hoje. Mini-gráfico mostra o saldo acumulado dia a dia nos últimos 45 dias.</p>

        <h2 class="man-h2">📥 A receber (NFs)</h2>
        <p class="man-p">Soma do valor das NFs <strong>já emitidas mas ainda não recebidas</strong> (sem entrada no caixa associada). Mostra também a contagem: <em>X emitidas · Y pendentes</em> (pendentes = ainda não emitidas mas cadastradas).</p>

        <h2 class="man-h2">📤 A pagar (30d)</h2>
        <p class="man-p">Soma das contas a pagar pendentes que vencem nos <strong>próximos 30 dias</strong>. Inclui contas vencidas que ainda não foram pagas.</p>

        <h2 class="man-h2">📈 Faturado (mês)</h2>
        <p class="man-p">Soma das <strong>entradas de caixa</strong> (type='entrada') do mês corrente. Compara com o mês anterior em % (Δ vs mês ant.). Mini-gráfico mostra o faturamento diário.</p>

        <h2 class="man-h2">📊 Margem média</h2>
        <p class="man-p">Calculada para cada contrato ativo:</p>
        <pre class="man-code">margem do contrato = (valor do contrato − total de saídas do contrato) ÷ valor do contrato × 100</pre>
        <p class="man-p">A "margem média" exibida é a <strong>média aritmética simples</strong> das margens de todos os contratos ativos. Por isso um contrato pequeno com margem alta tem o mesmo peso que um grande com margem baixa — fique atento à composição.</p>
        <p class="man-p">Faixas:</p>
        <ul class="man-ol">
          <li><strong style="color:#16A34A;">&gt; 20%</strong> — margem saudável (verde)</li>
          <li><strong style="color:#D97706;">0% a 20%</strong> — margem apertada (amarelo)</li>
          <li><strong style="color:#DC2626;">&lt; 0%</strong> — operação no prejuízo (vermelho)</li>
        </ul>

        <h2 class="man-h2">⬆️ Aportes acumulados</h2>
        <p class="man-p">Soma de todos os aportes lançados em <strong>Sócios + Investimentos</strong> com origem da empresa. Reflete o capital próprio injetado historicamente.</p>

        <h2 class="man-h2">📅 Aderência RDO</h2>
        <p class="man-p">Percentual de RDOs lançados nos últimos N dias úteis (default 7 dias). Calculado como:</p>
        <pre class="man-code">aderência = RDOs lançados ÷ (obras ativas × dias úteis avaliados) × 100</pre>
        <p class="man-p">Card lateral mostra:</p>
        <ul class="man-ol">
          <li><strong>Lançados ontem (X / Y)</strong> — quantas obras ativas tiveram RDO no último dia útil, sobre o total esperado</li>
          <li><strong>Sem RDO ontem</strong> — obras ativas sem RDO no último dia útil</li>
          <li><strong>Atrasados &gt; 2du</strong> — obras com mais de 2 dias úteis sem RDO (prioridade alta para cobrança)</li>
        </ul>

        <h2 class="man-h2">🔄 Pipeline de medições</h2>
        <p class="man-p">Funil das saídas (BMs) do mês corrente, do trabalho executado ao recebimento financeiro:</p>
        <ol class="man-ol">
          <li><strong>Rascunho</strong> — saída cadastrada sem NF vinculada</li>
          <li><strong>Aguard. emissão</strong> — saída com NF mas NF ainda não emitida (atenção: bloqueia o recebimento)</li>
          <li><strong>NF emitida</strong> — NF emitida mas pagamento ainda não caiu no caixa</li>
          <li><strong>Recebida</strong> — pagamento entrou no caixa (caixa entry vinculada à NF)</li>
        </ol>

        <h2 class="man-h2">📉 Mini-gráficos (sparklines)</h2>
        <p class="man-p">Cada KPI exibe um mini-gráfico SVG dos <strong>últimos 45 dias</strong>. A cor segue o tom do indicador (verde/amarelo/vermelho). Não tem eixos nem números — é leitura visual rápida da tendência.</p>

        <div class="man-tip">
          <strong>Dica:</strong> clique em qualquer KPI para ir direto à página relacionada (saldo → caixa, NFs → notas-fiscais, etc).
        </div>
      `,

      auth: `
        <h1 class="man-h1">🔐 Login e Acesso</h1>
        <p class="man-p">Acesso é controlado por <strong>email + senha</strong>. Sessão dura 30 dias e fica em cookie httpOnly. Cada usuário tem um <strong>nível de acesso</strong> que define quais abas ele vê.</p>

        ${this._flowAuth()}

        <h2 class="man-h2">Como criar usuários</h2>
        <ol class="man-ol">
          <li>Configuração → <strong>Usuários e Logins</strong> (ou diretamente em "Usuários" no sidebar)</li>
          <li>Botão "+ Novo Usuário"</li>
          <li>Preencha email, senha (mínimo 6 caracteres), nome e <strong>escolha um nível de acesso</strong></li>
          <li>Para alterar permissões de um nível: Configuração → Níveis de Acesso → marque/desmarque as abas</li>
        </ol>

        <div class="man-warn">
          <strong>Importante:</strong> usuário com nível atrelado vê apenas as abas daquele nível. Sem nível = admin (vê tudo). Não é possível deletar a si mesmo.
        </div>
      `,

      contratos: `
        <h1 class="man-h1">📋 Contratos</h1>
        <p class="man-p">A entidade central. Tudo gira em torno do contrato: orçamento, equipe (organograma), medições/saídas, RDOs, faturamento.</p>

        <h2 class="man-h2">Estrutura de um contrato</h2>
        <table class="man-table">
          <tr><th>Aba</th><th>O que contém</th></tr>
          <tr><td><strong>Visão Geral</strong></td><td>Resumo financeiro, prazo, status, orçamento</td></tr>
          <tr><td><strong>Financeiro</strong></td><td>Saídas/medições mensais (BMs), valor medido vs valor do contrato, margem</td></tr>
          <tr><td><strong>Equipe</strong></td><td>Organograma: 1 encarregado, líderes de área, profissionais</td></tr>
          <tr><td><strong>RDO</strong></td><td>Relatórios diários de obra (MOI, MOD, equipamentos, atividades, fotos)</td></tr>
          <tr><td><strong>Pendências</strong></td><td>Passagens compradas/pendentes, alertas de prazo, vencimentos</td></tr>
        </table>

        <h2 class="man-h2">Fluxo recomendado</h2>
        <ol class="man-ol">
          <li>Cadastre o <strong>cliente</strong> primeiro (RH → Clientes)</li>
          <li>Crie o contrato vinculando ao cliente, com valor, prazo e status</li>
          <li>Adicione itens de <strong>orçamento</strong> (até o valor do contrato)</li>
          <li>Monte o <strong>organograma</strong> com encarregado + líderes + profissionais</li>
          <li>RDOs são lançados <strong>diariamente</strong> em dias úteis</li>
          <li>No final de cada mês, lance <strong>saídas (BMs)</strong> que viram NFs</li>
        </ol>

        <div class="man-tip">
          <strong>Visão rápida:</strong> na tela "Contratos", clique numa linha para ver o resumo. Use "Ver detalhes →" para abrir a tela completa.
        </div>
      `,

      rdos: `
        <h1 class="man-h1">📝 RDOs — Relatório Diário de Obra</h1>
        <p class="man-p">Documento obrigatório <strong>em dias úteis</strong> para todo contrato ativo. Sábado/domingo/feriado é opcional.</p>

        ${this._flowRDO()}

        <h2 class="man-h2">O que entra num RDO</h2>
        <ul class="man-ul">
          <li><strong>MOI</strong> (Mão de Obra Indireta): encarregado, técnicos</li>
          <li><strong>MOD</strong> (Mão de Obra Direta): mecânicos, soldadores, eletricistas</li>
          <li><strong>Terceiros</strong>: subcontratados</li>
          <li><strong>Equipamentos</strong>: munck, andaime, gerador, com horas operando</li>
          <li><strong>Atividades</strong>: descrição + % executado</li>
          <li><strong>Tempo</strong>: manhã/tarde/noite anterior + precipitação (mm)</li>
          <li><strong>Segurança</strong>: acidentes, admissões, demissões, comentários</li>
          <li><strong>Fotos</strong>: até 2 MB cada (JPEG/PNG/WEBP)</li>
        </ul>

        <h2 class="man-h2">Aba "RDOs" (visão global)</h2>
        <p class="man-p">Acesse pelo sidebar → <strong>RDOs</strong>. Mostra:</p>
        <ul class="man-ul">
          <li><strong>Obras ativas</strong> sem RDO no último dia útil (alerta vermelho)</li>
          <li><strong>Atrasadas</strong>: + de 2 dias úteis sem RDO (alerta laranja)</li>
          <li><strong>Aderência</strong>: % de RDOs feitos / esperados nos últimos 7 dias úteis</li>
          <li>Tabela com todos os RDOs filtráveis por contrato e mês</li>
        </ul>
      `,

      'saidas-bm': `
        <h1 class="man-h1">🧾 Saídas e BMs</h1>
        <p class="man-p"><strong>Saída</strong> é uma medição parcial executada no contrato. Ao criar uma saída, o sistema agrupa em uma <strong>NF/BM</strong> (Boletim de Medição) — uma por dia/mês.</p>

        ${this._flowSaida()}

        <h2 class="man-h2">Regra de negócio</h2>
        <ul class="man-ul">
          <li>Cada saída precisa de <strong>valor + data + tipo</strong> (mão de obra/material/equip./serviço)</li>
          <li>Sistema busca NF do mesmo dia (mesma data limite, não emitida) — se existir, soma o valor; se não, cria nova</li>
          <li>O <strong>prazo de recebimento</strong> (em dias) define quando o cliente paga após emissão</li>
          <li>Soma de saídas <strong>não pode ultrapassar o valor do contrato</strong></li>
        </ul>

        <h2 class="man-h2">Atenção: edição de saídas</h2>
        <ul class="man-ul">
          <li>Não é possível editar valor/data se o BM já foi emitido — cancele a emissão antes</li>
          <li>Mudar a data move a saída para outra NF (busca/cria a do novo dia)</li>
          <li>Editar prazo de recebimento atualiza a NF associada</li>
        </ul>
      `,

      nfs: `
        <h1 class="man-h1">✅ NFs e Faturamento</h1>
        <p class="man-p">As NFs (BMs) são geradas automaticamente pelas saídas. Aparecem em <strong>Contas a Receber</strong> com status pendente até serem emitidas.</p>

        ${this._flowNF()}

        <h2 class="man-h2">Estados de uma NF</h2>
        <table class="man-table">
          <tr><th>Status</th><th>Descrição</th></tr>
          <tr><td><strong>Pendente</strong></td><td>BM criado, aguardando emissão fiscal pelo cliente</td></tr>
          <tr><td><strong>Vencida</strong></td><td>Pendente cuja data limite já passou (alerta vermelho)</td></tr>
          <tr><td><strong>Emitida</strong></td><td>NF lançada, entrada de caixa agendada para data + prazo</td></tr>
        </table>

        <div class="man-tip">
          <strong>Quando emitir:</strong> ao confirmar a NF, informe a data real de emissão. O sistema calcula automaticamente quando o caixa receberá (data + prazo de recebimento).
        </div>
      `,

      'contas-pg': `
        <h1 class="man-h1">💸 Contas a Pagar</h1>
        <p class="man-p">Lançamento de despesas com fornecedor. Pode ou não estar vinculada a um contrato (reduz a margem do contrato se vinculada).</p>

        ${this._flowContaPagar()}

        <h2 class="man-h2">Como funciona</h2>
        <ol class="man-ol">
          <li>Crie a conta com descrição, fornecedor, valor, vencimento, NF (se houver)</li>
          <li>Status inicial: <strong>Pendente</strong></li>
          <li>Quando pagar, clique em "Pagar" e informe data/valor/forma — sistema cria automaticamente uma <strong>saída no caixa</strong></li>
          <li>Para corrigir: "Estornar" remove a entrada de caixa e volta para Pendente</li>
        </ol>

        <h2 class="man-h2">Filtros disponíveis</h2>
        <ul class="man-ul">
          <li><strong>Pendente</strong> (default) — incluindo vencidas</li>
          <li><strong>Pago</strong> — histórico de pagamentos</li>
          <li><strong>Todas</strong></li>
        </ul>

        <div class="man-warn">
          <strong>Excluir conta:</strong> se já paga, a saída do caixa também é removida (cascade). Use com cuidado.
        </div>
      `,

      caixa: `
        <h1 class="man-h1">💰 Caixa</h1>
        <p class="man-p">Livro-caixa unificado. Todas as entradas e saídas passam por aqui: NFs emitidas, pagamentos, aportes, despesas administrativas.</p>

        <h2 class="man-h2">Como entradas chegam ao caixa</h2>
        <table class="man-table">
          <tr><th>Origem</th><th>Quando aparece</th></tr>
          <tr><td>NF emitida</td><td>Em <code>data_emissão + prazo_recebimento</code> (entrada futura)</td></tr>
          <tr><td>Conta paga</td><td>Saída imediata na data informada</td></tr>
          <tr><td>Aporte (caixa empresa)</td><td>Saída automática no momento do aporte</td></tr>
          <tr><td>Manual</td><td>Lançamento direto de qualquer tipo</td></tr>
          <tr><td>BASE alocação</td><td>Saída quando aloca custo administrativo num contrato</td></tr>
        </table>

        <h2 class="man-h2">Filtros</h2>
        <ul class="man-ul">
          <li>Por <strong>mês</strong> ou intervalo de datas</li>
          <li>Por <strong>contrato</strong></li>
          <li>Por <strong>tipo</strong> (entrada / saída)</li>
        </ul>

        <div class="man-tip">
          No <strong>Dashboard</strong>, "Últimas Movimentações" mostra as 20 mais recentes com filtro entrada/saída/ambos. Clique numa linha para ver detalhes.
        </div>
      `,

      recursos: `
        <h1 class="man-h1">👥 Recursos, Folgas e Passagens</h1>
        <p class="man-p">Recurso = colaborador. Pode ser candidato, funcionário ou ex-funcionário. Funcionários ativos são alocados em contratos via organograma.</p>

        <h2 class="man-h2">Cadastro completo</h2>
        <p class="man-p">Cada recurso tem:</p>
        <ul class="man-ul">
          <li>Dados pessoais: CPF, nascimento, telefone, email, endereço</li>
          <li>Trabalhistas: profissão, data de admissão, salário, CNH, PIS</li>
          <li>Status: candidato → funcionário → desligado</li>
          <li>Documentos: ASO, NR-10, NR-35, ART, CNH (com validade)</li>
          <li>Folgas: período + passagens (ida/volta)</li>
          <li>Alocação atual: contrato + data início + ciclo de trabalho (15/21/28 dias)</li>
        </ul>

        ${this._flowFolga()}

        <h2 class="man-h2">Compra de passagem</h2>
        <p class="man-p">Ao comprar passagem para uma folga, você decide:</p>
        <ul class="man-ul">
          <li><strong>Quem paga</strong>: caixa da empresa OU contrato específico</li>
          <li><strong>Como lançar</strong>: saída direta no caixa OU conta a pagar pendente</li>
        </ul>
        <p class="man-p">A passagem fica vinculada à folga via <code>caixaEntryId</code> ou <code>contaPagarId</code> para rastreio futuro.</p>
      `,

      folha: `
        <h1 class="man-h1">💵 Folha de Pagamento</h1>
        <p class="man-p">Controle mensal do pagamento dos colaboradores: salário, vale (adiantamento) e lançamentos de descontos e proventos.</p>

        <h2 class="man-h2">Como funciona</h2>
        <ol class="man-ol">
          <li>A cada mês, clique em <strong>"Gerar folha"</strong> — o sistema cria uma linha por colaborador ativo.</li>
          <li><strong>Vale</strong>: adiantamento de 40% para quem é marcado como "Elegível a vale" no cadastro do Recurso; vence no dia 20.</li>
          <li><strong>Saldo</strong>: os 60% restantes, com vencimento no <strong>5º dia útil</strong> do mês seguinte.</li>
          <li>Cada colaborador tem o link <strong>"Lançamentos"</strong> para registrar descontos (INSS, faltas, atrasos…) e proventos (hora extra, vale-alimentação…).</li>
          <li>O líquido é recalculado automaticamente e gera lançamentos em <strong>Contas a Pagar</strong>.</li>
        </ol>

        <h2 class="man-h2">Itens prontos</h2>
        <p class="man-p">O modal de Lançamentos traz itens com cálculo automático a partir do salário: INSS (tabela progressiva 2026), contribuição sindical, hora extra 50/60/70/100%, faltas, atrasos, D.S.R., vale-alimentação e participação nos lucros — todos editáveis.</p>

        <div class="man-tip"><strong>Integração:</strong> pagar ou estornar uma parcela na Folha sincroniza automaticamente com Contas a Pagar e Caixa — sem risco de pagar em dobro.</div>
      `,

      aportes: `
        <h1 class="man-h1">⬆️ Aportes / Investimentos</h1>
        <p class="man-p">Aportes capitalizam contratos ou a BASE da empresa. Podem vir de sócios ou do caixa da própria empresa.</p>

        ${this._flowAporte()}

        <h2 class="man-h2">Combinações possíveis</h2>
        <table class="man-table">
          <tr><th>Origem × Destino</th><th>Efeito</th></tr>
          <tr><td>Sócio → Contrato</td><td>Sócio injeta capital no contrato (sem mexer no caixa da empresa)</td></tr>
          <tr><td>Sócio → BASE</td><td>Sócio compra um item para a base (cria <strong>base_item</strong> rastreável)</td></tr>
          <tr><td>Caixa → Contrato</td><td>Empresa transfere capital pro contrato (cria saída no caixa)</td></tr>
          <tr><td>Caixa → BASE</td><td>Empresa adquire item da base via caixa (saída + base_item)</td></tr>
        </table>

        <div class="man-tip">
          <strong>Excluir aporte:</strong> remove cascade — a entrada do caixa volta a sair, e o item da BASE é removido se não tiver alocações.
        </div>
      `,

      base: `
        <h1 class="man-h1">🏢 BASE — Custos Administrativos</h1>
        <p class="man-p">Catálogo de custos fixos/variáveis da empresa: aluguel, salários administrativos, energia, marketing, software. Esses custos podem ser <strong>alocados parcialmente</strong> a um contrato.</p>

        <h2 class="man-h2">Tipos de custo</h2>
        <ul class="man-ul">
          <li>Sistema (não pode excluir): Fixo, Variável, Outros</li>
          <li>Customizáveis: Aluguel, Salários, Utilidades, Marketing, Tecnologia, etc.</li>
          <li>Configure em: Configuração → Tipos de Custo</li>
        </ul>

        <h2 class="man-h2">Alocação</h2>
        <ol class="man-ol">
          <li>Cada item tem um valor mensal</li>
          <li>Você pode alocar parcelas desse item para contratos específicos</li>
          <li>Total alocado não pode ultrapassar o valor do item</li>
          <li>Cada alocação cria uma <strong>saída no caixa</strong> com category = base</li>
        </ol>
      `,

      usuarios: `
        <h1 class="man-h1">🛡️ Usuários e Níveis de Acesso</h1>
        <p class="man-p">Cada <strong>usuário</strong> recebe um <strong>nível de acesso</strong> (perfil), que define quais telas ele vê e o que pode editar.</p>

        <h2 class="man-h2">Matriz de Níveis de Acesso</h2>
        <p class="man-p">Em <strong>Configuração → Níveis de Acesso</strong> a configuração é uma matriz: cada <strong>linha</strong> é uma tela do sistema e cada <strong>coluna</strong> é um perfil.</p>
        <ul class="man-ul">
          <li><strong>Ver</strong> — a tela aparece no menu lateral daquele perfil.</li>
          <li><strong>Ed.</strong> — o perfil pode criar, editar e excluir naquela tela (validado também no servidor).</li>
          <li><strong>Linhas recuadas</strong> são sub-permissões: as abas internas do Contrato e as etapas dos fluxos de Solicitação de Compra e Manutenção (avaliar, aprovar, receber). Têm um único interruptor, na coluna Ver.</li>
          <li>Marque o que quiser e clique em <strong>Salvar alterações</strong> — grava todos os perfis alterados de uma vez.</li>
        </ul>

        <h2 class="man-h2">Criar e atribuir usuários</h2>
        <ol class="man-ol">
          <li>Configuração → "Usuários e Logins" (ou o item "Usuários" no menu).</li>
          <li>"+ Novo Usuário": email, senha (≥ 6 caracteres), nome e nível de acesso.</li>
          <li>O usuário entra no perfil atribuído.</li>
        </ol>

        <div class="man-tip">
          <strong>Mudou uma permissão?</strong> Ela passa a valer no próximo carregamento da página do usuário — não precisa recriar o usuário nem fazer login de novo.
        </div>

        <div class="man-warn">
          <strong>Administrador:</strong> um usuário <strong>sem perfil</strong> (super admin) tem acesso total. Mantenha sempre pelo menos um. No primeiro boot o sistema cria o admin a partir das variáveis <code>ADMIN_EMAIL/ADMIN_PASSWORD</code>.
        </div>
      `,

      cronograma: `
        <h1 class="man-h1">📅 Cronograma físico-financeiro</h1>
        <p class="man-p">Planejamento de etapas (engenharia, aquisições, montagem, comissionamento) com peso, datas, custo e % executado. Aparece como nova aba dentro de cada contrato.</p>

        <h2 class="man-h2">Exemplo de cronograma de obra de 6 meses</h2>
        <p class="man-p">Pra ter ideia de como o Gantt fica preenchido, este é um exemplo realista — comercial, mobilização, 3 etapas de execução, 3 BMs intercaladas e encerramento:</p>
        ${this._ganttObra()}

        <h2 class="man-h2">Como construir o seu</h2>
        ${this._flowCronograma()}

        <h2 class="man-h2">Conceitos</h2>
        <table class="man-table">
          <tr><th>Campo</th><th>O que significa</th></tr>
          <tr><td><strong>Peso %</strong></td><td>Quanto essa etapa representa do total da obra. A soma das etapas deve dar 100%</td></tr>
          <tr><td><strong>Início / Fim planejado</strong></td><td>Datas do plano original — não muda mesmo se a obra atrasar</td></tr>
          <tr><td><strong>% Executado</strong></td><td>0 a 100. Quanto da etapa já foi feito (subjetivo, atualizado pela engenharia)</td></tr>
          <tr><td><strong>Custo planejado</strong></td><td>Quanto a etapa deveria custar — base de comparação com o realizado</td></tr>
          <tr><td><strong>Avanço físico ponderado</strong></td><td>Σ(peso × execução) ÷ 100. Mostra quanto da obra foi feita considerando o peso de cada etapa</td></tr>
        </table>

        <h2 class="man-h2">Como ler o Gantt</h2>
        <ul class="man-ul">
          <li>Cada linha é uma etapa, posicionada por data planejada</li>
          <li><strong>Barra cinza</strong> = duração planejada da etapa</li>
          <li><strong>Barra colorida</strong> = quanto já foi executado, sobreposta à planejada</li>
          <li>Cor da barra: cinza (0%) → amarelo (&lt;50%) → azul (&lt;100%) → verde (100%)</li>
          <li><strong>Linha vermelha vertical</strong> = hoje, ajuda a ver atraso visualmente</li>
        </ul>

        <div class="man-tip">
          <strong>Boa prática:</strong> atualize % executado semanalmente. Sem isso, o Gantt fica obsoleto e não ajuda na gestão.
        </div>

        <div class="man-warn">
          <strong>Atenção:</strong> a soma dos pesos das etapas deve fechar 100%. Se não fechar, o resumo mostra alerta amarelo. Garante que o avanço físico ponderado faça sentido.
        </div>
      `,

      assinaturas: `
        <h1 class="man-h1">✍️ Assinatura digital no RDO</h1>
        <p class="man-p">Encarregado, cliente e fiscal podem assinar o RDO direto no celular ou tablet. A assinatura fica salva como imagem no banco e aparece em qualquer relatório do RDO.</p>

        ${this._flowAssinatura()}

        <h2 class="man-h2">Por que usar</h2>
        <ul class="man-ul">
          <li><strong>Comprovação legal</strong> — em caso de discussão (acidente, atraso, retrabalho), há registro de quem aprovou cada dia</li>
          <li><strong>Engajamento do fiscal</strong> — o cliente vê que o sistema é sério e participa da gestão</li>
          <li><strong>Sem papel</strong> — substitui assinatura impressa em diário de obras físico</li>
        </ul>

        <h2 class="man-h2">Papéis disponíveis</h2>
        <table class="man-table">
          <tr><th>Papel</th><th>Quem usa</th></tr>
          <tr><td><strong>Encarregado</strong></td><td>Responsável pela equipe da empresa naquela obra</td></tr>
          <tr><td><strong>Cliente</strong></td><td>Representante do contratante (síndico, gerente, dono)</td></tr>
          <tr><td><strong>Fiscal</strong></td><td>Fiscal de contrato do cliente, em obras com fiscalização ativa</td></tr>
          <tr><td><strong>Engenheiro</strong></td><td>Engenheiro responsável pela obra (CREA)</td></tr>
          <tr><td><strong>Outro</strong></td><td>Para casos não-padrão (testemunha, auditor)</td></tr>
        </table>

        <h2 class="man-h2">Onde fica armazenado</h2>
        <p class="man-p">A imagem (PNG) fica gravada como BYTEA dentro do Postgres, junto do RDO. Não usa disco externo nem serviço de storage. Backup do banco já cobre as assinaturas.</p>

        <div class="man-tip">
          <strong>Múltiplas assinaturas:</strong> você pode adicionar quantas precisar no mesmo RDO (encarregado + cliente + fiscal numa única visita). Cada uma vira um registro separado.
        </div>
      `,

      estoque: `
        <h1 class="man-h1">📦 Almoxarifado / Estoque</h1>
        <p class="man-p">Controle de materiais com modelo simples: <strong>Almox Central</strong> (depósito principal da empresa) + <strong>Almox de cada obra</strong> (criado automaticamente quando você envia material pra uma obra). Sem complicação contábil — você só usa botões em linguagem natural.</p>

        ${this._flowEstoque()}

        <h2 class="man-h2">Os 4 botões que você vai usar 99% do tempo</h2>
        <table class="man-table">
          <tr><th>Botão</th><th>Quando usar</th><th>O que acontece</th></tr>
          <tr>
            <td>🟢 <strong>Comprei / Recebi</strong></td>
            <td>Comprou material novo. Mercadoria chegando da nota fiscal.</td>
            <td>Soma quantidade no <strong>Central</strong>. Pede o custo unitário (atualiza o custo médio do item) e dados da nota fiscal.</td>
          </tr>
          <tr>
            <td>🔵 <strong>Enviar pra obra</strong></td>
            <td>Vai mandar material do depósito central pra uma obra.</td>
            <td>Tira do Central, coloca no <strong>Almox da Obra</strong> (criado automático na 1ª vez). Não vira custo ainda — é só movimentação.</td>
          </tr>
          <tr>
            <td>🔴 <strong>Usei na obra</strong></td>
            <td>O material foi consumido na execução da obra (parafuso virou parte da estrutura, EPI foi entregue ao colaborador).</td>
            <td>Tira do almox da obra. <strong>Lança o custo no contrato</strong> (qtd × custo médio). Aparece na composição de gasto da obra.</td>
          </tr>
          <tr>
            <td>🟡 <strong>Voltou da obra</strong></td>
            <td>Sobra de obra concluída ou material errado que precisa voltar.</td>
            <td>Tira do almox da obra, devolve pro Central. (em "Mais opções" do botão ⋯)</td>
          </tr>
        </table>

        <h2 class="man-h2">Estrutura — entenda em 30 segundos</h2>
        <ul class="man-ul">
          <li><strong>1 Almox Central</strong> — único, criado pelo sistema. Recebe todas as compras.</li>
          <li><strong>N Almox de Obra</strong> — um por contrato. Sistema cria automaticamente quando você usa "Enviar pra obra" pela 1ª vez. Endereço sincronizado com a obra.</li>
          <li><strong>Item</strong> — cadastra uma vez. Mesmo item pode ter saldo em vários almoxarifados ao mesmo tempo (matriz).</li>
        </ul>

        <h2 class="man-h2">Como cadastrar um item novo</h2>
        <ol class="man-ol">
          <li>Botão <strong>+ Novo item</strong></li>
          <li>Preenche: descrição, unidade (pç/kg/m), categoria — só dados do item, sem mexer em estoque ainda</li>
          <li>Salva. O item aparece na lista com <strong>saldo zero</strong></li>
          <li>Use <strong>🟢 Comprei</strong> pra adicionar a primeira entrada (informa qtd + custo + nota fiscal)</li>
        </ol>

        <h2 class="man-h2">Custo médio ponderado (CMV)</h2>
        <p class="man-p">A cada <strong>🟢 Comprei</strong> com custo unitário, o sistema recalcula:</p>
        <div class="man-code">novo_custo_medio = (saldo_anterior × custo_anterior + qtd_entrada × custo_entrada) / saldo_total</div>
        <p class="man-p">Exemplo: você tinha 10un a R$ 5,00 (custo médio). Comprou 20un a R$ 6,00. Novo custo médio = (10×5 + 20×6) / 30 = 5,67. Quando você usa material na obra (🔴), o sistema lança qtd × R$ 5,67 no contrato.</p>

        <h2 class="man-h2">Alertas</h2>
        <ul class="man-ul">
          <li><strong>Linha vermelha</strong> na lista: item com saldo total abaixo do mínimo cadastrado</li>
          <li>KPI no topo da tela: contagem de itens "Abaixo do mínimo"</li>
          <li>Use pra disparar pedido de reposição com fornecedor</li>
        </ul>

        <h2 class="man-h2">Histórico</h2>
        <p class="man-p">Aba <strong>🔁 Histórico</strong> mostra todas movimentações em linguagem clara: <em>"Recebi 100un de Parafuso M8x30 no Central — NF 12345 — R$ 1,20/un"</em>. Cada linha tem botão <strong>↩️ Reverter</strong> que devolve o saldo (transação atômica — desfaz inclusive transferências entre almoxarifados).</p>

        <div class="man-tip">
          <strong>Fluxo recomendado:</strong> 🟢 Comprei (no Central) → 🔵 Enviar pra obra X → 🔴 Usei na obra X. Esse é o fluxo padrão. Aporta o custo certinho no contrato e mantém histórico rastreável.
        </div>

        <div class="man-warn">
          <strong>Quando usar 🟠 Corrigir saldo (em "Mais opções"):</strong> só pra correções de inventário (contagem física, perda, quebra). Para movimentações normais (compra/envio/uso), use sempre os botões coloridos — preserva o histórico contábil.
        </div>
      `,

      compras: `
        <h1 class="man-h1">🛒 Solicitações de Compra</h1>
        <p class="man-p">Fluxo de pedido de materiais e equipamentos — da solicitação até o recebimento, com avaliação da equipe de compras e aprovação gerencial.</p>

        <h2 class="man-h2">As etapas</h2>
        <ol class="man-ol">
          <li><strong>Solicitar</strong> — qualquer pessoa cria a solicitação: itens (descrição, quantidade), destino (Sede ou obra) e justificativa. Cada item pode ser <strong>🛒 Compra</strong> ou <strong>🔑 Aluguel</strong>.</li>
          <li><strong>Avaliar</strong> — a equipe de compras lança cotações por item, escolhe a vencedora e define o fornecedor.</li>
          <li><strong>Aprovar</strong> — a gerência aprova ou rejeita o valor total.</li>
          <li><strong>Receber</strong> — confirma o recebimento; a entrada no estoque e a conta a pagar são geradas.</li>
        </ol>

        <h2 class="man-h2">Quem faz cada etapa</h2>
        <table class="man-table">
          <tr><th>Etapa</th><th>Quem</th></tr>
          <tr><td>Solicitar</td><td>Qualquer usuário</td></tr>
          <tr><td>Avaliar e cotar</td><td>Equipe de compras (sub-permissão "Avaliar")</td></tr>
          <tr><td>Aprovar / rejeitar</td><td>Gerência (sub-permissão "Aprovar")</td></tr>
          <tr><td>Registrar recebimento</td><td>Sub-permissão "Receber"</td></tr>
        </table>

        <div class="man-tip"><strong>Permissões:</strong> as etapas são liberadas em Configuração → Níveis de Acesso, nas linhas recuadas abaixo de "Solicitações de Compra".</div>
      `,

      manutencao: `
        <h1 class="man-h1">🔧 Manutenção de Equipamentos</h1>
        <p class="man-p">Controla equipamentos enviados para reparo — máquina de solda, ferramentas e outros — com fluxo de aprovação parecido com o de Solicitação de Compra.</p>

        <h2 class="man-h2">As etapas</h2>
        <ol class="man-ol">
          <li><strong>Solicitar</strong> — qualquer pessoa registra o equipamento e o problema/defeito.</li>
          <li><strong>Avaliar</strong> — a equipe de compras define a oficina, o prazo (previsão de retorno) e o custo estimado.</li>
          <li><strong>Aprovar</strong> — a gerência aprova ou rejeita.</li>
          <li><strong>Registrar retorno</strong> — quando o equipamento volta, registra-se a data de retorno e o custo final.</li>
        </ol>

        <h2 class="man-h2">Status</h2>
        <table class="man-table">
          <tr><th>Status</th><th>Significa</th></tr>
          <tr><td>📋 A avaliar</td><td>Solicitada; aguarda a equipe de compras</td></tr>
          <tr><td>🟡 Aguardando aprovação</td><td>Avaliada; aguarda a gerência</td></tr>
          <tr><td>🔧 Em manutenção</td><td>Aprovada; equipamento no reparo</td></tr>
          <tr><td>✅ Retornado</td><td>Equipamento de volta</td></tr>
        </table>

        <div class="man-tip"><strong>Monitoramento:</strong> a tela mostra há quantos dias o equipamento está fora e destaca em vermelho os que passaram da previsão de retorno.</div>
      `,

      personalizar: `
        <h1 class="man-h1">🎨 Personalizar Dashboard</h1>
        <p class="man-p">Cada usuário pode escolher quais seções aparecem no seu dashboard. Útil quando perfis diferentes querem ver coisas diferentes (financeiro vs operacional).</p>

        ${this._flowPersonalizar()}

        <h2 class="man-h2">Como personalizar</h2>
        <ol class="man-ol">
          <li>Vá no <strong>Dashboard</strong> (página inicial)</li>
          <li>Clique no botão <strong>🎨 Personalizar</strong> no canto superior direito</li>
          <li>Marque/desmarque as seções que quer ver</li>
          <li>Clique em <strong>💾 Salvar</strong></li>
        </ol>

        <h2 class="man-h2">Onde fica salvo</h2>
        <p class="man-p">A preferência fica gravada por usuário no banco de dados. Cada login vê seu próprio layout. Cache local (localStorage) acelera a aplicação na próxima visita.</p>

        <div class="man-tip">
          <strong>Restaurar padrão:</strong> dentro do modal, o botão "Restaurar padrão" reativa todas as seções de uma vez. Útil quando você quer ver tudo de novo.
        </div>

        <div class="man-warn">
          <strong>Atenção:</strong> ocultar uma seção não apaga seus dados — só esconde do dashboard. Os dados continuam acessíveis em suas telas dedicadas.
        </div>
      `,

      glossario: `
        <h1 class="man-h1">📚 Glossário</h1>
        <table class="man-table">
          <tr><th>Termo</th><th>Significado</th></tr>
          <tr><td><strong>BM</strong></td><td>Boletim de Medição — uma NF gerada pelas saídas (medições) do mês</td></tr>
          <tr><td><strong>MOI</strong></td><td>Mão de Obra Indireta (encarregado, técnico de segurança, almoxarife)</td></tr>
          <tr><td><strong>MOD</strong></td><td>Mão de Obra Direta (mecânico, soldador, eletricista)</td></tr>
          <tr><td><strong>RDO</strong></td><td>Relatório Diário de Obra</td></tr>
          <tr><td><strong>Aderência</strong></td><td>RDOs feitos ÷ esperados nos últimos N dias úteis</td></tr>
          <tr><td><strong>Margem</strong></td><td>Valor do contrato − total medido nas saídas</td></tr>
          <tr><td><strong>Aporte</strong></td><td>Capital adicional para contrato ou BASE</td></tr>
          <tr><td><strong>BASE</strong></td><td>Catálogo de custos administrativos</td></tr>
          <tr><td><strong>Organograma</strong></td><td>Estrutura hierárquica da equipe num contrato (encarregado → líderes → profissionais)</td></tr>
          <tr><td><strong>Ciclo de trabalho</strong></td><td>Dias trabalhados antes de uma folga (15/21/28)</td></tr>
          <tr><td><strong>NR-10/NR-35</strong></td><td>Normas regulamentadoras (eletricidade / trabalho em altura)</td></tr>
          <tr><td><strong>ASO</strong></td><td>Atestado de Saúde Ocupacional</td></tr>
          <tr><td><strong>ART</strong></td><td>Anotação de Responsabilidade Técnica (CREA)</td></tr>
        </table>
      `,
    };
  },

  _buildHtml() {
    const secoes = this._secoes();
    const conteudos = this._conteudo();
    const ativa = this._secao;
    return `
      <style>
        .man-root { font-family: 'Nunito', sans-serif; }
        /* min-width:0 propaga pelo shell pra permitir overflow-x funcionar nos descendentes
           (sem isso, fluxogramas largos do Mermaid empurram o grid e cortam à direita). */
        .man-root { min-width: 0; max-width: 100%; }
        .man-layout {
          display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--sp-lg);
          min-width: 0;
        }
        .man-menu {
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: 10px; padding: var(--sp-sm); height: fit-content;
          position: sticky; top: var(--sp-md); max-height: calc(100vh - 40px); overflow-y: auto;
        }
        .man-menu-item {
          display: flex; align-items: center; gap: 10px; padding: 9px 12px;
          border-radius: 6px; cursor: pointer; font-size: 14px; color: var(--color-text);
          background: transparent; border: 0; width: 100%; text-align: left; font-family: inherit;
        }
        .man-menu-item:hover { background: var(--color-bg); }
        .man-menu-item.active { background: #3b82f6; color: #fff; font-weight: 700; }
        .man-content {
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: 10px; padding: var(--sp-xl); line-height: 1.6;
          min-width: 0; /* permite que filhos com overflow-x funcionem dentro do grid */
        }
        .man-h1 { font-size: 28px; font-weight: 800; margin: 0 0 var(--sp-md); color: var(--color-text); }
        .man-h2 { font-size: 18px; font-weight: 700; margin: var(--sp-xl) 0 var(--sp-sm); color: var(--color-text); }
        .man-p  { font-size: 15px; color: var(--color-text); margin: 0 0 var(--sp-md); }
        .man-ul, .man-ol { margin: 0 0 var(--sp-md); padding-left: 22px; font-size: 15px; line-height: 1.8; }
        .man-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap: var(--sp-md); margin: var(--sp-md) 0; }
        .man-card {
          background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 8px; padding: var(--sp-md);
        }
        .man-card h3 { margin: 0 0 6px; font-size: 16px; }
        .man-card p { margin: 0; font-size: 14px; color: var(--color-text-muted); }
        .man-table { width: 100%; border-collapse: collapse; margin: var(--sp-md) 0; font-size: 14px; }
        .man-table th, .man-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--color-border); }
        .man-table th { background: var(--color-bg); font-weight: 700; color: var(--color-text-muted); }
        .man-tip {
          background: rgba(59,130,246,.1); border-left: 3px solid #3b82f6;
          padding: 12px 16px; border-radius: 6px; margin: var(--sp-md) 0; font-size: 14px;
        }
        .man-warn {
          background: rgba(245,158,11,.1); border-left: 3px solid #f59e0b;
          padding: 12px 16px; border-radius: 6px; margin: var(--sp-md) 0; font-size: 14px;
        }
        .man-code {
          background: var(--color-bg); border: 1px solid var(--color-border);
          border-radius: 6px; padding: 10px 14px; margin: var(--sp-sm) 0;
          font-family: 'Courier New', monospace; font-size: 13px;
          color: var(--color-text); white-space: pre-wrap; word-break: break-word;
        }
        code { background: var(--color-bg); border: 1px solid var(--color-border);
          border-radius: 4px; padding: 1px 6px; font-size: 13px; font-family: 'Courier New', monospace;
        }
        code {
          background: var(--color-bg); padding: 2px 6px; border-radius: 3px;
          font-family: monospace; font-size: 13px; color: var(--color-primary);
        }
        /* Mermaid: contêiner com fundo escuro.
           Width: 100% obriga o pre a respeitar a largura da coluna.
           Vertical: cresce com o conteúdo (sem max-height = sem corte embaixo).
           Horizontal: scroll se fluxograma for muito largo. */
        pre.mermaid {
          background: #0f172a; border-radius: 10px; padding: var(--sp-lg);
          margin: var(--sp-md) 0;
          width: 100%; max-width: 100%; box-sizing: border-box;
          overflow-x: auto; overflow-y: visible;
          border: 1px solid #1e293b;
          font-family: inherit !important;
          white-space: normal !important;
          text-align: center;
          min-height: 120px;
        }
        /* SVG renderiza no tamanho natural — não encolhe (evita texto cortado). */
        pre.mermaid svg {
          max-width: none !important;
          width: auto !important;
          height: auto !important;
          display: inline-block;
          margin: 0 auto;
        }
        /* Texto dos nodes: melhor contraste e tamanho legível */
        pre.mermaid .nodeLabel,
        pre.mermaid .nodeLabel p,
        pre.mermaid foreignObject div {
          font-size: 14px !important;
          line-height: 1.4 !important;
          color: #f1f5f9 !important;
          font-family: 'Nunito', sans-serif !important;
        }
        pre.mermaid .edgeLabel,
        pre.mermaid .edgeLabel p {
          background: #0f172a !important; color: #f1f5f9 !important;
          padding: 2px 6px !important; border-radius: 3px;
          font-size: 13px !important;
        }
        /* Hint de scroll pro usuário quando o fluxograma extrapola */
        pre.mermaid::-webkit-scrollbar { height: 10px; width: 10px; }
        pre.mermaid::-webkit-scrollbar-track { background: #1e293b; border-radius: 5px; }
        pre.mermaid::-webkit-scrollbar-thumb { background: #475569; border-radius: 5px; }
        pre.mermaid::-webkit-scrollbar-thumb:hover { background: #64748b; }
      </style>

      <div class="man-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">📖 Manual do Usuário</h1>
            <p class="page-subtitle">Guia completo do sistema com fluxogramas</p>
          </div>
        </div>

        <div class="man-layout">
          <div class="man-menu">
            ${secoes.map(s => `
              <button class="man-menu-item ${s.k === ativa ? 'active' : ''}" data-secao="${s.k}">
                <span>${s.icon}</span><span>${s.label}</span>
              </button>
            `).join('')}
          </div>

          <div class="man-content">
            ${conteudos[ativa] || conteudos.inicio}
          </div>
        </div>
      </div>
    `;
  },

  _attachListeners() {
    document.querySelectorAll('.man-menu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._secao = btn.dataset.secao;
        this.render();
      });
    });
  },
};
