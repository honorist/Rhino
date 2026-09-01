-- Rollback da migration 20260901110000.
ALTER TABLE users DROP COLUMN IF EXISTS notif_tipos_desativados;
