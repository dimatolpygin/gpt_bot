import { Markup } from 'telegraf';
import { config } from '../../config/index.js';

const baseUrl = (config.WEBAPP_URL_RAW || config.APP_URL_RAW || '').replace(/\/+$/, '');
const adminUrl = baseUrl ? `${baseUrl}/admin` : '';

export const adminKb = () => {
  const rows = [];
  if (adminUrl) {
    rows.push([
      Markup.button.webApp('🌐 Открыть веб-админку', adminUrl),
    ]);
  }
  rows.push(
    [Markup.button.callback('📝 Тексты (bot_content)', 'admin_content')],
    [Markup.button.callback('💰 Цены (token_prices)', 'admin_prices')],
    [Markup.button.callback('📦 Тарифы (bot_tariffs)', 'admin_tariffs')],
    [Markup.button.callback('🏠 В меню', 'main_menu')],
  );
  return Markup.inlineKeyboard(rows);
};
