import { mainReplyKeyboard } from '../keyboards/main.js';
import { gptMenu } from '../keyboards/gptMenu.js';
import { sendContent } from '../../services/content.js';

export const setupStart = (bot) => {
  bot.start(async (ctx) => {
    await sendContent(ctx, 'main_menu', { reply_markup: mainReplyKeyboard().reply_markup });
  });

  bot.command('menu', async (ctx) => {
    await sendContent(ctx, 'main_menu', { reply_markup: mainReplyKeyboard().reply_markup });
  });

  bot.command('new', async (ctx) => {
    ctx.callbackQuery = null;
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

  bot.hears('🤖 GPT', async (ctx) => {
    const kb = await gptMenu(ctx.from.id);
    await sendContent(ctx, 'gpt_menu', { reply_markup: kb.reply_markup });
  });

  bot.hears('🎨 Генерация изображений', async (ctx) => {
    await sendContent(ctx, 'nb_menu', { reply_markup: mainReplyKeyboard().reply_markup });
  });

  bot.hears('🎬 Создание видео', async (ctx) => {
    await sendContent(ctx, 'vid_menu', { reply_markup: mainReplyKeyboard().reply_markup });
  });
};
