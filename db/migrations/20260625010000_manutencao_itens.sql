-- Migration 20260625010000 — itens (materiais) da solicitação de Manutenção.
--
-- Lista de materiais/ferramentas enviados junto com o equipamento, usada para
-- gerar o Romaneio de Material (cada item: descrição + patrimônio/código + qtd).
-- Mesmo padrão JSONB de `solicitacoes_compra.itens`.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS itens JSONB DEFAULT '[]'::jsonb;
