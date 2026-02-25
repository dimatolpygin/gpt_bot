import { Markup } from 'telegraf';
import { getThinkingLevel, getUserModel, getCodeInterp } from '../../services/redis.js';
import { supportsReasoning } from './models.js';
import { THINKING_EMOJI } from '../../services/openai.js';

export const mainMenu = async (userId) => {
  const rows = [
    [Markup.button.callback('📋 Мои диалоги', 'dialogs:0')],
    [Markup.button.callback('➕ Новый диалог', 'new_dialog')],
    [Markup.button.callback('🧠 Модель GPT', 'model_menu')],
  ];

  const model = await getUserModel(userId);
  if (supportsReasoning(model)) {
    const thinkLevel = await getThinkingLevel(userId);
    rows.push([
      Markup.button.callback(
        `${THINKING_EMOJI[thinkLevel] || THINKING_EMOJI.none} Мышление: ${thinkLevel}`,
        'toggle_thinking'
      ),
    ]);
  }

  const codeInterp = await getCodeInterp(userId);
  rows.push([
    Markup.button.callback(
      `🐍 Code Interpreter: ${codeInterp ? 'вкл' : 'выкл'}`,
      'toggle_codeinterp'
    ),
  ]);

  return Markup.inlineKeyboard(rows);
};
