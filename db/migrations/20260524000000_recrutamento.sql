-- Migration 20260524000000 — Recrutamento e Contratação (Epic US-05 a US-09).
--
-- Estrutura:
--   solicitacoes_contratacao (1) ───< vagas (N) ───< candidatos (N)
--
-- Fluxo:
--   Encarregado abre solicitação (US-05) → RH triagem candidatos (US-06) →
--   antecedentes criminais (US-07) → coleta docs (US-08) → aprovação (US-09)
--   cria recurso em `recursos`.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS solicitacoes_contratacao (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  solicitante_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  solicitante_nome TEXT,
  -- aberta | preenchida | cancelada
  status          TEXT NOT NULL DEFAULT 'aberta',
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_contratacao_contract ON solicitacoes_contratacao(contract_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_contratacao_status   ON solicitacoes_contratacao(status);

CREATE TABLE IF NOT EXISTS vagas (
  id               TEXT PRIMARY KEY,
  solicitacao_id   TEXT NOT NULL REFERENCES solicitacoes_contratacao(id) ON DELETE CASCADE,
  cargo            TEXT NOT NULL,
  qtd_total        INTEGER NOT NULL DEFAULT 1 CHECK (qtd_total > 0),
  qtd_preenchida   INTEGER NOT NULL DEFAULT 0 CHECK (qtd_preenchida >= 0),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vagas_solicitacao ON vagas(solicitacao_id);

CREATE TABLE IF NOT EXISTS candidatos (
  id                       TEXT PRIMARY KEY,
  vaga_id                  TEXT NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
  nome                     TEXT NOT NULL,
  cpf                      TEXT,
  telefone                 TEXT,
  email                    TEXT,
  -- US-06: contatado | interessado | sem_interesse
  -- US-07: reprovado_antecedentes
  -- US-09: aprovado
  status                   TEXT NOT NULL DEFAULT 'contatado',
  -- US-07: pendente | ok | reprovado
  antecedentes_status      TEXT NOT NULL DEFAULT 'pendente',
  -- Documentos como JSONB { rg, cpf, residencia, ctps, antecedentes }
  -- Cada um: { filename, storagePath, uploadedAt, mimeType, size }
  documentos               JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Após US-09, fica preenchido com o recurso criado em `recursos`.
  recurso_id               TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  observacoes              TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidatos_vaga    ON candidatos(vaga_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_status  ON candidatos(status);
CREATE INDEX IF NOT EXISTS idx_candidatos_recurso ON candidatos(recurso_id);

-- Notificações in-app pra RH (Notas: schema mínimo; pode crescer pra email/push depois).
CREATE TABLE IF NOT EXISTS notificacoes (
  id            TEXT PRIMARY KEY,
  -- Filtro: 'rh' | 'todos' | user_id específico
  destinatario  TEXT NOT NULL,
  -- Categoria pra agrupamento: 'recrutamento.nova_solicitacao' | ...
  tipo          TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  mensagem      TEXT,
  link          TEXT,
  lida          BOOLEAN NOT NULL DEFAULT FALSE,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  read_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario_lida ON notificacoes(destinatario, lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo              ON notificacoes(tipo);
