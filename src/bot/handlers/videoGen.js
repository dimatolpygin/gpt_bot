import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import fetch from 'node-fetch';
import { cmsEdit, cmsSend, cms } from '../../services/contentHelper.js';
import { seedanceI2V, seedance15SpicyI2V, klingI2V, hailuoI2V } from '../../services/wavespeed.js';
import { spendTokens, notEnoughMsg } from '../../services/tokens.js';
import {
  vidModelKb, vidDurationKb, vidAspectKb,
  vidCameraKb, vidSoundKb, vidResultKb,
  MODELS, decS,
} from '../keyboards/videoMenuKb.js';

const TG_VID_MAX = 50 * 1024 * 1024;
const encS = (s) => s.replace(':', 'x');
const cancelRow = [{ text: '❌ Отмена', callback_data: 'vid_cancel' }];

const cleanState = async (uid) => {
  for (const k of ['state','model','dur','aspect','cam','sound','photo_url'])
    await redis.del(`vid:${uid}:${k}`);
};

const sendVideo = async (ctx, videoUrl, caption, kb) => {
  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const mb  = (buf.length / 1024 / 1024).toFixed(1);
  if (buf.length > TG_VID_MAX) {
    await ctx.reply(
      `${caption}\n\n📦 ${mb} MB\n🔗 <a href="${videoUrl}">Скачать</a>`,
      { parse_mode: 'HTML', reply_markup: kb.reply_markup, disable_web_page_preview: false }
    );
  } else {
    await ctx.replyWithVideo(
      { source: buf, filename: 'video.mp4' },
      { caption, parse_mode: 'HTML', reply_markup: kb.reply_markup }
    );
  }
};

const awaitPhotoKb = (back) => ({ inline_keyboard: [
  [{ text: '◀️ Назад', callback_data: back }], cancelRow
]});

export const setupVideoGen = (bot) => {

  bot.action(/^vid_model:(seedance1|seedance15|kling|hailuo)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    await redis.set(`vid:${ctx.from.id}:model`, model, 'EX', 600);
    await cmsEdit(ctx, 'vid_duration', await vidDurationKb(model));
  });

  bot.action(/^vid_dur_back:(seedance1|seedance15|kling|hailuo)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cmsEdit(ctx, 'vid_duration', await vidDurationKb(ctx.match[1]));
  });

  bot.action(/^vid_dur:(seedance1|seedance15|kling|hailuo):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], dur = ctx.match[2], uid = ctx.from.id;
    await redis.set(`vid:${uid}:dur`, dur, 'EX', 600);
    const cfg = MODELS[model];
    if (cfg.aspects)       await cmsEdit(ctx, 'vid_aspect',      await vidAspectKb(model, dur));
    else if (cfg.hasSound) await cmsEdit(ctx, 'vid_sound',       await vidSoundKb(model, dur));
    else {
      await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
      await cmsEdit(ctx, 'vid_await_photo', awaitPhotoKb(`vid_dur_back:${model}`));
    }
  });

  bot.action(/^vid_aspect_back:(seedance1|seedance15):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cmsEdit(ctx, 'vid_aspect', await vidAspectKb(ctx.match[1], ctx.match[2]));
  });

  bot.action(/^vid_aspect:(seedance1|seedance15):(\d+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], dur = ctx.match[2], aspect = decS(ctx.match[3]);
    const uid = ctx.from.id;
    await redis.set(`vid:${uid}:aspect`, aspect, 'EX', 600);
    if (MODELS[model].hasCamera) {
      await cmsEdit(ctx, 'vid_camera', await vidCameraKb(model, dur, encS(aspect)));
    } else {
      await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
      await cmsEdit(ctx, 'vid_await_photo', awaitPhotoKb(`vid_aspect_back:${model}:${dur}`));
    }
  });

  bot.action(/^vid_cam:(seedance1):(\d+):([^:]+):(free|fixed)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], dur = ctx.match[2];
    const aspect = decS(ctx.match[3]), cam = ctx.match[4], uid = ctx.from.id;
    await redis.set(`vid:${uid}:cam`,   cam,           'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
    await cmsEdit(ctx, 'vid_await_photo', awaitPhotoKb(`vid_aspect_back:${model}:${dur}`));
  });

  bot.action(/^vid_sound:(kling):(\d+):(yes|no)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], dur = ctx.match[2], sound = ctx.match[3], uid = ctx.from.id;
    await redis.set(`vid:${uid}:sound`, sound,         'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_photo', 'EX', 600);
    await cmsEdit(ctx, 'vid_await_photo', awaitPhotoKb(`vid_dur_back:${model}`));
  });

  bot.action('vid_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cleanState(ctx.from.id);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  bot.on('photo', async (ctx, next) => {
    const uid = ctx.from.id;
    if (await redis.get(`vid:${uid}:state`) !== 'await_photo') return next();
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    await redis.set(`vid:${uid}:photo_url`, fileUrl.href, 'EX', 600);
    await redis.set(`vid:${uid}:state`, 'await_prompt', 'EX', 600);
    await cmsSend(ctx, 'vid_photo_received', { inline_keyboard: [cancelRow] });
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid = ctx.from.id;
    if (await redis.get(`vid:${uid}:state`) !== 'await_prompt') return next();
    const rawPrompt = ctx.message.text.trim();
    const prompt    = rawPrompt === '.' ? '' : rawPrompt;
    const model     = await redis.get(`vid:${uid}:model`)  || 'seedance1';
    const dur       = parseInt(await redis.get(`vid:${uid}:dur`)) || 5;
    const aspect    = await redis.get(`vid:${uid}:aspect`) || '16:9';
    const cam       = await redis.get(`vid:${uid}:cam`)    || 'free';
    const sound     = await redis.get(`vid:${uid}:sound`)  || 'no';
    const photoUrl  = await redis.get(`vid:${uid}:photo_url`);
    await cleanState(uid);
    if (!photoUrl) { await ctx.reply('❌ Фото не найдено.'); return; }
    const vidKey = `vid_${model}_${dur}`;
    const tkVid = await spendTokens(uid, vidKey);
    if (!tkVid.ok) {
      await ctx.reply(notEnoughMsg(tkVid), { parse_mode: 'HTML' });
      return;
    }
    const cfg = MODELS[model];
    const { text: wt } = await cms('vid_generating', {}, '🎬 Генерирую...');
    const waitMsg = await ctx.reply(`${wt}\n${cfg.label}\n⏳ ~1-3 мин`, { parse_mode: 'HTML' });
    try {
      let videoUrl;
      if (model === 'seedance1')       videoUrl = await seedanceI2V(photoUrl, prompt, dur, aspect, cam === 'fixed');
      else if (model === 'seedance15') videoUrl = await seedance15SpicyI2V(photoUrl, prompt, dur, aspect);
      else if (model === 'kling')      videoUrl = await klingI2V(photoUrl, prompt, dur, sound === 'yes');
      else if (model === 'hailuo')     videoUrl = await hailuoI2V(photoUrl, prompt, dur);
      const cap = `🎬 <b>${cfg.label}</b>\n⏱ ${dur} сек${aspect ? ' · ' + aspect : ''}\n<i>${prompt ? prompt.slice(0,150) : 'без промпта'}</i>`;
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await sendVideo(ctx, videoUrl, cap, await vidResultKb());
      if (tkVid.ok) {
        await ctx.reply(
          `✅ Списано ${tkVid.spent} 🪙 за ${tkVid.label}\nБаланс: ${tkVid.balance} 🪙`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (err) {
      console.error('[VideoGen]', err.message);
      await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null,
        `❌ Ошибка: ${err.message}`).catch(() => {});
    }
  });
};
