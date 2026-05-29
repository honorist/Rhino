-- Rollback de 20260528000000_data_desejada_obra.sql
-- Remove a coluna "data desejada na obra" das SCs e contratações.

ALTER TABLE solicitacoes_compra      DROP COLUMN IF EXISTS data_desejada_obra;
ALTER TABLE solicitacoes_contratacao DROP COLUMN IF EXISTS data_desejada_obra;
