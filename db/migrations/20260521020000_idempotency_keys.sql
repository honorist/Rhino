-- Migração: idempotência em endpoints críticos.
-- Guarda a resposta de requisições que trazem o header `Idempotency-Key`,
-- para que um retry de rede com a mesma chave devolva a resposta original
-- sem reexecutar o efeito (sem duplicar lançamento/pagamento).
-- Idempotente — IF NOT EXISTS em tudo.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            TEXT PRIMARY KEY,        -- hash(method + path + Idempotency-Key)
  request_hash  TEXT,                    -- hash do corpo; detecta reuso da chave com payload diferente
  status_code   INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys (created_at);
