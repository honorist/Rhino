-- Migração: tabela login_attempts para rate limit persistente.
--
-- Substitui o bucket in-memory de lib/rate-limit.js (que zerava em cada
-- restart do processo — Railway redeploya frequentemente, atacante ganhava
-- 5 tentativas fresquinhas após cada deploy).
--
-- A tabela armazena tentativas com chave composta (key) que combina IP + email
-- ou IP + rota (igual à clientKey do módulo). Cada `check()` faz SELECT COUNT
-- sobre a janela; cada falha grava INSERT; cleanup é feito por cron diário.
--
-- Idempotente: rerun não recria tabela nem índice.

CREATE TABLE IF NOT EXISTS login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice cobre os dois patterns:
--  1. COUNT WHERE key = $1 AND created_at > NOW() - INTERVAL
--  2. SELECT id WHERE key = $1 ORDER BY created_at DESC LIMIT 1 (refund)
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_created
  ON login_attempts (key, created_at DESC);

-- Índice para o cleanup periódico (DELETE WHERE created_at < cutoff)
CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON login_attempts (created_at);
