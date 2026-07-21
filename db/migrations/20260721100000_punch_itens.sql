-- Migration 20260721100000 — Punch list / Qualidade por obra (item 11).
--
-- Pendências técnicas, RNC e itens de inspeção por contrato, com responsável,
-- prazo, foto (evidência) e fluxo de 4 estados (aberto → em_andamento →
-- resolvido → verificado). É a primeira gestão de qualidade do sistema — a aba
-- "Pendências" atual é só espelho de passagens a pagar, não punch list.
--
-- Duas tabelas, no padrão já usado no projeto:
--  1. punch_itens — o item em si (molde rdo_apontamentos: contract_id
--     denormalizado para filtrar/agregar por obra sem JOIN; responsavel_id
--     SET NULL para o item sobreviver à remoção do colaborador).
--  2. punch_fotos — a evidência em BYTEA (molde rdo_fotos: durável, entra no
--     backup do PG; metadados leves ficam no JSONB `fotos` do item).
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS punch_itens (
  id             TEXT PRIMARY KEY,
  contract_id    TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL DEFAULT 'pendencia',   -- pendencia | rnc | inspecao
  titulo         TEXT NOT NULL,
  descricao      TEXT DEFAULT '',
  localizacao    TEXT DEFAULT '',
  severidade     TEXT NOT NULL DEFAULT 'media',       -- baixa | media | alta | critica
  status         TEXT NOT NULL DEFAULT 'aberto',      -- aberto | em_andamento | resolvido | verificado
  responsavel_id TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  prazo          DATE,
  resolvido_em   TIMESTAMPTZ,
  verificado_em  TIMESTAMPTZ,
  fotos          JSONB DEFAULT '[]',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_punch_itens_contract    ON punch_itens(contract_id);
CREATE INDEX IF NOT EXISTS idx_punch_itens_status      ON punch_itens(status);
CREATE INDEX IF NOT EXISTS idx_punch_itens_responsavel ON punch_itens(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_punch_itens_prazo       ON punch_itens(prazo);

CREATE TABLE IF NOT EXISTS punch_fotos (
  id             TEXT PRIMARY KEY,
  punch_item_id  TEXT NOT NULL REFERENCES punch_itens(id) ON DELETE CASCADE,
  mime           TEXT NOT NULL,
  data           BYTEA NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_punch_fotos_item ON punch_fotos(punch_item_id);
