#!/usr/bin/env node
/**
 * Seed realista — popula 1 ano de operação completa.
 *
 * Uso:
 *   docker compose exec rhino node scripts/seed-realistic.js          # adiciona aos dados existentes
 *   docker compose exec rhino node scripts/seed-realistic.js --reset  # apaga tudo antes
 *
 * Cria:
 *   - 4 sócios
 *   - 12 clientes (indústria de celulose/papel BR)
 *   - 12 fornecedores
 *   - 18 recursos (colaboradores) com folgas, passagens, documentos
 *   - 4 níveis de acesso (já criados em schema.sql, complementa)
 *   - 8 tipos base
 *   - 6 itens base com alocações
 *   - 10 contratos (ativos + concluídos + distribuídos no ano)
 *   - Para cada contrato: budget completo, organograma (3-7 membros), RDOs diários
 *   - ~250 saídas/medições BM gerando NFs
 *   - ~80 contas a pagar (mix pago/pendente/vencido)
 *   - ~300 entradas/saídas de caixa
 *   - 3 investimentos
 *   - 5 doc templates
 */
const crypto = require('crypto');
const db = require('../db');
const repos = require('../db/repos');
const auth = require('../lib/auth');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');

// ============ Helpers ============
const today = new Date();
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function isoAt(daysOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() - daysOffset);
  return d.toISOString();
}
function rid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function fmtDate(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString().split('T')[0];
}
function isWeekend(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

// ============ Reset (opcional) ============
async function resetAll() {
  console.log('⚠  RESET: truncando todas as tabelas operacionais');
  // CASCADE em socios apagaria users (FK socio_id) — então zeramos socio_id antes.
  await db.query(`UPDATE users SET socio_id = NULL, nivel_acesso_id = NULL`);
  await db.query(`TRUNCATE rdos, organograma_membros, saidas, contas_pagar, notas_fiscais, caixa, investimentos, base_items, contracts, recursos, fornecedores, clientes, socios, doc_templates, tipos_base RESTART IDENTITY CASCADE`);
}

// ============ Sócios ============
async function seedSocios() {
  const socios = [
    { id: rid('soc'), name: 'Eduardo Pereira',  document: '123.456.789-00', email: 'eduardo@rhino.com.br',  phone: '(73) 98765-4321', participacao: 40, notes: 'Sócio fundador, responsável técnico CREA' },
    { id: rid('soc'), name: 'Roberto Silva',    document: '234.567.890-11', email: 'roberto@rhino.com.br',  phone: '(73) 98765-4322', participacao: 30, notes: 'Sócio diretor comercial' },
    { id: rid('soc'), name: 'Marcos Andrade',   document: '345.678.901-22', email: 'marcos@rhino.com.br',   phone: '(73) 98765-4323', participacao: 20, notes: 'Sócio operacional, gestão de obras' },
    { id: rid('soc'), name: 'Ana Beatriz Mota', document: '456.789.012-33', email: 'ana@rhino.com.br',      phone: '(73) 98765-4324', participacao: 10, notes: 'Sócia administrativa-financeira' },
  ];
  for (const s of socios) {
    s.createdAt = isoAt(380);
    s.updatedAt = isoAt(randInt(0, 60));
    await repos.socios.create(s);
  }
  console.log(`  ✓ socios: ${socios.length}`);
  return socios;
}

// ============ Clientes ============
async function seedClientes() {
  const clientes = [
    { nome: 'Eduardo Carvalho',      empresa: 'Veracel Celulose S.A.',   cargo: 'Gerente de Manutenção',     setor: 'Manutenção Industrial', telefone: '(73) 3293-1000', email: 'eduardo.carvalho@veracel.com.br',     endereco: 'Rod. BA-275, KM 24, Eunápolis - BA',         lat: '-16.3700', lng: '-39.5800', notas: 'Cliente desde 2020. Pagamento sempre em dia. Solicita BMs até dia 5 do mês.' },
    { nome: 'Marcelo Ferreira',      empresa: 'Eldorado Brasil',         cargo: 'Coordenador de Projetos',    setor: 'Engenharia',           telefone: '(67) 3252-7500', email: 'marcelo.ferreira@eldoradobrasil.com.br', endereco: 'Rod. MS-395, KM 20, Três Lagoas - MS',       lat: '-20.7500', lng: '-51.6788', notas: 'Cliente com grande potencial de expansão. Exige certificações ISO.' },
    { nome: 'Patrícia Lopes',        empresa: 'CMPC Celulose Riograndense', cargo: 'Supervisora de Contratos', setor: 'Suprimentos',         telefone: '(51) 3461-9100', email: 'patricia.lopes@cmpc.com',              endereco: 'Rua João Goulart 1500, Guaíba - RS',         lat: '-30.1144', lng: '-51.3242', notas: 'Pagamento em 60 dias. Documentação muito rigorosa.' },
    { nome: 'José Henrique Souza',   empresa: 'Bracell',                 cargo: 'Gerente Industrial',         setor: 'Operações',            telefone: '(13) 3826-1100', email: 'jose.souza@bracell.com',                endereco: 'Rod. Lençóis Paulista, KM 132, Lençóis - SP', lat: '-22.5984', lng: '-48.7900', notas: 'Multinacional Royal Golden Eagle. Contratos longos.' },
    { nome: 'Rafaela Mendes',        empresa: 'Klabin',                  cargo: 'Engenheira de Manutenção',   setor: 'Manutenção',           telefone: '(42) 3275-3000', email: 'rafaela.mendes@klabin.com.br',          endereco: 'Av. Brasil 18.655, Telêmaco Borba - PR',     lat: '-24.3267', lng: '-50.6175', notas: 'Maior cliente do portfólio. Múltiplos contratos simultâneos.' },
    { nome: 'Carlos Eduardo Pinto',  empresa: 'Suzano S.A.',             cargo: 'Diretor de Suprimentos',     setor: 'Compras',              telefone: '(11) 3503-9000', email: 'carlos.pinto@suzano.com.br',            endereco: 'Av. Brigadeiro Faria Lima 1.355, São Paulo - SP', lat: '-23.5739', lng: '-46.6920', notas: 'Empresa fusão Suzano+Fibria. Padronização de fornecedores.' },
    { nome: 'Mariana Castro',        empresa: 'Irani Papel e Embalagem', cargo: 'Compradora',                 setor: 'Suprimentos',          telefone: '(49) 3539-7000', email: 'mariana.castro@irani.com.br',           endereco: 'Rod. BR-153, KM 56, Vargem Bonita - SC',     lat: '-27.0050', lng: '-51.7430', notas: 'Pequenos contratos pontuais.' },
    { nome: 'Anderson Lima',         empresa: 'Westrock Brasil',         cargo: 'Gerente de Manutenção',      setor: 'Manutenção',           telefone: '(11) 3274-7000', email: 'anderson.lima@westrock.com',            endereco: 'Av. Marechal Mascarenhas de Moraes, Itaquaquecetuba - SP', lat: '-23.4866', lng: '-46.3486', notas: 'Pagamento sempre na data. Fácil aprovação de aditivos.' },
    { nome: 'Beatriz Carvalho',      empresa: 'International Paper',     cargo: 'Coordenadora',               setor: 'Engenharia',           telefone: '(19) 3539-1000', email: 'beatriz.carvalho@ipaper.com',           endereco: 'Av. Suíça 100, Mogi-Guaçu - SP',             lat: '-22.3700', lng: '-46.9420', notas: 'Multinacional americana. Exige inglês na documentação.' },
    { nome: 'Felipe Tavares',        empresa: 'Adami S.A.',              cargo: 'Comprador',                  setor: 'Suprimentos',          telefone: '(49) 3631-2000', email: 'felipe.tavares@adami.com.br',           endereco: 'Rod. SC-457, KM 6, Caçador - SC',            lat: '-26.7700', lng: '-51.0140', notas: 'Indústria madeireira. Volume médio.' },
    { nome: 'Daniela Moura',         empresa: 'Bonet Indústria',         cargo: 'Gestora de Contratos',       setor: 'Administrativo',       telefone: '(47) 3275-1500', email: 'daniela.moura@bonet.ind.br',            endereco: 'Rua dos Pinheiros 200, Rio Negrinho - SC',   lat: '-26.2580', lng: '-49.5200', notas: 'Cliente em prospecção desde 2025.' },
    { nome: 'Ricardo Almeida',       empresa: 'Cocelpa',                 cargo: 'Gerente de Projetos',        setor: 'Engenharia',           telefone: '(41) 3361-2700', email: 'ricardo.almeida@cocelpa.com.br',        endereco: 'Av. Souza Naves 5000, Araucária - PR',       lat: '-25.5930', lng: '-49.4090', notas: 'Cliente regional sul. Sazonalidade no Q2.' },
  ];
  const out = [];
  for (const c of clientes) {
    const id = rid('cli');
    const createdAt = isoAt(randInt(180, 360));
    const updatedAt = isoAt(randInt(0, 60));
    await repos.clientes.create({ id, ...c, createdAt, updatedAt });
    out.push({ id, ...c });
  }
  console.log(`  ✓ clientes: ${out.length}`);
  return out;
}

// ============ Fornecedores ============
async function seedFornecedores() {
  const fornecedores = [
    { nome: 'Casa do Aço Eunápolis Ltda',  cnpj: '12.345.678/0001-01', email: 'vendas@casadoaco.com.br',     telefone: '(73) 3261-2000', endereco: 'Av. Porto Seguro 500, Eunápolis - BA', pessoaContato: 'João Vendas',     materiais: ['Aço carbono','Chapas','Perfis','Vergalhões'], banco: 'Banco do Brasil', agencia: '1234-5', conta: '67890-1', chavePix: '12345678000101', notas: 'Entrega em 48h. Frete CIF acima de R$ 5.000.' },
    { nome: 'Soldas e Equipamentos BA',     cnpj: '23.456.789/0001-12', email: 'comercial@soldasba.com.br',   telefone: '(73) 3261-2100', endereco: 'Rua Industrial 200, Eunápolis - BA',    pessoaContato: 'Carla Atendimento', materiais: ['Eletrodos','Máquinas de solda','EPIs','Gases'], banco: 'Bradesco',        agencia: '0123-4', conta: '12345-6', chavePix: 'comercial@soldasba.com.br', notas: 'Locação de equipamentos disponível.' },
    { nome: 'Andaimes & Cia',               cnpj: '34.567.890/0001-23', email: 'locacao@andaimescia.com.br',  telefone: '(73) 3261-2200', endereco: 'Av. Industrial 1500, Itabuna - BA',     pessoaContato: 'Pedro Logística',   materiais: ['Andaimes','Escoramentos','Tapumes','Plataformas'], banco: 'Itaú',             agencia: '4567-8', conta: '78901-2', chavePix: '(73) 99999-1234', notas: 'Locação por dia ou mês. Mínimo 7 dias.' },
    { nome: 'Hidráulica Bahia',             cnpj: '45.678.901/0001-34', email: 'pedidos@hidraulicaba.com.br', telefone: '(71) 3214-7800', endereco: 'Rua Comércio 88, Salvador - BA',         pessoaContato: 'Lucas Pedidos',     materiais: ['Tubulação','Conexões','Válvulas','Bombas'], banco: 'Santander',        agencia: '7890-1', conta: '23456-7', chavePix: '11999988877', notas: 'Catálogo digital atualizado.' },
    { nome: 'Elétrica Industrial Ltda',     cnpj: '56.789.012/0001-45', email: 'vendas@eletricaind.com.br',   telefone: '(11) 4456-8000', endereco: 'Av. Industrial 5000, São Paulo - SP',    pessoaContato: 'Sandra Vendas',     materiais: ['Cabos','Disjuntores','Painéis','Motores'], banco: 'Caixa Econômica', agencia: '0099',   conta: '4455-6',  chavePix: '56789012000145', notas: 'Atende todo Brasil. Frete por conta do cliente.' },
    { nome: 'Lubrificantes Total',          cnpj: '67.890.123/0001-56', email: 'comercial@lubtotal.com.br',   telefone: '(11) 5586-9000', endereco: 'Rod. dos Bandeirantes KM 30, SP',       pessoaContato: 'Marcos Atend.',     materiais: ['Óleos','Graxas','Fluidos hidráulicos','Refrigerantes'], banco: 'Bradesco',  agencia: '1122-3', conta: '99887-7', chavePix: '67890123000156', notas: 'Linha completa Mobil/Shell.' },
    { nome: 'Rolamentos do Sul',            cnpj: '78.901.234/0001-67', email: 'vendas@rolamentosul.com.br',  telefone: '(51) 3327-4500', endereco: 'Av. Ipiranga 1300, Porto Alegre - RS',  pessoaContato: 'Fernanda Cmcl.',    materiais: ['Rolamentos','Buchas','Vedações','Selos mecânicos'], banco: 'Banrisul',   agencia: '0050',   conta: '88776-5', chavePix: '78901234000167', notas: 'Distribuidor SKF e NSK.' },
    { nome: 'Ferramentas Pro',              cnpj: '89.012.345/0001-78', email: 'pedidos@ferpro.com.br',       telefone: '(11) 2236-8800', endereco: 'Rua das Ferramentas 88, Diadema - SP',  pessoaContato: 'Juliana Pedidos',   materiais: ['Ferramentas manuais','Elétricas','Pneumáticas','EPIs'], banco: 'Itaú',         agencia: '3344-5', conta: '11223-4', chavePix: '89012345000178', notas: 'Marcas Bosch, Makita, Stanley.' },
    { nome: 'Transportadora Ramos',         cnpj: '90.123.456/0001-89', email: 'logistica@ramoslog.com.br',   telefone: '(73) 3299-7700', endereco: 'BR-101 KM 120, Itabuna - BA',           pessoaContato: 'Ricardo Operação',  materiais: ['Frete','Carreta','Caminhão truck','Munck'],   banco: 'Banco do Brasil', agencia: '5566-7', conta: '33445-5', chavePix: 'logistica@ramoslog.com.br', notas: 'Frota própria 12 caminhões.' },
    { nome: 'Tintas Ind. Norte-Sul',        cnpj: '01.234.567/0001-90', email: 'cmcl@tintasns.com.br',         telefone: '(11) 4488-2200', endereco: 'Rod. Anhanguera KM 40, Cajamar - SP',   pessoaContato: 'Eduardo Tintas',    materiais: ['Tintas','Solventes','Anticorrosivos','Pincéis'], banco: 'Bradesco',   agencia: '6677-8', conta: '55667-7', chavePix: '01234567000190', notas: 'Linha epóxi e poliuretano.' },
    { nome: 'Comercial Fixadores',          cnpj: '11.222.333/0001-44', email: 'vendas@cfixadores.com.br',     telefone: '(11) 2244-5500', endereco: 'Av. Atlântica 999, Guarulhos - SP',     pessoaContato: 'Aline Atend.',      materiais: ['Parafusos','Porcas','Arruelas','Anéis elásticos'], banco: 'Itaú',         agencia: '8899-0', conta: '77889-9', chavePix: '11222333000144', notas: 'Estoque em SP, entrega 24h interior.' },
    { nome: 'Gases Industriais Air-X',      cnpj: '22.333.444/0001-55', email: 'pedidos@airx.com.br',           telefone: '(11) 5599-7000', endereco: 'Rod. Castelo Branco KM 25, SP',         pessoaContato: 'Bruno Gases',       materiais: ['Oxigênio','Acetileno','Argônio','CO2'],          banco: 'Santander',  agencia: '4455-6', conta: '66778-8', chavePix: '22333444000155', notas: 'Cilindros locação ou venda.' },
  ];
  const out = [];
  for (const f of fornecedores) {
    const id = rid('for');
    const createdAt = isoAt(randInt(180, 360));
    const updatedAt = isoAt(randInt(0, 60));
    await repos.fornecedores.create({ id, ...f, materiais: JSON.stringify(f.materiais), createdAt, updatedAt });
    out.push({ id, ...f });
  }
  console.log(`  ✓ fornecedores: ${out.length}`);
  return out;
}

// ============ Recursos (colaboradores) ============
async function seedRecursos() {
  const profissoes = ['Mecânico Industrial', 'Soldador', 'Caldeireiro', 'Eletricista Industrial', 'Encanador', 'Pintor Industrial', 'Encarregado de Obra', 'Engenheiro Mecânico', 'Técnico de Segurança', 'Almoxarife'];
  const nomes = [
    ['Adriano Souza',     'M', '987.654.321-00'],
    ['Bruno Costa',       'M', '876.543.210-11'],
    ['Carlos Eduardo Lima','M', '765.432.109-22'],
    ['Daniel Pereira',    'M', '654.321.098-33'],
    ['Eduardo Santos',    'M', '543.210.987-44'],
    ['Fábio Oliveira',    'M', '432.109.876-55'],
    ['Gustavo Ribeiro',   'M', '321.098.765-66'],
    ['Henrique Alves',    'M', '210.987.654-77'],
    ['Isabela Martins',   'F', '109.876.543-88'],
    ['Jonas Pinto',       'M', '098.765.432-99'],
    ['Kelly Rodrigues',   'F', '198.765.432-10'],
    ['Lucas Ferreira',    'M', '298.765.432-11'],
    ['Marcos Cardoso',    'M', '398.765.432-12'],
    ['Natália Gomes',     'F', '498.765.432-13'],
    ['Otávio Mendes',     'M', '598.765.432-14'],
    ['Patrícia Barros',   'F', '698.765.432-15'],
    ['Rafael Moura',      'M', '798.765.432-16'],
    ['Sabrina Tavares',   'F', '898.765.432-17'],
  ];
  const out = [];
  for (let i = 0; i < nomes.length; i++) {
    const [nome, genero, cpf] = nomes[i];
    const profissao = profissoes[i % profissoes.length];
    const isAtivo = i < 14; // 14 ativos, 4 desligados
    const dataAdmissao = daysAgo(randInt(60, 720));
    const dataDesligamento = isAtivo ? null : daysAgo(randInt(10, 90));
    const recurso = {
      id: rid('rec'),
      nome,
      cpf,
      dataNascimento: daysAgo(randInt(8000, 16000)),
      genero,
      telefone: `(73) 9${randInt(8000,9999)}-${randInt(1000,9999)}`,
      email: nome.toLowerCase().split(' ')[0] + '.' + nome.toLowerCase().split(' ').pop() + '@rhino.com.br',
      endereco: pick(['Rua das Flores 123', 'Av. Beira Mar 500', 'Rua dos Coqueiros 88', 'Rua Industrial 200', 'Av. Central 1000']) + ', Eunápolis - BA',
      lat: '-16.3700', lng: '-39.5800',
      status: isAtivo ? 'funcionario' : 'desligado',
      profissao,
      dataAdmissao,
      salario: randInt(2200, 8500) + 0.5,
      cnh: i % 3 === 0 ? `${randInt(10000000000, 99999999999)}` : '',
      pis: `${randInt(100, 999)}.${randInt(10000, 99999)}.${randInt(10, 99)}-${randInt(0,9)}`,
      dataDesligamento,
      motivoDesligamento: dataDesligamento ? pick(['Pedido próprio', 'Justa causa', 'Acordo', 'Fim de contrato']) : '',
      obsDesligamento: dataDesligamento ? 'Quitação em dia. Termo de rescisão assinado.' : '',
      notas: `Profissional ${profissao.toLowerCase()} com experiência. Iniciou em ${dataAdmissao}.`,
      rdoCategoria: profissao.includes('Engenheiro') || profissao.includes('Encarregado') || profissao.includes('Técnico') ? 'moi' : 'mod',
      alocacaoAtual: null,
      historicoAlocacoes: '[]',
      folgas: '[]',
      documentos: '[]',
      createdAt: isoAt(randInt(180, 720)),
      updatedAt: isoAt(randInt(0, 60)),
    };
    await repos.recursos.create(recurso);
    out.push(recurso);
  }
  console.log(`  ✓ recursos: ${out.length}`);
  return out;
}

// ============ Tipos Base ============
async function seedTiposBase() {
  // Usa upsert direto pra não duplicar tipos do sistema
  const tipos = [
    { id: 'fixo',     key: 'fixo',     label: 'Fixo',           icon: '🏢', cor: '#3b82f6', sistema: true },
    { id: 'variavel', key: 'variavel', label: 'Variável',       icon: '📊', cor: '#10b981', sistema: true },
    { id: 'outros',   key: 'outros',   label: 'Outros',         icon: '📦', cor: '#718096', sistema: true },
    { id: rid('tpb'), key: 'aluguel',  label: 'Aluguel',         icon: '🏠', cor: '#f59e0b', sistema: false },
    { id: rid('tpb'), key: 'salarios', label: 'Salários',        icon: '💼', cor: '#8b5cf6', sistema: false },
    { id: rid('tpb'), key: 'utilidades', label: 'Utilidades',    icon: '⚡', cor: '#06b6d4', sistema: false },
    { id: rid('tpb'), key: 'marketing', label: 'Marketing',      icon: '📣', cor: '#ec4899', sistema: false },
    { id: rid('tpb'), key: 'tecnologia', label: 'Tecnologia',    icon: '💻', cor: '#14b8a6', sistema: false },
  ];
  for (const t of tipos) {
    await db.query(
      `INSERT INTO tipos_base (id, key, label, icon, cor, sistema) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, cor = EXCLUDED.cor`,
      [t.id, t.key, t.label, t.icon, t.cor, t.sistema]
    );
  }
  console.log(`  ✓ tipos_base: ${tipos.length}`);
  return tipos;
}

// ============ Base Items ============
async function seedBaseItems(tipos) {
  const items = [
    { description: 'Aluguel sede administrativa Eunápolis',   type: 'aluguel',     value: 4500.00,  notes: 'Contrato 12 meses, reajuste IGPM' },
    { description: 'Salários equipe administrativa fixa',     type: 'salarios',    value: 28500.00, notes: '5 colaboradores administrativos' },
    { description: 'Energia elétrica + internet sede',        type: 'utilidades',  value: 1850.00,  notes: 'Cemig + Vivo Empresas' },
    { description: 'Marketing digital + redes sociais',       type: 'marketing',   value: 2200.00,  notes: 'Agência terceirizada Q2-Q4' },
    { description: 'Sistemas e softwares (ERP, AutoCAD)',      type: 'tecnologia',  value: 3400.00,  notes: 'TOTVS + Autodesk + Microsoft 365' },
    { description: 'Manutenção frota e seguros',              type: 'fixo',        value: 5800.00,  notes: 'Mensal médio. Variável por mês.' },
  ];
  const out = [];
  for (const i of items) {
    const id = rid('bas');
    await repos.baseItems.create({
      id,
      description: i.description,
      type: i.type,
      value: i.value,
      date: daysAgo(randInt(180, 360)),
      notes: i.notes,
      allocations: '[]',
      createdAt: isoAt(randInt(180, 360)),
      updatedAt: isoAt(randInt(0, 60)),
    });
    out.push({ id, ...i });
  }
  console.log(`  ✓ base_items: ${out.length}`);
  return out;
}

// ============ Doc Templates ============
async function seedDocTemplates() {
  const templates = [
    { nome: 'NR-10 — Segurança em Eletricidade',   tipoDocumento: 'nr10',       periodicidadeMeses: 24, checklist: ['Curso básico','Reciclagem bienal','Certificado válido'] },
    { nome: 'NR-35 — Trabalho em Altura',           tipoDocumento: 'nr35',       periodicidadeMeses: 24, checklist: ['Curso 8h','Reciclagem','Atestado médico ASO'] },
    { nome: 'ASO — Atestado de Saúde Ocupacional',  tipoDocumento: 'aso',        periodicidadeMeses: 12, checklist: ['Exame admissional','Periódico','Audiometria','Acuidade visual'] },
    { nome: 'ART — Anotação de Resp. Técnica',      tipoDocumento: 'art',        periodicidadeMeses: 12, checklist: ['Recolhimento CREA','Vinculação ao contrato'] },
    { nome: 'CNH categoria D/E',                    tipoDocumento: 'cnh',        periodicidadeMeses: 60, checklist: ['Exame médico','Toxicológico','Renovação'] },
  ];
  const out = [];
  for (const t of templates) {
    const id = rid('tpl');
    await repos.docTemplates.create({
      id,
      nome: t.nome,
      tipoDocumento: t.tipoDocumento,
      empresaId: null,
      checklist: JSON.stringify(t.checklist),
      periodicidadeMeses: t.periodicidadeMeses,
      createdAt: isoAt(randInt(300, 365)),
      updatedAt: isoAt(randInt(0, 60)),
    });
    out.push({ id, ...t });
  }
  console.log(`  ✓ doc_templates: ${out.length}`);
  return out;
}

// ============ Documentos por recurso ============
async function seedDocumentos(recursos, templates) {
  let count = 0;
  for (const rec of recursos) {
    if (rec.status !== 'funcionario') continue;
    const docs = [];
    // ASO obrigatório pra todos
    docs.push({
      id: rid('doc'),
      tipo: 'aso',
      tipoLabel: 'ASO',
      dataEmissao: daysAgo(randInt(30, 360)),
      dataVencimento: daysAgo(-randInt(30, 350)), // futuro
      responsavel: 'Dra. Carla Mendes — CRM 12345',
      resultado: 'Apto',
      observacoes: 'Sem restrições.',
      nomeArquivo: `aso_${rec.nome.replace(/\s+/g,'_').toLowerCase()}.pdf`,
      createdAt: isoAt(randInt(30, 360)),
      updatedAt: isoAt(randInt(0, 30)),
    });
    // NR35 pros que têm CNH ou trabalham em altura
    if (rec.cnh || /Soldador|Pintor|Caldeireiro/.test(rec.profissao)) {
      docs.push({
        id: rid('doc'),
        tipo: 'nr35',
        tipoLabel: 'NR-35',
        dataEmissao: daysAgo(randInt(60, 700)),
        dataVencimento: daysAgo(-randInt(30, 700)),
        responsavel: 'Centro de Treinamentos SESI',
        resultado: 'Aprovado',
        observacoes: 'Curso de 8h presencial concluído.',
        nomeArquivo: `nr35_${rec.nome.replace(/\s+/g,'_').toLowerCase()}.pdf`,
        createdAt: isoAt(randInt(60, 700)),
        updatedAt: isoAt(randInt(0, 30)),
      });
    }
    // NR10 pros eletricistas
    if (/Eletricista/.test(rec.profissao)) {
      docs.push({
        id: rid('doc'),
        tipo: 'nr10',
        tipoLabel: 'NR-10',
        dataEmissao: daysAgo(randInt(60, 700)),
        dataVencimento: daysAgo(-randInt(15, 600)),
        responsavel: 'SENAI',
        resultado: 'Aprovado',
        observacoes: 'Curso básico + complementar SEP.',
        nomeArquivo: `nr10_${rec.nome.replace(/\s+/g,'_').toLowerCase()}.pdf`,
        createdAt: isoAt(randInt(60, 700)),
        updatedAt: isoAt(randInt(0, 30)),
      });
    }
    // Folgas (1-3 por recurso)
    const folgas = [];
    const numFolgas = randInt(1, 3);
    for (let i = 0; i < numFolgas; i++) {
      const ini = daysAgo(randInt(-30, 300));
      const fim = new Date(ini); fim.setDate(fim.getDate() + randInt(2, 7));
      const fimStr = fim.toISOString().split('T')[0];
      folgas.push({
        id: rid('fol'),
        dataInicio: ini,
        dataFim: fimStr,
        observacoes: pick(['Folga programada','Visita à família','Assunto pessoal','Recuperação']),
        passagemIda: { comprada: i === 0, valor: i === 0 ? randInt(150, 600) : 0, dataCompra: i === 0 ? daysAgo(randInt(20, 200)) : null, financiadoPor: 'contrato', contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
        passagemVolta: { comprada: i === 0, valor: i === 0 ? randInt(150, 600) : 0, dataCompra: i === 0 ? daysAgo(randInt(20, 200)) : null, financiadoPor: 'contrato', contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
        createdAt: isoAt(randInt(20, 200)),
      });
    }
    await repos.recursos.updateById(rec.id, {
      documentos: JSON.stringify(docs),
      folgas: JSON.stringify(folgas),
    });
    count += docs.length + folgas.length;
  }
  console.log(`  ✓ documentos+folgas: ${count}`);
}

// ============ Contratos ============
async function seedContracts(clientes) {
  const tipos = [
    'Manutenção Preventiva', 'Manutenção Corretiva', 'Reforma', 'Montagem', 'Expansão',
    'Reparo Estrutural', 'Comissionamento', 'Parada Programada', 'Instalação', 'Modernização',
  ];
  const escopos = [
    'Linha de Fibra','Digestor','Caldeira','Secadora','Pátio de Madeira',
    'Sistema de Utilidades','Recuperação Química','Sistema de Vapor','Esteiras Transportadoras','Tanques de Estocagem',
  ];
  const out = [];
  // 10 contratos com fases diferentes
  const setups = [
    { ageStart: 360, duration: 120, status: 'concluido' },   // ano todo já passou — concluído
    { ageStart: 320, duration: 100, status: 'concluido' },
    { ageStart: 280, duration: 90,  status: 'concluido' },
    { ageStart: 240, duration: 180, status: 'ativo' },        // ainda em execução
    { ageStart: 200, duration: 150, status: 'ativo' },
    { ageStart: 150, duration: 120, status: 'ativo' },
    { ageStart: 90,  duration: 200, status: 'ativo' },
    { ageStart: 60,  duration: 240, status: 'ativo' },
    { ageStart: 30,  duration: 90,  status: 'ativo' },
    { ageStart: 10,  duration: 180, status: 'ativo' },
  ];
  for (let i = 0; i < setups.length; i++) {
    const s = setups[i];
    const cli = pick(clientes);
    const tipo = tipos[i % tipos.length];
    const escopo = escopos[i % escopos.length];
    const startDate = daysAgo(s.ageStart);
    const endDate = daysAgo(s.ageStart - s.duration);
    const value = randInt(150_000, 1_500_000);
    const id = rid('ctr');
    const contract = {
      id,
      name: `${tipo} ${escopo} — ${cli.empresa.split(' ')[0]}`,
      contractNumber: `CT-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
      client: cli.empresa,
      clientId: cli.id,
      clientDocument: `${randInt(10,99)}.${randInt(100,999)}.${randInt(100,999)}/0001-${randInt(10,99)}`,
      clientEmail: cli.email,
      clientPhone: cli.telefone,
      value,
      currency: 'BRL',
      startDate,
      endDate,
      tendencyDate: daysAgo(s.ageStart + 30),
      status: s.status,
      endereco: cli.endereco,
      lat: cli.lat, lng: cli.lng,
      notes: `Contrato ${tipo.toLowerCase()} firmado com ${cli.empresa}. Escopo: ${escopo.toLowerCase()}. Pagamento por BMs mensais.`,
      budget: '[]',
      createdAt: isoAt(s.ageStart),
      updatedAt: isoAt(randInt(0, 60)),
    };
    await repos.contracts.create(contract);
    // Budget items (3-5 por contrato)
    const numBud = randInt(3, 5);
    const budget = [];
    let restante = value;
    for (let j = 0; j < numBud; j++) {
      const isLast = j === numBud - 1;
      const valor = isLast ? Math.max(1, restante) : Math.floor(restante / (numBud - j) * (0.7 + Math.random() * 0.5));
      restante -= valor;
      budget.push({
        id: rid('bud'),
        contractId: id,
        description: pick(['Mão de obra direta','Materiais','Equipamentos','Subcontratação','Outros custos']),
        type: pick(['mao_de_obra','material','equipamento','servico','outros']),
        value: valor,
        notes: '',
        createdAt: isoAt(s.ageStart - 1),
      });
    }
    await db.query(`UPDATE contracts SET budget = $2 WHERE id = $1`, [id, JSON.stringify(budget)]);
    out.push({ ...contract, budget });
  }
  console.log(`  ✓ contracts: ${out.length} (com budget)`);
  return out;
}

// ============ Organograma + Alocação atual ============
async function seedOrganograma(contracts, recursos) {
  const ativos = recursos.filter(r => r.status === 'funcionario');
  let count = 0;
  // Mapa recursoId → { contractId, dataInicio, cicloTrabalho }
  const alocacoes = {};
  for (const c of contracts) {
    if (c.status === 'concluido') continue;
    const team = [...ativos].sort(() => Math.random() - 0.5).slice(0, 6);
    if (team.length < 3) continue;
    const baseTime = isoAt(60);
    const encId = rid('org'), lid1Id = rid('org'), lid2Id = rid('org');
    const [enc, lid1, lid2, ...profs] = team;
    await repos.organograma.create({ id: encId,  contractId: c.id, recursoId: enc.id,  nivel: 'encarregado', cargo: 'Encarregado de Obra', supervisorId: null, area: null, createdAt: baseTime });
    await repos.organograma.create({ id: lid1Id, contractId: c.id, recursoId: lid1.id, nivel: 'lider_area',  cargo: 'Líder Mecânica',     supervisorId: null, area: 'Mecânica',     createdAt: baseTime });
    await repos.organograma.create({ id: lid2Id, contractId: c.id, recursoId: lid2.id, nivel: 'lider_area',  cargo: 'Líder Elétrica',     supervisorId: null, area: 'Elétrica',     createdAt: baseTime });
    count += 3;
    for (const p of profs) {
      await repos.organograma.create({ id: rid('org'), contractId: c.id, recursoId: p.id, nivel: 'profissional', cargo: p.profissao, supervisorId: pick([lid1Id, lid2Id]), area: null, createdAt: baseTime });
      count++;
    }
    // Registra alocação atual: primeiro alocado ganha (se recurso já tinha alocação, mantém a primeira)
    for (const m of team) {
      if (!alocacoes[m.id]) {
        alocacoes[m.id] = {
          contractId: c.id,
          dataInicio: c.startDate,
          cicloTrabalho: pick([15, 21, 21, 28]),
        };
      }
    }
  }
  // Atualiza recursos com alocacaoAtual e folgas futuras baseadas no ciclo
  let alocCount = 0;
  for (const rec of recursos) {
    if (rec.status !== 'funcionario') continue;
    const aloc = alocacoes[rec.id];
    if (!aloc) continue;
    // Calcula uma folga passada (última) + uma futura (próxima) baseadas no ciclo
    const ciclo = aloc.cicloTrabalho;
    const diasDesdeInicio = Math.floor((today - new Date(aloc.dataInicio)) / 86400000);
    const ciclosCompletos = Math.max(0, Math.floor(diasDesdeInicio / ciclo));
    const folgas = [];
    for (let k = 0; k < Math.min(ciclosCompletos, 2); k++) {
      const iniDate = new Date(aloc.dataInicio);
      iniDate.setDate(iniDate.getDate() + (k + 1) * ciclo);
      const fimDate = new Date(iniDate);
      fimDate.setDate(fimDate.getDate() + 7);
      if (fimDate < today) {
        folgas.push({
          id: rid('fol'),
          dataInicio: iniDate.toISOString().split('T')[0],
          dataFim: fimDate.toISOString().split('T')[0],
          observacoes: 'Folga programada conforme ciclo',
          passagemIda:   { comprada: true,  valor: randInt(250, 700), dataCompra: iniDate.toISOString().split('T')[0], financiadoPor: 'contrato', contractIdPagador: aloc.contractId, caixaEntryId: null, contaPagarId: null },
          passagemVolta: { comprada: true,  valor: randInt(250, 700), dataCompra: iniDate.toISOString().split('T')[0], financiadoPor: 'contrato', contractIdPagador: aloc.contractId, caixaEntryId: null, contaPagarId: null },
          createdAt: iniDate.toISOString(),
        });
      }
    }
    // Próxima folga (futuro): projeta ciclos a partir do início até passar de hoje
    const proxIni = new Date(aloc.dataInicio);
    let safety = 0;
    while (proxIni <= today && safety++ < 200) {
      proxIni.setDate(proxIni.getDate() + ciclo);
    }
    if (proxIni > today) {
      const proxFim = new Date(proxIni);
      proxFim.setDate(proxFim.getDate() + 7);
      folgas.push({
        id: rid('fol'),
        dataInicio: proxIni.toISOString().split('T')[0],
        dataFim: proxFim.toISOString().split('T')[0],
        observacoes: 'Próxima folga prevista',
        passagemIda:   { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
        passagemVolta: { comprada: false, valor: 0, dataCompra: null, financiadoPor: null, contractIdPagador: null, caixaEntryId: null, contaPagarId: null },
        createdAt: isoAt(5),
      });
    }
    await repos.recursos.updateById(rec.id, {
      alocacaoAtual: JSON.stringify(aloc),
      folgas: JSON.stringify(folgas),
      historicoAlocacoes: JSON.stringify([aloc]),
    });
    alocCount++;
  }
  console.log(`  ✓ organograma: ${count} membros | alocações atuais: ${alocCount}`);
}

// ============ RDOs (diários nos contratos ativos) ============
async function seedRdos(contracts) {
  let count = 0;
  for (const c of contracts) {
    if (c.status !== 'ativo') continue;
    // Gera RDOs de startDate até hoje, em dias úteis (com algumas faltas pra realidade)
    const start = new Date(c.startDate);
    const end = new Date();
    let numero = 1;
    let cursor = new Date(start);
    while (cursor <= end) {
      if (!isWeekend(cursor) && Math.random() > 0.05) { // 5% de "esquecimento"
        const dataStr = cursor.toISOString().split('T')[0];
        await repos.rdos.create({
          id: rid('rdo'),
          contractId: c.id,
          numero: String(numero++),
          data: dataStr,
          diaSemana: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][cursor.getDay()],
          osNumero: `OS-${randInt(1000,9999)}`,
          ordemCompra: `OC-${randInt(10000,99999)}`,
          projeto: c.name,
          prazo: JSON.stringify({ dataInicial: c.startDate, contratual: 120, decorrido: numero, faltante: 120 - numero, pctConcluida: Math.min(100, Math.floor(numero / 1.2)) }),
          tempo: JSON.stringify({ manha: { tempo: pick(['bom','nublado','chuva']), condicoes: pick(['operavel','operavel','parcial']) }, tarde: { tempo: pick(['bom','nublado']), condicoes: 'operavel' }, noiteAnt: { tempo: 'bom', condicoes: 'operavel' }, precipitacao: randInt(0,15) }),
          periodoTrabalho: '7:00 às 17:00',
          horaExtra: Math.random() > 0.7 ? 'true' : 'false',
          moi: JSON.stringify([{ cargo: 'Encarregado', quantidade: 1, horas: 8 }]),
          mod: JSON.stringify([{ cargo: 'Soldador',    quantidade: randInt(2,5), horas: 8 }, { cargo: 'Mecânico', quantidade: randInt(2,4), horas: 8 }]),
          terc: JSON.stringify([]),
          equipamentos: JSON.stringify([{ nome: 'Munck', quantidade: 1, horasOperando: randInt(2,8) }, { nome: 'Andaime', quantidade: 5, horasOperando: 8 }]),
          atividades: JSON.stringify([{ descricao: pick(['Montagem','Solda','Pintura','Instalação','Inspeção','Limpeza']) + ' — área ' + pick(['A','B','C']), pctExecutado: randInt(30, 100) }]),
          seguranca: JSON.stringify({ acidente: 'nao_houve', diagnostico: '', admissoes: 0, demissoes: 0, comentarios: '' }),
          fiscalizacaoComentarios: pick(['Sem ocorrências.','Liberação aprovada pela fiscalização.','Atendido escopo do dia.','']),
          totais: JSON.stringify({ moi: 8, mod: 32, terc: 0, eqp: 16, homensHora: 40, horasParadas: 0, equipamentoHora: 16 }),
          fotos: '[]',
          createdAt: cursor.toISOString(),
          updatedAt: cursor.toISOString(),
        });
        count++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  console.log(`  ✓ rdos: ${count}`);
}

// ============ Saídas (BMs) → NFs ============
async function seedSaidas(contracts) {
  let countSaidas = 0;
  let countNFs = 0;
  for (const c of contracts) {
    // BMs mensais ao longo da duração
    const start = new Date(c.startDate);
    const end = c.status === 'concluido' ? new Date(c.endDate) : new Date();
    let cursor = new Date(start.getFullYear(), start.getMonth() + 1, 5); // dia 5 do mês seguinte ao início
    let bmNum = 1;
    let totalEmitido = 0;
    while (cursor <= end && totalEmitido < c.value * 0.95) {
      const valorMes = Math.min(
        c.value * 0.95 - totalEmitido,
        c.value / Math.max(1, Math.ceil((end - start) / (30 * 86400000))) * (0.8 + Math.random() * 0.4)
      );
      if (valorMes < 1000) break;
      const nfId = rid('nf');
      const dataLimite = cursor.toISOString().split('T')[0];
      const numeroBM = `BM-${String(bmNum).padStart(3, '0')}`;
      const emitida = c.status === 'concluido' || Math.random() > 0.3;
      const dataEmissaoReal = emitida ? dataLimite : null;
      const prazo = pick([15, 30, 30, 30, 45, 60]);
      await repos.notasFiscais.create({
        id: nfId,
        numero: numeroBM,
        contractId: c.id,
        dataLimite,
        valor: Math.round(valorMes * 100) / 100,
        prazoRecebimento: prazo,
        observacoes: `Medição mensal ${cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} — ${c.name}`,
        emitida,
        dataEmissaoReal,
        caixaEntryId: null,
        createdAt: cursor.toISOString(),
        updatedAt: cursor.toISOString(),
      });
      countNFs++;
      // Saída associada à NF (cada BM tem 1-3 saídas que somam o valor)
      const numSaidas = randInt(1, 3);
      let restante = valorMes;
      for (let i = 0; i < numSaidas; i++) {
        const valorSaida = i === numSaidas - 1 ? restante : Math.floor(restante / (numSaidas - i) * (0.7 + Math.random() * 0.6));
        restante -= valorSaida;
        await repos.saidas.create({
          id: rid('sai'),
          contractId: c.id,
          type: pick(['mao_de_obra','material','equipamento','servico']),
          description: pick(['Medição parcial','Serviços executados','Materiais aplicados','Mão de obra do período']) + ' — ' + cursor.toLocaleDateString('pt-BR', { month: 'short' }),
          value: Math.round(valorSaida * 100) / 100,
          date: dataLimite,
          nfId,
          numeroBm: numeroBM,
          createdAt: cursor.toISOString(),
        });
        countSaidas++;
      }
      // Se NF emitida → cria entrada de caixa prevista
      if (emitida) {
        const dt = new Date(dataEmissaoReal);
        dt.setDate(dt.getDate() + prazo);
        await repos.caixa.create({
          id: rid('cxa'),
          type: 'entrada',
          description: `Recebimento NF ${numeroBM} - ${c.client}`,
          value: Math.round(valorMes * 100) / 100,
          date: dt.toISOString().split('T')[0],
          contractId: c.id,
          baseItemId: null,
          category: 'nota_fiscal',
          notes: `NF ${numeroBM} emitida em ${dataEmissaoReal}, prazo ${prazo} dias`,
          formaPagamento: null,
          contaPagarId: null,
          nfId,
          createdAt: cursor.toISOString(),
        });
      }
      totalEmitido += valorMes;
      cursor.setMonth(cursor.getMonth() + 1);
      bmNum++;
    }
  }
  console.log(`  ✓ saidas: ${countSaidas} (NFs: ${countNFs})`);
}

// ============ Contas a Pagar ============
async function seedContasPagar(fornecedores, contracts) {
  let count = 0;
  // Distribui ao longo do ano: ~80 contas
  for (let i = 0; i < 80; i++) {
    const f = pick(fornecedores);
    const c = pick(contracts);
    const idade = randInt(0, 350);
    const dataEmissao = daysAgo(idade);
    const dataVencimento = daysAgo(idade - randInt(15, 60));
    const valor = randInt(800, 25000);
    // Status: 60% pagas, 25% pendentes, 15% vencidas (vencimento < hoje)
    const r = Math.random();
    let status, dataPagamento = null, valorPago = null, formaPagamento = null, caixaEntryId = null;
    if (r < 0.6) {
      status = 'pago';
      dataPagamento = daysAgo(idade - randInt(15, 50));
      valorPago = valor;
      formaPagamento = pick(['PIX','Boleto','Transferência','Cartão']);
      caixaEntryId = rid('cxa');
    } else if (r < 0.85) {
      status = 'pendente';
    } else {
      status = 'pendente'; // já vencida (vencimento passado)
    }
    const id = rid('cp');
    await repos.contasPagar.create({
      id,
      descricao: `${pick(['Compra de','Aquisição de','Fornecimento de','Serviço de'])} ${pick(f.materiais)} — ${pick(['Lote','OC','Pedido'])} #${randInt(100,999)}`,
      fornecedorId: f.id,
      numeroNF: `${randInt(1000,9999)}/${randInt(2024,2026).toString().slice(-2)}`,
      valor,
      dataEmissao,
      dataVencimento,
      status,
      dataPagamento,
      caixaEntryId,
      contractId: Math.random() > 0.3 ? c.id : null,
      category: pick(['fornecedor','servico','material','equipamento']),
      observacoes: pick(['Aprovado pelo fiscal','OC autorizada','Conforme contrato','']),
      valorPago,
      formaPagamento,
      createdAt: isoAt(idade),
      updatedAt: isoAt(randInt(0, idade)),
    });
    if (caixaEntryId && dataPagamento) {
      await repos.caixa.create({
        id: caixaEntryId,
        type: 'saida',
        description: `Pagamento ${f.nome} — NF ${randInt(1000,9999)}`,
        value: valorPago,
        date: dataPagamento,
        contractId: Math.random() > 0.3 ? c.id : null,
        baseItemId: null,
        category: pick(['fornecedor','servico','material']),
        notes: `Pagamento via ${formaPagamento}`,
        formaPagamento,
        contaPagarId: id,
        nfId: null,
        createdAt: new Date(dataPagamento).toISOString(),
      });
    }
    count++;
  }
  console.log(`  ✓ contas_pagar: ${count}`);
}

// ============ Caixa avulso (folha, despesas administrativas) ============
async function seedCaixaAvulso() {
  let count = 0;
  // Folha de pagamento mensal nos últimos 12 meses
  for (let m = 0; m < 12; m++) {
    const date = new Date(today); date.setMonth(date.getMonth() - m); date.setDate(5);
    if (date > today) continue;
    await repos.caixa.create({
      id: rid('cxa'),
      type: 'saida',
      description: `Folha de pagamento ${date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
      value: 28500 + randInt(-2000, 4000),
      date: date.toISOString().split('T')[0],
      contractId: null,
      baseItemId: null,
      category: 'salarios',
      notes: 'Pagamento de salários equipe administrativa',
      formaPagamento: 'Transferência',
      contaPagarId: null,
      nfId: null,
      createdAt: date.toISOString(),
    });
    count++;
    // Aluguel + utilidades
    await repos.caixa.create({
      id: rid('cxa'),
      type: 'saida',
      description: `Aluguel sede + utilidades ${date.toLocaleDateString('pt-BR', { month: 'short' })}`,
      value: 4500 + randInt(1500, 2200),
      date: date.toISOString().split('T')[0],
      contractId: null,
      baseItemId: null,
      category: 'aluguel',
      notes: '',
      formaPagamento: 'Boleto',
      contaPagarId: null,
      nfId: null,
      createdAt: date.toISOString(),
    });
    count++;
  }
  console.log(`  ✓ caixa avulso: ${count}`);
}

// ============ Investimentos / Aportes ============
async function seedInvestimentos(socios) {
  const aportes = [
    { socioId: socios[0].id, value: 50000,  description: 'Aporte inicial de capital de giro',     date: daysAgo(340), origem: 'socio',         destino: 'contrato' },
    { socioId: socios[1].id, value: 35000,  description: 'Reforço para compra de equipamentos',    date: daysAgo(180), origem: 'socio',         destino: 'base' },
    { socioId: null,         value: 25000,  description: 'Aquisição de software ERP',              date: daysAgo(90),  origem: 'caixa_empresa', destino: 'base' },
  ];
  for (const a of aportes) {
    const id = rid('ap');
    await repos.investimentos.create({
      id,
      socioId: a.socioId,
      value: a.value,
      date: a.date,
      description: a.description,
      origem: a.origem,
      destino: a.destino,
      baseType: 'tecnologia',
      contractId: null,
      baseItemId: null,
      caixaEntryId: null,
      metadata: '{}',
      createdAt: new Date(a.date).toISOString(),
      updatedAt: new Date(a.date).toISOString(),
    });
  }
  console.log(`  ✓ investimentos: ${aportes.length}`);
}

// ============ Main ============
async function main() {
  console.log('Rhino — Seed Realista (1 ano de operação)\n');
  if (RESET) await resetAll();
  console.log('Populando dados...\n');
  const socios       = await seedSocios();
  const tipos        = await seedTiposBase();
  const baseItems    = await seedBaseItems(tipos);
  const templates    = await seedDocTemplates();
  const clientes     = await seedClientes();
  const fornecedores = await seedFornecedores();
  const recursos     = await seedRecursos();
  await seedDocumentos(recursos, templates);
  const contracts    = await seedContracts(clientes);
  await seedOrganograma(contracts, recursos);
  await seedRdos(contracts);
  await seedSaidas(contracts);
  await seedContasPagar(fornecedores, contracts);
  await seedCaixaAvulso();
  await seedInvestimentos(socios);
  console.log('\n✓ Seed concluído.');
  await db.close();
}

main().catch(e => {
  console.error('✗ Erro:', e.message);
  console.error(e.stack);
  process.exit(1);
});
