-- Rollback da migration 20260524000000 — Recrutamento.
-- Drop em ordem reversa (candidatos → vagas → solicitacoes).
DROP TABLE IF EXISTS notificacoes;
DROP TABLE IF EXISTS candidatos;
DROP TABLE IF EXISTS vagas;
DROP TABLE IF EXISTS solicitacoes_contratacao;
