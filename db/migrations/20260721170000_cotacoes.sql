-- Migration 20260721170000 — Mapa de cotações e Pedido de Compra (item 13).
--
-- Fluxo de compras do sistema: para um conjunto de ITENS que se quer comprar,
-- coletam-se PREÇOS de vários fornecedores — a matriz item×fornecedor do "mapa
-- de cotações". Compara-se (menor preço por item, total por fornecedor, economia)
-- e emite-se um PEDIDO DE COMPRA (PO) do fornecedor vencedor.
--
-- Cinco tabelas:
--   cotacoes            — a cotação (cabeçalho), opcionalmente ligada a uma obra.
--   cotacao_itens       — o que se quer comprar (as LINHAS da matriz).
--   cotacao_precos      — matriz esparsa: uma célula (item, fornecedor, preço).
--   ordens_compra       — o pedido emitido para um fornecedor (cabeçalho).
--   ordem_compra_itens  — os itens do pedido, com preço snapshot da cotação.
--
-- Decisões de FK:
--   * contract_id ON DELETE SET NULL — a cotação/PO é histórico de compras e
--     sobrevive à remoção da obra (não deve sumir junto).
--   * fornecedor_id ON DELETE SET NULL — o preço/PO preserva o registro mesmo
--     que o cadastro do fornecedor seja apagado (some só a referência).
--   * cotacao_id / item_id / ordem_id ON DELETE CASCADE nas tabelas-filhas —
--     itens e preços não fazem sentido sem a cotação; itens do PO, sem o PO.
--   * cotacao_precos.item_id CASCADE — apagar um item da cotação limpa suas
--     células de preço automaticamente.
--
-- ordem_compra_itens grava descricao/unidade/quantidade/preco_unit por VALOR
-- (não por FK ao item da cotação): o pedido é uma foto do momento da emissão e
-- não deve mudar se a cotação for editada depois.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS cotacoes (
  id             TEXT PRIMARY KEY,
  contract_id    TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  descricao      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aberta',   -- aberta | em_analise | fechada | cancelada
  data_abertura  DATE,
  observacoes    TEXT DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_contract ON cotacoes(contract_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_status   ON cotacoes(status);

CREATE TABLE IF NOT EXISTS cotacao_itens (
  id          TEXT PRIMARY KEY,
  cotacao_id  TEXT NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  descricao   TEXT NOT NULL,
  unidade     TEXT DEFAULT 'un',
  quantidade  NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_itens_cotacao ON cotacao_itens(cotacao_id);

-- Matriz item×fornecedor: uma linha por célula preenchida. cotacao_id
-- denormalizado (além de item_id) para carregar/filtrar a matriz inteira da
-- cotação sem JOIN em cotacao_itens.
CREATE TABLE IF NOT EXISTS cotacao_precos (
  id             TEXT PRIMARY KEY,
  cotacao_id     TEXT NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES cotacao_itens(id) ON DELETE CASCADE,
  fornecedor_id  TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  preco_unit     NUMERIC DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_cotacao    ON cotacao_precos(cotacao_id);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_item       ON cotacao_precos(item_id);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_fornecedor ON cotacao_precos(fornecedor_id);

CREATE TABLE IF NOT EXISTS ordens_compra (
  id             TEXT PRIMARY KEY,
  cotacao_id     TEXT REFERENCES cotacoes(id) ON DELETE SET NULL,
  fornecedor_id  TEXT REFERENCES fornecedores(id) ON DELETE SET NULL,
  contract_id    TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  numero         TEXT,
  status         TEXT DEFAULT 'emitida',   -- emitida | recebida | cancelada
  valor_total    NUMERIC DEFAULT 0,
  data_emissao   DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_cotacao    ON ordens_compra(cotacao_id);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_fornecedor ON ordens_compra(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_contract   ON ordens_compra(contract_id);

CREATE TABLE IF NOT EXISTS ordem_compra_itens (
  id          TEXT PRIMARY KEY,
  ordem_id    TEXT NOT NULL REFERENCES ordens_compra(id) ON DELETE CASCADE,
  descricao   TEXT,
  unidade     TEXT DEFAULT 'un',
  quantidade  NUMERIC DEFAULT 0,
  preco_unit  NUMERIC DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ordem_compra_itens_ordem ON ordem_compra_itens(ordem_id);
