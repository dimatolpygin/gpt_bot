import { Markup } from 'telegraf';
import { config } from '../../config/index.js';

const baseUrl = (config.WEBAPP_URL_RAW || config.APP_URL_RAW || '').replace(/\/+$/, '');
const adminUrl = baseUrl ? `${baseUrl}/admin` : '';

export const adminKb = () => {
  if (!adminUrl) return null;
  return Markup.inlineKeyboard([
    [Markup.button.webApp('Открыть веб-админку', adminUrl)],
  ]);
};
