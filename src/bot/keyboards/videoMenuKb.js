import { Markup } from 'telegraf';
import { getBtn } from '../../services/contentHelper.js';

const encS = (s) => s.replace(':', 'x');
export const decS = (s) => s.replace('x', ':');
export const MODELS = {
  seedance1:  { durations:[3,5,7,10],    aspects:['16:9','9:16','1:1','4:3','21:9'], hasCamera:true,  hasSound:false },
  seedance15: { durations:[3,5,7,10],    aspects:['16:9','9:16','1:1','4:3'],        hasCamera:false, hasSound:false },
  kling:      { durations:[3,5,7,10,15], aspects:null,                               hasCamera:false, hasSound:true  },
  hailuo:     { durations:[6,10],        aspects:null,                               hasCamera:false, hasSound:false },
};

const b = (keys) => Promise.all(keys.map(([k, f]) => getBtn(k, f)));

export const vidModelKb = async () => {
  const [m1,m2,m3,m4,cancel] = await b([
    ['btn_vid_model_seedance1',  '������ Seedance V1 Pro 720p'],
    ['btn_vid_model_seedance15', '������������ Seedance V1.5 Pro Spicy'],
    ['btn_vid_model_kling',      '⚡ Kling Video O3 Pro'],
    ['btn_vid_model_hailuo',     '������ Hailuo 2.3 Pro 1080p'],
    ['btn_cancel',               '❌ Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(m1, 'vid_model:seedance1')],
    [Markup.button.callback(m2, 'vid_model:seedance15')],
    [Markup.button.callback(m3, 'vid_model:kling')],
    [Markup.button.callback(m4, 'vid_model:hailuo')],
    [Markup.button.callback(cancel, 'vid_cancel')],
  ]);
};

export const vidDurationKb = async (model) => {
  const [back, cancel] = await b([['btn_back','◀️ Назад'],['btn_cancel','❌ Отмена']]);
  return Markup.inlineKeyboard([
    MODELS[model].durations.map(d => Markup.button.callback(`${d} сек`, `vid_dur:${model}:${d}`)),
    [Markup.button.callback(back, 'vid_menu'), Markup.button.callback(cancel, 'vid_cancel')],
  ]);
};

export const vidAspectKb = async (model, dur) => {
  const [back, cancel] = await b([['btn_back','◀️ Назад'],['btn_cancel','❌ Отмена']]);
  return Markup.inlineKeyboard([
    MODELS[model].aspects.map(a => Markup.button.callback(a, `vid_aspect:${model}:${dur}:${encS(a)}`)),
    [Markup.button.callback(back, `vid_dur_back:${model}`), Markup.button.callback(cancel, 'vid_cancel')],
  ]);
};

export const vidCameraKb = async (model, dur, aspect) => {
  const [free, fixed, back, cancel] = await b([
    ['btn_vid_cam_free',  '������ Свободная'],
    ['btn_vid_cam_fixed', '������ Фиксированная'],
    ['btn_back',          '◀️ Назад'],
    ['btn_cancel',        '❌ Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(free, `vid_cam:${model}:${dur}:${aspect}:free`),
     Markup.button.callback(fixed, `vid_cam:${model}:${dur}:${aspect}:fixed`)],
    [Markup.button.callback(back, `vid_aspect_back:${model}:${dur}`), Markup.button.callback(cancel, 'vid_cancel')],
  ]);
};

export const vidSoundKb = async (model, dur) => {
  const [yes, no, back, cancel] = await b([
    ['btn_vid_sound_yes', '������ Со звуком'],
    ['btn_vid_sound_no',  '������ Без звука'],
    ['btn_back',          '◀️ Назад'],
    ['btn_cancel',        '❌ Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(yes, `vid_sound:${model}:${dur}:yes`),
     Markup.button.callback(no,  `vid_sound:${model}:${dur}:no`)],
    [Markup.button.callback(back, `vid_dur_back:${model}`), Markup.button.callback(cancel, 'vid_cancel')],
  ]);
};

export const vidResultKb = async () => {
  const [more, main] = await b([
    ['btn_vid_more',  '������ Ещё видео'],
    ['btn_main_menu', '������ Главное меню'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(main, 'main_menu')],
    [Markup.button.callback(more, 'vid_menu')],
  ]);
};
