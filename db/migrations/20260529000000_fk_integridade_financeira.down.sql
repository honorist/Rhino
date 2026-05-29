-- Rollback de 20260529000000_fk_integridade_financeira.sql
-- Remove as FKs e índices adicionados. Índices preexistentes (idx_caixa_folha)
-- NÃO são tocados — pertencem ao schema base.

ALTER TABLE investimentos  DROP CONSTRAINT IF EXISTS fk_inv_socio;
ALTER TABLE investimentos  DROP CONSTRAINT IF EXISTS fk_inv_contract;
ALTER TABLE investimentos  DROP CONSTRAINT IF EXISTS fk_inv_base_item;
ALTER TABLE investimentos  DROP CONSTRAINT IF EXISTS fk_inv_caixa_entry;
ALTER TABLE folha_pagamento DROP CONSTRAINT IF EXISTS fk_fp_vale_cp;
ALTER TABLE folha_pagamento DROP CONSTRAINT IF EXISTS fk_fp_saldo_cp;
ALTER TABLE caixa           DROP CONSTRAINT IF EXISTS fk_caixa_folha;

DROP INDEX IF EXISTS idx_inv_socio;
DROP INDEX IF EXISTS idx_inv_contract;
DROP INDEX IF EXISTS idx_inv_base_item;
DROP INDEX IF EXISTS idx_inv_caixa_entry;
DROP INDEX IF EXISTS idx_fp_vale_cp;
DROP INDEX IF EXISTS idx_fp_saldo_cp;
