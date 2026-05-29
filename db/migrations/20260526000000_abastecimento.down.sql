-- Rollback de 20260526000000_abastecimento.sql
-- Remove a tabela de abastecimentos de frota. Os índices (idx_abastec_*) caem
-- junto com a tabela.

DROP TABLE IF EXISTS veiculo_abastecimentos;
