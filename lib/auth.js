/**
 * @file Autenticação: bcrypt para senhas, sessões persistidas no PG, cookie httpOnly.
 *
 * Modelo:
 *  - Login: usuário envia email+senha → `bcrypt.compare` → cria row em `sessions`
 *    + Set-Cookie `rhino_sid=<token>` HttpOnly/SameSite=Strict.
 *  - Cada request: middleware lê cookie, busca sessão válida (não expirada,
 *    usuário ativo), anexa em `req.user`. Sessões duram 7 dias (`SESSION_TTL_MS`).
 *  - Logout: deleta a row de sessions + clear-cookie.
 *  - Reset de senha: token aleatório de 64 chars persistido em
 *    `password_reset_tokens` com TTL de 1h; consumir o token também invalida
 *    todas as sessões do usuário (força re-login).
 *
 * M-05 da security review (concluído): hash/verify usam `bcrypt` nativo
 * (binding C++, 3-5× mais rápido que `bcryptjs`, mesmo custo de brute force
 * offline sem aumentar latência de login). O formato do hash ($2a$/$2b$) é
 * o mesmo entre as duas libs, então `verify()` continua validando hashes
 * antigos gerados por bcryptjs sem migração de dado nenhuma — e todo login
 * bem-sucedido regrava o hash com a lib nova (rehash-on-login em handleLogin,
 * handlers/auth.js), migrando a base organicamente por uso, sem job de bulk.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');

/** Nome do cookie de sessão. Não muda. */
const COOKIE_NAME = 'rhino_sid';
/** TTL da sessão em milissegundos (7 dias). */
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Gera um hash bcrypt da senha em texto puro.
 * Custo 10 → ~80ms em hardware moderno (compromise entre UX e segurança).
 *
 * @param {string} password
 * @returns {Promise<string>}  Hash bcrypt no formato `$2a$10$...`.
 */
function hash(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Verifica se uma senha bate com um hash bcrypt. Retorna `false` se `h` for null/undefined
 * (usuário não encontrado) — protege contra timing attacks que enumeram emails válidos
 * (todos os caminhos têm custo computacional similar).
 *
 * @param {string} password
 * @param {string | null | undefined} h
 * @returns {Promise<boolean>}
 */
function verify(password, h) {
  if (!h) return Promise.resolve(false);
  return bcrypt.compare(password, h);
}

/**
 * Regrava o hash de senha de um usuário já autenticado com a lib atual
 * (`bcrypt` nativo). Chamado após todo login bem-sucedido (handlers/auth.js)
 * — migra hashes antigos de `bcryptjs` organicamente, sem job de bulk nem
 * flag para distinguir qual lib gerou o hash (ambas usam o mesmo formato
 * $2a$/$2b$, então não dá pra saber pela string — só regravar sempre).
 *
 * @param {string} userId
 * @param {string} plainPassword  senha em texto puro, já validada por verify()
 */
async function rehashPassword(userId, plainPassword) {
  const h = await hash(plainPassword);
  await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [h, userId]);
}

/**
 * Gera um token aleatório criptograficamente forte (64 chars hex = 256 bits).
 * Usado para session ID e password reset tokens.
 *
 * @returns {string}
 */
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cria uma nova sessão para um usuário. Retorna o token (a ser definido no
 * cookie) e a data de expiração.
 *
 * @param {string} userId
 * @returns {Promise<{ id: string, expiresAt: string }>}
 */
async function createSession(userId) {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
    id,
    userId,
    expiresAt,
  ]);
  return { id, expiresAt };
}

/**
 * Remove uma sessão do banco (logout). No-op se sid for falsy.
 *
 * @param {string | null | undefined} sid
 */
async function destroySession(sid) {
  if (!sid) return;
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sid]);
}

/**
 * Busca o usuário associado a uma sessão válida (não expirada + ativo).
 *
 * @param {string | null | undefined} sid
 * @returns {Promise<object | null>}  Dados do usuário ou null.
 */
async function getUserBySession(sid) {
  if (!sid) return null;
  const row = await db.getOne(
    `SELECT u.id, u.email, u.name, u.nivel_acesso_id, u.socio_id, u.is_active,
            u.accepted_terms_at, u.accepted_terms_version, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`,
    [sid]
  );
  return row;
}

/**
 * Parseia o header `Cookie` numa request HTTP num objeto plano.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Record<string, string>}
 */
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const pair of raw.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

/**
 * Define o cookie de sessão. `Secure` é adicionado em produção (NODE_ENV).
 * `SameSite=Strict` protege contra CSRF; `HttpOnly` contra XSS reading cookies.
 *
 * @param {import('http').ServerResponse} res
 * @param {string} sid
 * @param {string} expiresAt  ISO datetime.
 */
function setSessionCookie(res, sid, expiresAt) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${sid}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Limpa o cookie de sessão (logout) via Max-Age=0.
 *
 * @param {import('http').ServerResponse} res
 */
function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Cria um novo usuário com senha bcrypt. Usado pelo CLI (`scripts/create-user.js`)
 * e pelo bootstrap. `nivelAcessoId = null` = super admin (bypass de checks).
 *
 * @param {{ email: string, password: string, name?: string, nivelAcessoId?: string|null, socioId?: string|null }} params
 * @returns {Promise<string>}  ID do novo usuário (`usr_<hex>`).
 */
async function createUser({ email, password, name, nivelAcessoId, socioId }) {
  const id = 'usr_' + crypto.randomBytes(6).toString('hex');
  const password_hash = await hash(password);
  await db.query(
    `INSERT INTO users (id, email, password_hash, name, nivel_acesso_id, socio_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      email.toLowerCase().trim(),
      password_hash,
      name || null,
      nivelAcessoId || null,
      socioId || null,
    ]
  );
  return id;
}

/**
 * Busca usuário ativo pelo email (case-insensitive).
 *
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function findUserByEmail(email) {
  return db.getOne(`SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = TRUE`, [
    email,
  ]);
}

/**
 * Atualiza `last_login_at` para `NOW()` — útil para auditoria de atividade.
 *
 * @param {string} userId
 */
async function bumpLastLogin(userId) {
  await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

/**
 * Remove sessões e reset-tokens expirados. Chamar periodicamente (cron/setInterval).
 */
async function purgeExpiredSessions() {
  await db.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
  await db.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW()`);
  // portal_sessions cresce sem limite: login do cliente (7d) + "Ver portal como
  // cliente" do admin (30 min, sessões descartáveis). Sem esta purga, só somem
  // no logout explícito. Usa idx_portal_sessions_expires.
  await db.query(`DELETE FROM portal_sessions WHERE expires_at < NOW()`);
}

/** TTL do reset token em milissegundos (1 hora). */
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

/**
 * Cria um token de reset de senha persistido em `password_reset_tokens`.
 *
 * @param {string} userId
 * @returns {Promise<{ token: string, expiresAt: string }>}
 */
async function createResetToken(userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await db.query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

/**
 * Busca um reset token válido (não expirado, não usado, usuário ativo).
 *
 * @param {string | null | undefined} token
 * @returns {Promise<object | null>}
 */
async function findValidResetToken(token) {
  if (!token) return null;
  return db.getOne(
    `SELECT t.token, t.user_id AS "userId", t.expires_at AS "expiresAt", u.email, u.name
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token = $1 AND t.expires_at > NOW() AND t.used_at IS NULL AND u.is_active = TRUE`,
    [token]
  );
}

/**
 * Consome um reset token: troca a senha + marca o token como usado + invalida
 * todas as sessões existentes do usuário (força re-login em todos os devices).
 * Atômico via transação.
 *
 * @param {string} token
 * @param {string} newPassword
 * @returns {Promise<object | null>}  Dados do token consumido ou null se inválido.
 */
async function consumeResetToken(token, newPassword) {
  const valid = await findValidResetToken(token);
  if (!valid) return null;
  const hash_ = await hash(newPassword);
  await db.withTransaction(async (client) => {
    await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
      hash_,
      valid.userId,
    ]);
    await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`, [
      token,
    ]);
    // Invalida sessões existentes (força re-login após troca de senha).
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [valid.userId]);
  });
  return valid;
}

/**
 * Registra aceitação dos termos de uso pelo usuário.
 *
 * @param {string} userId
 * @param {string} [version='1.0']
 */
async function acceptTerms(userId, version) {
  await db.query(
    `UPDATE users SET accepted_terms_at = NOW(), accepted_terms_version = $2, updated_at = NOW() WHERE id = $1`,
    [userId, version || '1.0']
  );
}

/**
 * Bootstrap: cria usuário admin a partir de `ADMIN_EMAIL` + `ADMIN_PASSWORD`
 * do env, se a tabela `users` estiver vazia. Idempotente — não recria se
 * já houver qualquer usuário.
 *
 * Chamar no startup (após conectar ao DB).
 */
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  // Alerta de segurança: senha de admin fraca/padrão (ex.: admin123). Avisa em
  // todo startup até ser trocada — credencial de super admin não pode ser trivial.
  if (password.length < 10 || /^(admin|senha|123|password|teste|test)/i.test(password)) {
    console.warn(
      '[auth] ⚠️  ADMIN_PASSWORD fraca/padrão — troque por uma senha forte (>12 chars) e remova-a do ambiente após o primeiro login.'
    );
  }
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  // nivelAcessoId: null = super admin (bypass de todos os checks de permissão)
  await createUser({ email, password, name: 'Admin', nivelAcessoId: null });
  console.log(`[auth] usuário admin criado: ${email}`);
}

module.exports = {
  COOKIE_NAME,
  hash,
  verify,
  rehashPassword,
  createSession,
  destroySession,
  getUserBySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  createUser,
  findUserByEmail,
  bumpLastLogin,
  purgeExpiredSessions,
  bootstrapAdmin,
  createResetToken,
  findValidResetToken,
  consumeResetToken,
  acceptTerms,
};
