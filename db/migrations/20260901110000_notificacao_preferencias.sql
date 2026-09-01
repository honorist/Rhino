-- Migration 20260901110000 — preferências de notificação por usuário (F19).
--
-- O sino de notificações (js/notificacoes.js) hoje não tem nenhuma
-- configuração — o usuário não escolhe o que quer ser notificado.
-- `notif_tipos_desativados`: array de strings com os `tipo` de notificação
-- (ex.: 'sugestao.status', 'punch.atribuido') que o usuário desativou. Vazio
-- por padrão = recebe tudo (comportamento atual preservado).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_tipos_desativados JSONB NOT NULL DEFAULT '[]'::jsonb;
