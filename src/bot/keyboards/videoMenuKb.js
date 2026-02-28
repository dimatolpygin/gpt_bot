import { Markup } from 'telegraf';

const encS = (s) => s.replace(':', 'x');
const decS = (s) => s.replace('x', ':');
export { decS };

export const MODELS = {
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
    aspects:   null,
    hasCamera: false,
    hasSound:  true,
  },
  hailuo: {
    label:     '🌊 Hailuo 2.3 Pro 1080p',
    durations: [6, 10],
    aspects:   null,
    hasCamera: false,
    hasSound:  false,
  },
};

export const vidModelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback(MODELS.seedance1.label,  'vid_model:seedance1')],
  [Markup.button.callback(MODELS.seedance15.label, 'vid_model:seedance15')],
  [Markup.button.callback(MODELS.kling.label,      'vid_model:kling')],
  [Markup.button.callback(MODELS.hailuo.label,     'vid_model:hailuo')],
  [Markup.button.callback('❌ Отмена', 'vid_cancel')],
]);

export const vidDurationKb = (model) => Markup.inlineKeyboard([
  MODELS[model].durations.map(d => Markup.button.callback(`${d} сек`, `vid_dur:${model}:${d}`)),
  [{ text: '◀️ Назад', callback_data: 'vid_menu' }, { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

export const vidAspectKb = (model, dur) => Markup.inlineKeyboard([
  MODELS[model].aspects.map(a => Markup.button.callback(a, `vid_aspect:${model}:${dur}:${encS(a)}`)),
  [{ text: '◀️ Назад', callback_data: `vid_dur_back:${model}` }, { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

export const vidCameraKb = (model, dur, aspect) => Markup.inlineKeyboard([
  [
    Markup.button.callback('🎥 Свободная',     `vid_cam:${model}:${dur}:${aspect}:free`),
    Markup.button.callback('📷 Фиксированная', `vid_cam:${model}:${dur}:${aspect}:fixed`),
  ],
  [{ text: '◀️ Назад', callback_data: `vid_aspect_back:${model}:${dur}` }, { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

export const vidSoundKb = (model, dur) => Markup.inlineKeyboard([
  [
    Markup.button.callback('🔊 Со звуком', `vid_sound:${model}:${dur}:yes`),
    Markup.button.callback('🔇 Без звука', `vid_sound:${model}:${dur}:no`),
  ],
  [{ text: '◀️ Назад', callback_data: `vid_dur_back:${model}` }, { text: '❌ Отмена', callback_data: 'vid_cancel' }],
]);

export const vidResultKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🏠 Главное меню', 'main_menu')],
  [Markup.button.callback('🎬 Ещё видео',    'vid_menu')],
]);
