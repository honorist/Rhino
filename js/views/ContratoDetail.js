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

  _podeEditar() {
    return !window.perfil || !window.perfil.podeEditar || window.perfil.podeEditar('#/contratos');
  },

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

      // Compras / saídas avulsas: qualquer caixa entry SAÍDA vinculada ao contrato
      // que NÃO seja passagem (já listadas) e NÃO seja saida cadastrada via tabela `saidas`
      // (essas vêm pelo Store.getSaidasByContract). Inclui contas a pagar pagas com contract_id.
      const comprasContrato = (Store.state.caixa || []).filter(e =>
        e.contractId === contractId &&
        e.type === 'saida' &&
        e.category !== 'passagem'
      );
      const totalCompras = comprasContrato.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);

      const margin = contract.value - totalSaidas - totalBase - totalPassagensRealizadas - totalCompras;
      const spentPct = ((totalSaidas + totalPassagensRealizadas + totalCompras) / contract.value * 100).toFixed(1);

      // Boletins de Medição = Notas Fiscais vinculadas ao contrato
      const nfsContrato = (Store.state.notas_fiscais || []).filter(nf => nf.contractId === contractId);
      const nfsEmitidas = nfsContrato.filter(nf => nf.emitida);
      const totalMedido   = nfsContrato.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      const totalEmitido  = nfsEmitidas.reduce((s, nf) => s + (parseFloat(nf.valor) || 0), 0);
      const totalAMedir   = Math.max(0, contract.value - totalMedido);
      const pctMedido     = contract.value > 0 ? (totalMedido / contract.value * 100) : 0;
      const pctEmitido    = contract.value > 0 ? (totalEmitido / contract.value * 100) : 0;
      const margemAtual   = totalMedido - totalSaidas - totalBase - totalPassagensRealizadas - totalCompras;
      // pctMargem agora é sobre o VALOR DO CONTRATO (meta 20% do contrato).
      const pctMargem     = contract.value > 0 ? (margemAtual / contract.value * 100) : 0;
      const metaMargemReais = contract.value * 0.20;
      const margemFaltante  = Math.max(0, metaMargemReais - margemAtual);

      // Orçamento
      const budget = contract.budget || [];
      const totalOrcado = budget.reduce((s, b) => s + b.value, 0);
      // Labels/cores fixos para tipos canônicos. Para tipos customizados (equipamento,
      // servico etc), busca em Store.state.tipos_base (cadastrados pelo usuário).
      const TIPOS_FIXOS_LABEL = {
        mao_de_obra: 'Mão de Obra', material: 'Material',
        hospedagem: 'Hospedagem',   transporte: 'Transporte',
        base: 'Custo BASE',         outros: 'Outros'
      };
      const TIPOS_FIXOS_COLOR = {
        mao_de_obra: '#A78BFA', material: '#FB923C',
        hospedagem: '#22D3EE',  transporte: '#34D399',
        base: '#60A5FA',        outros: '#9CA3AF'
      };
      const tiposBaseMap = Object.fromEntries((Store.state.tipos_base || []).map(t => [t.key, t]));
      const TIPOS_LABEL = new Proxy(TIPOS_FIXOS_LABEL, {
        get(target, key) {
          if (target[key]) return target[key];
          if (tiposBaseMap[key]) return tiposBaseMap[key].label;
          return key ? key.toString().replace(/_/g, ' ') : '—';
        }
      });
      const TIPOS_COLOR = new Proxy(TIPOS_FIXOS_COLOR, {
        get(target, key) {
          if (target[key]) return target[key];
          if (tiposBaseMap[key] && tiposBaseMap[key].cor) return tiposBaseMap[key].cor;
          return '#9CA3AF';
        }
      });
      // Realizado por tipo — DINÂMICO: aceita qualquer category vinda de compras
      // (não força em 6 buckets fixos). Soma saidasByType + base + passagens + compras.
      const realizadoPorTipo = {
        mao_de_obra: saidasByType.mao_de_obra || 0,
        material:    saidasByType.material    || 0,
        hospedagem:  saidasByType.hospedagem  || 0,
        transporte:  (saidasByType.transporte || 0) + totalPassagensRealizadas,
        base:        totalBase,
      };
      comprasContrato.forEach(e => {
        const k = (e.category || 'outros').toString();
        realizadoPorTipo[k] = (realizadoPorTipo[k] || 0) + (parseFloat(e.value) || 0);
      });
      // Garante que 'outros' exista como bucket
      if (!realizadoPorTipo.outros) realizadoPorTipo.outros = 0;
      // Total realizado consolidado (para TOTAL real)
      const totalRealizado = totalSaidas + totalBase + totalPassagensRealizadas + totalCompras;
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
              <button class="btn btn-secondary" id="btnExportarPDF" title="Exportar resumo em PDF">📄 PDF</button>
              ${this._podeEditar() ? `<button class="btn btn-primary" id="btnEditarDados">✏️ Editar Dados</button>` : ''}
              ${this._podeEditar() ? `<button class="btn btn-danger" id="btnExcluirContrato" title="Excluir contrato">🗑️ Excluir</button>` : ''}
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
            { k:'visao',      l:'Visão Geral',  icon:'eye' },
            { k:'financeiro', l:'Financeiro',   icon:'dollar-sign' },
            { k:'cronograma', l:'Cronograma',   icon:'calendar' },
            { k:'equipe',     l:'Equipe',       icon:'users' },
            { k:'rdo',        l:'RDO',          icon:'clipboard', badge: (contract.rdos || []).length },
            { k:'pendencias', l:'Pendências',   icon:'alert-triangle', badge: passagensPendentes.length }
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
            <div style="padding:var(--sp-lg);border-top:3px solid ${(() => {
              if (contract.value <= 0) return 'var(--color-text-muted)';
              if (pctMargem >= 20) return 'var(--color-success)';
              if (pctMargem >= 0)  return 'var(--color-warning)';
              return 'var(--color-danger)';
            })()};">
              <div class="text-muted font-sm mb-md" style="">Resultado parcial</div>
              <div style="font-size:22px;font-weight:800;color:${margemAtual >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${margemAtual >= 0 ? '+ ' : ''}${Store.formatBRL(margemAtual)}</div>
              <div class="text-muted font-sm mt-sm">
                ${contract.value > 0 ? `
                  ${pctMargem.toFixed(1)}% do contrato · meta ≥20% (${Store.formatBRL(metaMargemReais)})
                  ${pctMargem < 20
                    ? `<div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;color:${pctMargem < 0 ? 'var(--color-danger)' : 'var(--color-warning)'};font-weight:700;">⚠ ${pctMargem < 0 ? 'PREJUÍZO' : `faltam ${(20 - pctMargem).toFixed(1)}pp · ${Store.formatBRL(margemFaltante)}`}</div>`
                    : '<div style="margin-top:4px;color:var(--color-success);font-weight:700;">✓ acima da meta</div>'}
                ` : 'sem valor de contrato'}
              </div>
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

          <!-- Layout 2 colunas: Equipe alocada + Sidebar (Saídas / Pendências / RDO) -->
          <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:var(--sp-lg);align-items:start;margin-bottom:var(--sp-xl);">
            <!-- LEFT: Equipe alocada -->
            ${this._renderEquipeAlocadaTable(contract)}

            <!-- RIGHT: Sidebar -->
            ${this._renderSidebarVisao(contract, nfsContrato, passagensPendentes)}
          </div>
          `;
        })()}
        ` : ''}

        <!-- ─── Curva S de Execução ─── -->
        ${this._tab === 'financeiro' && contract.value > 0 && contract.startDate && contract.endDate ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">📈 Curva S — Planejado × Realizado</h3>
            <span class="text-muted font-sm" id="curvaSFonte">Acumulado mês a mês (carregando...)</span>
          </div>
          <div style="position:relative;height:320px;padding:var(--sp-md);">
            <canvas id="canvasCurvaS"></canvas>
          </div>
          <div class="text-muted font-sm" style="padding:0 var(--sp-md) var(--sp-md);" id="curvaSLegenda">
            Carregando legenda...
          </div>
        </div>
        ` : ''}

        <!-- ─── Orçamento ─── -->
        ${this._tab === 'financeiro' ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Orçamento — Composição de Custo Planejado</h3>
            ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovoItemOrcamento" ${totalOrcado >= contract.value && contract.value > 0 ? 'disabled title="Valor total do contrato já foi orçado"' : ''}>+ Adicionar Item</button>` : ''}
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
                    <div style="font-size:13px;font-weight:700;color:${totalRealizado>totalOrcado?'var(--color-danger)':'var(--color-success)'};">
                      ${totalRealizado > totalOrcado ? '▼' : '▲'} ${Store.formatBRL(Math.abs(totalOrcado - totalRealizado))}
                    </div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;">
                    <div><span class="rh-muted">Orç:</span> <strong style="margin-left:4px;">${Store.formatBRL(totalOrcado)}</strong></div>
                    <div><span class="rh-muted">Real:</span> <strong style="margin-left:4px;color:${totalRealizado>totalOrcado?'var(--color-danger)':'var(--color-text)'};">${Store.formatBRL(totalRealizado)}</strong></div>
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

        <!-- ─── Cronograma físico-financeiro ─── -->
        ${this._tab === 'cronograma' ? this.renderCronogramaSection(contract) : ''}

        <!-- ─── Organograma da Obra ─── -->
        ${this._tab === 'equipe' ? this.renderOrganogramaSection(contract) : ''}

        <!-- ─── RDO ─── -->
        ${this._tab === 'rdo' ? this.renderRdoSection(contract) : ''}

        <!-- Composição do Gasto - Gráfico em Pizza -->
        ${this._tab === 'visao' ? (() => {
          const saldoRestante = Math.max(0, contract.value - totalRealizado);
          const pctConsumido = contract.value > 0 ? (totalRealizado / contract.value) * 100 : 0;
          const pctSaldo = contract.value > 0 ? (saldoRestante / contract.value) * 100 : 0;
          const segLegenda = [];
          Object.entries(realizadoPorTipo).forEach(([key, value]) => {
            if (value > 0) {
              segLegenda.push({ key, label: TIPOS_LABEL[key], value, color: TIPOS_COLOR[key], isSaldo: false });
            }
          });
          segLegenda.push({ key: 'saldo', label: 'Saldo Restante', value: saldoRestante, color: '#2E7D52', isSaldo: true });
          return `
        <div class="card mb-2xl">
          <div class="card-header">
            <div>
              <h3 class="card-title">Composição do Gasto</h3>
              <div class="rh-meta-xs" style="margin-top:2px;">Valor do contrato (${Store.formatBRL(contract.value)}) − gastos lançados = saldo restante</div>
            </div>
            <div class="rh-text-right">
              <div class="rh-meta-xs">Consumido</div>
              <div style="font-weight:800;font-size:16px;color:${pctConsumido > 100 ? 'var(--color-danger)' : pctConsumido >= 80 ? 'var(--color-warning)' : 'var(--color-text)'};">${pctConsumido.toFixed(1)}%</div>
            </div>
          </div>
          <!-- Resumo: Contrato − Gastos = Saldo -->
          <div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:var(--sp-md);align-items:center;padding:var(--sp-md);background:var(--color-surface-2);border-radius:8px;margin-bottom:var(--sp-lg);">
            <div class="rh-text-center">
              <div class="rh-meta-xs">Valor do Contrato</div>
              <div style="font-weight:800;font-size:18px;">${Store.formatBRL(contract.value)}</div>
            </div>
            <div style="font-size:24px;color:var(--color-text-muted);font-weight:300;">−</div>
            <div class="rh-text-center">
              <div class="rh-meta-xs">Gastos Lançados</div>
              <div style="font-weight:800;font-size:18px;color:var(--color-danger);">${Store.formatBRL(totalRealizado)}</div>
            </div>
            <div style="font-size:24px;color:var(--color-text-muted);font-weight:300;">=</div>
            <div class="rh-text-center">
              <div class="rh-meta-xs">Saldo Restante</div>
              <div style="font-weight:800;font-size:18px;color:${saldoRestante > 0 ? 'var(--color-success)' : 'var(--color-danger)'};">${saldoRestante >= 0 ? Store.formatBRL(saldoRestante) : '− ' + Store.formatBRL(-saldoRestante)}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:320px 1fr;gap:var(--sp-xl);align-items:center;">
            <div style="position:relative;height:320px;">
              <canvas id="chartPizzaContrato"></canvas>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--sp-sm);">
              ${segLegenda.map(seg => {
                const pct = contract.value > 0 ? ((seg.value / contract.value) * 100).toFixed(1) : 0;
                const clicavel = !seg.isSaldo;
                return `
                  <div class="composicao-item" data-tipo="${escapeHtml(seg.key)}" style="display:flex;align-items:center;gap:var(--sp-md);padding:var(--sp-sm) var(--sp-md);border-radius:6px;${clicavel ? 'cursor:pointer;' : ''}background:${seg.color}10;border-left:3px solid ${seg.color};transition:filter .15s;" onmouseenter="${clicavel ? `this.style.filter='brightness(1.08)'` : ''}" onmouseleave="this.style.filter=''">
                    <div style="width:14px;height:14px;border-radius:3px;background:${seg.color};flex-shrink:0;"></div>
                    <div style="flex:1;">
                      <div style="font-size:15px;font-weight:600;">${escapeHtml(seg.label || seg.key)}${clicavel ? `<span class="rh-meta" style="margin-left:4px;">›</span>` : ''}</div>
                      <div class="rh-meta">${pct}% do contrato</div>
                    </div>
                    <div class="rh-text-right">
                      <div style="font-weight:700;font-size:15px;color:${seg.color};">${Store.formatBRL(seg.value)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        `;})() : ''}

        <!-- Saídas Classificadas (inclui saídas diretas + alocações BASE) -->
        ${this._tab === 'financeiro' ? `
        <div class="card mb-2xl">
          <div class="card-header">
            <h3 class="card-title">Saídas Classificadas</h3>
            ${this._podeEditar() ? `<button class="btn btn-primary btn-sm" id="btnNovaSaida">+ Adicionar Saída</button>` : ''}
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
                    })),
                    // Compras / saídas avulsas vinculadas ao contrato (caixa entries com contractId)
                    ...comprasContrato.map(e => ({
                      kind: 'compra',
                      date: e.date,
                      description: e.description,
                      type: e.category || 'outros',
                      value: parseFloat(e.value) || 0,
                      id: e.id,
                      origemDetalhe: e.contaPagarId ? 'Conta a pagar quitada' : 'Compra direta',
                    }))
                  ].sort((a, b) => new Date(b.date) - new Date(a.date)).map(linha => {
                    const isBase     = linha.kind === 'base';
                    const isPassagem = linha.kind === 'passagem';
                    const isCompra   = linha.kind === 'compra';
                    const tipoBadge = isBase
                      ? `<span class="badge" style="background:rgba(49,130,206,.15);color:#3182CE;">BASE</span>`
                      : `<span class="badge badge-${linha.type}">${(linha.type || '—').toString().replace(/_/g, ' ')}</span>`;
                    const origemBadge = isBase
                      ? `<span style="font-size:15px;color:var(--color-info);font-weight:600;">Rateio BASE</span>`
                      : isPassagem
                      ? `<span style="font-size:15px;color:#7C3AED;font-weight:600;">Passagem</span>`
                      : isCompra
                      ? `<span style="font-size:15px;color:#0891B2;font-weight:600;">${escapeHtml(linha.origemDetalhe || 'Compra')}</span>`
                      : `<span class="rh-meta">Saída direta</span>`;
                    const acoes = isBase
                      ? `<span class="rh-meta">Gerenciar em <a href="#/base" class="rh-link">BASE</a></span>`
                      : isPassagem
                      ? `<span class="rh-meta">Gerenciar em <a href="#/recursos" class="rh-link">Recursos</a></span>`
                      : isCompra
                      ? `<span class="rh-meta">Gerenciar em <a href="#/caixa" class="rh-link">Caixa</a></span>`
                      : (this._podeEditar() ? `<div class="rh-row-sm" style="flex-wrap:wrap;">
                          <button class="btn btn-sm btn-secondary btn-gerar-bm" data-id="${linha.id}" title="Gerar Boletim de Medição">BM</button>
                          <button class="btn btn-sm btn-secondary btn-editar-saida" data-id="${linha.id}" title="Editar">Editar</button>
                          <button class="btn btn-sm btn-danger btn-excluir-saida" data-id="${linha.id}" title="Excluir">Excluir</button>
                        </div>` : '<span class="rh-meta">—</span>');

                    const rowBg = isBase ? 'background:rgba(49,130,206,.03);'
                                : isPassagem ? 'background:rgba(124,58,237,.03);'
                                : isCompra ? 'background:rgba(8,145,178,.03);' : '';
                    return `
                      <tr ${rowBg ? `style="${rowBg}"` : ''}>
                        <td>${new Date(linha.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td><strong>${escapeHtml(linha.description)}</strong></td>
                        <td>${tipoBadge}</td>
                        <td>${origemBadge}</td>
                        <td style="text-align: right; font-weight: 600; ${isBase ? 'color:var(--color-info);' : isCompra ? 'color:#0891B2;' : ''}">${Store.formatBRL(linha.value)}</td>
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

      // Renderiza gráfico de pizza APÓS innerHTML.
      // Composição do gasto = valor do contrato dividido em categorias gastas + saldo restante.
      // Saldo restante = contract.value - totalRealizado (gastos efetivos).
      const saldoRestante = Math.max(0, contract.value - totalRealizado);
      this.renderPizza({
        categorias: realizadoPorTipo,  // dict dinâmico { mao_de_obra, material, equipamento, ... }
        labelMap:   TIPOS_LABEL,
        colorMap:   TIPOS_COLOR,
        saldo:      saldoRestante,
        contractValue: contract.value
      });
      this.renderPizzaOrcamento(orcadoPorTipo, totalOrcado);
      this.renderBarrasOrcado(tiposComparar, orcadoPorTipo, realizadoPorTipo);
      this.renderCurvaS(contract, nfsContrato, saidas, totalBase, totalPassagensRealizadas, totalCompras);

      // Event listeners (guardados — botões podem não existir conforme a aba)
      document.getElementById('btnEditarDados')?.addEventListener('click', () => this.showModalEditarDados(contract));
      document.getElementById('btnExcluirContrato')?.addEventListener('click', () => this.showModalExcluirContrato(contract));
      document.getElementById('btnExportarPDF')?.addEventListener('click', () => this.exportarPDF(contract, {
        totalEmitido, totalMedido, totalAMedir, margemAtual, pctMargem, totalRealizado,
        totalSaidas, totalBase, totalPassagensRealizadas, totalCompras, totalOrcado,
        nfsContrato, nfsEmitidas, realizadoPorTipo, orcadoPorTipo, TIPOS_LABEL,
      }));

      // Click em linha da Equipe alocada (visão geral) → abre modal de detalhe do colaborador
      document.querySelectorAll('.row-equipe-visao').forEach(tr => {
        tr.addEventListener('click', (e) => {
          const id = tr.dataset.recursoId;
          if (id && this.showDetalheColaborador) this.showDetalheColaborador(id);
        });
      });
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

      // Cronograma — carrega atividades e wires up listeners
      if (this._tab === 'cronograma') {
        this._loadAtividades(contract);
        document.getElementById('btnNovaAtividade')?.addEventListener('click', () => this._showModalAtividade(contract, null));
      }

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
};
