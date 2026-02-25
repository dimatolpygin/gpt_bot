import { Markup } from 'telegraf';

export const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📋 Мои диалоги', 'dialogs:0')],
    [Markup.button.callback('➕ Новый диалог', 'new_dialog')],
    [Markup.button.callback('🧠 Модель GPT', 'model_menu')],
  ]);
