-- Migration 20260602000000 — Canal de Sugestões dos Colaboradores (RaiaPro História 2).
--
-- Qualquer usuário autenticado envia sugestões; gerentes (perfil com
-- 'edit:#/sugestoes' ou super admin) movem o status:
--   pendente → em_analise → aprovada → descartada
-- com comentário. Descarte exige justificativa. As aprovadas formam um backlog
-- público interno. Anexo (foto) opcional em BYTEA (igual proposta_anexos).
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS sugestoes (
  id                     TEXT PRIMARY KEY,
  autor_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  autor_nome             TEXT,                          -- snapshot do nome do autor
  titulo                 TEXT NOT NULL,
  descricao              TEXT NOT NULL,
  area                   TEXT,                          -- RDO | equipes | relatorios | ... (livre)
  -- pendente | em_analise | aprovada | descartada
  status                 TEXT NOT NULL DEFAULT 'pendente',
  comentario_gestor      TEXT,
  justificativa_descarte TEXT,
  gestor_id              TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- histórico de transições: [{ de, para, por, porNome, comentario, em }]
  historico              JSONB NOT NULL DEFAULT '[]'::jsonb,
  tem_anexo              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sugestoes_status ON sugestoes(status);
CREATE INDEX IF NOT EXISTS idx_sugestoes_autor  ON sugestoes(autor_id);

CREATE TABLE IF NOT EXISTS sugestao_anexos (
  id          TEXT PRIMARY KEY,
  sugestao_id TEXT NOT NULL REFERENCES sugestoes(id) ON DELETE CASCADE,
  nome        TEXT,
  data        BYTEA NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sugestao_anexos_sugestao ON sugestao_anexos(sugestao_id);
