-- "Ver portal como cliente": sessões de portal criadas por super admin.
-- NULL = sessão real do cliente (login com senha). Preenchido = id do admin
-- que está visualizando; essas sessões expiram em 30 min (vs 7 dias da real).
-- ON DELETE CASCADE: admin removido → sessões de impersonação dele morrem
-- junto (não podem sobreviver como sessão "real" órfã).
ALTER TABLE portal_sessions
  ADD COLUMN IF NOT EXISTS impersonated_by TEXT REFERENCES users(id) ON DELETE CASCADE;
