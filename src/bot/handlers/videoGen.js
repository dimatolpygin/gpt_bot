import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import fetch from 'node-fetch';
import { seedanceI2V } from '../../services/wavespeed.js';

const DURATIONS    = [3, 5, 7, 10];
const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '21:9'];

const encSize = (s) => s.replace(':', 'x');
const decSize = (s) => s.replace('x', ':');

const cancelRow = [{ text: '❌ Отмена', callback_data: 'vid_cancel' }];
const backRow   = (action) => [{ text: '◀️ Назад', callback_data: action }];

const modelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🎬 Seedance V1 Pro (720p)', 'vid_model:seedance')],
  [Markup.button.callback('❌ Отмена', 'vid_cancel')],
]);

const durationKb = (model) => Markup.inlineKeyboard([
  DURATIONS.map(d => Markup.button.callback(`${d} сек`, `vid_dur:${model}:${d}`)),
  backRow('vid_menu'),
  cancelRow,
]);

const aspectKb = (model, dur) => Markup.inlineKeyboard([
  ASPECT_RATIOS.map(a => Markup.button.callback(a, `vid_aspect:${model}:${dur}:${encSize(a)}`)),
  backRow(`vid_dur_back:${model}`),
  cancelRow,
]);

const cameraKb = (model, dur, aspect) => Markup.inlineKeyboard([
  [
    Markup.button.callback('🎥 Свободная камера', `vid_cam:${model}:${dur}:${aspect}:free`),
    Markup.button.callback('📷 Фиксированная', `vid_cam:${model}:${dur}:${aspect}:fixed`),
  ],
  backRow(`vid_aspect_back:${model}:${dur}`),
  cancelRow,
]);

const resultKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')],
  [Markup.button.callback('🎬 Ещё видео', 'vid_menu')],
]);

const cleanState = async (uid) => {
  for (const k of ['state', 'model', 'dur', 'aspect', 'cam', 'photo_url']) {
    await redis.del(`vid:${uid}:${k}`);
  }
};

const safeEdit = async (ctx, text, extra = {}) => {
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...extra })
  );
};

export const setupVideoGen = (bot) => {

  // Главное меню видео
  bot.action('vid_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx,
      '🎬 <b>Генерация видео</b>\n\nВыберите модель:\n\n' +
      '🎬 <b>Seedance V1 Pro</b> — Image→Video, 720p, ByteDance\n' +
      'Загрузите фото → напишите промпт → получите видео',
      { reply_markup: modelKb().reply_markup }
    );
  });

  // Выбор модели
  bot.action(/^vid_model:(seedance)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await redis.set(`vid:${ctx.from.id}:model`, model, 'EX', 600);
    await safeEdit(ctx,
      '🎬 <b>Seedance V1 Pro</b>\n\n⏱ Выберите длительность видео:',
      { reply_markup: durationKb(model).reply_markup }
    );
  });

  // Назад к длительности
  bot.action(/^vid_dur_back:(seedance)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await safeEdit(ctx,
      '🎬 <b>Seedance V1 Pro</b>\n\n⏱ Выберите длительность видео:',
      { reply_markup: durationKb(model).reply_markup }
    );
  });

  // Выбор длительности
  bot.action(/^vid_dur:(seedance):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const dur   = ctx.match[2];
    await redis.set(`vid:${ctx.from.id}:dur`, dur, 'EX', 600);
    await safeEdit(ctx,
      `🎬 <b>Seedance V1 Pro</b> · ${dur} сек\n\n📐 Выберите соотношение сторон:`,
      { reply_markup: aspectKb(model, dur).reply_markup }
    );
  });

  // Назад к aspect ratio
  bot.action(/^vid_aspect_back:(seedance):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const dur   = ctx.match[2];
    await safeEdit(ctx,
      `🎬 <b>Seedance V1 Pro</b> · ${dur} сек\n\n📐 Выберите соотношение сторон:`,
      { reply_markup: aspectKb(model, dur).reply_markup }
    );
  });

  // Выбор aspect ratio
  bot.action(/^vid_aspect:(seedance):(\d+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model  = ctx.match[1];
    const dur    = ctx.match[2];
    const aspect = decSize(ctx.match[3]);
    await redis.set(`vid:${ctx.from.id}:aspect`, aspect, 'EX', 600);
    await safeEdit(ctx,
      `🎬 <b>Seedance V1 Pro</b> · ${dur} сек · ${aspect}\n\n🎥 Тип камеры:`,
      { reply_markup: cameraKb(model, dur, encSize(aspect)).reply_markup }
    );
  });

  // Выбор камеры → ждём фото
  bot.action(/^vid_cam:(seedance):(\d+):([^:]+):(free|fixed)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model  = ctx.match[1];
    const dur    = ctx.match[2];
    const aspect = decSize(ctx.match[3]);
    const cam    = ctx.match[4];
    const uid    = ctx.from.id;

    await redis.set(`vid:${uid}:cam`,    cam,    'EX', 600);
    await redis.set(`vid:${uid}:state`,  'await_photo', 'EX', 600);

    const camLabel = cam === 'fixed' ? '📷 Фиксированная' : '🎥 Свободная';
    await safeEdit(ctx,
      `🎬 <b>Seedance V1 Pro</b>\n` +
      `⏱ ${dur} сек · 📐 ${aspect} · ${camLabel}\n\n` +
      `📸 Отправьте фото для генерации видео:`,
      { reply_markup: { inline_keyboard: [
        backRow(`vid_aspect:${model}:${dur}:${encSize(aspect)}`),
        cancelRow,
      ]}}
    );
  });

  // Отмена
  bot.action('vid_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cleanState(ctx.from.id);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  // Получение фото
  bot.on('photo', async (ctx, next) => {
    const uid   = ctx.from.id;
    const state = await redis.get(`vid:${uid}:state`);
    if (state !== 'await_photo') return next();

    const photo   = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    await redis.set(`vid:${uid}:photo_url`, fileUrl.href, 'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_prompt', 'EX', 600);

    await ctx.reply(
      '✅ Фото получено!\n\n✍️ Напишите промпт для видео\n<i>(или отправьте точку . чтобы пропустить)</i>:',
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [cancelRow] } }
    );
  });

  // Получение промпта → генерация
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid   = ctx.from.id;
    const state = await redis.get(`vid:${uid}:state`);
    if (state !== 'await_prompt') return next();

    const rawPrompt = ctx.message.text.trim();
    const prompt    = rawPrompt === '.' ? '' : rawPrompt;
    const dur       = parseInt(await redis.get(`vid:${uid}:dur`))    || 5;
    const aspect    = await redis.get(`vid:${uid}:aspect`)            || '16:9';
    const cam       = await redis.get(`vid:${uid}:cam`)               || 'free';
    const photoUrl  = await redis.get(`vid:${uid}:photo_url`);

    await cleanState(uid);

    if (!photoUrl) {
      await ctx.reply('❌ Фото не найдено. Начните заново через 🎬 Создать видео.');
      return;
    }

    const camLabel = cam === 'fixed' ? '📷 Фиксированная камера' : '🎥 Свободная камера';
    const waitMsg  = await ctx.reply(
      `🎬 Генерирую видео...\n⏱ ${dur} сек · 📐 ${aspect} · ${camLabel}\n⏳ ~1-3 мин`,
      { parse_mode: 'HTML' }
    );

    try {
      const videoUrl = await seedanceI2V(photoUrl, prompt, dur, aspect, cam === 'fixed');

      // Скачиваем видео (Telegram не принимает URL WaveSpeed напрямую)
      const res    = await fetch(videoUrl);
      const buffer = Buffer.from(await res.arrayBuffer());
      const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});

      if (buffer.length > 50 * 1024 * 1024) {
        // > 50 MB — Telegram не принимает, даём ссылку
        await ctx.reply(
          `🎬 <b>Seedance V1 Pro</b> · ${dur} сек · ${aspect}\n` +
          `<i>${prompt ? prompt.slice(0, 150) : 'без промпта'}</i>\n\n` +
          `📦 Файл слишком большой (${sizeMb} MB)\n` +
          `🔗 <a href="${videoUrl}">Скачать видео</a>`,
          { parse_mode: 'HTML', reply_markup: resultKb().reply_markup, disable_web_page_preview: false }
        );
      } else {
        await ctx.replyWithVideo(
          { source: buffer, filename: 'video.mp4' },
          {
            caption:
              `🎬 <b>Seedance V1 Pro</b> · ${dur} сек · ${aspect}\n` +
              `<i>${prompt ? prompt.slice(0, 150) : 'без промпта'}</i>`,
            parse_mode: 'HTML',
            reply_markup: resultKb().reply_markup,
          }
        );
      }
    } catch (err) {
      console.error('[VideoGen] error:', err.message);
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, null,
        `❌ Ошибка генерации видео: ${err.message}`
      ).catch(() => {});
    }
  });
};
