-- Migration 20260721110000 — Desvios e incidentes SSMA por obra (item 7).
--
-- Primeira gestão de SSMA (Segurança, Saúde e Meio Ambiente) do sistema:
-- desvios, quase-acidentes, incidentes e acidentes por contrato, com gravidade,
-- causa, ação corretiva, responsável, prazo e fluxo de 3 estados
-- (aberto → em_investigacao → encerrado). Os campos `com_afastamento` e
-- `dias_perdidos` alimentam os indicadores clássicos de SST — Taxa de Frequência
-- (TF) e Taxa de Gravidade (TG) — calculados por obra sobre o HHT dos RDOs.
--
-- Molde punch_itens: contract_id denormalizado para filtrar/agregar por obra sem
-- JOIN; responsavel_id ON DELETE SET NULL para a ocorrência sobreviver à remoção
-- do colaborador (registro de segurança é histórico — não pode sumir junto).
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ssma_ocorrencias (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'desvio',   -- desvio | quase_acidente | incidente | acidente
  data            DATE,
  gravidade       TEXT NOT NULL DEFAULT 'media',    -- baixa | media | alta | critica
  descricao       TEXT NOT NULL,
  causa           TEXT DEFAULT '',
  acao_corretiva  TEXT DEFAULT '',
  responsavel_id  TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  prazo           DATE,
  status          TEXT NOT NULL DEFAULT 'aberto',   -- aberto | em_investigacao | encerrado
  com_afastamento BOOLEAN NOT NULL DEFAULT FALSE,
  dias_perdidos   INTEGER NOT NULL DEFAULT 0,
  encerrado_em    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ssma_ocorrencias_contract ON ssma_ocorrencias(contract_id);
CREATE INDEX IF NOT EXISTS idx_ssma_ocorrencias_status   ON ssma_ocorrencias(status);
