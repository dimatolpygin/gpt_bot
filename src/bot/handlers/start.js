import { mainMenu } from '../keyboards/main.js';

export const setupStart = (bot) => {
  bot.start(async (ctx) => {
    const name = ctx.from.first_name || 'пользователь';
    await ctx.reply(
      `👋 Привет, *${name}*!\n\n` +
      `Я твой персональный GPT-ассистент.\n` +
      `• Создавай диалоги по темам\n` +
      `• Переключайся между ними в любой момент\n` +
      `• Каждый пользователь видит только свои диалоги`,
      { parse_mode: 'Markdown', ...mainMenu() }
    );
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply('🏠 *Главное меню*', { parse_mode: 'Markdown', ...mainMenu() });
  });

  bot.command('new', async (ctx) => {
    ctx.callbackQuery = null; // treat as non-callback
    const { createNewDialog } = await import('./dialogs.js');
    await createNewDialog(ctx);
  });

  bot.command('dialogs', async (ctx) => {
    const { showDialogs } = await import('./dialogs.js');
    await showDialogs(ctx, 0);
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *Помощь*\n\n` +
      `*Команды:*\n` +
      `/start — Запуск / приветствие\n` +
      `/menu — Главное меню\n` +
      `/new — Создать новый диалог\n` +
      `/dialogs — Список диалогов\n\n` +
      `*Как работает:*\n` +
      `1. Открой или создай диалог\n` +
      `2. Пиши сообщения — GPT ответит\n` +
      `3. Переключайся между темами через кнопки`,
      { parse_mode: 'Markdown' }
    );
  });
};
