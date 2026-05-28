const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const path = require('path');
const bcrypt = require('bcrypt');
const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── JWT Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = header.slice(7);
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token });
});

// ─── Admin API ────────────────────────────────────────────────────────────────

app.get('/api/admin/users', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, COUNT(c.id) AS card_count
      FROM users u
      LEFT JOIN cards c ON c.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/notify', requireAuth, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

  try {
    const result = await pool.query('SELECT telegram_id FROM users');
    const users = result.rows;

    let sent = 0, failed = 0;
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, message);
        sent++;
      } catch {
        failed++;
      }
    }
    res.json({ sent, failed, total: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ─── Registration API ───────────────────────────────
app.post('/api/register', async (req, res) => {
  const { email, password, token } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email-адрес.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов.' });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен содержать хотя бы одну заглавную букву.' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Пароль должен содержать хотя бы одну цифру.' });
  }
  if (!token) {
    return res.status(400).json({ error: 'Токен отсутствует.' });
  }

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM registration_tokens WHERE token = $1 AND expires_at > NOW() AND used = FALSE',
      [token]
    );
    const regToken = tokenResult.rows[0];
    if (!regToken) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, email = $2 WHERE telegram_id = $3',
      [hashedPassword, email, regToken.telegram_id]
    );
    await pool.query(
      'UPDATE registration_tokens SET used = TRUE WHERE token = $1',
      [token]
    );
    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User API ────────────────────────────────────────────────────────────────

app.get('/api/user/cards', async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    const result = await pool.query(
      `SELECT c.* FROM cards c
       JOIN users u ON c.user_id = u.id
       WHERE u.telegram_id = $1
       ORDER BY c.created_at DESC`,
      [telegram_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/me', async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE telegram_id = $1',
      [telegram_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Static files ─────────────────────────────────────────────────────────────

app.use(express.static('dist'));

// Catch-all: serve React app for any non-API route
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});