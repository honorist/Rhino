-- Rhino — Schema inicial Postgres
-- Estratégia: tabelas relacionais para entidades principais,
-- JSONB para coleções aninhadas (budget, alocações, abas) que
-- podem ser normalizadas depois conforme a necessidade real.

-- ============ Extensões ============
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ Sócios ============
CREATE TABLE IF NOT EXISTS socios (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  document      TEXT,
  email         TEXT,
  phone         TEXT,
  participacao  NUMERIC(5,2) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Níveis de Acesso ============
CREATE TABLE IF NOT EXISTS niveis_acesso (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  icon          TEXT,
  cor           TEXT,
  abas          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Clientes ============
CREATE TABLE IF NOT EXISTS clientes (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  empresa       TEXT,
  cargo         TEXT,
  setor         TEXT,
  telefone      TEXT,
  email         TEXT,
  endereco      TEXT,
  lat           TEXT,
  lng           TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes (nome);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa);

-- ============ Fornecedores ============
CREATE TABLE IF NOT EXISTS fornecedores (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  cnpj            TEXT,
  email           TEXT,
  telefone        TEXT,
  endereco        TEXT,
  pessoa_contato  TEXT,
  materiais       JSONB DEFAULT '[]'::jsonb,
  banco           TEXT,
  agencia         TEXT,
  conta           TEXT,
  chave_pix       TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Tipos Base ============
CREATE TABLE IF NOT EXISTS tipos_base (
  id            TEXT PRIMARY KEY,
  key           TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  icon          TEXT,
  cor           TEXT,
  sistema       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Base (catálogo de itens administrativos) ============
CREATE TABLE IF NOT EXISTS base_items (
  id            TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  type          TEXT,
  value         NUMERIC(15,2) DEFAULT 0,
  date          DATE,
  notes         TEXT,
  allocations   JSONB DEFAULT '[]'::jsonb,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_base_items_type ON base_items (type);

-- ============ Recursos (funcionários/colaboradores) ============
CREATE TABLE IF NOT EXISTS recursos (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL,
  cpf                 TEXT,
  data_nascimento     DATE,
  genero              TEXT,
  telefone            TEXT,
  email               TEXT,
  endereco            TEXT,
  lat                 TEXT,
  lng                 TEXT,
  status              TEXT DEFAULT 'funcionario',
  profissao           TEXT,
  data_admissao       DATE,
  salario             NUMERIC(15,2) DEFAULT 0,
  cnh                 TEXT,
  pis                 TEXT,
  data_desligamento   DATE,
  motivo_desligamento TEXT,
  obs_desligamento    TEXT,
  notas               TEXT,
  alocacao_atual      JSONB,
  historico_alocacoes JSONB DEFAULT '[]'::jsonb,
  rdo_categoria       TEXT,
  folgas              JSONB DEFAULT '[]'::jsonb,
  documentos          JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recursos_status ON recursos (status);
CREATE INDEX IF NOT EXISTS idx_recursos_nome ON recursos (nome);

-- ============ Contratos ============
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  contract_number TEXT,
  client          TEXT NOT NULL,
  client_id       TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  client_document TEXT,
  client_email    TEXT,
  client_phone    TEXT,
  value           NUMERIC(15,2) DEFAULT 0,
  currency        TEXT DEFAULT 'BRL',
  start_date      DATE,
  end_date        DATE,
  tendency_date   DATE,
  status          TEXT DEFAULT 'ativo',
  endereco        TEXT,
  lat             TEXT,
  lng             TEXT,
  notes           TEXT,
  budget          JSONB DEFAULT '[]'::jsonb,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts (end_date);

-- ============ Notas Fiscais ============
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id                 TEXT PRIMARY KEY,
  numero             TEXT NOT NULL,
  contract_id        TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  data_limite        DATE,
  valor              NUMERIC(15,2) DEFAULT 0,
  prazo_recebimento  INTEGER,
  observacoes        TEXT,
  emitida            BOOLEAN DEFAULT FALSE,
  data_emissao_real  DATE,
  caixa_entry_id     TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_contract ON notas_fiscais (contract_id);
CREATE INDEX IF NOT EXISTS idx_nf_emitida ON notas_fiscais (emitida);
CREATE INDEX IF NOT EXISTS idx_nf_data_limite ON notas_fiscais (data_limite);

-- ============ Contas a Pagar ============
CREATE TABLE IF NOT EXISTS contas_pagar (
  id                TEXT PRIMARY KEY,
  descricao         TEXT NOT NULL,
  fornecedor_id     TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  numero_n_f        TEXT,
  valor             NUMERIC(15,2) DEFAULT 0,
  data_emissao      DATE,
  data_vencimento   DATE,
  status            TEXT DEFAULT 'aberto',
  data_pagamento    DATE,
  caixa_entry_id    TEXT,
  contract_id       TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  category          TEXT,
  observacoes       TEXT,
  valor_pago        NUMERIC(15,2),
  forma_pagamento   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_status ON contas_pagar (status);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_fornecedor ON contas_pagar (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_cp_contract ON contas_pagar (contract_id);

-- ============ Caixa ============
CREATE TABLE IF NOT EXISTS caixa (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  description       TEXT NOT NULL,
  value             NUMERIC(15,2) NOT NULL,
  date              DATE NOT NULL,
  contract_id       TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  base_item_id      TEXT,
  category          TEXT,
  notes             TEXT,
  forma_pagamento   TEXT,
  conta_pagar_id    TEXT REFERENCES contas_pagar(id) ON DELETE SET NULL,
  nf_id             TEXT REFERENCES notas_fiscais(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caixa_date ON caixa (date);
CREATE INDEX IF NOT EXISTS idx_caixa_type ON caixa (type);
CREATE INDEX IF NOT EXISTS idx_caixa_contract ON caixa (contract_id);
CREATE INDEX IF NOT EXISTS idx_caixa_category ON caixa (category);

-- ============ Investimentos / Aportes ============
CREATE TABLE IF NOT EXISTS investimentos (
  id             TEXT PRIMARY KEY,
  socio_id       TEXT,
  value          NUMERIC(15,2) DEFAULT 0,
  date           DATE,
  description    TEXT,
  origem         TEXT,
  destino        TEXT,
  base_type      TEXT,
  contract_id    TEXT,
  base_item_id   TEXT,
  caixa_entry_id TEXT,
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- ============ Templates de Documentos ============
CREATE TABLE IF NOT EXISTS doc_templates (
  id                   TEXT PRIMARY KEY,
  nome                 TEXT NOT NULL,
  tipo_documento       TEXT,
  empresa_id           TEXT,
  checklist            JSONB DEFAULT '[]'::jsonb,
  periodicidade_meses  INTEGER DEFAULT 12,
  metadata             JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============ Saídas (despesas/medições por contrato) ============
CREATE TABLE IF NOT EXISTS saidas (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type          TEXT,
  description   TEXT,
  value         NUMERIC(15,2) DEFAULT 0,
  date          DATE,
  nf_id         TEXT,
  numero_bm     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saidas_contract ON saidas(contract_id);
CREATE INDEX IF NOT EXISTS idx_saidas_nf ON saidas(nf_id);

-- ============ Organograma (membros por contrato) ============
CREATE TABLE IF NOT EXISTS organograma_membros (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  recurso_id    TEXT REFERENCES recursos(id) ON DELETE SET NULL,
  nivel         TEXT,
  cargo         TEXT,
  supervisor_id TEXT,
  area          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organograma_contract ON organograma_membros(contract_id);

-- ============ RDOs (Relatório Diário de Obra) ============
CREATE TABLE IF NOT EXISTS rdos (
  id                       TEXT PRIMARY KEY,
  contract_id              TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  numero                   TEXT,
  data                     DATE,
  dia_semana               TEXT,
  os_numero                TEXT,
  ordem_compra             TEXT,
  projeto                  TEXT,
  prazo                    TEXT,
  tempo                    TEXT,
  periodo_trabalho         TEXT,
  hora_extra               TEXT,
  moi                      JSONB DEFAULT '[]'::jsonb,
  mod                      JSONB DEFAULT '[]'::jsonb,
  terc                     JSONB DEFAULT '[]'::jsonb,
  equipamentos             JSONB DEFAULT '[]'::jsonb,
  atividades               JSONB DEFAULT '[]'::jsonb,
  seguranca                JSONB DEFAULT '{}'::jsonb,
  fiscalizacao_comentarios TEXT,
  totais                   JSONB DEFAULT '{}'::jsonb,
  fotos                    JSONB DEFAULT '[]'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdos_contract ON rdos(contract_id);
CREATE INDEX IF NOT EXISTS idx_rdos_data ON rdos(data);

-- ============ Users (autenticação) ============
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  nivel_acesso_id TEXT REFERENCES niveis_acesso(id) ON DELETE SET NULL,
  socio_id        TEXT REFERENCES socios(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));

-- ============ Sessions ============
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- ============ Password reset tokens ============
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens (expires_at);

-- ============ LGPD: aceite de termos ============
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT;

-- ============ Auditoria ============
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     TEXT,
  user_email  TEXT,
  ip          TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  action      TEXT,
  status      INTEGER,
  duration_ms INTEGER,
  body        JSONB,
  request_id  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);

-- ============ Arquivos anexados a documentos de recursos ============
-- Armazena PDFs/imagens dos documentos de RH (ASO, NR-35, CNH...) como BYTEA.
-- Backup do PG cobre os arquivos automaticamente. Sem dependência de volume/disco.
CREATE TABLE IF NOT EXISTS recurso_doc_arquivos (
  id                TEXT PRIMARY KEY,
  recurso_id        TEXT NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
  doc_id            TEXT NOT NULL,
  filename          TEXT NOT NULL,
  filename_original TEXT,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  data              BYTEA NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rda_recurso ON recurso_doc_arquivos (recurso_id);
CREATE INDEX IF NOT EXISTS idx_rda_doc     ON recurso_doc_arquivos (recurso_id, doc_id);

-- ============ Trigger genérico de updated_at ============
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'socios','niveis_acesso','clientes','fornecedores',
      'base_items','recursos','contracts','notas_fiscais',
      'contas_pagar','investimentos','doc_templates','rdos','users'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
