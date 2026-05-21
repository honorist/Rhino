-- Migration 20260521050000 — enforcement server-side da permissão de edição.
--
-- Contexto: o guard de mutação C-04 (server.js, checkMutationPermission) passou
-- a exigir 'edit:#/rota' em vez de apenas '#/rota'. Para NÃO remover de ninguém
-- o que já podia fazer, esta migration concede 'edit:#/rota' para cada tela
-- abaixo que o perfil JÁ tem nas abas — preservando 100% do comportamento atual.
-- Depois disso, o admin pode desmarcar "Ed." na matriz de Níveis de Acesso para
-- tornar um perfil somente-leitura numa tela (agora validado também no servidor).
--
-- Escopo restrito às telas operacionais cobertas pelo C-04. NÃO mexe em
-- usuarios/configuracao/auditoria — essas têm controle próprio (perms.can /
-- requireAdmin) e prefixar 'edit:' nelas poderia escalar privilégio.
--
-- Idempotente: só adiciona o que falta (operador `?` do jsonb).
DO $$
DECLARE
  r     RECORD;
  tela  TEXT;
  telas TEXT[] := ARRAY[
    '#/contratos', '#/base', '#/caixa', '#/socios', '#/investimentos',
    '#/clientes', '#/fornecedores', '#/notas-fiscais', '#/contas-pagar',
    '#/recursos', '#/folha-pagamento'
  ];
  novas JSONB;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE jsonb_typeof(abas) = 'array' LOOP
    novas := r.abas;
    FOREACH tela IN ARRAY telas LOOP
      IF (novas ? tela) AND NOT (novas ? ('edit:' || tela)) THEN
        novas := novas || to_jsonb('edit:' || tela);
      END IF;
    END LOOP;
    IF novas IS DISTINCT FROM r.abas THEN
      UPDATE niveis_acesso SET abas = novas WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
