import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import fetch from 'node-fetch';
import sharp from 'sharp';
import {
  nanoBananaTextToImage, nanoBananaEdit,
  nanoBanana2TextToImage, nanoBanana2Edit,
  seedreamTextToImage, seedreamEdit,
} from '../../services/wavespeed.js';

const SIZES  = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const RESOLS = ['1k', '2k', '4k'];
const PRICE  = { '1k': '$0.08', '2k': '$0.08', '4k': '$0.16' };
const TG_MAX_BYTES = 9 * 1024 * 1024;

const encSize = (s) => s.replace(':', 'x');
const decSize = (s) => s.replace('x', ':');

const cancelRow = [{ text: '❌ Отмена', callback_data: 'nb_cancel' }];

// ── Keyboards ─────────────────────────────────────────────────────────────────

const modelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🍌 Nano Banana',       'nb_model:nb1')],
  [Markup.button.callback('🍌🍌 Nano Banana 2',    'nb_model:nb2')],
  [Markup.button.callback('🌱 Seedream V5 Lite',  'nb_model:sd5')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const modeKb = (model) => Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Текст → Фото',       `nb_mode:${model}:txt2img`)],
  [Markup.button.callback('🖼 Редактировать фото',  `nb_mode:${model}:img2img`)],
  [Markup.button.callback('◀️ Назад', 'nb_menu'), Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const resolKb = (model, mode) => Markup.inlineKeyboard([
  RESOLS.map(r => Markup.button.callback(`${r} (${PRICE[r]})`, `nb_resol:${model}:${mode}:${r}`)),
  [Markup.button.callback('◀️ Назад', `nb_model:${model}`), Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

const sizeKb = (model, mode, resol) => {
  const backAction = model === 'nb2'
    ? `nb_resol_back:${model}:${mode}`
    : `nb_mode:${model}:${mode}`;
  return Markup.inlineKeyboard([
    SIZES.map(s => Markup.button.callback(s, `nb_size:${model}:${mode}:${resol}:${encSize(s)}`)),
    [Markup.button.callback('◀️ Назад', backAction), Markup.button.callback('❌ Отмена', 'nb_cancel')],
  ]);
};

const photoNextKb = (count) => Markup.inlineKeyboard([
  [Markup.button.callback(`✅ Хватит (${count} фото)`, 'nb_photos_done')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

// Кнопки после результата
const resultKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🔁 Повторить генерацию',  'nb_repeat')],
  [Markup.button.callback('✏️ Редактировать результат', 'nb_edit_result')],
  [Markup.button.callback('🎨 Новая генерация',       'nb_menu')],
  [Markup.button.callback('🏠 Главное меню',          'main_menu')],
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const cleanState = async (uid) => {
  for (const k of ['state', 'model', 'mode', 'resol', 'size', 'photos']) {
    await redis.del(`nb:${uid}:${k}`);
  }
};

// Сохраняем последнюю генерацию для повтора/редактирования
const saveLastGen = async (uid, { model, mode, size, resol, photos, prompt, resultUrl }) => {
  const data = JSON.stringify({ model, mode, size, resol, photos, prompt, resultUrl });
  await redis.set(`nb:${uid}:last`, data, 'EX', 3600); // 1 час
};

const getLastGen = async (uid) => {
  const raw = await redis.get(`nb:${uid}:last`);
  return raw ? JSON.parse(raw) : null;
};

const safeEdit = async (ctx, text, extra = {}) => {
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...extra })
  );
};

const downloadImage = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

const prepareForTelegram = async (buffer) => {
  if (buffer.length <= TG_MAX_BYTES) return { buffer, compressed: false };
  let quality = 85;
  let result  = buffer;
  while (quality >= 30) {
    result = await sharp(buffer).jpeg({ quality }).toBuffer();
    if (result.length <= TG_MAX_BYTES) break;
    quality -= 15;
  }
  return { buffer: result, compressed: true };
};

const addPhotoUrl = async (uid, url) => {
  const raw  = await redis.get(`nb:${uid}:photos`);
  const list = raw ? JSON.parse(raw) : [];
  list.push(url);
  await redis.set(`nb:${uid}:photos`, JSON.stringify(list), 'EX', 600);
  return list.length;
};

const getPhotoUrls = async (uid) => {
  const raw = await redis.get(`nb:${uid}:photos`);
  return raw ? JSON.parse(raw) : [];
};

const MODEL_LABELS = {
  nb1: '🍌 Nano Banana',
  nb2: '🍌🍌 Nano Banana 2',
  sd5: '🌱 Seedream V5 Lite',
};

// ── Генерация (общая функция) ─────────────────────────────────────────────────

const generate = async (ctx, { model, mode, size, resol, photoUrls, prompt }) => {
  const modelLabel = MODEL_LABELS[model];
  const resolLabel = model === 'nb2' ? ` · ${resol}` : '';

  const waitMsg = await ctx.reply(
    `🎨 Генерирую...\n${modelLabel}${resolLabel} · ${size}\n⏳ ~10-30 сек`,
    { parse_mode: 'HTML' }
  );

  try {
    let imageUrl;
    if (model === 'nb2') {
      imageUrl = mode === 'img2img'
        ? await nanoBanana2Edit(photoUrls, prompt, size, resol)
        : await nanoBanana2TextToImage(prompt, size, resol);
    } else if (model === 'sd5') {
      imageUrl = mode === 'img2img'
        ? await seedreamEdit(photoUrls, prompt, size)
        : await seedreamTextToImage(prompt, size);
    } else {
      imageUrl = mode === 'img2img'
        ? await nanoBananaEdit(photoUrls, prompt, size)
        : await nanoBananaTextToImage(prompt, size);
    }

    const uid = ctx.from.id;
    await saveLastGen(uid, { model, mode, size, resol, photos: photoUrls, prompt, resultUrl: imageUrl });

    const originalBuffer = await downloadImage(imageUrl);
    const sizeMb = (originalBuffer.length / 1024 / 1024).toFixed(1);
    const { buffer: sendBuffer, compressed } = await prepareForTelegram(originalBuffer);
    const ext = compressed ? 'jpg' : 'png';

    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

    const qualityNote = compressed
      ? `\n\n🔗 <a href="${imageUrl}">Скачать оригинал (${sizeMb} MB)</a>`
      : '';

    await ctx.replyWithPhoto(
      { source: sendBuffer, filename: `result.${ext}` },
      {
        caption:
          `🎨 <b>${modelLabel}</b>${resolLabel} · ${size}\n` +
          `<i>${prompt.slice(0, 180)}</i>${qualityNote}`,
        parse_mode: 'HTML',
        reply_markup: resultKb().reply_markup,
      }
    );
  } catch (err) {
    console.error('[NanoBanana] error:', err.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id, waitMsg.message_id, null,
      `❌ Ошибка: ${err.message}`
    ).catch(() => {});
  }
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export const setupNanoBanana = (bot) => {

  bot.action('nb_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx,
      '🎨 <b>Генерация изображений</b>\n\nВыберите модель:\n\n' +
      '🍌 <b>Nano Banana</b> — быстро\n' +
      '🍌🍌 <b>Nano Banana 2</b> — 4K, высокое качество\n' +
      '🌱 <b>Seedream V5 Lite</b> — $0.04/фото, ByteDance',
      { reply_markup: modelKb().reply_markup }
    );
  });

  bot.action(/^nb_model:(nb1|nb2|sd5)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await redis.set(`nb:${ctx.from.id}:model`, model, 'EX', 600);
    await safeEdit(ctx,
      `${MODEL_LABELS[model]}\n\n🖼 Выберите режим:`,
      { reply_markup: modeKb(model).reply_markup }
    );
  });

  bot.action(/^nb_mode:(nb1|nb2|sd5):(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    await redis.set(`nb:${ctx.from.id}:mode`, mode, 'EX', 600);
    if (model === 'nb2') {
      await safeEdit(ctx,
        `${MODEL_LABELS[model]}\n\n📊 <b>Выберите качество:</b>\n\n1k = $0.08 · 2k = $0.08 · 4k = $0.16`,
        { reply_markup: resolKb(model, mode).reply_markup }
      );
    } else {
      await safeEdit(ctx,
        `${MODEL_LABELS[model]}\n\n📐 Выберите формат:`,
        { reply_markup: sizeKb(model, mode, 'std').reply_markup }
      );
    }
  });

  bot.action(/^nb_resol_back:(nb2):(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    await safeEdit(ctx,
      `${MODEL_LABELS[model]}\n\n📊 <b>Выберите качество:</b>`,
      { reply_markup: resolKb(model, mode).reply_markup }
    );
  });

  bot.action(/^nb_resol:(nb2):(txt2img|img2img):(1k|2k|4k)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    const resol = ctx.match[3];
    await redis.set(`nb:${ctx.from.id}:resol`, resol, 'EX', 600);
    await safeEdit(ctx,
      `${MODEL_LABELS[model]} · ${resol}\n\n📐 Выберите формат:`,
      { reply_markup: sizeKb(model, mode, resol).reply_markup }
    );
  });

  bot.action(/^nb_size:(nb1|nb2|sd5):(txt2img|img2img):([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    const resol = ctx.match[3];
    const size  = decSize(ctx.match[4]);
    const uid   = ctx.from.id;
    await redis.set(`nb:${uid}:size`, size, 'EX', 600);

    if (mode === 'img2img') {
      await redis.set(`nb:${uid}:state`, 'await_photo', 'EX', 600);
      await safeEdit(ctx,
        `${MODEL_LABELS[model]} · ${size}\n\n📸 Отправьте первое фото:`,
        { reply_markup: { inline_keyboard: [
          [{ text: '◀️ Назад', callback_data: `nb_mode:${model}:${mode}` }],
          cancelRow,
        ]}}
      );
    } else {
      await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
      await safeEdit(ctx,
        `${MODEL_LABELS[model]} · ${size}\n\n✍️ Напишите промпт:`,
        { reply_markup: { inline_keyboard: [
          [{ text: '◀️ Назад', callback_data: `nb_size_back:${model}:${mode}:${resol}` }],
          cancelRow,
        ]}}
      );
    }
  });

  bot.action(/^nb_size_back:(nb1|nb2|sd5):(txt2img|img2img):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const mode  = ctx.match[2];
    const resol = ctx.match[3];
    await redis.del(`nb:${ctx.from.id}:state`);
    await safeEdit(ctx,
      `${MODEL_LABELS[model]}\n\n📐 Выберите формат:`,
      { reply_markup: sizeKb(model, mode, resol).reply_markup }
    );
  });

  bot.action('nb_photos_done', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid   = ctx.from.id;
    const urls  = await getPhotoUrls(uid);
    const model = await redis.get(`nb:${uid}:model`) || 'nb1';
    const mode  = await redis.get(`nb:${uid}:mode`)  || 'img2img';
    const resol = await redis.get(`nb:${uid}:resol`) || 'std';
    await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
    await ctx.editMessageText(
      `✅ Фото: <b>${urls.length} шт</b>\n\n✍️ Напишите промпт что сделать с фото:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: '◀️ Назад', callback_data: `nb_size_back:${model}:${mode}:${resol}` }],
        cancelRow,
      ]}}
    ).catch(() => {});
  });

  // ── Повторить генерацию ────────────────────────────────────────────
  bot.action('nb_repeat', async (ctx) => {
    await ctx.answerCbQuery('🔁 Повторяю...').catch(() => {});
    const uid  = ctx.from.id;
    const last = await getLastGen(uid);
    if (!last) {
      await ctx.reply('❌ Нет сохранённой генерации. Начните новую через 🎨 Создать изображение.');
      return;
    }
    await generate(ctx, {
      model:     last.model,
      mode:      last.mode,
      size:      last.size,
      resol:     last.resol,
      photoUrls: last.photos || [],
      prompt:    last.prompt,
    });
  });

  // ── Редактировать результат ────────────────────────────────────────
  bot.action('nb_edit_result', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid  = ctx.from.id;
    const last = await getLastGen(uid);
    if (!last || !last.resultUrl) {
      await ctx.reply('❌ Нет результата для редактирования. Сначала сгенерируйте изображение.');
      return;
    }
    // Берём resultUrl как входное фото, ставим режим img2img
    await redis.set(`nb:${uid}:model`,  last.model, 'EX', 600);
    await redis.set(`nb:${uid}:mode`,   'img2img',  'EX', 600);
    await redis.set(`nb:${uid}:size`,   last.size,  'EX', 600);
    await redis.set(`nb:${uid}:resol`,  last.resol || '1k', 'EX', 600);
    await redis.set(`nb:${uid}:photos`, JSON.stringify([last.resultUrl]), 'EX', 600);
    await redis.set(`nb:${uid}:state`,  'await_prompt', 'EX', 600);

    await ctx.reply(
      `✏️ <b>Редактирование результата</b>\n` +
      `${MODEL_LABELS[last.model]} · ${last.size}\n\n` +
      `✍️ Напишите что нужно изменить:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [cancelRow] } }
    );
  });

  bot.action('nb_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cleanState(ctx.from.id);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  // ── Получение фото ────────────────────────────────────────────────
  bot.on('photo', async (ctx, next) => {
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_photo') return next();

    const photo   = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    const count   = await addPhotoUrl(uid, fileUrl.href);

    await ctx.reply(
      `📸 Фото ${count} получено!\n\nОтправьте ещё или нажмите <b>Хватит</b>:`,
      { parse_mode: 'HTML', reply_markup: photoNextKb(count).reply_markup }
    );
  });

  // ── Получение промпта → генерация ─────────────────────────────────
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid   = ctx.from.id;
    const state = await redis.get(`nb:${uid}:state`);
    if (state !== 'await_prompt') return next();

    const prompt    = ctx.message.text;
    const model     = await redis.get(`nb:${uid}:model`) || 'nb1';
    const mode      = await redis.get(`nb:${uid}:mode`)  || 'txt2img';
    const size      = await redis.get(`nb:${uid}:size`)  || '1:1';
    const resol     = await redis.get(`nb:${uid}:resol`) || '1k';
    const photoUrls = await getPhotoUrls(uid);

    await cleanState(uid);
    await generate(ctx, { model, mode, size, resol, photoUrls, prompt });
  });
};
