-- Rollback de 20260521020000_idempotency_keys.sql
DROP INDEX IF EXISTS idx_idempotency_created;
DROP TABLE IF EXISTS idempotency_keys;
