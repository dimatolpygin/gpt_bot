import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import fetch from 'node-fetch';
import { seedanceI2V, seedance15SpicyI2V, klingI2V, hailuoI2V } from '../../services/wavespeed.js';

const TG_VIDEO_MAX = 50 * 1024 * 1024;

const encS = (s) => s.replace(':', 'x');
const decS = (s) => s.replace('x', ':');

const cancelRow = [{ text: '❌ Отмена', callback_data: 'vid_cancel' }];
const backBtn   = (action) => ({ text: '◀️ Назад', callback_data: action });

// ── Конфиг моделей ────────────────────────────────────────────────────────────

const MODELS = {
  seedance1: {
    label:     '🌿 Seedance V1 Pro 720p',
    durations: [3, 5, 7, 10],
    aspects:   ['16:9', '9:16', '1:1', '4:3', '21:9'],
    hasCamera: true,
    hasSound:  false,
  },
  seedance15: {
    label:     '🌿🌿 Seedance V1.5 Pro Spicy',
    durations: [3, 5, 7, 10],
    aspects:   ['16:9', '9:16', '1:1', '4:3'],
    hasCamera: false,
    hasSound:  false,
  },
  kling: {
    label:     '⚡ Kling Video O3 Pro',
    durations: [3, 5, 7, 10, 15],
    aspects:   null, // нет выбора aspect ratio
    hasCamera: false,
    hasSound:  true,
  },
  hailuo: {
    label:     '🌊 Hailuo 2.3 Pro 1080p',
    durations: [6, 10],
    aspects:   null, // нет выбора
    hasCamera: false,
    hasSound:  false,
  },
};

// ── Keyboards ─────────────────────────────────────────────────────────────────

const modelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback(MODELS.seedance1.label,  'vid_model:seedance1')],
  [Markup.button.callback(MODELS.seedance15.label, 'vid_model:seedance15')],
  [Markup.button.callback(MODELS.kling.label,      'vid_model:kling')],
  [Markup.button.callback(MODELS.hailuo.label,     'vid_model:hailuo')],
  [Markup.button.callback('❌ Отмена', 'vid_cancel')],
]);

const durationKb = (model) => Markup.inlineKeyboard([
  MODELS[model].durations.map(d => Markup.button.callback(`${d} сек`, `vid_dur:${model}:${d}`)),
  [backBtn('vid_menu'), { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

const aspectKb = (model, dur) => Markup.inlineKeyboard([
  MODELS[model].aspects.map(a => Markup.button.callback(a, `vid_aspect:${model}:${dur}:${encS(a)}`)),
  [backBtn(`vid_dur_back:${model}`), { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

const cameraKb = (model, dur, aspect) => Markup.inlineKeyboard([
  [
    Markup.button.callback('🎥 Свободная',    `vid_cam:${model}:${dur}:${aspect}:free`),
    Markup.button.callback('📷 Фиксированная', `vid_cam:${model}:${dur}:${aspect}:fixed`),
  ],
  [backBtn(`vid_aspect_back:${model}:${dur}`), { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

const soundKb = (model, dur) => Markup.inlineKeyboard([
  [
    Markup.button.callback('🔊 Со звуком',  `vid_sound:${model}:${dur}:yes`),
    Markup.button.callback('🔇 Без звука',  `vid_sound:${model}:${dur}:no`),
  ],
  [backBtn(`vid_dur_back:${model}`), { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

const awaitPhotoKb = (backAction) => ({
  inline_keyboard: [
    [backBtn(backAction)],
    cancelRow,
  ],
});

const awaitPromptKb = (backAction) => ({
  inline_keyboard: [
    [backBtn(backAction)],
    cancelRow,
  ],
});

const resultKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')],
  [Markup.button.callback('🎬 Ещё видео',    'vid_menu')],
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

const cleanState = async (uid) => {
  for (const k of ['state', 'model', 'dur', 'aspect', 'cam', 'sound', 'photo_url']) {
    await redis.del(`vid:${uid}:${k}`);
  }
};

const safeEdit = async (ctx, text, extra = {}) => {
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra }).catch(() =>
    ctx.reply(text, { parse_mode: 'HTML', ...extra })
  );
};

const sendVideo = async (ctx, videoUrl, caption, kb) => {
  const res    = await fetch(videoUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);

  if (buffer.length > TG_VIDEO_MAX) {
    await ctx.reply(
      `${caption}\n\n📦 Файл большой (${sizeMb} MB)\n🔗 <a href="${videoUrl}">Скачать видео</a>`,
      { parse_mode: 'HTML', reply_markup: kb.reply_markup, disable_web_page_preview: false }
    );
  } else {
    await ctx.replyWithVideo(
      { source: buffer, filename: 'video.mp4' },
      { caption, parse_mode: 'HTML', reply_markup: kb.reply_markup }
    );
  }
};

// ── Setup ─────────────────────────────────────────────────────────────────────

export const setupVideoGen = (bot) => {

  // Меню
  bot.action('vid_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx,
      '🎬 <b>Генерация видео</b>\n\nВыберите модель:\n\n' +
      `🌿 <b>Seedance V1 Pro</b> — 720p\n` +
      `🌿🌿 <b>Seedance V1.5 Pro Spicy</b> — улучшенный\n` +
      `⚡ <b>Kling V O3 Pro</b> — со звуком\n` +
      `🌊 <b>Hailuo 2.3 Pro</b> — 1080p, физика`,
      { reply_markup: modelKb().reply_markup }
    );
  });

  // Выбор модели
  bot.action(/^vid_model:(seedance1|seedance15|kling|hailuo)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await redis.set(`vid:${ctx.from.id}:model`, model, 'EX', 600);
    await safeEdit(ctx,
      `${MODELS[model].label}\n\n⏱ Выберите длительность:`,
      { reply_markup: durationKb(model).reply_markup }
    );
  });

  // Назад к длительности
  bot.action(/^vid_dur_back:(seedance1|seedance15|kling|hailuo)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await safeEdit(ctx,
      `${MODELS[model].label}\n\n⏱ Выберите длительность:`,
      { reply_markup: durationKb(model).reply_markup }
    );
  });

  // Выбор длительности
  bot.action(/^vid_dur:(seedance1|seedance15|kling|hailuo):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const dur   = ctx.match[2];
    const uid   = ctx.from.id;
    await redis.set(`vid:${uid}:dur`, dur, 'EX', 600);

    const cfg = MODELS[model];

    if (cfg.aspects) {
      // Есть выбор формата
      await safeEdit(ctx,
        `${cfg.label} · ${dur} сек\n\n📐 Выберите формат:`,
        { reply_markup: aspectKb(model, dur).reply_markup }
      );
    } else if (cfg.hasSound) {
      // Kling — выбор звука
      await safeEdit(ctx,
        `${cfg.label} · ${dur} сек\n\n🔊 Генерировать звук?`,
        { reply_markup: soundKb(model, dur).reply_markup }
      );
    } else {
      // Hailuo — сразу к фото
      await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
      await safeEdit(ctx,
        `${cfg.label} · ${dur} сек\n\n📸 Отправьте фото:`,
        { reply_markup: awaitPhotoKb(`vid_dur_back:${model}`) }
      );
    }
  });

  // Назад к aspect
  bot.action(/^vid_aspect_back:(seedance1|seedance15):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const dur   = ctx.match[2];
    await safeEdit(ctx,
      `${MODELS[model].label} · ${dur} сек\n\n📐 Выберите формат:`,
      { reply_markup: aspectKb(model, dur).reply_markup }
    );
  });

  // Выбор aspect ratio
  bot.action(/^vid_aspect:(seedance1|seedance15):(\d+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model  = ctx.match[1];
    const dur    = ctx.match[2];
    const aspect = decS(ctx.match[3]);
    const uid    = ctx.from.id;
    await redis.set(`vid:${uid}:aspect`, aspect, 'EX', 600);

    if (MODELS[model].hasCamera) {
      await safeEdit(ctx,
        `${MODELS[model].label} · ${dur} сек · ${aspect}\n\n🎥 Тип камеры:`,
        { reply_markup: cameraKb(model, dur, encS(aspect)).reply_markup }
      );
    } else {
      await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
      await safeEdit(ctx,
        `${MODELS[model].label} · ${dur} сек · ${aspect}\n\n📸 Отправьте фото:`,
        { reply_markup: awaitPhotoKb(`vid_aspect_back:${model}:${dur}`) }
      );
    }
  });

  // Выбор камеры (seedance1)
  bot.action(/^vid_cam:(seedance1):(\d+):([^:]+):(free|fixed)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model  = ctx.match[1];
    const dur    = ctx.match[2];
    const aspect = decS(ctx.match[3]);
    const cam    = ctx.match[4];
    const uid    = ctx.from.id;
    await redis.set(`vid:${uid}:cam`,   cam,   'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
    const camLabel = cam === 'fixed' ? '📷 Фикс.' : '🎥 Своб.';
    await safeEdit(ctx,
      `${MODELS[model].label} · ${dur} сек · ${aspect} · ${camLabel}\n\n📸 Отправьте фото:`,
      { reply_markup: awaitPhotoKb(`vid_aspect_back:${model}:${dur}`) }
    );
  });

  // Выбор звука (kling)
  bot.action(/^vid_sound:(kling):(\d+):(yes|no)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const dur   = ctx.match[2];
    const sound = ctx.match[3];
    const uid   = ctx.from.id;
    await redis.set(`vid:${uid}:sound`, sound, 'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
    const soundLabel = sound === 'yes' ? '🔊 Со звуком' : '🔇 Без звука';
    await safeEdit(ctx,
      `${MODELS[model].label} · ${dur} сек · ${soundLabel}\n\n📸 Отправьте фото:`,
      { reply_markup: awaitPhotoKb(`vid_dur_back:${model}`) }
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
      '✅ Фото получено!\n\n✍️ Напишите промпт для видео\n<i>(или . чтобы пропустить)</i>:',
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
    const model     = await redis.get(`vid:${uid}:model`)     || 'seedance1';
    const dur       = parseInt(await redis.get(`vid:${uid}:dur`)) || 5;
    const aspect    = await redis.get(`vid:${uid}:aspect`)    || '16:9';
    const cam       = await redis.get(`vid:${uid}:cam`)        || 'free';
    const sound     = await redis.get(`vid:${uid}:sound`)      || 'no';
    const photoUrl  = await redis.get(`vid:${uid}:photo_url`);

    await cleanState(uid);

    if (!photoUrl) {
      await ctx.reply('❌ Фото не найдено. Начните заново через 🎬 Создать видео.');
      return;
    }

    const cfg = MODELS[model];
    const waitMsg = await ctx.reply(
      `🎬 Генерирую видео...\n${cfg.label}\n⏳ ~1-3 мин`,
      { parse_mode: 'HTML' }
    );

    try {
      let videoUrl;
      if (model === 'seedance1') {
        videoUrl = await seedanceI2V(photoUrl, prompt, dur, aspect, cam === 'fixed');
      } else if (model === 'seedance15') {
        videoUrl = await seedance15SpicyI2V(photoUrl, prompt, dur, aspect);
      } else if (model === 'kling') {
        videoUrl = await klingI2V(photoUrl, prompt, dur, sound === 'yes');
      } else if (model === 'hailuo') {
        videoUrl = await hailuoI2V(photoUrl, prompt, dur);
      }

      const caption =
        `🎬 <b>${cfg.label}</b>\n` +
        `⏱ ${dur} сек${aspect ? ' · 📐 ' + aspect : ''}\n` +
        `<i>${prompt ? prompt.slice(0, 150) : 'без промпта'}</i>`;

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await sendVideo(ctx, videoUrl, caption, resultKb());

    } catch (err) {
      console.error('[VideoGen] error:', err.message);
      await ctx.telegram.editMessageText(
        ctx.chat.id, waitMsg.message_id, null,
        `❌ Ошибка: ${err.message}`
      ).catch(() => {});
    }
  });
};
