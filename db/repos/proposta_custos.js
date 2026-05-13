/**
 * @file Repositório de `proposta_custos` — itens de custo INTERNO (privado).
 *
 * Categorias: 'mao_obra', 'material', 'equipamento', 'frete', 'impostos', 'bdi', 'lucro', 'outros'.
 * Nunca exportado em DOCX/PDF/Preview do cliente — apenas na aba "Custo Interno"
 * do editor (gated por perfil com permissão).
 */
const { createRepo } = require('./_factory');

const base = createRepo('proposta_custos', { orderBy: 'ordem ASC, created_at ASC' });

module.exports = base;
