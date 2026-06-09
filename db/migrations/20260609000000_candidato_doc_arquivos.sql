-- Documentos de candidato em BYTEA no banco (Etapa 4.3 — US-08/US-09).
--
-- Antes: o upload guardava só metadados ({filename, storagePath}) no JSONB
-- `candidatos.documentos` — o binário nunca era persistido (mesmo bug das fotos
-- de RDO antes do BYTEA). Agora o arquivo vive no banco, cifrado em repouso
-- (LGPD, lib/crypto-pii), durável e dentro do backup automático.
--
-- Espelha recurso_doc_arquivos, keyed por (candidato_id, tipo). O handler faz
-- DELETE-antes-de-INSERT (um arquivo por tipo, re-upload substitui). Os metadados
-- continuam referenciados no JSONB `candidatos.documentos[tipo]`.
--
-- Migration-only (não vai pro schema.sql): a tabela `candidatos` é criada por
-- migration (20260524000000), depois do schema.sql baseline — então a FK só
-- resolve aqui, na cadeia de migrations.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS candidato_doc_arquivos (
  id                TEXT PRIMARY KEY,
  candidato_id      TEXT NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,            -- rg | cpf | residencia | ctps | antecedentes
  filename          TEXT NOT NULL,
  filename_original TEXT,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  data              BYTEA NOT NULL,           -- cifrado em repouso (LGPD)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cda_candidato ON candidato_doc_arquivos (candidato_id);
CREATE INDEX IF NOT EXISTS idx_cda_tipo      ON candidato_doc_arquivos (candidato_id, tipo);
