import { useState, useEffect } from 'react'
import './Register.css'

function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token')
    if (urlToken) setToken(urlToken)
  }, [])

  function validate() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return 'Введите корректный email-адрес.'
    if (password.length < 8) return 'Пароль должен содержать не менее 8 символов.'
    if (!/[A-Z]/.test(password)) return 'Пароль должен содержать хотя бы одну заглавную букву.'
    if (!/[0-9]/.test(password)) return 'Пароль должен содержать хотя бы одну цифру.'
    return null
  }

  async function handleRegister(e) {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return; }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Что-то пошло не так')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="register-center">
        <div className="register-card">
          <div className="register-success-icon">✅</div>
          <h1>Аккаунт создан!</h1>
          <p className="register-success-text">
            Вернитесь в Telegram и нажмите <strong>/start</strong> — бот уже знает, что вы зарегистрированы.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="register-center">
      <div className="register-card">
        <div className="register-logo">💳</div>
        <h1>Создать аккаунт</h1>
        <p className="register-subtitle">Введите данные для входа в VirtualCard</p>
        <form onSubmit={handleRegister}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="register-input"
            required
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="register-input"
            required
          />
          {error && <p className="register-error">{error}</p>}
          <button type="submit" className="register-btn" disabled={loading || !token}>
            {loading ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
          </button>
          {!token && (
            <p className="register-error">Ссылка недействительна. Запросите новую через бот.</p>
          )}
        </form>
      </div>
    </div>
  )
}

export default RegisterPage
