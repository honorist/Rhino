-- Migração: lançamentos de Folha de Pagamento (descontos e proventos)
-- Cada linha de folha pode ter N descontos (impostos, faltas...) e N proventos
-- (hora extra, vale-alimentação...). O Saldo a pagar é recalculado pelo servidor
-- como (60% do salário) + Σproventos − Σdescontos.
-- Idempotente — IF NOT EXISTS em tudo. Não altera dados existentes.
-- As rotas /api/folha-pagamento/:id/itens já caem na permissão #/folha-pagamento.

CREATE TABLE IF NOT EXISTS folha_pagamento_itens (
  id                 TEXT PRIMARY KEY,
  folha_pagamento_id TEXT NOT NULL REFERENCES folha_pagamento(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('desconto','provento')),
  descricao          TEXT NOT NULL DEFAULT '',
  valor              NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fpi_folha ON folha_pagamento_itens (folha_pagamento_id);
