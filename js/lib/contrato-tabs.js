/* Rhino · Registry das abas do detalhe de contrato.

   Fonte única de "que abas existem, em que grupo, e quem pode ver cada uma".
   Antes isso era um array literal dentro de um template string de 1.378 linhas
   (ContratoDetail.js) e o corpo de cada aba era uma cadeia de ternários no
   mesmo template — o que causava dois problemas concretos:

     1. O filtro de permissão rodava no BOTÃO, mas o corpo renderizava sem
        checar: perfil sem acesso a `visao` não via a aba e mesmo assim recebia
        o resumo financeiro. Com dispatch único, botão e corpo passam pelo
        mesmo portão.
     2. `?tab=` desconhecido não casava nenhum ternário → tela em branco
        silenciosa. Agora `resolveTab` sempre devolve uma folha válida.

   Puro de propósito (sem DOM, sem Store, sem fetch), igual js/lib/hash-route.js:
   é carregado EAGER no index.html porque js/app.js#podeContractTab precisa dele
   no boot, e precisa ser testável fora do browser (test/contrato-tabs.test.js).

   `render`/`attach`/`load` são NOMES de método (string), não funções — é isso
   que mantém o módulo puro; quem despacha faz `this[def.render](...)`.
*/
(function () {
  'use strict';

  /** Grupos da barra de navegação, na ordem de exibição. */
  const GRUPOS = [
    { k: 'painel',     l: 'Painel',                icon: 'home' },
    { k: 'execucao',   l: 'Execução',              icon: 'clipboard' },
    { k: 'financeiro', l: 'Financeiro',            icon: 'dollar-sign' },
    { k: 'qualidade',  l: 'Qualidade & Segurança', icon: 'shield' },
    { k: 'equipe',     l: 'Equipe',                icon: 'users' },
  ];

  /**
   * As folhas. `perm` é a chave gravada como `contrato-tab:<perm>` no JSONB do
   * nível de acesso — o formato de armazenamento NÃO muda, então nenhum perfil
   * existente quebra. `universal: true` = qualquer perfil autenticado vê
   * (eram hardcoded em js/app.js:738).
   */
  const TABS = [
    // ── Painel ──
    { k: 'painel',      grupo: 'painel',     l: 'Visão Geral', icon: 'eye',
      perm: 'painel',      render: null, universal: false },
    { k: 'timeline',    grupo: 'painel',     l: 'Linha do tempo', icon: 'git-commit',
      perm: 'timeline',    render: 'renderTimelineSection', universal: true },

    // ── Execução ──
    { k: 'rdo',         grupo: 'execucao',   l: 'RDO', icon: 'clipboard',
      perm: 'rdo',         render: 'renderRdoSection', attach: '_attachRdoListeners',
      universal: false, badge: 'rdoAtrasado' },
    { k: 'cronograma',  grupo: 'execucao',   l: 'Cronograma', icon: 'calendar',
      perm: 'cronograma',  render: 'renderCronogramaSection', load: '_loadAtividades',
      universal: true },
    { k: 'marcos',      grupo: 'execucao',   l: 'Marcos', icon: 'check-square',
      perm: 'marcos',      render: 'renderMarcosSection', attach: '_attachMarcosListeners',
      universal: false, badge: 'marcosAbertos' },
    { k: 'medicao',     grupo: 'execucao',   l: 'Medição', icon: 'list',
      perm: 'medicao',     render: 'renderMedicaoSection', attach: '_attachMedicaoListeners',
      universal: true },

    // ── Financeiro ──
    { k: 'financeiro',  grupo: 'financeiro', l: 'Resumo financeiro', icon: 'dollar-sign',
      perm: 'financeiro',  render: null, universal: false },
    { k: 'dre',         grupo: 'financeiro', l: 'DRE / Margem', icon: 'trending-up',
      perm: 'dre',         render: 'renderDreSection', load: '_loadDre', universal: false },
    { k: 'evm',         grupo: 'financeiro', l: 'Curva S / EVM', icon: 'bar-chart-2',
      perm: 'evm',         render: 'renderEvmSection', load: '_loadEvm', universal: false },
    { k: 'aditivos',    grupo: 'financeiro', l: 'Aditivos', icon: 'plus-circle',
      perm: 'aditivos',    render: 'renderAditivosSection', attach: '_attachAditivosListeners',
      universal: false, badge: 'aditivosAbertos' },
    { k: 'pendencias',  grupo: 'financeiro', l: 'Previsão de desembolso', icon: 'alert-triangle',
      perm: 'pendencias',  render: null, universal: false, badge: 'passagensPendentes' },

    // ── Qualidade & Segurança ──
    // Punch, SSMA e Ocorrências viraram UMA folha: eram três telas quase
    // idênticas e o mesmo acidente cabia nas três. A leitura é unificada; a
    // escrita continua indo pra origem certa (as 3 tabelas seguem existindo,
    // e `ssma_ocorrencias` guarda os campos legais que alimentam TF/TG).
    { k: 'qualidade',   grupo: 'qualidade',  l: 'Ocorrências', icon: 'alert-triangle',
      perm: 'qualidade',   render: 'renderQualidadeSection', load: '_loadQualidade',
      universal: false, badge: 'ocorrenciasAbertas' },
    { k: 'databook',    grupo: 'qualidade',  l: 'Data book', icon: 'check-square',
      perm: 'databook',    render: 'renderDatabookSection', load: '_loadDatabook', universal: false },

    // ── Equipe ──
    { k: 'equipe',      grupo: 'equipe',     l: 'Organograma', icon: 'users',
      perm: 'equipe',      render: 'renderOrganogramaSection', universal: false },
  ];

  /** Folha usada quando a chave pedida não existe (era tela em branco). */
  const TAB_PADRAO = 'painel';

  /**
   * Chave antiga → chave nova. Mantém link já compartilhado (WhatsApp, e-mail)
   * funcionando quando uma aba é renomeada ou fundida. `filtro` é aplicado na
   * folha destino, pra quem abre o link ver o mesmo recorte que o remetente.
   *
   * A Fase 4 acrescenta 'punch'/'ssma'/'ocorrencias' → 'qualidade' quando as
   * três abas viram uma só.
   */
  const ALIASES = {
    // A aba de aterrissagem mudou de chave junto com o propósito: era um
    // resumo financeiro ("visão geral"), passa a ser o painel da obra.
    visao: 'painel',
    // As três abas de qualidade/segurança viraram uma. Quem receber um link
    // antigo cai na aba nova JÁ FILTRADA na origem que o remetente estava
    // vendo — sem isso o link continuaria "funcionando" mas mostrando outra coisa.
    punch: 'qualidade',
    ssma: 'qualidade',
    ocorrencias: 'qualidade',
  };
  /** Filtro aplicado ao chegar por um alias. */
  const ALIAS_FILTRO = {
    punch: { origem: 'punch' },
    ssma: { origem: 'ssma' },
    ocorrencias: { origem: 'geral' },
  };

  const _porChave = () => Object.fromEntries(TABS.map((t) => [t.k, t]));

  /**
   * Única porta de entrada para "que aba é esta?". Nunca devolve undefined.
   * @param {string} raw chave crua (de `?tab=`, de clique, ou do estado)
   * @returns {{k:string, grupo:string, def:object, filtro:object|null, viaAlias:boolean}}
   */
  function resolveTab(raw) {
    const mapa = _porChave();
    const chave = String(raw ?? '');
    let k = chave;
    let viaAlias = false;

    if (!mapa[k] && Object.prototype.hasOwnProperty.call(ALIASES, k)) {
      k = ALIASES[k];
      viaAlias = true;
    }
    if (!mapa[k]) {
      k = TAB_PADRAO;
      viaAlias = false;
    }
    const def = mapa[k];
    return {
      k,
      grupo: def.grupo,
      def,
      filtro: viaAlias ? ALIAS_FILTRO[chave] || null : null,
      viaAlias,
    };
  }

  /**
   * Constrói o predicado de permissão a partir das `abas` do nível de acesso.
   * Mesmas regras de js/app.js#podeContractTab, agora com a lista de chaves
   * vindo do registry em vez de hardcoded.
   *
   * @param {string[]|null} abas `null` = sem perfil (super admin) = tudo liberado.
   * @returns {(k:string) => boolean}
   */
  function fazerPodeTab(abas) {
    if (!abas) return () => true;
    const contractTabs = abas.filter(
      (a) => typeof a === 'string' && a.startsWith('contrato-tab:')
    );
    // Válvula legada: perfil que nunca configurou aba de contrato vê tudo.
    // Remover isto trancaria usuários existentes pra fora.
    if (contractTabs.length === 0) return () => true;

    const liberadas = new Set(contractTabs.map((a) => a.slice('contrato-tab:'.length)));
    // Alias SOMA acesso, nunca remove: perfil gravado com a chave antiga
    // continua enxergando a folha que herdou aquele conteúdo.
    for (const [antiga, nova] of Object.entries(ALIASES)) {
      if (liberadas.has(antiga)) liberadas.add(nova);
    }

    const mapa = _porChave();
    return (k) => {
      const def = mapa[k];
      if (!def) return false;
      if (def.universal) return true;
      return liberadas.has(def.perm || def.k);
    };
  }

  /** Folhas de um grupo, na ordem declarada. */
  function tabsDoGrupo(grupoK) {
    return TABS.filter((t) => t.grupo === grupoK);
  }

  /** Grupos com ao menos uma folha visível pro perfil. */
  function gruposVisiveis(pode) {
    return GRUPOS.filter((g) => tabsDoGrupo(g.k).some((t) => pode(t.k)));
  }

  /**
   * Primeira folha que o perfil pode abrir, percorrendo TODAS na ordem
   * declarada. A versão antiga (js/app.js:745-748) conhecia só 7 das 16 chaves
   * e caía num `|| 'visao'` que podia estar bloqueado — resultado: barra de
   * abas sem nenhuma ativa e corpo vazio.
   */
  function primeiraTabPermitida(pode) {
    const achou = TABS.find((t) => pode(t.k));
    return achou ? achou.k : TAB_PADRAO;
  }

  window.ContratoTabs = {
    GRUPOS,
    TABS,
    TAB_PADRAO,
    ALIASES,
    ALIAS_FILTRO,
    resolveTab,
    fazerPodeTab,
    tabsDoGrupo,
    gruposVisiveis,
    primeiraTabPermitida,
  };
})();
