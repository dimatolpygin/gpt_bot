import { getBalance } from '../../services/tokens.js';
import { profileKb } from '../keyboards/profileKb.js';

export const setupProfile = (bot) => {
  bot.hears('👤 Профиль', async (ctx) => {
    const uid = ctx.from.id;
    const balance = await getBalance(uid);

    const text =
      `👤 <b>Профиль</b>

` +
      `💰 Баланс: <b>${balance} 🪙</b>`;

    await ctx.reply(text, { parse_mode: 'HTML', ...profileKb() });
  });
};
