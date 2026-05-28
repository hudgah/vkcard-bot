import { useState, useEffect } from 'react'
import './App.css'

// Get Telegram user from Mini App context
const tg = window.Telegram?.WebApp
const tgUser = tg?.initDataUnsafe?.user

function Header({ page, setPage, user }) {
  return (
    <header className="header">
      <div className="header-left">
        <span className="header-logo">💳 VirtualCard</span>
      </div>
      <nav className="header-nav">
        <button
          className={`nav-btn ${page === 'home' ? 'active' : ''}`}
          onClick={() => setPage('home')}
        >
          🏠 Главная
        </button>
        <button
          className={`nav-btn ${page === 'mycards' ? 'active' : ''}`}
          onClick={() => setPage('mycards')}
        >
          🗂 Мои карты
        </button>
      </nav>
      <div className="header-right">
        <span className="header-user">👤 {user?.name || tgUser?.first_name || 'Пользователь'}</span>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <span>© 2026 VirtualCard</span>
      <div className="footer-links">
        <a href="#">Политика конфиденциальности</a>
        <a href="#">Условия использования</a>
      </div>
    </footer>
  )
}

function CardView({ card }) {
  return (
    <div className="card-wrapper">
      <div className="cardGeneral">
        <p>Тип карты <span>{card.type}</span></p>
        <p>Держатель <span>{card.holder}</span></p>
        <p>Баланс <span>{card.balance}</span></p>
        <p>Email <span>{card.email}</span></p>
      </div>
      <div className="cardDetails">
        <p>Номер карты <span>{card.number}</span></p>
        <p>Срок действия <span>{card.expiry}</span></p>
        <p>CVV <span>{card.cvv}</span></p>
      </div>
    </div>
  )
}

function HomePage({ cards, loading }) {
  if (loading) return <div className="page"><p className="status-msg">⏳ Загрузка...</p></div>
  if (!cards.length) return (
    <div className="page">
      <h1>Виртуальная карта</h1>
      <p className="status-msg">У вас пока нет карт. Нажмите /getcard в боте, чтобы выпустить первую.</p>
    </div>
  )
  return (
    <div className="page">
      <h1>Последняя карта</h1>
      <CardView card={cards[0]} />
    </div>
  )
}

function MyCardsPage({ cards, loading, setPage }) {
  if (loading) return <div className="page"><p className="status-msg">⏳ Загрузка...</p></div>
  if (!cards.length) return (
    <div className="page">
      <h1>Мои карты</h1>
      <p className="status-msg">У вас пока нет карт. Нажмите /getcard в боте, чтобы выпустить первую.</p>
    </div>
  )
  return (
    <div className="page">
      <h1>Мои карты</h1>
      {cards.map(card => (
        <div key={card.id} className="card-list-item">
          <div className="card-list-info">
            <span className="card-list-type">{card.type}</span>
            <span className="card-list-number">•••• {card.number.replace(/\s/g, '').slice(-4)}</span>
          </div>
          <span className="card-list-balance">{card.balance}</span>
        </div>
      ))}
    </div>
  )
}

function NoTelegramContext() {
  return (
    <div className="no-context">
      <p>Откройте это приложение через Telegram бота.</p>
    </div>
  )
}

function App() {
  const [page, setPage] = useState('home')
  const [cards, setCards] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tgUser?.id) { setLoading(false); return; }
    tg.ready()

    const headers = { 'x-telegram-init-data': tg.initData }

    Promise.all([
      fetch('/api/user/cards', { headers }).then(r => r.json()),
      fetch('/api/user/me', { headers }).then(r => r.json()),
    ])
      .then(([cardsData, userData]) => {
        setCards(Array.isArray(cardsData) ? cardsData : [])
        setUser(userData)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (!tgUser?.id) return <NoTelegramContext />

  return (
    <div className="layout">
      <Header page={page} setPage={setPage} user={user} />
      <main className="main">
        {page === 'home' && <HomePage cards={cards} loading={loading} />}
        {page === 'mycards' && <MyCardsPage cards={cards} loading={loading} setPage={setPage} />}
      </main>
      <Footer />
    </div>
  )
}

export default App
