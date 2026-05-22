-- Rollback da migration 20260521100000 — remove as flags do fluxo de Manutenção.
DO $$
DECLARE
  r     RECORD;
  novas JSONB;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE jsonb_typeof(abas) = 'array' LOOP
    novas := (SELECT jsonb_agg(v) FROM jsonb_array_elements_text(r.abas) v
              WHERE v NOT IN ('manutencao:avaliar', 'manutencao:aprovar'));
    novas := COALESCE(novas, '[]'::jsonb);
    IF novas IS DISTINCT FROM r.abas THEN
      UPDATE niveis_acesso SET abas = novas WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
