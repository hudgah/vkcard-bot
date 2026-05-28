'use strict';

const CARD_TYPES = [
  { name: 'Visa', prefix: '4', emoji: '💳' },
  { name: 'Mastercard', prefix: '5', emoji: '💳' },
];

const SUPPORTED_SERVICES = [
  '🛒 Магазины: Amazon, eBay',
  '🎬 Подписки: Netflix, Spotify, Patreon',
  '☁️  Сервисы: Dropbox, GitHub, Adobe',
  '✈️  Путешествия: Booking, Airbnb, Agoda',
  '🌍 Покупки в 180+ странах',
];

/**
 * Returns a random integer between min and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates a fake card number that passes basic Luhn check formatting.
 * NOT a real card number — placeholder only.
 */
function generateCardNumber(prefix) {
  let number = prefix;
  while (number.length < 15) {
    number += randInt(0, 9);
  }
  // Simple checksum digit (Luhn)
  const digits = number.split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i -= 2) {
    let d = digits[i] * 2;
    if (d > 9) d -= 9;
    sum += d;
  }
  for (let i = digits.length - 2; i >= 0; i -= 2) {
    sum += digits[i];
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  number += checkDigit;

  // Format as XXXX XXXX XXXX XXXX
  return number.match(/.{1,4}/g).join(' ');
}

/**
 * Generates an expiry date 2–4 years from now.
 */
function generateExpiry() {
  const now = new Date();
  const year = now.getFullYear() + randInt(2, 4);
  const month = String(randInt(1, 12)).padStart(2, '0');
  return `${month}/${String(year).slice(-2)}`;
}

/**
 * Generates a random 3-digit CVV.
 */
function generateCVV() {
  return String(randInt(100, 999));
}

/**
 * Returns a full virtual card object with placeholder data.
 */
function generateCard(email, name) {
  const type = CARD_TYPES[randInt(0, CARD_TYPES.length - 1)];
  return {
    email:   email || 'john.doe@example.com',
    type:    type.name,
    emoji:   type.emoji,
    number:  generateCardNumber(type.prefix),
    expiry:  generateExpiry(),
    cvv:     generateCVV(),
    holder:  name || 'John Doe',
    balance: '$0.00',
    services: SUPPORTED_SERVICES,
  };
}

module.exports = { generateCard };
