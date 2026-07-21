-- Migration 20260721180000 — Subcontratados (empreiteiros) e suas medições (item 14).
--
-- Primeiro cadastro de empreiteiros/terceiros do sistema. Uma empresa de montagem
-- subcontrata parte da mão de obra (elétrica, andaimes, pintura industrial, etc.);
-- este módulo registra o cadastro do subcontratado e o boletim de medições que ele
-- fatura contra a Rhino, competência a competência (YYYY-MM), do previsto ao pago.
--
-- Duas tabelas:
--  - subcontratados: cadastro GLOBAL (não por obra) — nome, CNPJ, especialidade e
--    contato, com um status ativo|inativo que apenas esconde da seleção sem apagar
--    o histórico de medições.
--  - subcontrato_medicoes: tabela-filha por subcontratado_id. Cada medição tem uma
--    competência, um valor, um percentual (avanço físico do escopo dele) e um status
--    de 3 estados (prevista → medida → paga). `contract_id` é OPCIONAL: liga a medição
--    a uma obra quando o subcontratado atua num contrato específico.
--
-- Decisões de FK (molde ssma_ocorrencias / punch_itens):
--  - subcontratado_id ON DELETE CASCADE: sumiu o empreiteiro, somem as medições dele.
--  - contract_id ON DELETE SET NULL: a medição é um registro financeiro/histórico e
--    precisa sobreviver à remoção da obra — só perde o vínculo, não o dado.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS subcontratados (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  cnpj           TEXT DEFAULT '',
  especialidade  TEXT DEFAULT '',
  contato        TEXT DEFAULT '',
  telefone       TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'ativo',   -- ativo | inativo
  observacoes    TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subcontratados_status ON subcontratados(status);

CREATE TABLE IF NOT EXISTS subcontrato_medicoes (
  id               TEXT PRIMARY KEY,
  subcontratado_id TEXT NOT NULL REFERENCES subcontratados(id) ON DELETE CASCADE,
  contract_id      TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  competencia      TEXT,                            -- YYYY-MM (competência da medição)
  descricao        TEXT DEFAULT '',
  valor            NUMERIC DEFAULT 0,
  percentual       NUMERIC DEFAULT 0,               -- avanço físico do escopo (0..100)
  status           TEXT DEFAULT 'prevista',         -- prevista | medida | paga
  data             DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subcontrato_medicoes_sub      ON subcontrato_medicoes(subcontratado_id);
CREATE INDEX IF NOT EXISTS idx_subcontrato_medicoes_contract ON subcontrato_medicoes(contract_id);
CREATE INDEX IF NOT EXISTS idx_subcontrato_medicoes_status   ON subcontrato_medicoes(status);
