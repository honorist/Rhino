-- Rollback de 20260721200000_equipamentos.
-- A filha primeiro (FK), depois o ativo.
DROP TABLE IF EXISTS equipamento_locacoes;
DROP TABLE IF EXISTS equipamentos;
