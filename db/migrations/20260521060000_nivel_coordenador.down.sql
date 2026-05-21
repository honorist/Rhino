-- Rollback da migration 20260521060000 — remove o nível de acesso "Coordenador".
DELETE FROM niveis_acesso WHERE id = 'coordenador';
