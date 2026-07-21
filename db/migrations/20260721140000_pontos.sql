-- Migration 20260721140000 — Ponto / banco de horas por colaborador (item 6).
--
-- Marcações diárias de jornada por recurso (colaborador): entrada, saída,
-- intervalo, horas trabalhadas e jornada prevista. A partir delas derivam o
-- saldo do dia (frente à jornada) e o banco de horas acumulado. A REGRA de
-- cálculo mora em lib/ponto.js (testável) — a tabela só guarda os fatos.
--
-- Molde: tabela-filha por recurso_id (como as folgas/documentos, mas em tabela
-- própria em vez de JSONB — permite filtrar/agregar por competência sem
-- desempacotar JSON). FK ON DELETE CASCADE: o histórico de ponto morre com o
-- colaborador. Idempotente (CREATE ... IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS pontos (
  id                 TEXT PRIMARY KEY,
  recurso_id         TEXT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  data               DATE NOT NULL,
  entrada            TEXT,                       -- "HH:MM"
  saida              TEXT,                       -- "HH:MM"
  intervalo_min      INTEGER DEFAULT 0,          -- refeição a descontar (minutos)
  horas_trabalhadas  NUMERIC(15,2) DEFAULT 0,    -- derivada no servidor (lib/ponto)
  jornada_prevista   NUMERIC(15,2) DEFAULT 8,    -- jornada do dia (horas)
  observacoes        TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pontos_recurso ON pontos(recurso_id);
CREATE INDEX IF NOT EXISTS idx_pontos_data    ON pontos(data);
