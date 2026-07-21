-- Migration 20260721150000 — Composições de custos unitários (catálogo GLOBAL).
--
-- Catálogo de composições de preço unitário (padrão SINAPI/TCPO): cada composição
-- descreve UM serviço e a sua "receita" de insumos — mão de obra, material e
-- equipamento — com coeficiente e valor unitário. O custo unitário do serviço é a
-- soma de coef × valorUnit de cada insumo (lib/composicao.js). NÃO é por obra: é
-- um catálogo reutilizável que alimenta o orçamento das propostas.
--
-- `itens` é JSONB (array de insumos) porque a receita é uma lista curta, sempre
-- lida/gravada junto com a composição — não há consulta por insumo isolado, então
-- não compensa uma tabela-filha. Cada item:
--   { tipo: 'mo'|'material'|'equipamento', descricao, coef, valorUnit }
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS composicoes (
  id          TEXT PRIMARY KEY,
  codigo      TEXT,
  descricao   TEXT NOT NULL,
  unidade     TEXT DEFAULT 'un',
  itens       JSONB DEFAULT '[]',
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_composicoes_codigo ON composicoes(codigo);
