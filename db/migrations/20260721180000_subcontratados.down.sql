-- Rollback de 20260721180000_subcontratados.
-- Filha primeiro (a FK já cairia com o CASCADE, mas o DROP explícito é o inverso da up).
DROP TABLE IF EXISTS subcontrato_medicoes;
DROP TABLE IF EXISTS subcontratados;
