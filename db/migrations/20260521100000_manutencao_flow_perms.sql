-- Migration 20260521100000 — permissões do fluxo de Manutenção.
--
-- As etapas usam flags próprias: 'manutencao:avaliar' (equipe de compras) e
-- 'manutencao:aprovar' (gerência). Esta migration concede cada uma a quem já
-- exerce o papel equivalente no fluxo de Solicitação de Compra — ou seja, a
-- equipe de compras avalia a manutenção, e a gerência aprova.
--
-- Idempotente: só adiciona o que falta.
UPDATE niveis_acesso SET abas = abas || '"manutencao:avaliar"'::jsonb
  WHERE jsonb_typeof(abas) = 'array'
    AND (abas ? 'solicitacoes-compra:avaliar')
    AND NOT (abas ? 'manutencao:avaliar');

UPDATE niveis_acesso SET abas = abas || '"manutencao:aprovar"'::jsonb
  WHERE jsonb_typeof(abas) = 'array'
    AND (abas ? 'solicitacoes-compra:aprovar')
    AND NOT (abas ? 'manutencao:aprovar');
