-- Migration 20260601000000 — integridade financeira (parte 2).
--
-- Complementa 20260529000000. Estas colunas ainda eram TEXT solto (sem
-- REFERENCES nem índice parcial): órfãos ficavam invisíveis ao banco e o lookup
-- reverso ("qual NF/folha gerou esta entrada de caixa?") virava Seq Scan.
--
-- SEGURO p/ legado: constraints entram NOT VALID — o Postgres NÃO valida as
-- linhas já existentes (não falha se houver órfãos), mas ENFORÇA toda escrita
-- futura E aplica o ON DELETE SET NULL. Idempotente (guardas em pg_constraint /
-- IF NOT EXISTS).
--
-- Depois de limpar eventuais órfãos, valide o legado com:
--   ALTER TABLE notas_fiscais VALIDATE CONSTRAINT fk_nf_caixa_entry;  (idem nas demais)

-- ── notas_fiscais.caixa_entry_id → caixa ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_nf_caixa_entry') THEN
    ALTER TABLE notas_fiscais ADD CONSTRAINT fk_nf_caixa_entry
      FOREIGN KEY (caixa_entry_id) REFERENCES caixa(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_nf_caixa_entry ON notas_fiscais (caixa_entry_id) WHERE caixa_entry_id IS NOT NULL;

-- ── contas_pagar.caixa_entry_id → caixa ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cp_caixa_entry') THEN
    ALTER TABLE contas_pagar ADD CONSTRAINT fk_cp_caixa_entry
      FOREIGN KEY (caixa_entry_id) REFERENCES caixa(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_cp_caixa_entry ON contas_pagar (caixa_entry_id) WHERE caixa_entry_id IS NOT NULL;

-- ── folha_pagamento.(vale|saldo)_caixa_entry_id → caixa ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fp_vale_caixa') THEN
    ALTER TABLE folha_pagamento ADD CONSTRAINT fk_fp_vale_caixa
      FOREIGN KEY (vale_caixa_entry_id) REFERENCES caixa(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fp_saldo_caixa') THEN
    ALTER TABLE folha_pagamento ADD CONSTRAINT fk_fp_saldo_caixa
      FOREIGN KEY (saldo_caixa_entry_id) REFERENCES caixa(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_fp_vale_caixa  ON folha_pagamento (vale_caixa_entry_id)  WHERE vale_caixa_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_saldo_caixa ON folha_pagamento (saldo_caixa_entry_id) WHERE saldo_caixa_entry_id IS NOT NULL;

-- ── saidas.nf_id → notas_fiscais (troca índice cheio por parcial) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_saidas_nf') THEN
    ALTER TABLE saidas ADD CONSTRAINT fk_saidas_nf
      FOREIGN KEY (nf_id) REFERENCES notas_fiscais(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_saidas_nf;
CREATE INDEX IF NOT EXISTS idx_saidas_nf ON saidas (nf_id) WHERE nf_id IS NOT NULL;
