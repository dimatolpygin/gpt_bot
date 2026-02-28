import { Markup } from 'telegraf';
import { getThinkingLevel, getUserModel } from '../../services/redis.js';
import { supportsReasoning } from './models.js';
import { getBtn } from '../../services/contentHelper.js';

const b = (keys) => Promise.all(keys.map(([k, f]) => getBtn(k, f)));

export const gptMenu = async (userId) => {
  const [dialogs, newD, model, prompts, back, thinking] = await b([
    ['btn_gpt_dialogs',  '������ Мои диалоги'],
    ['btn_gpt_new',      '➕ Новый диалог'],
    ['btn_gpt_model',    '������ Модель GPT'],
    ['btn_gpt_prompts',  '������ Промты'],
    ['btn_back',         '◀️ Главное меню'],
    ['btn_gpt_thinking', '������ Мышление: {level}'],
  ]);
  const rows = [
    [Markup.button.callback(dialogs, 'dialogs:0')],
    [Markup.button.callback(newD,    'new_dialog')],
    [Markup.button.callback(model,   'model_menu')],
    [Markup.button.callback(prompts, 'prompts')],
    [Markup.button.callback(back,    'main_menu')],
  ];
  const userModel = await getUserModel(userId);
  if (supportsReasoning(userModel)) {
    const lvl = await getThinkingLevel(userId);
    rows.splice(4, 0, [Markup.button.callback(thinking.replace('{level}', lvl), 'toggle_thinking')]);
  }
  return Markup.inlineKeyboard(rows);
};
