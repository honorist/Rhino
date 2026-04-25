const http = require('http');

const BASE = { host: 'localhost', port: 3001 };

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      ...BASE,
      path,
      method,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {}
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const clientes = [
  { nome: 'João Silva',      empresa: 'Klabin',                       cargo: 'Gerente de Manutenção', setor: 'Manutenção',  telefone: '(42) 99999-0001', email: 'joao.silva@klabin.com.br',  endereco: 'Telêmaco Borba, Paraná, Brasil',                 lat: '-24.3239', lng: '-50.6156' },
  { nome: 'Maria Santos',    empresa: 'Bracell',                      cargo: 'Coordenadora de Projetos', setor: 'Projetos', telefone: '(14) 99999-0002', email: 'maria.santos@bracell.com',   endereco: 'Lençóis Paulista, São Paulo, Brasil',            lat: '-22.5983', lng: '-48.8064' },
  { nome: 'Carlos Oliveira', empresa: 'CMPC Celulose Riograndense',   cargo: 'Engenheiro Sênior',      setor: 'Engenharia',  telefone: '(51) 99999-0003', email: 'carlos.oliveira@cmpc.com.br',endereco: 'Guaíba, Rio Grande do Sul, Brasil',              lat: '-30.1137', lng: '-51.3247' },
  { nome: 'Ana Pereira',     empresa: 'Eldorado Brasil',              cargo: 'Superintendente Operacional', setor: 'Operação', telefone: '(67) 99999-0004', email: 'ana.pereira@eldoradobrasil.com.br', endereco: 'Três Lagoas, Mato Grosso do Sul, Brasil',  lat: '-20.7512', lng: '-51.6783' },
  { nome: 'Roberto Costa',   empresa: 'Veracel Celulose',             cargo: 'Líder de Contratos',     setor: 'Suprimentos', telefone: '(73) 99999-0005', email: 'roberto.costa@veracel.com.br',endereco: 'Eunápolis, Bahia, Brasil',                      lat: '-16.3711', lng: '-39.5819' }
];

const contratosDef = [
  { name: 'Manutenção Preventiva - Utilidades',   value: 10000, start: '2026-05-01', end: '2026-05-31', docPrefix: 'KLA' },
  { name: 'Reparos Mecânicos Digestor',           value: 20000, start: '2026-05-01', end: '2026-06-30', docPrefix: 'BRA' },
  { name: 'Montagem Linha de Fibra',              value: 30000, start: '2026-05-15', end: '2026-08-15', docPrefix: 'CMP' },
  { name: 'Reforma Pátio de Madeira',             value: 40000, start: '2026-06-01', end: '2026-09-30', docPrefix: 'ELD' },
  { name: 'Expansão Secadora Máquina 2',          value: 50000, start: '2026-06-01', end: '2026-11-30', docPrefix: 'VER' }
];

// Distribuição de budget em valores redondos somando o total
const budgetPorContrato = {
  10000: [{ description: 'Mão de obra direta',       type: 'mao_de_obra', value: 10000 }],
  20000: [{ description: 'Mão de obra direta',       type: 'mao_de_obra', value: 10000 },
          { description: 'Hospedagem da equipe',     type: 'hospedagem',  value: 10000 }],
  30000: [{ description: 'Mão de obra direta',       type: 'mao_de_obra', value: 10000 },
          { description: 'Hospedagem da equipe',     type: 'hospedagem',  value: 10000 },
          { description: 'Transporte / passagens',   type: 'transporte',  value: 10000 }],
  40000: [{ description: 'Mão de obra direta',       type: 'mao_de_obra', value: 20000 },
          { description: 'Hospedagem da equipe',     type: 'hospedagem',  value: 10000 },
          { description: 'Transporte / passagens',   type: 'transporte',  value: 10000 }],
  50000: [{ description: 'Mão de obra direta',       type: 'mao_de_obra', value: 20000 },
          { description: 'Hospedagem da equipe',     type: 'hospedagem',  value: 20000 },
          { description: 'Transporte / passagens',   type: 'transporte',  value: 10000 }]
};

(async () => {
  console.log('Criando 5 clientes...');
  const novosClientes = [];
  for (const c of clientes) {
    const r = await req('POST', '/api/clientes', c);
    if (r.status !== 200) { console.error('Erro cliente:', c.empresa, r); process.exit(1); }
    const criado = r.body.clientes[r.body.clientes.length - 1];
    novosClientes.push(criado);
    console.log(`  OK  ${criado.empresa}  ${criado.id}`);
  }

  console.log('\nCriando 5 contratos...');
  const novosContratos = [];
  for (let i = 0; i < contratosDef.length; i++) {
    const def = contratosDef[i];
    const cli = novosClientes[i];
    const payload = {
      name: def.name,
      contractNumber: `${def.docPrefix}-2026-00${i + 1}`,
      client: cli.empresa,
      clientId: cli.id,
      clientEmail: cli.email,
      clientPhone: cli.telefone,
      value: def.value,
      currency: 'BRL',
      startDate: def.start,
      endDate: def.end,
      status: 'ativo',
      endereco: cli.endereco,
      lat: cli.lat,
      lng: cli.lng,
      notes: `Contrato com ${cli.empresa} - ${cli.nome} (${cli.cargo})`
    };
    const r = await req('POST', '/api/contracts', payload);
    if (r.status !== 200) { console.error('Erro contrato:', def.name, r); process.exit(1); }
    const criado = r.body.contracts[r.body.contracts.length - 1];
    novosContratos.push(criado);
    console.log(`  OK  ${criado.name}  R$ ${criado.value.toLocaleString('pt-BR')}  ${criado.id}`);
  }

  console.log('\nCriando itens de orçamento (budget)...');
  for (const ctr of novosContratos) {
    const items = budgetPorContrato[ctr.value];
    for (const item of items) {
      const r = await req('POST', `/api/contracts/${ctr.id}/budget`, {
        ...item,
        notes: ''
      });
      if (r.status !== 200) { console.error('Erro budget:', ctr.id, item, r); process.exit(1); }
    }
    const total = items.reduce((s, i) => s + i.value, 0);
    console.log(`  OK  ${ctr.name}  ${items.length} item(ns)  total R$ ${total.toLocaleString('pt-BR')}`);
  }

  console.log('\nResumo:');
  console.log(`  ${novosClientes.length} clientes criados`);
  console.log(`  ${novosContratos.length} contratos criados`);
  console.log(`  Valores: ${novosContratos.map(c => c.value).join(', ')}`);
})().catch(e => { console.error(e); process.exit(1); });
