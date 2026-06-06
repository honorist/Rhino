-- RIN-XXX: cidade/UF de residência do colaborador (exibido na listagem de
-- Recursos no lugar de "Obra Atual"). Antes só havia `endereco` (texto livre).
ALTER TABLE recursos
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT;
