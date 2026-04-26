INSERT INTO niveis_acesso (id, label, icon, cor, abas) VALUES
  ('admin',      'Administrador', 'shield',     '#55588B', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/socios","#/investimentos","#/clientes","#/fornecedores","#/recursos","#/base","#/obras","#/auditoria","#/configuracao","#/usuarios","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('gestor',     'Gestor',        'briefcase',  '#0891B2', '["#/dashboard","#/contratos","#/caixa","#/notas-fiscais","#/contas-pagar","#/clientes","#/fornecedores","#/recursos","#/obras","contrato-tab:visao","contrato-tab:financeiro","contrato-tab:equipe","contrato-tab:rdo","contrato-tab:pendencias"]'::jsonb),
  ('financeiro', 'Financeiro',    'dollar-sign','#10B981', '["#/dashboard","#/caixa","#/notas-fiscais","#/contas-pagar","#/contratos","#/clientes","#/fornecedores","contrato-tab:visao","contrato-tab:financeiro"]'::jsonb),
  ('operador',   'Operador',      'clipboard',  '#F59E0B', '["#/contratos","#/obras","#/recursos","contrato-tab:visao","contrato-tab:equipe","contrato-tab:rdo"]'::jsonb)
ON CONFLICT (id) DO NOTHING;
