-- Migration 20260521040000 — cria o nível de acesso "Planejamento".
--
-- Acesso concedido:
--   • #/contratos                    → tela de Contratos
--   • #/solicitacoes-compra          → tela de Solicitações de Compra
--   • solicitacoes-compra:avaliar    → etapa "Avaliar e cotar" (equipe de compras)
--
-- Idempotente: ON CONFLICT (id) DO NOTHING — rodar de novo não duplica nem altera.
INSERT INTO niveis_acesso (id, label, icon, cor, abas)
VALUES (
  'planejamento',
  'Planejamento',
  '📋',
  '#0891B2',
  '["#/contratos","#/solicitacoes-compra","solicitacoes-compra:avaliar"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
