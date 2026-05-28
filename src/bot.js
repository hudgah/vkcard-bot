'use strict';

require('dotenv').config();
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { generateCard } = require('./cardGenerator');
const { initDb, findOrCreateUser, saveCard, getUserCards, findUserByTelegramId, createRegistrationToken } = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌  BOT_TOKEN отсутствует. Скопируйте .env.example в .env и добавьте токен.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const cardWizard = new Scenes.WizardScene(
  'card-wizard',
  async (ctx) => {
    await ctx.reply('Отлично! Для выпуска карты мне нужно несколько данных.\n\nКакое имя указать на карте?');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.name = ctx.message.text;
    await ctx.reply('Принято! Теперь укажите ваш email-адрес.');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.email = ctx.message.text;
    await issueCard(ctx, ctx.wizard.state.email, ctx.wizard.state.name);
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([cardWizard]);
bot.use(session());
bot.use(stage.middleware());

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

// ─── Commands ────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const user = await findUserByTelegramId(ctx.from.id);
  if (!user || !user.password_hash) {
    await findOrCreateUser(ctx.from.id, ctx.from.first_name || 'Unknown', null);
    const TOKEN = await createRegistrationToken(ctx.from.id);
    return ctx.reply(
      "Для использования бота необходимо зарегистрироваться.\n" +
      "Пожалуйста, перейдите по ссылке ниже для создания аккаунта:\n" +
      `https://your-miniapp-url.up.railway.app/register?token=${TOKEN.token}`
    );
  } else {
  const name = ctx.from.first_name || 'друг';
  return ctx.replyWithMarkdownV2(
    `👋 Привет, *${escMd(name)}*\\! Добро пожаловать в *VirtualCard Bot*\\.\n\n` +
    `Моментальные виртуальные карты для международных платежей — работает на Amazon, Netflix, Booking и 180\\+ других сервисах\\.\n\n` +
    `🚀 Выпустите карту за *2 минуты*\\.`,
    mainMenu
  );}
});

bot.command('getcard', async (ctx) => {
  ctx.scene.enter('card-wizard');
});

bot.command('mycards', showMyCards);
bot.command('help', showHelp);

// ─── Actions (button callbacks) ──────────────────────────────────────────────

bot.action('get_card', async (ctx) => {
  await ctx.answerCbQuery('Выпускаем карту... ⏳');
  try {
    ctx.scene.enter('card-wizard');
  } catch (err) {
    console.error('Ошибка входа в сцену:', err.message);
  }
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

// ─── Core logic ──────────────────────────────────────────────────────────────

async function issueCard(ctx, email, name) {
  const loading = await ctx.reply('⏳ Выпускаем вашу виртуальную карту...');

  await new Promise(r => setTimeout(r, 1200));

  const card = generateCard();
  card.holder = name || ctx.from.first_name || 'IVAN PETROV';
  card.email = email || 'demo@example.com';

  // Save user and card to database
  try {
    const user = await findOrCreateUser(ctx.from.id, card.holder, card.email);
    await saveCard(user.id, card);
  } catch (err) {
    console.error('Ошибка БД:', err.message);
  }

  ctx.deleteMessage(loading.message_id).catch(() => {});

  return ctx.replyWithMarkdownV2(
    formatCard(card),
    Markup.inlineKeyboard([
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
