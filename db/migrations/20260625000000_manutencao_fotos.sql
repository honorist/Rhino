-- Migration 20260625000000 — fotos da solicitação de Manutenção + motivo de cancelamento.
--
-- Espelha o padrão de fotos de RDO (rdo_fotos): binário (BYTEA) numa tabela
-- dedicada, durável e incluída no backup do banco; os metadados (id, filename,
-- legenda, url) ficam no JSONB `manutencoes.fotos`. As imagens são servidas via
-- /data/manutencao-fotos/<manutencaoId>/<fotoId>.<ext> por um handler que lê do
-- banco.
--
-- Também adiciona motivo/data de cancelamento para a linha do tempo mostrar o
-- motivo, em paridade com Solicitações de Compra.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS fotos               JSONB DEFAULT '[]'::jsonb;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS cancelado_em        TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS manutencao_fotos (
  id             TEXT PRIMARY KEY,
  manutencao_id  TEXT NOT NULL REFERENCES manutencoes(id) ON DELETE CASCADE,
  mime           TEXT,
  data           BYTEA,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manutencao_fotos_manutencao ON manutencao_fotos (manutencao_id);
