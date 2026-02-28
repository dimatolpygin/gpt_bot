import { getContent } from './content.js';

export const cms = async (key, tpl = {}, fallback = '') => {
  const { text, image_url } = await getContent(key, fallback);
  let t = text;
  for (const [k, v] of Object.entries(tpl)) t = t.replaceAll(k, v);
  return { text: t, image_url };
};

/** Получить label кнопки */
export const getBtn = async (key, fallback = '', tpl = {}) => {
  const { text } = await getContent(key, fallback);
  let t = text || fallback;
  for (const [k, v] of Object.entries(tpl)) t = t.replaceAll(k, v);
  return t;
};

export const cmsEdit = async (ctx, key, kb, tpl = {}, fallback = '') => {
  const { text, image_url } = await cms(key, tpl, fallback);
  const extra = { parse_mode: 'HTML', reply_markup: kb?.reply_markup ?? kb };
  if (image_url) {
    await ctx.editMessageMedia(
      { type: 'photo', media: image_url, caption: text, parse_mode: 'HTML' }, extra
    ).catch(() => ctx.replyWithPhoto(image_url, { ...extra, caption: text }));
  } else {
    await ctx.editMessageText(text, extra).catch(() => ctx.reply(text, extra));
  }
};

export const cmsSend = async (ctx, key, kb, tpl = {}, fallback = '') => {
  const { text, image_url } = await cms(key, tpl, fallback);
  const extra = { parse_mode: 'HTML', reply_markup: kb?.reply_markup ?? kb };
  if (image_url) {
    await ctx.replyWithPhoto(image_url, { ...extra, caption: text });
  } else {
    await ctx.reply(text, extra);
  }
};
