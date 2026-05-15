-- Migração v1.2.7: gestão de usuários por perfil "gerente".
--
-- Contexto: até a v1.2.6 só super admin / perfil 'admin' acessava /api/users.
-- A partir desta versão, qualquer perfil com 'edit:#/usuarios' nos `abas` pode
-- listar, criar, editar e remover usuários (com bloqueio anti-escalada no servidor:
-- não pode criar ou promover para super admin / 'admin').
--
-- Esta migração concede a permissão ao perfil 'gerente'. Os outros perfis seguem sem.
-- Idempotente: roda sem efeito colateral se já tiver sido aplicada.
DO $$
DECLARE r RECORD; abas_atual JSONB;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id = 'gerente' LOOP
    abas_atual := r.abas;
    -- garantir rota visível também (frontend trata #/usuarios como universal,
    -- mas mantemos no array para consistência e auditoria)
    IF NOT abas_atual ? '#/usuarios' THEN
      abas_atual := abas_atual || '"#/usuarios"'::jsonb;
    END IF;
    IF NOT abas_atual ? 'edit:#/usuarios' THEN
      abas_atual := abas_atual || '"edit:#/usuarios"'::jsonb;
    END IF;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
