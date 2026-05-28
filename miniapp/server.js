const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const path = require('path');

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

// ─── Static files ─────────────────────────────────────────────────────────────

app.use(express.static('dist'));

// Catch-all: serve React app for any non-API route
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
