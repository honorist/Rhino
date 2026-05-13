-- Migração: Apresentação Global da Empresa + Logos de Cases
-- Idempotente. Cria tabelas e seed se ainda não existirem.

-- ============ Configurações globais (key/value) ============
-- Usada pra guardar a apresentação da empresa que vai em TODAS as propostas
-- (apresentacao, casesSucesso, segurancaSaude) e quaisquer outros toggles.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value)
VALUES ('proposta_apresentacao', jsonb_build_object(
  'apresentacao',   '',
  'casesSucesso',   '',
  'segurancaSaude', ''
))
ON CONFLICT (key) DO NOTHING;

-- ============ Logos de clientes para a seção "Cases de Sucesso" ============
-- Imagens (PNG/JPG) que aparecem em grade na proposta gerada — para clientes
-- onde a Rhino tem cases relevantes (Suzano, Arauco, etc.).
CREATE TABLE IF NOT EXISTS case_logos (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,            -- "Suzano", "Arauco", "Klabin", etc.
  cliente_id  TEXT REFERENCES clientes(id) ON DELETE SET NULL, -- opcional, vincula a cliente cadastrado
  data        BYTEA NOT NULL,           -- imagem binária
  mime_type   TEXT,
  size_bytes  INTEGER,
  ordem       INTEGER DEFAULT 0,        -- posição na grade
  ativo       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_logos_ativo ON case_logos (ativo);
CREATE INDEX IF NOT EXISTS idx_case_logos_ordem ON case_logos (ordem);

DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON app_settings;
CREATE TRIGGER trg_app_settings_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_case_logos_updated_at ON case_logos;
CREATE TRIGGER trg_case_logos_updated_at
BEFORE UPDATE ON case_logos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
