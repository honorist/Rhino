-- Migração v1.2.26: recuperação da permissão 'edit:#/usuarios' do gerente.
--
-- Contexto: relato em produção de que perfil 'gerente' não consegue
-- alterar nível de acesso dos usuários. A migration v1.2.7
-- (20260515000000_users_manage_permission.sql) já fazia isso, mas o
-- perfil pode ter sido modificado depois via UI de Níveis de Acesso
-- (Configuração → Níveis), removendo acidentalmente a permissão.
--
-- Esta migração re-aplica idempotentemente. Se já estiver presente,
-- nada acontece.
DO $$
DECLARE r RECORD; abas_atual JSONB;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id = 'gerente' LOOP
    abas_atual := r.abas;
    IF NOT abas_atual ? '#/usuarios' THEN
      abas_atual := abas_atual || '"#/usuarios"'::jsonb;
    END IF;
    IF NOT abas_atual ? 'edit:#/usuarios' THEN
      abas_atual := abas_atual || '"edit:#/usuarios"'::jsonb;
    END IF;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
