import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { cmsEdit, cmsSend, cms } from '../../services/contentHelper.js';
import {
  nanoBananaTextToImage, nanoBananaEdit,
  nanoBanana2TextToImage, nanoBanana2Edit,
  seedreamTextToImage, seedreamEdit,
  gptImage15Edit, flux2ProEdit,
} from '../../services/wavespeed.js';
import {
  nbModelKb, nbModeKb, nbResolKb, nbSizeKb,
  nbGptQualityKb, nbGptSizeKb, nbFlux2SizeKb,
  nbPhotoNextKb, nbResultKb, MODEL_LABELS,
} from '../keyboards/imageMenuKb.js';
import { getTemplateById } from '../../services/supabase.js';

const TG_MAX = 9 * 1024 * 1024;
const decSize    = (s) => s.replace('x', ':');
const decStarSize = (s) => s.replace(/S/g, '*');
const cancelRow = [{ text: '❌ Отмена', callback_data: 'nb_cancel' }];

const cleanState = async (uid) => {
  for (const k of ['state','model','mode','resol','size','photos','template_mode','template_prompt','template_name'])
    await redis.del(`nb:${uid}:${k}`);
};
const saveLastGen = async (uid, d) => redis.set(`nb:${uid}:last`, JSON.stringify(d), 'EX', 3600);
const getLastGen  = async (uid) => { const r = await redis.get(`nb:${uid}:last`); return r ? JSON.parse(r) : null; };
const getPhotoUrls = async (uid) => { const r = await redis.get(`nb:${uid}:photos`); return r ? JSON.parse(r) : []; };
const addPhotoUrl  = async (uid, url) => {
  const list = await getPhotoUrls(uid);
  list.push(url);
  await redis.set(`nb:${uid}:photos`, JSON.stringify(list), 'EX', 600);
  return list.length;
};
const downloadImage = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};
const prepareForTg = async (buf) => {
  if (buf.length <= TG_MAX) return { buffer: buf, compressed: false };
  let q = 85, result = buf;
  while (q >= 30) { result = await sharp(buf).jpeg({ quality: q }).toBuffer(); if (result.length <= TG_MAX) break; q -= 15; }
  return { buffer: result, compressed: true };
};

const generate = async (ctx, { model, mode, size, resol, photoUrls, prompt }) => {
  const ml = MODEL_LABELS[model];
  const rl = (model === 'nb2' || model === 'gpt15e') ? ` · ${resol}` : '';
  const { text: wt } = await cms('nb_generating', {}, '🎨 Генерирую...');
  const waitMsg = await ctx.reply(`${wt}\n${ml}${rl} · ${size}`, { parse_mode: 'HTML' });
  try {
    let imageUrl;
    if      (model === 'nb2')    imageUrl = mode === 'img2img' ? await nanoBanana2Edit(photoUrls, prompt, size, resol) : await nanoBanana2TextToImage(prompt, size, resol);
    else if (model === 'sd5')    imageUrl = mode === 'img2img' ? await seedreamEdit(photoUrls, prompt, size) : await seedreamTextToImage(prompt, size);
    else if (model === 'gpt15e') imageUrl = await gptImage15Edit(photoUrls, prompt, size, resol);
    else if (model === 'flux2e') imageUrl = await flux2ProEdit(photoUrls, prompt, size);
    else                         imageUrl = mode === 'img2img' ? await nanoBananaEdit(photoUrls, prompt, size) : await nanoBananaTextToImage(prompt, size);

    await saveLastGen(ctx.from.id, { model, mode, size, resol, photos: photoUrls, prompt, resultUrl: imageUrl });
    const orig = await downloadImage(imageUrl);
    const sizeMb = (orig.length / 1024 / 1024).toFixed(1);
    const { buffer: buf, compressed } = await prepareForTg(orig);
    const note = compressed ? `\n\n🔗 <a href="${imageUrl}">Оригинал (${sizeMb} MB)</a>` : '';
    await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    await ctx.replyWithPhoto(
      { source: buf, filename: `result.${compressed ? 'jpg' : 'png'}` },
      { caption: `🎨 <b>${ml}</b>${rl} · ${size}\n<i>${prompt.slice(0,180)}</i>${note}`,
        parse_mode: 'HTML', reply_markup: (await nbResultKb()).reply_markup }
    );
  } catch (err) {
    console.error('[NanoBanana]', err.message);
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ Ошибка: ${err.message}`).catch(() => {});
  }
};

export const setupNanoBanana = (bot) => {

  // ── WebApp: выбор шаблона из галереи ─────────────────────────────
  bot.on('web_app_data', async (ctx) => {
    const uid = ctx.from.id;
    let data;
    try { data = JSON.parse(ctx.message.web_app_data.data); } catch { return; }
    if (data.action !== 'template_select') return;

    try {
      const tpl = await getTemplateById(data.templateId);
      if (!tpl) { await ctx.reply('❌ Шаблон не найден.'); return; }

      await cleanState(uid);
      await redis.set(`nb:${uid}:template_prompt`, tpl.promt || '', 'EX', 3600);
      await redis.set(`nb:${uid}:template_name`,   tpl.name_batton || '', 'EX', 3600);
      await redis.set(`nb:${uid}:template_mode`,   'template', 'EX', 3600);

      const tplInfo = tpl.caption ? `\n<i>${tpl.caption}</i>` : '';
      await ctx.reply(
        `✅ Шаблон: <b>${tpl.name_batton}</b>${tplInfo}\n\nТеперь выбери модель генерации:`,
        { parse_mode: 'HTML', reply_markup: (await nbModelKb()).reply_markup }
      );
    } catch (err) {
      console.error('[web_app_data]', err.message);
      await ctx.reply('❌ Ошибка при выборе шаблона.');
    }
  });

  // ── Выбор модели ──────────────────────────────────────────────────
  bot.action(/^nb_model:(nb1|nb2|sd5|gpt15e|flux2e)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1];
    const uid   = ctx.from.id;
    const tplMode = await redis.get(`nb:${uid}:template_mode`);
    await redis.set(`nb:${uid}:model`, model, 'EX', 600);

    if (model === 'gpt15e') {
      await redis.set(`nb:${uid}:mode`, 'img2img', 'EX', 600);
      await cmsEdit(ctx, 'nb_quality', await nbGptQualityKb());
    } else if (model === 'flux2e') {
      await redis.set(`nb:${uid}:mode`, 'img2img', 'EX', 600);
      await cmsEdit(ctx, 'nb_size', await nbFlux2SizeKb());
    } else if (tplMode === 'template') {
      // Шаблонный режим: всегда img2img, без выбора режима
      await redis.set(`nb:${uid}:mode`, 'img2img', 'EX', 600);
      if (model === 'nb2') await cmsEdit(ctx, 'nb_quality', await nbResolKb(model, 'img2img'));
      else await cmsEdit(ctx, 'nb_size', await nbSizeKb(model, 'img2img', 'std'));
    } else {
      await cmsEdit(ctx, 'nb_mode', await nbModeKb(model));
    }
  });

  // ── Режим (nb1/nb2/sd5) ───────────────────────────────────────────
  bot.action(/^nb_mode:(nb1|nb2|sd5):(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], mode = ctx.match[2];
    await redis.set(`nb:${ctx.from.id}:mode`, mode, 'EX', 600);
    if (model === 'nb2') await cmsEdit(ctx, 'nb_quality', await nbResolKb(model, mode));
    else await cmsEdit(ctx, 'nb_size', await nbSizeKb(model, mode, 'std'));
  });

  bot.action(/^nb_resol_back:(nb2):(txt2img|img2img)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cmsEdit(ctx, 'nb_quality', await nbResolKb(ctx.match[1], ctx.match[2]));
  });

  bot.action(/^nb_resol:(nb2):(txt2img|img2img):(1k|2k|4k)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], mode = ctx.match[2], resol = ctx.match[3];
    await redis.set(`nb:${ctx.from.id}:resol`, resol, 'EX', 600);
    await cmsEdit(ctx, 'nb_size', await nbSizeKb(model, mode, resol));
  });

  bot.action(/^nb_size:(nb1|nb2|sd5):(txt2img|img2img):([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const model = ctx.match[1], mode = ctx.match[2], resol = ctx.match[3], size = decSize(ctx.match[4]);
    const uid = ctx.from.id;
    await redis.set(`nb:${uid}:size`, size, 'EX', 600);
    const backKb = (back) => ({ inline_keyboard: [[{ text: '◀️ Назад', callback_data: back }], cancelRow] });
    if (mode === 'img2img') {
      await redis.set(`nb:${uid}:state`, 'await_photo', 'EX', 600);
      await cmsEdit(ctx, 'nb_mode_img2img', backKb(`nb_mode:${model}:${mode}`));
    } else {
      await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
      await cmsEdit(ctx, 'nb_mode_txt2img', backKb(`nb_size_back:${model}:${mode}:${resol}`));
    }
  });

  bot.action(/^nb_size_back:(nb1|nb2|sd5):(txt2img|img2img):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await redis.del(`nb:${ctx.from.id}:state`);
    await cmsEdit(ctx, 'nb_size', await nbSizeKb(ctx.match[1], ctx.match[2], ctx.match[3]));
  });

  // ── GPT Image 1.5 Edit ────────────────────────────────────────────
  bot.action(/^nb_gpt_quality:(low|medium|high)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const quality = ctx.match[1];
    await redis.set(`nb:${ctx.from.id}:resol`, quality, 'EX', 600);
    await cmsEdit(ctx, 'nb_size', await nbGptSizeKb(quality));
  });

  bot.action('nb_gpt_quality_back', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cmsEdit(ctx, 'nb_quality', await nbGptQualityKb());
  });

  bot.action(/^nb_gpt_size:(low|medium|high):(\d+S\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const quality = ctx.match[1], size = decStarSize(ctx.match[2]);
    const uid = ctx.from.id;
    await redis.set(`nb:${uid}:size`, size, 'EX', 600);
    await redis.set(`nb:${uid}:state`, 'await_photo', 'EX', 600);
    await cmsEdit(ctx, 'nb_mode_img2img', { inline_keyboard: [[{ text: '◀️ Назад', callback_data: `nb_gpt_size_back:${quality}` }], cancelRow] });
  });

  bot.action(/^nb_gpt_size_back:(low|medium|high)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await redis.del(`nb:${ctx.from.id}:state`);
    await cmsEdit(ctx, 'nb_size', await nbGptSizeKb(ctx.match[1]));
  });

  // ── FLUX.2 Pro Edit ───────────────────────────────────────────────
  bot.action(/^nb_flux2_size:(\d+S\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const size = decStarSize(ctx.match[1]);
    const uid  = ctx.from.id;
    await redis.set(`nb:${uid}:size`, size, 'EX', 600);
    await redis.set(`nb:${uid}:state`, 'await_photo', 'EX', 600);
    await cmsEdit(ctx, 'nb_mode_img2img', { inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'nb_flux2_size_back' }], cancelRow] });
  });

  bot.action('nb_flux2_size_back', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await redis.del(`nb:${ctx.from.id}:state`);
    await cmsEdit(ctx, 'nb_size', await nbFlux2SizeKb());
  });

  // ── Фото загружено ────────────────────────────────────────────────
  bot.action('nb_photos_done', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid   = ctx.from.id;
    const urls  = await getPhotoUrls(uid);
    const model = await redis.get(`nb:${uid}:model`) || 'nb1';
    const mode  = await redis.get(`nb:${uid}:mode`)  || 'img2img';
    const resol = await redis.get(`nb:${uid}:resol`) || 'std';
    await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
    const backCb = model === 'gpt15e' ? `nb_gpt_size_back:${resol}`
      : model === 'flux2e'  ? 'nb_flux2_size_back'
      : `nb_size_back:${model}:${mode}:${resol}`;
    await cmsEdit(ctx, 'nb_photos_done',
      { inline_keyboard: [[{ text: '◀️ Назад', callback_data: backCb }], cancelRow] },
      { '{n}': String(urls.length) });
  });

  bot.action('nb_repeat', async (ctx) => {
    await ctx.answerCbQuery('🔄 Повторяю...').catch(() => {});
    const last = await getLastGen(ctx.from.id);
    if (!last) { await ctx.reply('❌ Нет сохранённой генерации.'); return; }
    await generate(ctx, { model: last.model, mode: last.mode, size: last.size, resol: last.resol, photoUrls: last.photos || [], prompt: last.prompt });
  });

  bot.action('nb_edit_result', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const uid  = ctx.from.id;
    const last = await getLastGen(uid);
    if (!last?.resultUrl) { await ctx.reply('❌ Нет результата.'); return; }
    await redis.set(`nb:${uid}:model`,  last.model,        'EX', 600);
    await redis.set(`nb:${uid}:mode`,   'img2img',          'EX', 600);
    await redis.set(`nb:${uid}:size`,   last.size,          'EX', 600);
    await redis.set(`nb:${uid}:resol`,  last.resol || '1k', 'EX', 600);
    await redis.set(`nb:${uid}:photos`, JSON.stringify([last.resultUrl]), 'EX', 600);
    await redis.set(`nb:${uid}:state`,  'await_prompt',     'EX', 600);
    await cmsSend(ctx, 'nb_edit_prompt', { inline_keyboard: [cancelRow] });
  });

  bot.action('nb_cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await cleanState(ctx.from.id);
    await ctx.editMessageText('❌ Отменено.').catch(() => {});
  });

  // ── Фото (img2img / шаблон) ───────────────────────────────────────
  bot.on('photo', async (ctx, next) => {
    const uid = ctx.from.id;
    if (await redis.get(`nb:${uid}:state`) !== 'await_photo') return next();

    const photo   = ctx.message.photo[ctx.message.photo.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(photo.file_id);
    const tplMode = await redis.get(`nb:${uid}:template_mode`);

    // Шаблонный режим: одно фото → сразу генерация
    if (tplMode === 'template') {
      const prompt  = await redis.get(`nb:${uid}:template_prompt`) || '';
      const tplName = await redis.get(`nb:${uid}:template_name`)   || 'Шаблон';
      const model   = await redis.get(`nb:${uid}:model`) || 'nb1';
      const size    = await redis.get(`nb:${uid}:size`)  || '1:1';
      const resol   = await redis.get(`nb:${uid}:resol`) || '1k';
      await cleanState(uid);
      await ctx.reply(`🎨 Генерирую по шаблону <b>${tplName}</b>...`, { parse_mode: 'HTML' }).catch(() => {});
      await generate(ctx, { model, mode: 'img2img', size, resol, photoUrls: [fileUrl.href], prompt });
      return;
    }

    // Обычный режим
    const model = await redis.get(`nb:${uid}:model`) || 'nb1';
    const count = await addPhotoUrl(uid, fileUrl.href);
    const maxPhotos = model === 'flux2e' ? 3 : 10;
    const { text } = await cms('nb_photo_received', { '{n}': String(count) }, `📸 Фото ${count} получено`);
    if (count >= maxPhotos) {
      const resol  = await redis.get(`nb:${uid}:resol`) || 'std';
      const mode   = await redis.get(`nb:${uid}:mode`)  || 'img2img';
      const backCb = model === 'gpt15e' ? `nb_gpt_size_back:${resol}`
        : model === 'flux2e' ? 'nb_flux2_size_back'
        : `nb_size_back:${model}:${mode}:${resol}`;
      await redis.set(`nb:${uid}:state`, 'await_prompt', 'EX', 600);
      await ctx.reply(`${text}\n\n⚠️ Лимит ${maxPhotos} фото. Напишите промт.`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '◀️ Назад', callback_data: backCb }], cancelRow] } });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: (await nbPhotoNextKb(count)).reply_markup });
    }
  });

  // ── Промт (текст) ─────────────────────────────────────────────────
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    const uid = ctx.from.id;
    if (await redis.get(`nb:${uid}:state`) !== 'await_prompt') return next();
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
