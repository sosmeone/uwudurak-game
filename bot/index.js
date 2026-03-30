require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // https://your-domain.com

const bot = new TelegramBot(TOKEN, { polling: true });

// ---- /start ----
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const name = msg.from.first_name ?? 'Гравець';
  const param = match?.[1];

  if (param && param.startsWith('invite_')) {
    const inviteToken = param.replace('invite_', '');
    const gameUrl = `${WEBAPP_URL}?userId=${msg.from.id}&username=${encodeURIComponent(name)}&invite=${inviteToken}`;
    return bot.sendMessage(msg.chat.id,
      `🃏 *${name}, тебе запросили на гру в Дурак!*\n\nНатисни кнопку щоб приєднатись:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Приєднатись до гри', web_app: { url: gameUrl } }
          ]]
        }
      }
    );
  }

  const gameUrl = `${WEBAPP_URL}?userId=${msg.from.id}&username=${encodeURIComponent(name)}`;

  bot.sendPhoto(msg.chat.id,
    'https://raw.githubusercontent.com/sosmeone/uwudurak-game/main/welcome.jpg',
    {
      caption:
        `♠️ *Привіт, ${name}\\!*\n\n` +
        `Ласкаво просимо у *ДУРАК* — найкращу карткову гру в Telegram\\!\n\n` +
        `🃏 Грай *1 на 1* з друзями або знаходь суперника онлайн\n` +
        `⚡️ Реальний час — жодних очікувань\n` +
        `🏆 Доведи що ти не дурак\\!\n\n` +
        `Натисни кнопку нижче і починай\\! 👇`,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Грати в Дурака', web_app: { url: gameUrl } }],
          [{ text: '👥 Запросити друга', callback_data: `invite_${msg.from.id}` }],
          [{ text: '📖 Правила гри', callback_data: 'rules' }]
        ]
      }
    }
  );
});

// ---- /help ----
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *Правила Дурака*\n\n` +
    `• Колода 36 карт (від 6 до туза)\n` +
    `• Кожному гравцю роздається 6 карт\n` +
    `• Козир визначається останньою картою колоди\n\n` +
    `*Хід гри:*\n` +
    `1. Атакуючий кидає карту\n` +
    `2. Захисник повинен відбити карту старшою картою тієї ж масті або козирем\n` +
    `3. Якщо не може — бере всі карти зі столу\n` +
    `4. Після успішного захисту ролі міняються\n\n` +
    `*Підкидання:* Атакуючий може підкидати карти тієї ж масті що вже на столі\n\n` +
    `🏆 *Перемагає* той, хто першим позбудеться всіх карт!`,
    { parse_mode: 'Markdown' }
  );
});

// ---- /stats (placeholder) ----
bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📊 *Ваша статистика*\n\nФункція в розробці...`,
    { parse_mode: 'Markdown' }
  );
});

// ---- Handle web_app_data (score/result sent back from Mini App) ----
bot.on('message', (msg) => {
  if (!msg.web_app_data) return;
  const data = JSON.parse(msg.web_app_data.data || '{}');

  if (data.result === 'win') {
    bot.sendMessage(msg.chat.id, `🏆 Вітаємо з перемогою! Суперник — дурак 😄`);
  } else if (data.result === 'lose') {
    bot.sendMessage(msg.chat.id, `😅 Цього разу не вийшло... Реванш?`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Реванш', web_app: { url: `${WEBAPP_URL}?userId=${msg.from.id}&username=${encodeURIComponent(msg.from.first_name ?? 'Гравець')}` } }
        ]]
      }
    });
  }
});

console.log('🤖 Durak bot started');
