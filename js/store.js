window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.Store = {
  state: {
    contracts: [],
    saidas: [],
    caixa: [],
    base: [],
    socios: [],
    investimentos: [],
    notas_fiscais: [],
    tipos_base: [],
    clientes: [],
    fornecedores: [],
    contas_pagar: [],
    niveis_acesso: [],
    recursos: [],
    doc_templates: [],
    users: [],
    dashboard: null,
    loading: false,
    error: null
  },

  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  },

  notify() {
    this.listeners.forEach(fn => fn(this.state));
  },

  formatBRL(value) {
    // Mascara valor se o perfil atual não tem permissão de ver valores
    if (window.perfil && typeof window.perfil.podeVerValores === 'function' && !window.perfil.podeVerValores()) {
      return 'R$ ●●●●●';
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  },

  async loadAll() {
    try {
      this.state.loading = true;
      const safe = fn => fn.catch(() => ({}));
      const [contracts, caixa, base, socios, investimentos, notas_fiscais, tipos_base, clientes, fornecedores, contas_pagar, recursos] = await Promise.all([
        fetch('/api/contracts').then(r => r.json()),
        fetch('/api/caixa').then(r => r.json()),
        fetch('/api/base').then(r => r.json()),
        fetch('/api/socios').then(r => r.json()),
        fetch('/api/investimentos').then(r => r.json()),
        fetch('/api/notas-fiscais').then(r => r.json()),
        fetch('/api/tipos-base').then(r => r.json()),
        fetch('/api/clientes').then(r => r.json()),
        fetch('/api/fornecedores').then(r => r.json()),
        safe(fetch('/api/contas-pagar').then(r => r.json())),
        safe(fetch('/api/recursos').then(r => r.json()))
      ]);

      this.state.contracts = contracts.contracts || [];
      this.state.saidas = contracts.saidas || [];
      this.state.caixa = caixa.entries || [];
      this.state.base = base.items || [];
      this.state.socios = socios.socios || [];
      this.state.investimentos = investimentos.investimentos || [];
      this.state.notas_fiscais = notas_fiscais.notas_fiscais || [];
      this.state.tipos_base = tipos_base.tipos || [];
      this.state.clientes = clientes.clientes || [];
      this.state.fornecedores = fornecedores.fornecedores || [];
      this.state.contas_pagar = contas_pagar.contas || [];
      this.state.recursos = recursos.recursos || [];
      this.state.error = null;
      this.notify();
    } catch (e) {
      this.state.error = e.message;
      this.notify();
    } finally {
      this.state.loading = false;
    }
  },

  async loadDashboard(params) {
    try {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      const data = await fetch('/api/dashboard' + qs).then(r => r.json());
      this.state.dashboard = data;
      this.notify();
      return data;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // Contracts
  async createContract(data) {
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateContract(id, data) {
    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteContract(id) {
    try {
      const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // Saidas
  async createSaida(contractId, data) {
    try {
      const res = await fetch(`/api/contracts/${contractId}/saidas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateSaida(id, data) {
    try {
      const res = await fetch(`/api/saidas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteSaida(id) {
    try {
      const res = await fetch(`/api/saidas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.contracts = result.contracts || [];
      this.state.saidas = result.saidas || [];
      if (result.notas_fiscais !== undefined) this.state.notas_fiscais = result.notas_fiscais;
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // Caixa
  async createCaixaEntry(data) {
    try {
      const res = await fetch('/api/caixa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.caixa = result.entries || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateCaixaEntry(id, data) {
    try {
      const res = await fetch(`/api/caixa/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.caixa = result.entries || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteCaixaEntry(id) {
    try {
      const res = await fetch(`/api/caixa/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.caixa = result.entries || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // BASE
  async createBaseItem(data) {
    try {
      const res = await fetch('/api/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.base = result.items || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateBaseItem(id, data) {
    try {
      const res = await fetch(`/api/base/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.base = result.items || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteBaseItem(id) {
    try {
      const res = await fetch(`/api/base/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.base = result.items || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async allocateBaseItem(id, data) {
    try {
      const res = await fetch(`/api/base/${id}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Allocation failed');
      }
      const result = await res.json();
      this.state.base = result.base.items || [];
      this.state.caixa = result.caixa.entries || [];
      this.state.contracts = result.contracts.contracts || [];
      this.state.saidas = result.contracts.saidas || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // Helpers
  getContractById(id) {
    return this.state.contracts.find(c => c.id === id);
  },

  getSaidasByContract(contractId) {
    return this.state.saidas.filter(s => s.contractId === contractId);
  },

  getBaseItemById(id) {
    return this.state.base.find(b => b.id === id);
  },

  getCaixaBalance() {
    return this.state.caixa.reduce((sum, entry) => {
      return entry.type === 'entrada' ? sum + entry.value : sum - entry.value;
    }, 0);
  },

  getBaseUnallocated() {
    return this.state.base.reduce((sum, item) => {
      const allocated = (item.allocations || []).reduce((s, a) => s + a.value, 0);
      return sum + (item.value - allocated);
    }, 0);
  },

  getBaseAllocationsForContract(contractId) {
    return this.state.base.flatMap(item =>
      (item.allocations || [])
        .filter(a => a.contractId === contractId)
        .map(a => ({ ...a, baseDescription: item.description }))
    );
  },

  getTotalSaidasByContract(contractId) {
    return this.state.saidas
      .filter(s => s.contractId === contractId)
      .reduce((sum, s) => sum + s.value, 0);
  },

  getSaidasByType(contractId) {
    const saidas = this.getSaidasByContract(contractId);
    return {
      mao_de_obra: saidas.filter(s => s.type === 'mao_de_obra').reduce((sum, s) => sum + s.value, 0),
      material: saidas.filter(s => s.type === 'material').reduce((sum, s) => sum + s.value, 0),
      hospedagem: saidas.filter(s => s.type === 'hospedagem').reduce((sum, s) => sum + s.value, 0),
      transporte: saidas.filter(s => s.type === 'transporte').reduce((sum, s) => sum + s.value, 0)
    };
  },

  // Sócios
  async createSocio(data) {
    try {
      const res = await fetch('/api/socios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.socios = result.socios || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateSocio(id, data) {
    try {
      const res = await fetch(`/api/socios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.socios = result.socios || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteSocio(id) {
    try {
      const res = await fetch(`/api/socios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.socios = result.socios || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  // Investimentos
  async createInvestimento(data) {
    try {
      const res = await fetch('/api/investimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.investimentos = result.investimentos || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteInvestimento(id) {
    try {
      const res = await fetch(`/api/investimentos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.investimentos = result.investimentos || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  getSocioById(id) {
    return this.state.socios.find(s => s.id === id);
  },

  getInvestimentosBySocio(socioId) {
    return this.state.investimentos.filter(i => i.socioId === socioId);
  },

  getTotalInvestimentoBySocio(socioId) {
    return this.getInvestimentosBySocio(socioId).reduce((sum, i) => sum + i.value, 0);
  },

  // Notas Fiscais
  async createNotaFiscal(data) {
    try {
      const res = await fetch('/api/notas-fiscais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.notas_fiscais = result.notas_fiscais || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async updateNotaFiscal(id, data) {
    try {
      const res = await fetch(`/api/notas-fiscais/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.notas_fiscais = result.notas_fiscais || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async deleteNotaFiscal(id) {
    try {
      const res = await fetch(`/api/notas-fiscais/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.notas_fiscais = result.notas_fiscais || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async emitirNotaFiscal(id, dataEmissaoReal) {
    try {
      const res = await fetch(`/api/notas-fiscais/${id}/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataEmissaoReal })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(err.error || 'Erro ao emitir NF');
      }
      const result = await res.json();
      this.state.notas_fiscais = result.notas_fiscais || [];
      if (result.caixa) this.state.caixa = result.caixa.entries || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  async cancelarEmissaoNotaFiscal(id) {
    try {
      const res = await fetch(`/api/notas-fiscais/${id}/cancelar-emissao`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      this.state.notas_fiscais = result.notas_fiscais || [];
      this.notify();
      return result;
    } catch (e) {
      this.state.error = e.message;
      this.notify();
      throw e;
    }
  },

  getNotaFiscalsByContract(contractId) {
    return this.state.notas_fiscais.filter(nf => nf.contractId === contractId);
  },

  getNotaFiscalStatus(dataLimite) {
    const hoje = new Date();
    const limite = new Date(dataLimite);
    const diasRestantes = Math.floor((limite - hoje) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0) return { status: 'vencida', dias: 0, classe: 'danger' };
    if (diasRestantes <= 7) return { status: 'proximo_vencer', dias: diasRestantes, classe: 'warning' };
    return { status: 'no_prazo', dias: diasRestantes, classe: 'success' };
  },

  getNotasFiscaisProximas() {
    return this.state.notas_fiscais
      .filter(nf => !nf.emitida)
      .filter(nf => {
        const status = this.getNotaFiscalStatus(nf.dataLimite);
        return status.status !== 'no_prazo';
      })
      .sort((a, b) => new Date(a.dataLimite) - new Date(b.dataLimite));
  },

  // Tipos BASE
  getTipoBaseByKey(key) {
    return this.state.tipos_base.find(t => t.key === key)
      || { key: key || 'outros', label: key || 'Outros', icon: '🔹', cor: '#718096' };
  },

  async createTipoBase(data) {
    try {
      const res = await fetch('/api/tipos-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro' }));
        throw new Error(err.error || 'Erro ao criar tipo');
      }
      const result = await res.json();
      this.state.tipos_base = result.tipos || [];
      this.notify();
      return result;
    } catch (e) { this.state.error = e.message; this.notify(); throw e; }
  },

  async updateTipoBase(id, data) {
    try {
      const res = await fetch(`/api/tipos-base/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro' }));
        throw new Error(err.error || 'Erro ao atualizar tipo');
      }
      const result = await res.json();
      this.state.tipos_base = result.tipos || [];
      this.notify();
      return result;
    } catch (e) { this.state.error = e.message; this.notify(); throw e; }
  },

  async deleteTipoBase(id) {
    try {
      const res = await fetch(`/api/tipos-base/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro' }));
        throw new Error(err.error || 'Erro ao excluir tipo');
      }
      const result = await res.json();
      this.state.tipos_base = result.tipos || [];
      this.notify();
      return result;
    } catch (e) { this.state.error = e.message; this.notify(); throw e; }
  },

  // Orçamento
  async createBudgetItem(contractId, data) {
    const res = await fetch(`/api/contracts/${contractId}/budget`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async updateBudgetItem(contractId, itemId, data) {
    const res = await fetch(`/api/contracts/${contractId}/budget/${itemId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async deleteBudgetItem(contractId, itemId) {
    const res = await fetch(`/api/contracts/${contractId}/budget/${itemId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },

  // RDO (Relatório Diário de Obra)
  async createRdo(contractId, data) {
    const res = await fetch(`/api/contracts/${contractId}/rdos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) {
      const msg = await res.text();
      try { throw new Error(JSON.parse(msg).error || msg); } catch { throw new Error(msg); }
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async updateRdo(contractId, rdoId, data) {
    const res = await fetch(`/api/contracts/${contractId}/rdos/${rdoId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) {
      const msg = await res.text();
      try { throw new Error(JSON.parse(msg).error || msg); } catch { throw new Error(msg); }
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async deleteRdo(contractId, rdoId) {
    const res = await fetch(`/api/contracts/${contractId}/rdos/${rdoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async uploadRdoFoto(contractId, rdoId, files, legenda) {
    const form = new FormData();
    if (legenda) form.append('legenda', legenda);
    for (const f of files) form.append('arquivo', f, f.name);
    const res = await fetch(`/api/contracts/${contractId}/rdos/${rdoId}/fotos`, {
      method: 'POST', body: form
    });
    if (!res.ok) {
      const msg = await res.text();
      try { throw new Error(JSON.parse(msg).error || msg); } catch { throw new Error(msg); }
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async deleteRdoFoto(contractId, rdoId, fotoId) {
    const res = await fetch(`/api/contracts/${contractId}/rdos/${rdoId}/fotos/${fotoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },

  // Organograma (Equipe por Contrato)
  async createMembroOrganograma(contractId, data) {
    const res = await fetch(`/api/contracts/${contractId}/organograma`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) {
      const msg = await res.text();
      try { throw new Error(JSON.parse(msg).error || msg); } catch { throw new Error(msg); }
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async updateMembroOrganograma(contractId, membroId, data) {
    const res = await fetch(`/api/contracts/${contractId}/organograma/${membroId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    if (!res.ok) {
      const msg = await res.text();
      try { throw new Error(JSON.parse(msg).error || msg); } catch { throw new Error(msg); }
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },
  async deleteMembroOrganograma(contractId, membroId, opts) {
    const qs = opts ? ('?' + new URLSearchParams(opts).toString()) : '';
    const res = await fetch(`/api/contracts/${contractId}/organograma/${membroId}${qs}`, { method: 'DELETE' });
    if (!res.ok) {
      const msg = await res.text();
      let err;
      try { err = JSON.parse(msg); } catch { err = { error: msg }; }
      const e = new Error(err.error || msg);
      e.status = res.status;
      e.body = err;
      throw e;
    }
    const r = await res.json();
    this.state.contracts = r.contracts || []; this.notify(); return r;
  },

  // Users (admin)
  async loadUsers() {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.users = r.users || []; this.notify(); return r;
  },
  async createUser(data) {
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao criar usuário');
    }
    const r = await res.json();
    this.state.users = r.users || []; this.notify(); return r;
  },
  async updateUser(id, data) {
    const res = await fetch(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao atualizar');
    }
    const r = await res.json();
    this.state.users = r.users || []; this.notify(); return r;
  },
  async deleteUser(id) {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao deletar');
    }
    const r = await res.json();
    this.state.users = r.users || []; this.notify(); return r;
  },

  // Clientes
  async createCliente(data) {
    const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.clientes = r.clientes || []; this.notify(); return r;
  },
  async updateCliente(id, data) {
    const res = await fetch(`/api/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.clientes = r.clientes || []; this.notify(); return r;
  },
  async deleteCliente(id) {
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.clientes = r.clientes || []; this.notify(); return r;
  },

  // Fornecedores
  async createFornecedor(data) {
    const res = await fetch('/api/fornecedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.fornecedores = r.fornecedores || []; this.notify(); return r;
  },
  async updateFornecedor(id, data) {
    const res = await fetch(`/api/fornecedores/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.fornecedores = r.fornecedores || []; this.notify(); return r;
  },
  async deleteFornecedor(id) {
    const res = await fetch(`/api/fornecedores/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.fornecedores = r.fornecedores || []; this.notify(); return r;
  },

  // Contas a Pagar
  async loadContasPagar() {
    const r = await fetch('/api/contas-pagar').then(res => res.json());
    this.state.contas_pagar = r.contas || [];
    this.notify(); return r;
  },
  async createContaPagar(data) {
    const res = await fetch('/api/contas-pagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contas_pagar = r.contas || []; this.notify(); return r;
  },
  async updateContaPagar(id, data) {
    const res = await fetch(`/api/contas-pagar/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contas_pagar = r.contas || []; this.notify(); return r;
  },
  async deleteContaPagar(id) {
    const res = await fetch(`/api/contas-pagar/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contas_pagar = r.contas || []; this.notify(); return r;
  },
  async pagarConta(id, data) {
    const res = await fetch(`/api/contas-pagar/${id}/pagar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contas_pagar = r.contas || []; this.notify(); return r;
  },
  async estornarConta(id) {
    const res = await fetch(`/api/contas-pagar/${id}/estornar`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.contas_pagar = r.contas || []; this.notify(); return r;
  },

  async loadNiveisAcesso() {
    const r = await fetch('/api/niveis-acesso').then(res => res.json());
    this.state.niveis_acesso = r.niveis || [];
    this.notify();
    return r;
  },

  // Recursos
  async addFolga(recursoId, data) {
    const res = await fetch(`/api/recursos/${recursoId}/folgas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async deleteFolga(recursoId, folgaId) {
    const res = await fetch(`/api/recursos/${recursoId}/folgas/${folgaId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async comprarPassagem(recursoId, folgaId, tipo, data) {
    const res = await fetch(`/api/recursos/${recursoId}/folgas/${folgaId}/passagem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, ...data }) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || [];
    if (r.caixa)       this.state.caixa        = r.caixa.entries || [];
    if (r.contas_pagar) this.state.contas_pagar = r.contas_pagar.contas || [];
    this.notify(); return r;
  },
  async createRecurso(data) {
    const res = await fetch('/api/recursos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async updateRecurso(id, data) {
    const res = await fetch(`/api/recursos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async deleteRecurso(id) {
    const res = await fetch(`/api/recursos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },

  // Documentos de colaboradores
  async addDocumento(recursoId, data) {
    const res = await fetch(`/api/recursos/${recursoId}/documentos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async updateDocumento(recursoId, docId, data) {
    const res = await fetch(`/api/recursos/${recursoId}/documentos/${docId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },
  async deleteDocumento(recursoId, docId) {
    const res = await fetch(`/api/recursos/${recursoId}/documentos/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.recursos = r.recursos || []; this.notify(); return r;
  },

  // Templates de documentação
  async loadDocTemplates() {
    const r = await fetch('/api/doc-templates').then(res => res.json());
    this.state.doc_templates = r.templates || [];
    this.notify(); return r;
  },
  async createDocTemplate(data) {
    const res = await fetch('/api/doc-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.doc_templates = r.templates || []; this.notify(); return r;
  },
  async updateDocTemplate(id, data) {
    const res = await fetch(`/api/doc-templates/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.doc_templates = r.templates || []; this.notify(); return r;
  },
  async deleteDocTemplate(id) {
    const res = await fetch(`/api/doc-templates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.doc_templates = r.templates || []; this.notify(); return r;
  },

  async updateNivelAcesso(id, abas) {
    const res = await fetch(`/api/niveis-acesso/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abas })
    });
    if (!res.ok) throw new Error(await res.text());
    const r = await res.json();
    this.state.niveis_acesso = r.niveis || [];
    this.notify();
    return r;
  }
};

// ─── BRL Currency Input Utility ───
window.BRLInput = {
  _fmt(cents) {
    const s = String(Math.abs(Math.round(cents))).padStart(3, '0');
    const dec = s.slice(-2);
    const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${int || '0'},${dec}`;
  },
  toDisplay(v) {
    if (v === '' || v === null || v === undefined) return '';
    return this._fmt(Math.round((parseFloat(v) || 0) * 100));
  },
  parse(str) {
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
  }
};

document.addEventListener('input', e => {
  if (!e.target.matches('[data-currency]')) return;
  const input = e.target;
  const digits = input.value.replace(/\D/g, '');
  if (!digits) { input.value = ''; return; }
  const cents = parseInt(digits, 10);
  if (cents > 999999999999) return;
  input.value = BRLInput._fmt(cents);
});

// Máscara de telefone BR: (XX) XXXX-XXXX (fixo) ou (XX) XXXXX-XXXX (celular)
window.formatPhoneBR = function (raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

document.addEventListener('input', e => {
  if (!e.target.matches('[data-phone]')) return;
  e.target.value = window.formatPhoneBR(e.target.value);
});

// Global toast notification helper
window.showToast = function(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const span = document.createElement('span');
  span.textContent = message;
  toast.appendChild(span);
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
};
