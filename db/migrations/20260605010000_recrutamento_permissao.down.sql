-- Reverte: remove as permissões de recrutamento concedidas. (Não readiciona
-- '#/recrutamento' a `universais` no front — isso é controlado por código.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM niveis_acesso LOOP
    UPDATE niveis_acesso
       SET abas = (abas - '#/recrutamento' - 'edit:#/recrutamento')
     WHERE id = r.id;
  END LOOP;
END $$;
