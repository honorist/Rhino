-- Migration 20260901100000 — índices cirúrgicos pras queries novas do dashboard
-- operacional (handlers/dashboards.js, handleDashboardOperacional) e do checker
-- de alertas (lib/dashboard-alertas.js), que fazem table scan nessas colunas em
-- tabelas que crescem com o tempo.
--
-- Idempotente (IF NOT EXISTS); sem rollback destrutivo — DROP INDEX é seguro e
-- não perde dado, mas o padrão do projeto é migration forward-only.
--
-- Conferido contra pg_indexes antes de escrever isto: manutencoes(status) e
-- propostas(status) já tinham índice de um lote de migration anterior
-- (idx_manutencoes_status, idx_propostas_status) — omitidos aqui pra não
-- duplicar. candidatos(status) e solicitacoes_compra(status) também já têm
-- índice simples, mas NÃO o composto com updated_at que a query do dashboard
-- realmente usa — esses dois ficam.
CREATE INDEX IF NOT EXISTS idx_manutencoes_atrasadas
  ON manutencoes(data_retorno_prevista)
  WHERE status = 'aprovada';

CREATE INDEX IF NOT EXISTS idx_candidatos_status_updated
  ON candidatos(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_compra_status_updated
  ON solicitacoes_compra(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_veiculo_planos_ativos
  ON veiculo_planos(ativo, ultima_data)
  WHERE ativo = TRUE;
