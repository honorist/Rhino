-- Migration 20260521060000 — cria o nível de acesso "Coordenador".
--
-- Perfil operacional de obras. Acesso concedido:
--   #/dashboard               → painel
--   #/contratos (+ edit)      → tela de Contratos, com criar/editar/excluir
--   #/obras                   → Mapa de Obras
--   #/rdos                    → RDOs
--   #/recursos (+ edit)       → tela de Recursos, com criar/editar/excluir
--   #/solicitacoes-compra     → tela de Solicitações de Compra
--
-- Idempotente: ON CONFLICT (id) DO NOTHING — rodar de novo não duplica nem altera.
INSERT INTO niveis_acesso (id, label, icon, cor, abas)
VALUES (
  'coordenador',
  'Coordenador',
  '🧭',
  '#4F46E5',
  '["#/dashboard","#/contratos","edit:#/contratos","#/obras","#/rdos","#/recursos","edit:#/recursos","#/solicitacoes-compra"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
