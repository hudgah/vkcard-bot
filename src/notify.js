'use strict';

require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initDb, getAllUsers } = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

async function sendNotifications() {
  await initDb();
  const users = await getAllUsers();

  console.log(`Отправляем уведомления ${users.length} пользователям...`);

  for (const user of users) {
    try {
      await bot.telegram.sendMessage(
        user.telegram_id,
        '🔔 Тестовое уведомление от VirtualCard Bot!\n\nВаши виртуальные карты готовы к использованию. Используйте /mycards чтобы посмотреть их.'
      );
      console.log(`✅ Отправлено: ${user.telegram_id}`);
    } catch (err) {
      console.error(`❌ Ошибка для ${user.telegram_id}: ${err.message}`);
    }
  }

  console.log('Готово.');
  process.exit(0);
}

sendNotifications();