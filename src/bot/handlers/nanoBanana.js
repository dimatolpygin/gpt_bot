import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import { nanoBananaTextToImage, nanoBananaEdit } from '../../services/wavespeed.js';

const SIZES = ['1:1', '16:9', '9:16', '4:3', '3:4'];

const sizeKb = (mode) => Markup.inlineKeyboard([
  SIZES.map(s => Markup.button.callback(s, `nb_size:${mode}:${s}`)),
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const modeKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Текст → Фото', 'nb_mode:txt2img')],
  [Markup.button.callback('🖼 Редактировать фото', 'nb_mode:img2img')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

export const showNbMenu = async (ctx) => {
  await ctx.editMessageText(
    '🎨 <b>Nano Banana — генерация изображений</b>\n\nВыберите режим:',
    { parse_mode: 'HTML', reply_markup: modeKb().reply_markup }
  ).catch(() => ctx.reply('🎨 <b>Nano Banana</b>\n\nВыберите режим:', {
    parse_mode: 'HTML', reply_markup: modeKb().reply_markup,
  }));
};

export const setupNanoBanana = (bot) => {

  bot.action('nb_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showNbMenu(ctx);
  });

  bot.action(/^nb_mode:(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const mode = ctx.match[1];
    await redis.set(`nb:${ctx.from.id}:mode`, mode, 'EX', 600);

    if (mode === 'img2img') {
      await redis.set(`nb:${ctx.from.id}:state`, 'await_photo', 'EX', 600);
      await ctx.editMessageText(
        '🖼 Отправьте фото которое хотите отредактировать:',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'nb_cancel' }]] } }
      ).catch(() => {});
    } else {
      await ctx.editMessageText(
        '🔡 Выберите соотношение сторон:',
        { reply_markup: sizeKb('txt2img').reply_markup }
      ).catch(() => {});
    }
  });

  bot.action(/^nb_size:(txt2img|img2img):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const mode = ctx.match[1];
    const size = ctx.match[2];
    const uid  = ctx.from.id;
    await redis.set(`nb:${uid}:size`, size, 'EX', 600);
    await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);

    await ctx.editMessageText(
      `📐 Формат: <b>${size}</b>\n\n✍️ Теперь напишите промпт (опишите желаемое изображение):`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'nb_cancel' }]] } }
    ).catch(() => {});
  });

  bot.action('nb_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid = ctx.from.id;
    await redis.del(`nb:${uid}:state`);
    await redis.del(`nb:${uid}:mode`);
    await redis.del(`nb:${uid}:size`);
    await redis.del(`nb:${uid}:photo_url`);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  bot.on('photo', async (ctx, next) => {
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_photo') return next();

    const photo   = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    await redis.set(`nb:${uid}:photo_url`, fileUrl.href, 'EX', 600);
    await redis.set(`nb:${uid}:state`, 'await_size_img2img', 'EX', 600);

    await ctx.reply(
      '✅ Фото получено! Выберите соотношение сторон результата:',
      sizeKb('img2img')
    );
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_prompt') return next();

    const prompt = ctx.message.text;
    const mode   = await redis.get(`nb:${uid}:mode`);
    const size   = await redis.get(`nb:${uid}:size`) || '1:1';

    await redis.del(`nb:${uid}:state`);
    await redis.del(`nb:${uid}:mode`);
    await redis.del(`nb:${uid}:size`);

    const waitMsg = await ctx.reply(`🎨 Генерирую изображение...\n📐 ${size}\n⏳ Обычно 10-30 сек`);

    try {
      let imageUrl;
      if (mode === 'img2img') {
        const photoUrl = await redis.get(`nb:${uid}:photo_url`);
        await redis.del(`nb:${uid}:photo_url`);
        imageUrl = await nanoBananaEdit(photoUrl, prompt, size);
      } else {
        imageUrl = await nanoBananaTextToImage(prompt, size);
      }

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.replyWithPhoto(imageUrl, {
        caption: `🎨 <i>${prompt.slice(0, 200)}</i>\n📐 ${size}`,
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('[NanoBanana] error:', err.message);
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, null,
        `❌ Ошибка генерации: ${err.message}`
      ).catch(() => {});
    }
  });
};
