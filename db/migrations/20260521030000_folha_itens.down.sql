-- Rollback de 20260521030000_folha_itens.sql
-- Remove a tabela de lançamentos da folha (descontos e proventos).
-- ATENÇÃO: descarta todos os descontos/proventos lançados. Os valores de
-- folha_pagamento.valor_saldo já recalculados NÃO são revertidos.

DROP TABLE IF EXISTS folha_pagamento_itens;
