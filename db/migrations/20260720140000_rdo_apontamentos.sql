-- Migration 20260720140000 — Apontamento de HH por colaborador × atividade (item 5).
--
-- Hoje o RDO registra efetivo por FUNÇÃO (rdos.moi/mod/terc e
-- passarelli.detalhamentoHorario, JSONB), com HH = efetivo × horas — nunca por
-- pessoa nem ligado a uma etapa do cronograma. Esta migration adiciona:
--
--  1. atividades.hh_plan — HH PREVISTO por etapa (o "orçado" de horas). O
--     realizado é Σ das horas apontadas por atividade.
--  2. rdo_apontamentos — tabela-filha do RDO com o triângulo pessoa × atividade
--     × horas por dia. contract_id é denormalizado para agregar produtividade
--     por obra/atividade sem JOIN (mesmo padrão de medicao_itens). recurso_id e
--     atividade_id são SET NULL (o apontamento sobrevive à remoção do cadastro,
--     virando "sem colaborador"/"sem atividade" em vez de sumir).
--
-- Idempotente: ADD COLUMN / CREATE TABLE / CREATE INDEX IF NOT EXISTS.

ALTER TABLE atividades ADD COLUMN IF NOT EXISTS hh_plan NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rdo_apontamentos (
  id            TEXT PRIMARY KEY,
  rdo_id        TEXT NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  recurso_id    TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  atividade_id  TEXT REFERENCES atividades(id) ON DELETE SET NULL,
  funcao        TEXT DEFAULT '',
  horas         NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes   TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdo_apont_rdo       ON rdo_apontamentos(rdo_id);
CREATE INDEX IF NOT EXISTS idx_rdo_apont_contract  ON rdo_apontamentos(contract_id);
CREATE INDEX IF NOT EXISTS idx_rdo_apont_atividade ON rdo_apontamentos(atividade_id);
CREATE INDEX IF NOT EXISTS idx_rdo_apont_recurso   ON rdo_apontamentos(recurso_id);
