'use strict';

require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { generateCard } = require('./cardGenerator');
const { initDb, findOrCreateUser, saveCard, getUserCards, findUserByTelegramId, createRegistrationToken, deductBalance, getOrCreateReferralCode, getReferralCount } = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌  BOT_TOKEN отсутствует. Скопируйте .env.example в .env и добавьте токен.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

bot.use(session());

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCard(card) {
  return (
    `╔══════════════════════╗\n` +
    `  ${card.emoji} Виртуальная карта ${escMd(card.type)}\n` +
    `╚══════════════════════╝\n\n` +
    `💳 *Номер карты*\n` +
    `\`${escMd(card.number)}\`\n\n` +
    `📅 *Срок действия:* \`${escMd(card.expiry)}\`    🔒 *CVV:* \`${escMd(card.cvv)}\`\n\n` +
    `👤 *Держатель:* \`${escMd(card.holder)}\`\n\n` +
    `💰 *Баланс:* ${escMd(card.balance)}\n\n` +
    `📧 *Email:* ${escMd(card.email)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌍 *Работает с:*\n` +
    card.services.map(s => `  ${escMd(s)}`).join('\n') + '\n\n' +
    `⚠️ _Это демо\\-карта без реальных средств и платежей_`
  );
}

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('💳 Получить виртуальную карту', 'get_card')],
  [Markup.button.callback('ℹ️ Как это работает', 'how_it_works')],
  [Markup.button.url('Открыть Страницу', 'https://t.me/vkcard_bot/VCard')]
]);

// ─── Registration guard ──────────────────────────────────────────────────────

async function requireRegistration(ctx) {
  const user = await findUserByTelegramId(ctx.from.id);
  if (!user || !user.password_hash) {
    await findOrCreateUser(ctx.from.id, ctx.from.first_name || 'Unknown', null);
    const TOKEN = await createRegistrationToken(ctx.from.id);
    await ctx.reply(
      "Для использования этой функции необходимо зарегистрироваться.\n" +
      "Перейдите по ссылке ниже для создания аккаунта:\n" +
      `https://upbeat-simplicity-production-60b3.up.railway.app/register?token=${TOKEN.token}`
    );
    return false;
  }
  return true;
}

// ─── Commands ────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const user = await findUserByTelegramId(ctx.from.id);
  if (!user || !user.password_hash) {
    await findOrCreateUser(ctx.from.id, ctx.from.first_name || 'Unknown', null);
    const TOKEN = await createRegistrationToken(ctx.from.id);
    const refPayload = ctx.startPayload?.startsWith('ref_') ? `&ref=${ctx.startPayload.slice(4)}` : '';
    return ctx.reply(
      "Для использования бота необходимо зарегистрироваться.\n" +
      "Пожалуйста, перейдите по ссылке ниже для создания аккаунта:\n" +
      `https://upbeat-simplicity-production-60b3.up.railway.app/register?token=${TOKEN.token}${refPayload}`
    );
  }
  const name = ctx.from.first_name || 'друг';
  return ctx.replyWithMarkdownV2(
    `👋 Привет, *${escMd(name)}*\\! Добро пожаловать в *VirtualCard Bot*\\.\n\n` +
    `Моментальные виртуальные карты для международных платежей — работает на Amazon, Netflix, Booking и 180\\+ других сервисах\\.\n\n` +
    `🚀 Выпустите карту за *2 минуты*\\.`,
    mainMenu
  );
});

bot.command('referral', async (ctx) => {
  if (!await requireRegistration(ctx)) return;
  const user = await findUserByTelegramId(ctx.from.id);
  const code = await getOrCreateReferralCode(user.id);
  const count = await getReferralCount(user.id);
  const remaining = 1 - count;
  const link = `https://t.me/${ctx.botInfo.username}?start=ref_${code}`;
  return ctx.reply(
    `🔗 Ваша реферальная ссылка:\n${link}\n\n` +
    `Приглашений использовано: ${count}/1\n` +
    (remaining > 0
      ? `Вы можете пригласить ещё ${remaining} человека. Когда они зарегистрируются, вы получите $5 на карту.`
      : `Вы уже использовали своё приглашение.`)
  );
});

bot.command('getcard', async (ctx) => {
  if (!await requireRegistration(ctx)) return;
  await issueCard(ctx);
});

bot.command('mycards', async (ctx) => {
  if (!await requireRegistration(ctx)) return;
  showMyCards(ctx);
});
bot.command('help', showHelp);

// ─── Actions (button callbacks) ──────────────────────────────────────────────

bot.action('get_card', async (ctx) => {
  await ctx.answerCbQuery();
  if (!await requireRegistration(ctx)) return;
  await issueCard(ctx);
});

bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.replyWithMarkdownV2(
    `*Как это работает:*\n\n` +
    `1\\. Нажмите *Получить виртуальную карту*\n` +
    `2\\. Мгновенно получите данные карты\n` +
    `3\\. Используйте номер карты, срок действия и CVV для оплаты онлайн\n\n` +
    `_Карты виртуальные — физическая карта не выпускается\\._`,
    Markup.inlineKeyboard([[Markup.button.callback('💳 Получить мою карту', 'get_card')]])
  );
});

bot.action(/^pay_10:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const cardId = ctx.match[1];
  const result = await deductBalance(cardId, 1000);
  if (!result) {
    return ctx.reply('❌ Недостаточно средств. Пополните баланс карты.');
  }
  const newBalance = (result.balance_cents / 100).toFixed(2);
  return ctx.reply(`✅ Оплата $10.00 прошла успешно\\. Остаток на карте: *$${escMd(newBalance)}*`, { parse_mode: 'MarkdownV2' });
});

// ─── Core logic ──────────────────────────────────────────────────────────────

async function issueCard(ctx) {
  const user = await findUserByTelegramId(ctx.from.id);
  const existing = await getUserCards(ctx.from.id);
  if (existing.length >= 3) {
    return ctx.reply('У вас уже 3 карты — это максимум. Используйте /mycards для просмотра ваших карт.');
  }

  const loading = await ctx.reply('⏳ Выпускаем вашу виртуальную карту...');

  await new Promise(r => setTimeout(r, 1200));
  const card = generateCard();
  card.holder = user.name ? user.name.toUpperCase() : (ctx.from.first_name || 'CARDHOLDER');
  card.email = user.email || 'demo@example.com';

  let savedCard;
  try {
    savedCard = await saveCard(user.id, card);
  } catch (err) {
    console.error('Ошибка БД:', err.message);
  }

  ctx.deleteMessage(loading.message_id).catch(() => {});

  return ctx.replyWithMarkdownV2(
    formatCard(card),
    Markup.inlineKeyboard([
      [Markup.button.callback('💸 Оплатить $10', `pay_10:${savedCard.id}`)],
      [Markup.button.callback('🔄 Новая карта', 'get_card')],
      [Markup.button.url('Открыть Страницу', 'https://t.me/vkcard_bot/VCard')]
    ])
  );
}

async function showMyCards(ctx) {
  try {
    const cards = await getUserCards(ctx.from.id);
    if (cards.length === 0) {
      return ctx.reply('У вас пока нет карт. Нажмите /getcard чтобы выпустить первую.');
    }

    const lines = cards.map((c, i) =>
      `${i + 1}\\. *${escMd(c.type)}* \\— \`${escMd(c.number)}\` \\(${escMd(c.expiry)}\\)`
    ).join('\n');

    return ctx.replyWithMarkdownV2(`*Ваши карты:*\n\n${lines}`);
  } catch (err) {
    console.error('Ошибка получения карт:', err.message);
    return ctx.reply('Не удалось загрузить карты. Попробуйте позже.');
  }
}

async function showHelp(ctx) {
  return ctx.replyWithMarkdownV2(
    `*Доступные команды:*\n\n` +
    `/start — Главный экран\n` +
    `/getcard — Выпустить виртуальную карту\n` +
    `/mycards — Мои карты\n` +
    `/help — Показать это сообщение`
  );
}

// MarkdownV2 requires escaping special chars
function escMd(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ─── Launch ──────────────────────────────────────────────────────────────────

initDb()
  .then(() => bot.launch(() => console.log('🤖 Бот запущен...')))
  .catch(err => {
    console.error('Ошибка инициализации БД:', err.message);
    process.exit(1);
  });

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
