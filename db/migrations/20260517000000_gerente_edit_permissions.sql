-- Migração: perfil 'gerente' ganha permissão de EDIÇÃO nas rotas que ele já visualiza.
--
-- Contexto: até esta migração, o gerente só tinha 'edit:#/frota'. Como o frontend
-- (js/app.js:podeEditar) esconde botões de criar/editar/excluir quando o perfil
-- não tem 'edit:#/<rota>' no array `abas`, o gerente conseguia abrir as telas mas
-- não conseguia operar nada além de frota — situação relatada pelo usuário em
-- produção: "gerente não consegue fazer coisas que ele tem poder".
--
-- Esta migração concede edit: para todas as rotas operacionais que o gerente
-- já tem em `abas`. Não inclui #/configuracao, #/auditoria, #/dashboard
-- (admin-only ou apenas visualização).
--
-- Idempotente: rodar várias vezes não duplica nem altera nada.
DO $$
DECLARE
  r RECORD;
  abas_atual JSONB;
  perm TEXT;
  novas_perms TEXT[] := ARRAY[
    'edit:#/contratos',
    'edit:#/caixa',
    'edit:#/notas-fiscais',
    'edit:#/contas-pagar',
    'edit:#/clientes',
    'edit:#/fornecedores',
    'edit:#/recursos',
    'edit:#/obras',
    'edit:#/solicitacoes-compra',
    'edit:#/estoque',
    'edit:#/cobranca'
  ];
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id = 'gerente' LOOP
    abas_atual := r.abas;
    FOREACH perm IN ARRAY novas_perms LOOP
      IF NOT abas_atual ? perm THEN
        abas_atual := abas_atual || to_jsonb(perm);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
