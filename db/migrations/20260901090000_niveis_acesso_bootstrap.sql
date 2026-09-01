-- Migration 20260901090000 — bootstrap dos níveis de acesso "administrativos".
--
-- Bug: db/seed_niveis.sql (que cria os níveis Administrador, Gestor, Financeiro
-- e Operador) nunca era executado pelo fluxo padrão `npm run db:migrate` — só
-- existe como arquivo solto, sem script de seed no package.json. Uma instalação
-- nova ficava só com Coordenador/Gerente/Planejamento (criados por migrations
-- de verdade), sem nenhum jeito de virar Administrador pela UI — o que também
-- deixava #/configuracao e #/usuarios inacessíveis.
--
-- Esta migration substitui o arquivo solto: insere os 4 níveis que faltam e,
-- junto, concede 4 rotas prontas que nunca tinham sido dadas a nenhum nível
-- em nenhuma migration (#/documentos, #/conciliacao, #/previsao, #/composicoes).
--
-- Idempotente: INSERTs usam ON CONFLICT DO NOTHING; os grants adicionais
-- checam antes de concatenar (mesmo padrão já usado neste arquivo mais acima).
INSERT INTO niveis_acesso (id, label, icon, cor, abas) VALUES
  ('admin',      'Administrador', 'shield',     '#55588B', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/socios","#/investimentos","#/clientes","#/fornecedores","#/recursos","#/base","#/obras","#/frota","#/solicitacoes-compra","#/cobranca","#/auditoria","#/configuracao","#/usuarios","solicitacoes-compra:avaliar","solicitacoes-compra:aprovar","solicitacoes-compra:receber","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('gestor',     'Gestor',        'briefcase',  '#0891B2', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/clientes","#/fornecedores","#/recursos","#/obras","#/frota","#/solicitacoes-compra","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('financeiro', 'Financeiro',    'dollar-sign','#10B981', '["#/dashboard","#/caixa","#/notas-fiscais","#/contas-pagar","#/contratos","#/clientes","#/fornecedores","#/solicitacoes-compra","solicitacoes-compra:avaliar","solicitacoes-compra:receber","contrato-tab:visao","contrato-tab:financeiro"]'::jsonb),
  ('operador',   'Operador',      'clipboard',  '#F59E0B', '["#/contratos","#/obras","#/recursos","#/frota","#/solicitacoes-compra","solicitacoes-compra:receber","contrato-tab:visao","contrato-tab:equipe","contrato-tab:rdo"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- #/documentos e #/composicoes → admin e gerente (mesmo padrão de #/cobranca).
-- #/conciliacao e #/previsao → admin, gerente e financeiro (rotas financeiras).
DO $$
DECLARE
  grant_rec RECORD;
  r RECORD;
  abas_atual JSONB;
BEGIN
  FOR grant_rec IN
    SELECT * FROM (VALUES
      ('#/documentos',   ARRAY['admin','gerente']),
      ('#/composicoes',  ARRAY['admin','gerente']),
      ('#/conciliacao',  ARRAY['admin','gerente','financeiro']),
      ('#/previsao',     ARRAY['admin','gerente','financeiro'])
    ) AS t(rota, niveis)
  LOOP
    FOR r IN SELECT id, abas FROM niveis_acesso WHERE id = ANY(grant_rec.niveis) LOOP
      abas_atual := r.abas;
      IF NOT abas_atual ? grant_rec.rota THEN
        abas_atual := abas_atual || to_jsonb(grant_rec.rota);
        UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;
