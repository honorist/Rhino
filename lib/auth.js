// Autenticação: bcrypt para senhas, sessões persistidas no PG, cookie httpOnly.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const COOKIE_NAME = 'rhino_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

function hash(password) {
  return bcrypt.hash(password, 10);
}

function verify(password, h) {
  if (!h) return Promise.resolve(false);
  return bcrypt.compare(password, h);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId) {
  const id = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await db.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [id, userId, expiresAt]
  );
  return { id, expiresAt };
}

async function destroySession(sid) {
  if (!sid) return;
  await db.query(`DELETE FROM sessions WHERE id = $1`, [sid]);
}

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

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const pair of raw.split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

function setSessionCookie(res, sid, expiresAt) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${sid}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Cria usuário (usado no CLI e no bootstrap)
async function createUser({ email, password, name, nivelAcessoId, socioId }) {
  const id = 'usr_' + crypto.randomBytes(6).toString('hex');
  const password_hash = await hash(password);
  await db.query(
    `INSERT INTO users (id, email, password_hash, name, nivel_acesso_id, socio_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email.toLowerCase().trim(), password_hash, name || null, nivelAcessoId || null, socioId || null]
  );
  return id;
}

async function findUserByEmail(email) {
  return db.getOne(
    `SELECT * FROM users WHERE lower(email) = lower($1) AND is_active = TRUE`,
    [email]
  );
}

async function bumpLastLogin(userId) {
  await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

async function purgeExpiredSessions() {
  await db.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
  await db.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW()`);
}

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hora

async function createResetToken(userId) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await db.query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

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

async function consumeResetToken(token, newPassword) {
  const valid = await findValidResetToken(token);
  if (!valid) return null;
  const hash_ = await hash(newPassword);
  await db.withTransaction(async (client) => {
    await client.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash_, valid.userId]);
    await client.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1`, [token]);
    // Invalida sessões existentes (força re-login após troca de senha)
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [valid.userId]);
  });
  return valid;
}

async function acceptTerms(userId, version) {
  await db.query(
    `UPDATE users SET accepted_terms_at = NOW(), accepted_terms_version = $2, updated_at = NOW() WHERE id = $1`,
    [userId, version || '1.0']
  );
}

// Bootstrap: cria admin se ADMIN_EMAIL+ADMIN_PASSWORD setados e nenhum usuário existe.
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  await createUser({ email, password, name: 'Admin' });
  console.log(`[auth] usuário admin criado: ${email}`);
}

module.exports = {
  COOKIE_NAME,
  hash,
  verify,
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
