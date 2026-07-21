-- Migration 20260721120000 — Matriz de treinamentos NR por colaborador (feature 8).
--
-- Cada linha é um treinamento normativo (NR-10, NR-35, integração, etc.) de um
-- colaborador, com data de realização, validade (em meses) e a data de validade
-- derivada — a base da "matriz de treinamentos" e do bloqueio de alocação quando
-- uma NR exigida está vencida ou ausente. A regra pura vive em lib/treinamento.js.
--
-- Padrão do projeto (molde punch_itens): id TEXT PK; FK recurso_id CASCADE (o
-- treinamento morre com o colaborador); TIMESTAMPTZ nos carimbos; índices por
-- recurso_id (listagem por pessoa) e por data_validade (varredura de vencidos).
-- camelCase↔snake é automático (db/index.js): recursoId, dataRealizacao,
-- validadeMeses, dataValidade, certificadoUrl.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS treinamentos (
  id               TEXT PRIMARY KEY,
  recurso_id       TEXT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  nr               TEXT NOT NULL,                       -- ex.: 'NR-10', 'NR-35'
  descricao        TEXT DEFAULT '',
  data_realizacao  DATE,
  validade_meses   INTEGER DEFAULT 12,
  data_validade    DATE,
  instituicao      TEXT DEFAULT '',
  certificado_url  TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_treinamentos_recurso       ON treinamentos(recurso_id);
CREATE INDEX IF NOT EXISTS idx_treinamentos_data_validade ON treinamentos(data_validade);
