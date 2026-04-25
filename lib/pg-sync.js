/**
 * Sincronização JSON → Postgres (best-effort).
 *
 * Estratégia: depois de cada writeData() bem-sucedido em data/<file>.json,
 * espelhamos o conteúdo no Postgres usando UPSERT. Se o banco estiver fora
 * do ar, logamos um warning mas NÃO quebramos o request (JSON continua sendo
 * a fonte canônica até a Fase 5 completa).
 *
 * Quando todos os handlers estiverem migrados pra Postgres, este arquivo
 * pode ser removido.
 */
const db = require('../db');

let dbAvailable = false;
let warned = false;

async function checkDb() {
  try {
    await db.ping();
    dbAvailable = true;
    return true;
  } catch (e) {
    dbAvailable = false;
    if (!warned) {
      console.warn('[pg-sync] Postgres indisponível, sync desativado:', e.message);
      warned = true;
    }
    return false;
  }
}

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

// Faz upsert de uma linha (objeto camelCase) numa tabela
async function upsertRow(table, row) {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined);
  if (!keys.length || !row.id) return;
  const cols = keys.map(camelToSnake);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => row[k]);
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`);
  const sql = `
    INSERT INTO ${table} (${cols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (id) DO UPDATE SET ${updates.length ? updates.join(', ') : 'id = EXCLUDED.id'}
  `;
  await db.query(sql, values);
}

// Apaga linhas cujo id não está mais no array fornecido
async function deleteMissing(table, currentIds) {
  if (!Array.isArray(currentIds)) return;
  if (currentIds.length === 0) {
    await db.query(`DELETE FROM ${table}`);
    return;
  }
  const placeholders = currentIds.map((_, i) => `$${i + 1}`);
  await db.query(
    `DELETE FROM ${table} WHERE id NOT IN (${placeholders.join(', ')})`,
    currentIds
  );
}

function nullIfEmpty(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  return s || null;
}

// ============ Mappers (idênticos aos do migrate-json-to-pg) ============
const MAPPERS = {
  'contracts.json': {
    table: 'contracts',
    arrayKey: 'contracts',
    map: (c) => ({
      id: c.id, name: c.name, contractNumber: nullIfEmpty(c.contractNumber),
      client: c.client, clientId: nullIfEmpty(c.clientId),
      clientDocument: nullIfEmpty(c.clientDocument), clientEmail: nullIfEmpty(c.clientEmail),
      clientPhone: nullIfEmpty(c.clientPhone), value: c.value || 0,
      currency: c.currency || 'BRL',
      startDate: dateOrNull(c.startDate), endDate: dateOrNull(c.endDate),
      tendencyDate: dateOrNull(c.tendencyDate), status: c.status || 'ativo',
      endereco: nullIfEmpty(c.endereco), lat: nullIfEmpty(c.lat), lng: nullIfEmpty(c.lng),
      notes: nullIfEmpty(c.notes),
      budget: JSON.stringify(c.budget || []),
      metadata: JSON.stringify(
        Object.fromEntries(
          Object.entries(c).filter(([k]) =>
            !['id','name','contractNumber','client','clientId','clientDocument','clientEmail',
              'clientPhone','value','currency','startDate','endDate','tendencyDate','status',
              'endereco','lat','lng','notes','budget','createdAt','updatedAt',
              'organograma','rdos'].includes(k)
          )
        )
      ),
      createdAt: c.createdAt || null,
      updatedAt: c.updatedAt || c.createdAt || null,
    }),
  },
  'clientes.json': {
    table: 'clientes',
    arrayKey: 'clientes',
    map: (c) => ({
      id: c.id, nome: c.nome, empresa: nullIfEmpty(c.empresa),
      cargo: nullIfEmpty(c.cargo), setor: nullIfEmpty(c.setor),
      telefone: nullIfEmpty(c.telefone), email: nullIfEmpty(c.email),
      endereco: nullIfEmpty(c.endereco), lat: nullIfEmpty(c.lat), lng: nullIfEmpty(c.lng),
      notas: nullIfEmpty(c.notas),
      createdAt: c.createdAt || null, updatedAt: c.updatedAt || c.createdAt || null,
    }),
  },
  'fornecedores.json': {
    table: 'fornecedores',
    arrayKey: 'fornecedores',
    map: (f) => ({
      id: f.id, nome: f.nome, cnpj: nullIfEmpty(f.cnpj || f.documento),
      email: nullIfEmpty(f.email), telefone: nullIfEmpty(f.telefone),
      endereco: nullIfEmpty(f.endereco),
      pessoaContato: nullIfEmpty(f.pessoaContato),
      materiais: JSON.stringify(Array.isArray(f.materiais) ? f.materiais : []),
      banco: nullIfEmpty(f.banco), agencia: nullIfEmpty(f.agencia),
      conta: nullIfEmpty(f.conta), chavePix: nullIfEmpty(f.chavePix),
      notas: nullIfEmpty(f.notas),
      createdAt: f.createdAt || null, updatedAt: f.updatedAt || f.createdAt || null,
    }),
  },
  'socios.json': {
    table: 'socios',
    arrayKey: 'socios',
    map: (s) => ({
      id: s.id, name: s.name, document: nullIfEmpty(s.document),
      email: nullIfEmpty(s.email), phone: nullIfEmpty(s.phone),
      participacao: s.participacao || 0, notes: nullIfEmpty(s.notes),
      createdAt: s.createdAt || null, updatedAt: s.updatedAt || s.createdAt || null,
    }),
  },
  'recursos.json': {
    table: 'recursos',
    arrayKey: 'recursos',
    map: (r) => ({
      id: r.id, nome: r.nome, cpf: nullIfEmpty(r.cpf),
      dataNascimento: dateOrNull(r.dataNascimento), genero: nullIfEmpty(r.genero),
      telefone: nullIfEmpty(r.telefone), email: nullIfEmpty(r.email),
      endereco: nullIfEmpty(r.endereco), lat: nullIfEmpty(r.lat), lng: nullIfEmpty(r.lng),
      status: r.status || 'funcionario', profissao: nullIfEmpty(r.profissao),
      dataAdmissao: dateOrNull(r.dataAdmissao), salario: r.salario || 0,
      cnh: nullIfEmpty(r.cnh), pis: nullIfEmpty(r.pis),
      dataDesligamento: dateOrNull(r.dataDesligamento),
      motivoDesligamento: nullIfEmpty(r.motivoDesligamento),
      obsDesligamento: nullIfEmpty(r.obsDesligamento), notas: nullIfEmpty(r.notas),
      alocacaoAtual: r.alocacaoAtual ? JSON.stringify(r.alocacaoAtual) : null,
      historicoAlocacoes: JSON.stringify(r.historicoAlocacoes || []),
      rdoCategoria: nullIfEmpty(r.rdoCategoria),
      folgas: JSON.stringify(r.folgas || []),
      documentos: JSON.stringify(r.documentos || []),
      createdAt: r.createdAt || null, updatedAt: r.updatedAt || r.createdAt || null,
    }),
  },
  'caixa.json': {
    table: 'caixa',
    arrayKey: 'entries',
    map: (e) => ({
      id: e.id, type: e.type, description: e.description, value: e.value || 0,
      date: dateOrNull(e.date), contractId: nullIfEmpty(e.contractId),
      baseItemId: nullIfEmpty(e.baseItemId), category: nullIfEmpty(e.category),
      notes: nullIfEmpty(e.notes), formaPagamento: nullIfEmpty(e.formaPagamento),
      contaPagarId: nullIfEmpty(e.contaPagarId), nfId: nullIfEmpty(e.nfId),
      createdAt: e.createdAt || null,
    }),
  },
  'contas_pagar.json': {
    table: 'contas_pagar',
    arrayKey: 'contas',
    map: (cp) => ({
      id: cp.id, descricao: cp.descricao, fornecedorId: nullIfEmpty(cp.fornecedorId),
      numeroNF: nullIfEmpty(cp.numeroNF), valor: cp.valor || 0,
      dataEmissao: dateOrNull(cp.dataEmissao), dataVencimento: dateOrNull(cp.dataVencimento),
      status: cp.status || 'aberto', dataPagamento: dateOrNull(cp.dataPagamento),
      caixaEntryId: nullIfEmpty(cp.caixaEntryId), contractId: nullIfEmpty(cp.contractId),
      category: nullIfEmpty(cp.category), observacoes: nullIfEmpty(cp.observacoes),
      valorPago: cp.valorPago != null ? cp.valorPago : null,
      formaPagamento: nullIfEmpty(cp.formaPagamento),
      createdAt: cp.createdAt || null, updatedAt: cp.updatedAt || cp.createdAt || null,
    }),
  },
  'notas_fiscais.json': {
    table: 'notas_fiscais',
    arrayKey: 'notas_fiscais',
    map: (n) => ({
      id: n.id, numero: n.numero, contractId: nullIfEmpty(n.contractId),
      dataLimite: dateOrNull(n.dataLimite), valor: n.valor || 0,
      prazoRecebimento: n.prazoRecebimento || null, observacoes: nullIfEmpty(n.observacoes),
      emitida: !!n.emitida, dataEmissaoReal: dateOrNull(n.dataEmissaoReal),
      caixaEntryId: nullIfEmpty(n.caixaEntryId),
      createdAt: n.createdAt || null, updatedAt: n.updatedAt || n.createdAt || null,
    }),
  },
  'investimentos.json': {
    table: 'investimentos',
    arrayKey: 'investimentos',
    map: (i) => ({
      id: i.id,
      socioId: nullIfEmpty(i.socioId),
      value: i.value || i.valor || 0,
      date: dateOrNull(i.date || i.data),
      description: i.description || i.descricao || '',
      origem: nullIfEmpty(i.origem),
      destino: nullIfEmpty(i.destino),
      baseType: nullIfEmpty(i.baseType),
      contractId: nullIfEmpty(i.contractId),
      baseItemId: nullIfEmpty(i.baseItemId),
      caixaEntryId: nullIfEmpty(i.caixaEntryId),
      metadata: JSON.stringify(i.metadata || {}),
      createdAt: i.createdAt || null, updatedAt: i.updatedAt || i.createdAt || null,
    }),
  },
  'tipos_base.json': {
    table: 'tipos_base',
    arrayKey: 'tipos',
    map: (t) => ({
      id: t.id, key: t.key, label: t.label,
      icon: nullIfEmpty(t.icon), cor: nullIfEmpty(t.cor), sistema: !!t.sistema,
    }),
  },
  'base.json': {
    table: 'base_items',
    arrayKey: 'items',
    map: (b) => ({
      id: b.id,
      description: b.description || b.nome || '',
      type: nullIfEmpty(b.type || b.tipo),
      value: b.value || b.valor || 0,
      date: dateOrNull(b.date),
      notes: nullIfEmpty(b.notes || b.notas),
      allocations: JSON.stringify(Array.isArray(b.allocations) ? b.allocations : []),
      createdAt: b.createdAt || null, updatedAt: b.updatedAt || b.createdAt || null,
    }),
  },
  'niveis_acesso.json': {
    table: 'niveis_acesso',
    arrayKey: 'niveis',
    map: (n) => ({
      id: n.id, label: n.label, icon: nullIfEmpty(n.icon),
      cor: nullIfEmpty(n.cor), abas: JSON.stringify(n.abas || []),
    }),
  },
  'doc_templates.json': {
    table: 'doc_templates',
    arrayKey: 'templates',
    map: (t) => ({
      id: t.id, nome: t.nome || t.name || '',
      tipoDocumento: nullIfEmpty(t.tipoDocumento || t.tipo),
      empresaId: nullIfEmpty(t.empresaId),
      checklist: JSON.stringify(Array.isArray(t.checklist) ? t.checklist : []),
      periodicidadeMeses: Number.isFinite(parseInt(t.periodicidadeMeses)) ? parseInt(t.periodicidadeMeses) : 12,
      metadata: JSON.stringify(t.metadata || {}),
      createdAt: t.createdAt || null, updatedAt: t.updatedAt || t.createdAt || null,
    }),
  },
};

// ============ Mappers para tabelas aninhadas ao contrato ============
const saidaMap = (s) => ({
  id: s.id,
  contractId: s.contractId,
  type: nullIfEmpty(s.type),
  description: nullIfEmpty(s.description),
  value: s.value || 0,
  date: dateOrNull(s.date),
  nfId: nullIfEmpty(s.nfId),
  numeroBm: nullIfEmpty(s.numeroBm),
  createdAt: s.createdAt || null,
});

const organogramaMap = (m) => ({
  id: m.id,
  contractId: m.contractId,
  recursoId: nullIfEmpty(m.recursoId),
  nivel: nullIfEmpty(m.nivel),
  cargo: nullIfEmpty(m.cargo),
  supervisorId: nullIfEmpty(m.supervisorId),
  area: nullIfEmpty(m.area),
  createdAt: m.createdAt || null,
});

const rdoMap = (r) => ({
  id: r.id,
  contractId: r.contractId,
  numero: nullIfEmpty(r.numero),
  data: dateOrNull(r.data),
  diaSemana: nullIfEmpty(r.diaSemana),
  osNumero: nullIfEmpty(r.osNumero),
  ordemCompra: nullIfEmpty(r.ordemCompra),
  projeto: nullIfEmpty(r.projeto),
  prazo: nullIfEmpty(r.prazo),
  tempo: nullIfEmpty(r.tempo),
  periodoTrabalho: nullIfEmpty(r.periodoTrabalho),
  horaExtra: nullIfEmpty(r.horaExtra),
  moi: JSON.stringify(r.moi || []),
  mod: JSON.stringify(r.mod || []),
  terc: JSON.stringify(r.terc || []),
  equipamentos: JSON.stringify(r.equipamentos || []),
  atividades: JSON.stringify(r.atividades || []),
  seguranca: JSON.stringify(r.seguranca || {}),
  fiscalizacaoComentarios: nullIfEmpty(r.fiscalizacaoComentarios),
  totais: JSON.stringify(r.totais || {}),
  fotos: JSON.stringify(r.fotos || []),
  createdAt: r.createdAt || null,
  updatedAt: r.updatedAt || r.createdAt || null,
});

async function syncContractChildren(jsonData) {
  const contracts = (jsonData && jsonData.contracts) || [];
  const saidas = (jsonData && jsonData.saidas) || [];

  // saidas (top-level no JSON)
  const saidaIds = [];
  for (const s of saidas) {
    if (!s || !s.id) continue;
    saidaIds.push(s.id);
    await upsertRow('saidas', saidaMap(s));
  }
  await deleteMissing('saidas', saidaIds);

  // organograma + rdos: achatados de contracts[].organograma / contracts[].rdos
  const orgIds = [];
  const rdoIds = [];
  for (const c of contracts) {
    for (const m of c.organograma || []) {
      if (!m || !m.id) continue;
      orgIds.push(m.id);
      await upsertRow('organograma_membros', organogramaMap({ ...m, contractId: m.contractId || c.id }));
    }
    for (const r of c.rdos || []) {
      if (!r || !r.id) continue;
      rdoIds.push(r.id);
      await upsertRow('rdos', rdoMap({ ...r, contractId: r.contractId || c.id }));
    }
  }
  await deleteMissing('organograma_membros', orgIds);
  await deleteMissing('rdos', rdoIds);
}

/**
 * Sincroniza um arquivo JSON inteiro com a tabela correspondente.
 * - UPSERT por id pra cada item presente no JSON
 * - DELETE de ids que não estão mais no JSON
 *
 * Best-effort: erros são logados mas não propagados.
 */
async function syncFile(filename, jsonData) {
  const cfg = MAPPERS[filename];
  if (!cfg) return; // arquivo sem mapping (ex.: rdo-fotos)
  if (!dbAvailable) return;

  try {
    const items = (jsonData && jsonData[cfg.arrayKey]) || [];
    const ids = [];
    for (const raw of items) {
      const row = cfg.map(raw);
      if (row.id) {
        ids.push(row.id);
        await upsertRow(cfg.table, row);
      }
    }
    await deleteMissing(cfg.table, ids);

    // Filhos do contrato têm tabelas próprias agora
    if (filename === 'contracts.json') {
      await syncContractChildren(jsonData);
    }
  } catch (e) {
    console.warn(`[pg-sync] falha ao sincronizar ${filename}:`, e.message);
    // Tenta reconectar na próxima
    dbAvailable = false;
    setTimeout(checkDb, 5000);
  }
}

async function init() {
  await checkDb();
  return dbAvailable;
}

module.exports = { init, syncFile, checkDb, MAPPERS, get available() { return dbAvailable; } };
