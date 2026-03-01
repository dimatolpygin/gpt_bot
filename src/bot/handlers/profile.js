import { getBalance } from '../../services/tokens.js';
import { profileKb } from '../keyboards/profileKb.js';
import { countReferrals } from '../../services/supabase.js';
import { config } from '../../config/index.js';

export const setupProfile = (bot) => {
  bot.hears('👤 Профиль', async (ctx) => {
    const uid = ctx.from.id;
    const balance = await getBalance(uid);
    const refs = await countReferrals(uid);

    const text =
      `👤 <b>Профиль</b>\n\n` +
      `💰 Баланс: <b>${balance} 🪙</b>\n` +
      `👥 Рефералов: <b>${refs}</b>`;

    await ctx.reply(text, { parse_mode: 'HTML', ...profileKb() });
  });

  bot.action('profile_ref', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid = ctx.from.id;
    const base = config.WEBAPP_URL || config.APP_URL || '';
    const botUsername = ctx.botInfo?.username;
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=ref_${uid}`
      : `${base}?start=ref_${uid}`;
    const refs = await countReferrals(uid);

    const text =
      `👥 <b>Реферальная программа</b>\n\n` +
      `Приглашайте друзей и получайте бонусные токены за каждого, кто запустит бота по вашей ссылке.\n\n` +
      `🔗 Ваша ссылка:\n<code>${deepLink}</code>\n\n` +
      `👥 Приглашено: <b>${refs}</b>`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: profileKb().reply_markup,
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: profileKb().reply_markup }));
  });
};
