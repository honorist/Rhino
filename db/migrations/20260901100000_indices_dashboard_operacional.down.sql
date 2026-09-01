-- Rollback da migration 20260901100000.
DROP INDEX IF EXISTS idx_manutencoes_atrasadas;
DROP INDEX IF EXISTS idx_candidatos_status_updated;
DROP INDEX IF EXISTS idx_solicitacoes_compra_status_updated;
DROP INDEX IF EXISTS idx_veiculo_planos_ativos;
