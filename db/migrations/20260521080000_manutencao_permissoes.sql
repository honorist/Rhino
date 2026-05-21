-- Migration 20260521080000 — concede acesso à tela de Manutenção de Equipamentos.
--
-- admin, gerente e coordenador recebem '#/manutencao' (ver) e
-- 'edit:#/manutencao' (criar/editar/registrar retorno).
-- Os demais perfis podem ser liberados pela matriz de Níveis de Acesso.
--
-- Idempotente: só adiciona o que falta (operador `?` do jsonb).
DO $$
DECLARE
  r     RECORD;
  novas JSONB;
  f     TEXT;
  flags TEXT[] := ARRAY['#/manutencao', 'edit:#/manutencao'];
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso
           WHERE id IN ('admin', 'gerente', 'coordenador') AND jsonb_typeof(abas) = 'array' LOOP
    novas := r.abas;
    FOREACH f IN ARRAY flags LOOP
      IF NOT (novas ? f) THEN
        novas := novas || to_jsonb(f);
      END IF;
    END LOOP;
    IF novas IS DISTINCT FROM r.abas THEN
      UPDATE niveis_acesso SET abas = novas WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
