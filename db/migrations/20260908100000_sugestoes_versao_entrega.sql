-- Migration 20260908100000 — fecha o loop do canal de Sugestões.
--
-- Achado 6.1 da varredura 2026-09-08: uma sugestão aprovada e depois de fato
-- construída nunca comunicava isso ao autor — ficava presa em "aprovada" pra
-- sempre. Novo status 'implementada' (ver STATUS_VALIDOS em
-- handlers/sugestoes.js) + versao_entrega, linkando a entrega à versão real
-- do changelog.json.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
ALTER TABLE sugestoes ADD COLUMN IF NOT EXISTS versao_entrega TEXT;
