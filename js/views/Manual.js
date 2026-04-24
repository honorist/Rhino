// Manual do Usuário — guia passo a passo com ilustrações visuais
window.Manual = {
  _secao: 'inicio',

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = this._buildHtml();
    this._attachListeners();
  },

  _buildHtml() {
    return `
      <style>
        /* ═══ Manual — estilos isolados ═══ */
        .man-root { font-family: 'Nunito', sans-serif; }
        .man-root * { box-sizing: border-box; }

        .man-layout {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: var(--sp-lg);
          min-height: calc(100vh - 160px);
        }

        /* Menu lateral interno */
        .man-menu {
          background: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 10px;
          padding: var(--sp-sm);
          height: fit-content;
          position: sticky;
          top: var(--sp-md);
          max-height: calc(100vh - 40px);
          overflow-y: auto;
        }
        .man-menu-title {
          padding: 10px 14px 6px;
          font-size: 16px;
          font-weight: 800;
          color: var(--color-text);
        }
        .man-menu-subtitle {
          padding: 0 14px 10px;
          font-size: 13px;
          color: var(--color-text-muted);
          border-bottom: 1px solid var(--color-border);
          margin-bottom: 6px;
        }
        .man-menu-group {
          padding: 10px 14px 4px;
          font-size: 12px;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .man-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
          border-radius: 6px;
          color: var(--color-text);
          cursor: pointer;
          font-size: 15px;
          font-weight: 500;
          transition: background 0.15s, color 0.15s;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .man-menu-item:hover {
          background: rgba(85, 88, 139, 0.08);
          color: var(--color-primary);
        }
        .man-menu-item.active {
          background: rgba(85, 88, 139, 0.12);
          color: var(--color-primary);
          font-weight: 700;
          border-left: 3px solid var(--color-primary);
          padding-left: 11px;
        }
        .man-menu-icon { font-size: 18px; flex-shrink: 0; }

        /* Conteúdo principal */
        .man-content {
          background: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 10px;
          padding: var(--sp-xl);
          max-width: 900px;
        }
        .man-content h1 {
          font-size: 28px;
          font-weight: 800;
          color: var(--color-text);
          margin: 0 0 8px 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .man-content h1 .ico {
          width: 48px; height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #8B8FBF, #55588B);
          color: #FFFFFF;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
        .man-content h2 {
          font-size: 20px;
          font-weight: 700;
          color: var(--color-text);
          margin: 28px 0 10px 0;
          padding-bottom: 6px;
          border-bottom: 2px solid var(--color-border);
        }
        .man-content h3 {
          font-size: 17px;
          font-weight: 700;
          color: var(--color-text);
          margin: 20px 0 8px 0;
        }
        .man-content p { font-size: 15px; line-height: 1.65; color: var(--color-text); margin: 10px 0; }
        .man-content strong { color: var(--color-text); font-weight: 700; }

        .man-lead {
          padding: 14px 18px;
          background: linear-gradient(135deg, rgba(85,88,139,.08), rgba(85,88,139,.02));
          border-left: 4px solid var(--color-primary);
          border-radius: 6px;
          font-size: 15.5px;
          color: var(--color-text);
          margin: 16px 0 24px;
        }

        .man-steps { list-style: none; padding: 0; counter-reset: step; }
        .man-steps li {
          position: relative;
          padding: 14px 16px 14px 52px;
          margin-bottom: 10px;
          background: var(--color-bg);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          font-size: 15px;
          line-height: 1.55;
          counter-increment: step;
        }
        .man-steps li::before {
          content: counter(step);
          position: absolute;
          left: 12px; top: 12px;
          width: 28px; height: 28px;
          background: var(--color-primary);
          color: #FFFFFF;
          font-weight: 800;
          font-size: 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .man-tip {
          background: #ECFDF5;
          border-left: 4px solid #6D9480;
          border-radius: 6px;
          padding: 12px 16px;
          margin: 16px 0;
          font-size: 14.5px;
          color: #064E3B;
        }
        .man-tip strong { color: #064E3B; }
        .man-warn {
          background: #FEF3C7;
          border-left: 4px solid #F59E0B;
          border-radius: 6px;
          padding: 12px 16px;
          margin: 16px 0;
          font-size: 14.5px;
          color: #78350F;
        }

        /* Mockups ilustrativos */
        .man-mockup {
          background: var(--color-bg);
          border: 1px dashed var(--color-border);
          border-radius: 8px;
          padding: 16px;
          margin: 14px 0;
        }
        .man-mockup-label {
          font-size: 12px;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .mock-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,.06);
        }
        .mock-btn {
          display: inline-block;
          padding: 8px 16px;
          background: var(--color-primary);
          color: #FFFFFF;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
        }
        .mock-btn-ghost {
          display: inline-block;
          padding: 8px 16px;
          background: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
        }
        .mock-input {
          display: block;
          width: 100%;
          padding: 9px 12px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          font-size: 14px;
          color: var(--color-text);
          margin: 4px 0;
        }
        .mock-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text);
          margin-top: 8px;
          display: block;
        }
        .mock-tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--color-border);
          margin: 8px 0 12px;
        }
        .mock-tab {
          padding: 8px 14px;
          font-size: 13.5px;
          color: var(--color-text);
          border-bottom: 3px solid transparent;
          margin-bottom: -1px;
        }
        .mock-tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
          font-weight: 700;
        }
        .mock-pill {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 99px;
          font-size: 12px;
          font-weight: 700;
        }
        .mock-pill-ok { background: #D1FAE5; color: #065F46; }
        .mock-pill-warn { background: #FEF3C7; color: #92400E; }
        .mock-pill-err { background: #FEE2E2; color: #991B1B; }

        .man-kb {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          font-family: monospace;
          font-size: 13px;
          font-weight: 700;
          color: var(--color-text);
        }

        .man-glossary {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 8px 16px;
          margin: 12px 0;
          font-size: 15px;
        }
        .man-glossary dt { font-weight: 700; color: var(--color-primary); }
        .man-glossary dd { color: var(--color-text); margin: 0; }

        @media (max-width: 900px) {
          .man-layout { grid-template-columns: 1fr; }
          .man-menu { position: static; max-height: none; }
        }
      </style>

      <div class="man-root">
        <div class="page-header">
          <div>
            <h1 class="page-title">📖 Manual do Usuário</h1>
            <p class="page-subtitle">Guia passo a passo de todas as funções do Rhino.</p>
          </div>
        </div>

        <div class="man-layout">
          ${this._menu()}
          <div class="man-content">
            ${this._conteudo(this._secao)}
          </div>
        </div>
      </div>
    `;
  },

  _menu() {
    const grupos = [
      {
        titulo: 'Primeiros Passos',
        items: [
          { k: 'inicio',       i: '🚀', l: 'Começando' },
          { k: 'navegacao',    i: '🧭', l: 'Como navegar' }
        ]
      },
      {
        titulo: 'Módulos Principais',
        items: [
          { k: 'dashboard',    i: '📊', l: 'Dashboard' },
          { k: 'contratos',    i: '📄', l: 'Contratos' },
          { k: 'equipe',       i: '👷', l: 'Equipe e Organograma' },
          { k: 'rdo',          i: '📋', l: 'RDO' },
          { k: 'obras',        i: '🏗️', l: 'Mapa de Obras' },
          { k: 'recursos',     i: '👥', l: 'Recursos (Colaboradores)' },
          { k: 'clientes',     i: '◎',  l: 'Clientes' },
          { k: 'fornecedores', i: '⬡',  l: 'Fornecedores' },
          { k: 'documentos',   i: '📑', l: 'Documentação' }
        ]
      },
      {
        titulo: 'Financeiro',
        items: [
          { k: 'caixa',        i: '◇',  l: 'Caixa' },
          { k: 'contaspagar',  i: '⊖',  l: 'Contas a Pagar' },
          { k: 'contasreceber',i: '☐',  l: 'Contas a Receber' },
          { k: 'socios',       i: '⊕',  l: 'Sócios' },
          { k: 'aportes',      i: '△',  l: 'Aportes' },
          { k: 'base',         i: '⊟',  l: 'BASE (rateio)' }
        ]
      },
      {
        titulo: 'Outros',
        items: [
          { k: 'configuracao', i: '⚙️', l: 'Configuração' },
          { k: 'atalhos',      i: '⌨',  l: 'Atalhos e dicas' },
          { k: 'glossario',    i: '📚', l: 'Glossário' }
        ]
      }
    ];

    return `
      <nav class="man-menu">
        <div class="man-menu-title">Índice</div>
        <div class="man-menu-subtitle">Clique para navegar</div>
        ${grupos.map(g => `
          <div class="man-menu-group">${g.titulo}</div>
          ${g.items.map(it => `
            <button class="man-menu-item ${this._secao === it.k ? 'active' : ''}" data-man-sec="${it.k}">
              <span class="man-menu-icon">${it.i}</span>
              <span>${it.l}</span>
            </button>
          `).join('')}
        `).join('')}
      </nav>
    `;
  },

  _conteudo(sec) {
    return {
      inicio:         this._inicio(),
      navegacao:      this._navegacao(),
      dashboard:      this._dashboard(),
      contratos:      this._contratos(),
      equipe:         this._equipe(),
      rdo:            this._rdo(),
      obras:          this._obras(),
      recursos:       this._recursos(),
      clientes:       this._clientes(),
      fornecedores:   this._fornecedores(),
      documentos:     this._documentos(),
      caixa:          this._caixa(),
      contaspagar:    this._contaspagar(),
      contasreceber:  this._contasreceber(),
      socios:         this._socios(),
      aportes:        this._aportes(),
      base:           this._base(),
      configuracao:   this._configuracao(),
      atalhos:        this._atalhos(),
      glossario:      this._glossario()
    }[sec] || this._inicio();
  },

  _inicio() {
    return `
      <h1><span class="ico">🚀</span> Começando</h1>
      <p class="man-lead">Bem-vindo ao <strong>Rhino</strong>! Este é um sistema para gerenciar obras, contratos, equipes e finanças.</p>

      <h2>O que dá pra fazer aqui?</h2>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>📄 Cadastrar contratos e acompanhar o orçamento de cada um</li>
        <li>👷 Montar a equipe da obra (organograma) e saber quem faz o quê</li>
        <li>📋 Fazer o RDO (Relatório Diário de Obra) todo dia — com fotos</li>
        <li>💰 Controlar dinheiro: o que entra, o que sai, quem paga, quem recebe</li>
        <li>🏗️ Ver todas as obras num mapa</li>
        <li>📑 Guardar documentos (contratos, PCMSO, certificados...)</li>
      </ul>

      <h2>Primeira vez aqui?</h2>
      <ol class="man-steps">
        <li><strong>Escolha seu perfil</strong> — quando abre o sistema, aparece uma tela pra você dizer se é dono, gerente, fiscal, etc. Isso define o que você vê.</li>
        <li><strong>Dê uma volta pelo menu</strong> — o menu da esquerda tem tudo. Clique em cada item pra ver o que é.</li>
        <li><strong>Cadastre um contrato</strong> — tudo começa por aí. Menu → Contratos → + Novo Contrato.</li>
        <li><strong>Adicione pessoas</strong> — em Recursos, cadastre os colaboradores.</li>
        <li><strong>Monte a equipe na obra</strong> — abra o contrato → aba Equipe → adicione quem trabalha lá.</li>
        <li><strong>Faça o RDO do dia</strong> — no contrato → aba RDO → + Novo RDO.</li>
      </ol>

      <div class="man-tip">
        💡 <strong>Dica:</strong> Se você se perdeu, clique no logo do Rhino no canto superior esquerdo da barra lateral. Isso te leva pro Dashboard (página inicial).
      </div>

      <h2>Conceitos importantes (leia antes!)</h2>
      <dl class="man-glossary">
        <dt>Contrato</dt>
        <dd>Cada obra que sua empresa fechou. Tem nome, cliente, valor, data de início e fim.</dd>
        <dt>RDO</dt>
        <dd>Relatório Diário de Obra — papel (agora digital) que o encarregado preenche todo dia contando o que aconteceu na obra.</dd>
        <dt>MOI e MOD</dt>
        <dd>MOI = Mão de Obra Indireta (engenheiro, técnico, encarregado). MOD = Mão de Obra Direta (mecânico, pedreiro, eletricista).</dd>
        <dt>Organograma</dt>
        <dd>Um desenho tipo árvore mostrando quem manda em quem na obra.</dd>
      </dl>
    `;
  },

  _navegacao() {
    return `
      <h1><span class="ico">🧭</span> Como navegar</h1>
      <p class="man-lead">O Rhino tem 3 áreas principais: <strong>menu lateral</strong> (esquerda), <strong>conteúdo</strong> (centro) e <strong>controles</strong> (rodapé da barra lateral).</p>

      <h2>A barra lateral</h2>
      <p>Fica fixa na esquerda e tem todos os menus principais. Os mais usados no topo, os financeiros num grupo que abre/fecha.</p>

      <div class="man-mockup">
        <div class="man-mockup-label">Como é a barra lateral</div>
        <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:12px;max-width:260px;">
          <div style="font-weight:700;color:var(--color-text);padding-bottom:8px;border-bottom:1px solid var(--color-border);margin-bottom:8px;">🦏 RINO</div>
          <div style="padding:8px 10px;background:rgba(85,88,139,.1);color:var(--color-primary);border-left:3px solid var(--color-primary);border-radius:4px;font-weight:700;font-size:14px;">▦ Dashboard</div>
          <div style="padding:8px 10px;color:var(--color-text);font-size:14px;">≣ Contratos</div>
          <div style="padding:8px 10px;color:var(--color-text);font-size:14px;">⊚ Mapa de Obras</div>
          <div style="padding:8px 10px;color:var(--color-text);font-size:14px;">◎ Clientes</div>
          <div style="padding:8px 10px;color:var(--color-text);font-size:14px;">◉ Recursos</div>
          <div style="padding:8px 10px;color:var(--color-text);font-weight:600;font-size:14px;">◈ Financeiro ›</div>
          <div style="padding:8px 10px;color:var(--color-text);font-size:14px;">⚙️ Configuração</div>
        </div>
      </div>

      <h3>Item marcado em roxo</h3>
      <p>A aba atual fica com uma <strong>barrinha roxa à esquerda</strong> e o texto em roxo. Isso te ajuda a saber onde você está.</p>

      <h3>Financeiro tem submenu</h3>
      <p>Clique em <strong>◈ Financeiro</strong> pra abrir e mostrar: Caixa, Contas a Pagar, Contas a Receber, Sócios, Aportes. Clique de novo pra fechar.</p>

      <h2>Rodapé da barra lateral</h2>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>👤 <strong>Perfil:</strong> mostra quem você é logado. Clique pra trocar de perfil.</li>
        <li>☀/☾ <strong>Tema:</strong> troca entre claro e escuro.</li>
        <li>📖 <strong>Manual:</strong> (é onde você está agora!)</li>
        <li>− / + <strong>Zoom:</strong> diminui ou aumenta o tamanho das letras.</li>
      </ul>

      <div class="man-tip">
        💡 <strong>Dica:</strong> Se as letras ficarem pequenas, clique no <span class="man-kb">+</span> até ficar do tamanho que você gosta. O sistema lembra da escolha.
      </div>
    `;
  },

  _dashboard() {
    return `
      <h1><span class="ico">📊</span> Dashboard</h1>
      <p class="man-lead">É a <strong>página inicial</strong>. Mostra um resumão de tudo: quanto você tem a receber, quanto tem a pagar, saldo do caixa, margem das obras.</p>

      <h2>O que aparece lá?</h2>

      <h3>Cards grandes no topo</h3>
      <p>São 4 números grandes mostrando:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>Contratos Ativos</strong> — quantas obras estão em andamento agora</li>
        <li><strong>Faturamento Total</strong> — quanto todas as obras somam</li>
        <li><strong>Saldo em Caixa</strong> — quanto tem no banco/dinheiro</li>
        <li><strong>Margem Média</strong> — quanto sobra de lucro em média</li>
      </ul>

      <div class="man-mockup">
        <div class="man-mockup-label">Como aparece</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          ${[['7','Contratos Ativos'],['R$ 2.5M','Faturamento'],['R$ 180k','Saldo'],['23%','Margem']].map(([v,l]) => `
            <div class="mock-card" style="text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--color-text);">${v}</div>
              <div style="font-size:12px;color:var(--color-text-muted);">${l}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <h3>Contas a Receber e Contas a Pagar</h3>
      <p>Dois cards coloridos logo abaixo, mostrando <strong>o que entra</strong> (clientes que te devem) e <strong>o que sai</strong> (fornecedores que você deve). Cada um tem uma barrinha mostrando o que está em dia (laranja) e o que venceu (amarelo).</p>

      <h3>Fluxo de Caixa</h3>
      <p>Um gráfico mostrando como o dinheiro entrou e saiu nos últimos meses. Serve pra ver se você está gastando mais ou menos.</p>

      <div class="man-tip">
        💡 <strong>Dica:</strong> Clique em qualquer card (Contratos Ativos, Saldo, etc.) que ele te leva direto pra tela com os detalhes.
      </div>
    `;
  },

  _contratos() {
    return `
      <h1><span class="ico">📄</span> Contratos</h1>
      <p class="man-lead">Cada <strong>contrato</strong> é uma obra que sua empresa fechou com um cliente. É o centro de tudo: dinheiro, equipe, RDO — tudo gira em volta do contrato.</p>

      <h2>Cadastrar um novo contrato</h2>
      <ol class="man-steps">
        <li>Clique em <strong>≣ Contratos</strong> no menu lateral.</li>
        <li>Clique no botão roxo <strong>+ Novo Contrato</strong> no canto superior direito.</li>
        <li>Preencha os campos:
          <ul style="margin-top:8px;">
            <li><strong>Nome</strong> — apelido da obra (ex: "Galpão Norte CMPC")</li>
            <li><strong>Cliente</strong> — quem contratou vocês</li>
            <li><strong>Valor</strong> — quanto o cliente paga no total</li>
            <li><strong>Data de Início e Fim</strong> — prazos contratuais</li>
            <li><strong>Status</strong> — ativo, pausado, concluído, etc.</li>
          </ul>
        </li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>

      <h2>Ver detalhes de um contrato</h2>
      <p>Na lista de contratos, clique em <strong>Ver</strong> numa linha. Abre uma tela com <strong>5 abas</strong>:</p>

      <div class="man-mockup">
        <div class="man-mockup-label">As abas do contrato</div>
        <div class="mock-card">
          <div class="mock-tabs">
            <div class="mock-tab active">◉ Visão Geral</div>
            <div class="mock-tab">◈ Financeiro</div>
            <div class="mock-tab">◎ Equipe</div>
            <div class="mock-tab">📋 RDO</div>
            <div class="mock-tab">⚠ Pendências</div>
          </div>
          <div style="font-size:13px;color:var(--color-text-muted);">Cada aba mostra um tipo de informação do contrato.</div>
        </div>
      </div>

      <h3>Aba Visão Geral</h3>
      <p>Resumo rápido: valor, quanto gastou, saldo, tamanho da equipe e uma barrinha mostrando o quanto já foi usado do orçamento.</p>

      <h3>Aba Financeiro</h3>
      <p>Aqui você <strong>planeja o orçamento</strong> (quanto quer gastar com mão de obra, material, transporte) e vê o que <strong>foi gasto de verdade</strong>. O sistema compara e mostra se você está estourando ou economizando.</p>

      <h3>Aba Equipe</h3>
      <p>Monta o <strong>organograma</strong> da obra: quem é o encarregado, quem é líder de área, quem são os profissionais. Veja a seção "Equipe e Organograma" neste manual.</p>

      <h3>Aba RDO</h3>
      <p>Lista de Relatórios Diários de Obra. É onde você cria o RDO do dia. Ver seção "RDO" deste manual.</p>

      <h3>Aba Pendências</h3>
      <p>Mostra passagens aéreas pendentes, alertas de vencimento. Fica vermelho se tem algo urgente.</p>

      <h2>Editar ou excluir</h2>
      <p>Na lista de contratos, ao lado do nome, tem os botões <strong>Editar</strong> (lápis) e <strong>Excluir</strong> (vermelho). Dentro do contrato, o botão <strong>✏️ Editar Dados</strong> no topo abre os dados pra mudar.</p>

      <div class="man-warn">
        ⚠️ <strong>Cuidado:</strong> Excluir um contrato apaga também o orçamento, organograma e RDOs dele. Não tem como desfazer.
      </div>
    `;
  },

  _equipe() {
    return `
      <h1><span class="ico">👷</span> Equipe e Organograma</h1>
      <p class="man-lead">O <strong>Organograma</strong> mostra quem trabalha na obra e <strong>quem manda em quem</strong> — estilo árvore genealógica. Útil pra quando alguém chega na obra e quer saber com quem falar.</p>

      <h2>Os 3 níveis</h2>
      <p>Toda obra tem no máximo 3 níveis:</p>
      <ol style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>Encarregado</strong> — chefe da obra. Só pode ter <strong>1</strong>.</li>
        <li><strong>Líder de Área</strong> — chefe de uma frente específica (Mecânica, Elétrica, Andaimes). Pode ter vários.</li>
        <li><strong>Profissional</strong> — quem coloca a mão na massa (mecânico, eletricista, caldeireiro…).</li>
      </ol>

      <h2>Como montar o organograma</h2>
      <ol class="man-steps">
        <li>Abra o contrato da obra.</li>
        <li>Clique na aba <strong>◎ Equipe</strong>.</li>
        <li>Clique em <strong>+ Adicionar Membro</strong>.</li>
        <li>Escolha o <strong>Recurso</strong> (funcionário que já deve estar cadastrado em "Recursos").</li>
        <li>O nível aparece <strong>automaticamente</strong> pela profissão dele. Se a profissão for "Encarregado", o nível vira Encarregado. Se for "Líder de Mecânica", vira Líder.</li>
        <li>Se for Líder, escreva a <strong>Área</strong> (ex: "Mecânica", "Elétrica").</li>
        <li>Se for Profissional, escolha o <strong>Supervisor</strong> (qual líder ele se reporta).</li>
        <li>Clique em <strong>Adicionar</strong>.</li>
      </ol>

      <h2>Arrastando pra reorganizar</h2>
      <p>Você pode <strong>arrastar</strong> um card sobre outro pra mudar o chefe. É só clicar e segurar. O sistema mostra:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>🟡 <strong>Amarelo</strong> = pode soltar aqui</li>
        <li>🔴 <strong>Vermelho</strong> = não pode (ex: não dá pra colocar um chefe embaixo do subordinado dele)</li>
      </ul>

      <h2>Clicar no nome</h2>
      <p>Clicar no <strong>nome</strong> de um colaborador abre um modal com:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>Próxima folga (contagem regressiva)</li>
        <li>Dados pessoais (CPF, telefone, endereço…)</li>
        <li>Histórico de folgas e passagens</li>
        <li>Documentação (quais estão vencidos)</li>
      </ul>

      <div class="man-tip">
        💡 <strong>Visão Lista vs Hierarquia:</strong> No topo da aba Equipe tem dois botões: <strong>Hierarquia</strong> (árvore visual) e <strong>Lista</strong> (tabela simples). Use o que for mais útil.
      </div>
    `;
  },

  _rdo() {
    return `
      <h1><span class="ico">📋</span> RDO — Relatório Diário de Obra</h1>
      <p class="man-lead">RDO é um <strong>papel que a obra preenche todo dia</strong>. Dizendo: quem trabalhou, o tempo (sol/chuva), o que foi feito, se aconteceu algum acidente. Agora está digital e vira PDF no final.</p>

      <h2>Criar um RDO</h2>
      <ol class="man-steps">
        <li>Entre no contrato da obra.</li>
        <li>Clique na aba <strong>📋 RDO</strong>.</li>
        <li>Clique em <strong>+ Novo RDO</strong>.</li>
        <li>Preencha as <strong>8 abas</strong> (explicadas abaixo).</li>
        <li>Clique em <strong>Criar RDO</strong>.</li>
      </ol>

      <h2>As 8 abas do RDO</h2>

      <h3>1️⃣ Cabeçalho</h3>
      <p>Já vem preenchido com os dados do contrato: projeto, ordem de compra, datas de prazo. Você só precisa:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>Confirmar a <strong>Data</strong> (por padrão é hoje)</li>
        <li>Escrever o <strong>Nº da Ordem de Serviço</strong> do dia</li>
        <li>Escolher o <strong>Período de Trabalho</strong> (7 às 15, 7 às 17, 23 às 7…)</li>
        <li>Marcar se teve <strong>Hora Extra</strong></li>
        <li>Atualizar a <strong>% Concluída</strong> da obra</li>
      </ul>

      <h3>2️⃣ Tempo</h3>
      <p>Diz como estava o clima em cada período:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>Manhã</strong> — Bom, Chuva, Não Houve, Sem Expediente</li>
        <li><strong>Tarde</strong> — igual</li>
        <li><strong>Noite Ant.</strong> — por padrão vem "Sem Expediente"</li>
        <li><strong>Precipitação</strong> em milímetros (se choveu)</li>
      </ul>

      <h3>3️⃣ Mão de Obra</h3>
      <p><strong>Já vem preenchido automaticamente</strong> com base no organograma da obra. Você só ajusta as <strong>quantidades</strong> e <strong>horas</strong> trabalhadas de cada cargo. Tem três seções:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>MOI</strong> — Mão de Obra Indireta (engenheiro, técnico, encarregado, líder)</li>
        <li><strong>MOD</strong> — Mão de Obra Direta (mecânico, eletricista, pedreiro…)</li>
        <li><strong>Terceirizados</strong> — empresas contratadas (ex: SOLDAS RIO LTDA)</li>
      </ul>

      <h3>4️⃣ Equipamentos</h3>
      <p>Liste os equipamentos usados (retroescavadeira, máquina de solda, betoneira…) com quantidade e horas.</p>

      <h3>5️⃣ Atividades</h3>
      <p>O <strong>coração do RDO</strong>. Cada linha é uma atividade:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>Área</strong> — Mecânica, Elétrica, Concreto…</li>
        <li><strong>Descrição</strong> — o que foi feito (ex: "Montagem de tubulação no trecho norte")</li>
        <li><strong>% Concluída</strong> — quanto dessa atividade está pronto</li>
        <li><strong>Ocorrências</strong> — problemas, observações</li>
      </ul>

      <h3>6️⃣ Segurança</h3>
      <p>Preenche:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li><strong>Tema do DDS</strong> — diálogo diário de segurança (ex: "Uso de EPI em área úmida")</li>
        <li><strong>Tema de Meio Ambiente</strong></li>
        <li>Se houve <strong>Acidente</strong> (não houve, sem afastamento, com afastamento)</li>
        <li><strong>Admissões e Demissões</strong> do dia</li>
        <li><strong>Comentários</strong> gerais</li>
      </ul>

      <h3>7️⃣ Fiscalização</h3>
      <p>Campo livre pra escrever o que o fiscal falou/pediu no dia.</p>

      <h3>8️⃣ Fotos</h3>
      <p><strong>Só aparece depois de salvar o RDO.</strong> Pra adicionar fotos:</p>
      <ol class="man-steps">
        <li>Salve o RDO primeiro (botão Criar RDO).</li>
        <li>Clique em <strong>Editar</strong> na lista.</li>
        <li>Vá na aba <strong>Fotos</strong>.</li>
        <li>(Opcional) escreva uma <strong>legenda</strong> que valerá pra todas as fotos que vai anexar agora.</li>
        <li>Clique em <strong>📷 Adicionar Fotos</strong>, selecione uma ou várias imagens.</li>
      </ol>

      <h2>Gerar o PDF</h2>
      <p>Na lista de RDOs, cada linha tem o botão <strong>📄 PDF</strong>. Clica e baixa um arquivo bonitinho no formato Usiminas, com:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>Logo da empresa no topo</li>
        <li>Todos os dados em tabelas organizadas</li>
        <li>Fotos em páginas extras</li>
        <li>Espaço pra assinatura no rodapé</li>
      </ul>

      <div class="man-tip">
        💡 <strong>Data de Tendência:</strong> se a obra atrasar, edita o contrato e coloca a nova <strong>Data de Tendência</strong>. O RDO passa a mostrar "Atraso de X dias" automaticamente.
      </div>

      <div class="man-warn">
        ⚠️ <strong>Não dá pra ter 2 RDOs no mesmo dia.</strong> Se tentar criar um pra uma data que já tem RDO, o sistema avisa.
      </div>
    `;
  },

  _obras() {
    return `
      <h1><span class="ico">🏗️</span> Mapa de Obras</h1>
      <p class="man-lead">Mostra todas as obras num <strong>mapa interativo</strong>. Útil pra ver onde está cada uma, distância, e planejar visitas.</p>

      <h2>Como usar</h2>
      <ol class="man-steps">
        <li>Menu lateral → <strong>⊚ Mapa de Obras</strong>.</li>
        <li>O mapa abre mostrando marcadores pra cada obra cadastrada (que tenha endereço).</li>
        <li>Use os filtros no topo (Status, Cliente, datas) pra ver só algumas obras.</li>
        <li>Clique num marcador pra ver o popup com nome, cliente, valor.</li>
      </ol>

      <h2>Botão ✕ Limpar</h2>
      <p>Se você usou filtros e quer voltar a ver tudo, clique no botão <strong>✕ Limpar</strong>.</p>

      <div class="man-tip">
        💡 A obra precisa ter <strong>endereço</strong> cadastrado pra aparecer no mapa. Edite o contrato e preencha o endereço pra ela aparecer.
      </div>
    `;
  },

  _recursos() {
    return `
      <h1><span class="ico">👥</span> Recursos (Colaboradores)</h1>
      <p class="man-lead"><strong>Recursos</strong> = pessoas que trabalham na empresa. Funcionários ativos, candidatos ou ex-funcionários. Tudo que você precisa saber sobre cada um.</p>

      <h2>Cadastrar um colaborador</h2>
      <ol class="man-steps">
        <li>Menu → <strong>◉ Recursos</strong> → <strong>+ Novo Cadastro</strong>.</li>
        <li>Preencha os dados pessoais: nome, CPF, telefone, endereço.</li>
        <li><strong>Status</strong> — escolha Candidato, Funcionário Ativo ou Ex-Funcionário.</li>
        <li><strong>Profissão</strong> — ex: "Mecânico", "Eletricista", "Encarregado".</li>
        <li><strong>Categoria no RDO</strong> — MOI ou MOD. Serve pra o RDO saber em qual caixinha colocar.</li>
        <li>Se for Funcionário Ativo, preencha alocação (qual contrato), ciclo de trabalho (ex: 21 dias trabalhando / 7 folga).</li>
      </ol>

      <h2>Lista de colaboradores</h2>
      <p>A tela principal mostra uma tabela com todos. Cada linha tem:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>Nome, CPF, profissão, status</li>
        <li><strong>Obra Atual</strong> — em qual contrato está alocado</li>
        <li><strong>Próxima Folga</strong> — quando pode tirar. Fica vermelho se está atrasada, amarelo se chega em 5 dias.</li>
        <li>Ações: Folgas, Docs, Distâncias, Editar, Excluir</li>
      </ul>

      <h3>Botão "Folgas"</h3>
      <p>Abre um modal com todas as folgas do colaborador. Dá pra lançar nova folga e marcar se a passagem foi comprada.</p>

      <h3>Botão "Docs"</h3>
      <p>Documentação do colaborador (PCMSO, ASO, certificados). Mostra o que tá vencido.</p>

      <h3>Botão "Distâncias"</h3>
      <p>Mostra num mapa a distância da casa do colaborador até cada obra ativa. <strong>Usa as rodovias reais</strong> (não linha reta). Dá pra ver em quanto tempo ele chega de carro.</p>

      <div class="man-tip">
        💡 Por que cadastrar MOI/MOD? Quando você criar um RDO, o sistema usa essa informação pra colocar automaticamente cada pessoa na caixinha certa.
      </div>
    `;
  },

  _clientes() {
    return `
      <h1><span class="ico">◎</span> Clientes</h1>
      <p class="man-lead">Lista das empresas/pessoas que contratam seus serviços.</p>

      <h2>Cadastrar</h2>
      <ol class="man-steps">
        <li>Menu → <strong>◎ Clientes</strong> → <strong>+ Novo Cliente</strong>.</li>
        <li>Preencha: Nome, CNPJ/CPF, contato principal, email, telefone, endereço.</li>
        <li>Salve.</li>
      </ol>

      <p>Depois, quando criar um contrato, o campo "Cliente" já vai sugerir os cadastrados.</p>
    `;
  },

  _fornecedores() {
    return `
      <h1><span class="ico">⬡</span> Fornecedores</h1>
      <p class="man-lead">Empresas de quem você compra material, aluga equipamento ou contrata serviço.</p>

      <h2>Cadastrar</h2>
      <ol class="man-steps">
        <li>Menu → <strong>⬡ Fornecedores</strong> → <strong>+ Novo Fornecedor</strong>.</li>
        <li>Preencha os dados.</li>
        <li>Na hora de lançar uma <strong>Conta a Pagar</strong>, você escolhe qual fornecedor é.</li>
      </ol>
    `;
  },

  _documentos() {
    return `
      <h1><span class="ico">📑</span> Documentação</h1>
      <p class="man-lead">Painel que consolida toda a <strong>documentação dos colaboradores</strong>. Mostra o que está vencido, o que vence em breve, o que está OK.</p>

      <h2>Como funciona</h2>
      <p>Cada colaborador tem vários documentos (ASO, PCMSO, Certificados, Permissões...). O sistema monitora as datas de vencimento e alerta.</p>

      <h2>Indicadores</h2>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>🔴 <strong>Vencido</strong> — precisa renovar já</li>
        <li>🟡 <strong>Vence em ≤30 dias</strong> — providenciar</li>
        <li>🟢 <strong>Válido</strong> — tudo certo</li>
      </ul>

      <div class="man-tip">
        💡 O menu lateral mostra um <strong>número vermelho</strong> ao lado de "Documentação" quando tem documentos vencidos. Clique pra resolver.
      </div>
    `;
  },

  _caixa() {
    return `
      <h1><span class="ico">◇</span> Caixa</h1>
      <p class="man-lead">É o <strong>extrato</strong> do dinheiro da empresa. Cada entrada (cliente pagou, aporte de sócio) e cada saída (pagou fornecedor, combustível, salário...).</p>

      <h2>Lançar entrada ou saída</h2>
      <ol class="man-steps">
        <li>Menu → <strong>Financeiro → ◇ Caixa</strong>.</li>
        <li>Clique em <strong>+ Nova Entrada</strong> ou <strong>+ Nova Saída</strong>.</li>
        <li>Preencha: data, descrição, valor, categoria, em qual contrato (se aplicável).</li>
        <li>Salve.</li>
      </ol>

      <div class="man-tip">
        💡 Na verdade, você raramente precisa lançar manualmente. A maioria das entradas/saídas vem <strong>automaticamente</strong> quando você:
        <ul style="margin-top:6px;">
          <li>Marca uma NF como "Recebida" (Contas a Receber)</li>
          <li>Paga uma Conta a Pagar</li>
          <li>Registra um Aporte</li>
        </ul>
      </div>
    `;
  },

  _contaspagar() {
    return `
      <h1><span class="ico">⊖</span> Contas a Pagar</h1>
      <p class="man-lead">Lista de <strong>boletos, notas, faturas</strong> que você tem que pagar pra alguém. Serve pra não esquecer e não atrasar.</p>

      <h2>Lançar uma conta</h2>
      <ol class="man-steps">
        <li>Menu → <strong>Financeiro → ⊖ Contas a Pagar</strong>.</li>
        <li>Clique em <strong>+ Nova Conta</strong>.</li>
        <li>Preencha:
          <ul>
            <li><strong>Descrição</strong> (ex: "Aluguel galpão abril")</li>
            <li><strong>Fornecedor</strong> (escolhe da lista)</li>
            <li><strong>Valor</strong> e <strong>Data de Vencimento</strong></li>
            <li><strong>Contrato</strong> (opcional, se essa despesa é de uma obra específica)</li>
          </ul>
        </li>
        <li>Status inicial fica <strong>Pendente</strong>.</li>
      </ol>

      <h2>Filtrar a lista</h2>
      <p>No topo tem 3 botões coloridos:</p>
      <ul style="padding-left:22px;line-height:1.7;font-size:15px;">
        <li>⏳ <strong>Pendentes</strong> (laranja) — contas ainda em aberto</li>
        <li>✅ <strong>Pagas</strong> (verde) — já quitadas</li>
        <li>📋 <strong>Todas</strong> (roxo) — ver tudo</li>
      </ul>

      <h2>Pagar uma conta</h2>
      <ol class="man-steps">
        <li>Na linha da conta, clique em <strong>Pagar</strong>.</li>
        <li>Preencha data do pagamento, valor pago, forma (PIX, boleto, dinheiro...).</li>
        <li>Confirma. O sistema <strong>lança automaticamente no Caixa</strong> como saída.</li>
      </ol>

      <div class="man-tip">
        💡 Se errou e pagou a conta errada, clique em <strong>Estornar</strong> na linha. Volta pra pendente e tira do caixa.
      </div>
    `;
  },

  _contasreceber() {
    return `
      <h1><span class="ico">☐</span> Contas a Receber</h1>
      <p class="man-lead">São as <strong>Notas Fiscais</strong> que você emitiu pros clientes e está esperando o pagamento.</p>

      <h2>Lançar NF</h2>
      <ol class="man-steps">
        <li>Menu → <strong>Financeiro → ☐ Contas a Receber</strong>.</li>
        <li>Clique em <strong>+ Nova NF</strong>.</li>
        <li>Preencha: número da NF, contrato, valor, data limite para emissão, prazo de recebimento (dias).</li>
      </ol>

      <h2>Marcar como emitida/recebida</h2>
      <p>Quando você realmente emitir a NF e depois receber o pagamento, marca na lista. O sistema <strong>lança no Caixa como entrada</strong> automaticamente.</p>
    `;
  },

  _socios() {
    return `
      <h1><span class="ico">⊕</span> Sócios</h1>
      <p class="man-lead">Cadastro dos sócios da empresa e o percentual de cada um. Usado pra calcular quando tem <strong>Aporte</strong> (sócio botou dinheiro).</p>

      <h2>Cadastrar sócio</h2>
      <ol class="man-steps">
        <li>Menu → <strong>Financeiro → ⊕ Sócios</strong> → <strong>+ Novo Sócio</strong>.</li>
        <li>Nome, CPF, percentual de participação.</li>
        <li>Salva.</li>
      </ol>
    `;
  },

  _aportes() {
    return `
      <h1><span class="ico">△</span> Aportes</h1>
      <p class="man-lead">Quando um <strong>sócio coloca dinheiro</strong> na empresa (fora do pró-labore/lucro). Ou quando a empresa transfere dinheiro pra obra específica.</p>

      <h2>Lançar aporte</h2>
      <ol class="man-steps">
        <li>Menu → <strong>Financeiro → △ Aportes</strong> → <strong>+ Novo Aporte</strong>.</li>
        <li>Escolha a <strong>origem</strong>:
          <ul>
            <li>👥 <strong>Sócio</strong> — dinheiro de um sócio</li>
            <li>💰 <strong>Caixa Empresa</strong> — a empresa transferiu pra obra</li>
          </ul>
        </li>
        <li>Preencha valor, data, contrato de destino (se for pra uma obra).</li>
      </ol>
    `;
  },

  _base() {
    return `
      <h1><span class="ico">⊟</span> BASE — Custo Rateado</h1>
      <p class="man-lead">BASE é o <strong>custo que não é de uma obra só</strong>: aluguel do escritório, salário da secretária, internet, contador... Como o rateio funciona? Esses valores são divididos entre as obras ativas.</p>

      <h2>Cadastrar um item BASE</h2>
      <ol class="man-steps">
        <li>Menu → <strong>⊟ BASE</strong> → <strong>+ Novo Item</strong>.</li>
        <li>Escolha o <strong>tipo</strong> (fixo, variável, homem-hora, veículo...).</li>
        <li>Descrição (ex: "Aluguel galpão"), valor, mês.</li>
        <li>Se for recorrente (sai todo mês), marca.</li>
      </ol>

      <h2>Como é rateado</h2>
      <p>O total do mês é dividido entre as obras ativas. Cada obra "absorve" uma parte proporcional. Você vê isso na aba <strong>Financeiro</strong> de cada contrato, como "Custo BASE Alocado".</p>

      <h2>Navegação por mês</h2>
      <p>No topo tem <strong>← →</strong> e um dropdown de mês. Use pra ver ou lançar custos de meses anteriores.</p>
    `;
  },

  _configuracao() {
    return `
      <h1><span class="ico">⚙️</span> Configuração</h1>
      <p class="man-lead">Configurações gerais do sistema: perfis de acesso, tipos de custo base, templates de documentos, etc.</p>

      <h2>Níveis de Acesso</h2>
      <p>Cria perfis como "Gerente", "Fiscal", "Engenheiro" e define quais menus cada um pode ver. Quando alguém loga, escolhe o perfil dele.</p>

      <h2>Tipos de Custo BASE</h2>
      <p>Edita os tipos disponíveis na tela BASE (fixo, variável, homem-hora...).</p>

      <h2>Templates de Documentos</h2>
      <p>Define quais documentos cada tipo de colaborador precisa ter (ex: Operador → CNH, NR-11, NR-35).</p>
    `;
  },

  _atalhos() {
    return `
      <h1><span class="ico">⌨</span> Atalhos e Dicas</h1>

      <h2>Zoom da interface</h2>
      <p>No rodapé da barra lateral tem <span class="man-kb">−</span> <span class="man-kb">%</span> <span class="man-kb">+</span>. Aumenta ou diminui o tamanho das letras do app inteiro. Clicar no percentual (100%) volta ao padrão.</p>

      <h2>Temas</h2>
      <p>Botão ☀/☾ no rodapé troca entre tema claro (padrão) e escuro.</p>

      <h2>Trocar perfil</h2>
      <p>Botão do nome do perfil no rodapé — clica pra escolher outro perfil sem precisar relogar.</p>

      <h2>Recarregar dados</h2>
      <p>Se você trocou algo e não apareceu na tela, dê um <span class="man-kb">F5</span> pra recarregar.</p>

      <h2>Onde estão meus arquivos?</h2>
      <p>As fotos dos RDOs ficam em <code>data/rdo-fotos/</code> dentro da pasta do Rhino. Os dados gerais em arquivos <code>.json</code> em <code>data/</code>.</p>
    `;
  },

  _glossario() {
    return `
      <h1><span class="ico">📚</span> Glossário</h1>
      <p class="man-lead">Os termos que mais aparecem no Rhino, explicados.</p>

      <dl class="man-glossary">
        <dt>Aporte</dt>
        <dd>Dinheiro que um sócio (ou a empresa matriz) coloca na obra.</dd>

        <dt>BASE</dt>
        <dd>Custos da empresa que não são de uma obra só (aluguel, secretária, contador...). São divididos entre as obras ativas.</dd>

        <dt>Caixa</dt>
        <dd>Extrato do dinheiro da empresa. Entradas (receitas) e saídas (despesas).</dd>

        <dt>Contrato</dt>
        <dd>Uma obra fechada com um cliente. Tem nome, valor total, datas, orçamento e equipe próprios.</dd>

        <dt>DDS</dt>
        <dd>Diálogo Diário de Segurança. Conversa rápida no início do turno sobre um tema de segurança.</dd>

        <dt>Encarregado</dt>
        <dd>Chefe da obra. Só pode ter um por contrato. Fica no topo do organograma.</dd>

        <dt>Faltante</dt>
        <dd>Quantos dias faltam até a data de tendência. Se a tendência for depois do contratual, vira "Atraso".</dd>

        <dt>Líder de Área</dt>
        <dd>Chefe de uma frente específica (Mecânica, Elétrica, Andaimes). Se reporta ao Encarregado.</dd>

        <dt>MOD</dt>
        <dd>Mão de Obra Direta — quem executa o serviço (mecânico, pedreiro, eletricista...).</dd>

        <dt>MOI</dt>
        <dd>Mão de Obra Indireta — quem dá suporte (engenheiro, técnico, encarregado, aux. administrativo...).</dd>

        <dt>NF</dt>
        <dd>Nota Fiscal. Documento que você emite pro cliente pra receber o pagamento.</dd>

        <dt>Organograma</dt>
        <dd>Desenho em árvore da hierarquia da obra: Encarregado → Líderes → Profissionais.</dd>

        <dt>OS</dt>
        <dd>Ordem de Serviço. Número que identifica o trabalho do dia.</dd>

        <dt>RDO</dt>
        <dd>Relatório Diário de Obra. Preenchido todo dia — quem trabalhou, tempo, atividades, segurança.</dd>

        <dt>Tendência</dt>
        <dd>Previsão atualizada do fim da obra. Pode ser igual, menor ou maior que a Data de Término contratual.</dd>

        <dt>Terceirizados</dt>
        <dd>Profissionais que não são funcionários da sua empresa — vêm de outra empresa contratada.</dd>
      </dl>
    `;
  },

  _attachListeners() {
    document.querySelectorAll('[data-man-sec]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._secao = e.currentTarget.dataset.manSec;
        this.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }
};
