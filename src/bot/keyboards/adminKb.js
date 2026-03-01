import { Markup } from 'telegraf';

export const adminKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('📝 Тексты (bot_content)', 'admin_content')],
  [Markup.button.callback('💰 Цены (token_prices)', 'admin_prices')],
  [Markup.button.callback('📦 Тарифы (bot_tariffs)', 'admin_tariffs')],
  [Markup.button.callback('🏠 В меню', 'main_menu')],
]);
