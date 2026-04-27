// Manual do Usuário — versão 3.0 com fluxogramas Mermaid (declarativos, sempre alinhados).
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
      // Mermaid carrega assíncrono via CDN; tenta de novo se ainda não está pronto.
      setTimeout(() => this._renderMermaid(), 200);
      return;
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
flowchart LR
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
flowchart LR
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
flowchart LR
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
      { k: 'rdos',       icon: '📝', label: 'RDOs' },
      { k: 'saidas-bm',  icon: '🧾', label: 'Saídas e BMs' },
      { k: 'nfs',        icon: '✅', label: 'NFs / Faturamento' },
      { k: 'contas-pg',  icon: '💸', label: 'Contas a Pagar' },
      { k: 'caixa',      icon: '💰', label: 'Caixa' },
      { k: 'recursos',   icon: '👥', label: 'Recursos e Folgas' },
      { k: 'aportes',    icon: '⬆️', label: 'Aportes / Investimentos' },
      { k: 'base',       icon: '🏢', label: 'BASE' },
      { k: 'usuarios',   icon: '🛡️', label: 'Usuários e Permissões' },
      { k: 'glossario',  icon: '📚', label: 'Glossário' },
    ];
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
        <h1 class="man-h1">🛡️ Usuários e Permissões</h1>
        <p class="man-p">Hierarquia: <strong>Usuário</strong> tem <strong>Nível de acesso</strong>. Cada nível tem uma lista de abas permitidas.</p>

        <h2 class="man-h2">Configurar permissões</h2>
        <ol class="man-ol">
          <li>Configuração → Níveis de Acesso</li>
          <li>Marque/desmarque as abas em cada grupo (Principal, RH, Financeiro, Sistema)</li>
          <li>Bonus: dentro do grupo "Abas dentro do Contrato" você pode liberar individualmente Visão Geral, Financeiro, Equipe, RDO, Pendências</li>
          <li>Salve cada nível separadamente</li>
        </ol>

        <h2 class="man-h2">Criar usuários</h2>
        <ol class="man-ol">
          <li>Acesse "Usuários" no sidebar (ou pelo atalho na Configuração)</li>
          <li>Clique "+ Novo Usuário"</li>
          <li>Email + senha (≥ 6 caracteres) + nome + nível</li>
          <li>O usuário entrará automaticamente no nível atribuído (não pode trocar)</li>
        </ol>

        <div class="man-warn">
          <strong>Admin master:</strong> usuário <strong>sem nível</strong> tem acesso universal. Crie pelo menos um sempre. Por padrão o sistema cria <code>admin@rhino.local</code> no primeiro boot (env <code>ADMIN_EMAIL/ADMIN_PASSWORD</code>).
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
        .man-layout { display: grid; grid-template-columns: 240px 1fr; gap: var(--sp-lg); }
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
        /* Mermaid: contêiner com fundo escuro, fluxograma centralizado */
        pre.mermaid {
          background: #0f172a; border-radius: 10px; padding: var(--sp-lg);
          margin: var(--sp-md) 0; text-align: center; overflow-x: auto;
          border: 1px solid #1e293b;
        }
        pre.mermaid svg { max-width: 100%; height: auto; }
        /* Texto dos nodes: melhor contraste no dark */
        pre.mermaid .nodeLabel { font-size: 14px !important; }
        pre.mermaid .edgeLabel {
          background: #0f172a !important; color: #f1f5f9 !important;
          padding: 2px 6px !important; border-radius: 3px;
        }
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
