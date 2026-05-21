-- Rollback da migration 20260521040000 — remove o nível de acesso "Planejamento".
DELETE FROM niveis_acesso WHERE id = 'planejamento';
