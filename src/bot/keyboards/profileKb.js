import { Markup } from 'telegraf';

export const profileKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('👥 Реферальная программа', 'profile_ref')],
  [Markup.button.callback('🏠 В меню', 'main_menu')],
]);
