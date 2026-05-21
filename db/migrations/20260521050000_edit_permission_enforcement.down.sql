-- Rollback da migration 20260521050000.
--
-- Esta migration é ADITIVA (só acrescentou flags 'edit:#/rota' já implícitas no
-- comportamento anterior). Não há rollback de dados seguro: remover os 'edit:'
-- apagaria também os que já existiam antes (ex.: concedidos pela 20260517000000).
--
-- Para reverter de fato, reverta o código do checkMutationPermission (volta a
-- checar '#/rota' em vez de 'edit:#/rota') — com o C-04 no modo antigo, as flags
-- 'edit:' extras ficam inertes. Nenhuma ação de banco é necessária aqui.
SELECT 1;
