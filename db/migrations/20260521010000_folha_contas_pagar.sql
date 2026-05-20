-- Migração: vínculo Folha de Pagamento ↔ Contas a Pagar (sincronização bidirecional)
-- Ao gerar a folha, cada parcela (vale/saldo) vira uma conta a pagar; pagar ou
-- estornar de qualquer um dos lados reflete no outro.
-- Idempotente — IF NOT EXISTS em tudo. Não altera dados existentes.

-- folha_pagamento → aponta para as contas a pagar geradas
ALTER TABLE folha_pagamento ADD COLUMN IF NOT EXISTS vale_conta_pagar_id  TEXT;
ALTER TABLE folha_pagamento ADD COLUMN IF NOT EXISTS saldo_conta_pagar_id TEXT;

-- contas_pagar → aponta de volta para a linha de folha de origem
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS folha_pagamento_id TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS folha_parcela      TEXT;  -- 'vale' | 'saldo'

CREATE INDEX IF NOT EXISTS idx_cp_folha ON contas_pagar (folha_pagamento_id);
