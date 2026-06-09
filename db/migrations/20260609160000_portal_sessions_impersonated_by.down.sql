-- Rollback de "Ver portal como cliente": remove a marcação de impersonação.
-- Sessões impersonadas ativas viram sessões comuns até expirarem (TTL 30 min).
ALTER TABLE portal_sessions DROP COLUMN IF EXISTS impersonated_by;
