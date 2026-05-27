'use strict';

require('dotenv').config();
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { generateCard } = require('./cardGenerator');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌  BOT_TOKEN is missing. Copy .env.example to .env and add your token.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const cardWizard = new Scenes.WizardScene(
  'card-wizard',
  async (ctx) => {
    await ctx.reply('Great! To issue your card, I just need a couple of details.\n\nWhat name should be on the card?');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.name = ctx.message.text;
    await ctx.reply('Got it! Now, what email address should we send the card details to?');
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
    `  ${card.emoji} ${card.type} Virtual Card\n` +
    `╚══════════════════════╝\n\n` +
    `💳 *Card Number*\n` +
    `\`${escMd(card.number)}\`\n\n` +
    `📅 *Expires:* \`${escMd(card.expiry)}\`    🔒 *CVV:* \`${escMd(card.cvv)}\`\n\n` +
    `👤 *Holder:* \`${escMd(card.holder)}\`\n\n` +
    `💰 *Balance:* ${escMd(card.balance)}\n\n` +
    ` *Email:* ${escMd(card.email)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌍 *Works with:*\n` +
    card.services.map(s => `  ${escMd(s)}`).join('\n') + '\n\n' +
    `⚠️ _This is a demo card with no real funds or payments_`
  );
}

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('💳 Get Virtual Card', 'get_card')],
  [Markup.button.callback('ℹ️ How it works',    'how_it_works')],
]);

// ─── Commands ────────────────────────────────────────────────────────────────

bot.start((ctx) => {
  const name = ctx.from.first_name || 'there';
  return ctx.replyWithMarkdownV2(
    `👋 Hey *${escMd(name)}*\\! Welcome to *VirtualCard Bot*\\.\n\n` +
    `Instant virtual cards for international payments — works on Amazon, Netflix, Booking, and 180\\+ more\\.\n\n` +
    `🚀 Issue your card in *2 minutes*\\.`,
    mainMenu
  );
});

bot.command('getcard', async (ctx) => {
  ctx.scene.enter('card-wizard');
});

bot.command('help',    showHelp);

// ─── Actions (button callbacks) ──────────────────────────────────────────────

bot.action('get_card', async (ctx) => {
  await ctx.answerCbQuery(escMd('Generating your card... ⏳'));
  try {
      ctx.scene.enter('card-wizard');
  } catch (err) {
    console.error('issueCard error:', err.message);
  }
});
bot.action('how_it_works', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.replyWithMarkdownV2(
    `*How it works:*\n\n` +
    `1\\. Press *Get Virtual Card*\n` +
    `2\\. Receive your card details instantly\n` +
    `3\\. Use the card number, expiry, and CVV to pay online\n\n` +
    `_Cards are virtual — no physical card is shipped\\._`,
    Markup.inlineKeyboard([[Markup.button.callback('💳 Get My Card', 'get_card')]])
  );
});

// ─── Core logic ──────────────────────────────────────────────────────────────

async function issueCard(ctx, email, name) {
  const loading = await ctx.reply('⏳ Issuing your virtual card...');
  
  // Simulate a short processing delay
  await new Promise(r => setTimeout(r, 1200));

  const card = generateCard();
  card.holder = name || ctx.from.first_name || 'John Doe';
  card.email = email

  // Delete the loading message (best-effort)
  ctx.deleteMessage(loading.message_id).catch(() => {});

  return ctx.replyWithMarkdownV2(
    formatCard(card),
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 New Card', 'get_card')],
    ])
  );
}

async function showHelp(ctx) {
  return ctx.replyWithMarkdownV2(
    `*Available commands:*\n\n` +
    `/start — Welcome screen\n` +
    `/getcard — Issue a virtual card\n` +
    `/help — Show this message`
  );
}

// MarkdownV2 requires escaping special chars
function escMd(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ─── Launch ──────────────────────────────────────────────────────────────────

bot.launch(() => console.log('🤖 Bot is running...'));

// Graceful shutdown
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
