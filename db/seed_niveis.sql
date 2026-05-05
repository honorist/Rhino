INSERT INTO niveis_acesso (id, label, icon, cor, abas) VALUES
  ('admin',      'Administrador', 'shield',     '#55588B', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/socios","#/investimentos","#/clientes","#/fornecedores","#/recursos","#/base","#/obras","#/frota","#/solicitacoes-compra","#/auditoria","#/configuracao","#/usuarios","solicitacoes-compra:avaliar","solicitacoes-compra:aprovar","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('gerente',    'Gerente',       'briefcase',  '#7C3AED', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/clientes","#/fornecedores","#/recursos","#/obras","#/frota","#/solicitacoes-compra","#/estoque","solicitacoes-compra:aprovar","edit:#/frota","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('gestor',     'Gestor',        'briefcase',  '#0891B2', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/clientes","#/fornecedores","#/recursos","#/obras","#/frota","#/solicitacoes-compra","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('financeiro', 'Financeiro',    'dollar-sign','#10B981', '["#/dashboard","#/caixa","#/notas-fiscais","#/contas-pagar","#/contratos","#/clientes","#/fornecedores","#/solicitacoes-compra","solicitacoes-compra:avaliar","contrato-tab:visao","contrato-tab:financeiro"]'::jsonb),
  ('operador',   'Operador',      'clipboard',  '#F59E0B', '["#/contratos","#/obras","#/recursos","#/frota","#/solicitacoes-compra","contrato-tab:visao","contrato-tab:equipe","contrato-tab:rdo"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Migração v1.0.25: financeiro e admin ganham 'solicitacoes-compra:avaliar' nas abas (idempotente)
DO $$
DECLARE r RECORD; abas_atual JSONB;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE id IN ('financeiro', 'admin') LOOP
    abas_atual := r.abas;
    IF NOT abas_atual ? 'solicitacoes-compra:avaliar' THEN
      abas_atual := abas_atual || '"solicitacoes-compra:avaliar"'::jsonb;
    END IF;
    IF NOT abas_atual ? '#/solicitacoes-compra' THEN
      abas_atual := abas_atual || '"#/solicitacoes-compra"'::jsonb;
    END IF;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
