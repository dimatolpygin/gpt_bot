import { Markup } from 'telegraf';
import { getBtn } from '../../services/contentHelper.js';
import { config } from '../../config/index.js';

const encSize = (s) => s.replace(':', 'x');
export const SIZES = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export const MODEL_LABELS = {
  nb1:    'Nano Banana',
  nb2:    'Nano Banana 2',
  sd5:    'Seedream V5 Lite',
  gpt15e: 'GPT Image 1.5 Edit',
  flux2e: 'FLUX.2 Pro Edit',
};

export const GPT15E_SIZES = [
  { label: '1:1  (1024x1024)', value: '1024*1024' },
  { label: '16:9 (1536x1024)', value: '1536*1024' },
  { label: '9:16 (1024x1536)', value: '1024*1536' },
];

export const FLUX2E_SIZES = [
  { label: '1:1  (1024x1024)', value: '1024*1024' },
  { label: '16:9 (1344x768)',  value: '1344*768'  },
  { label: '9:16 (768x1344)',  value: '768*1344'  },
  { label: '4:3  (1152x896)',  value: '1152*896'  },
  { label: '3:4  (896x1152)',  value: '896*1152'  },
];

const b = (keys) => Promise.all(keys.map(([k, f]) => getBtn(k, f)));

export const nbModelKb = async () => {
  const [nb1, nb2, sd5, gpt15e, flux2e, cancel] = await b([
    ['btn_nb_model_nb1',    'Nano Banana'],
    ['btn_nb_model_nb2',    'Nano Banana 2'],
    ['btn_nb_model_sd5',    'Seedream V5 Lite'],
    ['btn_nb_model_gpt15e', 'GPT Image 1.5 Edit'],
    ['btn_nb_model_flux2e', 'FLUX.2 Pro Edit'],
    ['btn_cancel',          'Отмена'],
  ]);
  const galleryUrl = `${config.APP_URL}/gallery`;
  return Markup.inlineKeyboard([
    // Кнопка галереи шаблонов (WebApp)
    [Markup.button.webApp('📚 Посмотреть шаблоны', galleryUrl)],
    [Markup.button.callback(nb1,    'nb_model:nb1')],
    [Markup.button.callback(nb2,    'nb_model:nb2')],
    [Markup.button.callback(sd5,    'nb_model:sd5')],
    [Markup.button.callback(gpt15e, 'nb_model:gpt15e')],
    [Markup.button.callback(flux2e, 'nb_model:flux2e')],
    [Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbModeKb = async (model) => {
  const [txt, img, back, cancel] = await b([
    ['btn_nb_txt2img', 'Текст в фото'],
    ['btn_nb_img2img', 'Редактировать фото'],
    ['btn_back',       'Назад'],
    ['btn_cancel',     'Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(txt, `nb_mode:${model}:txt2img`)],
    [Markup.button.callback(img, `nb_mode:${model}:img2img`)],
    [Markup.button.callback(back, 'nb_menu'), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbResolKb = async (model, mode) => {
  const [r1k, r2k, r4k, back, cancel] = await b([
    ['btn_nb_resol_1k', '1k'],
    ['btn_nb_resol_2k', '2k'],
    ['btn_nb_resol_4k', '4k'],
    ['btn_back',        'Назад'],
    ['btn_cancel',      'Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(r1k, `nb_resol:${model}:${mode}:1k`),
     Markup.button.callback(r2k, `nb_resol:${model}:${mode}:2k`),
     Markup.button.callback(r4k, `nb_resol:${model}:${mode}:4k`)],
    [Markup.button.callback(back, `nb_model:${model}`), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbSizeKb = async (model, mode, resol) => {
  const backAction = model === 'nb2' ? `nb_resol_back:${model}:${mode}` : `nb_mode:${model}:${mode}`;
  const [back, cancel] = await b([['btn_back','Назад'],['btn_cancel','Отмена']]);
  return Markup.inlineKeyboard([
    SIZES.map(s => Markup.button.callback(s, `nb_size:${model}:${mode}:${resol}:${encSize(s)}`)),
    [Markup.button.callback(back, backAction), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbGptQualityKb = async () => {
  const [low, med, high, back, cancel] = await b([
    ['btn_nb_gpt_quality_low',    'Low'],
    ['btn_nb_gpt_quality_medium', 'Medium'],
    ['btn_nb_gpt_quality_high',   'High'],
    ['btn_back',   'Назад'],
    ['btn_cancel', 'Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(low,  'nb_gpt_quality:low')],
    [Markup.button.callback(med,  'nb_gpt_quality:medium')],
    [Markup.button.callback(high, 'nb_gpt_quality:high')],
    [Markup.button.callback(back, 'nb_model:gpt15e'), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbGptSizeKb = async (quality) => {
  const [back, cancel] = await b([['btn_back', 'Назад'], ['btn_cancel', 'Отмена']]);
  return Markup.inlineKeyboard([
    GPT15E_SIZES.map(s => Markup.button.callback(s.label, `nb_gpt_size:${quality}:${s.value.replace(/\*/g, 'S')}`)),
    [Markup.button.callback(back, 'nb_gpt_quality_back'), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbFlux2SizeKb = async () => {
  const [back, cancel] = await b([['btn_back', 'Назад'], ['btn_cancel', 'Отмена']]);
  return Markup.inlineKeyboard([
    FLUX2E_SIZES.slice(0, 3).map(s => Markup.button.callback(s.label, `nb_flux2_size:${s.value.replace(/\*/g, 'S')}`)),
    FLUX2E_SIZES.slice(3).map(s => Markup.button.callback(s.label, `nb_flux2_size:${s.value.replace(/\*/g, 'S')}`)),
    [Markup.button.callback(back, 'nb_model:flux2e'), Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbPhotoNextKb = async (count) => {
  const [done, cancel] = await b([
    ['btn_nb_photos_done', 'Готово ({n} фото)'],
    ['btn_cancel',         'Отмена'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(done.replace('{n}', String(count)), 'nb_photos_done')],
    [Markup.button.callback(cancel, 'nb_cancel')],
  ]);
};

export const nbResultKb = async () => {
  const [repeat, edit, newGen, main] = await b([
    ['btn_nb_repeat',      'Повторить'],
    ['btn_nb_edit_result', 'Редактировать результат'],
    ['btn_nb_new_gen',     'Новая генерация'],
    ['btn_main_menu',      'Главное меню'],
  ]);
  return Markup.inlineKeyboard([
    [Markup.button.callback(repeat, 'nb_repeat')],
    [Markup.button.callback(edit,   'nb_edit_result')],
    [Markup.button.callback(newGen, 'nb_menu')],
    [Markup.button.callback(main,   'main_menu')],
  ]);
};
