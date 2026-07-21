-- Rollback de 20260720140000_rdo_apontamentos.
DROP TABLE IF EXISTS rdo_apontamentos;
ALTER TABLE atividades DROP COLUMN IF EXISTS hh_plan;
