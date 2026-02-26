import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import {
  nanoBananaTextToImage, nanoBananaEdit,
  nanoBanana2TextToImage, nanoBanana2Edit,
} from '../../services/wavespeed.js';

const SIZES  = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const RESOLS = ['1k', '2k', '4k'];
const PRICE  = { '1k': '$0.08', '2k': '$0.08', '4k': '$0.16' };

// Кодируем : → _ в callback_data чтобы не ломать regex
const encSize = (s) => s.replace(':', 'x');
const decSize = (s) => s.replace('x', ':');

const cancelRow = [{ text: '❌ Отмена', callback_data: 'nb_cancel' }];

const modelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🍌 Nano Banana',    'nb_model:nb1')],
  [Markup.button.callback('🍌🍌 Nano Banana 2', 'nb_model:nb2')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const modeKb = (model) => Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Текст → Фото',      `nb_mode:${model}:txt2img`)],
  [Markup.button.callback('🖼 Редактировать фото', `nb_mode:${model}:img2img`)],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const resolKb = (model, mode) => Markup.inlineKeyboard([
  RESOLS.map(r => Markup.button.callback(`${r} (${PRICE[r]})`, `nb_resol:${model}:${mode}:${r}`)),
  cancelRow,
]);

const sizeKb = (model, mode, resol) => Markup.inlineKeyboard([
  SIZES.map(s => Markup.button.callback(s, `nb_size:${model}:${mode}:${resol}:${encSize(s)}`)),
  cancelRow,
]);

const cleanState = async (uid) => {
  for (const k of ['state', 'model', 'mode', 'resol', 'size', 'photo_url']) {
    await redis.del(`nb:${uid}:${k}`);
  }
};

const safeEdit = async (ctx, text, extra = {}) => {
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...extra })
  );
};

export const setupNanoBanana = (bot) => {

  bot.action('nb_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx,
      '🎨 <b>Генерация изображений</b>\n\nВыберите модель:\n\n' +
      '🍌 <b>Nano Banana</b> — быстро, дёшево\n' +
      '🍌🍌 <b>Nano Banana 2</b> — 4K, выше качество',
      { reply_markup: modelKb().reply_markup }
    );
  });

  bot.action(/^nb_model:(nb1|nb2)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await redis.set(`nb:${ctx.from.id}:model`, model, 'EX', 600);
    await safeEdit(ctx, '🖼 Выберите режим:', { reply_markup: modeKb(model).reply_markup });
  });

  bot.action(/^nb_mode:(nb1|nb2):(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    await redis.set(`nb:${ctx.from.id}:mode`, mode, 'EX', 600);

    if (model === 'nb2') {
      await safeEdit(ctx,
        '📊 <b>Выберите качество:</b>\n\n1k = $0.08 · 2k = $0.08 · 4k = $0.16',
        { reply_markup: resolKb(model, mode).reply_markup }
      );
    } else {
      await safeEdit(ctx, '📐 Выберите формат:', { reply_markup: sizeKb(model, mode, 'std').reply_markup });
    }
  });

  bot.action(/^nb_resol:(nb2):(txt2img|img2img):(1k|2k|4k)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    const resol = ctx.match[3];
    await redis.set(`nb:${ctx.from.id}:resol`, resol, 'EX', 600);
    await safeEdit(ctx,
      `📐 Качество: <b>${resol}</b>\n\nВыберите формат:`,
      { reply_markup: sizeKb(model, mode, resol).reply_markup }
    );
  });

  // size в callback закодирован: 16x9 вместо 16:9
  bot.action(/^nb_size:(nb1|nb2):(txt2img|img2img):([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model   = ctx.match[1];
    const mode    = ctx.match[2];
    const resol   = ctx.match[3];
    const sizeEnc = ctx.match[4];
    const size    = decSize(sizeEnc);
    const uid     = ctx.from.id;

    await redis.set(`nb:${uid}:size`, size, 'EX', 600);

    if (mode === 'img2img') {
      await redis.set(`nb:${uid}:state`, 'await_photo', 'EX', 600);
      await safeEdit(ctx,
        `📐 Формат: <b>${size}</b>\n\n📸 Отправьте фото для редактирования:`,
        { reply_markup: { inline_keyboard: [cancelRow] } }
      );
    } else {
      await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
      await safeEdit(ctx,
        `📐 Формат: <b>${size}</b>\n\n✍️ Напишите промпт:`,
        { reply_markup: { inline_keyboard: [cancelRow] } }
      );
    }
  });

  bot.action('nb_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cleanState(ctx.from.id);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  bot.on('photo', async (ctx, next) => {
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_photo') return next();

    const photo   = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    await redis.set(`nb:${uid}:photo_url`, fileUrl.href, 'EX', 600);
    await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);

    const size = await redis.get(`nb:${uid}:size`) || '1:1';
    await ctx.reply(
      `✅ Фото получено!\n📐 Формат: <b>${size}</b>\n\n✍️ Напишите промпт что сделать с фото:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [cancelRow] } }
    );
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_prompt') return next();

    const prompt   = ctx.message.text;
    const model    = await redis.get(`nb:${uid}:model`)     || 'nb1';
    const mode     = await redis.get(`nb:${uid}:mode`)      || 'txt2img';
    const size     = await redis.get(`nb:${uid}:size`)      || '1:1';
    const resol    = await redis.get(`nb:${uid}:resol`)     || '1k';
    const photoUrl = await redis.get(`nb:${uid}:photo_url`);

    await cleanState(uid);

    const modelLabel = model === 'nb2' ? 'Nano Banana 2' : 'Nano Banana';
    const resolLabel = model === 'nb2' ? ` · ${resol}` : '';
    const waitMsg = await ctx.reply(
      `🎨 Генерирую...\n🍌 ${modelLabel}${resolLabel} · ${size}\n⏳ ~10-30 сек`,
      { parse_mode: 'HTML' }
    );

    try {
      let imageUrl;
      if (model === 'nb2') {
        imageUrl = mode === 'img2img'
          ? await nanoBanana2Edit(photoUrl, prompt, size, resol)
          : await nanoBanana2TextToImage(prompt, size, resol);
      } else {
        imageUrl = mode === 'img2img'
          ? await nanoBananaEdit(photoUrl, prompt, size)
          : await nanoBananaTextToImage(prompt, size);
      }

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.replyWithPhoto(imageUrl, {
        caption: `🎨 <b>${modelLabel}</b>${resolLabel} · ${size}\n<i>${prompt.slice(0, 200)}</i>`,
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('[NanoBanana] error:', err.message);
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, null,
        `❌ Ошибка: ${err.message}`
      ).catch(() => {});
    }
  });
};
