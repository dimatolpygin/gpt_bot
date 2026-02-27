import { mainMenu } from '../keyboards/main.js';

export const setupStart = (bot) => {
  bot.start(async (ctx) => {
    const menu = await mainMenu();
    await ctx.reply('👋 Привет! Выберите раздел:', { reply_markup: menu.reply_markup });
  });

  bot.command('menu', async (ctx) => {
    const menu = await mainMenu();
    await ctx.reply('👋 Главное меню. Выберите раздел:', { reply_markup: menu.reply_markup });
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
      `📖 *Помощь*
\n\n` +
      `*Команды:*
` +
      `/start — Запуск / приветствие
` +
      `/menu — Главное меню
` +
      `/new — Создать новый диалог
` +
      `/dialogs — Список диалогов
\n\n` +
      `*Как работает:*
` +
      `1. Открой или создай диалог
` +
      `2. Пиши сообщения — GPT ответит
` +
      `3. Переключайся между темами через кнопки`,
      { parse_mode: 'Markdown' }
    );
  });
};
