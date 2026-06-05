-- Fotos de RDO em BYTEA no banco (antes: arquivos em disco efêmero do app,
-- perdidos a cada redeploy e fora do backup). Agora duráveis + no backup.
-- Os metadados (id, filename, legenda, url) continuam no JSONB `rdos.fotos`;
-- aqui guardamos o binário, keyed pelo mesmo foto id.
CREATE TABLE IF NOT EXISTS rdo_fotos (
  id          TEXT PRIMARY KEY,
  rdo_id      TEXT NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdo_fotos_rdo ON rdo_fotos(rdo_id);
