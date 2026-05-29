const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── Telegram initData verification ─────────────────────────────────────────

function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Remove hash from the data before checking
  params.delete('hash');

  // Sort keys alphabetically and build the check string
  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // HMAC-SHA256(checkString, HMAC-SHA256("WebAppData", botToken))
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
    .digest();
  const expectedHash = crypto.createHmac('sha256', secretKey)
    .update(checkString)
    .digest('hex');

  if (expectedHash !== hash) return null;

  // Parse and return the user object from verified data
  const userJson = params.get('user');
  if (!userJson) return null;
  return JSON.parse(userJson);
}

function requireTelegramAuth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'Missing Telegram auth' });
  const user = verifyTelegramInitData(initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram initData' });
  req.tgUser = user;
  next();
}

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
  const { firstName, lastName, email, password, token, ref } = req.body;

  if (!firstName || !firstName.trim()) return res.status(400).json({ error: 'Введите имя.' });
  if (!lastName || !lastName.trim()) return res.status(400).json({ error: 'Введите фамилию.' });
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

  const fullName = `${firstName.trim()} ${lastName.trim()}`;

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
    const userResult = await pool.query(
      'UPDATE users SET password_hash = $1, email = $2, name = $3 WHERE telegram_id = $4 RETURNING *',
      [hashedPassword, email, fullName, regToken.telegram_id]
    );
    const newUser = userResult.rows[0];

    await pool.query(
      'UPDATE registration_tokens SET used = TRUE WHERE token = $1',
      [token]
    );

    // ─── Process referral ────────────────────────────────────────────────────
    if (ref) {
      const referrer = await pool.query(
        'SELECT * FROM users WHERE referral_code = $1', [ref]
      );
      const referrerUser = referrer.rows[0];

      if (referrerUser && referrerUser.id !== newUser.id) {
        const referralCount = await pool.query(
          'SELECT COUNT(*) FROM users WHERE referred_by = $1', [referrerUser.id]
        );
        const alreadyReferred = parseInt(referralCount.rows[0].count) > 0;

        if (!alreadyReferred) {
          await pool.query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrerUser.id, newUser.id]);

          const latestCard = await pool.query(
            'SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
            [referrerUser.id]
          );
          if (latestCard.rows[0]) {
            await pool.query(
              'UPDATE cards SET balance_cents = balance_cents + 500 WHERE id = $1',
              [latestCard.rows[0].id]
            );
          }

          bot.telegram.sendMessage(
            referrerUser.telegram_id,
            `🎉 Ваш реферал ${fullName} зарегистрировался! Вам начислено $5.00 на карту.`
          ).catch(() => {});
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── User API ────────────────────────────────────────────────────────────────

app.get('/api/user/cards', requireTelegramAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.* FROM cards c
       JOIN users u ON c.user_id = u.id
       WHERE u.telegram_id = $1
       ORDER BY c.created_at DESC`,
      [req.tgUser.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/user/me', requireTelegramAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role FROM users WHERE telegram_id = $1',
      [req.tgUser.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Balance API ─────────────────────────────────────────────────────────────

app.get('/api/admin/user-cards', requireAuth, async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const result = await pool.query(
      'SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/add-balance', requireAuth, async (req, res) => {
  const { card_id, amount } = req.body;
  if (!card_id || amount == null) return res.status(400).json({ error: 'card_id and amount required' });
  const cents = Math.round(parseFloat(amount) * 100);
  if (isNaN(cents) || cents < 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const result = await pool.query(
      'UPDATE cards SET balance_cents = balance_cents + $1 WHERE id = $2 RETURNING *',
      [cents, card_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Card not found' });
    res.json({ ok: true, balance_cents: result.rows[0].balance_cents });
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