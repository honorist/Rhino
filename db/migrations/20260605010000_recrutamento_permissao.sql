-- Recrutamento passa a ser recurso controlado por permissão.
-- Antes: rota universal (qualquer usuário logado criava colaborador e via
-- CPF/antecedentes). Agora exige '#/recrutamento' (view) e 'edit:#/recrutamento'
-- (mutação) nas abas do perfil — espelhado no servidor (VIEW/MUTATION rules).
--
-- Concessão: a quem JÁ gerencia Recursos (edit:#/recursos), pois recrutamento
-- culmina em criar colaborador. admin/super-admin têm bypass (não precisam).
-- Ajustável depois na tela de Níveis de Acesso. Idempotente.
DO $$
DECLARE
  r RECORD;
  abas_atual JSONB;
  perm TEXT;
  novas_perms TEXT[] := ARRAY['#/recrutamento', 'edit:#/recrutamento'];
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE abas ? 'edit:#/recursos' LOOP
    abas_atual := r.abas;
    FOREACH perm IN ARRAY novas_perms LOOP
      IF NOT abas_atual ? perm THEN
        abas_atual := abas_atual || to_jsonb(perm);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
