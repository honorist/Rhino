-- Migration 20260908110000 — instrumentação básica de uso (achado 6.3).
--
-- 13 módulos novos (SSMA, ponto, NR, EPIs, composições, data book, punch
-- list, HH, DRE, EVM/Curva S, cotações, subcontratados, ferramentas,
-- equipamentos) foram ao ar sem nenhum sinal de adoção real. Contador
-- agregado (tela, dia) — sem PII, sem uma linha por clique.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS tela_visitas (
  id          TEXT PRIMARY KEY,
  tela        TEXT NOT NULL,
  data        DATE NOT NULL,
  visitas     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tela, data)
);
CREATE INDEX IF NOT EXISTS idx_tela_visitas_tela ON tela_visitas(tela);
CREATE INDEX IF NOT EXISTS idx_tela_visitas_data ON tela_visitas(data);
