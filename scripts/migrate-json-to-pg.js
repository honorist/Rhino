#!/usr/bin/env node
/**
 * Migra dados de data/*.json para o Postgres.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/migrate-json-to-pg.js
 *   ou (dentro do container):
 *   docker compose exec rhino node scripts/migrate-json-to-pg.js
 *
 * Flags:
 *   --truncate    Limpa as tabelas antes de inserir (CUIDADO)
 *   --dry-run     Só mostra o que faria, sem escrever
 *   --only=tabela Migra só essa tabela (ex.: --only=contracts)
 */
const fs = require('fs');
const path = require('path');
const db = require('../db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const args = process.argv.slice(2);
const TRUNCATE = args.includes('--truncate');
const DRY = args.includes('--dry-run');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;

function readJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`  ✗ Erro lendo ${file}:`, e.message);
    return null;
  }
}

function _pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function nullIfEmpty(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

function dateOrNull(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

// Configuração: arquivo → tabela + transformador
// Ordem importa por causa das FKs.
const PIPELINE = [
  {
    name: 'socios',
    file: 'socios.json',
    arrayKey: 'socios',
    table: 'socios',
    map: (s) => ({
      id: s.id,
      name: s.name,
      document: nullIfEmpty(s.document),
      email: nullIfEmpty(s.email),
      phone: nullIfEmpty(s.phone),
      participacao: s.participacao || 0,
      notes: nullIfEmpty(s.notes),
      createdAt: s.createdAt || null,
      updatedAt: s.updatedAt || s.createdAt || null,
    }),
  },
  {
    name: 'niveis_acesso',
    file: 'niveis_acesso.json',
    arrayKey: 'niveis',
    table: 'niveis_acesso',
    map: (n) => ({
      id: n.id,
      label: n.label,
      icon: nullIfEmpty(n.icon),
      cor: nullIfEmpty(n.cor),
      abas: JSON.stringify(n.abas || []),
    }),
  },
  {
    name: 'tipos_base',
    file: 'tipos_base.json',
    arrayKey: 'tipos',
    table: 'tipos_base',
    map: (t) => ({
      id: t.id,
      key: t.key,
      label: t.label,
      icon: nullIfEmpty(t.icon),
      cor: nullIfEmpty(t.cor),
      sistema: !!t.sistema,
    }),
  },
  {
    name: 'clientes',
    file: 'clientes.json',
    arrayKey: 'clientes',
    table: 'clientes',
    map: (c) => ({
      id: c.id,
      nome: c.nome,
      empresa: nullIfEmpty(c.empresa),
      cargo: nullIfEmpty(c.cargo),
      setor: nullIfEmpty(c.setor),
      telefone: nullIfEmpty(c.telefone),
      email: nullIfEmpty(c.email),
      endereco: nullIfEmpty(c.endereco),
      lat: nullIfEmpty(c.lat),
      lng: nullIfEmpty(c.lng),
      notas: nullIfEmpty(c.notas),
      createdAt: c.createdAt || null,
      updatedAt: c.updatedAt || c.createdAt || null,
    }),
  },
  {
    name: 'fornecedores',
    file: 'fornecedores.json',
    arrayKey: 'fornecedores',
    table: 'fornecedores',
    map: (f) => ({
      id: f.id,
      nome: f.nome,
      cnpj: nullIfEmpty(f.cnpj || f.documento),
      email: nullIfEmpty(f.email),
      telefone: nullIfEmpty(f.telefone),
      endereco: nullIfEmpty(f.endereco),
      pessoaContato: nullIfEmpty(f.pessoaContato),
      materiais: JSON.stringify(Array.isArray(f.materiais) ? f.materiais : []),
      banco: nullIfEmpty(f.banco),
      agencia: nullIfEmpty(f.agencia),
      conta: nullIfEmpty(f.conta),
      chavePix: nullIfEmpty(f.chavePix),
      notas: nullIfEmpty(f.notas),
      createdAt: f.createdAt || null,
      updatedAt: f.updatedAt || f.createdAt || null,
    }),
  },
  {
    name: 'recursos',
    file: 'recursos.json',
    arrayKey: 'recursos',
    table: 'recursos',
    map: (r) => ({
      id: r.id,
      nome: r.nome,
      cpf: nullIfEmpty(r.cpf),
      dataNascimento: dateOrNull(r.dataNascimento),
      genero: nullIfEmpty(r.genero),
      telefone: nullIfEmpty(r.telefone),
      email: nullIfEmpty(r.email),
      endereco: nullIfEmpty(r.endereco),
      lat: nullIfEmpty(r.lat),
      lng: nullIfEmpty(r.lng),
      status: r.status || 'funcionario',
      profissao: nullIfEmpty(r.profissao),
      dataAdmissao: dateOrNull(r.dataAdmissao),
      salario: r.salario || 0,
      cnh: nullIfEmpty(r.cnh),
      pis: nullIfEmpty(r.pis),
      dataDesligamento: dateOrNull(r.dataDesligamento),
      motivoDesligamento: nullIfEmpty(r.motivoDesligamento),
      obsDesligamento: nullIfEmpty(r.obsDesligamento),
      notas: nullIfEmpty(r.notas),
      alocacaoAtual: r.alocacaoAtual ? JSON.stringify(r.alocacaoAtual) : null,
      historicoAlocacoes: JSON.stringify(r.historicoAlocacoes || []),
      rdoCategoria: nullIfEmpty(r.rdoCategoria),
      folgas: JSON.stringify(r.folgas || []),
      documentos: JSON.stringify(r.documentos || []),
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || r.createdAt || null,
    }),
  },
  {
    name: 'contracts',
    file: 'contracts.json',
    arrayKey: 'contracts',
    table: 'contracts',
    map: (c) => ({
      id: c.id,
      name: c.name,
      contractNumber: nullIfEmpty(c.contractNumber),
      client: c.client,
      clientId: nullIfEmpty(c.clientId),
      clientDocument: nullIfEmpty(c.clientDocument),
      clientEmail: nullIfEmpty(c.clientEmail),
      clientPhone: nullIfEmpty(c.clientPhone),
      value: c.value || 0,
      currency: c.currency || 'BRL',
      startDate: dateOrNull(c.startDate),
      endDate: dateOrNull(c.endDate),
      tendencyDate: dateOrNull(c.tendencyDate),
      status: c.status || 'ativo',
      endereco: nullIfEmpty(c.endereco),
      lat: nullIfEmpty(c.lat),
      lng: nullIfEmpty(c.lng),
      notes: nullIfEmpty(c.notes),
      budget: JSON.stringify(c.budget || []),
      // saidas/organograma/rdos agora têm tabelas próprias — só sobra "lixo" eventual em metadata
      metadata: JSON.stringify(
        Object.fromEntries(
          Object.entries(c).filter(
            ([k]) =>
              ![
                'id','name','contractNumber','client','clientId','clientDocument','clientEmail',
                'clientPhone','value','currency','startDate','endDate','tendencyDate','status',
                'endereco','lat','lng','notes','budget','createdAt','updatedAt',
                'organograma','rdos',
              ].includes(k)
          )
        )
      ),
      createdAt: c.createdAt || null,
      updatedAt: c.updatedAt || c.createdAt || null,
    }),
  },
  {
    name: 'saidas',
    file: 'contracts.json',
    extract: (json) => json.saidas || [],
    table: 'saidas',
    map: (s) => ({
      id: s.id,
      contractId: s.contractId,
      type: nullIfEmpty(s.type),
      description: nullIfEmpty(s.description),
      value: s.value || 0,
      date: dateOrNull(s.date),
      nfId: nullIfEmpty(s.nfId),
      numeroBm: nullIfEmpty(s.numeroBm),
      createdAt: s.createdAt || null,
    }),
  },
  {
    name: 'organograma_membros',
    file: 'contracts.json',
    extract: (json) =>
      (json.contracts || []).flatMap((c) =>
        (c.organograma || []).map((m) => ({ ...m, contractId: m.contractId || c.id }))
      ),
    table: 'organograma_membros',
    map: (m) => ({
      id: m.id,
      contractId: m.contractId,
      recursoId: nullIfEmpty(m.recursoId),
      nivel: nullIfEmpty(m.nivel),
      cargo: nullIfEmpty(m.cargo),
      supervisorId: nullIfEmpty(m.supervisorId),
      area: nullIfEmpty(m.area),
      createdAt: m.createdAt || null,
    }),
  },
  {
    name: 'rdos',
    file: 'contracts.json',
    extract: (json) =>
      (json.contracts || []).flatMap((c) =>
        (c.rdos || []).map((r) => ({ ...r, contractId: r.contractId || c.id }))
      ),
    table: 'rdos',
    map: (r) => ({
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
    }),
  },
  {
    name: 'notas_fiscais',
    file: 'notas_fiscais.json',
    arrayKey: 'notas_fiscais',
    table: 'notas_fiscais',
    map: (n) => ({
      id: n.id,
      numero: n.numero,
      contractId: nullIfEmpty(n.contractId),
      dataLimite: dateOrNull(n.dataLimite),
      valor: n.valor || 0,
      prazoRecebimento: n.prazoRecebimento || null,
      observacoes: nullIfEmpty(n.observacoes),
      emitida: !!n.emitida,
      dataEmissaoReal: dateOrNull(n.dataEmissaoReal),
      caixaEntryId: nullIfEmpty(n.caixaEntryId),
      createdAt: n.createdAt || null,
      updatedAt: n.updatedAt || n.createdAt || null,
    }),
  },
  {
    name: 'contas_pagar',
    file: 'contas_pagar.json',
    arrayKey: 'contas',
    table: 'contas_pagar',
    map: (cp) => ({
      id: cp.id,
      descricao: cp.descricao,
      fornecedorId: nullIfEmpty(cp.fornecedorId),
      numeroNF: nullIfEmpty(cp.numeroNF),
      valor: cp.valor || 0,
      dataEmissao: dateOrNull(cp.dataEmissao),
      dataVencimento: dateOrNull(cp.dataVencimento),
      status: cp.status || 'aberto',
      dataPagamento: dateOrNull(cp.dataPagamento),
      caixaEntryId: nullIfEmpty(cp.caixaEntryId),
      contractId: nullIfEmpty(cp.contractId),
      category: nullIfEmpty(cp.category),
      observacoes: nullIfEmpty(cp.observacoes),
      valorPago: cp.valorPago != null ? cp.valorPago : null,
      formaPagamento: nullIfEmpty(cp.formaPagamento),
      createdAt: cp.createdAt || null,
      updatedAt: cp.updatedAt || cp.createdAt || null,
    }),
  },
  {
    name: 'caixa',
    file: 'caixa.json',
    arrayKey: 'entries',
    table: 'caixa',
    map: (e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      value: e.value || 0,
      date: dateOrNull(e.date),
      contractId: nullIfEmpty(e.contractId),
      baseItemId: nullIfEmpty(e.baseItemId),
      category: nullIfEmpty(e.category),
      notes: nullIfEmpty(e.notes),
      formaPagamento: nullIfEmpty(e.formaPagamento),
      contaPagarId: nullIfEmpty(e.contaPagarId),
      nfId: nullIfEmpty(e.nfId),
      createdAt: e.createdAt || null,
    }),
  },
  {
    name: 'investimentos',
    file: 'investimentos.json',
    arrayKey: 'investimentos',
    table: 'investimentos',
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
      createdAt: i.createdAt || null,
      updatedAt: i.updatedAt || i.createdAt || null,
    }),
  },
  {
    name: 'base_items',
    file: 'base.json',
    arrayKey: 'items',
    table: 'base_items',
    map: (b) => ({
      id: b.id,
      description: b.description || b.nome || '',
      type: nullIfEmpty(b.type || b.tipo),
      value: b.value || b.valor || 0,
      date: dateOrNull(b.date),
      notes: nullIfEmpty(b.notes || b.notas),
      allocations: JSON.stringify(Array.isArray(b.allocations) ? b.allocations : []),
      createdAt: b.createdAt || null,
      updatedAt: b.updatedAt || b.createdAt || null,
    }),
  },
  {
    name: 'doc_templates',
    file: 'doc_templates.json',
    arrayKey: 'templates',
    table: 'doc_templates',
    map: (t) => ({
      id: t.id,
      nome: t.nome || t.name || '',
      tipoDocumento: nullIfEmpty(t.tipoDocumento || t.tipo),
      empresaId: nullIfEmpty(t.empresaId),
      checklist: JSON.stringify(Array.isArray(t.checklist) ? t.checklist : []),
      periodicidadeMeses: Number.isFinite(parseInt(t.periodicidadeMeses)) ? parseInt(t.periodicidadeMeses) : 12,
      metadata: JSON.stringify(t.metadata || {}),
      createdAt: t.createdAt || null,
      updatedAt: t.updatedAt || t.createdAt || null,
    }),
  },
];

async function truncateAll(client) {
  // Ordem inversa do PIPELINE pra respeitar FKs
  const tables = PIPELINE.map((p) => p.table).reverse();
  console.log('⚠  TRUNCATE em:', tables.join(', '));
  await client.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

async function migrateStep(step) {
  if (ONLY && ONLY !== step.name) return { skipped: true };

  const json = readJSON(step.file);
  if (!json) {
    console.log(`  ⊘ ${step.name}: arquivo ${step.file} não encontrado`);
    return { ok: 0, skip: 0 };
  }
  const items = step.extract ? (step.extract(json) || []) : (json[step.arrayKey] || []);
  if (!items.length) {
    console.log(`  ∅ ${step.name}: 0 itens`);
    return { ok: 0, skip: 0 };
  }

  let ok = 0, skip = 0, fail = 0;
  for (const raw of items) {
    const row = step.map(raw);
    if (!row.id) { skip++; continue; }
    try {
      if (DRY) {
        ok++;
      } else {
        // upsert por id pra ser idempotente
        const keys = Object.keys(row);
        const cols = keys.map((k) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()));
        const placeholders = keys.map((_, i) => `$${i + 1}`);
        const values = keys.map((k) => row[k]);
        const updates = cols
          .filter((c) => c !== 'id')
          .map((c) => `${c} = EXCLUDED.${c}`);
        const sql = `
          INSERT INTO ${step.table} (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}
        `;
        await db.query(sql, values);
        ok++;
      }
    } catch (e) {
      fail++;
      console.error(`    ✗ ${step.name} id=${row.id}:`, e.message);
    }
  }
  console.log(`  ✓ ${step.name}: ${ok} ok, ${skip} skip, ${fail} fail`);
  return { ok, skip, fail };
}

async function main() {
  console.log('Rhino — Migração JSON → Postgres');
  console.log('  DATA_DIR    :', DATA_DIR);
  console.log('  DATABASE_URL:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@'));
  console.log('  --truncate  :', TRUNCATE);
  console.log('  --dry-run   :', DRY);
  console.log('  --only      :', ONLY || '(todas)');
  console.log('');

  if (!process.env.DATABASE_URL) {
    console.error('✗ DATABASE_URL não definida. Configure no .env.');
    process.exit(1);
  }

  try {
    await db.ping();
  } catch (e) {
    console.error('✗ Não consegui conectar no Postgres:', e.message);
    process.exit(1);
  }

  if (TRUNCATE && !DRY) {
    await db.withTransaction(async (client) => truncateAll(client));
  }

  let total = { ok: 0, fail: 0 };
  for (const step of PIPELINE) {
    const r = await migrateStep(step);
    total.ok += r.ok || 0;
    total.fail += r.fail || 0;
  }

  console.log('');
  console.log(`Resumo: ${total.ok} inseridos/atualizados, ${total.fail} falharam`);
  await db.close();
  process.exit(total.fail > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
