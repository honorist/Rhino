-- Migration 20260721190000 — Ferramentaria + controle de calibração (item 15).
--
-- Primeiro cadastro de FERRAMENTAS/instrumentos da empresa (torquímetros,
-- manômetros, multímetros, paquímetros, ferramentas em geral) com o ciclo de
-- vida de cada uma: status operacional (disponível / em uso / em calibração /
-- inativa), lotação (localização + responsável) e — para instrumentos de
-- medição — o controle de CALIBRAÇÃO, exigido por norma e por cliente.
--
-- Duas tabelas:
--  * ferramentas          — o cadastro. `requer_calibracao` liga o controle;
--    `periodicidade_meses` diz de quanto em quanto tempo recalibrar (a próxima
--    data = última calibração + periodicidade, calculada em lib/ferramenta.js).
--  * ferramenta_calibracoes — o histórico de calibrações de cada ferramenta
--    (data, validade, certificado, resultado). A "situação" (em dia / vencendo /
--    vencida) é derivada da validade mais recente vs. a data de referência.
--
-- Decisões (molde ssma_ocorrencias / punch_itens):
--  * responsavel_id ON DELETE SET NULL — a ferramenta sobrevive à saída do
--    colaborador responsável (o patrimônio não some junto com o RH).
--  * ferramenta_id ON DELETE CASCADE — o histórico de calibração é filho da
--    ferramenta; excluída a ferramenta, some o histórico dela.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS ferramentas (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL,
  codigo              TEXT DEFAULT '',
  tipo                TEXT DEFAULT '',
  requer_calibracao   BOOLEAN NOT NULL DEFAULT FALSE,
  periodicidade_meses INTEGER DEFAULT 12,           -- meses entre calibrações
  localizacao         TEXT DEFAULT '',
  responsavel_id      TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'disponivel', -- disponivel | em_uso | em_calibracao | inativa
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ferramentas_status ON ferramentas(status);

CREATE TABLE IF NOT EXISTS ferramenta_calibracoes (
  id             TEXT PRIMARY KEY,
  ferramenta_id  TEXT NOT NULL REFERENCES ferramentas(id) ON DELETE CASCADE,
  data           DATE,
  validade       DATE,
  certificado    TEXT DEFAULT '',
  resultado      TEXT DEFAULT 'aprovado',   -- aprovado | reprovado
  observacoes    TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ferramenta_calibracoes_ferramenta ON ferramenta_calibracoes(ferramenta_id);
