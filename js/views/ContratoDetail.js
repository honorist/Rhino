// Cargos disponíveis para o organograma (lista fixa)
const CARGOS_ORGANOGRAMA = [
  'Encarregado',
  'Líder de Área',
  'Mecânico',
  'Eletricista',
  'Caldeireiro',
  'Montador de Andaime',
  'Técnico de Segurança',
  'Soldador',
  'Ajudante'
];

const NIVEIS_ORGANOGRAMA = [
  { v: 'encarregado',  l: 'Encarregado'   },
  { v: 'lider_area',   l: 'Líder de Área' },
  { v: 'profissional', l: 'Profissional'  }
];

const NIVEL_LABEL = { encarregado: 'Encarregado', lider_area: 'Líder de Área', profissional: 'Profissional' };
// Paleta Akaunting (cores oficiais extraídas do CSS deles): slate-purple / sage green / gray
const NIVEL_COR   = { encarregado: '#55588B',      lider_area: '#6D9480',       profissional: '#9CA3AF'      };

// ═══ RDO — listas do modelo Usiminas ═══
const RDO_MOI_CARGOS = [
  'Engenheiro', 'Téc. de Planejamento', 'Topógrafo', 'Aux. Administrativo',
  'Coord. de Segurança', 'Téc. de Segurança', 'Encarregado de Obras'
];
const RDO_MOD_CARGOS = [
  'Pedreiro', 'Carpinteiro', 'Armador', 'Ajudante', 'Meio Oficial',
  'Montador', 'Pintor', 'Eletricista', 'Serralheiro', 'Bombeiro Hidráulico',
  'Operador Betoneira', 'Motorista', 'Soldador', 'Caldeireiro', 'Mecânico',
  'Montador de Andaime'
];
const RDO_EQP_TIPOS = [
  'Retroescavadeira', 'Lixadeira', 'Dumper', 'Serra Circular', 'Parafusadeira',
  'Martelete', 'Caminhão Munck', 'Maçarico', 'Máquina de Solda', 'Betoneira',
  'Plataforma', 'Compactador', 'Gerador', 'Guincho'
];
const RDO_CARGO_CATEGORIA_MOI = new Set([
  'Engenheiro', 'Téc. de Planejamento', 'Topógrafo', 'Aux. Administrativo',
  'Coord. de Segurança', 'Téc. de Segurança', 'Encarregado de Obras',
  'Encarregado', 'Líder de Área', 'Líder'
]);
const RDO_TEMPO_OPCOES = [
  { v: 'bom',            l: 'Bom'           },
  { v: 'chuva',          l: 'Chuva'         },
  { v: 'nao_houve',      l: 'Não Houve'     },
  { v: 'sem_expediente', l: 'Sem Expediente' }
];
const RDO_COND_OPCOES = [
  { v: 'operavel',   l: 'Operável'         },
  { v: 'parcial',    l: 'Op. Parcialmente' },
  { v: 'inoperavel', l: 'Inoperável'       }
];

// Deduz o nível hierárquico a partir da profissão cadastrada no recurso.
function inferirNivelOrganograma(profissao) {
  const p = (profissao || '').toLowerCase().trim();
  if (!p) return 'profissional';
  if (p.includes('encarregado')) return 'encarregado';
  if (p.includes('líder') || p.includes('lider') || p.includes('supervisor') || p.includes('coordenador')) return 'lider_area';
  return 'profissional';
}

window.ContratoDetail = {
  chart: null,
  _organogramaView: 'hierarquia',
  _tab: 'visao',  // visao | financeiro | equipe | pendencias

  async render(params) {
    const app = document.getElementById('app');
    const contractId = params?.id;

    // Se a aba atual não é permitida pelo perfil, escolhe a primeira liberada.
    if (window.perfil && !window.perfil.podeContractTab(this._tab)) {
      this._tab = window.perfil.primeiraContractTab();
    }

    if (!contractId) {
      app.innerHTML = '<div class="card"><p class="text-danger">Contrato não encontrado</p></div>';
      return;
    }

    app.innerHTML = '<div class="loading-spinner">Carregando...</div>';

    try {
      await Store.loadAll();

      const contract = Store.getContractById(contractId);
      if (!contract) {
        app.innerHTML = '<div class="card"><p class="text-danger">Contrato não encontrado</p></div>';
        return;
      }

      const saidas = Store.getSaidasByContract(contractId);
      const saidasByType = Store.getSaidasByType(contractId);
      const baseAllocations = Store.getBaseAllocationsForContract(contractId);
      const totalSaidas = Store.getTotalSaidasByContract(contractId);
      const totalBase = baseAllocations.reduce((sum, a) => sum + a.value, 0);

      // Passagens de colaboradores vinculadas a este contrato
      const passagensRealizadas = (Store.state.caixa || [])
        .filter(e => e.contractId === contractId && e.category === 'passagem' && e.type === 'saida');
      const passagensPendentes = (Store.state.contas_pagar || [])
        .filter(c => c.contractId === contractId && c.category === 'passagem' && c.status === 'pendente');
      const totalPassagensRealizadas = passagensRealizadas.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
      const totalPassagensPendentes  = passagensPendentes.reduce((s, c)  => s + (parseFloat(c.valor) || 0), 0);

      const margin = contract.value - totalSaidas - totalBase - totalPassagensRealizadas;
      const spentPct = ((totalSaidas + totalPassagensRealizadas) / contract.value * 100).toFixed(1);

      // Boletins de Medição = Notas Fiscais vinculadas ao contrato
      const nfsContrato = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === contractId);
      const nfsEmitidas = nfsContrato.filter(nf => nf.emitida);
      const totalMedido   = nfsContrato.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      const totalEmitido  = nfsEmitidas.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      const totalAMedir   = Math.max(0, contract.value - totalMedido);
      const pctMedido     = contract.value > 0 ? (totalMedido / contract.value * 100) : 0;
      const pctEmitido    = contract.value > 0 ? (totalEmitido / contract.value * 100) : 0;
      const margemAtual   = totalMedido - totalSaidas - totalBase - totalPassagensRealizadas;
      const pctMargem     = totalMedido > 0 ? (margemAtual / totalMedido * 100) : 0;

      // Orçamento
      const budget = contract.budget || [];
      const totalOrcado = budget.reduce((s, b) => s + b.value, 0);
      const TIPOS_LABEL = {
        mao_de_obra: 'Mão de Obra', material: 'Material',
        hospedagem: 'Hospedagem',   transporte: 'Transporte',
        base: 'Custo BASE',         outros: 'Outros'
      };
      const TIPOS_COLOR = {
        mao_de_obra: '#A78BFA', material: '#FB923C',
        hospedagem: '#22D3EE',  transporte: '#34D399',
        base: '#60A5FA',        outros: '#9CA3AF'
      };
      // Realizado por tipo (inclui BASE + passagens realizadas em transporte)
      const realizadoPorTipo = {
        mao_de_obra: saidasByType.mao_de_obra,
        material:    saidasByType.material,
        hospedagem:  saidasByType.hospedagem,
        transporte:  saidasByType.transporte + totalPassagensRealizadas,
        base:        totalBase,
        outros:      0
      };
      // Orçado por tipo
      const orcadoPorTipo = {};
      budget.forEach(b => { orcadoPorTipo[b.type] = (orcadoPorTipo[b.type] || 0) + b.value; });
      // Tipos que aparecem na comparação = union de orçado e realizado > 0
      const tiposComparar = [...new Set([
        ...Object.keys(orcadoPorTipo),
        ...Object.keys(realizadoPorTipo).filter(t => realizadoPorTipo[t] > 0)
      ])];

      const html = `
        <div style="margin-bottom: var(--sp-xl);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-lg);">
            <div>
              <h1 class="page-title">${escapeHtml(contract.name)}</h1>
              <p class="page-subtitle">${escapeHtml(contract.client)}</p>
              ${contract.contractNumber ? `<p class="text-muted font-sm">Contrato #${contract.contractNumber}</p>` : ''}
            </div>
            <div class="btn-group">
              <button class="btn btn-primary" id="btnEditarDados">✏️ Editar Dados</button>
              <a href="#/contratos" class="btn btn-secondary">← Voltar</a>
            </div>
          </div>

          <!-- Status Badge -->
          <div style="margin-bottom: var(--sp-lg);">
            <span class="badge badge-${contract.status}" style="font-size:15px; padding: 6px 12px;">${contract.status.toUpperCase()}</span>
            <span class="text-muted font-sm" style="margin-left: var(--sp-md);">
              ${new Date(contract.startDate).toLocaleDateString('pt-BR')} até ${new Date(contract.endDate).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        <!-- Tabs executivas (filtradas pelo nível de acesso) -->
        <div class="ctd-tabs" role="tablist" aria-label="Seções do contrato">
          ${[
            { k:'visao',     l:'Visão Geral',  icon:'eye' },
            { k:'financeiro',l:'Financeiro',   icon:'dollar-sign' },
            { k:'equipe',    l:'Equipe',       icon:'users' },
            { k:'rdo',       l:'RDO',          icon:'clipboard', badge: (contract.rdos || []).length },
            { k:'pendencias',l:'Pendências',   icon:'alert-triangle', badge: passagensPendentes.length }
          ].filter(t => (window.perfil ? window.perfil.podeContractTab(t.k) : true)).map(t => `
            <button class="ctd-tab ${this._tab === t.k ? 'active' : ''}" data-ctd-tab="${t.k}" role="tab" aria-selected="${this._tab === t.k}" aria-label="${t.l}${t.badge ? ' (' + t.badge + ')' : ''}">
              <span aria-hidden="true" style="display:inline-flex;align-items:center;color:currentColor;">${window.rhIcon ? window.rhIcon(t.icon, 16) : ''}</span>
              ${t.l}
              ${t.badge ? `<span class="ctd-tab-badge">${t.badge}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <style>
          .ctd-tabs {
            display: flex; gap: 4px;
            margin-bottom: var(--sp-xl);
            border-bottom: 1px solid var(--color-border);
            overflow-x: auto;
          }
          .ctd-tab {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 11px 18px;
            background: transparent; border: none;
            border-bottom: 3px solid transparent;
            color: var(--color-text-muted);
            font-size: 15px; font-weight: 500;
            cursor: pointer; font-family: inherit;
            transition: color .15s, border-color .15s, background .15s;
            white-space: nowrap;
            margin-bottom: -1px;
          }
          .ctd-tab:hover {
            color: var(--color-text);
            background: var(--color-surface-2);
          }
          .ctd-tab.active {
            color: var(--color-primary);
            border-bottom-color: var(--color-primary);
            font-weight: 600;
          }
          .ctd-tab-badge {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 20px; height: 20px; padding: 0 6px;
            background: var(--color-danger); color: #FFFFFF;
            border-radius: 99px; font-size:15px; font-weight: 700;
          }
        </style>

        <!-- Resumo orientado a Boletim de Medição -->
        ${this._tab === 'visao' ? `
        <div class="card mb-2xl" style="padding:0;overflow:hidden;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);">
            <div style="padding:var(--sp-lg);border-right:1px solid var(--color-border);border-top:3px solid var(--color-primary);">
              <div class="text-muted font-sm mb-md" style="">Valor do Contrato</div>
              <div style="font-size:22px;font-weight:800;">${Store.formatBRL(contract.value)}</div>
              <div class="text-muted font-sm mt-sm">valor vendido</div>
            </div>
            <div style="padding:var(--sp-lg);border-right:1px solid var(--color-border);border-top:3px solid var(--color-success);">
              <div class="text-muted font-sm mb-md" style="">Já faturado</div>
              <div style="font-size:22px;font-weight:800;color:var(--color-success);">${Store.formatBRL(totalEmitido)}</div>
              <div class="text-muted font-sm mt-sm">${pctEmitido.toFixed(1)}% executado · ${nfsEmitidas.length} NF${nfsEmitidas.length !== 1 ? 's' : ''}</div>
            </div>
            <div style="padding:var(--sp-lg);border-right:1px solid var(--color-border);border-top:3px solid var(--color-warning);">
              <div class="text-muted font-sm mb-md" style="">Disponível para BM</div>
              <div style="font-size:22px;font-weight:800;color:var(--color-warning);">${Store.formatBRL(totalAMedir)}</div>
              <div class="text-muted font-sm mt-sm">trava ativa no contrato</div>
            </div>
            <div style="padding:var(--sp-lg);border-top:3px solid ${margemAtual >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
              <div class="text-muted font-sm mb-md" style="">Resultado parcial</div>
              <div style="font-size:22px;font-weight:800;color:${margemAtual >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${margemAtual >= 0 ? '+ ' : ''}${Store.formatBRL(margemAtual)}</div>
              <div class="text-muted font-sm mt-sm">${totalMedido > 0 ? 'margem ' + pctMargem.toFixed(1) + '%' : 'sem medição'}</div>
            </div>
          </div>
        </div>

        <!-- Orçamento — uso do contrato (barra empilhada Recebido / NF emitida / Rascunho / Disponível) -->
        ${(() => {
          const totalRecebido = nfsEmitidas
            .filter(nf => nf.caixaEntryId || nf.caixa_entry_id)
            .reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
          const totalNFAberta = totalEmitido - totalRecebido;
          const totalRascunho = totalMedido - totalEmitido;
          const totalDisponivel = Math.max(0, contract.value - totalMedido);
          const v = contract.value > 0 ? contract.value : 1;
          const pctRec  = (totalRecebido / v) * 100;
          const pctNF   = (totalNFAberta / v) * 100;
          const pctRasc = (totalRascunho / v) * 100;
          const pctDisp = Math.max(0, 100 - pctRec - pctNF - pctRasc);
          const fmtPct = (p) => p > 0 ? `${p.toFixed(0)}%` : '';
          return `
          <div class="card mb-2xl" style="padding: var(--sp-lg);">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <div>
                <div style="font-size:15px;color:var(--color-text);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Orçamento — uso do contrato</div>
                <div style="font-size:13px;color:var(--color-text-muted);margin-top:2px;">novas saídas não podem ultrapassar ${Store.formatBRL(contract.value)}</div>
              </div>
              <div style="font-size:13px;color:var(--color-text-muted);">${pctMedido.toFixed(1)}% medido</div>
            </div>
            <div style="height:22px;background:var(--color-surface-2);border-radius:99px;overflow:hidden;display:flex;margin-top:var(--sp-md);">
              <div title="Recebido" style="height:100%;width:${Math.min(100, pctRec)}%;background:#10B981;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${pctRec >= 8 ? Store.formatBRL(totalRecebido).replace('R$ ', 'R$') : ''}</div>
              <div title="NF emitida" style="height:100%;width:${Math.min(100, pctNF)}%;background:#F59E0B;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${pctNF >= 8 ? Store.formatBRL(totalNFAberta).replace('R$ ', 'R$') : ''}</div>
              <div title="Rascunho" style="height:100%;width:${Math.min(100, pctRasc)}%;background:#FCA5A5;display:flex;align-items:center;justify-content:center;color:#7F1D1D;font-size:11px;font-weight:700;">${pctRasc >= 8 ? Store.formatBRL(totalRascunho).replace('R$ ', 'R$') : ''}</div>
              <div title="Disponível" style="height:100%;width:${Math.min(100, pctDisp)}%;background:rgba(0,0,0,.06);"></div>
            </div>
            <div style="display:flex;gap:var(--sp-lg);margin-top:var(--sp-md);font-size:13px;flex-wrap:wrap;">
              <span><span style="display:inline-block;width:10px;height:10px;background:#10B981;border-radius:2px;margin-right:6px;"></span>Recebido (${pctRec.toFixed(0)}%)</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:#F59E0B;border-radius:2px;margin-right:6px;"></span>NF emitida (${pctNF.toFixed(0)}%)</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:#FCA5A5;border-radius:2px;margin-right:6px;"></span>Rascunho (${pctRasc.toFixed(0)}%)</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:rgba(0,0,0,.12);border-radius:2px;margin-right:6px;"></span>Disponível (${pctDisp.toFixed(0)}%)</span>
            </div>
          </div>
          `;
        })()}

        <!-- Equipe + Custos (linha secundária) -->
        <div class="grid-2 mb-2xl">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div>
                <div class="text-muted font-sm mb-md" style="">Equipe da Obra</div>
                <div style="font-size: 22px; font-weight: 700;">${(contract.organograma || []).length} <span style="font-size:15px;font-weight:400;color:var(--color-text-muted);">pessoa(s)</span></div>
              </div>
              <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='equipe';window.ContratoDetail.render('${contract.id}');event.preventDefault();" style="font-size:15px;color:var(--color-primary);text-decoration:none;">Ver equipe →</a>
            </div>
          </div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <div>
                <div class="text-muted font-sm mb-md" style="">Custos Acumulados</div>
                <div style="font-size: 22px; font-weight: 700; color: var(--color-danger);">${Store.formatBRL(totalSaidas + totalBase + totalPassagensRealizadas)}</div>
                <div class="text-muted font-sm mt-sm">saídas + BASE alocada + passagens</div>
              </div>
              <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='financeiro';window.ContratoDetail.render('${contract.id}');event.preventDefault();" style="font-size:15px;color:var(--color-primary);text-decoration:none;">Ver detalhes →</a>
            </div>
          </div>
        </div>

        <!-- Resumo operacional: Saídas/BMs + Pendências + RDO de hoje -->
        ${this._renderOperationalSummary(contract, nfsContrato, passagensPendentes)}
        ` : ''}

        <!-- ─── Orçamento ─── -->
        ${this._tab === 'financeiro' ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Orçamento — Composição de Custo Planejado</h3>
            <button class="btn btn-primary btn-sm" id="btnNovoItemOrcamento" ${totalOrcado >= contract.value && contract.value > 0 ? 'disabled title="Valor total do contrato já foi orçado"' : ''}>+ Adicionar Item</button>
          </div>
          ${contract.value > 0 ? (() => {
            const pct = (totalOrcado / contract.value) * 100;
            const excedeu = totalOrcado > contract.value;
            const cor = excedeu ? 'var(--color-danger)' : pct > 90 ? 'var(--color-warning)' : 'var(--color-success)';
            return `
              <div style="display:grid;grid-template-columns:140px minmax(220px, 1fr) 130px 130px 120px;gap:var(--sp-md);align-items:center;padding:10px var(--sp-md);border-radius:6px;background:var(--color-surface-2);border-left:3px solid ${cor};margin-bottom:var(--sp-lg);">
                <div style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Orçado × Contrato</div>
                <div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="flex:1;background:rgba(255,255,255,.06);border-radius:99px;height:6px;overflow:hidden;">
                      <div style="height:100%;width:${Math.min(100, pct)}%;background:${cor};border-radius:99px;transition:width .4s;"></div>
                    </div>
                    <span style="font-size:15px;color:var(--color-text-muted);min-width:42px;">${pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div class="rh-text-right">
                  <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:2px;">Orçado</div>
                  <div style="font-size:15px;font-weight:600;font-family:'Nunito',sans-serif;">${Store.formatBRL(totalOrcado)}</div>
                </div>
                <div class="rh-text-right">
                  <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:2px;">Contrato</div>
                  <div style="font-size:15px;font-weight:600;font-family:'Nunito',sans-serif;">${Store.formatBRL(contract.value)}</div>
                </div>
                <div class="rh-text-right">
                  <div style="font-size:15px;color:var(--color-text-muted);margin-bottom:2px;">${excedeu ? 'Excedeu' : 'Disponível'}</div>
                  <div style="font-size:15px;font-weight:700;color:${excedeu ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${excedeu ? '▼' : '▲'} ${Store.formatBRL(Math.abs(contract.value - totalOrcado))}
                  </div>
                </div>
              </div>
            `;
          })() : ''}

          ${budget.length === 0 ? `
            <div style="padding:var(--sp-lg);text-align:center;color:var(--color-text-muted);">
              <div style="font-size:28px;margin-bottom:var(--sp-sm);">📋</div>
              <div style="font-weight:600;margin-bottom:4px;">Nenhum orçamento cadastrado</div>
              <div style="font-size:15px;">Adicione os custos planejados para confrontar com os gastos reais</div>
            </div>
          ` : `
            <!-- Gráfico de Barras + Detalhamento lado a lado -->
            <div style="display:grid;grid-template-columns:minmax(0, 1fr) minmax(0, 1fr);gap:var(--sp-lg);margin-bottom:var(--sp-lg);align-items:start;">
              <!-- Gráfico -->
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
                  <div style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);">Orçado × Realizado</div>
                  <div style="display:flex;gap:var(--sp-md);font-size:13px;">
                    <span><span style="display:inline-block;width:10px;height:10px;background:#6366F1;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Orçado</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:#F59E0B;border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Realizado</span>
                  </div>
                </div>
                <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;height:380px;">
                  <canvas id="chartBarrasOrcado"></canvas>
                </div>
              </div>

              <!-- Detalhamento por Categoria -->
              <div>
                <div style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">Detalhamento por Categoria</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                ${tiposComparar.map(tipo => {
                  const orc = orcadoPorTipo[tipo] || 0;
                  const real = realizadoPorTipo[tipo] || 0;
                  const delta = orc - real;
                  const pct = orc > 0 ? Math.min((real / orc) * 100, 999) : (real > 0 ? 999 : 0);
                  const cor = TIPOS_COLOR[tipo] || '#9CA3AF';
                  const statusCor = real > orc && orc > 0 ? 'var(--color-danger)' : real > 0 && orc === 0 ? 'var(--color-warning)' : 'var(--color-success)';
                  const statusIcon = real > orc && orc > 0 ? '▼' : real > 0 && orc === 0 ? '⚠' : '▲';
                  return `
                    <div style="padding:10px var(--sp-md);border-radius:6px;background:var(--color-surface-2);border-left:3px solid ${cor};">
                      <!-- Header da linha: nome + delta -->
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <div style="font-size:14px;font-weight:600;">${TIPOS_LABEL[tipo] || tipo}</div>
                        <div style="font-size:13px;font-weight:700;color:${orc===0?'var(--color-text-muted)':statusCor};">
                          ${orc === 0 ? '—' : `${statusIcon} ${Store.formatBRL(Math.abs(delta))}`}
                        </div>
                      </div>
                      <!-- Barra de progresso -->
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <div style="flex:1;background:rgba(255,255,255,.06);border-radius:99px;height:5px;overflow:hidden;">
                          <div style="height:100%;width:${Math.min(pct,100)}%;background:${pct>100?'var(--color-danger)':cor};border-radius:99px;"></div>
                        </div>
                        <span style="font-size:12px;color:var(--color-text-muted);min-width:36px;text-align:right;">${pct > 999 ? '—' : pct.toFixed(0)+'%'}</span>
                      </div>
                      <!-- Valores: Orçado / Realizado lado a lado -->
                      <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <div>
                          <span class="rh-muted">Orç:</span>
                          <span style="font-weight:600;margin-left:4px;">${orc > 0 ? Store.formatBRL(orc) : '<span style="color:var(--color-text-muted)">—</span>'}</span>
                        </div>
                        <div>
                          <span class="rh-muted">Real:</span>
                          <span style="font-weight:600;margin-left:4px;color:${real>0?'var(--color-text)':'var(--color-text-muted)'};">${real > 0 ? Store.formatBRL(real) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}

                <!-- Total compacto -->
                <div style="padding:10px var(--sp-md);border-radius:6px;border:1px solid var(--color-border);margin-top:4px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total</div>
                    <div style="font-size:13px;font-weight:700;color:${(totalSaidas+totalBase)>totalOrcado?'var(--color-danger)':'var(--color-success)'};">
                      ${(totalSaidas+totalBase) > totalOrcado ? '▼' : '▲'} ${Store.formatBRL(Math.abs(totalOrcado - totalSaidas - totalBase))}
                    </div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;">
                    <div><span class="rh-muted">Orç:</span> <strong style="margin-left:4px;">${Store.formatBRL(totalOrcado)}</strong></div>
                    <div><span class="rh-muted">Real:</span> <strong style="margin-left:4px;color:${(totalSaidas+totalBase)>totalOrcado?'var(--color-danger)':'var(--color-text)'};">${Store.formatBRL(totalSaidas + totalBase)}</strong></div>
                  </div>
                </div>
                </div>
              </div>
            </div>

            <!-- Pizza + tabela lado a lado -->
            <div style="display:grid;grid-template-columns:320px 1fr;gap:var(--sp-xl);align-items:start;">
              <!-- Gráfico de pizza com legenda abaixo -->
              <div>
                <div style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">Distribuição por Categoria</div>
                <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
                  <div style="position:relative;height:220px;margin-bottom:var(--sp-md);">
                    <canvas id="chartPizzaOrcamento"></canvas>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    ${Object.entries(orcadoPorTipo).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]).map(([tipo, valor]) => {
                      const cor = TIPOS_COLOR[tipo] || '#9CA3AF';
                      const pctDoOrc = totalOrcado > 0 ? (valor / totalOrcado) * 100 : 0;
                      return `
                        <div style="display:grid;grid-template-columns:14px 1fr auto;gap:8px;align-items:center;font-size:15px;">
                          <div style="width:10px;height:10px;background:${cor};border-radius:2px;"></div>
                          <div>${TIPOS_LABEL[tipo] || tipo}</div>
                          <div class="rh-muted">${pctDoOrc.toFixed(1)}%</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>

              <!-- Tabela de itens -->
              <div>
                <div style="font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-muted);margin-bottom:var(--sp-sm);">Itens do Orçamento</div>
                <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Categoria</th>
                      <th class="rh-text-right">Valor Orçado</th>
                      <th style="text-align:center;width:140px;">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${budget.map(b => {
                      const cor = TIPOS_COLOR[b.type] || '#9CA3AF';
                      return `
                        <tr>
                          <td><strong>${escapeHtml(b.description)}</strong>${b.notes ? `<div class="rh-meta">${escapeHtml(b.notes)}</div>` : ''}</td>
                          <td><span class="badge" style="background:${cor}18;color:${cor};">${TIPOS_LABEL[b.type] || b.type}</span></td>
                          <td style="text-align:right;font-weight:600;font-family:'Nunito',sans-serif;">${Store.formatBRL(b.value)}</td>
                          <td style="text-align:center;white-space:nowrap;">
                            <button class="btn btn-sm btn-secondary btn-editar-orc" data-id="${b.id}" title="Editar" style="margin-right:4px;">✏️ Editar</button>
                            <button class="btn btn-sm btn-danger btn-excluir-orc" data-id="${b.id}" title="Excluir">🗑️</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          `}
        </div>

        ` : ''}

        <!-- ─── Organograma da Obra ─── -->
        ${this._tab === 'equipe' ? this.renderOrganogramaSection(contract) : ''}

        <!-- ─── RDO ─── -->
        ${this._tab === 'rdo' ? this.renderRdoSection(contract) : ''}

        <!-- Composição do Gasto - Gráfico em Pizza -->
        ${this._tab === 'visao' ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Composição do Gasto</h3>
            <span class="rh-meta">Passe o mouse sobre a pizza para ver os valores</span>
          </div>
          <div style="display:grid;grid-template-columns:320px 1fr;gap:var(--sp-xl);align-items:center;">
            <!-- Canvas da pizza -->
            <div style="position:relative;height:320px;">
              <canvas id="chartPizzaContrato"></canvas>
            </div>
            <!-- Legenda com valores -->
            <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
              ${[
                { label: 'Mão de Obra',       value: saidasByType.mao_de_obra,       color: '#7C3AED', previsto: 0 },
                { label: 'Material',           value: saidasByType.material,          color: '#D97706', previsto: 0 },
                { label: 'Hospedagem',         value: saidasByType.hospedagem,        color: '#0891B2', previsto: 0 },
                { label: 'Transporte',         value: saidasByType.transporte,        color: '#059669', previsto: 0 },
                { label: '✈ Passagens',        value: totalPassagensRealizadas,       color: '#A855F7', previsto: totalPassagensPendentes, isPrevisto: true },
                { label: 'BASE Alocada',       value: totalBase,                      color: '#3182CE', previsto: 0 },
                { label: 'Saldo Restante',     value: Math.max(0, margin),            color: '#2E7D52', previsto: 0 }
              ].filter(seg => seg.value > 0 || seg.previsto > 0 || seg.label === 'Saldo Restante').map(seg => {
                const pct = contract.value > 0 ? ((seg.value / contract.value) * 100).toFixed(1) : 0;
                const clicavel = seg.label !== 'Saldo Restante';
                return `
                  <div class="composicao-item" data-tipo="${seg.label}" style="display:flex;align-items:center;gap:var(--sp-md);padding:var(--sp-sm) var(--sp-md);border-radius:6px;${clicavel ? 'cursor:pointer;' : ''}${seg.value > 0 ? `background:${seg.color}08;border-left:3px solid ${seg.color};` : seg.previsto > 0 ? `background:${seg.color}05;border-left:3px dashed ${seg.color};` : 'opacity:0.5;'}transition:filter .15s;" onmouseenter="${clicavel ? `this.style.filter='brightness(1.08)'` : ''}" onmouseleave="this.style.filter=''">
                    <div style="width:14px;height:14px;border-radius:3px;background:${seg.value > 0 ? seg.color : 'transparent'};border:2px ${seg.value > 0 ? 'solid' : 'dashed'} ${seg.color};flex-shrink:0;"></div>
                    <div style="flex:1;">
                      <div style="font-size:15px;font-weight:600;">${seg.label}${clicavel ? `<span style="font-size:15px;color:var(--color-text-muted);margin-left:4px;">›</span>` : ''}</div>
                      <div class="rh-meta">
                        ${seg.value > 0 ? `${pct}% do contrato` : ''}
                        ${seg.previsto > 0 ? `<span style="color:#7C3AED;"> + ${Store.formatBRL(seg.previsto)} previsto</span>` : ''}
                      </div>
                    </div>
                    <div class="rh-text-right">
                      ${seg.value > 0 ? `<div style="font-weight:700;font-size:15px;color:${seg.color};">${Store.formatBRL(seg.value)}</div>` : ''}
                      ${seg.previsto > 0 ? `<div style="font-size:15px;font-weight:600;color:#7C3AED;opacity:.8;">⏳ ${Store.formatBRL(seg.previsto)}</div>` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        ` : ''}

        <!-- Saídas Classificadas (inclui saídas diretas + alocações BASE) -->
        ${this._tab === 'financeiro' ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Saídas Classificadas</h3>
            <button class="btn btn-primary btn-sm" id="btnNovaSaida">+ Adicionar Saída</button>
          </div>

          ${saidas.length === 0 && baseAllocations.length === 0 ? `
            <p class="text-muted" style="padding: var(--sp-lg);">Nenhuma saída registrada</p>
          ` : `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Origem</th>
                    <th style="text-align: right;">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    // Saídas diretas do contrato
                    ...saidas.map(s => ({
                      kind: 'saida',
                      date: s.date,
                      description: s.description,
                      type: s.type,
                      value: parseFloat(s.value) || 0,
                      id: s.id
                    })),
                    // Alocações BASE viradas em linha
                    ...baseAllocations.map(a => ({
                      kind: 'base',
                      date: a.date,
                      description: a.baseDescription,
                      type: 'base',
                      value: parseFloat(a.value) || 0,
                      id: a.id
                    })),
                    // Passagens de colaboradores pagas (caixa)
                    ...passagensRealizadas.map(e => ({
                      kind: 'passagem',
                      date: e.date,
                      description: e.description,
                      type: 'transporte',
                      value: parseFloat(e.value) || 0,
                      id: e.id
                    }))
                  ].sort((a, b) => new Date(b.date) - new Date(a.date)).map(linha => {
                    const isBase     = linha.kind === 'base';
                    const isPassagem = linha.kind === 'passagem';
                    const tipoBadge = isBase
                      ? `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">⚙️ BASE</span>`
                      : `<span class="badge badge-${linha.type}">${linha.type.replace(/_/g, ' ')}</span>`;
                    const origemBadge = isBase
                      ? `<span style="font-size:15px;color:var(--color-info);font-weight:600;">Rateio BASE</span>`
                      : isPassagem
                      ? `<span style="font-size:15px;color:#7C3AED;font-weight:600;">✈ Passagem</span>`
                      : `<span class="rh-meta">Saída direta</span>`;
                    const acoes = isBase
                      ? `<span class="rh-meta">Gerenciar em <a href="#/base" style="color:var(--color-primary);">BASE</a></span>`
                      : isPassagem
                      ? `<span class="rh-meta">Gerenciar em <a href="#/recursos" style="color:var(--color-primary);">Recursos</a></span>`
                      : `<div style="display:flex;gap:4px;flex-wrap:wrap;">
                          <button class="btn btn-sm btn-secondary btn-gerar-bm" data-id="${linha.id}" title="Gerar Boletim de Medição">📄 BM</button>
                          <button class="btn btn-sm btn-secondary btn-editar-saida" data-id="${linha.id}" title="Editar">✏️</button>
                          <button class="btn btn-sm btn-danger btn-excluir-saida" data-id="${linha.id}" title="Excluir">🗑️</button>
                        </div>`;

                    return `
                      <tr ${isBase ? 'style="background:rgba(49,130,206,.03);"' : isPassagem ? 'style="background:rgba(124,58,237,.03);"' : ''}>
                        <td>${new Date(linha.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td><strong>${escapeHtml(linha.description)}</strong></td>
                        <td>${tipoBadge}</td>
                        <td>${origemBadge}</td>
                        <td style="text-align: right; font-weight: 600; ${isBase ? 'color:var(--color-info);' : ''}">${Store.formatBRL(linha.value)}</td>
                        <td>${acoes}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr style="background:var(--color-bg);font-weight:700;">
                    <td colspan="4" style="padding:var(--sp-md);">Total realizado (saídas + passagens + BASE)</td>
                    <td style="text-align:right;padding:var(--sp-md);color:var(--color-danger);">${Store.formatBRL(totalSaidas + totalPassagensRealizadas + totalBase)}</td>
                    <td></td>
                  </tr>
                  ${totalPassagensPendentes > 0 ? `
                  <tr style="background:rgba(124,58,237,.06);font-weight:700;">
                    <td colspan="4" style="padding:var(--sp-md);color:#7C3AED;">✈ Passagens pendentes (previsão)</td>
                    <td style="text-align:right;padding:var(--sp-md);color:#7C3AED;">${Store.formatBRL(totalPassagensPendentes)}</td>
                    <td></td>
                  </tr>
                  <tr style="background:rgba(124,58,237,.03);font-weight:700;">
                    <td colspan="4" style="padding:var(--sp-md);">Projeção total (realizado + previsto)</td>
                    <td style="text-align:right;padding:var(--sp-md);color:var(--color-danger);">${Store.formatBRL(totalSaidas + totalPassagensRealizadas + totalBase + totalPassagensPendentes)}</td>
                    <td></td>
                  </tr>` : ''}
                </tfoot>
              </table>
            </div>
          `}
        </div>
        ` : ''}

        ${this._tab === 'pendencias' && passagensPendentes.length > 0 ? `
        <!-- Previsão de Desembolso — Passagens Pendentes -->
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">✈ Previsão de Desembolso — Passagens Pendentes</h3>
            <span style="font-size:15px;font-weight:700;color:#7C3AED;">${Store.formatBRL(totalPassagensPendentes)}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th class="rh-text-right">Valor Previsto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${passagensPendentes.sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento)).map(cp => {
                  const hoje = new Date().toISOString().split('T')[0];
                  const vencido = cp.dataVencimento && cp.dataVencimento < hoje;
                  return `<tr style="background:rgba(124,58,237,.03);">
                    <td><strong style="font-size:15px;">${escapeHtml(cp.descricao)}</strong></td>
                    <td class="rh-meta">${escapeHtml(cp.observacoes || '—')}</td>
                    <td style="font-size:15px;">${cp.dataVencimento ? new Date(cp.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td style="text-align:right;font-weight:700;color:#7C3AED;">${Store.formatBRL(cp.valor)}</td>
                    <td>
                      <span class="badge" style="background:${vencido ? '#FEE2E2' : '#EDE9FE'};color:${vencido ? '#991B1B' : '#5B21B6'};">
                        ${vencido ? '⚠ Vencida' : '⏳ Pendente'}
                      </span>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot>
                <tr style="background:var(--color-bg);font-weight:700;">
                  <td colspan="3" style="padding:var(--sp-md);">Total previsto em passagens</td>
                  <td style="text-align:right;padding:var(--sp-md);color:#7C3AED;">${Store.formatBRL(totalPassagensPendentes)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style="padding:var(--sp-sm) var(--sp-md);font-size:15px;color:var(--color-text-muted);border-top:1px solid var(--color-border);">
            Gerencie essas passagens em <a href="#/contas-pagar" style="color:var(--color-primary);">Contas a Pagar</a>
          </div>
        </div>` : ''}

        ${this._tab === 'pendencias' && passagensPendentes.length === 0 ? `
        <div class="card" style="text-align:center;padding:var(--sp-2xl) var(--sp-lg);">
          <div style="font-size:38px;margin-bottom:var(--sp-md);opacity:.5;">✓</div>
          <div style="font-size:16px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhuma pendência</div>
          <div class="rh-meta">Este contrato não possui passagens pendentes nem outros itens a resolver no momento.</div>
        </div>
        ` : ''}

      `;

      app.innerHTML = html;

      // Listeners das tabs
      document.querySelectorAll('[data-ctd-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this._tab = e.currentTarget.dataset.ctdTab;
          this.render({ id: contractId });
        });
      });

      // Renderiza gráfico de pizza APÓS innerHTML
      this.renderPizza({
        maoDeObra:  saidasByType.mao_de_obra,
        material:   saidasByType.material,
        hospedagem: saidasByType.hospedagem,
        transporte: saidasByType.transporte,
        passagens:  totalPassagensRealizadas,
        base:       totalBase,
        saldo:      Math.max(0, margin)
      });
      this.renderPizzaOrcamento(orcadoPorTipo, totalOrcado);
      this.renderBarrasOrcado(tiposComparar, orcadoPorTipo, realizadoPorTipo);

      // Event listeners (guardados — botões podem não existir conforme a aba)
      document.getElementById('btnEditarDados')?.addEventListener('click', () => this.showModalEditarDados(contract));
      document.getElementById('btnNovaSaida')?.addEventListener('click', () => this.showModalSaida(contractId));
      document.getElementById('btnNovoItemOrcamento')?.addEventListener('click', () => this.showModalOrcamento(contractId));
      document.querySelectorAll('.btn-editar-saida').forEach(btn => {
        btn.addEventListener('click', (e) => this.showModalSaida(contractId, e.target.dataset.id));
      });
      document.querySelectorAll('.btn-excluir-saida').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteSaida(e.currentTarget.dataset.id));
      });
      document.querySelectorAll('.btn-gerar-bm').forEach(btn => {
        btn.addEventListener('click', (e) => window.BM.gerarPorSaida(e.currentTarget.dataset.id));
      });
      document.querySelectorAll('.btn-editar-orc').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const item = (contract.budget || []).find(b => b.id === e.target.dataset.id);
          this.showModalOrcamento(contractId, item);
        });
      });
      document.querySelectorAll('.btn-excluir-orc').forEach(btn => {
        btn.addEventListener('click', (e) => this.deleteBudgetItem(contractId, e.target.dataset.id));
      });

      // Organograma
      this.attachOrganogramaListeners(contract);

      document.querySelectorAll('.composicao-item[data-tipo]').forEach(el => {
        el.addEventListener('click', () => {
          const tipo = el.dataset.tipo;
          if (tipo === 'Saldo Restante') return;
          this.showDetalheComposicao(tipo, saidas, saidasByType, passagensRealizadas, passagensPendentes, baseAllocations);
        });
      });
    } catch (e) {
      console.error(e);
      app.innerHTML = '<div class="card"><p class="text-danger">Erro ao carregar contrato. Tente novamente.</p></div>';
    }
  },

  renderPizza(dados) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    const canvas = document.getElementById('chartPizzaContrato');
    if (!canvas || typeof Chart === 'undefined') return;

    const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    const segments = [
      { label: 'Mão de Obra',    value: dados.maoDeObra,  color: '#7C3AED' },
      { label: 'Material',       value: dados.material,   color: '#D97706' },
      { label: 'Hospedagem',     value: dados.hospedagem, color: '#0891B2' },
      { label: 'Transporte',     value: dados.transporte, color: '#059669' },
      { label: '✈ Passagens',    value: dados.passagens,  color: '#A855F7' },
      { label: 'BASE Alocada',   value: dados.base,       color: '#3182CE' },
      { label: 'Saldo Restante', value: dados.saldo,      color: '#2E7D52' }
    ].filter(s => s.value > 0);

    if (segments.length === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--sp-xl);">Nenhum dado para exibir</p>';
      return;
    }

    const total = segments.reduce((s, seg) => s + seg.value, 0);

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 12
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 14,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 13 },
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            displayColors: true,
            boxWidth: 12,
            boxHeight: 12,
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return `  ${fmt(ctx.parsed)}  (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  renderBarrasOrcado(tipos, orcadoPorTipo, realizadoPorTipo) {
    if (this.chartBarras) { this.chartBarras.destroy(); this.chartBarras = null; }
    const canvas = document.getElementById('chartBarrasOrcado');
    if (!canvas || typeof Chart === 'undefined' || tipos.length === 0) return;

    const TIPOS_LABEL = { mao_de_obra: 'Mão de Obra', material: 'Material', hospedagem: 'Hospedagem', transporte: 'Transporte', base: 'BASE', outros: 'Outros' };

    const labels = tipos.map(t => TIPOS_LABEL[t] || t);
    const orcado = tipos.map(t => orcadoPorTipo[t] || 0);
    const real   = tipos.map(t => realizadoPorTipo[t] || 0);

    const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    this.chartBarras = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Orçado',    data: orcado, backgroundColor: '#6366F1', borderRadius: 4 },
          { label: 'Realizado', data: real,   backgroundColor: '#F59E0B', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 12,
            titleColor: '#FFFFFF',
            bodyColor: '#FFFFFF',
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#FFFFFF', font: { size: 13 } },
            grid: {
              color: 'rgba(255,255,255,.15)',
              drawOnChartArea: true,
              drawTicks: true,
              offset: true,
              lineWidth: 1
            }
          },
          y: {
            ticks: { callback: v => fmt(v), color: '#FFFFFF', font: { size: 12 } },
            grid: { color: 'rgba(255,255,255,.08)' }
          }
        }
      }
    });
  },

  renderPizzaOrcamento(orcadoPorTipo, totalOrcado) {
    if (this.chartOrcamento) { this.chartOrcamento.destroy(); this.chartOrcamento = null; }
    const canvas = document.getElementById('chartPizzaOrcamento');
    if (!canvas || typeof Chart === 'undefined') return;

    const TIPOS_LABEL = { mao_de_obra: 'Mão de Obra', material: 'Material', hospedagem: 'Hospedagem', transporte: 'Transporte', base: 'BASE', outros: 'Outros' };
    const TIPOS_COLOR = { mao_de_obra: '#7C3AED', material: '#D97706', hospedagem: '#0891B2', transporte: '#059669', base: '#3182CE', outros: '#9CA3AF' };

    const segments = Object.entries(orcadoPorTipo)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, valor]) => ({
        label: TIPOS_LABEL[tipo] || tipo,
        value: valor,
        color: TIPOS_COLOR[tipo] || '#9CA3AF'
      }));

    if (segments.length === 0) {
      canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:var(--sp-lg);">Sem itens no orçamento</p>';
      return;
    }

    const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    this.chartOrcamento = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 3,
          hoverBorderWidth: 4,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,32,46,0.95)',
            padding: 12,
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const pct = totalOrcado > 0 ? ((ctx.parsed / totalOrcado) * 100).toFixed(1) : 0;
                return `  ${fmt(ctx.parsed)}  (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  // ═══════════ RESUMO OPERACIONAL (Saídas/BMs + Pendências + RDO de hoje) ═══════════
  _renderOperationalSummary(contract, nfsContrato, passagensPendentes) {
    const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const hojeStr = new Date().toISOString().split('T')[0];
    const rdoHoje = rdos.find(r => r.data === hojeStr) || null;
    const totaisHoje = rdoHoje?.totais || {};
    const hhDia = parseFloat(totaisHoje.hh_dia || totaisHoje.hhDia || 0);
    const pessoasHoje = (rdoHoje?.moi?.length || 0) + (rdoHoje?.mod?.length || 0) + (rdoHoje?.terc?.length || 0);
    const avancoHoje = parseFloat(totaisHoje.avanco || totaisHoje.avanco_pct || 0);

    const bmsRecentes = nfsContrato.slice().sort((a, b) => (b.dataLimite || '').localeCompare(a.dataLimite || '')).slice(0, 5);

    const docCount = (passagensPendentes || []).length;

    return `
    <div class="grid-3 mb-2xl">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Saídas / BMs</h3>
          <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='financeiro';window.ContratoDetail.render('${contract.id}');event.preventDefault();" style="font-size:13px;color:var(--color-primary);text-decoration:none;">Ver todas →</a>
        </div>
        ${bmsRecentes.length === 0 ? `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">Nenhum BM emitido</p>
        ` : `
          <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
            ${bmsRecentes.map(nf => {
              const recebida = !!(nf.caixaEntryId || nf.caixa_entry_id);
              const emitida = !!nf.emitida;
              const status = recebida ? 'Recebida' : emitida ? 'NF emitida' : 'Rascunho';
              const cor = recebida ? 'var(--color-success)' : emitida ? 'var(--color-info)' : 'var(--color-text-muted)';
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);">
                  <div>
                    <div style="font-weight:600;font-size:14px;">BM ${escapeHtml(nf.numero || '—')}</div>
                    <div style="font-size:12px;color:var(--color-text-muted);">${nf.dataLimite ? new Date(nf.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</div>
                  </div>
                  <div class="rh-text-right">
                    <div style="font-weight:700;font-size:14px;">${Store.formatBRL(parseFloat(nf.valor) || 0)}</div>
                    <div style="font-size:11px;color:${cor};font-weight:600;">${status}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Pendências</h3>
          ${docCount > 0 ? `<span class="badge" style="background:rgba(229,62,62,.12);color:var(--color-danger);">${docCount} aberta${docCount !== 1 ? 's' : ''}</span>` : ''}
        </div>
        ${docCount === 0 ? `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">Nenhuma pendência</p>
        ` : `
          <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
            ${passagensPendentes.slice(0, 5).map(p => {
              const dias = p.dataVencimento ? Math.floor((new Date() - new Date(p.dataVencimento)) / 86400000) : 0;
              return `
                <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--color-border);">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--color-danger);margin-top:6px;"></span>
                  <div style="flex:1;">
                    <div style="font-weight:600;font-size:14px;">${escapeHtml(p.descricao || 'Conta a pagar')}</div>
                    <div style="font-size:12px;color:var(--color-text-muted);">${Store.formatBRL(parseFloat(p.valor) || 0)} · ${dias > 0 ? `atrasada ${dias}d` : 'agendada'}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">RDO de hoje</h3>
          <span class="badge" style="background:${rdoHoje ? 'rgba(56,161,105,.12)' : 'rgba(214,158,46,.12)'};color:${rdoHoje ? 'var(--color-success)' : 'var(--color-warning)'};">${rdoHoje ? '● Lançado' : '○ Pendente'}</span>
        </div>
        ${rdoHoje ? `
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-md);">
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">HH dia</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;">${hhDia ? hhDia.toFixed(0) + 'h' : '—'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Pessoas</div>
              <div style="font-size:20px;font-weight:800;margin-top:4px;">${pessoasHoje || '—'}</div>
            </div>
            <div>
              <div style="font-size:12px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.04em;">Avanço</div>
              <div style="font-size:20px;font-weight:800;color:${avancoHoje > 0 ? 'var(--color-success)' : 'var(--color-text)'};margin-top:4px;">${avancoHoje ? '+' + avancoHoje.toFixed(1) + 'pp' : '—'}</div>
            </div>
          </div>
        ` : `
          <p class="text-muted font-sm" style="padding:var(--sp-md) 0;">RDO ainda não lançado para ${new Date().toLocaleDateString('pt-BR')}</p>
          <a href="#/contratos/${contract.id}" onclick="window.ContratoDetail._tab='rdo';window.ContratoDetail.render('${contract.id}');event.preventDefault();" class="btn btn-primary btn-sm">+ Novo RDO</a>
        `}
      </div>
    </div>
    `;
  },

  // ═══════════ ORGANOGRAMA ═══════════
  renderOrganogramaSection(contract) {
    const membros = contract.organograma || [];
    const view = this._organogramaView || 'hierarquia';

    const body = membros.length === 0
      ? `<p class="text-muted" style="padding: var(--sp-lg);">Nenhum membro cadastrado. Clique em "+ Adicionar Membro" para começar.</p>`
      : (view === 'lista' ? this._renderOrganogramaLista(membros) : this._renderOrganogramaArvore(membros));

    const btnClass = (v) => view === v
      ? 'btn btn-primary btn-sm'
      : 'btn btn-secondary btn-sm';

    return `
      <div class="card mb-2xl">
        <div class="card-header">
          <h3 class="card-title">Organograma da Obra — Equipe</h3>
          <div class="btn-group">
            <button class="${btnClass('hierarquia')}" data-view="hierarquia" id="btnOrgViewH">⛬ Hierarquia</button>
            <button class="${btnClass('lista')}" data-view="lista" id="btnOrgViewL">☰ Lista</button>
            <button class="btn btn-primary btn-sm" id="btnNovoMembroOrg">+ Adicionar Membro</button>
          </div>
        </div>
        <div id="organogramaBody">${body}</div>
      </div>
    `;
  },

  _getRecursoNome(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    return r ? r.nome : '(recurso removido)';
  },

  _getRecursoProfissao(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    return r ? (r.profissao || '') : '';
  },

  _renderOrganogramaLista(membros) {
    const byId = Object.fromEntries(membros.map(m => [m.id, m]));
    const rows = membros.slice().sort((a, b) => {
      const ordem = { encarregado: 0, lider_area: 1, profissional: 2 };
      if (ordem[a.nivel] !== ordem[b.nivel]) return ordem[a.nivel] - ordem[b.nivel];
      return this._getRecursoNome(a.recursoId).localeCompare(this._getRecursoNome(b.recursoId));
    }).map(m => {
      const nome = this._getRecursoNome(m.recursoId);
      const cargo = this._getRecursoProfissao(m.recursoId) || m.cargo || '—';
      const supervisor = m.supervisorId ? (byId[m.supervisorId] ? this._getRecursoNome(byId[m.supervisorId].recursoId) : '—') : '—';
      const cor = NIVEL_COR[m.nivel] || '#999';
      return `
        <tr>
          <td><strong>${escapeHtml(nome)}</strong></td>
          <td>${escapeHtml(cargo)}</td>
          <td><span class="badge" style="background:${cor}22;color:${cor};">${NIVEL_LABEL[m.nivel] || m.nivel}</span></td>
          <td>${escapeHtml(supervisor)}</td>
          <td>${m.area ? escapeHtml(m.area) : '—'}</td>
          <td>
            <div class="actions-cell">
              <a class="action-link btn-editar-org" data-id="${m.id}">Editar</a>
              <a class="action-link danger btn-excluir-org" data-id="${m.id}">Excluir</a>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Nível</th>
              <th>Supervisor</th>
              <th>Área</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  _iniciais(nome) {
    const parts = (nome || '').trim().split(/\s+/);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  _renderNodeOrg(membro, membros) {
    const nome = this._getRecursoNome(membro.recursoId);
    const cargo = this._getRecursoProfissao(membro.recursoId) || membro.cargo || '';
    const cor = NIVEL_COR[membro.nivel] || '#999';
    const filhos = membros.filter(m => m.supervisorId === membro.id);
    const hasChildren = filhos.length > 0;
    const iniciais = this._iniciais(nome);

    // Conta total de descendentes (direto + indireto)
    const contarDescendentes = (id) => {
      const diretos = membros.filter(m => m.supervisorId === id);
      return diretos.reduce((sum, d) => sum + 1 + contarDescendentes(d.id), 0);
    };
    const totalDesc = contarDescendentes(membro.id);

    const nivelClass = `node-${membro.nivel}`;

    const card = `
      <div class="org-node ${nivelClass}" draggable="true" data-id="${membro.id}" data-nivel="${membro.nivel}" data-recurso-id="${membro.recursoId}">
        ${totalDesc > 0 ? `<span class="org-node-count" title="${totalDesc} subordinado(s) no total">${totalDesc}</span>` : ''}
        <div class="org-avatar" aria-hidden="true">${escapeHtml(iniciais)}</div>
        <div class="org-info">
          <button type="button" class="org-node-nome" draggable="false" title="Ver detalhes do colaborador">${escapeHtml(nome)}</button>
          ${cargo ? `<div class="org-cargo">${escapeHtml(cargo)}</div>` : ''}
          ${membro.area ? `<div class="org-area">${escapeHtml(membro.area)}</div>` : ''}
          <div class="org-nivel-tag">${NIVEL_LABEL[membro.nivel] || ''}</div>
        </div>
        <div class="org-actions" draggable="false">
          <button class="org-action-btn btn-editar-org" data-id="${membro.id}" draggable="false" title="Editar membro" aria-label="Editar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          </button>
          <button class="org-action-btn danger btn-excluir-org" data-id="${membro.id}" draggable="false" title="Remover do organograma" aria-label="Remover">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    `;

    if (!hasChildren) {
      return `<li class="org-li">${card}</li>`;
    }

    return `
      <li class="org-li">
        ${card}
        <ul class="org-ul">
          ${filhos.map(f => this._renderNodeOrg(f, membros)).join('')}
        </ul>
      </li>
    `;
  },

  _renderOrganogramaArvore(membros) {
    const raizes = [];
    const encarregado = membros.find(m => m.nivel === 'encarregado');

    if (encarregado) {
      raizes.push(encarregado);
    }

    // Líderes sem encarregado (órfãos) e profissionais sem líder viram raízes separadas
    membros.forEach(m => {
      if (m === encarregado) return;
      const temSupervisor = m.supervisorId && membros.some(x => x.id === m.supervisorId);
      if (!temSupervisor) raizes.push(m);
    });

    const treeCss = `
      <style>
        /* ═══════════════════════════════════════════════════════
           ORGANOGRAMA — Glassmorphism + Minimal Dark
           ═══════════════════════════════════════════════════════ */
        @keyframes orgFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .org-tree {
          padding: var(--sp-2xl) var(--sp-lg);
          overflow-x: auto;
          min-height: 120px;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: 12px;
        }

        .org-tree ul.org-root,
        .org-tree ul.org-ul {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 40px 0 0 0;
          margin: 0;
          list-style: none;
          position: relative;
        }
        .org-tree ul.org-root { padding-top: 0; }

        .org-tree li.org-li {
          flex: none;
          text-align: center;
          list-style: none;
          margin: 0 14px;
          padding: 32px 6px 0 6px;
          position: relative;
        }

        /* Linhas conectoras — sólidas para visibilidade clara */
        .org-tree li.org-li::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          width: 2px; height: 32px;
          background: var(--rh-brand-500, #55588B);
          transform: translateX(-50%);
          border-radius: 2px;
        }
        .org-tree ul.org-ul > li.org-li::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: var(--rh-brand-500, #55588B);
        }
        .org-tree ul.org-root > li.org-li::before,
        .org-tree ul.org-root > li.org-li::after { display: none; }
        .org-tree ul.org-ul > li.org-li:first-child::after { left: 50%; }
        .org-tree ul.org-ul > li.org-li:last-child::after  { right: 50%; }
        .org-tree ul.org-ul > li.org-li:only-child::after  { display: none; }

        /* Card base — Akaunting light clean */
        .org-node {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 18px 12px;
          min-width: 200px;
          max-width: 240px;
          text-align: center;
          cursor: grab;
          user-select: none;
          border-radius: 12px;
          background: #FFFFFF;
          border: 1px solid var(--color-border);
          box-shadow: 0 1px 3px rgba(17,24,39,.06), 0 1px 2px rgba(17,24,39,.04);
          transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s, border-color .2s;
          animation: orgFadeUp .32s cubic-bezier(.2,.8,.2,1) both;
        }

        .org-node:active { cursor: grabbing; }

        .org-node:hover {
          transform: translateY(-2px);
          border-color: rgba(85,88,139,.35);
          box-shadow: 0 8px 20px rgba(17,24,39,.1), 0 4px 8px rgba(17,24,39,.06);
        }

        /* Variantes por nível — paleta Akaunting */
        .org-node.node-encarregado {
          min-width: 230px;
          padding: 20px 22px 14px;
          border-top: 3px solid #55588B;
          box-shadow: 0 2px 6px rgba(85,88,139,.1), 0 1px 2px rgba(85,88,139,.06);
        }
        .org-node.node-encarregado:hover {
          border-color: rgba(85,88,139,.5);
          border-top-color: #55588B;
          box-shadow: 0 10px 24px rgba(85,88,139,.18), 0 4px 8px rgba(85,88,139,.1);
        }

        .org-node.node-lider_area {
          min-width: 210px;
          border-top: 3px solid #6D9480;
        }
        .org-node.node-lider_area:hover {
          border-color: rgba(109,148,128,.5);
          border-top-color: #6D9480;
          box-shadow: 0 8px 20px rgba(109,148,128,.16), 0 4px 8px rgba(109,148,128,.08);
        }

        .org-node.node-profissional {
          min-width: 190px;
          border-top: 3px solid #9CA3AF;
        }
        .org-node.node-profissional:hover {
          border-color: rgba(156,163,175,.55);
          border-top-color: #6B7280;
        }

        /* Avatar com iniciais */
        .org-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Nunito', sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: -.02em;
          color: #0D0F18;
          box-shadow: 0 4px 12px rgba(0,0,0,.3), 0 0 0 3px rgba(255,255,255,.04);
          flex-shrink: 0;
        }
        .node-encarregado .org-avatar {
          width: 52px; height: 52px; font-size: 17px;
          color: #fff;
          background: linear-gradient(135deg, #8B8FBF 0%, #55588B 45%, #3E4068 100%);
          box-shadow:
            0 0 0 3px rgba(85,88,139,.18),
            0 4px 18px rgba(85,88,139,.45),
            inset 0 1px 0 rgba(255,255,255,.22);
        }
        .node-lider_area .org-avatar {
          color: #fff;
          background: linear-gradient(135deg, #A5C4B0 0%, #6D9480 45%, #4D7360 100%);
          box-shadow:
            0 0 0 3px rgba(109,148,128,.18),
            0 4px 14px rgba(109,148,128,.42),
            inset 0 1px 0 rgba(255,255,255,.2);
        }
        .node-profissional .org-avatar {
          width: 40px; height: 40px; font-size:15px;
          color: #fff;
          background: linear-gradient(135deg, #D1D5DB 0%, #9CA3AF 45%, #6B7280 100%);
          box-shadow:
            0 0 0 3px rgba(156,163,175,.15),
            0 3px 12px rgba(156,163,175,.32),
            inset 0 1px 0 rgba(255,255,255,.2);
        }

        .org-info { width: 100%; }

        .org-node-nome {
          font-family: 'Nunito', sans-serif;
          font-weight: 700;
          font-size: 16px;
          color: #1F2937 !important;
          background: none;
          border: none;
          padding: 4px 6px;
          margin: 0;
          cursor: pointer;
          letter-spacing: -.015em;
          line-height: 1.25;
          border-radius: 4px;
          transition: color .15s, background .15s;
          width: 100%;
          display: block;
          word-break: break-word;
          text-shadow: none;
        }
        .node-encarregado .org-node-nome { font-size: 17.5px; font-weight: 800; }
        .node-lider_area  .org-node-nome { font-size: 16.5px; }
        .org-node-nome:hover {
          color: #55588B !important;
          background: rgba(85,88,139,.1);
        }

        .org-cargo {
          font-size:15px;
          font-weight: 600;
          margin-top: 2px;
        }
        .node-encarregado .org-cargo { color: #55588B; }
        .node-lider_area  .org-cargo { color: #4D7360; }
        .node-profissional .org-cargo { color: #374151; }

        .org-area {
          font-size:15px;
          color: var(--color-text-muted);
          font-weight: 500;
          margin-top: 1px;
        }

        .org-nivel-tag {
          display: inline-block;
          margin-top: 6px;
          padding: 2px 8px;
          font-size:15px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--color-text-muted);
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: 99px;
          font-family: 'Nunito', sans-serif;
        }

        /* Contador de subordinados */
        .org-node-count {
          position: absolute;
          top: -8px;
          right: -8px;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          background: var(--color-primary);
          color: #FFFFFF;
          font-family: 'Nunito', sans-serif;
          font-size:15px;
          font-weight: 700;
          border-radius: 99px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(85,88,139,.35), 0 0 0 3px var(--color-surface-2);
          z-index: 2;
        }

        /* Ações */
        .org-actions {
          display: flex;
          gap: 4px;
          margin-top: 8px;
          opacity: 0;
          transform: translateY(-2px);
          transition: opacity .2s, transform .2s;
        }
        .org-node:hover .org-actions {
          opacity: 1;
          transform: translateY(0);
        }
        .org-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          color: var(--color-text-muted);
          border-radius: 6px;
          cursor: pointer;
          padding: 0;
          transition: background .15s, color .15s, border-color .15s, transform .1s;
        }
        .org-action-btn:hover {
          background: rgba(85,88,139,.1);
          border-color: rgba(85,88,139,.3);
          color: var(--color-primary);
          transform: scale(1.06);
        }
        .org-action-btn.danger:hover {
          background: rgba(220,38,38,.08);
          border-color: rgba(220,38,38,.3);
          color: var(--color-danger);
        }

        /* Dragging */
        .org-node.dragging {
          opacity: .5;
          transform: scale(.94) rotate(-1deg);
          box-shadow: 0 20px 40px rgba(17,24,39,.15), 0 0 0 2px var(--color-primary);
          cursor: grabbing;
        }
        .org-node.drop-target {
          border-color: var(--color-primary) !important;
          box-shadow:
            0 0 0 2px var(--color-primary),
            0 8px 24px rgba(85,88,139,.2) !important;
          transform: translateY(-4px) scale(1.03);
        }
        .org-node.drop-invalid {
          border-color: var(--color-danger) !important;
          box-shadow:
            0 0 0 2px var(--color-danger),
            0 8px 24px rgba(220,38,38,.18) !important;
        }

        /* Dica no rodapé */
        .org-tree-hint {
          margin: var(--sp-xl) auto 0;
          max-width: 520px;
          padding: 10px 16px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 10px;
          font-size:15px;
          color: var(--color-text-muted);
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .org-tree-hint svg { flex-shrink: 0; opacity: .7; }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .org-node { animation: none !important; transition: none !important; }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .org-tree { padding: var(--sp-lg) var(--sp-sm); }
          .org-node { min-width: 170px; padding: 12px 12px 10px; }
          .org-node.node-encarregado { min-width: 190px; padding: 14px 14px 10px; }
          .org-avatar { width: 38px; height: 38px; font-size:15px; }
          .node-encarregado .org-avatar { width: 44px; height: 44px; font-size: 15px; }
        }
      </style>
    `;

    if (raizes.length === 0) {
      return treeCss + '<div class="org-tree"><p class="text-muted rh-text-center">Nenhum membro cadastrado.</p></div>';
    }

    const zoomCtrlCss = `
      <style>
        .org-zoom-bar {
          position: sticky; top: 8px; z-index: 5;
          display: inline-flex; gap: 4px;
          background: var(--rh-paper, #fff);
          border: 1px solid var(--rh-ink-200, #E2E8F0);
          border-radius: var(--rh-r-sm, 6px);
          padding: 4px;
          box-shadow: var(--rh-shadow-sm, 0 1px 2px rgba(0,0,0,.06));
          margin-bottom: 12px;
        }
        .org-zoom-btn {
          width: 32px; height: 32px;
          border: none;
          background: transparent;
          color: var(--rh-ink-700, #334155);
          border-radius: 4px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          transition: background .12s;
        }
        .org-zoom-btn:hover { background: var(--rh-ink-100, #F1F5F9); }
        .org-zoom-btn:disabled { opacity: .35; cursor: not-allowed; }
        .org-zoom-label {
          min-width: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 600;
          color: var(--rh-ink-500, #64748B);
          font-variant-numeric: tabular-nums;
        }
        .org-zoom-wrap {
          overflow: auto;
          max-width: 100%;
        }
        .org-zoom-content {
          transform-origin: top left;
          transition: transform .15s ease;
        }
      </style>
    `;
    return treeCss + zoomCtrlCss + `
      <div class="org-zoom-bar" role="toolbar" aria-label="Controles de zoom do organograma">
        <button class="org-zoom-btn" id="orgZoomOut" aria-label="Diminuir zoom" title="Zoom −">−</button>
        <span class="org-zoom-label" id="orgZoomLabel">100%</span>
        <button class="org-zoom-btn" id="orgZoomIn" aria-label="Aumentar zoom" title="Zoom +">+</button>
        <button class="org-zoom-btn" id="orgZoomReset" aria-label="Restaurar zoom 100%" title="Restaurar 100%" style="font-size:13px;">⟲</button>
      </div>
      <div class="org-zoom-wrap">
        <div class="org-zoom-content" id="orgZoomContent">
          <div class="org-tree">
            <ul class="org-root">
              ${raizes.map(r => this._renderNodeOrg(r, membros)).join('')}
            </ul>
            <div class="org-tree-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>
              </svg>
              Arraste um card sobre outro para alterar o supervisor direto. Clique no nome para ver detalhes. Use os botões de zoom para ver a equipe inteira.
            </div>
          </div>
        </div>
      </div>
    `;
  },

  attachOrganogramaListeners(contract) {
    const contractId = contract.id;

    const btnH = document.getElementById('btnOrgViewH');
    const btnL = document.getElementById('btnOrgViewL');
    if (btnH) btnH.addEventListener('click', () => this._switchOrgView('hierarquia', contract));
    if (btnL) btnL.addEventListener('click', () => this._switchOrgView('lista', contract));

    const btnNovo = document.getElementById('btnNovoMembroOrg');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalOrganograma(contractId));

    // Zoom do organograma — persiste em sessionStorage
    const ZOOM_KEY = 'rhino-org-zoom';
    const ZOOM_MIN = 0.4, ZOOM_MAX = 1.5, ZOOM_STEP = 0.1;
    const content = document.getElementById('orgZoomContent');
    const label   = document.getElementById('orgZoomLabel');
    const btnIn   = document.getElementById('orgZoomIn');
    const btnOut  = document.getElementById('orgZoomOut');
    const btnRst  = document.getElementById('orgZoomReset');
    if (content && label && btnIn && btnOut) {
      let zoom = parseFloat(sessionStorage.getItem(ZOOM_KEY) || '1') || 1;
      const apply = () => {
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
        content.style.transform = `scale(${zoom})`;
        // Reserva espaço pra evitar corte: ajusta altura/width do wrap
        content.style.width = (100 / zoom) + '%';
        label.textContent = Math.round(zoom * 100) + '%';
        btnIn.disabled  = zoom >= ZOOM_MAX;
        btnOut.disabled = zoom <= ZOOM_MIN;
        sessionStorage.setItem(ZOOM_KEY, String(zoom));
      };
      btnIn.addEventListener('click',  () => { zoom += ZOOM_STEP; apply(); });
      btnOut.addEventListener('click', () => { zoom -= ZOOM_STEP; apply(); });
      if (btnRst) btnRst.addEventListener('click', () => { zoom = 1; apply(); });
      apply();
    }

    this._attachOrgRowListeners(contract);
  },

  _attachOrgRowListeners(contract) {
    document.querySelectorAll('.btn-editar-org').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const membroId = e.currentTarget.dataset.id;
        const membro = (contract.organograma || []).find(m => m.id === membroId);
        this.showModalOrganograma(contract.id, membro);
      });
    });
    document.querySelectorAll('.btn-excluir-org').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteMembroOrganograma(contract.id, e.currentTarget.dataset.id);
      });
    });
    document.querySelectorAll('.org-node-nome').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = el.closest('.org-node');
        const recursoId = card?.dataset.recursoId;
        if (recursoId) this.showDetalheColaborador(recursoId);
      });
    });
    this._attachDragDrop(contract);
  },

  _calcProximaFolgaRecurso(r) {
    if (!r.alocacaoAtual || !r.alocacaoAtual.dataInicio) return null;
    const ciclo = parseInt(r.alocacaoAtual.cicloTrabalho) || 21;
    const inicio = new Date(r.alocacaoAtual.dataInicio + 'T12:00:00');
    const folgas = (r.folgas || []).slice().sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const ultima = folgas[0];
    const base = ultima?.dataFim ? new Date(ultima.dataFim + 'T12:00:00') : inicio;
    const proxima = new Date(base);
    proxima.setDate(proxima.getDate() + ciclo);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diasRestantes = Math.ceil((proxima - hoje) / 86400000);
    return { dataProxima: proxima.toISOString().split('T')[0], diasRestantes };
  },

  showDetalheColaborador(recursoId) {
    const r = (Store.state.recursos || []).find(x => x.id === recursoId);
    if (!r) { showToast('Recurso não encontrado', 'error'); return; }

    const fmt = (d) => {
      if (!d) return '—';
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };

    const contratoAtual = r.alocacaoAtual?.contractId
      ? (Store.state.contracts || []).find(c => c.id === r.alocacaoAtual.contractId)
      : null;

    const folgas = (r.folgas || []).slice().sort((a, b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    const proxima = r.status === 'funcionario' ? this._calcProximaFolgaRecurso(r) : null;

    let proximaHtml = '';
    if (proxima) {
      const { diasRestantes, dataProxima } = proxima;
      const cor = diasRestantes < 0 ? '#DC2626' : diasRestantes <= 5 ? '#D97706' : '#059669';
      const label = diasRestantes < 0
        ? `Vencida há ${Math.abs(diasRestantes)} dia(s)`
        : diasRestantes === 0 ? 'Hoje' : `em ${diasRestantes} dia(s)`;
      proximaHtml = `
        <div style="padding:var(--sp-md);background:${cor}14;border-left:3px solid ${cor};border-radius:6px;margin-bottom:var(--sp-md);">
          <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Próxima Folga</div>
          <div style="font-size:18px;font-weight:700;color:${cor};margin-top:2px;">${label}</div>
          <div class="rh-meta">Prevista para ${fmt(dataProxima)}</div>
        </div>
      `;
    }

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const docs = r.documentos || [];
    const docsHtml = docs.length === 0
      ? `<p class="text-muted" style="font-size:15px;">Nenhum documento cadastrado.</p>`
      : `<div style="display:flex;flex-direction:column;gap:6px;">
          ${docs.map(d => {
            let statusLbl = '', statusCor = 'var(--color-text-muted)';
            if (d.dataVencimento) {
              const dias = Math.ceil((new Date(d.dataVencimento + 'T12:00:00') - hoje) / 86400000);
              if (dias < 0)      { statusLbl = `Vencido há ${Math.abs(dias)}d`; statusCor = 'var(--color-danger)'; }
              else if (dias === 0){ statusLbl = `Vence hoje`;  statusCor = 'var(--color-warning)'; }
              else if (dias <= 30){ statusLbl = `Vence em ${dias}d`; statusCor = 'var(--color-warning)'; }
              else               { statusLbl = `Válido (${dias}d)`; statusCor = 'var(--color-success)'; }
            } else {
              statusLbl = 'Sem vencimento'; statusCor = 'var(--color-text-muted)';
            }
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;">
                <div>
                  <div style="font-size: 15px;font-weight:600;">${escapeHtml(d.tipo || 'Documento')}</div>
                  ${d.dataVencimento ? `<div class="rh-meta">Venc.: ${fmt(d.dataVencimento)}</div>` : ''}
                </div>
                <span style="font-size:15px;font-weight:700;color:${statusCor};">${statusLbl}</span>
              </div>
            `;
          }).join('')}
        </div>`;

    const folgasHtml = folgas.length === 0
      ? `<p class="text-muted" style="font-size:15px;">Nenhuma folga registrada.</p>`
      : `<div style="max-height:180px;overflow-y:auto;">
          <table style="width:100%;font-size:15px;">
            <thead>
              <tr style="text-align:left;">
                <th style="padding:6px 0;border-bottom:1px solid var(--color-border);">Início</th>
                <th style="padding:6px 0;border-bottom:1px solid var(--color-border);">Fim</th>
                <th style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">Passagem Ida</th>
                <th style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">Volta</th>
              </tr>
            </thead>
            <tbody>
              ${folgas.slice(0, 6).map(f => `
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);">${fmt(f.dataInicio)}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);">${fmt(f.dataFim)}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">${f.passagemIda?.comprada ? '✓' : '—'}</td>
                  <td style="padding:6px 0;border-bottom:1px solid var(--color-border);text-align:center;">${f.passagemVolta?.comprada ? '✓' : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${folgas.length > 6 ? `<div style="text-align:center;font-size:15px;color:var(--color-text-muted);margin-top:4px;">+ ${folgas.length - 6} folga(s) mais antigas</div>` : ''}
        </div>`;

    const statusBadge = {
      funcionario:    `<span class="badge" style="background:rgba(34,197,94,.15);color:#22C55E;">Funcionário</span>`,
      candidato:      `<span class="badge" style="background:rgba(96,165,250,.15);color:#60A5FA;">Candidato</span>`,
      ex_funcionario: `<span class="badge" style="background:rgba(75,93,123,.2);color:var(--color-text-muted);">Ex-Funcionário</span>`
    }[r.status] || '';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width:720px;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div>
              <h2 class="modal-title">${escapeHtml(r.nome || '—')}</h2>
              <div style="font-size:15px;color:var(--color-text-muted);margin-top:4px;">
                ${r.profissao ? escapeHtml(r.profissao) : 'Sem profissão cadastrada'} ${statusBadge}
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>

          <div class="modal-content">
            ${proximaHtml}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);margin-bottom:var(--sp-lg);">
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">Dados Pessoais</div>
                <div style="font-size: 15px;line-height:1.8;">
                  <div><strong>CPF:</strong> ${escapeHtml(r.cpf) || '—'}</div>
                  <div><strong>Nascimento:</strong> ${fmt(r.dataNascimento)}</div>
                  <div><strong>Telefone:</strong> ${escapeHtml(r.telefone) || '—'}</div>
                  <div><strong>Email:</strong> ${escapeHtml(r.email) || '—'}</div>
                  <div><strong>Endereço:</strong> ${r.endereco ? escapeHtml(r.endereco) : '—'}</div>
                </div>
              </div>
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">Dados Profissionais</div>
                <div style="font-size: 15px;line-height:1.8;">
                  <div><strong>Admissão:</strong> ${fmt(r.dataAdmissao)}</div>
                  <div><strong>Salário:</strong> ${r.salario ? Store.formatBRL(r.salario) : '—'}</div>
                  <div><strong>CNH:</strong> ${escapeHtml(r.cnh) || '—'}</div>
                  <div><strong>PIS:</strong> ${escapeHtml(r.pis) || '—'}</div>
                  ${contratoAtual ? `<div><strong>Obra atual:</strong> ${escapeHtml(contratoAtual.name)}</div>` : ''}
                  ${r.alocacaoAtual?.dataInicio ? `<div><strong>Início obra:</strong> ${fmt(r.alocacaoAtual.dataInicio)}</div>` : ''}
                  ${r.alocacaoAtual?.cicloTrabalho ? `<div><strong>Ciclo:</strong> ${r.alocacaoAtual.cicloTrabalho}×${r.alocacaoAtual.cicloFolga || 7} dias</div>` : ''}
                </div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-lg);">
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">📅 Histórico de Folgas</div>
                ${folgasHtml}
              </div>
              <div>
                <div style="font-size:15px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:var(--sp-sm);">📋 Documentação</div>
                ${docsHtml}
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <a href="#/recursos" class="btn btn-secondary" id="btnIrRecursos">Gerenciar em Recursos</a>
            <button type="button" class="btn btn-primary" id="btnFecharDetalhe">Fechar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDetalhe').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  },

  // ── Drag & Drop no organograma ────────────────────────────────
  _attachDragDrop(contract) {
    const nodes = document.querySelectorAll('.org-node[draggable="true"]');
    if (!nodes.length) return;

    nodes.forEach(node => {
      node.addEventListener('dragstart', (e) => {
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.dataset.id);
      });

      node.addEventListener('dragend', () => {
        node.classList.remove('dragging');
        document.querySelectorAll('.org-node').forEach(n => {
          n.classList.remove('drop-target', 'drop-invalid');
        });
      });

      node.addEventListener('dragover', (e) => {
        const draggingId = document.querySelector('.org-node.dragging')?.dataset.id;
        const targetId = node.dataset.id;
        if (!draggingId || draggingId === targetId) return;

        e.preventDefault();
        const ok = this._podeReparentar(draggingId, targetId, contract.organograma || []);
        node.classList.remove('drop-target', 'drop-invalid');
        node.classList.add(ok ? 'drop-target' : 'drop-invalid');
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
      });

      node.addEventListener('dragleave', () => {
        node.classList.remove('drop-target', 'drop-invalid');
      });

      node.addEventListener('drop', async (e) => {
        e.preventDefault();
        const draggingId = e.dataTransfer.getData('text/plain');
        const targetId = node.dataset.id;
        node.classList.remove('drop-target', 'drop-invalid');
        if (!draggingId || draggingId === targetId) return;

        const organograma = contract.organograma || [];
        if (!this._podeReparentar(draggingId, targetId, organograma)) {
          showToast('Não é possível mover este nó para aqui.', 'warning');
          return;
        }

        const arrastado = organograma.find(m => m.id === draggingId);
        const alvo = organograma.find(m => m.id === targetId);
        if (!arrastado || !alvo) return;

        // Ajusta nível automaticamente conforme o alvo
        let novoNivel = arrastado.nivel;
        if (alvo.nivel === 'encarregado' && arrastado.nivel !== 'encarregado') {
          novoNivel = 'lider_area';
        } else if (alvo.nivel === 'lider_area') {
          novoNivel = 'profissional';
        }

        try {
          await Store.updateMembroOrganograma(contract.id, draggingId, {
            supervisorId: alvo.id,
            nivel: novoNivel,
            area: novoNivel === 'lider_area' ? (arrastado.area || alvo.area || 'Geral') : null
          });
          showToast(`${this._getRecursoNome(arrastado.recursoId)} agora reporta-se a ${this._getRecursoNome(alvo.recursoId)}.`, 'success');
          this.render({ id: contract.id });
        } catch (err) {
          showToast(err.message || 'Erro ao mover.', 'error');
        }
      });
    });
  },

  _podeReparentar(arrastadoId, alvoId, organograma) {
    if (arrastadoId === alvoId) return false;
    const arrastado = organograma.find(m => m.id === arrastadoId);
    const alvo = organograma.find(m => m.id === alvoId);
    if (!arrastado || !alvo) return false;

    // Encarregado não pode virar subordinado de ninguém
    if (arrastado.nivel === 'encarregado') return false;

    // Não pode mover um ancestral para dentro de seu próprio descendente (evita ciclo)
    let cursor = alvo;
    while (cursor && cursor.supervisorId) {
      if (cursor.supervisorId === arrastadoId) return false;
      cursor = organograma.find(m => m.id === cursor.supervisorId);
    }

    // Só faz sentido soltar sob encarregado ou líder
    if (alvo.nivel === 'profissional') return false;

    return true;
  },

  _switchOrgView(view, contract) {
    this._organogramaView = view;
    const body = document.getElementById('organogramaBody');
    if (!body) return;
    const membros = contract.organograma || [];
    body.innerHTML = membros.length === 0
      ? `<p class="text-muted" style="padding: var(--sp-lg);">Nenhum membro cadastrado.</p>`
      : (view === 'lista' ? this._renderOrganogramaLista(membros) : this._renderOrganogramaArvore(membros));
    // Atualiza estado dos botões de toggle
    const btnH = document.getElementById('btnOrgViewH');
    const btnL = document.getElementById('btnOrgViewL');
    if (btnH && btnL) {
      btnH.className = view === 'hierarquia' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      btnL.className = view === 'lista'      ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    }
    this._attachOrgRowListeners(contract);
  },

  showModalOrganograma(contractId, membro) {
    const contract = Store.getContractById(contractId);
    const organograma = contract.organograma || [];
    const recursos = (Store.state.recursos || []).filter(r => r.status === 'funcionario');

    // Recursos já no organograma (excluir no cadastro novo; permitir o do próprio membro em edição)
    const jaNoOrg = new Set(organograma.filter(m => !membro || m.id !== membro.id).map(m => m.recursoId));
    const recursosDisponiveis = recursos.filter(r => !jaNoOrg.has(r.id) || (membro && membro.recursoId === r.id));

    const temEncarregado = organograma.some(m => m.nivel === 'encarregado' && (!membro || m.id !== membro.id));
    const lideres = organograma.filter(m => m.nivel === 'lider_area' && (!membro || m.id !== membro.id));

    const nivelAtual = membro?.nivel || 'profissional';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 560px;">
          <div class="modal-header">
            <h2 class="modal-title">${membro ? 'Editar Membro' : 'Adicionar Membro ao Organograma'}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formOrganograma" class="modal-content">
            <div class="form-group">
              <label class="form-label">Recurso (Funcionário) *</label>
              <select class="form-control" name="recursoId" required ${membro ? 'disabled' : ''}>
                <option value="">— Selecione —</option>
                ${recursosDisponiveis.map(r => `
                  <option value="${r.id}" ${membro?.recursoId === r.id ? 'selected' : ''}>
                    ${escapeHtml(r.nome)}${r.profissao ? ' — ' + escapeHtml(r.profissao) : ''}
                  </option>
                `).join('')}
              </select>
              ${membro ? `<input type="hidden" name="recursoId" value="${membro.recursoId}">` : ''}
              ${!membro && recursosDisponiveis.length === 0 ? `<div class="form-helper" style="color:var(--color-warning);">Todos os funcionários já estão no organograma.</div>` : ''}
            </div>

            <div class="form-group">
              <label class="form-label">Nível (deduzido da profissão)</label>
              <div id="orgNivelBadge" style="padding:10px 14px;border-radius:6px;background:var(--color-surface-2);border:1px solid var(--color-border);font-weight:600;font-size:15px;">—</div>
              <input type="hidden" name="nivel" id="orgNivel">
              <div class="form-helper">O nível vem da profissão cadastrada. Edite em <a href="#/recursos" style="color:var(--color-primary);">Recursos</a> se precisar mudar.</div>
            </div>

            <div class="form-group" id="orgAreaWrap" style="${nivelAtual === 'lider_area' ? '' : 'display:none;'}">
              <label class="form-label">Área *</label>
              <input class="form-control" name="area" value="${escapeHtml(membro?.area || '')}" placeholder="Ex: Mecânica, Elétrica, Andaimes, Segurança">
            </div>

            <div class="form-group" id="orgSupervisorWrap" style="${nivelAtual === 'encarregado' ? 'display:none;' : ''}">
              <label class="form-label">Supervisor Direto *</label>
              <select class="form-control" name="supervisorId" id="orgSupervisor">
                <option value="">— Selecione —</option>
              </select>
              <div class="form-helper" id="orgSupervisorHelp"></div>
            </div>

            <div class="modal-footer" style="margin-top:var(--sp-xl);">
              <button type="button" class="btn btn-secondary" id="btnCancelarOrg">Cancelar</button>
              <button type="submit" class="btn btn-primary">${membro ? 'Salvar Alterações' : 'Adicionar'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const nivelHidden = document.getElementById('orgNivel');
    const nivelBadge = document.getElementById('orgNivelBadge');
    const recursoSelect = overlay.querySelector('select[name="recursoId"]');
    const supervisorWrap = document.getElementById('orgSupervisorWrap');
    const supervisorSelect = document.getElementById('orgSupervisor');
    const supervisorHelp = document.getElementById('orgSupervisorHelp');
    const areaWrap = document.getElementById('orgAreaWrap');

    const encarregado = organograma.find(m => m.nivel === 'encarregado' && (!membro || m.id !== membro.id));

    const preencherSupervisores = (nivel) => {
      supervisorSelect.innerHTML = '<option value="">— Selecione —</option>';
      if (nivel === 'encarregado') {
        supervisorWrap.style.display = 'none';
        supervisorSelect.removeAttribute('required');
      } else if (nivel === 'lider_area') {
        supervisorWrap.style.display = '';
        supervisorSelect.removeAttribute('required');
        supervisorHelp.textContent = 'Opcional — indique o encarregado, se houver.';
        if (encarregado) {
          const selected = membro?.supervisorId === encarregado.id ? 'selected' : '';
          supervisorSelect.innerHTML += `<option value="${encarregado.id}" ${selected}>${escapeHtml(this._getRecursoNome(encarregado.recursoId))} (Encarregado)</option>`;
        } else {
          supervisorHelp.textContent = 'Nenhum encarregado cadastrado ainda.';
        }
      } else { // profissional
        supervisorWrap.style.display = '';
        supervisorSelect.setAttribute('required', 'required');
        supervisorHelp.textContent = 'Selecione o líder de área ao qual este profissional se reporta.';
        lideres.forEach(l => {
          const selected = membro?.supervisorId === l.id ? 'selected' : '';
          supervisorSelect.innerHTML += `<option value="${l.id}" ${selected}>${escapeHtml(this._getRecursoNome(l.recursoId))}${l.area ? ' — ' + escapeHtml(l.area) : ''}</option>`;
        });
        if (lideres.length === 0) {
          supervisorHelp.textContent = 'Nenhum Líder de Área cadastrado. Adicione um líder antes de incluir profissionais.';
        }
      }
    };

    const atualizarCamposCondicionais = () => {
      const rid = membro ? membro.recursoId : (recursoSelect ? recursoSelect.value : '');
      const rec = (Store.state.recursos || []).find(r => r.id === rid);
      const profissao = rec?.profissao || '';
      const nivel = rid ? inferirNivelOrganograma(profissao) : 'profissional';

      nivelHidden.value = nivel;
      const cor = NIVEL_COR[nivel] || '#999';
      nivelBadge.style.borderLeft = `3px solid ${cor}`;
      nivelBadge.style.color = cor;
      nivelBadge.innerHTML = rid
        ? `${NIVEL_LABEL[nivel]}${profissao ? ` <span style="color:var(--color-text-muted);font-weight:400;">· ${escapeHtml(profissao)}</span>` : ''}`
        : '— (selecione um recurso)';

      // Bloqueia adicionar segundo encarregado
      if (nivel === 'encarregado' && temEncarregado && !membro) {
        nivelBadge.innerHTML += ` <span style="color:var(--color-danger);font-weight:600;">· já existe um encarregado</span>`;
      }

      areaWrap.style.display = nivel === 'lider_area' ? '' : 'none';
      preencherSupervisores(nivel);
    };

    if (recursoSelect) recursoSelect.addEventListener('change', atualizarCamposCondicionais);
    atualizarCamposCondicionais();

    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelarOrg').addEventListener('click', close);

    document.getElementById('formOrganograma').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const recursoId = membro ? membro.recursoId : formData.get('recursoId');
      const recurso = (Store.state.recursos || []).find(r => r.id === recursoId);
      const payload = {
        recursoId,
        nivel:        formData.get('nivel'),
        cargo:        recurso?.profissao || '',
        supervisorId: formData.get('supervisorId') || null,
        area:         formData.get('area') || null
      };

      try {
        if (membro) {
          await Store.updateMembroOrganograma(contractId, membro.id, payload);
          showToast('Membro atualizado.', 'success');
        } else {
          await Store.createMembroOrganograma(contractId, payload);
          showToast('Membro adicionado ao organograma.', 'success');
        }
        close();
        this.render({ id: contractId });
      } catch (err) {
        showToast(err.message || 'Erro ao salvar.', 'error');
      }
    });
  },

  async deleteMembroOrganograma(contractId, membroId) {
    const contract = Store.getContractById(contractId);
    const membro = (contract.organograma || []).find(m => m.id === membroId);
    if (!membro) return;

    const nome = this._getRecursoNome(membro.recursoId);

    // Se for líder com subordinados, oferecer opções
    const subordinados = (contract.organograma || []).filter(m => m.supervisorId === membroId);
    let opts;
    if (membro.nivel === 'lider_area' && subordinados.length > 0) {
      const outrosLideres = (contract.organograma || []).filter(m => m.nivel === 'lider_area' && m.id !== membroId);
      const msg = `"${nome}" é líder de ${subordinados.length} profissional(is).\n\n` +
        (outrosLideres.length > 0
          ? `Opções:\n  1 = Remover líder e TODOS os ${subordinados.length} profissionais (cascata)\n  2 = Remover líder e reassociar profissionais a outro líder\n\nDigite 1 ou 2:`
          : `Não há outro líder para reassociar. Remover líder e TODOS os profissionais vinculados?\n\nDigite "SIM" para confirmar cascata:`);
      const resp = prompt(msg);
      if (resp === null) return;
      if (outrosLideres.length > 0) {
        if (resp.trim() === '1') {
          opts = { mode: 'cascade' };
        } else if (resp.trim() === '2') {
          const lista = outrosLideres.map((l, i) => `${i + 1}. ${this._getRecursoNome(l.recursoId)}${l.area ? ' — ' + l.area : ''}`).join('\n');
          const escolha = prompt(`Escolha o líder de destino:\n\n${lista}\n\nDigite o número:`);
          const idx = parseInt(escolha) - 1;
          if (isNaN(idx) || idx < 0 || idx >= outrosLideres.length) { showToast('Seleção inválida.', 'warning'); return; }
          opts = { mode: 'reassign', reassignTo: outrosLideres[idx].id };
        } else { return; }
      } else {
        if (resp.trim().toUpperCase() !== 'SIM') return;
        opts = { mode: 'cascade' };
      }
    } else {
      if (!confirm(`Remover "${nome}" do organograma?`)) return;
    }

    try {
      await Store.deleteMembroOrganograma(contractId, membroId, opts);
      showToast('Membro removido.', 'success');
      this.render({ id: contractId });
    } catch (err) {
      showToast(err.message || 'Erro ao remover.', 'error');
    }
  },

  // ═══════════ RDO — Relatório Diário de Obra ═══════════
  renderRdoSection(contract) {
    const rdos = (contract.rdos || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    // Compliance: calcula último dia útil e dias úteis sem RDO (cliente-side)
    const isWeekend = (d) => { const x = d.getDay(); return x === 0 || x === 6; };
    const toIso = (d) => d.toISOString().split('T')[0];
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const todayDow = today.getDay();
    const ehFimDeSemana = isWeekend(today);
    const ultDiaUtil = new Date(today);
    ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
    while (isWeekend(ultDiaUtil)) ultDiaUtil.setDate(ultDiaUtil.getDate() - 1);
    const ultDiaUtilIso = toIso(ultDiaUtil);
    const ultimoRdo = rdos.length > 0 ? rdos[0].data : null;
    let diasUteisSem = 0;
    if (ultimoRdo) {
      const cur = new Date(ultimoRdo + 'T12:00:00');
      cur.setDate(cur.getDate() + 1);
      while (toIso(cur) <= toIso(today)) {
        if (!isWeekend(cur)) diasUteisSem++;
        cur.setDate(cur.getDate() + 1);
      }
    }
    const fmtBr = (iso) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

    let alertaHtml = '';
    if (contract.status === 'ativo' && !ehFimDeSemana) {
      if (!ultimoRdo) {
        alertaHtml = `<div style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">⚠ <strong>Esta obra ainda não tem nenhum RDO registrado.</strong> Clique em "+ Novo RDO" para começar.</div>`;
      } else if (ultimoRdo < ultDiaUtilIso) {
        alertaHtml = `<div style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">🔴 <strong>Sem RDO no último dia útil (${fmtBr(ultDiaUtilIso)}).</strong> Último RDO: ${fmtBr(ultimoRdo)} — ${diasUteisSem} dia(s) útil(eis) sem registrar.</div>`;
      } else if (diasUteisSem > 2) {
        alertaHtml = `<div style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:10px 14px;border-radius:8px;margin-bottom:var(--sp-md);font-size:14px;">⏰ <strong>${diasUteisSem} dias úteis sem RDO.</strong> Último: ${fmtBr(ultimoRdo)}.</div>`;
      }
    } else if (ehFimDeSemana && contract.status === 'ativo') {
      alertaHtml = `<div style="background:#dbeafe;color:#1e3a8a;border:1px solid #93c5fd;padding:8px 12px;border-radius:8px;margin-bottom:var(--sp-md);font-size:13px;">📅 Hoje é fim de semana — RDO é ocasional, não obrigatório.</div>`;
    }

    const body = rdos.length === 0 ? `
      <div style="text-align:center;padding:var(--sp-2xl) var(--sp-lg);color:var(--color-text-muted);">
        <div style="font-size:38px;margin-bottom:var(--sp-md);opacity:.5;">📋</div>
        <div style="font-size:17px;font-weight:600;color:var(--color-text);margin-bottom:4px;">Nenhum RDO registrado</div>
        <div style="font-size:14px;">Clique em "+ Novo RDO" para começar.</div>
      </div>
    ` : `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:60px;">Nº</th>
              <th>Data</th>
              <th>Clima</th>
              <th class="rh-text-center">MO Total</th>
              <th class="rh-text-center">Equip.</th>
              <th class="rh-text-center">Atividades</th>
              <th class="rh-text-center">Fotos</th>
              <th>Segurança</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rdos.map(r => {
              const fmt = (d) => {
                if (!d) return '—';
                const [y, m, day] = d.split('-');
                return `${day}/${m}/${y}`;
              };
              const moTotal = ((r.moi || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0))
                            + ((r.mod || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0))
                            + ((r.terc || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0));
              const eqpTotal = (r.equipamentos || []).reduce((s, x) => s + (parseFloat(x.qtd) || 0), 0);
              const atvCount = (r.atividades || []).length;
              const fotoCount = (r.fotos || []).length;
              const climaManha = r.tempo?.manha?.tempo || '—';
              const climaIcone = { bom: '☀️', chuva: '🌧️', nao_houve: '—' }[climaManha] || '—';
              const acidente = r.seguranca?.acidente || 'nao_houve';
              const segBadge = acidente === 'nao_houve'
                ? '<span class="badge" style="background:#D1FAE5;color:#047857;">OK</span>'
                : acidente === 'sem_afastamento'
                ? '<span class="badge" style="background:#FEF3C7;color:#B45309;">S/ Afast.</span>'
                : '<span class="badge" style="background:#FEE2E2;color:#B91C1C;">C/ Afast.</span>';

              return `
                <tr class="row-rdo" data-id="${r.id}" style="cursor:pointer;">
                  <td><strong style="color:var(--color-primary);">#${r.numero}</strong></td>
                  <td><strong>${fmt(r.data)}</strong>${r.diaSemana ? `<div class="rh-meta">${r.diaSemana}</div>` : ''}</td>
                  <td style="font-size:18px;">${climaIcone}</td>
                  <td style="text-align:center;font-weight:700;">${moTotal}</td>
                  <td class="rh-text-center">${eqpTotal}</td>
                  <td class="rh-text-center">${atvCount}</td>
                  <td class="rh-text-center">${fotoCount > 0 ? `📷 ${fotoCount}` : '—'}</td>
                  <td>${segBadge}</td>
                  <td>
                    <div class="actions-cell">
                      <a class="action-link btn-editar-rdo" data-id="${r.id}">Editar</a>
                      <a class="action-link btn-pdf-rdo" data-id="${r.id}" style="color:var(--color-info);">📄 PDF</a>
                      <a class="action-link danger btn-excluir-rdo" data-id="${r.id}">Excluir</a>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    setTimeout(() => this._attachRdoListeners(contract), 0);

    return `
      ${alertaHtml}
      <div class="card mb-2xl">
        <div class="card-header">
          <h3 class="card-title">Relatórios Diários de Obra (RDO)</h3>
          <button class="btn btn-primary btn-sm" id="btnNovoRdo">+ Novo RDO</button>
        </div>
        ${body}
      </div>
    `;
  },

  _attachRdoListeners(contract) {
    const btnNovo = document.getElementById('btnNovoRdo');
    if (btnNovo) btnNovo.addEventListener('click', () => this.showModalRdo(contract.id));
    document.querySelectorAll('.btn-editar-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rdo = (contract.rdos || []).find(r => r.id === e.currentTarget.dataset.id);
        this.showModalRdo(contract.id, rdo);
      });
    });
    document.querySelectorAll('.btn-excluir-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteRdo(contract.id, e.currentTarget.dataset.id); });
    });
    document.querySelectorAll('.btn-pdf-rdo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rdo = (contract.rdos || []).find(r => r.id === e.currentTarget.dataset.id);
        if (rdo) this.exportarRdoPdf(rdo, contract);
      });
    });
    // Click na linha → abre resumo do RDO
    document.querySelectorAll('.row-rdo').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.actions-cell')) return;
        const rdo = (contract.rdos || []).find(r => r.id === tr.dataset.id);
        if (rdo) this.showRdoDetail(rdo, contract);
      });
    });
  },

  // ─── Modal de resumo de RDO (reusado pelo Contratos e pela tela RDOs) ───
  showRdoDetail(rdo, contract) {
    const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const list = (arr) => Array.isArray(arr) ? arr : [];

    const moi  = list(rdo.moi);
    const mod_ = list(rdo.mod);
    const terc = list(rdo.terc);
    const eqp  = list(rdo.equipamentos);
    const atv  = list(rdo.atividades);
    const fotos = list(rdo.fotos);

    const totMoi  = moi.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totMod  = mod_.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totTerc = terc.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);
    const totEqp  = eqp.reduce((s, x) => s + (parseFloat(x.qtd) || parseFloat(x.quantidade) || 0), 0);

    const seg = rdo.seguranca || {};
    const acidente = seg.acidente || 'nao_houve';
    const acidenteLbl = { nao_houve: 'Sem acidentes', sem_afastamento: 'Acidente sem afastamento', com_afastamento: 'Acidente com afastamento' }[acidente] || acidente;
    const acidenteCor = acidente === 'nao_houve' ? '#10b981' : acidente === 'sem_afastamento' ? '#f59e0b' : '#dc2626';

    const tempoLbl = (t) => {
      if (!t || t === 'nao_houve' || t === 'sem_expediente') return '—';
      return ({ bom: '☀️ Bom', nublado: '⛅ Nublado', chuva: '🌧 Chuva' })[t] || t;
    };
    const tempo = rdo.tempo || {};

    const renderTabela = (titulo, arr, cols) => {
      if (arr.length === 0) return '';
      return `
        <div style="margin-bottom:var(--sp-md);">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:6px;">${titulo}</div>
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <thead><tr style="border-bottom:1px solid var(--color-border);">
              ${cols.map(c => `<th style="text-align:${c.align || 'left'};padding:6px 8px;color:var(--color-text-muted);font-weight:600;">${c.label}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${arr.map(r => `<tr style="border-bottom:1px solid var(--color-border);">
                ${cols.map(c => `<td style="text-align:${c.align || 'left'};padding:6px 8px;">${escapeHtml(String(r[c.key] ?? '—'))}</td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };

    const html = `
      <div class="modal-overlay" id="modalRdoDetail">
        <div class="modal" style="width:760px;max-width:95vw;max-height:90vh;overflow-y:auto;">
          <div class="modal-header">
            <div style="flex:1;min-width:0;">
              <h2 class="modal-title" style="margin:0;">RDO #${escapeHtml(String(rdo.numero || ''))} — ${fmt(rdo.data)}</h2>
              <div style="font-size:13px;color:var(--color-text-muted);margin-top:4px;">
                ${escapeHtml(contract?.name || '')} ${contract?.client ? '· ' + escapeHtml(contract.client) : ''}
              </div>
            </div>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content">
            <!-- Cabeçalho do dia -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--sp-sm);margin-bottom:var(--sp-md);">
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Dia da semana</div>
                <div style="font-weight:600;">${escapeHtml(rdo.diaSemana || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">OS</div>
                <div style="font-weight:600;">${escapeHtml(rdo.osNumero || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Ordem de compra</div>
                <div style="font-weight:600;">${escapeHtml(rdo.ordemCompra || '—')}</div>
              </div>
              <div style="padding:8px 10px;background:var(--color-surface-2);border-radius:6px;">
                <div class="rh-label">Período</div>
                <div style="font-weight:600;">${escapeHtml(rdo.periodoTrabalho || '—')}</div>
              </div>
            </div>

            <!-- Tempo + Prazo -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-md);margin-bottom:var(--sp-md);">
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Tempo</div>
                <div style="font-size:13px;line-height:1.7;">
                  <div><strong>Manhã:</strong> ${tempoLbl(tempo.manha?.tempo)} ${tempo.manha?.condicoes ? `· ${tempo.manha.condicoes}` : ''}</div>
                  <div><strong>Tarde:</strong> ${tempoLbl(tempo.tarde?.tempo)} ${tempo.tarde?.condicoes ? `· ${tempo.tarde.condicoes}` : ''}</div>
                  <div><strong>Noite ant.:</strong> ${tempoLbl(tempo.noiteAnt?.tempo)} ${tempo.noiteAnt?.condicoes ? `· ${tempo.noiteAnt.condicoes}` : ''}</div>
                  <div><strong>Precipitação:</strong> ${tempo.precipitacao || 0} mm</div>
                </div>
              </div>
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Prazo</div>
                <div style="font-size:13px;line-height:1.7;">
                  <div><strong>Início:</strong> ${fmt(rdo.prazo?.dataInicial)}</div>
                  <div><strong>Contratual:</strong> ${rdo.prazo?.contratual || 0} dias</div>
                  <div><strong>Decorrido:</strong> ${rdo.prazo?.decorrido || 0} dias</div>
                  <div><strong>Faltante:</strong> ${rdo.prazo?.faltante || 0} dias</div>
                  <div><strong>% Concluído:</strong> ${rdo.prazo?.pctConcluida || 0}%</div>
                </div>
              </div>
            </div>

            <!-- Mão de obra -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-md);margin-bottom:var(--sp-md);">
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">MOI</div>
                <div style="font-size:22px;font-weight:700;color:#3b82f6;">${totMoi}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${moi.length} cargo(s)</div>
              </div>
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">MOD</div>
                <div style="font-size:22px;font-weight:700;color:#10b981;">${totMod}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${mod_.length} cargo(s)</div>
              </div>
              <div style="padding:10px;background:var(--color-surface-2);border-radius:6px;text-align:center;">
                <div class="rh-label">Terceiros</div>
                <div style="font-size:22px;font-weight:700;color:#f59e0b;">${totTerc}</div>
                <div style="font-size:11px;color:var(--color-text-muted);">${terc.length} cargo(s)</div>
              </div>
            </div>

            ${renderTabela('Mão de Obra Indireta (MOI)', moi.map(m => ({ cargo: m.cargo, qtd: m.qtd ?? m.quantidade ?? 0, horas: m.horas || 8 })), [
              { key: 'cargo',  label: 'Cargo' },
              { key: 'qtd',    label: 'Qtd',   align: 'center' },
              { key: 'horas',  label: 'Horas', align: 'center' },
            ])}
            ${renderTabela('Mão de Obra Direta (MOD)', mod_.map(m => ({ cargo: m.cargo, qtd: m.qtd ?? m.quantidade ?? 0, horas: m.horas || 8 })), [
              { key: 'cargo',  label: 'Cargo' },
              { key: 'qtd',    label: 'Qtd',   align: 'center' },
              { key: 'horas',  label: 'Horas', align: 'center' },
            ])}
            ${renderTabela('Terceiros', terc.map(m => ({ empresa: m.empresa || m.cargo, qtd: m.qtd ?? m.quantidade ?? 0 })), [
              { key: 'empresa', label: 'Empresa/Cargo' },
              { key: 'qtd',     label: 'Qtd', align: 'center' },
            ])}
            ${renderTabela('Equipamentos', eqp.map(e => ({
              nome: e.nome,
              qtd: e.qtd ?? e.quantidade ?? 0,
              horas: e.horasOperando ?? e.horas ?? 0,
            })), [
              { key: 'nome',  label: 'Equipamento' },
              { key: 'qtd',   label: 'Qtd',          align: 'center' },
              { key: 'horas', label: 'Horas oper.', align: 'center' },
            ])}
            ${renderTabela('Atividades do dia', atv.map(a => ({ descricao: a.descricao, pct: (a.pctExecutado ?? a.pct ?? 0) + '%' })), [
              { key: 'descricao', label: 'Descrição' },
              { key: 'pct',       label: 'Executado', align: 'center' },
            ])}

            <!-- Segurança -->
            <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;border-left:3px solid ${acidenteCor};margin-bottom:var(--sp-md);">
              <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Segurança</div>
              <div style="font-size:13px;line-height:1.7;">
                <div><strong>Status:</strong> <span style="color:${acidenteCor};font-weight:700;">${acidenteLbl}</span></div>
                ${seg.diagnostico ? `<div><strong>Diagnóstico:</strong> ${escapeHtml(seg.diagnostico)}</div>` : ''}
                <div><strong>Admissões:</strong> ${seg.admissoes || 0} · <strong>Demissões:</strong> ${seg.demissoes || 0}</div>
                ${seg.comentarios ? `<div><strong>Observações:</strong> ${escapeHtml(seg.comentarios)}</div>` : ''}
              </div>
            </div>

            ${rdo.fiscalizacaoComentarios ? `
              <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:6px;">Fiscalização</div>
                <div style="font-size:13px;white-space:pre-wrap;">${escapeHtml(rdo.fiscalizacaoComentarios)}</div>
              </div>
            ` : ''}

            ${fotos.length > 0 ? `
              <div style="margin-bottom:var(--sp-md);">
                <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:8px;">Fotos (${fotos.length})</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
                  ${fotos.slice(0, 12).map(f => `
                    <div style="position:relative;aspect-ratio:1;background:var(--color-surface-2);border-radius:6px;overflow:hidden;">
                      ${f.url ? `<img src="${f.url}" alt="${escapeHtml(f.legenda || '')}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:11px;">📷</div>`}
                    </div>
                  `).join('')}
                </div>
                ${fotos.length > 12 ? `<div style="text-align:center;margin-top:6px;color:var(--color-text-muted);font-size:13px;">+ ${fotos.length - 12} foto(s)</div>` : ''}
              </div>
            ` : ''}

            <div style="font-size:11px;color:var(--color-text-muted);font-family:monospace;text-align:right;">ID: ${escapeHtml(rdo.id)}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnRdoClose">Fechar</button>
            ${contract ? `<button class="btn btn-secondary" id="btnRdoEdit">Editar</button>` : ''}
            ${contract ? `<button class="btn btn-primary" id="btnRdoPdf">📄 Exportar PDF</button>` : ''}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalRdoDetail');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnRdoClose').addEventListener('click', close);
    const bEdit = document.getElementById('btnRdoEdit');
    if (bEdit) bEdit.addEventListener('click', () => { close(); this.showModalRdo(contract.id, rdo); });
    const bPdf = document.getElementById('btnRdoPdf');
    if (bPdf) bPdf.addEventListener('click', () => { close(); this.exportarRdoPdf(rdo, contract); });
  },

  _autoMoFromOrganograma(contract) {
    const membros = contract.organograma || [];
    const recursos = Store.state.recursos || [];
    const moi = new Map(), mod = new Map();
    membros.forEach(m => {
      const r = recursos.find(x => x.id === m.recursoId);
      const cargo = (r?.profissao || m.cargo || '').trim();
      if (!cargo) return;
      // Prioridade: rdoCategoria explícita no recurso → nível do organograma → fallback por nome do cargo
      let categoria = r?.rdoCategoria;
      if (!categoria) {
        if (m.nivel === 'encarregado' || m.nivel === 'lider_area') categoria = 'moi';
        else if (m.nivel === 'profissional') categoria = 'mod';
      }
      if (!categoria) categoria = RDO_CARGO_CATEGORIA_MOI.has(cargo) ? 'moi' : 'mod';
      const bucket = categoria === 'moi' ? moi : mod;
      const cur = bucket.get(cargo) || { cargo, qtd: 0, horas: 9 };
      cur.qtd += 1;
      bucket.set(cargo, cur);
    });
    return {
      moi: Array.from(moi.values()),
      mod: Array.from(mod.values())
    };
  },

  _diaSemanaFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
  },

  showModalRdo(contractId, rdo) {
    const contract = Store.getContractById(contractId);
    const isNew = !rdo;
    const hoje = new Date().toISOString().split('T')[0];

    // valores iniciais
    const iniciais = rdo || {
      data: hoje,
      diaSemana: this._diaSemanaFromDate(hoje),
      osNumero: '',
      ordemCompra: contract.contractNumber || contract.name || '',
      projeto: contract.name || '',
      prazo: {
        dataInicial: contract.startDate || '',
        contratual: this._calcDiasPrazo(contract.startDate, contract.endDate),
        decorrido: this._calcDiasDecorridos(contract.startDate, hoje),
        faltante: 0,
        pctConcluida: 0
      },
      tempo: {
        manha:    { tempo: 'bom',            condicoes: 'operavel'   },
        tarde:    { tempo: 'bom',            condicoes: 'operavel'   },
        noiteAnt: { tempo: 'sem_expediente', condicoes: 'inoperavel' },
        precipitacao: 0
      },
      periodoTrabalho: '7:00 às 17:00',
      horaExtra: false,
      ...this._autoMoFromOrganograma(contract),
      terc: [],
      equipamentos: [],
      atividades: [{ area: '', descricao: '', pctConcluida: 0, ocorrencias: '' }],
      seguranca: { acidente: 'nao_houve', diagnostico: '', admissoes: 0, demissoes: 0, comentarios: '' },
      fiscalizacaoComentarios: ''
    };
    // Recalcula prazo sempre (novo ou edição) com base no contrato + data do RDO.
    // Faltante considera a data de tendência (previsão atualizada).
    // Se tendência > endDate contratual → mostra "Atraso de X dias".
    const refData = iniciais.data || hoje;
    const contratual = this._calcDiasPrazo(contract.startDate, contract.endDate);
    const decorrido  = this._calcDiasDecorridos(contract.startDate, refData);
    const tendencia  = contract.tendencyDate || contract.endDate || '';
    const faltanteDias = tendencia
      ? Math.max(0, Math.round((new Date(tendencia) - new Date(refData)) / 86400000))
      : Math.max(0, contratual - decorrido);
    const atrasoDias = (contract.tendencyDate && contract.endDate)
      ? Math.max(0, Math.round((new Date(contract.tendencyDate) - new Date(contract.endDate)) / 86400000))
      : 0;

    iniciais.prazo = {
      dataInicial: contract.startDate || '',
      dataFinal:   contract.endDate   || '',
      dataTendencia: contract.tendencyDate || '',
      contratual,
      decorrido,
      faltante: faltanteDias,
      atraso:   atrasoDias,
      pctConcluida: iniciais.prazo?.pctConcluida || 0
    };

    this._rdoData = JSON.parse(JSON.stringify(iniciais));
    this._rdoTab = 'cabecalho';
    this._renderRdoModal(contractId, rdo);
  },

  _calcDiasPrazo(start, end) {
    if (!start || !end) return 0;
    return Math.round((new Date(end) - new Date(start)) / 86400000);
  },
  _calcDiasDecorridos(start, hoje) {
    if (!start) return 0;
    return Math.max(0, Math.round((new Date(hoje) - new Date(start)) / 86400000));
  },

  _renderRdoModal(contractId, rdoOriginal) {
    // Remove modal antigo se houver
    const existing = document.getElementById('modalRdoOverlay');
    if (existing) existing.remove();

    const contract = Store.getContractById(contractId) || { name: '' };
    const isNew = !rdoOriginal;
    const d = this._rdoData;
    const tab = this._rdoTab;

    const tabs = [
      { k:'cabecalho',    l:'Cabeçalho' },
      { k:'tempo',        l:'Tempo' },
      { k:'mo',           l:'Mão de Obra' },
      { k:'equipamentos', l:'Equipamentos' },
      { k:'atividades',   l:'Atividades' },
      { k:'seguranca',    l:'Segurança' },
      { k:'fiscalizacao', l:'Fiscalização' },
      { k:'fotos',        l:`Fotos${rdoOriginal ? ' (' + ((rdoOriginal.fotos || []).length) + ')' : ''}` }
    ];

    const html = `
      <div class="modal-overlay" id="modalRdoOverlay">
        <div class="modal" style="width:90vw;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;">
          <div class="modal-header" style="flex-shrink:0;">
            <div>
              <h2 class="modal-title">${isNew ? 'Novo RDO' : `RDO #${rdoOriginal.numero} — ${rdoOriginal.data}`}</h2>
              <p style="font-size:15px;color:var(--color-text-muted);margin:0;">${escapeHtml(contract.name || '')}</p>
            </div>
            <button class="modal-close" id="btnCloseRdo">✕</button>
          </div>

          <!-- Tabs internas -->
          <div style="display:flex;gap:2px;padding:0 var(--sp-lg);border-bottom:1px solid var(--color-border);flex-shrink:0;overflow-x:auto;">
            ${tabs.map(t => `
              <button type="button" class="rdo-tab" data-rdo-tab="${t.k}" style="padding:10px 14px;background:transparent;border:none;border-bottom:3px solid ${tab===t.k?'var(--color-primary)':'transparent'};color:${tab===t.k?'var(--color-primary)':'var(--color-text-muted)'};font-size:15px;font-weight:${tab===t.k?'600':'500'};cursor:pointer;white-space:nowrap;margin-bottom:-1px;">${t.l}</button>
            `).join('')}
          </div>

          <div id="rdoFormContent" style="flex:1;overflow-y:auto;padding:var(--sp-lg);">
            ${this._renderRdoTab(tab, rdoOriginal)}
          </div>

          <div class="modal-footer" style="flex-shrink:0;">
            <button type="button" class="btn btn-secondary" id="btnCancelRdo">Cancelar</button>
            <button type="button" class="btn btn-primary" id="btnSaveRdo">${isNew ? 'Criar RDO' : 'Salvar Alterações'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    this._attachRdoModalListeners(contractId, rdoOriginal);
  },

  _renderRdoTab(tab, rdoOriginal) {
    const d = this._rdoData;
    const contract = Store.getContractById(rdoOriginal?.contractId || (this._rdoData._contractId));
    switch (tab) {
      case 'cabecalho':    return this._rdoTabCabecalho(d);
      case 'tempo':        return this._rdoTabTempo(d);
      case 'mo':           return this._rdoTabMo(d);
      case 'equipamentos': return this._rdoTabEquipamentos(d);
      case 'atividades':   return this._rdoTabAtividades(d);
      case 'seguranca':    return this._rdoTabSeguranca(d);
      case 'fiscalizacao': return this._rdoTabFiscalizacao(d);
      case 'fotos':        return this._rdoTabFotos(d, rdoOriginal);
      default: return '';
    }
  },

  _rdoTabCabecalho(d) {
    const fmt = (s) => { if (!s) return '—'; const [y,m,dy] = s.split('-'); return `${dy}/${m}/${y}`; };
    const infoBox = (label, value) => `
      <div style="padding:10px 14px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;">
        <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:2px;">${label}</div>
        <div style="font-size:15px;color:var(--color-text);font-weight:600;">${value || '—'}</div>
      </div>
    `;

    return `
      <!-- Informações do contrato (read-only — puxadas automaticamente) -->
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(85,88,139,.06),rgba(85,88,139,.02));border:1px solid rgba(85,88,139,.2);border-radius:8px;margin-bottom:var(--sp-lg);">
        <div style="font-size:13px;color:#55588B;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">📋 Dados do Contrato (preenchidos automaticamente)</div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
          ${infoBox('Projeto', escapeHtml(d.projeto || ''))}
          ${infoBox('Ordem de Compra', escapeHtml(d.ordemCompra || ''))}
        </div>
      </div>

      <!-- Dados editáveis do dia -->
      <div class="form-row form-row-3" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input class="form-control" type="date" data-rdo-field="data" value="${d.data || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Dia da Semana</label>
          <input class="form-control" data-rdo-field="diaSemana" value="${d.diaSemana || ''}" readonly style="background:var(--color-bg) !important;color:var(--color-text) !important;cursor:not-allowed;">
        </div>
        <div class="form-group">
          <label class="form-label">Nº Ordem de Serviço</label>
          <input class="form-control" data-rdo-field="osNumero" value="${escapeHtml(d.osNumero || '')}" placeholder="Ex: OS-2026-042">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Período de Trabalho</label>
          <select class="form-control" data-rdo-field="periodoTrabalho">
            <option ${d.periodoTrabalho === '7:00 às 15:00' ? 'selected' : ''}>7:00 às 15:00</option>
            <option ${d.periodoTrabalho === '7:00 às 17:00' ? 'selected' : ''}>7:00 às 17:00</option>
            <option ${d.periodoTrabalho === '23:00 às 7:00' ? 'selected' : ''}>23:00 às 7:00</option>
            <option ${d.periodoTrabalho === 'Outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:28px;">
          <input type="checkbox" id="rdoHoraExtra" data-rdo-field="horaExtra" ${d.horaExtra ? 'checked' : ''} style="width:18px;height:18px;">
          <label for="rdoHoraExtra" style="font-size:15px;font-weight:500;cursor:pointer;">Hora Extra</label>
        </div>
      </div>

      <!-- Prazo (tudo calculado automaticamente do contrato + data do RDO) -->
      <h4 style="margin-top:var(--sp-lg);margin-bottom:var(--sp-md);font-size:16px;font-weight:700;color:var(--color-text);">⏱ Prazo do Contrato</h4>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        ${infoBox('Data Inicial',  fmt(d.prazo?.dataInicial))}
        ${infoBox('Data Final (Contratual)', fmt(d.prazo?.dataFinal))}
        ${(() => {
          const td = d.prazo?.dataTendencia;
          const atraso = d.prazo?.atraso || 0;
          if (!td) return infoBox('Data de Tendência', '—');
          const cor = atraso > 0 ? '#DC2626' : '#047857';
          return `
            <div style="padding:10px 14px;background:${atraso > 0 ? '#FEF2F2' : '#ECFDF5'};border:1px solid ${atraso > 0 ? '#FECACA' : '#A7F3D0'};border-radius:6px;">
              <div style="font-size:13px;color:${cor};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:2px;">Data de Tendência</div>
              <div style="font-size:15px;color:#1F2937;font-weight:700;">${fmt(td)}</div>
              ${atraso > 0 ? `<div style="font-size:13px;color:${cor};font-weight:700;margin-top:2px;">⚠ Atraso de ${atraso} dia(s)</div>` : '<div style="font-size:13px;color:#047857;font-weight:600;margin-top:2px;">✓ No prazo</div>'}
            </div>
          `;
        })()}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${infoBox('Contratual',    (d.prazo?.contratual || 0) + ' dias')}
        ${infoBox('Decorrido',     (d.prazo?.decorrido || 0) + ' dias')}
        ${(() => {
          const falt = d.prazo?.faltante || 0;
          const atraso = d.prazo?.atraso || 0;
          const label = atraso > 0 ? 'Atraso' : 'Faltante';
          const valor = atraso > 0 ? `${atraso} dia(s)` : `${falt} dia(s)`;
          const bg = atraso > 0 ? '#FEF2F2' : '#F3F4F6';
          const brd = atraso > 0 ? '#FECACA' : '#E5E7EB';
          const cor = atraso > 0 ? '#DC2626' : '#6B7280';
          return `
            <div style="padding:10px 14px;background:${bg};border:1px solid ${brd};border-radius:6px;">
              <div style="font-size:13px;color:${cor};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:2px;">${label}</div>
              <div style="font-size:15px;color:#1F2937;font-weight:700;">${valor}</div>
            </div>
          `;
        })()}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;">
        <div style="padding:10px 14px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:6px;grid-column:span 3;">
          <div style="font-size:13px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:2px;">% Concluída</div>
          <input class="form-control" type="number" step="0.1" data-rdo-field="prazo.pctConcluida" value="${d.prazo?.pctConcluida || 0}" style="padding:4px 8px;font-weight:700;border:none;background:transparent !important;max-width:120px;">
        </div>
      </div>
      <div style="font-size:13px;color:var(--color-text-muted);margin-top:8px;">💡 As datas e dias são calculados automaticamente. Edite apenas a <strong>% concluída</strong> conforme o avanço.</div>
    `;
  },

  _rdoTabTempo(d) {
    const periodos = [
      { k: 'manha',    l: 'Manhã' },
      { k: 'tarde',    l: 'Tarde' },
      { k: 'noiteAnt', l: 'Noite Ant.' }
    ];
    return `
      <p style="font-size:15px;color:var(--color-text-muted);margin-bottom:var(--sp-lg);">Condição do tempo e da área por período do dia.</p>

      ${periodos.map(p => `
        <div style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-md);">
          <div style="font-weight:700;margin-bottom:var(--sp-sm);font-size:16px;">${p.l}</div>
          <div class="form-row">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Tempo</label>
              <select class="form-control" data-rdo-field="tempo.${p.k}.tempo">
                ${RDO_TEMPO_OPCOES.map(o => `<option value="${o.v}" ${d.tempo?.[p.k]?.tempo === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Condições da Área</label>
              <select class="form-control" data-rdo-field="tempo.${p.k}.condicoes">
                ${RDO_COND_OPCOES.map(o => `<option value="${o.v}" ${d.tempo?.[p.k]?.condicoes === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="form-group">
        <label class="form-label">Precipitação (mm)</label>
        <input class="form-control" type="number" step="0.1" data-rdo-field="tempo.precipitacao" value="${d.tempo?.precipitacao || 0}" style="max-width:200px;">
      </div>
    `;
  },

  _rdoMoRow(cat, entry, idx, opcoesCargo) {
    const options = opcoesCargo.map(c => `<option ${entry.cargo === c ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <tr data-rdo-mo-row="${cat}-${idx}">
        <td>
          <input class="form-control" list="rdo-${cat}-list" data-rdo-mo="${cat}.${idx}.cargo" value="${escapeHtml(entry.cargo || '')}" placeholder="Cargo">
        </td>
        <td style="width:100px;">
          <input class="form-control" type="number" data-rdo-mo="${cat}.${idx}.qtd" value="${entry.qtd || 0}" min="0">
        </td>
        <td style="width:100px;">
          <input class="form-control" type="number" step="0.5" data-rdo-mo="${cat}.${idx}.horas" value="${entry.horas || 0}" min="0">
        </td>
        <td style="text-align:right;font-weight:600;" class="rdo-mo-total">${((entry.qtd || 0) * (entry.horas || 0)).toFixed(1)}</td>
        <td style="width:40px;">
          <button type="button" class="action-link danger" data-rdo-mo-remove="${cat}-${idx}">✕</button>
        </td>
      </tr>
    `;
  },

  _rdoTabMo(d) {
    const secoes = [
      { k: 'moi',  l: 'Mão de Obra Indireta (MOI)', opcoes: RDO_MOI_CARGOS },
      { k: 'mod',  l: 'Mão de Obra Direta (MOD)',  opcoes: RDO_MOD_CARGOS }
    ];
    return `
      <p style="font-size:15px;color:var(--color-text-muted);margin-bottom:var(--sp-lg);">As entradas foram pré-preenchidas com base no organograma. Ajuste quantidades e horas trabalhadas.</p>

      <datalist id="rdo-moi-list">${RDO_MOI_CARGOS.map(c => `<option value="${c}">`).join('')}</datalist>
      <datalist id="rdo-mod-list">${RDO_MOD_CARGOS.map(c => `<option value="${c}">`).join('')}</datalist>

      ${secoes.map(sec => `
        <div style="margin-bottom:var(--sp-xl);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
            <h4 style="font-size:16px;font-weight:700;margin:0;">${sec.l}</h4>
            <button type="button" class="btn btn-sm btn-primary" data-rdo-mo-add="${sec.k}">+ Adicionar</button>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:var(--color-surface-2);">
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Cargo</th>
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
                <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
                <th style="text-align:right;padding:8px;font-size:15px;font-weight:600;color:var(--color-text-muted);">H×H</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-rdo-mo-body="${sec.k}">
              ${(d[sec.k] || []).map((e, i) => this._rdoMoRow(sec.k, e, i, sec.opcoes)).join('')}
              ${(d[sec.k] || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum item — clique em "+ Adicionar"</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `).join('')}

      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
          <h4 style="font-size:16px;font-weight:700;margin:0;">Terceirizados</h4>
          <button type="button" class="btn btn-sm btn-primary" data-rdo-terc-add>+ Adicionar</button>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--color-surface-2);">
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Empresa</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Cargo</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
              <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-rdo-terc-body>
            ${(d.terc || []).map((e, i) => `
              <tr data-rdo-terc-row="${i}">
                <td><input class="form-control" data-rdo-terc="${i}.empresa" value="${escapeHtml(e.empresa || '')}"></td>
                <td><input class="form-control" data-rdo-terc="${i}.cargo" value="${escapeHtml(e.cargo || '')}"></td>
                <td style="width:100px;"><input class="form-control" type="number" data-rdo-terc="${i}.qtd" value="${e.qtd || 0}"></td>
                <td style="width:100px;"><input class="form-control" type="number" step="0.5" data-rdo-terc="${i}.horas" value="${e.horas || 0}"></td>
                <td style="width:40px;"><button type="button" class="action-link danger" data-rdo-terc-remove="${i}">✕</button></td>
              </tr>
            `).join('')}
            ${(d.terc || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum terceirizado</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `;
  },

  _rdoTabEquipamentos(d) {
    return `
      <datalist id="rdo-eqp-list">${RDO_EQP_TIPOS.map(t => `<option value="${t}">`).join('')}</datalist>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-sm);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Equipamentos</h4>
        <button type="button" class="btn btn-sm btn-primary" data-rdo-eqp-add>+ Adicionar</button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:var(--color-surface-2);">
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Equipamento</th>
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Qtd</th>
            <th class="rh-meta" style="text-align:left;padding:8px;font-weight:600;">Horas</th>
            <th style="text-align:right;padding:8px;font-size:15px;font-weight:600;color:var(--color-text-muted);">Eqp×H</th>
            <th></th>
          </tr>
        </thead>
        <tbody data-rdo-eqp-body>
          ${(d.equipamentos || []).map((e, i) => `
            <tr data-rdo-eqp-row="${i}">
              <td><input class="form-control" list="rdo-eqp-list" data-rdo-eqp="${i}.tipo" value="${escapeHtml(e.tipo || '')}"></td>
              <td style="width:100px;"><input class="form-control" type="number" data-rdo-eqp="${i}.qtd" value="${e.qtd || 0}"></td>
              <td style="width:100px;"><input class="form-control" type="number" step="0.5" data-rdo-eqp="${i}.horas" value="${e.horas || 0}"></td>
              <td style="text-align:right;font-weight:600;">${((e.qtd || 0) * (e.horas || 0)).toFixed(1)}</td>
              <td style="width:40px;"><button type="button" class="action-link danger" data-rdo-eqp-remove="${i}">✕</button></td>
            </tr>
          `).join('')}
          ${(d.equipamentos || []).length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:var(--sp-md);color:var(--color-text-muted);font-size:15px;">Nenhum equipamento — clique em "+ Adicionar"</td></tr>` : ''}
        </tbody>
      </table>
    `;
  },

  _rdoTabAtividades(d) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-md);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Atividades do Dia</h4>
        <button type="button" class="btn btn-sm btn-primary" data-rdo-atv-add>+ Nova Atividade</button>
      </div>
      <div data-rdo-atv-body style="display:flex;flex-direction:column;gap:var(--sp-md);">
        ${(d.atividades || []).map((a, i) => `
          <div data-rdo-atv-row="${i}" style="padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;">
            <div class="form-row form-row-3" style="grid-template-columns:1fr 3fr 120px auto;gap:var(--sp-md);align-items:flex-end;">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Área</label>
                <input class="form-control" data-rdo-atv="${i}.area" value="${escapeHtml(a.area || '')}">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Descrição</label>
                <input class="form-control" data-rdo-atv="${i}.descricao" value="${escapeHtml(a.descricao || '')}">
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">% Concluída</label>
                <input class="form-control" type="number" step="0.1" data-rdo-atv="${i}.pctConcluida" value="${a.pctConcluida || 0}">
              </div>
              <button type="button" class="action-link danger" data-rdo-atv-remove="${i}" style="margin-bottom:8px;">✕</button>
            </div>
            <div class="form-group" style="margin-top:var(--sp-sm);margin-bottom:0;">
              <label class="form-label">Ocorrências / Alertas</label>
              <textarea class="form-control" data-rdo-atv="${i}.ocorrencias" rows="2">${escapeHtml(a.ocorrencias || '')}</textarea>
            </div>
          </div>
        `).join('')}
        ${(d.atividades || []).length === 0 ? `<div style="text-align:center;padding:var(--sp-lg);color:var(--color-text-muted);font-size:15px;">Nenhuma atividade — clique em "+ Nova Atividade"</div>` : ''}
      </div>
    `;
  },

  _rdoTabSeguranca(d) {
    return `
      <h4 style="font-size:16px;font-weight:700;margin-bottom:var(--sp-md);">Segurança do Trabalho</h4>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">🛡️ Tema do DDS (Diálogo Diário de Segurança)</label>
          <input class="form-control" data-rdo-field="seguranca.temaDds" value="${escapeHtml(d.seguranca?.temaDds || '')}" placeholder="Ex: Uso correto de EPI em área úmida">
        </div>
        <div class="form-group">
          <label class="form-label">🌱 Tema de Meio Ambiente</label>
          <input class="form-control" data-rdo-field="seguranca.temaMeioAmbiente" value="${escapeHtml(d.seguranca?.temaMeioAmbiente || '')}" placeholder="Ex: Descarte correto de resíduos">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Houve Acidente?</label>
        <div style="display:flex;gap:var(--sp-md);flex-wrap:wrap;">
          ${[
            { v: 'nao_houve',       l: 'Não Houve'      },
            { v: 'sem_afastamento', l: 'Sem Afastamento' },
            { v: 'com_afastamento', l: 'Com Afastamento' }
          ].map(o => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:15px;padding:8px 14px;background:${d.seguranca?.acidente === o.v ? 'rgba(85,88,139,.08)' : 'transparent'};border:1px solid ${d.seguranca?.acidente === o.v ? '#55588B' : '#D1D5DB'};border-radius:6px;">
              <input type="radio" name="rdoAcidente" value="${o.v}" data-rdo-field="seguranca.acidente" ${d.seguranca?.acidente === o.v ? 'checked' : ''}>
              ${o.l}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Diagnóstico (se houve acidente)</label>
        <textarea class="form-control" data-rdo-field="seguranca.diagnostico" rows="2">${escapeHtml(d.seguranca?.diagnostico || '')}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Admissões</label>
          <input class="form-control" type="number" data-rdo-field="seguranca.admissoes" value="${d.seguranca?.admissoes || 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Demissões</label>
          <input class="form-control" type="number" data-rdo-field="seguranca.demissoes" value="${d.seguranca?.demissoes || 0}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Comentários da Segurança</label>
        <textarea class="form-control" data-rdo-field="seguranca.comentarios" rows="4" placeholder="Observações gerais, ocorrências de segurança, ações tomadas">${escapeHtml(d.seguranca?.comentarios || '')}</textarea>
      </div>
    `;
  },

  _rdoTabFiscalizacao(d) {
    return `
      <div class="form-group">
        <label class="form-label">Comentários da Fiscalização</label>
        <textarea class="form-control" data-rdo-field="fiscalizacaoComentarios" rows="10" placeholder="Observações do fiscal sobre a execução da obra no dia">${escapeHtml(d.fiscalizacaoComentarios || '')}</textarea>
      </div>
    `;
  },

  _rdoTabFotos(d, rdoOriginal) {
    if (!rdoOriginal) {
      return `
        <div style="text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);">
          <div style="font-size:38px;margin-bottom:var(--sp-sm);opacity:.5;">📷</div>
          <div style="font-size:15px;">Salve o RDO primeiro para adicionar fotos.</div>
        </div>
      `;
    }
    const fotos = rdoOriginal.fotos || [];
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-md);">
        <h4 style="font-size:16px;font-weight:700;margin:0;">Fotos do dia (${fotos.length})</h4>
        <div style="display:flex;gap:var(--sp-sm);align-items:center;">
          <input type="text" class="form-control" id="rdoFotoLegenda" placeholder="Legenda (opcional)" style="max-width:280px;font-size:15px;">
          <input type="file" id="rdoFotoInput" accept="image/jpeg,image/png,image/webp" multiple style="display:none;">
          <button type="button" class="btn btn-sm btn-primary" id="rdoFotoBtn">📷 Adicionar Fotos</button>
        </div>
      </div>

      <div id="rdoFotosGrid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:var(--sp-md);">
        ${fotos.length === 0 ? `<div style="grid-column:1/-1;text-align:center;padding:var(--sp-xl);color:var(--color-text-muted);font-size:15px;">Nenhuma foto ainda</div>` : ''}
        ${fotos.map(f => `
          <div style="position:relative;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;background:#FFFFFF;">
            <img src="${f.url}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;">
            ${f.legenda ? `<div style="padding:6px 10px;font-size:15px;color:var(--color-text);background:var(--color-surface-2);border-top:1px solid var(--color-border);">${escapeHtml(f.legenda)}</div>` : ''}
            <button type="button" class="btn-rdo-foto-del" data-id="${f.id}" title="Remover foto" style="position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:16px;">✕</button>
          </div>
        `).join('')}
      </div>
    `;
  },

  _attachRdoModalListeners(contractId, rdoOriginal) {
    const overlay = document.getElementById('modalRdoOverlay');
    if (!overlay) return;

    const rerender = () => {
      const content = document.getElementById('rdoFormContent');
      content.innerHTML = this._renderRdoTab(this._rdoTab, rdoOriginal);
      this._bindRdoInputs(contractId, rdoOriginal);
    };

    document.getElementById('btnCloseRdo').addEventListener('click', () => overlay.remove());
    document.getElementById('btnCancelRdo').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('[data-rdo-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoTab = btn.dataset.rdoTab;
        // re-render tabs visuais
        overlay.querySelectorAll('[data-rdo-tab]').forEach(b => {
          const active = b.dataset.rdoTab === this._rdoTab;
          b.style.borderBottomColor = active ? 'var(--color-primary)' : 'transparent';
          b.style.color = active ? 'var(--color-primary)' : 'var(--color-text-muted)';
          b.style.fontWeight = active ? '600' : '500';
        });
        rerender();
      });
    });

    this._bindRdoInputs(contractId, rdoOriginal);

    document.getElementById('btnSaveRdo').addEventListener('click', async () => {
      try {
        if (!this._rdoData.data) { showToast('Data é obrigatória', 'warning'); return; }
        this._rdoData.diaSemana = this._diaSemanaFromDate(this._rdoData.data);
        // Auto-calculado: totais
        const t = this._rdoData.totais = {
          moi:  (this._rdoData.moi || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          mod:  (this._rdoData.mod || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          terc: (this._rdoData.terc || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          eqp:  (this._rdoData.equipamentos || []).reduce((s, x) => s + (+x.qtd || 0), 0),
          homensHora: 0, horasParadas: 0, equipamentoHora: 0
        };
        t.homensHora = ['moi','mod','terc'].reduce((s, k) =>
          s + (this._rdoData[k] || []).reduce((acc, x) => acc + (+x.qtd || 0) * (+x.horas || 0), 0), 0);
        t.equipamentoHora = (this._rdoData.equipamentos || []).reduce((acc, x) => acc + (+x.qtd || 0) * (+x.horas || 0), 0);

        if (rdoOriginal) {
          await Store.updateRdo(contractId, rdoOriginal.id, this._rdoData);
          showToast('RDO atualizado.', 'success');
        } else {
          await Store.createRdo(contractId, this._rdoData);
          showToast('RDO criado.', 'success');
        }
        overlay.remove();
        this.render({ id: contractId });
      } catch (err) {
        showToast(err.message || 'Erro ao salvar', 'error');
      }
    });
  },

  _setByPath(obj, pathStr, value) {
    const parts = pathStr.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  },

  _bindRdoInputs(contractId, rdoOriginal) {
    const overlay = document.getElementById('modalRdoOverlay');
    if (!overlay) return;
    const rerender = () => {
      const content = document.getElementById('rdoFormContent');
      content.innerHTML = this._renderRdoTab(this._rdoTab, rdoOriginal);
      this._bindRdoInputs(contractId, rdoOriginal);
    };

    const contract = Store.getContractById(contractId);
    // Campos simples (data-rdo-field="path.to.key")
    overlay.querySelectorAll('[data-rdo-field]').forEach(el => {
      const path = el.dataset.rdoField;
      const handler = () => {
        let val;
        if (el.type === 'checkbox') val = el.checked;
        else if (el.type === 'radio') val = el.value;
        else if (el.type === 'number') val = parseFloat(el.value) || 0;
        else val = el.value;
        this._setByPath(this._rdoData, path, val);
        if (path === 'data') {
          // atualiza diaSemana
          this._rdoData.diaSemana = this._diaSemanaFromDate(val);
          // recalcula prazo com base no contrato + nova data (considerando tendência)
          if (contract) {
            const contratual = this._calcDiasPrazo(contract.startDate, contract.endDate);
            const decorrido  = this._calcDiasDecorridos(contract.startDate, val);
            const tendencia  = contract.tendencyDate || contract.endDate || '';
            const faltanteDias = tendencia
              ? Math.max(0, Math.round((new Date(tendencia) - new Date(val)) / 86400000))
              : Math.max(0, contratual - decorrido);
            const atrasoDias = (contract.tendencyDate && contract.endDate)
              ? Math.max(0, Math.round((new Date(contract.tendencyDate) - new Date(contract.endDate)) / 86400000))
              : 0;
            this._rdoData.prazo = {
              ...(this._rdoData.prazo || {}),
              dataInicial: contract.startDate || '',
              dataFinal:   contract.endDate   || '',
              dataTendencia: contract.tendencyDate || '',
              contratual,
              decorrido,
              faltante: faltanteDias,
              atraso:   atrasoDias
            };
          }
          // Re-render pra refletir prazo + dia-semana
          if (this._rdoTab === 'cabecalho') rerender();
        }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });

    // MOI/MOD
    ['moi','mod'].forEach(cat => {
      overlay.querySelectorAll(`[data-rdo-mo^="${cat}."]`).forEach(el => {
        el.addEventListener('input', () => {
          const [, idxStr, key] = el.dataset.rdoMo.split('.');
          const idx = parseInt(idxStr);
          const arr = this._rdoData[cat] || (this._rdoData[cat] = []);
          if (!arr[idx]) arr[idx] = { cargo: '', qtd: 0, horas: 9 };
          arr[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
          // Atualiza total da linha
          const row = overlay.querySelector(`[data-rdo-mo-row="${cat}-${idx}"] .rdo-mo-total`);
          if (row) row.textContent = ((arr[idx].qtd || 0) * (arr[idx].horas || 0)).toFixed(1);
        });
      });
    });
    overlay.querySelectorAll('[data-rdo-mo-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.rdoMoAdd;
        if (!this._rdoData[cat]) this._rdoData[cat] = [];
        this._rdoData[cat].push({ cargo: '', qtd: 1, horas: 9 });
        rerender();
      });
    });
    overlay.querySelectorAll('[data-rdo-mo-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [cat, idxStr] = btn.dataset.rdoMoRemove.split('-');
        this._rdoData[cat].splice(parseInt(idxStr), 1);
        rerender();
      });
    });

    // Terceirizados
    overlay.querySelectorAll('[data-rdo-terc]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoTerc.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.terc) this._rdoData.terc = [];
        if (!this._rdoData.terc[idx]) this._rdoData.terc[idx] = { empresa: '', cargo: '', qtd: 0, horas: 9 };
        this._rdoData.terc[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-terc-add]')?.addEventListener('click', () => {
      if (!this._rdoData.terc) this._rdoData.terc = [];
      this._rdoData.terc.push({ empresa: '', cargo: '', qtd: 1, horas: 9 });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-terc-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.terc.splice(parseInt(btn.dataset.rdoTercRemove), 1);
        rerender();
      });
    });

    // Equipamentos
    overlay.querySelectorAll('[data-rdo-eqp]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoEqp.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.equipamentos) this._rdoData.equipamentos = [];
        if (!this._rdoData.equipamentos[idx]) this._rdoData.equipamentos[idx] = { tipo: '', qtd: 0, horas: 9 };
        this._rdoData.equipamentos[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-eqp-add]')?.addEventListener('click', () => {
      if (!this._rdoData.equipamentos) this._rdoData.equipamentos = [];
      this._rdoData.equipamentos.push({ tipo: '', qtd: 1, horas: 9 });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-eqp-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.equipamentos.splice(parseInt(btn.dataset.rdoEqpRemove), 1);
        rerender();
      });
    });

    // Atividades
    overlay.querySelectorAll('[data-rdo-atv]').forEach(el => {
      el.addEventListener('input', () => {
        const [idxStr, key] = el.dataset.rdoAtv.split('.');
        const idx = parseInt(idxStr);
        if (!this._rdoData.atividades) this._rdoData.atividades = [];
        if (!this._rdoData.atividades[idx]) this._rdoData.atividades[idx] = { area: '', descricao: '', pctConcluida: 0, ocorrencias: '' };
        this._rdoData.atividades[idx][key] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
    });
    overlay.querySelector('[data-rdo-atv-add]')?.addEventListener('click', () => {
      if (!this._rdoData.atividades) this._rdoData.atividades = [];
      this._rdoData.atividades.push({ area: '', descricao: '', pctConcluida: 0, ocorrencias: '' });
      rerender();
    });
    overlay.querySelectorAll('[data-rdo-atv-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._rdoData.atividades.splice(parseInt(btn.dataset.rdoAtvRemove), 1);
        rerender();
      });
    });

    // Fotos — upload e remover
    const fotoInput = document.getElementById('rdoFotoInput');
    const fotoBtn = document.getElementById('rdoFotoBtn');
    if (fotoBtn && fotoInput) {
      fotoBtn.addEventListener('click', () => fotoInput.click());
      fotoInput.addEventListener('change', async () => {
        if (!fotoInput.files || fotoInput.files.length === 0) return;
        const legenda = document.getElementById('rdoFotoLegenda')?.value || '';
        try {
          showToast(`Enviando ${fotoInput.files.length} foto(s)...`, 'info');
          await Store.uploadRdoFoto(contractId, rdoOriginal.id, fotoInput.files, legenda);
          // atualiza rdoOriginal local
          const freshContract = Store.getContractById(contractId);
          const freshRdo = (freshContract.rdos || []).find(r => r.id === rdoOriginal.id);
          Object.assign(rdoOriginal, freshRdo);
          rerender();
          showToast('Fotos enviadas!', 'success');
        } catch (err) {
          showToast(err.message || 'Erro no upload', 'error');
        } finally {
          fotoInput.value = '';
        }
      });
    }
    overlay.querySelectorAll('.btn-rdo-foto-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remover esta foto?')) return;
        try {
          await Store.deleteRdoFoto(contractId, rdoOriginal.id, btn.dataset.id);
          const freshContract = Store.getContractById(contractId);
          const freshRdo = (freshContract.rdos || []).find(r => r.id === rdoOriginal.id);
          Object.assign(rdoOriginal, freshRdo);
          rerender();
          showToast('Foto removida.', 'success');
        } catch (err) {
          showToast(err.message || 'Erro ao remover', 'error');
        }
      });
    });
  },

  async deleteRdo(contractId, rdoId) {
    const contract = Store.getContractById(contractId);
    const rdo = (contract.rdos || []).find(r => r.id === rdoId);
    if (!rdo) return;
    if (!confirm(`Excluir RDO #${rdo.numero} de ${rdo.data}? Todas as fotos também serão removidas.`)) return;
    try {
      await Store.deleteRdo(contractId, rdoId);
      showToast('RDO excluído.', 'success');
      this.render({ id: contractId });
    } catch (err) {
      showToast(err.message || 'Erro ao excluir', 'error');
    }
  },

  exportarRdoPdf(rdo, contract) {
    if (typeof window.jspdf === 'undefined') {
      showToast('Biblioteca PDF não carregada. Recarregue a página.', 'error');
      return;
    }
    // Carrega logo (redimensiona pra 300px máx + JPEG com fundo branco → pequeno)
    const carregarLogo = () => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const MAX = 300;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          const r = w / h;
          if (w >= h) { w = MAX; h = Math.round(MAX / r); }
          else        { h = MAX; w = Math.round(MAX * r); }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve({ data: canvas.toDataURL('image/jpeg', 0.8), w, h, fmt: 'JPEG' }); }
        catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'assets/logo.png';
    });

    carregarLogo().then(logo => this._exportarRdoPdfImpl(rdo, contract, logo));
  },

  _exportarRdoPdfImpl(rdo, contract, logo) {
    const { jsPDF } = window.jspdf;
    // compress: true → compressão FlateDecode nativa do jsPDF (reduz ~70% o tamanho)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - 2 * margin;
    let y = margin;

    const fmt = (d) => {
      if (!d) return '';
      const [yy, mm, dd] = d.split('-');
      return `${dd}/${mm}/${yy}`;
    };

    const autoTable = doc.autoTable ? doc.autoTable.bind(doc) : null;
    if (!autoTable) {
      showToast('Biblioteca autoTable não carregada.', 'error');
      return;
    }

    // Helper — garante texto preto sempre que formos desenhar texto fora de autoTable
    const blackText = () => { doc.setTextColor(0, 0, 0); };

    // ═══════════ CABEÇALHO PRINCIPAL (estilo Usiminas) com LOGO ═══════════
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    const headerH = 16;
    const logoW = 28;      // largura reservada para o logo (esquerda)
    const rightW = 28;     // largura reservada para número/página (direita)
    const titleX = margin + logoW;
    const titleW = contentW - logoW - rightW;

    // caixa do logo
    doc.rect(margin, y, logoW, headerH);
    if (logo) {
      // Dimensiona o logo preservando proporção, dentro da caixa com padding
      const pad = 2;
      const maxW = logoW - 2 * pad;
      const maxH = headerH - 2 * pad;
      const ratio = logo.w / logo.h;
      let drawW, drawH;
      if (ratio > maxW / maxH) { drawW = maxW; drawH = maxW / ratio; }
      else                      { drawH = maxH; drawW = maxH * ratio; }
      const ix = margin + (logoW - drawW) / 2;
      const iy = y + (headerH - drawH) / 2;
      try { doc.addImage(logo.data, logo.fmt || 'JPEG', ix, iy, drawW, drawH, undefined, 'FAST'); } catch {}
    } else {
      doc.setFontSize(8); doc.setFont(undefined, 'bold');
      doc.text('RHINO', margin + logoW / 2, y + headerH / 2 + 1, { align: 'center' });
    }

    // caixa do título central
    doc.rect(titleX, y, titleW, headerH);
    doc.setFillColor(240, 240, 240);
    doc.rect(titleX, y, titleW, headerH, 'F');
    doc.rect(titleX, y, titleW, headerH); // borda por cima do fill
    doc.setTextColor(0);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DIÁRIO DE OBRA', titleX + titleW / 2, y + 7, { align: 'center' });
    doc.setFontSize(10);
    doc.text('RDO', titleX + titleW / 2, y + 12.5, { align: 'center' });

    // caixa direita (Nº + página)
    doc.rect(titleX + titleW, y, rightW, headerH);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('Nº RDO', titleX + titleW + rightW / 2, y + 4, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`#${rdo.numero}`, titleX + titleW + rightW / 2, y + 9.5, { align: 'center' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7);
    doc.text('PÁGINA 1/1', titleX + titleW + rightW / 2, y + 13.5, { align: 'center' });
    y += headerH;

    // Linha OBRA / N° CONTRATO / N° OS (3 colunas)
    blackText();
    const headerRowH = 7;
    const col1W = contentW * 0.5, col2W = contentW * 0.28, col3W = contentW * 0.22;

    const fitText = (txt, maxWidth, fontSize) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(String(txt || '—'), maxWidth - 2);
      return lines[0] + (lines.length > 1 ? '…' : '');
    };

    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.rect(margin, y, col1W, headerRowH);
    doc.text('OBRA:', margin + 1, y + 3);
    doc.rect(margin + col1W, y, col2W, headerRowH);
    doc.text('N° DO CONTRATO:', margin + col1W + 1, y + 3);
    doc.rect(margin + col1W + col2W, y, col3W, headerRowH);
    doc.text('Nº ORDEM DE SERVIÇO:', margin + col1W + col2W + 1, y + 3);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(fitText(contract.name, col1W, 9), margin + 1, y + 5.8);
    doc.text(fitText(contract.contractNumber, col2W, 9), margin + col1W + 1, y + 5.8);
    doc.text(fitText(rdo.osNumero, col3W, 9), margin + col1W + col2W + 1, y + 5.8);
    y += headerRowH;

    // Linha PROJETO / ORDEM DE COMPRA / DATA
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.rect(margin, y, col1W, headerRowH);
    doc.text('PROJETO:', margin + 1, y + 3);
    doc.rect(margin + col1W, y, col2W, headerRowH);
    doc.text('ORDEM DE COMPRA:', margin + col1W + 1, y + 3);
    doc.rect(margin + col1W + col2W, y, col3W, headerRowH);
    doc.text('DATA:', margin + col1W + col2W + 1, y + 3);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(fitText(rdo.projeto || contract.name, col1W, 9), margin + 1, y + 5.8);
    doc.text(fitText(rdo.ordemCompra, col2W, 9), margin + col1W + 1, y + 5.8);
    doc.text(fitText(`${fmt(rdo.data)} (${rdo.diaSemana || ''})`, col3W, 9), margin + col1W + col2W + 1, y + 5.8);
    y += headerRowH + 1;

    // ═══════════ BLOCO PRAZO + TEMPO (lado a lado) ═══════════
    blackText();
    const prazoW = contentW * 0.45;
    const tempoW = contentW * 0.55;
    const blockTop = y;

    // PRAZO (esquerda)
    doc.setFillColor(230, 230, 240);
    doc.rect(margin, y, prazoW, 5, 'F');
    doc.rect(margin, y, prazoW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.text('PRAZO', margin + prazoW / 2, y + 3.5, { align: 'center' });

    // Layout 3 colunas × 2 linhas (igual ao modal web)
    const prazoRowY = y + 5;
    const pw = prazoW / 3;
    const labelH = 4, valueH = 6, rowH = labelH + valueH;
    const atraso = rdo.prazo?.atraso || 0;
    const faltanteTxt = atraso > 0
      ? `ATRASO ${atraso}d`
      : `${rdo.prazo?.faltante || 0} dias`;
    const prazoGrid = [
      [
        { l: 'DATA INICIAL',  v: fmt(rdo.prazo?.dataInicial)   || '—' },
        { l: 'DATA FINAL',    v: fmt(rdo.prazo?.dataFinal)     || '—' },
        { l: 'TENDÊNCIA',     v: fmt(rdo.prazo?.dataTendencia) || '—' }
      ],
      [
        { l: 'DECORRIDO',    v: (rdo.prazo?.decorrido || 0) + ' dias' },
        { l: atraso > 0 ? 'ATRASO' : 'FALTANTE', v: faltanteTxt, alerta: atraso > 0 },
        { l: '% CONCLUÍDA',  v: (rdo.prazo?.pctConcluida || 0) + '%' }
      ]
    ];
    prazoGrid.forEach((linha, r) => {
      linha.forEach((c, i) => {
        const cellY = prazoRowY + r * rowH;
        // label
        if (c.alerta) {
          doc.setFillColor(254, 226, 226);
          doc.rect(margin + i * pw, cellY, pw, labelH, 'F');
        }
        doc.rect(margin + i * pw, cellY, pw, labelH);
        // valor
        if (c.alerta) {
          doc.setFillColor(254, 242, 242);
          doc.rect(margin + i * pw, cellY + labelH, pw, valueH, 'F');
        }
        doc.rect(margin + i * pw, cellY + labelH, pw, valueH);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(6.5);
        if (c.alerta) doc.setTextColor(185, 28, 28); else doc.setTextColor(0, 0, 0);
        doc.text(c.l, margin + i * pw + pw / 2, cellY + 2.8, { align: 'center' });
        doc.setFont(undefined, c.alerta ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        if (c.alerta) doc.setTextColor(185, 28, 28); else doc.setTextColor(0, 0, 0);
        doc.text(String(c.v), margin + i * pw + pw / 2, cellY + labelH + 4, { align: 'center' });
      });
    });
    doc.setTextColor(0, 0, 0);

    // TEMPO (direita)
    const tempoX = margin + prazoW;
    doc.setFillColor(230, 230, 240);
    doc.rect(tempoX, y, tempoW, 5, 'F');
    doc.rect(tempoX, y, tempoW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(8);
    doc.text('TEMPO / CONDIÇÕES DA ÁREA', tempoX + tempoW / 2, y + 3.5, { align: 'center' });

    const tempoLabel = { bom: 'BOM', chuva: 'CHUVA', nao_houve: 'NÃO HOUVE', sem_expediente: 'S/ EXPEDIENTE' };
    const condLabel  = { operavel: 'OPERÁVEL', parcial: 'OP. PARCIAL', inoperavel: 'INOPERÁVEL' };
    const tempoRowY = y + 5;
    const tw = tempoW / 4;
    // cabeçalho: PERÍODO | TEMPO | CONDIÇÕES | PRECIP.
    ['PERÍODO', 'TEMPO', 'CONDIÇÕES', 'PRECIP.'].forEach((h, i) => {
      doc.rect(tempoX + i * tw, tempoRowY, tw, 4);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(6.5);
      doc.text(h, tempoX + i * tw + tw / 2, tempoRowY + 2.8, { align: 'center' });
    });
    const tempoLinhas = [
      { p: 'MANHÃ',     t: tempoLabel[rdo.tempo?.manha?.tempo] || '—',    c: condLabel[rdo.tempo?.manha?.condicoes] || '—',    pre: '' },
      { p: 'TARDE',     t: tempoLabel[rdo.tempo?.tarde?.tempo] || '—',    c: condLabel[rdo.tempo?.tarde?.condicoes] || '—',    pre: '' },
      { p: 'NOITE ANT.', t: tempoLabel[rdo.tempo?.noiteAnt?.tempo] || '—', c: condLabel[rdo.tempo?.noiteAnt?.condicoes] || '—', pre: (rdo.tempo?.precipitacao || 0) + 'mm' }
    ];
    tempoLinhas.forEach((l, idx) => {
      const yy = tempoRowY + 4 + idx * 4;
      [l.p, l.t, l.c, l.pre].forEach((v, i) => {
        doc.rect(tempoX + i * tw, yy, tw, 4);
        doc.setFont(undefined, i === 0 ? 'bold' : 'normal');
        doc.setFontSize(6.5);
        doc.text(String(v), tempoX + i * tw + tw / 2, yy + 2.8, { align: 'center' });
      });
    });

    y = Math.max(prazoRowY + 2 * rowH, tempoRowY + 4 + 3 * 4) + 1;

    // ═══════════ PERÍODO DE TRABALHO + HORA EXTRA ═══════════
    blackText();
    doc.rect(margin, y, contentW, 5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text('PERÍODO DE TRABALHO:', margin + 1, y + 3.3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(rdo.periodoTrabalho || '—', margin + 40, y + 3.5);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text('HORA EXTRA:', margin + contentW - 40, y + 3.3);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(rdo.horaExtra ? 'SIM' : 'NÃO', margin + contentW - 18, y + 3.5);
    y += 6;

    // ═══════════ MÃO DE OBRA (MOI + MOD lado a lado) ═══════════
    const moiRows = (rdo.moi  || []).map(x => [x.cargo || '—', String(x.qtd || 0)]);
    const modRows = (rdo.mod  || []).map(x => [x.cargo || '—', String(x.qtd || 0)]);
    const tercRows = (rdo.terc || []).map(x => [`${x.cargo || '—'} (${x.empresa || ''})`, String(x.qtd || 0)]);
    const totalMoi = (rdo.moi  || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    const totalMod = (rdo.mod  || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    const totalTerc = (rdo.terc || []).reduce((s, x) => s + (+x.qtd || 0), 0);
    moiRows.push([{ content: `TOTAL (MOI)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalMoi), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);
    modRows.push([{ content: `TOTAL (MOD)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalMod), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);
    tercRows.push([{ content: `TOTAL (TERC.)`, styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }, { content: String(totalTerc), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } }]);

    const colMo = (contentW - 4) / 3;
    // MOI
    autoTable({
      startY: y, margin: { left: margin },
      tableWidth: colMo,
      head: [[{ content: 'MÃO DE OBRA INDIRETA', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...moiRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const moYEnd = doc.lastAutoTable.finalY;

    // MOD
    autoTable({
      startY: y, margin: { left: margin + colMo + 2 },
      tableWidth: colMo,
      head: [[{ content: 'MÃO DE OBRA DIRETA', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...modRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const modYEnd = doc.lastAutoTable.finalY;

    // TERC
    autoTable({
      startY: y, margin: { left: margin + 2 * (colMo + 2) - 2 },
      tableWidth: colMo,
      head: [[{ content: 'TERCEIRIZADOS', colSpan: 2, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }]],
      body: [['CARGO', 'QTD.'].map(h => ({ content: h, styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } })), ...tercRows],
      styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
      columnStyles: { 1: { cellWidth: 10, halign: 'center' } }
    });
    const tercYEnd = doc.lastAutoTable.finalY;

    y = Math.max(moYEnd, modYEnd, tercYEnd) + 2;

    // ═══════════ EQUIPAMENTOS ═══════════
    if ((rdo.equipamentos || []).length > 0) {
      const eqpRows = (rdo.equipamentos || []).map(e => [e.tipo || '—', String(e.qtd || 0), String(e.horas || 0)]);
      const totalEqp = (rdo.equipamentos || []).reduce((s, e) => s + (+e.qtd || 0), 0);
      eqpRows.push([
        { content: 'TOTAL (EQP)', styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
        { content: String(totalEqp), styles: { fontStyle: 'bold', fillColor: [230, 230, 240] } },
        { content: '', styles: { fillColor: [230, 230, 240] } }
      ]);
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [
          [{ content: 'EQUIPAMENTOS', colSpan: 3, styles: { halign: 'center', fillColor: [109, 148, 128], textColor: 255, fontSize: 8 } }],
          [{ content: 'EQUIPAMENTO', styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'QTD.',         styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'HORAS',        styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } }]
        ],
        body: eqpRows,
        styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [150, 150, 150], lineWidth: 0.2 },
        columnStyles: { 1: { cellWidth: 18, halign: 'center' }, 2: { cellWidth: 18, halign: 'center' } }
      });
      y = doc.lastAutoTable.finalY + 2;
    }

    // ═══════════ TOTAIS DE HORAS ═══════════
    blackText();
    const hh = (rdo.totais?.homensHora) || (
      ['moi','mod','terc'].reduce((s, k) =>
        s + (rdo[k] || []).reduce((a, x) => a + (+x.qtd || 0) * (+x.horas || 0), 0), 0)
    );
    const eqpH = (rdo.totais?.equipamentoHora) || (rdo.equipamentos || []).reduce((a, x) => a + (+x.qtd || 0) * (+x.horas || 0), 0);
    const hpar = rdo.totais?.horasParadas || 0;

    const totH = contentW / 3;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, totH, 6, 'F');
    doc.rect(margin, y, totH, 6);
    doc.rect(margin + totH, y, totH, 6, 'F');
    doc.rect(margin + totH, y, totH, 6);
    doc.rect(margin + 2 * totH, y, totH, 6, 'F');
    doc.rect(margin + 2 * totH, y, totH, 6);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(7);
    doc.text(`HOMENS HORA: ${hh.toFixed(1)}`, margin + 2, y + 4);
    doc.text(`HORAS PARADAS: ${hpar}`, margin + totH + 2, y + 4);
    doc.text(`EQUIPAMENTO HORA: ${eqpH.toFixed(1)}`, margin + 2 * totH + 2, y + 4);
    y += 7;

    // ═══════════ DESCRIÇÃO DE ATIVIDADES ═══════════
    if ((rdo.atividades || []).length > 0) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [
          [{ content: 'DESCRIÇÃO DE ATIVIDADES', colSpan: 4, styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8 } }],
          [{ content: 'ÁREA',        styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: 'DESCRIÇÃO',   styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } },
           { content: '% CONCL.',    styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240], halign: 'center' } },
           { content: 'OCORRÊNCIAS / ALERTAS', styles: { fontStyle: 'bold', fontSize: 7, fillColor: [240, 240, 240] } }]
        ],
        body: (rdo.atividades || []).map(a => [
          a.area || '—',
          a.descricao || '—',
          { content: (a.pctConcluida || 0) + '%', styles: { halign: 'center', fontStyle: 'bold' } },
          a.ocorrencias || '—'
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [150, 150, 150], lineWidth: 0.2, valign: 'top' },
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 78 }, 2: { cellWidth: 16 } }
      });
      y = doc.lastAutoTable.finalY + 2;
    }

    // ═══════════ SEGURANÇA — autoTable pra garantir altura dinâmica e wrap ═══════════
    blackText();
    const acid = rdo.seguranca?.acidente || 'nao_houve';
    const chk = (ok) => ok ? '☒' : '☐';
    const acidLine = `${chk(acid === 'nao_houve')} Não Houve    ${chk(acid === 'sem_afastamento')} Sem Afastamento    ${chk(acid === 'com_afastamento')} Com Afastamento`;

    autoTable({
      startY: y, margin: { left: margin, right: margin },
      head: [[{ content: 'SEGURANÇA DO TRABALHO', colSpan: 2, styles: { halign: 'center', fillColor: [220, 38, 38], textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
      body: [
        [{ content: 'Acidente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, acidLine],
        [{ content: 'Admissões / Demissões', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, `${rdo.seguranca?.admissoes || 0} admissão(ões)    /    ${rdo.seguranca?.demissoes || 0} demissão(ões)`],
        [{ content: 'Tema do DDS', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.temaDds || '—'],
        [{ content: 'Tema de Meio Ambiente', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.temaMeioAmbiente || '—'],
        ...(rdo.seguranca?.diagnostico ? [[{ content: 'Diagnóstico', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca.diagnostico]] : []),
        [{ content: 'Comentários', styles: { fontStyle: 'bold', fillColor: [248, 240, 240] } }, rdo.seguranca?.comentarios || '—']
      ],
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [150, 150, 150], lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 42 } }
    });
    y = doc.lastAutoTable.finalY + 2;
    blackText();

    // ═══════════ FISCALIZAÇÃO ═══════════
    if (rdo.fiscalizacaoComentarios) {
      autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [[{ content: 'COMENTÁRIOS DA FISCALIZAÇÃO', styles: { halign: 'center', fillColor: [85, 88, 139], textColor: 255, fontSize: 8, fontStyle: 'bold' } }]],
        body: [[rdo.fiscalizacaoComentarios]],
        styles: { fontSize: 8, cellPadding: 2, lineColor: [150, 150, 150], lineWidth: 0.2, overflow: 'linebreak' }
      });
      y = doc.lastAutoTable.finalY + 2;
      blackText();
    }

    // ═══════════ ASSINATURAS (rodapé) ═══════════
    const assinAtual = Math.max(y, pageH - 30);
    if (assinAtual + 20 > pageH - margin) { doc.addPage(); y = margin; }
    else { y = assinAtual; }

    blackText();
    const assinW = contentW / 3;
    ['Contratada', 'Contratante', 'Fiscalização'].forEach((papel, i) => {
      doc.rect(margin + i * assinW, y, assinW, 18);
      doc.setDrawColor(150);
      doc.line(margin + i * assinW + 5, y + 12, margin + (i + 1) * assinW - 5, y + 12);
      doc.setDrawColor(0);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.text(papel.toUpperCase(), margin + i * assinW + assinW / 2, y + 16, { align: 'center' });
      doc.setFont(undefined, 'normal');
      doc.setFontSize(6);
      doc.text('VISTO / DATA', margin + i * assinW + assinW / 2, y + 3.5, { align: 'center' });
    });
    y += 20;

    // Fotos — nova página, grid 2 colunas
    const fotos = rdo.fotos || [];
    if (fotos.length > 0) {
      // Redimensiona a foto para no máximo 900px no lado maior + JPEG 0.55 → PDFs enxutos
      const MAX_DIM = 900;
      const JPEG_Q  = 0.55;
      const carregarImagem = (url) => new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = w / h;
            if (w >= h) { w = MAX_DIM; h = Math.round(MAX_DIM / ratio); }
            else        { h = MAX_DIM; w = Math.round(MAX_DIM * ratio); }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve({ data: canvas.toDataURL('image/jpeg', JPEG_Q), w, h }); }
          catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });

      Promise.all(fotos.map(f => carregarImagem(f.url))).then(imgs => {
        doc.addPage();
        let py = margin;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`Fotos — RDO #${rdo.numero} (${fmt(rdo.data)})`, margin, py);
        py += 8;

        const cols = 2;
        const gap = 4;
        const cellW = (pageW - 2 * margin - gap) / cols;
        const cellH = cellW * 0.7;

        fotos.forEach((f, i) => {
          const img = imgs[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          if (row > 0 && col === 0 && py + cellH + 20 > doc.internal.pageSize.getHeight()) {
            doc.addPage(); py = margin;
          }
          const x = margin + col * (cellW + gap);
          const yy = py + Math.floor(((i - (i % cols)) / cols) * 0) + row * (cellH + 14);
          if (img) {
            try {
              doc.addImage(img.data, 'JPEG', x, yy, cellW, cellH, undefined, 'FAST');
            } catch {}
          } else {
            doc.setDrawColor(200);
            doc.rect(x, yy, cellW, cellH);
          }
          if (f.legenda) {
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text(f.legenda.substring(0, 80), x + 1, yy + cellH + 4, { maxWidth: cellW - 2 });
          }
        });

        doc.save(`RDO-${rdo.numero}-${rdo.data}.pdf`);
      });
    } else {
      doc.save(`RDO-${rdo.numero}-${rdo.data}.pdf`);
    }
  },

  showModalEditarDados(contract) {
    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="width: 680px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header" style="flex-shrink: 0;">
            <h2 class="modal-title">Editar Dados do Contrato</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formEditarDados" class="modal-content" style="flex: 1; overflow-y: auto; padding-right: 4px;">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Número do Contrato</label>
                <input class="form-control" name="contractNumber" value="${contract.contractNumber || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Status *</label>
                <select class="form-control" name="status" required>
                  <option value="prospeccao" ${contract.status === 'prospeccao' ? 'selected' : ''}>Prospecção</option>
                  <option value="ativo" ${contract.status === 'ativo' ? 'selected' : ''}>Ativo</option>
                  <option value="pausado" ${contract.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                  <option value="concluido" ${contract.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                  <option value="cancelado" ${contract.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome do Contrato *</label>
              <input class="form-control" name="name" value="${escapeHtml(contract.name)}" required>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Cliente</h3>
              <div class="form-group">
                <label class="form-label">Cliente *</label>
                <select class="form-control" id="selectClienteDetail" name="clientId" required>
                  <option value="">Selecione um cliente...</option>
                  ${Store.state.clientes.map(c => {
                    const selected = (contract.clientId && contract.clientId === c.id) ||
                                     (!contract.clientId && contract.client === c.nome);
                    return `<option value="${c.id}" ${selected ? 'selected' : ''}>${escapeHtml(c.nome)}${c.empresa ? ' — ' + escapeHtml(c.empresa) : ''}</option>`;
                  }).join('')}
                  <option value="__outro__" ${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? 'selected' : ''}>Outro (digitar manualmente)</option>
                </select>
              </div>
              <div class="form-group" id="clienteManualWrapDetail" style="${!contract.clientId && contract.client && !Store.state.clientes.find(c => c.nome === contract.client) ? '' : 'display:none;'}">
                <label class="form-label">Nome/Razão Social *</label>
                <input class="form-control" id="clienteManualDetail" name="client" value="${escapeHtml(contract.client || '')}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">CPF/CNPJ</label>
                  <input class="form-control" name="clientDocument" value="${escapeHtml(contract.clientDocument || '')}">
                </div>
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input class="form-control" name="clientEmail" type="email" value="${escapeHtml(contract.clientEmail || '')}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Telefone</label>
                  <input class="form-control" name="clientPhone" value="${escapeHtml(contract.clientPhone || '')}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Endereço/Local da Obra</label>
                <div style="position:relative;" id="enderecoWrapDetail">
                  <input class="form-control" id="enderecoInputDetail" name="endereco"
                    value="${escapeHtml(contract.endereco || contract.clientAddress || '')}"
                    placeholder="Buscar endereço no mapa..."
                    autocomplete="off"
                    style="padding-right:36px;">
                  <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">📍</span>
                  <div id="nominatimDropdownDetail" class="nominatim-dropdown" style="display:none;top:calc(100% + 4px);left:0;"></div>
                </div>
                <input type="hidden" id="enderecoLatDetail" name="lat" value="${contract.lat || ''}">
                <input type="hidden" id="enderecoLngDetail" name="lng" value="${contract.lng || ''}">
                <div id="miniMapaDetail" style="height:160px;border-radius:6px;margin-top:8px;overflow:hidden;border:1px solid var(--color-border);${contract.lat ? '' : 'display:none;'}"></div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <h3 class="card-title mb-md">Dados do Contrato</h3>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Valor Total (BRL) *</label>
                  <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${window.BRLInput.toDisplay(contract.value)}" placeholder="0,00" required>
                </div>
                <div class="form-group">
                  <label class="form-label">Moeda/Referência</label>
                  <input class="form-control" name="currency" value="${contract.currency || 'BRL'}" placeholder="BRL">
                </div>
              </div>
              <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-lg); align-items: start;">
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Início</label>
                  <input class="form-control" name="startDate" type="date" value="${contract.startDate}">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Término</label>
                  <input class="form-control" name="endDate" type="date" value="${contract.endDate}">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Data de Tendência</label>
                  <input class="form-control" name="tendencyDate" type="date" value="${contract.tendencyDate || ''}">
                </div>
              </div>
              <div class="form-helper" style="margin-top: 6px;">💡 <strong>Tendência</strong> é a previsão atualizada do fim da obra. Se maior que o Término contratual, o RDO marca "Atraso de X dias".</div>
            </div>

            <div style="border-top: 1px solid var(--color-border); padding-top: var(--sp-lg); margin-top: var(--sp-lg);">
              <div class="form-group">
                <label class="form-label">Notas/Observações</label>
                <textarea class="form-control" name="notes" style="min-height: 80px;">${contract.notes || ''}</textarea>
              </div>
            </div>
          </form>
          <div class="modal-footer" style="flex-shrink: 0; border-top: 1px solid var(--color-border); background: var(--color-surface);">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvarDados">Salvar Alterações</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      overlay.remove();
    };

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    // Cliente select logic
    const selectCliente = document.getElementById('selectClienteDetail');
    const manualWrap = document.getElementById('clienteManualWrapDetail');
    const manualInput = document.getElementById('clienteManualDetail');

    const preencherEnderecoDoCliente = (clienteId) => {
      const endInput = document.getElementById('enderecoInputDetail');
      const latInput = document.getElementById('enderecoLatDetail');
      const lngInput = document.getElementById('enderecoLngDetail');
      if (!endInput || endInput.value.trim()) return;
      const cl = Store.state.clientes.find(c => c.id === clienteId);
      if (cl && cl.endereco) {
        endInput.value = cl.endereco;
        latInput.value = cl.lat || '';
        lngInput.value = cl.lng || '';
        if (cl.lat && cl.lng) this._mostrarMiniMapaDetail(parseFloat(cl.lat), parseFloat(cl.lng), cl.endereco);
      }
    };

    selectCliente.addEventListener('change', () => {
      const val = selectCliente.value;
      if (val === '__outro__') {
        manualWrap.style.display = '';
        manualInput.required = true;
      } else {
        manualWrap.style.display = 'none';
        manualInput.required = false;
        preencherEnderecoDoCliente(val);
      }
    });

    this._initEnderecoSearchDetail(
      contract.lat || '',
      contract.lng || '',
      contract.endereco || contract.clientAddress || ''
    );

    document.getElementById('btnSalvarDados').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formEditarDados'));
      const data = Object.fromEntries(formData);
      data.value = window.BRLInput.parse(data.value);

      // Resolve client name from select
      const clientId = data.clientId;
      if (clientId && clientId !== '__outro__') {
        const cl = Store.state.clientes.find(c => c.id === clientId);
        if (cl) data.client = cl.nome;
      } else if (clientId === '__outro__') {
        data.clientId = '';
      }
      if (!data.client || !data.client.trim()) { window.showToast('Cliente é obrigatório', 'error'); return; }

      try {
        await Store.updateContract(contract.id, data);
        window.showToast('Contrato atualizado com sucesso', 'success');
        closeModal();
        this.render({ id: contract.id });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  _miniMapDetail: null,

  _mostrarMiniMapaDetail(la, lo, label) {
    const mapaDiv = document.getElementById('miniMapaDetail');
    if (!mapaDiv) return;
    mapaDiv.style.display = 'block';
    setTimeout(() => {
      if (this._miniMapDetail) { this._miniMapDetail.remove(); this._miniMapDetail = null; }
      this._miniMapDetail = L.map(mapaDiv, { zoomControl: true, scrollWheelZoom: false })
        .setView([la, lo], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(this._miniMapDetail);
      L.marker([la, lo]).addTo(this._miniMapDetail).bindPopup(label).openPopup();
    }, 50);
  },

  _initEnderecoSearchDetail(lat, lng, enderecoSalvo) {
    const input    = document.getElementById('enderecoInputDetail');
    const dropdown = document.getElementById('nominatimDropdownDetail');
    const latInput = document.getElementById('enderecoLatDetail');
    const lngInput = document.getElementById('enderecoLngDetail');
    if (!input) return;

    if (lat && lng) this._mostrarMiniMapaDetail(parseFloat(lat), parseFloat(lng), enderecoSalvo || 'Local');

    let debounce = null;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 4) { dropdown.style.display = 'none'; return; }
      debounce = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } }
          );
          const results = await res.json();
          if (!results.length) { dropdown.style.display = 'none'; return; }

          dropdown.innerHTML = results.map(r => {
            const name   = r.display_name.split(',').slice(0, 3).join(',');
            const detail = r.display_name.split(',').slice(3).join(',').trim();
            return `<div class="nominatim-item" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name.replace(/"/g, '&quot;')}">
              <strong>${name}</strong><span>${detail}</span>
            </div>`;
          }).join('');
          dropdown.style.display = 'block';

          dropdown.querySelectorAll('.nominatim-item').forEach(el => {
            el.addEventListener('click', () => {
              const la = parseFloat(el.dataset.lat);
              const lo = parseFloat(el.dataset.lng);
              const nome = el.dataset.name;
              input.value = nome;
              latInput.value = la;
              lngInput.value = lo;
              dropdown.style.display = 'none';
              this._mostrarMiniMapaDetail(la, lo, nome);
            });
          });
        } catch { dropdown.style.display = 'none'; }
      }, 450);
    });

    document.addEventListener('click', e => {
      if (!document.getElementById('enderecoWrapDetail')?.contains(e.target))
        dropdown.style.display = 'none';
    });
  },

  showModalSaida(contractId, saidaId) {
    const saida = saidaId ? Store.state.saidas.find(s => s.id === saidaId) : null;
    const title = saida ? 'Editar Saída' : 'Nova Saída';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formSaida" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${escapeHtml(saida?.description || '')}" required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo *</label>
                <select class="form-control" name="type" required>
                  <option value="mao_de_obra" ${saida?.type === 'mao_de_obra' ? 'selected' : ''}>Mão de Obra</option>
                  <option value="material" ${saida?.type === 'material' ? 'selected' : ''}>Material</option>
                  <option value="hospedagem" ${saida?.type === 'hospedagem' ? 'selected' : ''}>Hospedagem</option>
                  <option value="transporte" ${saida?.type === 'transporte' ? 'selected' : ''}>Transporte</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Valor (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${saida?.value ? window.BRLInput.toDisplay(saida.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Data</label>
                <input class="form-control" name="date" type="date" value="${saida?.date || new Date().toISOString().split('T')[0]}">
              </div>
              <div class="form-group">
                <label class="form-label">Prazo recebimento (dias)</label>
                <input class="form-control" name="prazoRecebimento" type="number" min="0" max="365"
                  value="${(() => {
                    const nfRef = saida?.nfId ? (Store.state.notas_fiscais || []).find(n => n.id === saida.nfId) : null;
                    return nfRef?.prazoRecebimento ?? 30;
                  })()}">
              </div>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${saida ? 'Atualizar' : 'Criar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('modalOverlay');
    const closeModal = () => overlay.remove();

    overlay.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('btnCancelar').addEventListener('click', closeModal);

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const formData = new FormData(document.getElementById('formSaida'));
      const data = Object.fromEntries(formData);
      data.value = window.BRLInput.parse(data.value);
      if (data.prazoRecebimento !== undefined && data.prazoRecebimento !== '') {
        data.prazoRecebimento = (Number.isFinite(parseInt(data.prazoRecebimento)) ? parseInt(data.prazoRecebimento) : 30);
      }

      try {
        if (saida) {
          await Store.updateSaida(saidaId, data);
          window.showToast('Saída atualizada', 'success');
        } else {
          await Store.createSaida(contractId, data);
          window.showToast('Saída adicionada', 'success');
        }
        closeModal();
        this.render({ id: contractId });
      } catch (e) {
        window.showToast(e.message, 'error');
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  },

  showModalOrcamento(contractId, item) {
    const TIPOS = [
      { key: 'mao_de_obra', label: 'Mão de Obra' },
      { key: 'material',    label: 'Material' },
      { key: 'hospedagem',  label: 'Hospedagem' },
      { key: 'transporte',  label: 'Transporte' },
      { key: 'base',        label: 'Custo BASE' },
      { key: 'outros',      label: 'Outros' }
    ];
    const title = item ? 'Editar Item do Orçamento' : 'Novo Item do Orçamento';

    const html = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close">✕</button>
          </div>
          <form id="formOrcamento" class="modal-content">
            <div class="form-group">
              <label class="form-label">Descrição *</label>
              <input class="form-control" name="description" value="${item?.description || ''}" placeholder="Ex: Equipe de campo, aço, diárias..." required>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Categoria *</label>
                <select class="form-control" name="type" required>
                  ${TIPOS.map(t => `<option value="${t.key}" ${item?.type === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Valor Orçado (BRL) *</label>
                <input class="form-control" name="value" type="text" data-currency inputmode="numeric" value="${item?.value ? window.BRLInput.toDisplay(item.value) : ''}" placeholder="0,00" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Observações</label>
              <textarea class="form-control" name="notes" style="min-height:60px;" placeholder="Detalhes adicionais...">${item?.notes || ''}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnCancelar">Cancelar</button>
            <button class="btn btn-primary" id="btnSalvar">${item ? 'Atualizar' : 'Adicionar'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalOverlay');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnCancelar').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('btnSalvar').addEventListener('click', async () => {
      const fd = new FormData(document.getElementById('formOrcamento'));
      const data = Object.fromEntries(fd);
      data.value = window.BRLInput.parse(data.value);
      if (!data.description.trim()) { window.showToast('Descrição obrigatória', 'error'); return; }
      if (!data.value || data.value <= 0) { window.showToast('Informe um valor válido', 'error'); return; }

      try {
        if (item) {
          await Store.updateBudgetItem(contractId, item.id, data);
          window.showToast('Item atualizado', 'success');
        } else {
          await Store.createBudgetItem(contractId, data);
          window.showToast('Item adicionado ao orçamento', 'success');
        }
        close();
        this.render({ id: contractId });
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  },

  async deleteBudgetItem(contractId, itemId) {
    if (!confirm('Excluir este item do orçamento?')) return;
    try {
      await Store.deleteBudgetItem(contractId, itemId);
      window.showToast('Item removido', 'success');
      this.render({ id: contractId });
    } catch (e) { window.showToast(e.message, 'error'); }
  },

  async deleteSaida(id) {
    if (!confirm('Excluir esta saída?')) return;
    try {
      const saida = Store.state.saidas.find(s => s.id === id);
      const contractId = saida?.contractId;
      await Store.deleteSaida(id);
      window.showToast('Saída excluída', 'success');
      if (contractId) this.render({ id: contractId });
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  },

  showDetalheComposicao(tipo, saidas, saidasByType, passagensRealizadas, passagensPendentes, baseAllocations) {
    const TIPO_MAP = {
      'Mão de Obra': 'mao_de_obra',
      'Material':    'material',
      'Hospedagem':  'hospedagem',
      'Transporte':  'transporte'
    };
    const CORES = {
      'Mão de Obra':  '#7C3AED',
      'Material':     '#D97706',
      'Hospedagem':   '#0891B2',
      'Transporte':   '#059669',
      '✈ Passagens':  '#A855F7',
      'BASE Alocada': '#3182CE'
    };
    const cor = CORES[tipo] || '#6B7280';

    let linhas = [];

    if (tipo === '✈ Passagens') {
      linhas = [
        ...passagensRealizadas.map(e => ({
          data: e.date,
          descricao: e.description,
          valor: parseFloat(e.value) || 0,
          status: 'realizado',
          badge: `<span class="badge" style="background:#D1FAE5;color:#065F46;">✔ Pago</span>`
        })),
        ...passagensPendentes.map(c => ({
          data: c.dataVencimento || '',
          descricao: c.descricao,
          valor: parseFloat(c.valor) || 0,
          status: 'pendente',
          badge: `<span class="badge" style="background:#EDE9FE;color:#5B21B6;">⏳ Pendente</span>`
        }))
      ];
    } else if (tipo === 'BASE Alocada') {
      linhas = baseAllocations.map(a => ({
        data: a.date,
        descricao: a.baseDescription,
        valor: parseFloat(a.value) || 0,
        status: 'realizado',
        badge: `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">⚙️ BASE</span>`
      }));
    } else if (tipo === 'Transporte') {
      const diretas = saidas.filter(s => s.type === 'transporte');
      linhas = [
        ...diretas.map(s => ({
          data: s.date,
          descricao: s.description,
          valor: parseFloat(s.value) || 0,
          status: 'realizado',
          badge: `<span class="badge" style="background:#D1FAE5;color:#065F46;">✔ Saída</span>`
        })),
        ...passagensRealizadas.map(e => ({
          data: e.date,
          descricao: e.description,
          valor: parseFloat(e.value) || 0,
          status: 'realizado',
          badge: `<span class="badge" style="background:#EDE9FE;color:#5B21B6;">✈ Passagem</span>`
        }))
      ];
    } else {
      const key = TIPO_MAP[tipo];
      if (key) {
        linhas = saidas.filter(s => s.type === key).map(s => ({
          data: s.date,
          descricao: s.description,
          valor: parseFloat(s.value) || 0,
          status: 'realizado',
          badge: `<span class="badge" style="background:${cor}18;color:${cor};">✔ Saída</span>`
        }));
      }
    }

    linhas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const total = linhas.filter(l => l.status === 'realizado').reduce((s, l) => s + l.valor, 0);
    const totalPrev = linhas.filter(l => l.status === 'pendente').reduce((s, l) => s + l.valor, 0);

    const html = `
      <div class="modal-overlay" id="modalDetalheComp">
        <div class="modal" style="width:700px;max-width:95vw;">
          <div class="modal-header" style="border-left:4px solid ${cor};">
            <h2 class="modal-title">${tipo} — Detalhamento</h2>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-content" style="padding:0;">
            ${linhas.length === 0 ? `
              <div style="padding:var(--sp-xl);text-align:center;color:var(--color-text-muted);">
                <div style="font-size:28px;margin-bottom:var(--sp-sm);">📭</div>
                <div>Nenhum lançamento encontrado para esta categoria</div>
              </div>
            ` : `
              <div class="table-wrap" style="margin:0;">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Status</th>
                      <th class="rh-text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${linhas.map(l => `
                      <tr style="${l.status === 'pendente' ? 'opacity:.7;background:rgba(124,58,237,.04);' : ''}">
                        <td style="font-size:15px;white-space:nowrap;">${l.data ? new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td><strong style="font-size:15px;">${escapeHtml(l.descricao || '')}</strong></td>
                        <td>${l.badge}</td>
                        <td style="text-align:right;font-weight:700;font-family:'Nunito',sans-serif;${l.status === 'pendente' ? 'color:#7C3AED;' : ''}">${Store.formatBRL(l.valor)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                  <tfoot>
                    <tr style="background:var(--color-bg);font-weight:700;">
                      <td colspan="3" style="padding:var(--sp-md);">Total realizado</td>
                      <td style="text-align:right;padding:var(--sp-md);color:${cor};">${Store.formatBRL(total)}</td>
                    </tr>
                    ${totalPrev > 0 ? `
                    <tr style="background:rgba(124,58,237,.06);font-weight:700;">
                      <td colspan="3" style="padding:var(--sp-md);color:#7C3AED;">⏳ Previsto (pendente)</td>
                      <td style="text-align:right;padding:var(--sp-md);color:#7C3AED;">${Store.formatBRL(totalPrev)}</td>
                    </tr>` : ''}
                  </tfoot>
                </table>
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btnFecharDetalhe">Fechar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('modalDetalheComp');
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.getElementById('btnFecharDetalhe').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }
};
