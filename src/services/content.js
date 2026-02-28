import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

// Кэш в памяти (TTL 5 мин) — чтобы не долбить Supabase на каждое сообщение
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Получить контент по ключу.
 * Возвращает { text, image_url }
 */
export const getContent = async (key, fallback = '') => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const { data, error } = await supabase
    .from('bot_content')
    .select('text, image_url')
    .eq('key', key)
    .single();

  if (error || !data) {
    console.warn(`[content] key "${key}" not found:`, error?.message);
    return { text: fallback, image_url: null };
  }

  const result = { text: data.text, image_url: data.image_url };
  cache.set(key, { data: result, ts: Date.now() });
  return result;
};

/** Принудительно сбросить кэш (например после обновления через админку) */
export const clearContentCache = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};

/**
 * Отправить сообщение с контентом из БД.
 * Если есть image_url — отправляет фото с подписью,
 * иначе — текстовое сообщение.
 */
export const sendContent = async (ctx, key, extra = {}, fallback = '') => {
  const { text, image_url } = await getContent(key, fallback);

  if (image_url) {
    return ctx.replyWithPhoto(image_url, {
      caption: text,
      parse_mode: 'HTML',
      ...extra,
    });
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...extra });
};

/**
 * Редактировать существующее сообщение контентом из БД.
 */
export const editContent = async (ctx, key, extra = {}, fallback = '') => {
  const { text, image_url } = await getContent(key, fallback);

  if (image_url) {
    return ctx.editMessageMedia(
      { type: 'photo', media: image_url, caption: text, parse_mode: 'HTML' },
      extra
    ).catch(() => sendContent(ctx, key, extra, fallback));
  }
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...extra })
    .catch(() => sendContent(ctx, key, extra, fallback));
};
