-- Migration 20260721200000 — Equipamentos próprios/locados + locações (item 16).
--
-- Cadastro dos equipamentos da empresa (próprios e locados de terceiros) com o
-- seu histórico de locações a obras. Dois papéis distintos:
--   1. `equipamentos`         — o ativo em si (betoneira, andaime, gerador…),
--      com propriedade (próprio | locado), valor de aquisição / locação mensal,
--      status operacional e localização atual.
--   2. `equipamento_locacoes` — cada janela em que o equipamento ficou alocado
--      (a uma obra ou não), com início, fim, valor mensal contratado e status.
--      É a base do custo de locação acumulado e do alerta de devolução.
--
-- Decisões (molde ssma_ocorrencias / veiculos):
--   - fornecedor_id ON DELETE SET NULL: o equipamento (e seu histórico) sobrevive
--     à remoção do fornecedor que o locou — cadastro é patrimônio, não pode sumir.
--   - locacoes.equipamento_id ON DELETE CASCADE: a locação é filha do equipamento;
--     sem o ativo ela não faz sentido.
--   - locacoes.contract_id ON DELETE SET NULL: a locação é histórico e sobrevive
--     ao encerramento/remoção da obra (fica "sem obra", mas o custo permanece).
--   - valores em NUMERIC (o app grava com money.parse — 2 casas).
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS equipamentos (
  id                    TEXT PRIMARY KEY,
  nome                  TEXT NOT NULL,
  tipo                  TEXT DEFAULT '',
  propriedade           TEXT NOT NULL DEFAULT 'proprio',    -- proprio | locado
  fornecedor_id         TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  valor_aquisicao       NUMERIC DEFAULT 0,
  valor_locacao_mensal  NUMERIC DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'disponivel',  -- disponivel | em_uso | manutencao | devolvido
  localizacao           TEXT DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipamentos_propriedade ON equipamentos(propriedade);
CREATE INDEX IF NOT EXISTS idx_equipamentos_status      ON equipamentos(status);

CREATE TABLE IF NOT EXISTS equipamento_locacoes (
  id              TEXT PRIMARY KEY,
  equipamento_id  TEXT NOT NULL REFERENCES equipamentos(id) ON DELETE CASCADE,
  contract_id     TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  data_inicio     DATE,
  data_fim        DATE,
  valor_mensal    NUMERIC DEFAULT 0,
  status          TEXT DEFAULT 'ativa',   -- ativa | encerrada
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipamento_locacoes_equip    ON equipamento_locacoes(equipamento_id);
CREATE INDEX IF NOT EXISTS idx_equipamento_locacoes_contract ON equipamento_locacoes(contract_id);
