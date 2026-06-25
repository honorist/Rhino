-- Migration 20260625020000 — número sequencial do Romaneio (RM-NNN-AAAA).
--
-- O número do romaneio é atribuído quando a manutenção é criada e fica gravado
-- (vínculo permanente com o pedido). É sequencial POR ANO de criação:
-- RM-001-2026, RM-002-2026, ... reiniciando a cada ano.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + backfill só onde está nulo.
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS romaneio_numero INTEGER;

-- Backfill: numera os registros existentes em ordem de criação, por ano.
WITH seq AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM created_at)
           ORDER BY created_at, numero
         ) AS rn
  FROM manutencoes
)
UPDATE manutencoes m
   SET romaneio_numero = seq.rn
  FROM seq
 WHERE m.id = seq.id
   AND m.romaneio_numero IS NULL;
