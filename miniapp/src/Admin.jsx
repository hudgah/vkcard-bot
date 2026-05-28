import { useState, useEffect } from 'react'
import './Admin.css'

const API = ''

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onLogin(data.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-center">
      <div className="admin-card">
        <h1>🔐 Вход в панель</h1>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Пароль администратора"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="admin-input"
          />
          {error && <p className="admin-error">{error}</p>}
          <button type="submit" className="admin-btn" disabled={loading}>
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AdminPanel({ token, onLogout }) {
  const [users, setUsers] = useState([])
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [sending, setSending] = useState(false)

  // Balance state
  const [selectedUser, setSelectedUser] = useState('')
  const [userCards, setUserCards] = useState([])
  const [selectedCard, setSelectedCard] = useState('')
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceResult, setBalanceResult] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(false)

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  useEffect(() => {
    fetch(`${API}/api/admin/users`, { headers })
      .then(r => r.json())
      .then(setUsers)
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedUser) { setUserCards([]); setSelectedCard(''); return; }
    fetch(`${API}/api/admin/user-cards?user_id=${selectedUser}`, { headers })
      .then(r => r.json())
      .then(cards => { setUserCards(cards); setSelectedCard(''); })
      .catch(console.error)
  }, [selectedUser])

  async function addBalance() {
    if (!selectedCard || !balanceAmount) return
    setBalanceLoading(true)
    setBalanceResult(null)
    try {
      const res = await fetch(`${API}/api/admin/add-balance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ card_id: selectedCard, amount: balanceAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const dollars = (data.balance_cents / 100).toFixed(2)
      setBalanceResult({ ok: true, message: `✅ Готово! Новый баланс: $${dollars}` })
      setBalanceAmount('')
      // Refresh cards list
      fetch(`${API}/api/admin/user-cards?user_id=${selectedUser}`, { headers })
        .then(r => r.json()).then(setUserCards)
    } catch (err) {
      setBalanceResult({ error: err.message })
    } finally {
      setBalanceLoading(false)
    }
  }

  async function sendNotification() {
    if (!message.trim()) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`${API}/api/admin/notify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      setResult(data)
      setMessage('')
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <span>⚙️ Панель администратора</span>
        <button className="admin-logout" onClick={onLogout}>Выйти</button>
      </header>

      <main className="admin-main">

        {/* Notification sender */}
        <section className="admin-section">
          <h2>📢 Отправить уведомление</h2>
          <textarea
            className="admin-textarea"
            placeholder="Введите сообщение для всех пользователей..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
          />
          <button
            className="admin-btn"
            onClick={sendNotification}
            disabled={sending || !message.trim()}
          >
            {sending ? 'Отправляем...' : `📨 Отправить всем (${users.length})`}
          </button>
          {result && !result.error && (
            <p className="admin-success">
              ✅ Отправлено: {result.sent} | Ошибок: {result.failed}
            </p>
          )}
          {result?.error && <p className="admin-error">❌ {result.error}</p>}
        </section>

        {/* Balance manager */}
        <section className="admin-section">
          <h2>💰 Пополнить баланс карты</h2>
          <select
            className="admin-input"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            <option value="">— Выберите пользователя —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name || u.telegram_id} ({u.email || 'нет email'})
              </option>
            ))}
          </select>

          {userCards.length > 0 && (
            <select
              className="admin-input"
              value={selectedCard}
              onChange={e => setSelectedCard(e.target.value)}
            >
              <option value="">— Выберите карту —</option>
              {userCards.map(c => (
                <option key={c.id} value={c.id}>
                  {c.type} •••• {c.number.replace(/\s/g, '').slice(-4)} — ${(c.balance_cents / 100).toFixed(2)}
                </option>
              ))}
            </select>
          )}

          {selectedCard && (
            <>
              <input
                type="number"
                className="admin-input"
                placeholder="Сумма в долларах (например, 50)"
                value={balanceAmount}
                onChange={e => setBalanceAmount(e.target.value)}
                min="0"
                step="0.01"
              />
              <button
                className="admin-btn"
                onClick={addBalance}
                disabled={balanceLoading || !balanceAmount}
              >
                {balanceLoading ? 'Пополняем...' : '💸 Пополнить'}
              </button>
            </>
          )}

          {balanceResult?.ok && <p className="admin-success">{balanceResult.message}</p>}
          {balanceResult?.error && <p className="admin-error">❌ {balanceResult.error}</p>}
        </section>

        {/* Users table */}
        <section className="admin-section">
          <h2>👥 Пользователи ({users.length})</h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Telegram ID</th>
                  <th>Имя</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Карт</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.telegram_id}</td>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                    <td>{u.card_count}</td>
                    <td>{new Date(u.created_at).toLocaleDateString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  )
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('admin_token'))

  function handleLogin(t) {
    sessionStorage.setItem('admin_token', t)
    setToken(t)
  }

  function handleLogout() {
    sessionStorage.removeItem('admin_token')
    setToken(null)
  }

  if (!token) return <LoginPage onLogin={handleLogin} />
  return <AdminPanel token={token} onLogout={handleLogout} />
}
