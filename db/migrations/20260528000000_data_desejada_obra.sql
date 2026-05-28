-- Migration 20260528000000 — campo "data desejada na obra" em SCs e contratações.
-- Permite que o solicitante informe até quando o material/recurso precisa estar
-- na obra, para que financeiro/RH possam trabalhar com esse prazo visível desde
-- a criação. Alimenta o módulo Agenda (endpoint /api/agenda/eventos).

ALTER TABLE solicitacoes_compra
  ADD COLUMN IF NOT EXISTS data_desejada_obra DATE;

ALTER TABLE solicitacoes_contratacao
  ADD COLUMN IF NOT EXISTS data_desejada_obra DATE;
