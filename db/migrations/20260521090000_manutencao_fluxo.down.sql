-- Rollback da migration 20260521090000.
ALTER TABLE manutencoes ALTER COLUMN status SET DEFAULT 'em_manutencao';
ALTER TABLE manutencoes DROP COLUMN IF EXISTS custo_estimado;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS avaliador_user_id;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS avaliador_nome;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS avaliado_em;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS aprovador_user_id;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS aprovador_nome;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS aprovado_em;
ALTER TABLE manutencoes DROP COLUMN IF EXISTS motivo_rejeicao;
