import { Markup } from 'telegraf';
import { redis } from '../../services/redis.js';
import {
  getUserPrompts, addUserPrompt, setActivePrompt, deleteUserPrompt,
} from '../../services/supabase.js';

const buildNoPromptsButtons = () => Markup.inlineKeyboard([
  [{ text: '➕ Добавить промт', callback_data: 'prompt_add' }],
  [{ text: '◀️ Назад', callback_data: 'main_menu' }],
]);

export const showPromptsList = async (ctx) => {
  const userId = ctx.from.id;
  const prompts = await getUserPrompts(userId);

  if (prompts.length === 0) {
    const text = '📝 <b>Системные промты</b>\n\nНет сохранённых промтов.\nНажмите кнопку ниже чтобы добавить:';
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: buildNoPromptsButtons().reply_markup,
      }).catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: buildNoPromptsButtons().reply_markup }));
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: buildNoPromptsButtons().reply_markup });
    }
    return;
  }

  const buttons = prompts.map((p) => ([{
    text: `${p.is_active ? '✅ ' : ''}${p.name}`,
    callback_data: `prompt_select:${p.id}`,
  }]));

  buttons.push([
    { text: '➕ Добавить', callback_data: 'prompt_add' },
    { text: '🗑 Удалить', callback_data: 'prompt_delete_mode' },
  ]);
  buttons.push([
    { text: '❌ Сбросить промт', callback_data: 'prompt_reset' },
    { text: '◀️ Назад', callback_data: 'main_menu' },
  ]);

  const text = '📝 <b>Системные промты</b>\n\nВыберите активный промт (✅ — текущий):';
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (err) {
    if (!err?.description?.includes('message to edit not found')) {
      throw err;
    }
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
  }
};

export const showDeleteMode = async (ctx) => {
  const userId = ctx.from.id;
  const prompts = await getUserPrompts(userId);
  const buttons = prompts.map((p) => ([{
    text: `🗑 ${p.name}`,
    callback_data: `prompt_del:${p.id}`,
  }]));
  buttons.push([{ text: '◀️ Назад', callback_data: 'prompts' }]);

  await ctx.editMessageText('🗑 <b>Выберите промт для удаления:</b>', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
};

export const beginPromptCreation = async (ctx) => {
  const userId = ctx.from.id;
  await redis.set(`prompt_add_state:${userId}`, '1', 'EX', 300);
  await ctx.editMessageText(
    '📝 Отправьте промт в формате:\n\n<code>Название | Текст системного промта</code>\n\n' +
    'Пример:\n<code>Помощник программиста | Ты опытный разработчик Node.js. Отвечай кратко и с примерами кода.</code>',
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'prompts' }]],
      },
    }
  );
};

export const finishPromptCreation = async (ctx) => {
  const userId = ctx.from.id;
  const value = ctx.message?.text || '';
  const parts = value.split('|');
  if (parts.length < 2) {
    return ctx.reply('❌ Формат: Название | Текст промта');
  }
  const name = parts[0].trim();
  const content = parts.slice(1).join('|').trim();
  if (!name || !content) {
    return ctx.reply('❌ Требуются оба поля: название и текст промта.');
  }
  await addUserPrompt(userId, name, content);
  await ctx.reply(`✅ Промт "<b>${name}</b>" сохранён!`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: '📝 К промтам', callback_data: 'prompts' }]],
    },
  });
};
