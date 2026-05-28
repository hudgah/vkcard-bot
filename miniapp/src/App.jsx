import { useState } from 'react'
import './App.css'

const MOCK_USER = 'Иван Иванов'

const MOCK_CARDS = [
  {
    id: 1,
    cardtype: 'Visa',
    email: 'user@example.com',
    number: '4111 1111 1111 1111',
    expiry: '12/25',
    cvv: '123',
    holder: 'Иван Иванов',
    balance: '$1000',
  },
  {
    id: 2,
    cardtype: 'Mastercard',
    email: 'user@example.com',
    number: '5500 0000 0000 0004',
    expiry: '08/27',
    cvv: '456',
    holder: 'Иван Иванов',
    balance: '$250',
  },
]

function Header({ page, setPage }) {
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
        <span className="header-user">👤 {MOCK_USER}</span>
        <button className="logout-btn">Выйти</button>
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
        <p>Тип карты <span>{card.cardtype}</span></p>
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

function HomePage() {
  return (
    <div className="page">
      <h1>Виртуальная карта</h1>
      <CardView card={MOCK_CARDS[0]} />
    </div>
  )
}

function MyCardsPage() {
  return (
    <div className="page">
      <h1>Мои карты</h1>
      {MOCK_CARDS.map(card => (
        <div key={card.id} className="card-list-item">
          <div className="card-list-info">
            <span className="card-list-type">{card.cardtype}</span>
            <span className="card-list-number">•••• {card.number.slice(-4)}</span>
          </div>
          <span className="card-list-balance">{card.balance}</span>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [page, setPage] = useState('home')

  return (
    <div className="layout">
      <Header page={page} setPage={setPage} />
      <main className="main">
        {page === 'home' && <HomePage />}
        {page === 'mycards' && <MyCardsPage />}
      </main>
      <Footer />
    </div>
  )
}

export default App
