-- Rollback de 20260721170000_cotacoes. Ordem inversa das dependências:
-- filhas antes das mães (as FKs em cascata cairiam junto, mas dropamos
-- explicitamente para o rollback ser legível e determinístico).
DROP TABLE IF EXISTS ordem_compra_itens;
DROP TABLE IF EXISTS ordens_compra;
DROP TABLE IF EXISTS cotacao_precos;
DROP TABLE IF EXISTS cotacao_itens;
DROP TABLE IF EXISTS cotacoes;
