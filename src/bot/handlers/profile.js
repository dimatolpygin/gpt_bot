import { getBalance } from '../../services/tokens.js';
import { getUserSettings } from '../../services/userSettings.js';
import { getUserModel } from '../../services/redis.js';
import { profileKb } from '../keyboards/profileKb.js';

export const setupProfile = (bot) => {
  bot.hears('👤 Профиль', async (ctx) => {
    const uid = ctx.from.id;
    const [balance, settings, chatModel] = await Promise.all([
      getBalance(uid),
      getUserSettings(uid),
      getUserModel(uid),
    ]);

    const text =
      `👤 <b>Профиль</b>

` +
      `💰 Баланс: <b>${balance} 🪙</b>
` +
      `🧠 Модель чата: <code>${chatModel}</code>

` +
      `🖼 <b>Фото</b>
` +
      `• Модель: <code>${settings.img_model}</code>
` +
      `• Формат: <code>${settings.img_format}</code>
` +
      `• Качество: <code>${settings.img_quality}</code>

` +
      `🎬 <b>Видео</b>
` +
      `• Модель: <code>${settings.vid_model}</code>
` +
      `• Длительность: <code>${settings.vid_duration} c</code>
` +
      `• Формат: <code>${settings.vid_aspect}</code>`;

    await ctx.reply(text, { parse_mode: 'HTML', ...profileKb() });
  });

  const stub = (msg) => async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(msg);
  };

  bot.action('profile_img_model',   stub('Выбор модели фото ещё не реализован.'));
  bot.action('profile_vid_model',   stub('Выбор модели видео ещё не реализован.'));
  bot.action('profile_img_format',  stub('Выбор формата фото ещё не реализован.'));
  bot.action('profile_img_quality', stub('Выбор качества фото ещё не реализован.'));
  bot.action('profile_vid_dur',     stub('Выбор длительности видео ещё не реализован.'));
  bot.action('profile_vid_aspect',  stub('Выбор формата видео ещё не реализован.'));
};
