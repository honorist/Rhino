-- Migração: força todos os usuários a fazer login novamente.
--
-- Motivo: após a v1.2.8 (gerente ganhou edit:* em 11 rotas) e v1.2.11 (CSP
-- fechada + rate-limit em PG), as sessões em memória/cookies dos usuários
-- ainda carregavam o snapshot antigo de permissões. Limpar todas as sessões
-- garante que cada usuário receba o objeto `permissions` atualizado pelo
-- servidor no próximo login.
--
-- Efeito: usuários são deslogados e veem a tela de login na próxima request
-- (cookie de sessão fica inválido — a row de sessions/portal_sessions some).
--
-- One-shot: o controle de migrations garante que roda APENAS uma vez.
-- Se precisar forçar de novo no futuro, crie outro arquivo com timestamp novo.
DELETE FROM sessions;
DELETE FROM portal_sessions;
