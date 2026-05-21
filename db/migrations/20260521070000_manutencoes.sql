-- Migration 20260521070000 — módulo de Manutenção de Equipamentos.
--
-- Registra equipamentos enviados para reparo e acompanha o retorno.
-- Ciclo de status: 'em_manutencao' → 'retornado' (ou 'cancelada').
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS manutencoes (
  id                     TEXT PRIMARY KEY,
  numero                 SERIAL,
  equipamento            TEXT NOT NULL,
  contract_id            TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  oficina                TEXT,
  problema               TEXT,
  status                 TEXT NOT NULL DEFAULT 'em_manutencao',
  data_envio             DATE,
  data_retorno_prevista  DATE,
  data_retorno           DATE,
  custo                  NUMERIC(15,2) DEFAULT 0,
  observacoes            TEXT,
  solicitante_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  solicitante_nome       TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manutencoes_status ON manutencoes (status);
