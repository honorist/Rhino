-- Down da migration 20260908100000.
ALTER TABLE sugestoes DROP COLUMN IF EXISTS versao_entrega;
