-- Down da migration 20260908090000.
ALTER TABLE cotacao_precos DROP CONSTRAINT IF EXISTS cotacao_precos_cell_unique;
