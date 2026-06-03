-- Rollback da migration 20260602000000 — remove a coluna `passarelli` de `rdos`.
ALTER TABLE rdos DROP COLUMN IF EXISTS passarelli;
