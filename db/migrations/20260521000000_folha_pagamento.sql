-- Migração: Módulo Folha de Pagamento de Colaboradores
-- Idempotente — IF NOT EXISTS em tudo. Roda no preDeploy via run-migrations.js.
-- Não altera nenhuma tabela existente exceto adicionar colunas com default.

-- ============ recursos: elegibilidade a vale (adiantamento 40%) ============
ALTER TABLE recursos ADD COLUMN IF NOT EXISTS elegivel_vale BOOLEAN NOT NULL DEFAULT FALSE;

-- ============ folha_pagamento: fonte da verdade do controle de pagamento ============
CREATE TABLE IF NOT EXISTS folha_pagamento (
  id                   TEXT PRIMARY KEY,
  recurso_id           TEXT NOT NULL REFERENCES recursos(id) ON DELETE RESTRICT,
  recurso_nome         TEXT NOT NULL DEFAULT '',
  competencia          TEXT NOT NULL,
  salario_base         NUMERIC(15,2) NOT NULL DEFAULT 0,
  elegivel_vale        BOOLEAN NOT NULL DEFAULT FALSE,
  contract_id          TEXT REFERENCES contracts(id)  ON DELETE SET NULL,
  base_item_id         TEXT REFERENCES base_items(id) ON DELETE SET NULL,
  valor_vale           NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_saldo          NUMERIC(15,2) NOT NULL DEFAULT 0,
  vale_pago            BOOLEAN NOT NULL DEFAULT FALSE,
  vale_data_pagamento  DATE,
  vale_caixa_entry_id  TEXT,
  saldo_pago           BOOLEAN NOT NULL DEFAULT FALSE,
  saldo_data_pagamento DATE,
  saldo_caixa_entry_id TEXT,
  observacoes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_recurso_comp ON folha_pagamento (recurso_id, competencia);
CREATE INDEX IF NOT EXISTS idx_folha_competencia       ON folha_pagamento (competencia);

-- ============ caixa: vínculo de volta ao registro de folha (rastreabilidade) ============
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS folha_pagamento_id TEXT;
CREATE INDEX IF NOT EXISTS idx_caixa_folha ON caixa (folha_pagamento_id);

-- ============ Permissões: nova tela #/folha-pagamento para admin/gerente ============
DO $$
DECLARE r RECORD; abas_atual JSONB; rota TEXT;
BEGIN
  FOR r IN SELECT id, abas FROM niveis_acesso WHERE LOWER(id) ~ '(admin|gerente)' LOOP
    abas_atual := r.abas;
    FOREACH rota IN ARRAY ARRAY['#/folha-pagamento','edit:#/folha-pagamento'] LOOP
      IF NOT abas_atual ? rota THEN
        abas_atual := abas_atual || to_jsonb(rota);
      END IF;
    END LOOP;
    UPDATE niveis_acesso SET abas = abas_atual WHERE id = r.id;
  END LOOP;
END $$;
