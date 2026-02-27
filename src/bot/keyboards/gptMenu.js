import { Markup } from 'telegraf';
import { getThinkingLevel, getUserModel } from '../../services/redis.js';
import { supportsReasoning } from './models.js';

export const gptMenu = async (userId) => {
  const rows = [
    [Markup.button.callback('📋 Мои диалоги', 'dialogs:0')],
    [Markup.button.callback('➕ Новый диалог', 'new_dialog')],
    [Markup.button.callback('🧠 Модель GPT', 'model_menu')],
    [Markup.button.callback('📚 Промты', 'prompts')],
    [Markup.button.callback('◀️ Главное меню', 'main_menu')],
  ];

  const model = await getUserModel(userId);
  if (supportsReasoning(model)) {
    const thinkLevel = await getThinkingLevel(userId);
    rows.splice(4, 0, [Markup.button.callback(`💭 Мышление: ${thinkLevel}`, 'toggle_thinking')]);
  }

  return Markup.inlineKeyboard(rows);
};
