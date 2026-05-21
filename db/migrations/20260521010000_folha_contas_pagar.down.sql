-- Rollback de 20260521010000_folha_contas_pagar.sql
-- Remove o vínculo Folha de Pagamento ↔ Contas a Pagar.
-- ATENÇÃO: descarta os ponteiros entre folha e contas a pagar. As contas a
-- pagar já geradas continuam existindo, apenas perdem o vínculo de origem.

DROP INDEX IF EXISTS idx_cp_folha;

ALTER TABLE contas_pagar    DROP COLUMN IF EXISTS folha_parcela;
ALTER TABLE contas_pagar    DROP COLUMN IF EXISTS folha_pagamento_id;

ALTER TABLE folha_pagamento DROP COLUMN IF EXISTS saldo_conta_pagar_id;
ALTER TABLE folha_pagamento DROP COLUMN IF EXISTS vale_conta_pagar_id;
