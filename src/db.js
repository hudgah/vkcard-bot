'use strict';
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ─── Schema ──────────────────────────────────────────────────────────────────

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      telegram_id  BIGINT UNIQUE NOT NULL,
      name         VARCHAR(255),
      email        VARCHAR(255),
      password_hash VARCHAR(255),
      role         VARCHAR(50) DEFAULT 'user',
      created_at   TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cards (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type          VARCHAR(50),
      number        VARCHAR(20),
      expiry        VARCHAR(10),
      cvv           VARCHAR(5),
      holder        VARCHAR(255),
      balance       VARCHAR(50),
      balance_cents INTEGER DEFAULT 0,
      email         VARCHAR(255),
      created_at    TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS balance_cents INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id);
    CREATE TABLE IF NOT EXISTS registration_tokens (
    token VARCHAR(255) PRIMARY KEY,
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE
  );
  `);
  console.log('✅ База данных инициализирована');
}

// ─── Users ───────────────────────────────────────────────────────────────────
async function findUserByTelegramId(telegramId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId]
  );
  return result.rows[0];
}

async function findOrCreateUser(telegramId, name, email) {
  const existing = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const result = await pool.query(
    'INSERT INTO users (telegram_id, name, email) VALUES ($1, $2, $3) RETURNING *',
    [telegramId, name, email]
  );
  return result.rows[0];
}

async function getAllUsers() {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

async function saveCard(userId, card) {
  const result = await pool.query(
    `INSERT INTO cards (user_id, type, number, expiry, cvv, holder, balance, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, card.type, card.number, card.expiry, card.cvv, card.holder, card.balance, card.email]
  );
  return result.rows[0];
}

async function creditBalance(cardId, cents) {
  const result = await pool.query(
    'UPDATE cards SET balance_cents = balance_cents + $1 WHERE id = $2 RETURNING *',
    [cents, cardId]
  );
  return result.rows[0] || null;
}

async function deductBalance(cardId, cents) {
  const result = await pool.query(
    `UPDATE cards SET balance_cents = balance_cents - $1
     WHERE id = $2 AND balance_cents >= $1
     RETURNING *`,
    [cents, cardId]
  );
  return result.rows[0] || null;
}

async function getUserCards(telegramId) {
  const result = await pool.query(
    `SELECT c.* FROM cards c
     JOIN users u ON c.user_id = u.id
     WHERE u.telegram_id = $1
     ORDER BY c.created_at DESC`,
    [telegramId]
  );
  return result.rows;
}

// ─── Referrals ───────────────────────────────────────────────────────────────

async function getOrCreateReferralCode(userId) {
  const existing = await pool.query('SELECT referral_code FROM users WHERE id = $1', [userId]);
  if (existing.rows[0].referral_code) return existing.rows[0].referral_code;

  let code, inserted;
  do {
    code = Math.random().toString(36).substring(2, 10).toUpperCase();
    inserted = await pool.query(
      'UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code',
      [code, userId]
    );
  } while (inserted.rows.length === 0);

  return code;
}

async function getUserByReferralCode(code) {
  const result = await pool.query('SELECT * FROM users WHERE referral_code = $1', [code]);
  return result.rows[0] || null;
}

async function getReferralCount(userId) {
  const result = await pool.query('SELECT COUNT(*) FROM users WHERE referred_by = $1', [userId]);
  return parseInt(result.rows[0].count);
}

async function setReferredBy(newUserId, referrerId) {
  await pool.query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrerId, newUserId]);
}

async function getLatestCard(userId) {
  const result = await pool.query(
    'SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0] || null;
}

async function getReferrer(userId) {
  const result = await pool.query(
    `SELECT u.* FROM users u
     INNER JOIN users referred ON referred.referred_by = u.id
     WHERE referred.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

// ─── Registration Tokens ──────────────────────────────────────────────────────
async function createRegistrationToken(telegramId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO registration_tokens (token, telegram_id, expires_at)
     VALUES ($1, $2, $3)`,
    [token, telegramId, expiresAt]
  );
  return {token, expiresAt}; 
}

async function findRegistrationToken(token) {
  const result = await pool.query(
    `SELECT * FROM registration_tokens
     WHERE token = $1 AND expires_at > NOW() AND used = FALSE`,
    [token]
  );
  return result.rows[0];
}

module.exports = { initDb, findOrCreateUser, saveCard, getUserCards, getAllUsers, createRegistrationToken, findRegistrationToken, findUserByTelegramId, deductBalance, creditBalance, getOrCreateReferralCode, getUserByReferralCode, getReferralCount, setReferredBy, getLatestCard, getReferrer };
