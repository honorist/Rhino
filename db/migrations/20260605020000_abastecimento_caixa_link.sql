-- Vincula o abastecimento ao lançamento de caixa que ele gera, permitindo
-- estorno/sincronização ao editar/excluir o abastecimento. Antes: PUT/DELETE
-- deixavam a saída de caixa órfã (bug de integridade financeira).
ALTER TABLE veiculo_abastecimentos
  ADD COLUMN IF NOT EXISTS caixa_entry_id TEXT REFERENCES caixa(id) ON DELETE SET NULL;
