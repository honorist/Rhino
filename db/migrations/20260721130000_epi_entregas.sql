-- Migration 20260721130000 — Controle de EPIs / ficha de entrega por colaborador (item 9).
--
-- Registra a entrega de Equipamentos de Proteção Individual a cada colaborador,
-- com CA (Certificado de Aprovação), quantidade, vida útil e data prevista de
-- troca. Serve de ficha de EPI (comprovação NR-06) e alimenta o alerta de troca
-- vencida. A regra pura (precisa troca? status? resumo?) mora em lib/epi.js.
--
-- Molde: rdo_apontamentos / punch_itens — tabela-filha por FK, com índices no
-- FK e no campo de filtro/alerta (data_troca_prevista). recurso_id CASCADE: a
-- ficha morre junto com o colaborador (não faz sentido EPI sem dono).
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS epi_entregas (
  id                   TEXT PRIMARY KEY,
  recurso_id           TEXT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  epi                  TEXT NOT NULL,                 -- descrição do EPI (ex.: "Capacete classe B")
  ca                   TEXT,                          -- Certificado de Aprovação (MTE)
  quantidade           INTEGER DEFAULT 1,
  data_entrega         DATE,
  vida_util_meses      INTEGER,
  data_troca_prevista  DATE,                          -- entrega + vida útil (calculado se não vier)
  devolvido            BOOLEAN DEFAULT FALSE,
  data_devolucao       DATE,
  observacoes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_epi_entregas_recurso ON epi_entregas(recurso_id);
CREATE INDEX IF NOT EXISTS idx_epi_entregas_troca   ON epi_entregas(data_troca_prevista);
