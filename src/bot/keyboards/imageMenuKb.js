import { Markup } from 'telegraf';

const encSize = (s) => s.replace(':', 'x');

export const SIZES  = ['1:1', '16:9', '9:16', '4:3', '3:4'];
export const RESOLS = ['1k', '2k', '4k'];
export const PRICE  = { '1k': '$0.08', '2k': '$0.08', '4k': '$0.16' };
export const MODEL_LABELS = {
  nb1: '🍌 Nano Banana',
  nb2: '🍌🍌 Nano Banana 2',
  sd5: '🌱 Seedream V5 Lite',
};

export const nbModelKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🍌 Nano Banana',       'nb_model:nb1')],
  [Markup.button.callback('🍌🍌 Nano Banana 2',    'nb_model:nb2')],
  [Markup.button.callback('🌱 Seedream V5 Lite',  'nb_model:sd5')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

export const nbModeKb = (model) => Markup.inlineKeyboard([
  [Markup.button.callback('✏️ Текст → Фото',      `nb_mode:${model}:txt2img`)],
  [Markup.button.callback('🖼 Редактировать фото', `nb_mode:${model}:img2img`)],
  [Markup.button.callback('◀️ Назад', 'nb_menu'), Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

export const nbResolKb = (model, mode) => Markup.inlineKeyboard([
  RESOLS.map(r => Markup.button.callback(`${r} (${PRICE[r]})`, `nb_resol:${model}:${mode}:${r}`)),
  [Markup.button.callback('◀️ Назад', `nb_model:${model}`), Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

export const nbSizeKb = (model, mode, resol) => {
  const backAction = model === 'nb2'
    ? `nb_resol_back:${model}:${mode}`
    : `nb_mode:${model}:${mode}`;
  return Markup.inlineKeyboard([
    SIZES.map(s => Markup.button.callback(s, `nb_size:${model}:${mode}:${resol}:${encSize(s)}`)),
    [Markup.button.callback('◀️ Назад', backAction), Markup.button.callback('❌ Отмена', 'nb_cancel')],
  ]);
};

export const nbPhotoNextKb = (count) => Markup.inlineKeyboard([
  [Markup.button.callback(`✅ Хватит (${count} фото)`, 'nb_photos_done')],
  [Markup.button.callback('❌ Отмена', 'nb_cancel')],
]);

export const nbResultKb = () => Markup.inlineKeyboard([
  [Markup.button.callback('🔁 Повторить генерацию',     'nb_repeat')],
  [Markup.button.callback('✏️ Редактировать результат', 'nb_edit_result')],
  [Markup.button.callback('🎨 Новая генерация',          'nb_menu')],
  [Markup.button.callback('🏠 Главное меню',             'main_menu')],
]);
