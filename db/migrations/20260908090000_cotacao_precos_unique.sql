-- Migration 20260908090000 — evita célula duplicada na matriz de preços.
--
-- Achado da varredura 2026-09-08: `handleUpsertCotacaoPreco` fazia check-then-act
-- (lê a célula, decide create/update) sem lock nem constraint — dois cliques ou
-- dois usuários na mesma célula (cotacao_id, item_id, fornecedor_id) criavam duas
-- linhas de preço pra ela. `lib/cotacao.mapa()`/`melhorPorItem()`/`economia()`
-- passavam a operar sobre dado duplicado, e o pedido de compra gerado em seguida
-- herdava o preço errado (BR indefinida sobre qual das duas linhas "vale").
--
-- Idempotente: dedup defensivo (mantém a linha mais recente por célula) antes de
-- criar a constraint, e ADD CONSTRAINT IF NOT EXISTS via bloco condicional.

-- Dedup: se já existir célula duplicada em produção, mantém a de updated_at mais
-- recente (desempate por id) e remove as demais antes da constraint travar isso.
DELETE FROM cotacao_precos a
USING cotacao_precos b
WHERE a.cotacao_id = b.cotacao_id
  AND a.item_id = b.item_id
  AND a.fornecedor_id = b.fornecedor_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cotacao_precos_cell_unique'
  ) THEN
    ALTER TABLE cotacao_precos
      ADD CONSTRAINT cotacao_precos_cell_unique UNIQUE (cotacao_id, item_id, fornecedor_id);
  END IF;
END $$;
