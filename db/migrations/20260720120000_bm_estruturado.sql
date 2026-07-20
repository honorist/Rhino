-- Migration 20260720120000 — BM estruturado (planilha de serviços + medição por itens).
--
-- Três peças:
--  1. contract_servicos — planilha contratual (bill of quantities): cada serviço
--     com unidade, quantidade contratada e preço unitário. Aditivos de escopo
--     aumentam a qtd contratada; a medição nunca ultrapassa o saldo.
--  2. medicao_itens — itens de uma medição estruturada, pendurados na `saida`
--     (que segue agregando na NF/BM por data, mecânica intacta). Preço é
--     SNAPSHOT do serviço no momento da medição (reajuste não retro-age).
--     contract_id denormalizado para acumulação por contrato sem JOIN.
--  3. notas_fiscais ganha aprovação do cliente (status/quem/quando/motivo) e
--     retencao_pct (snapshot do % do contrato na criação da NF; o VALOR retido
--     é sempre calculado — nunca armazenado — para não dessincronizar da
--     agregação de saídas).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS contract_servicos (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  codigo          TEXT DEFAULT '',
  descricao       TEXT NOT NULL,
  unidade         TEXT NOT NULL DEFAULT 'un',
  qtd_contratada  NUMERIC(15,3) NOT NULL DEFAULT 0,
  preco_unit      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ordem           INTEGER DEFAULT 0,
  ativo           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_servicos_contract ON contract_servicos(contract_id);

CREATE TABLE IF NOT EXISTS medicao_itens (
  id           TEXT PRIMARY KEY,
  saida_id     TEXT NOT NULL REFERENCES saidas(id) ON DELETE CASCADE,
  servico_id   TEXT NOT NULL REFERENCES contract_servicos(id) ON DELETE RESTRICT,
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  qtd          NUMERIC(15,3) NOT NULL,
  preco_unit   NUMERIC(15,2) NOT NULL,
  valor        NUMERIC(15,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_saida ON medicao_itens(saida_id);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_servico ON medicao_itens(servico_id);
CREATE INDEX IF NOT EXISTS idx_medicao_itens_contract ON medicao_itens(contract_id);

ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS aprovacao_status TEXT;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS aprovacao_por    TEXT;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS aprovacao_em     TIMESTAMPTZ;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS aprovacao_obs    TEXT;
ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS retencao_pct     NUMERIC(5,2);
