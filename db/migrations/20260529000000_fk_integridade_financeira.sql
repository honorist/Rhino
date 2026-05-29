-- Migration 20260529000000 — integridade referencial nas colunas financeiras.
--
-- Várias FKs financeiras eram TEXT solto (sem REFERENCES nem índice): órfãos
-- ficavam invisíveis ao banco e lookups viravam Seq Scan. Aqui adicionamos as
-- FKs e os índices correspondentes.
--
-- Estratégia SEGURA p/ dados legados: as constraints entram como NOT VALID —
-- o Postgres NÃO valida as linhas já existentes (evita falha se houver órfãos),
-- mas ENFORÇA toda escrita futura E aplica o ON DELETE SET NULL. Depois de
-- limpar eventuais órfãos, valide o legado com:
--   ALTER TABLE investimentos VALIDATE CONSTRAINT fk_inv_socio;  (idem nas demais)
--
-- Detectar órfãos antes de validar (exemplo socio_id):
--   SELECT i.id, i.socio_id FROM investimentos i
--   LEFT JOIN socios s ON s.id = i.socio_id
--   WHERE i.socio_id IS NOT NULL AND s.id IS NULL;
--
-- Idempotente: cada ADD CONSTRAINT é guardado por checagem em pg_constraint.

-- ── investimentos → socios / contracts / base_items / caixa ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inv_socio') THEN
    ALTER TABLE investimentos ADD CONSTRAINT fk_inv_socio
      FOREIGN KEY (socio_id) REFERENCES socios(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inv_contract') THEN
    ALTER TABLE investimentos ADD CONSTRAINT fk_inv_contract
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inv_base_item') THEN
    ALTER TABLE investimentos ADD CONSTRAINT fk_inv_base_item
      FOREIGN KEY (base_item_id) REFERENCES base_items(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inv_caixa_entry') THEN
    ALTER TABLE investimentos ADD CONSTRAINT fk_inv_caixa_entry
      FOREIGN KEY (caixa_entry_id) REFERENCES caixa(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inv_socio       ON investimentos (socio_id)       WHERE socio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_contract    ON investimentos (contract_id)    WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_base_item   ON investimentos (base_item_id)   WHERE base_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_caixa_entry ON investimentos (caixa_entry_id) WHERE caixa_entry_id IS NOT NULL;

-- ── folha_pagamento → contas_pagar (vale + saldo) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fp_vale_cp') THEN
    ALTER TABLE folha_pagamento ADD CONSTRAINT fk_fp_vale_cp
      FOREIGN KEY (vale_conta_pagar_id) REFERENCES contas_pagar(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fp_saldo_cp') THEN
    ALTER TABLE folha_pagamento ADD CONSTRAINT fk_fp_saldo_cp
      FOREIGN KEY (saldo_conta_pagar_id) REFERENCES contas_pagar(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fp_vale_cp  ON folha_pagamento (vale_conta_pagar_id)  WHERE vale_conta_pagar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_saldo_cp ON folha_pagamento (saldo_conta_pagar_id) WHERE saldo_conta_pagar_id IS NOT NULL;

-- ── caixa → folha_pagamento (índice idx_caixa_folha já existe no schema) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_caixa_folha') THEN
    ALTER TABLE caixa ADD CONSTRAINT fk_caixa_folha
      FOREIGN KEY (folha_pagamento_id) REFERENCES folha_pagamento(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
