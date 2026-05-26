-- Migração: Abastecimento de Frota (v1.0.23)
-- Idempotente — pode rodar várias vezes (IF NOT EXISTS em tudo).

CREATE TABLE IF NOT EXISTS veiculo_abastecimentos (
  id               TEXT PRIMARY KEY,
  veiculo_id       TEXT NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data             DATE NOT NULL,
  km               INTEGER,                    -- hodômetro no momento do abastecimento
  litros           NUMERIC(10,2) NOT NULL,
  valor_total      NUMERIC(15,2),
  tipo_combustivel TEXT,                       -- gasolina | diesel | etanol | gnv | arla
  fornecedor_id    TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  contract_id      TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abastec_veiculo  ON veiculo_abastecimentos (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_abastec_data     ON veiculo_abastecimentos (data DESC);
CREATE INDEX IF NOT EXISTS idx_abastec_contract ON veiculo_abastecimentos (contract_id);
