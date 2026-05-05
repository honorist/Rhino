const db = require('../index');
const { createRepo } = require('./_factory');

const base = createRepo('veiculos', { orderBy: 'placa ASC' });

// Retorna veículos com planos[] e manutencoes[] aninhados — padrão de contracts.js.
async function findAllWithChildren() {
  const veiculos = await db.getMany(`SELECT * FROM veiculos ORDER BY placa ASC`);
  if (!veiculos.length) return [];

  const ids = veiculos.map((v) => v.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(', ');

  const [planos, manuts] = await Promise.all([
    db.getMany(`SELECT * FROM veiculo_planos WHERE veiculo_id IN (${ph}) ORDER BY descricao ASC`, ids),
    db.getMany(`SELECT * FROM veiculo_manutencoes WHERE veiculo_id IN (${ph}) ORDER BY data DESC, created_at DESC`, ids),
  ]);

  const planosByVeic = new Map();
  const manutsByVeic = new Map();
  for (const p of planos) {
    if (!planosByVeic.has(p.veiculoId)) planosByVeic.set(p.veiculoId, []);
    planosByVeic.get(p.veiculoId).push(p);
  }
  for (const m of manuts) {
    if (!manutsByVeic.has(m.veiculoId)) manutsByVeic.set(m.veiculoId, []);
    manutsByVeic.get(m.veiculoId).push(m);
  }

  return veiculos.map((v) => ({
    ...v,
    planos: planosByVeic.get(v.id) || [],
    manutencoes: manutsByVeic.get(v.id) || [],
  }));
}

async function findByIdWithChildren(id) {
  const veiculo = await db.getOne(`SELECT * FROM veiculos WHERE id = $1`, [id]);
  if (!veiculo) return null;
  const [planos, manutencoes] = await Promise.all([
    db.getMany(`SELECT * FROM veiculo_planos WHERE veiculo_id = $1 ORDER BY descricao ASC`, [id]),
    db.getMany(`SELECT * FROM veiculo_manutencoes WHERE veiculo_id = $1 ORDER BY data DESC, created_at DESC`, [id]),
  ]);
  return { ...veiculo, planos, manutencoes };
}

async function getEnvelope() {
  return { veiculos: await findAllWithChildren() };
}

module.exports = {
  ...base,
  findAllWithChildren,
  findByIdWithChildren,
  getEnvelope,
};
