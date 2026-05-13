-- Migração: Permissões do módulo Propostas
-- Adiciona '#/proposta' e '#/clausulas' às abas dos perfis admin/gerente
-- (perfis cujo id OU label contém 'admin' ou 'gerente', case-insensitive).
-- Idempotente: só adiciona se ainda não tiver.

DO $$
DECLARE
  r RECORD;
  abas_atual JSONB;
  rotas_novas TEXT[] := ARRAY['#/proposta', '#/clausulas', 'edit:#/proposta', 'edit:#/clausulas'];
  rota TEXT;
BEGIN
  FOR r IN
    SELECT id, abas FROM niveis_acesso
    WHERE LOWER(id) ~ '(admin|gerente)' OR LOWER(COALESCE(label, '')) ~ '(admin|gerente)'
  LOOP
    abas_atual := r.abas;
    FOREACH rota IN ARRAY rotas_novas LOOP
      IF NOT abas_atual ? rota THEN
        abas_atual := abas_atual || to_jsonb(rota);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
