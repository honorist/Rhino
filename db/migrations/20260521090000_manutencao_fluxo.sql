-- Migration 20260521090000 — fluxo de aprovação da Manutenção de Equipamentos.
--
-- O solicitante apenas solicita (equipamento + problema). A equipe de compras
-- avalia, definindo oficina, prazo e custo. A gerência aprova ou rejeita.
-- Ciclo de status:
--   solicitada → pendente_aprovacao → aprovada → retornado
--   (+ rejeitada / cancelada)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / ALTER ... SET DEFAULT.
ALTER TABLE manutencoes ALTER COLUMN status SET DEFAULT 'solicitada';
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS custo_estimado    NUMERIC(15,2) DEFAULT 0;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS avaliador_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS avaliador_nome    TEXT;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS avaliado_em       TIMESTAMPTZ;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS aprovador_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS aprovador_nome    TEXT;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS aprovado_em       TIMESTAMPTZ;
ALTER TABLE manutencoes ADD COLUMN IF NOT EXISTS motivo_rejeicao   TEXT;

-- Registros do modelo simples anterior (status 'em_manutencao') passam a 'aprovada'.
UPDATE manutencoes SET status = 'aprovada' WHERE status = 'em_manutencao';
