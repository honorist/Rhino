-- Rollback da migration 20260901090000.
-- Remove só os 4 níveis criados por ela; não reverte os grants de abas em
-- níveis pré-existentes (coordenador/gerente/planejamento seguem intactos).
DELETE FROM niveis_acesso WHERE id IN ('admin', 'gestor', 'financeiro', 'operador');
