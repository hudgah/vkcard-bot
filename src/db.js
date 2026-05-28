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
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type       VARCHAR(50),
      number     VARCHAR(20),
      expiry     VARCHAR(10),
      cvv        VARCHAR(5),
      holder     VARCHAR(255),
      balance    VARCHAR(50),
      email      VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );
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

module.exports = { initDb, findOrCreateUser, saveCard, getUserCards, getAllUsers, createRegistrationToken, findRegistrationToken };
